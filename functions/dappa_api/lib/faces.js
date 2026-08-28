'use strict';
// Face identification — Catalyst-native and accountable by design (Round 2,
// Phase 6). Three steps behind POST /identify:
//
//   1. quality gate   — Zia Face Analytics analyseFace() (flag FEATURE_FACE_ID):
//                       exactly one face, confidence, size, pose. When Zia is
//                       off, unreachable, or does not detect the procedural
//                       gallery faces, the gate runs in ADVISORY mode (decodable
//                       still image, sane dimensions) and says so.
//   2. shortlist      — ≤25 OffenderProfile ⋈ FaceGallery candidates narrowed by
//                       the officer's filters. At least one filter is required:
//                       a whole-gallery sweep is refused (rule R3), and the
//                       response says how the shortlist was narrowed.
//   3. comparison     — per candidate: Zia Identity Scanner compareFace() (1:1,
//                       the only matcher Catalyst offers) for the top-N by
//                       local pre-rank, else the local descriptor engine —
//                       cosine similarity over the same parameter space the
//                       generator draws from (lib/faces_spec.js), computed from
//                       the probe's spec when the probe is one of ours, else
//                       from pixel statistics. Every candidate carries its
//                       confidence and the engine that produced it; nothing is
//                       ever called a "match" without a number beside it.
//
// The gallery is synthetic — procedural cartoon faces drawn by
// pipeline/faces_generate.py, never a photograph — and every response says so.
// No probe image is ever stored: the audit keeps a sha256, the filters, the
// counts, the top confidence, the decision and the officer's identity.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const spec = require('./faces_spec');
const { decodePng, imageSize, sniffMime } = require('./png');
const { withTimeout, AI_TIMEOUT_MS, parseJsonSafe, toNum, round, logJson, hash32 } = require('./util');
const { getLookups } = require('./lookups');
const { extractLocal } = require('./zia');
const constants = require('./constants');

// fixture.js is required lazily: it pulls in the whole fixture graph (and the
// phase-7 action log), which the pure engine helpers used by the calibration
// script must not depend on.
function getFallbackState() {
  // eslint-disable-next-line global-require
  return require('./fixture').getFallbackState();
}

const MAX_PROBE_BYTES = 4 * 1024 * 1024;
const MAX_SHORTLIST = 25;
const DEFAULT_FLOOR = 0.7;
const DEAD_BAND = 0.1;
const TOTAL_BUDGET_MS = Math.max(5000, Number(process.env.FACE_TOTAL_BUDGET_MS) || 20000);
const COMPARE_PARALLELISM = 3;
const COMPARE_CACHE_TTL_SEC = 24 * 3600;
const AUDIT_CACHE_KEY = 'v1:face:audit';
const AUDIT_CACHE_TTL_SEC = 7 * 24 * 3600;
const AUDIT_MEMORY_LIMIT = 200;
const GALLERY_MEMORY_LIMIT = 60;

/** Configurable, visible confidence floor (env FACE_MATCH_FLOOR, default 0.7). */
function floorFor() {
  const n = Number(process.env.FACE_MATCH_FLOOR);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : DEFAULT_FLOOR;
}

/** How many Zia 1:1 compares one search may spend (pooled 100 Zia calls/month). */
function ziaMaxCompares() {
  const n = Number(process.env.FACE_ZIA_MAX_COMPARES);
  return Number.isFinite(n) && n >= 0 ? Math.min(MAX_SHORTLIST, Math.floor(n)) : 5;
}

// ---------------------------------------------------------------------------
// Accountability rules — data, enforced in code, shown in the UI.
// ---------------------------------------------------------------------------

const LEGAL_BASES = [
  { id: 'investigation-fir', label: 'Investigation of a registered FIR', cite: 'BNSS 2023 Ch. XIII (investigation); DPDP Act 2023 s.17(1)(c)' },
  { id: 'bnss-s168-prevention', label: 'Preventive action on information of a design to commit a cognizable offence', cite: 'BNSS 2023 ss.168–169 (presence and prevention, not detention)' },
  { id: 'bnss-s84-proclaimed', label: 'Tracing a proclaimed offender / absconder', cite: 'BNSS 2023 s.84 (court proclamation)' },
  { id: 'magistrate-order', label: 'Order or direction of a Magistrate / court', cite: 'the written order is the basis; record its number in the case field' },
  { id: 'missing-person', label: 'Missing-person / unidentified-body identification', cite: 'UDR / missing-person register; humanitarian purpose' }
];

const RULES = [
  { id: 'R1', title: 'Generated faces only', statement: 'Every gallery image is a procedural, synthetic face. No photograph of a real person is stored, compared or shown.', enforcedBy: 'pipeline/faces_generate.py · FaceGallery.Source = procedural-v1 · meta.synthetic on every response' },
  { id: 'R2', title: 'Never auto-identify', statement: 'The system returns ranked candidates with a confidence each. A human confirms or rejects, and that decision is recorded with the officer\'s identity and rationale.', enforcedBy: 'POST /identify never writes an identity; POST /identify/audit/:id/decision requires a rationale and records the actor' },
  { id: 'R3', title: 'Bounded shortlist, never a sweep', statement: 'At least one structured filter is required and at most 25 candidates are compared. The response states how the shortlist was narrowed.', enforcedBy: 'validateSearch() / buildShortlist() — 400 FILTER_REQUIRED without a filter; 400 BAD_REQUEST for limit > 25 (refused, not silently reduced); meta.shortlist.description' },
  { id: 'R4', title: 'No "match" without its confidence', statement: 'The word match never appears alone: every candidate carries a numeric confidence, the engine that produced it and the reason codes behind it.', enforcedBy: 'candidate.confidence is always present (a number or null with a reason); the UI renders the figure beside the word' },
  { id: 'R5', title: 'Confidence floor with an honest dead band', statement: 'Below the visible floor the answer is "no reliable match", not a weak best guess; the 0.10 band under the floor is labelled borderline.', enforcedBy: 'floorFor() (env FACE_MATCH_FLOOR, default 0.70) · bandFor() · decision = no-reliable-match' },
  { id: 'R6', title: 'Purpose binding', statement: 'A case number and a legal basis from a fixed list are required before a search runs.', enforcedBy: '400 CASE_REQUIRED / LEGAL_BASIS_REQUIRED · LEGAL_BASES list' },
  { id: 'R7', title: 'Full audit, no probe images', statement: 'Every search is logged (who, when, case, basis, filters, candidate count, top confidence, decision) and shown on screen. The probe is kept only as a sha256.', enforcedBy: 'recordSearch() · GET /identify/audit · ActionLog rows (ActionType face-*)' },
  { id: 'R8', title: 'Published limitations', statement: 'A model card reports measured same-person and different-person score distributions on the synthetic set, the floor, and the error rates at the floor. A face match is an investigative lead, not evidence of identity, and face comparison has documented demographic performance variation.', enforcedBy: 'GET /identify/model-card · lib/face_calibration.json · scripts/faces_calibrate.mjs' },
  { id: 'R9', title: 'Still images only', statement: 'No live video, CCTV stream or frame sequence is accepted — one still image per search.', enforcedBy: 'decodeProbe() rejects non-image payloads; no stream endpoint exists' }
];

// ---------------------------------------------------------------------------
// Probe decoding
// ---------------------------------------------------------------------------

