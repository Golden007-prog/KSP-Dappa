#!/usr/bin/env node
// faces_calibrate.mjs — measure the local face engine on the synthetic gallery
// and publish the numbers the model card shows (Round 2, Phase 6).
//
//   node scripts/faces_calibrate.mjs [--faces pipeline/out/faces] [--floor 0.7]
//
// For every generated person there is a gallery image and a probe (a second
// capture: rotated, rescaled, re-lit, other expression). The script scores
// same-person pairs (probe_i vs gallery_i) and different-person pairs
// (probe_i vs gallery_j) through the three comparison paths the API can take:
//   pixel/pixel — probe pixels vs the gallery image's stored pixel descriptor
//   pixel/spec  — probe pixels vs the gallery seed's parameter descriptor
//   spec/spec   — a probe drawn from a gallery seed vs the gallery seed
// and reports score distributions, false-accept / false-reject rates at a
// sweep of floors and at the configured floor, the equal-error floor, and a
// 25-candidate shortlist rank test (the API's real operating condition).
// Writes functions/dappa_api/lib/face_calibration.json (served by
// GET /identify/model-card) and docs/benchmarks/face_calibration.json.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const require = createRequire(path.join(ROOT, 'functions/dappa_api/package.json'));
const faces = require(path.join(ROOT, 'functions/dappa_api/lib/faces.js'));
const { decodePng } = require(path.join(ROOT, 'functions/dappa_api/lib/png.js'));

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const FACES_DIR = path.resolve(ROOT, opt('--faces', 'pipeline/out/faces'));
const FLOOR = Number(opt('--floor', process.env.FACE_MATCH_FLOOR || '0.7'));
const DEAD_BAND = faces.DEAD_BAND;

const manifest = JSON.parse(fs.readFileSync(path.join(FACES_DIR, 'manifest.json'), 'utf8'));
const people = manifest.faces.filter((f) => fs.existsSync(path.join(FACES_DIR, `${f.personKey}.png`)) && fs.existsSync(path.join(FACES_DIR, 'probes', `${f.personKey}.png`)));
if (people.length < 40) { console.error(`need ≥40 generated faces with probes, found ${people.length} — run python3.12 pipeline/faces_generate.py`); process.exit(2); }

const rows = people.map((f) => {
  const gallery = faces.pixelDescriptor(decodePng(fs.readFileSync(path.join(FACES_DIR, `${f.personKey}.png`))));
  const probe = faces.pixelDescriptor(decodePng(fs.readFileSync(path.join(FACES_DIR, 'probes', `${f.personKey}.png`))));
  return { key: f.personKey, seed: f.seed, spec: faces.specDescriptor(f.seed), gallery, probe };
});
const measured = rows.filter((r) => r.gallery && r.probe);
console.log(`faces: ${people.length} · pixel descriptors measured on both sides: ${measured.length}`);

const OFFSETS = [1, 7, 31, 77, 131];
function pairs(getA, getB) {
  const same = [];
  const diff = [];
  measured.forEach((r, i) => {
    const s = faces.similarity(getA(r), getB(r)).confidence;
    if (s !== null) same.push(s);
    for (const o of OFFSETS) {
      const other = measured[(i + o) % measured.length];
      if (other === r) continue;
      const d = faces.similarity(getA(r), getB(other)).confidence;
      if (d !== null) diff.push(d);
    }
  });
  return { same, diff };
}

