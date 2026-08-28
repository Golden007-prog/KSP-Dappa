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
// Scene images live in client/public/samples/scenes/ for the browser and in
// assets/scenes/ for this function (the pipeline writes both, plus the
// manifest twice, because the client tree is not deployed with the function).
// The function's copy is what makes the Zia leg reachable: the only client
// caller posts {sceneId, caseId} with no bytes, so without a local PNG there
// is nothing to send and the manifest path is the only one that can run.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { withTimeout, AI_TIMEOUT_MS } = require('./util');

const MANIFEST_PATH = path.join(__dirname, '..', 'assets', 'scenes_manifest.json');
const SCENES_DIR = path.join(__dirname, '..', 'assets', 'scenes');

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

/**
 * The scene's PNG bytes, bundled beside the manifest in assets/scenes/.
 * The only client caller posts {sceneId} with no image, so without this the
 * Zia leg had nothing to send and the manifest fallback was the only path
 * that could ever run. Returns null when the file is absent.
 */
function sceneBuffer(scene) {
  if (!scene || !scene.file) return null;
  const name = path.basename(String(scene.file));
  try {
    return fs.readFileSync(path.join(SCENES_DIR, name));
  } catch (e) {
    return null;
  }
}

function normaliseObjects(list) {
  return (list || []).map((o) => {
    const label = String(o.object_type || o.label || '').trim();
    // Guard BEFORE coercing: Number(null) and Number('') are 0, which turned
    // the manifest's deliberate "no confidence — the generator drew this box"
    // into "0 out of 100 sure" on every fixture card.
    const raw = o.confidence;
    const conf = (raw === null || raw === undefined || raw === '') ? NaN : Number(raw);
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
  const sceneId = input && input.sceneId ? String(input.sceneId) : null;
  const ziaReady = Boolean(d.flags && d.flags.ziaObjects && d.ziaClient && d.ziaClient.detectObject);
  // A demo scene names its image instead of uploading it. Read the bundled PNG
  // so the Zia leg is reachable from the client's {sceneId} call; the manifest
  // stays the fallback for a failure, an empty answer or a missing file.
  const buf = (input && input.buffer) || (ziaReady && sceneId ? sceneBuffer(sceneById(sceneId)) : null);

  if (buf && ziaReady) {
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
      const out = { objects, moTags, counts, bytes: buf.length, source: 'zia-objects', ziaRan: true };
      if (objects.length) return out;
      // Empty answer. On an arbitrary upload that IS the answer. On a demo
      // scene the drawn boxes are still the truth of the picture, so they are
      // shown as the FIXTURE they are (dashed, source:'fixture') with Zia's
      // empty result named in the note — never re-labelled as Zia's.
      const known = sceneId ? sceneById(sceneId) : null;
      if (known) return Object.assign(fixtureResult(known, 'Zia recognised nothing in this scene (it does not read procedural drawings — D-phase8-4); the generator\'s own boxes are shown'), { ziaRan: true, ziaObjects: 0 });
      out.note = 'Zia returned no objects for this image';
      return out;
    } catch (e) {
      const scene = sceneId ? sceneById(sceneId) : null;
      if (scene) return Object.assign(fixtureResult(scene, `Zia object recognition failed (${String((e && e.message) || e).slice(0, 120)}); manifest tags shown`), { ziaRan: true });
      return { objects: [], moTags: [], counts: {}, bytes: buf.length, source: 'fallback-local', ziaRan: true, note: `Zia object recognition failed (${String((e && e.message) || e).slice(0, 120)})` };
    } finally {
      if (stream) stream.destroy();
      try { fs.unlinkSync(tmp); } catch (e) { /* best effort */ }
    }
  }

  const scene = sceneId ? sceneById(sceneId) : null;
  if (scene) {
    const why = !(d.flags && d.flags.ziaObjects) ? 'FEATURE_ZIA_OBJECTS off; manifest tags shown'
      : ziaReady ? 'the scene image is not bundled with this function; manifest tags shown'
        : 'Zia handle unavailable in this runtime; manifest tags shown';
    return Object.assign(fixtureResult(scene, why), { ziaRan: false });
  }
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

module.exports = { detectObjects, listScenes, sceneById, sceneBuffer, moTokensFor, normaliseObjects, resetManifest, CLASS_FAMILY, MANIFEST_PATH, SCENES_DIR };