function decodeProbe(input) {
  const raw = String(input || '');
  if (!raw.trim()) return { ok: false, code: 'IMAGE_REQUIRED', reason: 'image (base64 or data: URI) is required' };
  let declared = null;
  let body = raw;
  if (raw.startsWith('data:')) {
    const comma = raw.indexOf(',');
    if (comma < 0) return { ok: false, code: 'BAD_IMAGE', reason: 'malformed data URI' };
    declared = raw.slice(5, comma).split(';')[0].toLowerCase();
    body = raw.slice(comma + 1);
    if (declared.startsWith('video/') || declared.includes('stream')) {
      return { ok: false, code: 'STILL_IMAGE_ONLY', reason: 'only a still image is accepted (rule R9) — no video or stream input' };
    }
  }
  // 4 MB decoded ≈ 5.6 MB of base64; refuse before decoding rather than after.
  if (body.length > Math.ceil(MAX_PROBE_BYTES * 4 / 3) + 8) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE', reason: `image exceeds ${MAX_PROBE_BYTES} bytes` };
  }
  let buf;
  try {
    buf = Buffer.from(body.replace(/\s+/g, ''), 'base64');
  } catch (e) {
    return { ok: false, code: 'BAD_IMAGE', reason: 'image is not valid base64' };
  }
  if (!buf.length) return { ok: false, code: 'BAD_IMAGE', reason: 'image is empty' };
  if (buf.length > MAX_PROBE_BYTES) return { ok: false, code: 'PAYLOAD_TOO_LARGE', reason: `image exceeds ${MAX_PROBE_BYTES} bytes` };
  const mime = sniffMime(buf);
  if (!mime) return { ok: false, code: 'BAD_IMAGE', reason: 'not a PNG, JPEG or WEBP still image' };
  const size = imageSize(buf);
  return { ok: true, buf, mime, declared, size, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

// ---------------------------------------------------------------------------
// Local descriptor engine — the honest default.
// ---------------------------------------------------------------------------

// Colours enter as chromaticity + luminance so a re-lit capture (the probe
// generator scales brightness 0.88–1.12) moves one dimension, not three.
// Range-scaling per dimension makes a face-shape step count like a skin-tone
// step; mean-centring turns cosine into a discriminative correlation instead of
// "all positive vectors look alike". A dimension either side lacks (a pixel
// descriptor has no glasses / jaw / beard reading; a spec descriptor has no
// measured aspect) drops out, and `dims` reports how many were compared.
function chroma(c, i) {
  if (!c || c.length < 3) return null;
  const sum = (c[0] + c[1] + c[2]) || 1;
  return i === 2 ? sum / 3 : c[i] / sum;
}
const DIMS = [
  { key: 'skinRc', get: (d) => chroma(d.skin, 0), mid: 0.435, scale: 0.05, w: 1.2 },
  { key: 'skinGc', get: (d) => chroma(d.skin, 1), mid: 0.32, scale: 0.02, w: 1 },
  { key: 'skinLum', get: (d) => chroma(d.skin, 2), mid: 140, scale: 60, w: 1 },
  { key: 'hairRc', get: (d) => chroma(d.hair, 0), mid: 0.38, scale: 0.05, w: 1 },
  { key: 'hairGc', get: (d) => chroma(d.hair, 1), mid: 0.31, scale: 0.03, w: 0.8 },
  { key: 'hairLum', get: (d) => chroma(d.hair, 2), mid: 110, scale: 70, w: 1 },
  { key: 'aspect', get: (d) => d.aspect, mid: 1.45, scale: 0.25, w: 1 },
  { key: 'hairFrac', get: (d) => d.hairFrac, mid: 0.12, scale: 0.1, w: 0.8 },
  { key: 'widthRatio', get: (d) => d.widthRatio, mid: 0.65, scale: 0.06, w: 1 },
  { key: 'heightRatio', get: (d) => d.heightRatio, mid: 0.81, scale: 0.06, w: 1 },
  { key: 'jaw', get: (d) => d.jaw, mid: 0.98, scale: 0.18, w: 0.7 },
  { key: 'glasses', get: (d) => d.glasses, mid: 0.35, scale: 0.5, w: 0.7 },
  { key: 'facialHair', get: (d) => d.facialHair, mid: 0.45, scale: 0.5, w: 0.7 },
  { key: 'hairMass', get: (d) => d.hairMass, mid: 0.42, scale: 0.3, w: 0.7 }
];

function specDescriptor(seed) {
  return spec.descriptor(spec.specFromSeed(seed));
}

// Raw cosine over a few colour/shape dimensions crowds everything into the top
// of the 0–1 axis (the uncalibrated equal-error point on the synthetic set sat
// at 0.96). The fixed exponent stretches that top so the local engine's
// equal-error region lands near the same 0.7 floor Zia's scale uses; it is a
// monotone calibration — ranks are unchanged — and the model card reports the
// measured rates at the floor AFTER it (scripts/faces_calibrate.mjs).
const LOCAL_SHARPEN = 8;

/**
 * Cosine similarity over the dimensions BOTH descriptors carry. Confidence is
 * ((cos + 1) / 2) ^ LOCAL_SHARPEN so it lives on the same 0–1 axis as Zia's
 * figure with a comparable floor.
 */
function similarity(a, b) {
  if (!a || !b) return { confidence: null, cosine: null, dims: 0 };
  let dot = 0;
  let na = 0;
  let nb = 0;
  let dims = 0;
  for (const d of DIMS) {
    const va = d.get(a);
    const vb = d.get(b);
    if (va === null || va === undefined || vb === null || vb === undefined || !Number.isFinite(Number(va)) || !Number.isFinite(Number(vb))) continue;
    const xa = ((Number(va) - d.mid) / d.scale) * d.w;
    const xb = ((Number(vb) - d.mid) / d.scale) * d.w;
    dot += xa * xb;
    na += xa * xa;
    nb += xb * xb;
    dims += 1;
  }
  if (!dims || na === 0 || nb === 0) return { confidence: null, cosine: null, dims };
  const cos = Math.max(-1, Math.min(1, dot / Math.sqrt(na * nb)));
  const raw = (cos + 1) / 2;
  return { confidence: round(raw ** LOCAL_SHARPEN, 4), raw: round(raw, 4), cosine: round(cos, 4), dims };
}

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function medianRgb(px, idxs) {
  const r = []; const g = []; const b = [];
  for (const i of idxs) { r.push(px[i * 3]); g.push(px[i * 3 + 1]); b.push(px[i * 3 + 2]); }
  return [Math.round(median(r)), Math.round(median(g)), Math.round(median(b))];
}

function dist(px, i, c) {
  const dr = px[i * 3] - c[0];
  const dg = px[i * 3 + 1] - c[1];
  const db = px[i * 3 + 2] - c[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Descriptor measured from pixels — what the local engine reads off an
 * arbitrary still. Background from the corners, skin from the centre patch,
 * face extents from the skin-like mask, hair from the band above the face.
 * Shape/glasses/beard are not measured (null) and drop out of the cosine.
 */
function pixelDescriptor(png) {
  if (!png || !png.width || !png.height) return null;
  const { width: W, height: H, rgb: px } = png;
  if (W < 32 || H < 32) return null;
  const at = (x, y) => y * W + x;
  const corner = [];
  const cw = Math.max(2, Math.floor(W * 0.08));
  const ch = Math.max(2, Math.floor(H * 0.08));
  for (let y = 0; y < ch; y += 1) {
    for (let x = 0; x < cw; x += 1) {
      corner.push(at(x, y), at(W - 1 - x, y), at(x, H - 1 - y), at(W - 1 - x, H - 1 - y));
    }
  }
  const bg = medianRgb(px, corner);
  const centre = [];
  const cx = Math.floor(W * 0.5);
  const cy = Math.floor(H * 0.47);
  const r = Math.max(2, Math.floor(Math.min(W, H) * 0.05));
  for (let y = cy - r; y <= cy + r; y += 1) for (let x = cx - r; x <= cx + r; x += 1) centre.push(at(x, y));
  const skin = medianRgb(px, centre);
  // A flat picture (nothing but background) has nothing to measure.
  let nonBg = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / 4096)));
  let sampled = 0;
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { sampled += 1; if (dist(px, at(x, y), bg) > 14) nonBg += 1; }
  if (nonBg < sampled * 0.05) return null;
  // Face rows: skin-like (chroma-tolerant) AND not background. Widths per row
  // give the face extent; the shirt and hair are excluded by colour.
  const rowWidth = new Array(H).fill(0);
  for (let y = 0; y < H; y += 1) {
    let n = 0;
    for (let x = 0; x < W; x += 1) {
      const i = at(x, y);
      if (dist(px, i, skin) < 42 && dist(px, i, bg) > 14) n += 1;
    }
    rowWidth[y] = n;
  }
  const maxW = Math.max(...rowWidth);
  if (maxW < W * 0.12) return null;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < H; y += 1) {
    if (rowWidth[y] >= maxW * 0.45) { if (top < 0) top = y; bottom = y; }
  }
  if (top < 0) return null;
  // The neck below the chin is narrow and dark: stop the face where the width
  // profile collapses below 40 % of the widest row for good.
  let faceBottom = bottom;
  for (let y = Math.floor((top + bottom) / 2); y <= bottom; y += 1) {
    if (rowWidth[y] < maxW * 0.4) { faceBottom = y - 1; break; }
  }
  const faceH = Math.max(1, faceBottom - top + 1);
  // Hair: non-background, non-skin pixels in the band just above the face top
  // and along its upper third (covers caps, curls, side-parts and long hair).
  const hairIdx = [];
  const bandTop = Math.max(0, top - Math.floor(faceH * 0.3));
  const bandBottom = Math.min(H - 1, top + Math.floor(faceH * 0.25));
  let bandNonBg = 0;
  for (let y = bandTop; y <= bandBottom; y += 1) {
    for (let x = Math.floor(W * 0.15); x < Math.floor(W * 0.85); x += 1) {
      const i = at(x, y);
      const notBg = dist(px, i, bg) > 14;
      if (notBg) bandNonBg += 1;
      if (notBg && dist(px, i, skin) > 55) hairIdx.push(i);
    }
  }
  const hairFrac = bandNonBg ? round(hairIdx.length / bandNonBg, 3) : 0;
  const hair = hairIdx.length > 40 && hairFrac > 0.08 ? medianRgb(px, hairIdx) : skin.slice();
  return {
    skin, hair, aspect: round(maxW / faceH, 3), hairFrac,
    widthRatio: null, heightRatio: null, jaw: null, glasses: null, facialHair: null, hairMass: null,
    measured: ['skin', 'hair', 'aspect', 'hairFrac'], background: bg, faceBox: { top, bottom: faceBottom, maxWidth: maxW }
  };
}

function probeDescriptor(decoded, probeSeed) {
  if (probeSeed) return { descriptor: specDescriptor(String(probeSeed)), source: 'spec-descriptor' };
  if (decoded.mime === 'image/png') {
    const png = decodePng(decoded.buf);
    const d = png ? pixelDescriptor(png) : null;
    return d ? { descriptor: d, source: 'pixel-descriptor' } : { descriptor: null, source: 'no-pixel-descriptor' };
  }
  return { descriptor: null, source: 'no-pixel-descriptor' };
}

// ---------------------------------------------------------------------------
// Bands and decisions
// ---------------------------------------------------------------------------

function bandFor(conf, floor) {
  if (conf === null || conf === undefined || !Number.isFinite(Number(conf))) return 'unscored';
  const c = Number(conf);
  if (c >= floor) return 'lead';
  if (c >= floor - DEAD_BAND) return 'borderline';
  return 'below';
}

// ---------------------------------------------------------------------------
// Zia helpers — every call streams a temp file and deletes it afterwards.
// ---------------------------------------------------------------------------

function tmpFile(prefix, mime) {
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  return path.join(os.tmpdir(), `dappa-${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`);
}

function unlinkQuiet(p) {
  try { fs.unlinkSync(p); } catch (e) { /* best effort */ }
}

/** fs.ReadStream for a Zia call. The SDK opens it lazily; if the call fails
 * or returns before the stream is read, a late open error must not become an
 * unhandled 'error' event on the process. */
function openStream(p) {
  const s = fs.createReadStream(p);
  s.on('error', () => {});
  return s;
}

function closeStream(s) {
  try { if (s && !s.destroyed) s.destroy(); } catch (e) { /* best effort */ }
}

function norm01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? round(n / 100, 4) : round(n, 4);
}

