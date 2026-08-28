'use strict';
// Zia Object Recognition over synthetic evidence scenes, feeding the MO
// vocabulary with object:<class> tokens.
//
// Real path : ctx.services.ziaClient.detectObject(readStream)
//             -> { objects: [{ co_ordinates:[x1,y1,x2,y2], object_type:'knife', confidence:'99.82' }] }
//             (zcatalyst-sdk-node 3.4.0 utils/pojo/zia.d.ts ICatalystZiaObject;
//             80 common classes, confidence is a 0-100 string).
// Flag      : FEATURE_ZIA_OBJECTS (inherits FEATURE_ZIA).
// Fallback  : the sidecar manifest written by pipeline/scenes_generate.py —
//             the shapes the generator DREW, labelled source:'fixture'. A demo
//             scene therefore always carries tags, and the About/case panels say
//             whether Zia or the drawing manifest produced them.
//
// Scene images live in client/public/samples/scenes/ (the pipeline writes the
// manifest twice: next to the PNGs for the client, and into assets/ for this
// function, which is deployed without the client tree).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { withTimeout, AI_TIMEOUT_MS } = require('./util');

const MANIFEST_PATH = path.join(__dirname, '..', 'assets', 'scenes_manifest.json');

// Object class -> MO category, mirroring lib/zia.js MO_VOCAB families.
const CLASS_FAMILY = {
  knife: 'weapon', scissors: 'weapon', 'baseball bat': 'weapon', bat: 'weapon',
  motorcycle: 'vehicle', motorbike: 'vehicle', bicycle: 'vehicle', car: 'vehicle', truck: 'vehicle', bus: 'vehicle', 'two-wheeler': 'vehicle',
  handbag: 'item', backpack: 'item', suitcase: 'item', bag: 'item', 'cell phone': 'item', cellphone: 'item', laptop: 'item', bottle: 'item'
};

function slug(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** object class -> ['object:<class>', '<family>:<class>'?]. Pure. */
function moTokensFor(objectType) {
  const key = String(objectType || '').trim().toLowerCase();
  if (!key) return [];
  const out = [`object:${slug(key)}`];
  const fam = CLASS_FAMILY[key];
  if (fam) out.push(`${fam}:${slug(key)}`);
  return out;
}

let manifestMemo = null;

function loadManifest() {
  if (manifestMemo) return manifestMemo;
  try {
    manifestMemo = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    manifestMemo = { scenes: [] };
  }
  return manifestMemo;
}

/** Demo scenes with their drawn objects (what the fixture path returns). */
function listScenes() {
  return (loadManifest().scenes || []).map((s) => ({
    sceneId: s.sceneId,
    file: s.file,
    title: s.title,
    width: s.width,
    height: s.height,
    drawn: (s.objects || []).map((o) => ({ label: o.label, box: o.box }))
  }));
}

function sceneById(id) {
  return (loadManifest().scenes || []).find((s) => s.sceneId === String(id)) || null;
}

function normaliseObjects(list) {
  return (list || []).map((o) => {
    const label = String(o.object_type || o.label || '').trim();
    const conf = Number(o.confidence);
    const box = Array.isArray(o.co_ordinates) ? o.co_ordinates.map(Number) : (Array.isArray(o.box) ? o.box.map(Number) : null);
    return { label, confidence: Number.isFinite(conf) ? (conf > 1 ? Math.round(conf * 100) / 10000 : conf) : null, box, moTokens: moTokensFor(label) };
  }).filter((o) => o.label);
}

/**
 * Detect objects in an image buffer (or a demo scene by id when no buffer is
 * supplied). deps = { flags, ziaClient? }. Returns
 * { objects:[{label, confidence, box, moTokens}], moTags:[...], counts:{},
 *   source:'zia-objects'|'fixture'|'fallback-local', note? }.
 */
async function detectObjects(input, deps) {
  const d = deps || {};
  const buf = input && input.buffer;
  const sceneId = input && input.sceneId ? String(input.sceneId) : null;

  if (buf && d.flags && d.flags.ziaObjects && d.ziaClient && d.ziaClient.detectObject) {
    const tmp = path.join(os.tmpdir(), `dappa-obj-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`);
    let stream = null;
    try {
      fs.writeFileSync(tmp, buf);
      stream = fs.createReadStream(tmp);
      // A stub (or a timed-out call) may never consume the stream; without a
      // listener its lazy open would raise an unhandled 'error' after unlink.
      stream.on('error', () => {});
      const resp = await withTimeout(d.ziaClient.detectObject(stream), AI_TIMEOUT_MS, 'zia objects');
      const objects = normaliseObjects(resp && resp.objects);
      const moTags = [...new Set(objects.flatMap((o) => o.moTokens))];
      const counts = {};
      for (const o of objects) counts[o.label] = (counts[o.label] || 0) + 1;
      const out = { objects, moTags, counts, bytes: buf.length, source: 'zia-objects' };
      if (!objects.length) out.note = 'Zia returned no objects for this image';
      return out;
    } catch (e) {
      const scene = sceneId ? sceneById(sceneId) : null;
      if (scene) return fixtureResult(scene, `Zia object recognition failed (${String((e && e.message) || e).slice(0, 120)}); manifest tags shown`);
      return { objects: [], moTags: [], counts: {}, bytes: buf.length, source: 'fallback-local', note: `Zia object recognition failed (${String((e && e.message) || e).slice(0, 120)})` };
    } finally {
      if (stream) stream.destroy();
      try { fs.unlinkSync(tmp); } catch (e) { /* best effort */ }
    }
  }

  const scene = sceneId ? sceneById(sceneId) : null;
  if (scene) return fixtureResult(scene, d.flags && d.flags.ziaObjects ? 'Zia handle unavailable in this runtime; manifest tags shown' : 'FEATURE_ZIA_OBJECTS off; manifest tags shown');
  return {
    objects: [], moTags: [], counts: {}, bytes: buf ? buf.length : 0, source: 'fallback-local',
    note: buf ? 'Zia object recognition is disabled or unreachable; no local detector exists for arbitrary images' : 'No image or known sceneId supplied'
  };
}

function fixtureResult(scene, note) {
  const objects = normaliseObjects((scene.objects || []).map((o) => ({ label: o.label, box: o.box, confidence: null })));
  const counts = {};
  for (const o of objects) counts[o.label] = (counts[o.label] || 0) + 1;
  return { objects, moTags: [...new Set(objects.flatMap((o) => o.moTokens))], counts, sceneId: scene.sceneId, source: 'fixture', note };
}

/** Test hook. */
function resetManifest() {
  manifestMemo = null;
}

module.exports = { detectObjects, listScenes, sceneById, moTokensFor, normaliseObjects, resetManifest, CLASS_FAMILY, MANIFEST_PATH };