function q(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
  return Math.round(s[idx] * 10000) / 10000;
}
function summary(xs) {
  if (!xs.length) return { n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { n: xs.length, min: q(xs, 0), p10: q(xs, 0.1), p25: q(xs, 0.25), median: q(xs, 0.5), p75: q(xs, 0.75), p90: q(xs, 0.9), max: q(xs, 1), mean: Math.round(mean * 10000) / 10000 };
}
function rates(same, diff, floor) {
  const far = diff.length ? diff.filter((d) => d >= floor).length / diff.length : null;
  const frr = same.length ? same.filter((s) => s < floor).length / same.length : null;
  const deadSame = same.length ? same.filter((s) => s < floor && s >= floor - DEAD_BAND).length / same.length : null;
  const deadDiff = diff.length ? diff.filter((d) => d < floor && d >= floor - DEAD_BAND).length / diff.length : null;
  const r4 = (v) => (v === null ? null : Math.round(v * 10000) / 10000);
  return { floor, falseAccept: r4(far), falseReject: r4(frr), sameInDeadBand: r4(deadSame), differentInDeadBand: r4(deadDiff) };
}
function sweep(same, diff) {
  const out = [];
  for (let f = 0.5; f <= 0.951; f += 0.05) out.push(rates(same, diff, Math.round(f * 100) / 100));
  return out;
}
function eer(same, diff) {
  let best = null;
  for (let f = 0.3; f <= 0.99; f += 0.005) {
    const r = rates(same, diff, Math.round(f * 1000) / 1000);
    const gap = Math.abs(r.falseAccept - r.falseReject);
    if (!best || gap < best.gap) best = { floor: r.floor, falseAccept: r.falseAccept, falseReject: r.falseReject, gap };
  }
  return best ? { floor: best.floor, falseAccept: best.falseAccept, falseReject: best.falseReject } : null;
}

function pathReport(name, getA, getB, note) {
  const { same, diff } = pairs(getA, getB);
  return { path: name, note, dims: faces.similarity(getA(measured[0]), getB(measured[0])).dims, samePerson: summary(same), differentPerson: summary(diff), atFloor: rates(same, diff, FLOOR), sweep: sweep(same, diff), equalError: eer(same, diff) };
}

// Shortlist rank test: probe_i against a 25-candidate shortlist that contains
// the true person and 24 deterministic others.
function rankTest(getA, getB) {
  let top1 = 0; let top3 = 0; let noReliable = 0; let trueBelowFloor = 0; let wrongAboveFloor = 0;
  const ranks = [];
  measured.forEach((r, i) => {
    const cands = [r];
    for (let k = 1; cands.length < 25 && k < measured.length; k += 1) cands.push(measured[(i + k * 13) % measured.length]);
    const scored = cands.map((c) => ({ key: c.key, s: faces.similarity(getA(r), getB(c)).confidence ?? -1 })).sort((a, b) => b.s - a.s);
    const rank = scored.findIndex((c) => c.key === r.key) + 1;
    ranks.push(rank);
    if (rank === 1) top1 += 1;
    if (rank <= 3) top3 += 1;
    if (scored[0].s < FLOOR) noReliable += 1;
    const mine = scored.find((c) => c.key === r.key);
    if (mine.s < FLOOR) trueBelowFloor += 1;
    if (scored[0].key !== r.key && scored[0].s >= FLOOR) wrongAboveFloor += 1;
  });
  const n = measured.length;
  const r4 = (v) => Math.round((v / n) * 10000) / 10000;
  return { shortlistSize: 25, probes: n, top1: r4(top1), top3: r4(top3), medianRank: q(ranks, 0.5), noReliableMatchRate: r4(noReliable), truePersonBelowFloor: r4(trueBelowFloor), wrongPersonRankedFirstAboveFloor: r4(wrongAboveFloor) };
}

const report = {
  generatedAt: new Date().toISOString(),
  generator: 'pipeline/faces_generate.py (procedural-v1, seed ' + manifest.seed + ')',
  faces: people.length,
  measured: measured.length,
  floor: FLOOR,
  deadBand: DEAD_BAND,
  pairs: { samePerson: measured.length, differentPerson: measured.length * OFFSETS.length, offsets: OFFSETS },
  method: 'confidence = ((cosine + 1) / 2) ^ 8 over range-scaled, mean-centred descriptor dimensions both sides carry (lib/faces.js similarity, LOCAL_SHARPEN = 8 — a monotone calibration that puts the equal-error region near the 0.7 floor); colours as chromaticity + luminance',
  paths: [
    pathReport('pixel/pixel', (r) => r.probe, (r) => r.gallery, 'probe pixels vs the gallery image\'s stored pixel descriptor (FaceGallery.QualityJson.pixel) — the live path for an arbitrary still'),
    pathReport('pixel/spec', (r) => r.probe, (r) => r.spec, 'probe pixels vs the gallery seed\'s parameter descriptor — the path when a gallery row has no stored pixel descriptor'),
    pathReport('spec/spec', (r) => r.spec, (r) => r.spec, 'a probe drawn from a gallery seed vs the gallery seed — exact parameter space; same-person is 1.0 by construction')
  ],
  rankTest: { 'pixel/pixel': rankTest((r) => r.probe, (r) => r.gallery), 'pixel/spec': rankTest((r) => r.probe, (r) => r.spec) },
  caveats: [
    'Synthetic, procedural faces only: these numbers describe the engine on drawn faces, not on photographs of people.',
    'Twelve skin tones × six hair colours bound what the pixel path can separate: people who share both will score alike, which is why the shortlist filters and the human decision exist.',
    'Different-person pairs are 5 deterministic offsets per probe, not all pairs.'
  ]
};

const outFn = path.join(ROOT, 'functions/dappa_api/lib/face_calibration.json');
const outDoc = path.join(ROOT, 'docs/benchmarks/face_calibration.json');
fs.writeFileSync(outFn, JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(outDoc, JSON.stringify(report, null, 2) + '\n');
for (const p of report.paths) {
  console.log(`${p.path.padEnd(12)} dims ${p.dims} · same median ${p.samePerson.median} (p10 ${p.samePerson.p10}) · different median ${p.differentPerson.median} (p90 ${p.differentPerson.p90}) · at floor ${FLOOR}: FAR ${p.atFloor.falseAccept} FRR ${p.atFloor.falseReject} · EER floor ${p.equalError && p.equalError.floor} (${p.equalError && p.equalError.falseAccept})`);
}
console.log('rank test', JSON.stringify(report.rankTest));
console.log(`written ${path.relative(ROOT, outFn)} and ${path.relative(ROOT, outDoc)}`);