/** Yaw proxy from 5-point landmarks: nose offset between the eyes. */
function poseFromLandmarks(lm) {
  if (!lm || typeof lm !== 'object') return null;
  const pick = (re) => {
    const k = Object.keys(lm).find((n) => re.test(n));
    return k && Array.isArray(lm[k]) && lm[k].length >= 2 ? lm[k] : null;
  };
  const le = pick(/left.*eye|eye.*left/i);
  const re = pick(/right.*eye|eye.*right/i);
  const nose = pick(/nose/i);
  if (!le || !re || !nose) return null;
  const eyeDist = Math.hypot(re[0] - le[0], re[1] - le[1]) || 1;
  const dl = Math.hypot(nose[0] - le[0], nose[1] - le[1]);
  const dr = Math.hypot(nose[0] - re[0], nose[1] - re[1]);
  return round(Math.abs(dl - dr) / eyeDist, 3);
}

/**
 * Step 1. Returns { mode:'zia'|'advisory', passed, facesCount, confidence, box,
 * landmarks, pose, reasons[], width, height, note }.
 */
async function qualityGate(decoded, deps) {
  const d = deps || {};
  const size = decoded.size || {};
  const advisory = (reasons, note, extra) => Object.assign({
    mode: 'advisory', passed: reasons.length === 0, facesCount: null, confidence: null, box: null, landmarks: null, pose: null,
    reasons, width: size.width || null, height: size.height || null, note
  }, extra || {});
  const basic = [];
  if (!size.width || !size.height) basic.push('undecodable-dimensions');
  else {
    if (size.width < 64 || size.height < 64) basic.push('too-small');
    const ar = size.width / size.height;
    if (ar < 0.4 || ar > 2.5) basic.push('extreme-aspect-ratio');
  }
  const canZia = d.flags && d.flags.faceId && d.ziaClient && typeof d.ziaClient.analyseFace === 'function';
  if (!canZia) {
    return advisory(basic, d.flags && d.flags.faceId
      ? 'Zia Face Analytics client unavailable in this runtime — advisory checks only'
      : 'FEATURE_FACE_ID off — Zia Face Analytics not called; advisory checks only');
  }
  const tmp = tmpFile('probe', decoded.mime);
  let resp;
  let stream = null;
  try {
    fs.writeFileSync(tmp, decoded.buf);
    stream = openStream(tmp);
    resp = await withTimeout(d.ziaClient.analyseFace(stream, { mode: 'moderate' }), AI_TIMEOUT_MS, 'zia face analytics');
  } catch (e) {
    return advisory(basic, `Zia Face Analytics failed (${String((e && e.message) || e).slice(0, 120)}) — advisory checks only`, { ziaError: String((e && e.message) || e).slice(0, 200) });
  } finally {
    closeStream(stream);
    unlinkQuiet(tmp);
  }
  const faces = Array.isArray(resp && resp.faces) ? resp.faces : [];
  const count = resp && resp.faces_count !== undefined ? toNum(resp.faces_count, faces.length) : faces.length;
  const reasons = basic.slice();
  if (count === 0) {
    // The gallery is procedural: a detector trained on photographs may not see
    // a cartoon at all. For a probe we drew ourselves that is expected and the
    // gate stays advisory; for anything else "no face" is a rejection.
    if (d.probeIsOurs) {
      return advisory(basic, 'Zia Face Analytics detected no face in a procedural probe — advisory mode (expected for generated faces)', { ziaFacesCount: 0, ziaRaw: resp });
    }
    reasons.push('no-face-detected');
  }
  if (count > 1) reasons.push('more-than-one-face');
  const face = faces[0] || null;
  const confidence = face ? norm01(face.confidence) : null;
  if (face && confidence !== null && confidence < 0.5) reasons.push('low-detection-confidence');
  const box = face && Array.isArray(face.co_ordinates) && face.co_ordinates.length >= 4 ? face.co_ordinates.slice(0, 4).map(Number) : null;
  if (box && size.width && size.height) {
    const area = Math.abs((box[2] - box[0]) * (box[3] - box[1])) / (size.width * size.height);
    if (area < 0.02) reasons.push('face-too-small');
  }
  const pose = face ? poseFromLandmarks(face.landmarks) : null;
  if (pose !== null && pose > 0.6) reasons.push('extreme-pose');
  return {
    mode: 'zia', passed: reasons.length === 0, facesCount: count, confidence, box, landmarks: face ? face.landmarks || null : null, pose,
    reasons, width: size.width || null, height: size.height || null, note: 'Zia Face Analytics (mode moderate)', ziaRaw: resp
  };
}

// ---------------------------------------------------------------------------
// Step 2 — shortlist
// ---------------------------------------------------------------------------

const RISK_BANDS = { high: [75, 101], elevated: [50, 75], moderate: [25, 50], low: [0, 25] };
const AGE_BANDS = { '18-25': [18, 25], '26-35': [26, 35], '36-50': [36, 50], '51+': [51, 130] };
const GENDERS = { male: 1, female: 2 };
const FILTER_KEYS = ['districtId', 'moTag', 'riskBand', 'ageBand', 'gender', 'yearFrom', 'yearTo'];

