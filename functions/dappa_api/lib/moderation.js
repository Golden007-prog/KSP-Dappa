'use strict';
// Zia Image Moderation as the intake guard for every image upload (OCR scans,
// evidence scenes, and phase 6's face-probe upload via guardUpload()).
//
// Real path : ctx.services.ziaClient.moderateImage(readStream, { mode })
//             -> { probability: { racy:'0.09', nudity:'0.06', ... },
//                  confidence: 0.85, prediction: 'safe_to_use' }
//             (zcatalyst-sdk-node 3.4.0 utils/pojo/zia.d.ts ICatalystZiaModeration;
//             mode BASIC | MODERATE | ADVANCED, advanced is the default).
// Flag      : FEATURE_ZIA_MODERATION (inherits FEATURE_ZIA).
// Fallback  : a format/size check only — magic-byte sniff for png/jpeg/webp/
//             gif/bmp/tiff/pdf and the 10 MB Zia ceiling — reported as
//             source:'fallback-local' with verdict 'unscreened', never as a
//             clean bill of health.
//
// Verdict policy for a police platform: weapons and violence are EXPECTED in
// evidence photographs, so they route to 'review' (analyst sees a flag), not
// 'block'. Only explicit nudity blocks intake. Thresholds are exported so the
// UI and the tests read the same numbers.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { withTimeout, AI_TIMEOUT_MS } = require('./util');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BLOCK = { nudity: 0.7, explicit: 0.7 };
const REVIEW = { weapons: 0.6, weapon: 0.6, violence: 0.6, gore: 0.6, bloodshed: 0.6, drugs: 0.7, racy: 0.85 };

const MAGIC = [
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['jpeg', [0xff, 0xd8, 0xff]],
  ['gif', [0x47, 0x49, 0x46, 0x38]],
  ['bmp', [0x42, 0x4d]],
  ['tiff', [0x49, 0x49, 0x2a, 0x00]],
  ['tiff', [0x4d, 0x4d, 0x00, 0x2a]],
  ['pdf', [0x25, 0x50, 0x44, 0x46]]
];

function sniffFormat(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  for (const [name, sig] of MAGIC) {
    if (sig.every((b, i) => buf[i] === b)) return name;
  }
  return null;
}

function decodeImage(input) {
  const raw = String(input || '');
  if (!raw) return null;
  const body = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  try {
    const buf = Buffer.from(body, 'base64');
    return buf.length ? buf : null;
  } catch (e) {
    return null;
  }
}

/** Map Zia's probability map onto allow / review / block. Pure. */
function verdictFor(probability, prediction) {
  const p = {};
  for (const [k, v] of Object.entries(probability || {})) p[String(k).toLowerCase()] = Number(v);
  const hits = [];
  let verdict = 'allow';
  for (const [k, th] of Object.entries(BLOCK)) {
    if (Number.isFinite(p[k]) && p[k] >= th) { verdict = 'block'; hits.push({ category: k, probability: p[k], threshold: th }); }
  }
  if (verdict !== 'block') {
    for (const [k, th] of Object.entries(REVIEW)) {
      if (Number.isFinite(p[k]) && p[k] >= th) { verdict = 'review'; hits.push({ category: k, probability: p[k], threshold: th }); }
    }
  }
  if (verdict === 'allow' && prediction && !/safe/i.test(String(prediction))) verdict = 'review';
  return { verdict, hits };
}

/**
 * Screen an image buffer. deps = { flags, ziaClient?, mode? }. Never throws;
 * returns { ok, verdict, format, bytes, probability, confidence, prediction,
 * hits, source, note? }. ok:false only for an unusable payload (not an image,
 * too large).
 */
async function moderateImage(buf, deps) {
  const d = deps || {};
  const format = sniffFormat(buf);
  if (!buf || !buf.length) return { ok: false, verdict: 'reject', reason: 'no image bytes supplied', source: 'fallback-local' };
  if (!format) return { ok: false, verdict: 'reject', reason: 'not a recognised image format (png/jpeg/webp/gif/bmp/tiff/pdf)', source: 'fallback-local' };
  if (buf.length > MAX_IMAGE_BYTES) return { ok: false, verdict: 'reject', reason: `image too large (${buf.length} bytes, max ${MAX_IMAGE_BYTES})`, format, source: 'fallback-local' };

  if (d.flags && d.flags.ziaModeration && d.ziaClient && d.ziaClient.moderateImage) {
    const tmp = path.join(os.tmpdir(), `dappa-mod-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${format === 'jpeg' ? 'jpg' : format}`);
    let stream = null;
    try {
      fs.writeFileSync(tmp, buf);
      const mode = String(d.mode || 'advanced');
      stream = fs.createReadStream(tmp);
      // A stub (or a timed-out call) may never consume the stream; without a
      // listener its lazy open would raise an unhandled 'error' after unlink.
      stream.on('error', () => {});
      const resp = await withTimeout(d.ziaClient.moderateImage(stream, { mode }), AI_TIMEOUT_MS, 'zia moderation');
      const probability = {};
      for (const [k, v] of Object.entries((resp && resp.probability) || {})) probability[k] = Number(v);
      const { verdict, hits } = verdictFor(probability, resp && resp.prediction);
      return {
        ok: true,
        verdict,
        format,
        bytes: buf.length,
        mode,
        probability,
        confidence: resp && resp.confidence !== undefined ? Number(resp.confidence) : null,
        prediction: resp && resp.prediction ? String(resp.prediction) : null,
        hits,
        source: 'zia-moderation'
      };
    } catch (e) {
      return {
        ok: true, verdict: 'unscreened', format, bytes: buf.length, probability: {}, confidence: null, prediction: null, hits: [],
        source: 'fallback-local', note: `Zia moderation failed (${String((e && e.message) || e).slice(0, 120)}); format/size check only`
      };
    } finally {
      if (stream) stream.destroy();
      try { fs.unlinkSync(tmp); } catch (e) { /* best effort */ }
    }
  }
  return {
    ok: true, verdict: 'unscreened', format, bytes: buf.length, probability: {}, confidence: null, prediction: null, hits: [],
    source: 'fallback-local', note: 'Zia moderation is disabled or unreachable; format/size check only'
  };
}

/**
 * Intake guard for any upload route (OCR, evidence scenes, phase-6 face probe).
 * Returns { ok, moderation }. ok:false when the payload is unusable or the
 * verdict is 'block'; 'review' and 'unscreened' pass through with the flag so
 * the caller can label the result.
 */
async function guardUpload(buf, deps) {
  const moderation = await moderateImage(buf, deps);
  if (!moderation.ok) return { ok: false, reason: moderation.reason, moderation };
  if (moderation.verdict === 'block') return { ok: false, reason: 'image blocked by the moderation guard', moderation };
  return { ok: true, moderation };
}

module.exports = { moderateImage, guardUpload, verdictFor, sniffFormat, decodeImage, MAX_IMAGE_BYTES, BLOCK, REVIEW };