function cleanFilters(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const errors = [];
  if (f.districtId !== undefined && f.districtId !== null && String(f.districtId).trim()) {
    const id = String(f.districtId).trim();
    if (!/^[0-9]{3,4}$/.test(id)) errors.push('districtId must be a 3–4 digit district code');
    else out.districtId = id.padStart(4, '0');
  }
  if (f.moTag !== undefined && f.moTag !== null && String(f.moTag).trim()) {
    const tag = String(f.moTag).trim().toLowerCase();
    if (tag.length > 40 || /['"%]/.test(tag)) errors.push('moTag must be a short tag');
    else out.moTag = tag;
  }
  if (f.riskBand) {
    if (!RISK_BANDS[f.riskBand]) errors.push(`riskBand must be one of ${Object.keys(RISK_BANDS).join(', ')}`);
    else out.riskBand = f.riskBand;
  }
  if (f.ageBand) {
    if (!AGE_BANDS[f.ageBand]) errors.push(`ageBand must be one of ${Object.keys(AGE_BANDS).join(', ')}`);
    else out.ageBand = f.ageBand;
  }
  if (f.gender) {
    if (!GENDERS[f.gender]) errors.push('gender must be male or female');
    else out.gender = f.gender;
  }
  for (const k of ['yearFrom', 'yearTo']) {
    if (f[k] !== undefined && f[k] !== null && String(f[k]).trim() !== '') {
      const y = toNum(f[k], NaN);
      if (!Number.isInteger(y) || y < 2000 || y > 2035) errors.push(`${k} must be a year between 2000 and 2035`);
      else out[k] = y;
    }
  }
  if (out.yearFrom && out.yearTo && out.yearFrom > out.yearTo) errors.push('yearFrom must not exceed yearTo');
  return { filters: out, errors, any: FILTER_KEYS.some((k) => out[k] !== undefined) };
}

function districtOf(lk, id) {
  const bare = String(id).replace(/^0+(?=\d)/, '');
  const hit = constants.DISTRICTS.find((d) => d.id.replace(/^0+(?=\d)/, '') === bare);
  return hit ? hit.name : (lk ? lk.districtName(id) : String(id));
}

function describeShortlist(filters, count, lk) {
  const parts = [];
  if (filters.districtId) parts.push(districtOf(lk, filters.districtId));
  if (filters.moTag) parts.push(`${filters.moTag} cases`);
  if (filters.riskBand) parts.push(`${filters.riskBand}-risk profiles`);
  if (filters.gender) parts.push(filters.gender);
  if (filters.ageBand) parts.push(`aged ${filters.ageBand}`);
  const years = filters.yearFrom || filters.yearTo
    ? `${filters.yearFrom || '…'}–${filters.yearTo || '…'}` : null;
  const scope = parts.length ? parts.join(', ') : 'all profiles';
  return `${count} candidate${count === 1 ? '' : 's'} from ${scope}${years ? `, ${years}` : ''}`;
}

/**
 * Narrow OffenderProfile by the structured filters (ZCQL where it can, in
 * memory where the live dialect differs from the fixture's), join FaceGallery,
 * cap at `limit`. Never a whole-gallery sweep: the caller has already checked
 * that at least one filter is set.
 */
async function buildShortlist(ctx, filters, limit) {
  const lk = await getLookups(ctx);
  const cap = Math.max(1, Math.min(MAX_SHORTLIST, toNum(limit, MAX_SHORTLIST) || MAX_SHORTLIST));
  const where = [];
  if (filters.riskBand) {
    const [lo, hi] = RISK_BANDS[filters.riskBand];
    where.push({ col: 'RiskScore', op: '>=', val: String(lo) });
    where.push({ col: 'RiskScore', op: '<', val: String(hi) });
  }
  if (filters.yearFrom) where.push({ col: 'LastSeen', op: '>=', val: `${filters.yearFrom}-01-01` });
  if (filters.yearTo) where.push({ col: 'FirstSeen', op: '<=', val: `${filters.yearTo}-12-31` });
  const base = {
    table: 'OffenderProfile',
    columns: ['PersonKey', 'CanonicalName', 'AliasesJson', 'CaseCount', 'DistrictsJson', 'FirstSeen', 'LastSeen', 'MOTagsJson', 'CommunityID', 'RiskScore'],
    orderBy: { col: 'RiskScore', desc: true, tieBreak: 'PersonKey' },
    limit: { count: 200 }
  };
  const scan = { queries: 0, profilesScanned: 0, dialect: null };
  let rows = [];
  if (filters.districtId) {
    // Live DistrictsJson holds district NAMES; the fixture holds ids. Try the
    // live dialect first, then the id form — both are single bounded queries.
    const name = districtOf(lk, filters.districtId);
    rows = await ctx.ds.query(Object.assign({}, base, { where: where.concat([{ col: 'DistrictsJson', op: 'like', val: name }]) }));
    scan.queries += 1;
    scan.dialect = 'name';
    if (!rows.length) {
      rows = await ctx.ds.query(Object.assign({}, base, { where: where.concat([{ col: 'DistrictsJson', op: 'like', val: filters.districtId }]) }));
      scan.queries += 1;
      scan.dialect = 'id';
    }
  } else if (filters.moTag) {
    rows = await ctx.ds.query(Object.assign({}, base, { where: where.concat([{ col: 'MOTagsJson', op: 'like', val: filters.moTag }]) }));
    scan.queries += 1;
  } else {
    rows = await ctx.ds.query(Object.assign({}, base, { where }));
    scan.queries += 1;
  }
  scan.profilesScanned = rows.length;
  let profiles = rows.map((r) => ({
    personKey: String(r.PersonKey),
    name: r.CanonicalName,
    aliases: parseJsonSafe(r.AliasesJson, []),
    caseCount: toNum(r.CaseCount, 0),
    districts: parseJsonSafe(r.DistrictsJson, []).map(String),
    firstSeen: r.FirstSeen ? String(r.FirstSeen).slice(0, 10) : null,
    lastSeen: r.LastSeen ? String(r.LastSeen).slice(0, 10) : null,
    moTags: parseJsonSafe(r.MOTagsJson, []).map((t) => String(t).toLowerCase()),
    communityId: r.CommunityID === null || r.CommunityID === undefined || r.CommunityID === '' ? null : toNum(r.CommunityID, null),
    riskScore: toNum(r.RiskScore, 0)
  }));
  if (filters.moTag) profiles = profiles.filter((p) => p.moTags.some((t) => t.includes(filters.moTag)));
  if (filters.districtId) {
    const name = districtOf(lk, filters.districtId).toLowerCase();
    const bare = filters.districtId.replace(/^0+(?=\d)/, '');
    profiles = profiles.filter((p) => p.districts.some((d) => d.toLowerCase() === name || d.replace(/^0+(?=\d)/, '') === bare));
  }
  const applied = { ageBand: null, gender: null };
  if ((filters.ageBand || filters.gender) && profiles.length) {
    // OffenderProfile carries no age or gender; the Accused rows behind the
    // same names do. Bounded: ≤4 IN-queries over the ≤200 narrowed names.
    const names = [...new Set(profiles.map((p) => p.name).filter(Boolean))];
    const ok = new Set();
    for (let i = 0; i < names.length; i += 50) {
      const w = [{ col: 'AccusedName', op: 'in', val: names.slice(i, i + 50) }];
      if (filters.gender) w.push({ col: 'GenderID', op: '=', val: GENDERS[filters.gender] });
      if (filters.ageBand) {
        const [lo, hi] = AGE_BANDS[filters.ageBand];
        w.push({ col: 'AgeYear', op: '>=', val: lo });
        w.push({ col: 'AgeYear', op: '<=', val: hi });
      }
      // eslint-disable-next-line no-await-in-loop
      const acc = await ctx.ds.query({ table: 'Accused', columns: ['AccusedName'], where: w, limit: { count: 300 } });
      scan.queries += 1;
      for (const a of acc) ok.add(String(a.AccusedName));
    }
    profiles = profiles.filter((p) => ok.has(String(p.name)));
    applied.ageBand = filters.ageBand || null;
    applied.gender = filters.gender || null;
  }
  profiles.sort((a, b) => b.riskScore - a.riskScore || a.personKey.localeCompare(b.personKey));
  const narrowed = profiles.length;
  const head = profiles.slice(0, Math.min(200, Math.max(cap * 3, cap)));
  // Gallery join — only people with an active gallery image can be compared.
  const gallery = new Map();
  for (let i = 0; i < head.length; i += 50) {
    const keys = head.slice(i, i + 50).map((p) => p.personKey);
    // eslint-disable-next-line no-await-in-loop
    const g = await ctx.ds.query({ table: 'FaceGallery', columns: ['PersonKey', 'ObjectKey', 'ThumbKey', 'Source', 'Seed', 'QualityJson', 'Active'], where: [{ col: 'PersonKey', op: 'in', val: keys }], limit: { count: 200 } });
    scan.queries += 1;
    for (const row of g) {
      const active = row.Active === true || String(row.Active).toLowerCase() === 'true' || String(row.Active) === '1';
      if (!active) continue;
      if (!gallery.has(String(row.PersonKey))) gallery.set(String(row.PersonKey), row);
    }
  }
  const candidates = [];
  let withoutGallery = 0;
  for (const p of head) {
    const g = gallery.get(p.personKey);
    if (!g) { withoutGallery += 1; continue; }
    candidates.push(Object.assign({}, p, {
      gallery: { objectKey: g.ObjectKey, thumbKey: g.ThumbKey, source: g.Source, seed: g.Seed, quality: parseJsonSafe(g.QualityJson, {}) }
    }));
    if (candidates.length >= cap) break;
  }
  return {
    candidates,
    count: candidates.length,
    cap,
    narrowed,
    withoutGallery,
    filters,
    applied,
    description: describeShortlist(filters, candidates.length, lk),
    scan
  };
}

// ---------------------------------------------------------------------------
// Step 2b — corroboration source: the case the search is bound to
// ---------------------------------------------------------------------------
// The two-signal rule is only worth something if the second signal comes from
// somewhere the shortlist did NOT already consume. Testing a candidate against
// the officer's own district / MO filter cannot do that: buildShortlist()
// selected on exactly that predicate, so every candidate carries it and the
// "signal" is decided by which filter was picked. The corroboration therefore
// reads the FIR the search is bound to (rule R6 already demands its number)
// and tests each candidate against THAT record: the district the case was
// registered in, and the MO vocabulary in its BriefFacts. Where the case value
// happens to equal the filter value, the hit is still reported but flagged
// `fromFilter` and never counted as independent.
//
// CaseNo (9 digits) is only unique per unit+category+year in the real
// numbering, so an ambiguous lookup is reported as ambiguous rather than
// guessed at; the 18-digit CrimeNo resolves uniquely.

const CASE_LOOKUP_LIMIT = 6;

/** 'entry:gas-cutter' / 'Two Wheeler' -> 'gas-cutter' / 'two-wheeler'. */
function normTag(s) {
  return String(s || '').toLowerCase().replace(/^[a-z]+:/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Token-set containment, so 'two-wheeler' matches 'two-wheeler-without-plate'
 * but 'gold-chain' does not match 'gold-mangalsutra'. */
function tagOverlap(a, b) {
  const ta = normTag(a).split('-').filter((x) => x.length >= 3);
  const tb = normTag(b).split('-').filter((x) => x.length >= 3);
  if (!ta.length || !tb.length) return false;
  return ta.every((x) => tb.includes(x)) || tb.every((x) => ta.includes(x));
}

/** MO vocabulary of a FIR narrative — the same extractor /surfaces uses. Only
 * the MO tags are taken: names, amounts and dates in the narrative are not. */
function caseMoTags(briefFacts) {
  try {
    return (extractLocal(briefFacts).moTags || []).map(normTag).filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * Resolve the bound case to the record behind it. Two bounded, indexed
 * queries at most (CrimeNo then CaseNo — search.js:23 lists both as the
 * indexable case columns). Never throws: an unreachable store degrades to
 * "unresolved" and the UI says the second signal could not be checked.
 */
async function resolveCase(ctx, caseNo, lk) {
  const raw = String(caseNo || '').trim();
  const out = {
    caseNo: raw || null, resolved: false, reason: 'no-case', matches: 0, queries: 0,
    crimeNo: null, districtId: null, districtName: null, unitId: null, unitName: null, crimeType: null, moTags: []
  };
  if (!raw) return out;
  out.reason = 'not-found';
  const columns = ['CaseMasterID', 'CrimeNo', 'CaseNo', 'CrimeRegisteredDate', 'PoliceStationID', 'CrimeMinorHeadID', 'BriefFacts'];
  let rows = [];
  try {
    if (/^\d{12,20}$/.test(raw)) {
      rows = await ctx.ds.query({ table: 'CaseMaster', columns, where: [{ col: 'CrimeNo', op: '=', val: raw }], limit: { count: 2 } });
      out.queries += 1;
    }
    if (!rows.length) {
      rows = await ctx.ds.query({ table: 'CaseMaster', columns, where: [{ col: 'CaseNo', op: '=', val: raw }], limit: { count: CASE_LOOKUP_LIMIT } });
      out.queries += 1;
    }
  } catch (e) {
    out.reason = 'lookup-failed';
    return out;
  }
  out.matches = rows.length;
  if (!rows.length) return out;
  if (rows.length > 1) { out.reason = 'ambiguous'; return out; }
  const r = rows[0];
  const crimeNo = r.CrimeNo === null || r.CrimeNo === undefined ? '' : String(r.CrimeNo);
  const unitId = r.PoliceStationID === null || r.PoliceStationID === undefined || r.PoliceStationID === '' ? null : String(r.PoliceStationID);
  const unit = unitId && lk && lk.unitById ? lk.unitById.get(unitId) : null;
  // Unit master first; the CrimeNo carries the district in digits 2–5
  // (cat + district + unit + year + serial) when the Unit table is short.
  const districtId = (unit && unit.districtId) || (/^\d{18}$/.test(crimeNo) ? crimeNo.slice(1, 5) : null);
  out.resolved = true;
  out.reason = null;
  out.caseMasterId = r.CaseMasterID === undefined ? null : String(r.CaseMasterID);
  out.crimeNo = crimeNo || null;
  out.registeredOn = r.CrimeRegisteredDate ? String(r.CrimeRegisteredDate).slice(0, 10) : null;
  out.unitId = unitId;
  out.unitName = unit ? unit.unitName : null;
  out.districtId = districtId ? String(districtId).padStart(4, '0') : null;
  out.districtName = districtId ? districtOf(lk, districtId) : null;
  out.crimeType = r.CrimeMinorHeadID === undefined || r.CrimeMinorHeadID === null ? null : (lk && lk.subHeadName ? lk.subHeadName(r.CrimeMinorHeadID) : String(r.CrimeMinorHeadID));
  out.moTags = caseMoTags(r.BriefFacts);
  return out;
}

// ---------------------------------------------------------------------------
// Step 3 — comparison
// ---------------------------------------------------------------------------

const galleryMemory = new Map(); // objectKey -> Buffer

function rememberGallery(key, buf) {
  galleryMemory.set(key, buf);
  while (galleryMemory.size > GALLERY_MEMORY_LIMIT) galleryMemory.delete(galleryMemory.keys().next().value);
}

async function streamToBuffer(obj) {
  if (Buffer.isBuffer(obj)) return obj;
  if (typeof obj === 'string') return Buffer.from(obj, 'binary');
  if (obj && typeof obj.on === 'function') {
    return new Promise((resolve, reject) => {
      const chunks = [];
      obj.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      obj.on('end', () => resolve(Buffer.concat(chunks)));
      obj.on('error', reject);
    });
  }
  if (obj && typeof obj.arrayBuffer === 'function') return Buffer.from(await obj.arrayBuffer());
  return null;
}

/** Gallery PNG of record: memory → injected bucket → SDK Stratus bucket. */
async function galleryImage(ctx, req, objectKey) {
  if (!objectKey) return null;
  const hit = galleryMemory.get(objectKey);
  if (hit) return hit;
  let buf = null;
  try {
    if (ctx.services.faceBucket && typeof ctx.services.faceBucket.get === 'function') {
      buf = await streamToBuffer(await ctx.services.faceBucket.get(objectKey));
    } else {
      let capp = null;
      try { capp = require('zcatalyst-sdk-node').initialize(req); } catch (e) { capp = null; }
      if (capp) {
        const bucket = capp.stratus().bucket(process.env.STRATUS_BUCKET || 'dappa-import');
        buf = await streamToBuffer(await withTimeout(bucket.getObject(objectKey), AI_TIMEOUT_MS, 'stratus getObject'));
      }
    }
  } catch (e) {
    logJson('warn', 'face_gallery_fetch_failed', { objectKey, message: String((e && e.message) || e).slice(0, 160) });
    buf = null;
  }
  if (buf && buf.length) rememberGallery(objectKey, buf);
  return buf && buf.length ? buf : null;
}

async function ziaCompare(ctx, req, deps, probe, cand) {
  const key = `v1:face:cmp:${probe.sha256}:${cand.personKey}`;
  const cached = await ctx.cache.get(key).catch(() => undefined);
  if (cached && cached.value) return Object.assign({ cached: true }, cached.value);
  const galleryBuf = await galleryImage(ctx, req, cand.gallery.objectKey);
  if (!galleryBuf) return { ok: false, reason: 'gallery-image-unreachable' };
  const a = tmpFile('probe', probe.mime);
  const b = tmpFile('gallery', sniffMime(galleryBuf) || 'image/png');
  let sa = null;
  let sb = null;
  try {
    fs.writeFileSync(a, probe.buf);
    fs.writeFileSync(b, galleryBuf);
    sb = openStream(b);
    sa = openStream(a);
    const resp = await withTimeout(deps.ziaClient.compareFace(sb, sa), AI_TIMEOUT_MS, 'zia identity scanner');
    const conf = resp && resp.confidence !== undefined ? norm01(resp.confidence) : null;
    // `matched` arrives as the STRING "true"/"false" (docs/CATALYST_SERVICE_RESEARCH.md §5.1).
    const matchedRaw = resp && resp.matched !== undefined ? String(resp.matched) : null;
    const out = { ok: true, confidence: conf, ziaMatched: matchedRaw, raw: resp };
    await ctx.cache.put(key, out, COMPARE_CACHE_TTL_SEC).catch(() => {});
    return out;
  } catch (e) {
    return { ok: false, reason: 'zia-unavailable', error: String((e && e.message) || e).slice(0, 160) };
  } finally {
    closeStream(sa);
    closeStream(sb);
    unlinkQuiet(a);
    unlinkQuiet(b);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      // eslint-disable-next-line no-await-in-loop
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Score every shortlisted candidate. Local descriptor first (free, instant),
 * then the Zia Identity Scanner for the top-N when the flag is on — inside a
 * total time budget and with parallelism ≤3.
 */
async function compareCandidates(ctx, req, deps, probe, probeDesc, shortlist, floor, caseCtx) {
  const started = Date.now();
  const scored = shortlist.candidates.map((c) => {
    // Same measurement on both sides whenever possible: a pixel probe against
    // the gallery image's stored pixel descriptor (QualityJson.pixel), a
    // seed-drawn probe against the gallery seed's parameter descriptor.
    const galleryPixel = c.gallery.quality && c.gallery.quality.pixel && c.gallery.quality.pixel.skin ? c.gallery.quality.pixel : null;
    const usePixel = probeDesc.source === 'pixel-descriptor' && galleryPixel;
    const gDesc = usePixel ? galleryPixel : (c.gallery.seed ? specDescriptor(String(c.gallery.seed)) : null);
    const sim = similarity(probeDesc.descriptor, gDesc);
    const reasonCodes = [];
    if (!gDesc) reasonCodes.push('gallery-seed-missing');
    else if (sim.confidence === null) reasonCodes.push(probeDesc.source);
    else {
      reasonCodes.push('local-descriptor', probeDesc.source, usePixel ? 'gallery-pixel' : 'gallery-spec', `dims-${sim.dims}`);
      // The debug seed path compares the generator's parameters with
      // themselves: say so rather than letting 1.0 read as a similarity.
      if (probeDesc.source === 'spec-descriptor' && !usePixel && sim.confidence === 1) reasonCodes.push('exact-parameter-match');
    }
    return Object.assign({}, c, {
      local: { confidence: sim.confidence, cosine: sim.cosine, dims: sim.dims },
      confidence: sim.confidence,
      engine: 'local-descriptor',
      reasonCodes
    });
  });
  scored.sort((a, b) => (b.confidence === null ? -1 : b.confidence) - (a.confidence === null ? -1 : a.confidence));
  const engines = { zia: 0, local: scored.length, ziaFailed: 0, ziaCached: 0 };
  const canZia = deps.flags && deps.flags.faceId && deps.ziaClient && typeof deps.ziaClient.compareFace === 'function';
  const maxZia = canZia ? ziaMaxCompares() : 0;
  const targets = scored.slice(0, maxZia);
  if (targets.length) {
    await mapLimit(targets, COMPARE_PARALLELISM, async (cand) => {
      if (Date.now() - started > TOTAL_BUDGET_MS) { cand.reasonCodes.push('zia-budget-exhausted'); engines.ziaFailed += 1; return; }
      const r = await ziaCompare(ctx, req, deps, probe, cand);
      if (r.ok && r.confidence !== null) {
        cand.confidence = r.confidence;
        cand.engine = 'zia-identity-scanner';
        cand.zia = { confidence: r.confidence, matched: r.ziaMatched, cached: Boolean(r.cached) };
        cand.reasonCodes = ['zia-compare'].concat(cand.reasonCodes.filter((x) => x !== 'local-descriptor'));
        engines.zia += 1;
        engines.local -= 1;
        if (r.cached) engines.ziaCached += 1;
      } else {
        cand.reasonCodes.push(r.reason || 'zia-unavailable');
        engines.ziaFailed += 1;
      }
    });
  }
  scored.sort((a, b) => (b.confidence === null ? -1 : b.confidence) - (a.confidence === null ? -1 : a.confidence));
  // Corroboration is measured against the CASE record, never against the
  // filter that built the shortlist (see "Step 2b" above).
  const f = shortlist.filters;
  const cc = caseCtx && caseCtx.resolved ? caseCtx : null;
  const caseBare = cc && cc.districtId ? cc.districtId.replace(/^0+(?=\d)/, '') : null;
  const caseDistrictName = cc && cc.districtName ? String(cc.districtName).toLowerCase() : null;
  const caseTags = cc ? (cc.moTags || []) : [];
  // A value the officer already filtered on is carried by every candidate by
  // construction, so it corroborates nothing even when it is true.
  const districtFromFilter = Boolean(caseBare && f.districtId && f.districtId.replace(/^0+(?=\d)/, '') === caseBare);
  const filterTag = f.moTag ? normTag(f.moTag) : null;
  const candidates = scored.map((c, i) => {
    const band = bandFor(c.confidence, floor);
    const districtHit = caseBare === null
      ? null
      : c.districts.some((d) => String(d).replace(/^0+(?=\d)/, '') === caseBare || String(d).toLowerCase() === caseDistrictName);
    const moMatches = caseTags.length
      ? [...new Set(c.moTags.map(normTag).filter((t) => caseTags.some((ct) => tagOverlap(t, ct))))]
      : [];
    const moHit = caseTags.length ? moMatches.length > 0 : null;
    // The MO signal is only the officer's own filter when EVERY matching tag
    // is the one they filtered on.
    const moFromFilter = Boolean(moHit && filterTag && moMatches.every((t) => tagOverlap(t, filterTag)));
    const independent = Boolean((districtHit === true && !districtFromFilter) || (moHit === true && !moFromFilter));
    const twoSignals = band === 'lead' && independent;
    const codes = c.reasonCodes.slice();
    if (districtHit === true) codes.push(districtFromFilter ? 'district-hit-from-filter' : 'district-hit');
    if (moHit === true) codes.push(moFromFilter ? 'mo-hit-from-filter' : 'mo-hit');
    if (!cc) codes.push(`corroboration-${(caseCtx && caseCtx.reason) || 'unresolved'}`);
    if (twoSignals) codes.push('two-signals');
    if (band === 'borderline') codes.push('dead-band');
    if (band === 'below') codes.push('below-floor');
    return {
      rank: i + 1,
      personKey: c.personKey,
      name: c.name,
      confidence: c.confidence,
      matched: band === 'lead',
      band,
      engine: c.engine,
      local: c.local,
      zia: c.zia || null,
      thumbUrl: `/identify/thumb/${encodeURIComponent(c.personKey)}.svg`,
      imageOfRecord: c.gallery.objectKey,
      reasonCodes: codes,
      corroboration: {
        basis: cc ? 'case-record' : 'unresolved',
        districtHit,
        moHit,
        moMatches,
        fromFilter: { district: districtHit === true && districtFromFilter, mo: moFromFilter },
        independent,
        twoSignals
      },
      riskScore: c.riskScore,
      caseCount: c.caseCount,
      districts: c.districts,
      moTags: c.moTags,
      lastSeen: c.lastSeen,
      traits: c.gallery.seed ? spec.traits(spec.specFromSeed(String(c.gallery.seed))) : []
    };
  });
  // Naming the engine honestly matters more here than anywhere else in the app:
  // Zia's comparison is unreliable under the shortlist's parallelism (measured
  // 1 of 5 succeeding on 28 Aug — docs/benchmarks/face_zia_probe.json), so a
  // single success must not label an answer that the local engine mostly
  // produced. 'mixed' is the truth when both scored candidates in one search.
  const primary = engines.zia > 0
    ? (engines.local > 0 ? 'mixed' : 'zia-identity-scanner')
    : 'local-descriptor';
  return { candidates, engines, primary, elapsedMs: Date.now() - started };
}

// ---------------------------------------------------------------------------
// Audit — memory ring + Catalyst Cache mirror + ActionLog rows. No images.
// ---------------------------------------------------------------------------

const auditMemory = new Map(); // searchId -> record

function rememberAudit(rec) {
  auditMemory.set(rec.searchId, rec);
  while (auditMemory.size > AUDIT_MEMORY_LIMIT) auditMemory.delete(auditMemory.keys().next().value);
}

async function readAuditCache(ctx) {
  const hit = await ctx.cache.get(AUDIT_CACHE_KEY).catch(() => undefined);
  return hit && Array.isArray(hit.value) ? hit.value : [];
}

async function writeAuditCache(ctx, rec) {
  const list = await readAuditCache(ctx);
  const next = [rec].concat(list.filter((r) => r.searchId !== rec.searchId)).slice(0, 100);
  await ctx.cache.put(AUDIT_CACHE_KEY, next, AUDIT_CACHE_TTL_SEC).catch(() => {});
}

function actorOf(identity) {
  const u = identity && identity.user;
  const name = u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.userId : null;
  return {
    actor: name || (identity && identity.anonymous ? 'anonymous (public demo)' : 'unknown'),
    role: (identity && identity.role) || 'viewer',
    source: (identity && identity.roleSource) || 'anonymous'
  };
}

/** ActionLog row per the console table (AlertKey, ActionType, Actor, ActorRole, Unit, Note, OutcomeLabel, Payload, ClientTs). */
function actionRow(kind, rec, extra) {
  const e = extra || {};
  return {
    AlertKey: `face:${rec.searchId}`.slice(0, 64),
    ActionType: kind.slice(0, 32),
    Actor: String(e.actor || rec.officer.actor).slice(0, 128),
    ActorRole: String(e.role || rec.officer.role).slice(0, 32),
    Unit: String(e.unit || rec.unit || '').slice(0, 64),
    Note: String(e.note || rec.caseNo || '').slice(0, 2000),
    OutcomeLabel: String(e.outcome || rec.decision || '').slice(0, 32),
    Payload: JSON.stringify(Object.assign({ subjectType: 'face' }, e.payload || {})),
    ClientTs: (e.ts || rec.ts).replace('T', ' ').replace(/\.\d+Z$/, '')
  };
}

/** Own ActionLog row (ActionType face-search / face-decision) through the SDK;
 * an injected ctx.services.actionWriter (tests) or nothing at all (local run —
 * the memory/cache copies still serve the audit). */
async function persistActionRow(ctx, req, row) {
  let writer = ctx.services && ctx.services.actionWriter && typeof ctx.services.actionWriter.insert === 'function' ? ctx.services.actionWriter : null;
  if (!writer) {
    let capp = null;
    try { capp = require('zcatalyst-sdk-node').initialize(req); } catch (e) { capp = null; }
    if (capp) writer = { insert: (r) => capp.datastore().table('ActionLog').insertRow(r) };
  }
  if (!writer) return { via: null, result: null };
  try {
    const out = await withTimeout(writer.insert(row), AI_TIMEOUT_MS, 'ActionLog insert');
    return { via: 'sdk', result: out && out.ROWID ? String(out.ROWID) : true };
  } catch (e) {
    logJson('warn', 'face_actionlog_insert_failed', { message: String((e && e.message) || e).slice(0, 160) });
    return { via: 'sdk', result: null, error: String((e && e.message) || e).slice(0, 160) };
  }
}

/** A confirm/reject also goes through phase-7's lib/actionlog.js recordAction
 * (subjectType face, actionType outcome) when that module exports it, so the
 * action-loop outcome statistics count face decisions; otherwise the own row. */
async function persistDecision(ctx, req, rec, entry) {
  let al = null;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    al = require('./actionlog');
  } catch (e) {
    al = null;
  }
  if (al && typeof al.recordAction === 'function') {
    try {
      const r = await al.recordAction(ctx, req, {
        subjectType: 'face',
        subjectKey: rec.searchId,
        actionType: 'outcome',
        outcomeLabel: entry.decision === 'confirm' ? 'true_positive' : 'false_alarm',
        note: `${entry.personKey}: ${entry.rationale}`.slice(0, 500),
        unit: rec.unit || undefined,
        clientTs: entry.ts,
        source: 'face-id'
      }, { actor: entry.actor, actorRole: entry.role, actorSource: entry.source || 'face-id' });
      if (r && r.ok) return { via: 'lib/actionlog.js', result: r.storage || true, duplicate: Boolean(r.duplicate) };
      logJson('warn', 'face_actionlog_rejected', { code: r && r.code, message: r && r.message });
    } catch (e) {
      logJson('warn', 'face_actionlog_writer_failed', { message: String((e && e.message) || e).slice(0, 160) });
    }
  }
  return persistActionRow(ctx, req, actionRow('face-decision', rec, {
    actor: entry.actor, role: entry.role, outcome: entry.decision, note: entry.rationale, ts: entry.ts,
    payload: { personKey: entry.personKey, rationale: entry.rationale, confidence: entry.confidence, engine: entry.engine, caseNo: rec.caseNo, legalBasis: rec.legalBasis }
  }));
}

async function recordSearch(ctx, req, rec) {
  rememberAudit(rec);
  await writeAuditCache(ctx, rec);
  const persisted = await persistActionRow(ctx, req, actionRow('face-search', rec, {
    outcome: rec.decision,
    payload: {
      probeSha256: rec.probeSha256, probeSource: rec.probeSource || 'upload', samplePerson: rec.samplePerson || null,
      exactParameterMatch: Boolean(rec.exactParameterMatch),
      caseNo: rec.caseNo, legalBasis: rec.legalBasis, filters: rec.filters,
      shortlist: rec.shortlist, candidates: rec.candidates, topConfidence: rec.topConfidence, topPersonKey: rec.topPersonKey,
      // The key list is what makes "searches that shortlisted this person"
      // survive a container restart: without it only the top-ranked person
      // matches when the row is read back from the Data Store.
      shortlistKeys: Array.isArray(rec.shortlistKeys) ? rec.shortlistKeys.slice(0, MAX_SHORTLIST) : [],
      engine: rec.engine, gate: rec.gate, floor: rec.floor
    }
  }));
  rec.persisted = persisted;
  return rec;
}

function parseAuditRow(row) {
  const payload = parseJsonSafe(row.Payload, {}) || {};
  const searchId = String(row.AlertKey || '').replace(/^face:/, '');
  if (!searchId) return null;
  const ts = String(row.ClientTs || row.CREATEDTIME || '').replace(' ', 'T');
  if (row.ActionType === 'face-search') {
    return {
      searchId, ts, source: 'datastore',
      probeSha256: payload.probeSha256 || null, probeSource: payload.probeSource || 'upload', samplePerson: payload.samplePerson || null,
      exactParameterMatch: Boolean(payload.exactParameterMatch),
      caseNo: payload.caseNo || row.Note || null, legalBasis: payload.legalBasis || null,
      officer: { actor: row.Actor, role: row.ActorRole }, unit: row.Unit || null,
      filters: payload.filters || {}, shortlist: payload.shortlist || null, candidates: toNum(payload.candidates, 0),
      shortlistKeys: Array.isArray(payload.shortlistKeys) ? payload.shortlistKeys.map(String) : [],
      topConfidence: payload.topConfidence === undefined ? null : payload.topConfidence, topPersonKey: payload.topPersonKey || null,
      decision: row.OutcomeLabel || payload.decision || null, engine: payload.engine || null, gate: payload.gate || null, floor: payload.floor || null,
      decisions: []
    };
  }
  if (row.ActionType === 'face-decision') {
    return { searchId, ts, source: 'datastore', decisionOnly: true, decision: { personKey: payload.personKey, decision: row.OutcomeLabel, rationale: payload.rationale || row.Note, actor: row.Actor, role: row.ActorRole, ts } };
  }
  return null;
}

/** Recent searches, newest first — memory, cache mirror and ActionLog rows merged by searchId. */
async function listAudit(ctx, opts) {
  const o = opts || {};
  const limit = Math.max(1, Math.min(100, toNum(o.limit, 50) || 50));
  const byId = new Map();
  const put = (rec) => {
    if (!rec || !rec.searchId) return;
    const cur = byId.get(rec.searchId);
    if (!cur) { byId.set(rec.searchId, Object.assign({ decisions: [] }, rec)); return; }
    // Prefer the richer copy; union the decisions.
    const merged = Object.assign({}, cur, rec, { decisions: cur.decisions || [] });
    // A copy written before shortlistKeys was persisted carries an empty list;
    // never let it blank out a copy that knows the keys.
    if (!(merged.shortlistKeys || []).length && (cur.shortlistKeys || []).length) merged.shortlistKeys = cur.shortlistKeys;
    for (const d of rec.decisions || []) if (!merged.decisions.some((x) => x.personKey === d.personKey && x.ts === d.ts)) merged.decisions.push(d);
    merged.source = cur.source === 'memory' ? 'memory' : rec.source;
    byId.set(rec.searchId, merged);
  };
  for (const rec of auditMemory.values()) put(Object.assign({}, rec, { source: 'memory' }));
  for (const rec of await readAuditCache(ctx)) put(Object.assign({}, rec, { source: rec.source === 'memory' ? 'cache' : rec.source || 'cache' }));
  let datastoreRows = 0;
  let datastoreSource = 'datastore';
  try {
    const before = getFallbackState().queries;
    const rows = await ctx.ds.query({
      table: 'ActionLog',
      columns: ['ROWID', 'AlertKey', 'ActionType', 'Actor', 'ActorRole', 'Unit', 'Note', 'OutcomeLabel', 'Payload', 'ClientTs', 'CREATEDTIME'],
      where: [{ col: 'AlertKey', op: 'like', val: 'face:' }],
      orderBy: { col: 'ClientTs', desc: true, tieBreak: 'ROWID' },
      limit: { count: 200 }
    });
    if (getFallbackState().queries > before) datastoreSource = 'fixture';
    const pendingDecisions = [];
    for (const row of rows) {
      const rec = parseAuditRow(row);
      if (!rec) continue;
      datastoreRows += 1;
      if (rec.decisionOnly) { pendingDecisions.push(rec); continue; }
      put(Object.assign(rec, { source: datastoreSource }));
    }
    for (const d of pendingDecisions) {
      const cur = byId.get(d.searchId);
      if (cur && !cur.decisions.some((x) => x.personKey === d.decision.personKey && x.ts === d.decision.ts)) cur.decisions.push(d.decision);
    }
  } catch (e) {
    datastoreSource = 'unavailable';
  }
  let list = [...byId.values()].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  if (o.personKey) list = list.filter((r) => r.topPersonKey === o.personKey || (r.shortlistKeys || []).includes(o.personKey) || (r.decisions || []).some((d) => d.personKey === o.personKey));
  if (o.decision === 'confirm') list = list.filter((r) => (r.decisions || []).some((d) => d.decision === 'confirm'));
  return {
    items: list.slice(0, limit).map((r) => Object.assign({}, r, { persisted: undefined })),
    total: list.length,
    sources: { memory: auditMemory.size, datastoreRows, datastoreSource }
  };
}

async function recordDecision(ctx, req, searchId, body, identity) {
  const b = body || {};
  const decision = String(b.decision || '').toLowerCase();
  if (!['confirm', 'reject'].includes(decision)) return { ok: false, code: 'BAD_REQUEST', reason: 'decision must be confirm or reject' };
  const personKey = String(b.personKey || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(personKey)) return { ok: false, code: 'BAD_REQUEST', reason: 'personKey required' };
  const rationale = String(b.rationale || '').trim();
  if (rationale.length < 10 || rationale.length > 600) return { ok: false, code: 'RATIONALE_REQUIRED', reason: 'a rationale of 10–600 characters is required (rule R2)' };
  const audit = await listAudit(ctx, { limit: 100 });
  const rec = audit.items.find((r) => r.searchId === searchId);
  if (!rec) return { ok: false, code: 'NOT_FOUND', reason: 'search not found in the audit' };
  const who = actorOf(identity);
  const entry = {
    personKey, decision, rationale, actor: who.actor, role: who.role, source: who.source, ts: new Date().toISOString(),
    confidence: b.confidence === undefined || b.confidence === null ? null : norm01(b.confidence),
    engine: b.engine ? String(b.engine).slice(0, 32) : null
  };
  const merged = Object.assign({}, rec, { decisions: (rec.decisions || []).concat([entry]) });
  delete merged.persisted;
  rememberAudit(merged);
  await writeAuditCache(ctx, merged);
  const persisted = await persistDecision(ctx, req, merged, entry);
  return { ok: true, record: merged, entry, persisted };
}

// ---------------------------------------------------------------------------
// Orchestration — POST /identify
// ---------------------------------------------------------------------------

function validateSearch(body) {
  const b = body || {};
  const errors = [];
  const caseNo = String(b.caseNo || '').trim();
  if (!caseNo) errors.push({ code: 'CASE_REQUIRED', message: 'caseNo is required — a face search must be bound to a case (rule R6)' });
  else if (!/^[A-Za-z0-9/-]{4,32}$/.test(caseNo)) errors.push({ code: 'BAD_REQUEST', message: 'caseNo must be 4–32 characters (letters, digits, / and -)' });
  const legalBasis = String(b.legalBasis || '').trim();
  if (!legalBasis) errors.push({ code: 'LEGAL_BASIS_REQUIRED', message: `legalBasis is required — one of ${LEGAL_BASES.map((l) => l.id).join(', ')} (rule R6)` });
  else if (!LEGAL_BASES.some((l) => l.id === legalBasis)) errors.push({ code: 'BAD_REQUEST', message: `legalBasis must be one of ${LEGAL_BASES.map((l) => l.id).join(', ')}` });
  const cf = cleanFilters(b.filters);
  for (const e of cf.errors) errors.push({ code: 'BAD_REQUEST', message: e });
  if (!cf.any && !cf.errors.length) errors.push({ code: 'FILTER_REQUIRED', message: 'at least one filter (districtId, moTag, riskBand, ageBand, gender, yearFrom/yearTo) must narrow the shortlist — a whole-gallery sweep is not allowed (rule R3)' });
  const limit = b.limit === undefined ? MAX_SHORTLIST : toNum(b.limit, NaN);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SHORTLIST) errors.push({ code: 'BAD_REQUEST', message: `limit must be an integer between 1 and ${MAX_SHORTLIST}` });
  // probeSeed is a DEBUG / calibration input only: it skips the pixels and
  // compares the generator's parameters directly, so a probe drawn from a
  // gallery seed scores exactly 1.0 by construction. The UI never sends it
  // (D-phase6-16) and every response that used it is labelled as an exact
  // parameter match rather than a similarity.
  const probeSeed = b.probeSeed ? String(b.probeSeed).slice(0, 64) : null;
  if (probeSeed && !/^v\d+:\d+:[A-Za-z0-9_-]+$/.test(probeSeed)) errors.push({ code: 'BAD_REQUEST', message: 'probeSeed is malformed' });
  // Provenance of the probe: which built-in sample capture it was re-drawn
  // from, or null for a real upload. Recorded in the audit, never matched on.
  const samplePerson = b.samplePerson ? String(b.samplePerson).slice(0, 64) : null;
  if (samplePerson && !/^[A-Za-z0-9_-]{1,64}$/.test(samplePerson)) errors.push({ code: 'BAD_REQUEST', message: 'samplePerson is malformed' });
  return { errors, caseNo, legalBasis, filters: cf.filters, limit, probeSeed, samplePerson };
}

/** Deterministic demo answer when the caller asks for fixture mode explicitly (meta.source 'fixture'). */
async function identify(ctx, req, body, deps) {
  const v = validateSearch(body);
  const decoded = decodeProbe(body && body.image);
  if (!decoded.ok) v.errors.unshift({ code: decoded.code, message: decoded.reason });
  if (v.errors.length) return { ok: false, status: 400, error: v.errors[0], errors: v.errors };
  const floor = floorFor();
  const probeDesc = probeDescriptor(decoded, v.probeSeed);
  const gate = await qualityGate(decoded, Object.assign({ probeIsOurs: Boolean(v.probeSeed) }, deps));
  const identity = deps.identity || null;
  const who = actorOf(identity);
  const searchId = `fs-${Date.now().toString(36)}-${decoded.sha256.slice(0, 8)}`;
  const base = {
    searchId, ts: new Date().toISOString(), probeSha256: decoded.sha256, probeBytes: decoded.buf.length, probeMime: decoded.mime,
    probeSource: v.samplePerson ? 'sample-capture' : 'upload', samplePerson: v.samplePerson,
    exactParameterMatch: Boolean(v.probeSeed),
    caseNo: v.caseNo, legalBasis: v.legalBasis, officer: who, unit: body.unitId ? String(body.unitId).slice(0, 64) : null,
    filters: v.filters, floor, gate: { mode: gate.mode, passed: gate.passed, reasons: gate.reasons }
  };
  if (!gate.passed) {
    const rec = Object.assign(base, { shortlist: null, candidates: 0, topConfidence: null, topPersonKey: null, decision: 'rejected-by-quality-gate', engine: null });
    await recordSearch(ctx, req, rec);
    return {
      ok: true,
      data: { searchId, decision: 'rejected-by-quality-gate', gate: stripRaw(gate), candidates: [], floor, deadBand: DEAD_BAND, shortlist: null, case: null, probe: { sha256: decoded.sha256, bytes: decoded.buf.length, mime: decoded.mime, descriptor: probeDesc.source, source: base.probeSource, samplePerson: v.samplePerson, exactParameterMatch: Boolean(v.probeSeed) } },
      meta: metaFor(ctx, gate, null, floor, deps, rec)
    };
  }
  const shortlist = await buildShortlist(ctx, v.filters, v.limit);
  // Corroboration evidence the shortlist did NOT consume (rule R6 already
  // bound this search to a case number, so the record is there to be read).
  const caseCtx = await resolveCase(ctx, v.caseNo, await getLookups(ctx));
  const cmp = await compareCandidates(ctx, req, deps, decoded, probeDesc, shortlist, floor, caseCtx);
  const top = cmp.candidates[0] || null;
  const decision = top && top.confidence !== null && top.confidence >= floor ? 'candidates' : 'no-reliable-match';
  const rec = Object.assign(base, {
    shortlist: { count: shortlist.count, narrowed: shortlist.narrowed, withoutGallery: shortlist.withoutGallery, description: shortlist.description },
    shortlistKeys: cmp.candidates.map((c) => c.personKey),
    candidates: cmp.candidates.length,
    topConfidence: top ? top.confidence : null,
    topPersonKey: top ? top.personKey : null,
    decision,
    engine: cmp.primary,
    engines: cmp.engines
  });
  await recordSearch(ctx, req, rec);
  return {
    ok: true,
    data: {
      searchId,
      decision,
      gate: stripRaw(gate),
      floor,
      deadBand: DEAD_BAND,
      candidates: cmp.candidates,
      shortlist: {
        count: shortlist.count, cap: shortlist.cap, narrowed: shortlist.narrowed, withoutGallery: shortlist.withoutGallery,
        filters: shortlist.filters, applied: shortlist.applied, description: shortlist.description, scan: shortlist.scan
      },
      case: caseCtx,
      probe: {
        sha256: decoded.sha256, bytes: decoded.buf.length, mime: decoded.mime,
        width: decoded.size ? decoded.size.width : null, height: decoded.size ? decoded.size.height : null,
        descriptor: probeDesc.source, measured: probeDesc.descriptor && probeDesc.descriptor.measured ? probeDesc.descriptor.measured : (probeDesc.descriptor ? 'spec' : null),
        source: base.probeSource, samplePerson: v.samplePerson,
        // True only on the debug seed path: the figures below are an exact
        // parameter match (1.0 by construction), not a measured similarity.
        exactParameterMatch: Boolean(v.probeSeed)
      },
      noReliableMatch: decision === 'no-reliable-match'
        ? { reason: top && top.confidence !== null ? `top candidate ${top.confidence} is below the floor ${floor}` : (top ? 'no candidate could be scored' : 'no candidate carried a gallery image'), topConfidence: top ? top.confidence : null }
        : null
    },
    meta: metaFor(ctx, gate, cmp, floor, deps, rec)
  };
}

function stripRaw(gate) {
  const g = Object.assign({}, gate);
  delete g.ziaRaw;
  return g;
}

function metaFor(ctx, gate, cmp, floor, deps, rec) {
  const fixture = getFallbackState().active && getFallbackState().datastore;
  return {
    engine: cmp ? cmp.primary : null,
    engines: cmp ? cmp.engines : null,
    source: fixture ? 'fixture' : 'datastore',
    synthetic: true,
    disclaimer: 'Synthetic gallery — generated faces only. A face match is an investigative lead, not evidence of identity.',
    floor,
    deadBand: DEAD_BAND,
    gate: gate.mode,
    ziaMaxCompares: deps.flags && deps.flags.faceId ? ziaMaxCompares() : 0,
    shortlist: rec.shortlist,
    elapsedMs: cmp ? cmp.elapsedMs : 0,
    accountability: { rules: RULES.map((r) => r.id), audit: rec.searchId, officer: rec.officer, caseNo: rec.caseNo, legalBasis: rec.legalBasis, probeStored: false },
    persisted: rec.persisted ? { via: rec.persisted.via, result: rec.persisted.result } : null
  };
}

// ---------------------------------------------------------------------------
// Gallery + model card
// ---------------------------------------------------------------------------

async function galleryPage(ctx, opts) {
  const o = opts || {};
  const page = Math.max(1, toNum(o.page, 1) || 1);
  const perPage = Math.max(1, Math.min(60, toNum(o.perPage, 24) || 24));
  const before = getFallbackState().queries;
  const one = o.personKey && /^[A-Za-z0-9_-]{1,64}$/.test(String(o.personKey)) ? String(o.personKey) : null;
  const rows = await ctx.ds.query({
    table: 'FaceGallery',
    columns: ['PersonKey', 'ObjectKey', 'ThumbKey', 'Source', 'Seed', 'QualityJson', 'Active', 'CREATEDTIME'],
    where: one ? [{ col: 'PersonKey', op: '=', val: one }] : [],
    orderBy: { col: 'PersonKey', tieBreak: 'ObjectKey' },
    limit: { offset: (page - 1) * perPage, count: perPage }
  });
  const countRows = one ? [] : await ctx.ds.query({ table: 'FaceGallery', columns: ['COUNT(PersonKey)'] }).catch(() => []);
  const total = toNum(countRows.length ? countRows[0]['COUNT(PersonKey)'] : rows.length, rows.length);
  const keys = rows.map((r) => String(r.PersonKey));
  const names = new Map();
  if (keys.length) {
    const prof = await ctx.ds.query({ table: 'OffenderProfile', columns: ['PersonKey', 'CanonicalName', 'RiskScore', 'CaseCount'], where: [{ col: 'PersonKey', op: 'in', val: keys }], limit: { count: 200 } }).catch(() => []);
    for (const p of prof) names.set(String(p.PersonKey), p);
  }
  const fixture = getFallbackState().queries > before;
  return {
    items: rows.map((r) => {
      const p = names.get(String(r.PersonKey)) || {};
      const active = r.Active === true || String(r.Active).toLowerCase() === 'true' || String(r.Active) === '1';
      return {
        personKey: String(r.PersonKey), name: p.CanonicalName || null, riskScore: p.RiskScore === undefined ? null : toNum(p.RiskScore, null), caseCount: p.CaseCount === undefined ? null : toNum(p.CaseCount, null),
        objectKey: r.ObjectKey, thumbKey: r.ThumbKey, source: r.Source, seed: r.Seed, quality: parseJsonSafe(r.QualityJson, {}), active,
        thumbUrl: `/identify/thumb/${encodeURIComponent(String(r.PersonKey))}.svg`,
        traits: r.Seed ? spec.traits(spec.specFromSeed(String(r.Seed))) : []
      };
    }),
    total, page, perPage, source: fixture ? 'fixture' : 'datastore'
  };
}

async function thumbSvg(ctx, personKey, size) {
  const rows = await ctx.ds.query({ table: 'FaceGallery', columns: ['Seed', 'Active'], where: [{ col: 'PersonKey', op: '=', val: personKey }], limit: { count: 1 } }).catch(() => []);
  const seed = rows.length && rows[0].Seed ? String(rows[0].Seed) : null;
  const s = Math.max(32, Math.min(512, toNum(size, 96) || 96));
  if (!seed) return { svg: null, source: 'none' };
  return { svg: spec.renderSvg(spec.specFromSeed(seed), s), source: 'gallery-seed', seed };
}

let calibrationMemo = null;

function calibration() {
  if (calibrationMemo) return calibrationMemo;
  try {
    calibrationMemo = JSON.parse(fs.readFileSync(path.join(__dirname, 'face_calibration.json'), 'utf8'));
  } catch (e) {
    calibrationMemo = { available: false, note: 'lib/face_calibration.json missing — run node scripts/faces_calibrate.mjs' };
  }
  return calibrationMemo;
}

function modelCard() {
  const cal = calibration();
  return {
    name: 'DAPPA face identification',
    version: 'phase6-v1',
    floor: floorFor(),
    deadBand: DEAD_BAND,
    engines: [
      { key: 'zia-identity-scanner', name: 'Zia Identity Scanner (compareFace, 1:1)', flag: 'FEATURE_FACE_ID', role: 'comparison for the top-N shortlist candidates when the flag is on', threshold: 'Zia reports matched:"true" above 0.5; DAPPA applies its own floor on top' },
      { key: 'zia-face-analytics', name: 'Zia Face Analytics (analyseFace, mode moderate)', flag: 'FEATURE_FACE_ID', role: 'input quality gate — detection, landmarks, pose; advisory when it cannot see a procedural face' },
      { key: 'local-descriptor', name: 'Local descriptor engine', flag: null, role: 'honest default — cosine similarity over the generator\'s own parameter space (skin, hair, face width/height, jaw, glasses, facial hair, hair mass)' }
    ],
    calibration: cal,
    // Measured on the deployed Development function on 28 Aug 2026 — three
    // pooled Zia calls, verbatim responses in docs/benchmarks/face_zia_probe.json.
    ziaObserved: {
      measuredAt: '2026-08-28',
      calls: 3,
      analyseFace: { ok: false, status: 400, error: 'Please try again later', reading: 'Zia Face Analytics does not detect a face in a procedurally drawn portrait, so the quality gate runs in advisory mode for this gallery.' },
      compareFace: [
        { pair: 'same person (gallery P00001 vs its second capture)', confidence: 0.8407, matched: 'true', verdict: 'accepted — above the 0.70 floor' },
        { pair: 'different people (gallery P00001 vs gallery P00002)', confidence: 0.6171, matched: 'true', verdict: 'refused by the floor — Zia calls it a match at its own 0.5 threshold, DAPPA does not at 0.70' }
      ],
      reading: 'One observed pair each way, not an error rate. It is the evidence for the floor: Zia\'s own threshold accepted two different generated people at 0.617; the published floor of 0.70 is what stopped that becoming a lead on the officer\'s screen.',
      availability: 'In a live 5-candidate search on the same day, 1 of 5 comparisons succeeded and 4 returned the same transient error; those four fell back to the local engine and said so per candidate, and meta.engine reported "mixed".'
    },
    statements: [
      'A face match is an investigative lead, not evidence of identity.',
      'Face comparison systems have documented demographic performance variation (NIST FRVT Part 3, 2019: false-positive rates differ by sex, age and ancestry by one to two orders of magnitude across algorithms); nothing here has been measured on real faces, and no real face is in the gallery.',
      'The gallery is procedural and synthetic: numbers on this card describe how the engines behave on drawn faces, not how they would behave on photographs.',
      'Below the floor the system says "no reliable match"; the dead band under the floor is labelled borderline and never called a match.',
      'Every search is audited with the officer\'s identity, the case number and the legal basis; the probe image is never stored.'
    ],
    limitations: [
      'Zia Face Analytics may not detect procedural faces at all — the quality gate then runs in advisory mode and says so.',
      'The local engine measures four of eleven descriptor dimensions from pixels (skin, hair, width, height); shape, glasses and facial hair are only known for a probe drawn from a gallery seed.',
      'Zia calls are pooled (100/month free tier): a search spends at most FACE_ZIA_MAX_COMPARES (default 5) 1:1 comparisons, cached 24 h by probe hash.',
      'Age and gender filters are resolved through Accused rows by name, not from a face estimate.'
    ]
  };
}

// ---------------------------------------------------------------------------
// Fixture-mode demo answer (no Data Store, no Zia) — deterministic.
// ---------------------------------------------------------------------------

function demoSeedFor(personKey) {
  return `v1:2026:${personKey}`;
}

module.exports = {
  MAX_PROBE_BYTES, MAX_SHORTLIST, DEFAULT_FLOOR, DEAD_BAND, LEGAL_BASES, RULES, RISK_BANDS, AGE_BANDS,
  floorFor, ziaMaxCompares, decodeProbe, specDescriptor, pixelDescriptor, probeDescriptor, similarity, bandFor, openStream, closeStream,
  qualityGate, cleanFilters, buildShortlist, resolveCase, normTag, tagOverlap, compareCandidates, identify, validateSearch,
  recordSearch, listAudit, recordDecision, actorOf, galleryPage, thumbSvg, modelCard, calibration, demoSeedFor, hash32
};
