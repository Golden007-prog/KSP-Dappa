#!/usr/bin/env node
// faces_upload.mjs — put the generated synthetic gallery into Catalyst
// (Round 2, Phase 6). Runs against the DEPLOYED API only: the two admin
// endpoints it uses initialise the Catalyst SDK from the request.
//
//   node scripts/faces_upload.mjs --base https://<domain>/server/dappa_api/api/v1 \
//        [--token demo-admin] [--faces pipeline/out/faces] [--limit 200] \
//        [--skip-images] [--skip-rows] [--dry-run]
//
// Steps
//   1. POST /admin/faces/upload for every <PersonKey>.png (512×512, the image
//      of record Zia compares) and thumbs/<PersonKey>.png → Stratus bucket
//      STRATUS_BUCKET under face-gallery/v1/…
//   2. POST /admin/bulk-insert {table:'FaceGallery', rows} in chunks of ≤200 —
//      QualityJson carries the pixel descriptor measured on the PNG (what the
//      local engine compares a probe against), Active as a boolean.
//   3. Prints the `catalyst ds:import` fallback for the same rows.
//
// Idempotency: uploads overwrite the same object key; rows are appended, so
// run the row step once (or truncate FaceGallery in the console first).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const require = createRequire(path.join(ROOT, 'functions/dappa_api/package.json'));
const faces = require(path.join(ROOT, 'functions/dappa_api/lib/faces.js'));
const { decodePng } = require(path.join(ROOT, 'functions/dappa_api/lib/png.js'));

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const has = (name) => args.includes(name);
const BASE = String(opt('--base', process.env.DAPPA_BASE || '')).replace(/\/+$/, '');
const TOKEN = opt('--token', process.env.ADMIN_TOKEN || 'demo-admin');
const FACES_DIR = path.resolve(ROOT, opt('--faces', 'pipeline/out/faces'));
const LIMIT = Number(opt('--limit', '200'));
const DRY = has('--dry-run');
if (!BASE && !DRY) { console.error('--base <deployed API base> is required (e.g. https://project-rainfall-60079891305.development.catalystserverless.in/server/dappa_api/api/v1)'); process.exit(2); }

const manifest = JSON.parse(fs.readFileSync(path.join(FACES_DIR, 'manifest.json'), 'utf8'));
const people = manifest.faces.slice(0, LIMIT);

async function post(p, body) {
  const res = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN }, body: JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

const rows = [];
let uploaded = 0;
let failed = 0;
for (const f of people) {
  const full = fs.readFileSync(path.join(FACES_DIR, `${f.personKey}.png`));
  const thumbPath = path.join(FACES_DIR, 'thumbs', `${f.personKey}.png`);
  const thumb = fs.existsSync(thumbPath) ? fs.readFileSync(thumbPath) : null;
  const d = faces.pixelDescriptor(decodePng(full));
  const pixel = d ? { skin: d.skin, hair: d.hair, aspect: d.aspect, hairFrac: d.hairFrac } : null;
  rows.push({
    PersonKey: f.personKey,
    ObjectKey: f.objectKey,
    ThumbKey: f.thumbKey,
    Source: f.source || 'procedural-v1',
    Seed: f.seed,
    QualityJson: JSON.stringify(Object.assign({}, f.quality || { gate: 'pending', generator: 'procedural-v1', width: manifest.size, height: manifest.size }, { pixel })),
    Active: true
  });
  if (has('--skip-images')) continue;
  for (const [key, buf] of [[f.objectKey, full], [f.thumbKey, thumb]]) {
    if (!buf) continue;
    if (DRY) { console.log(`dry-run  put ${key} (${buf.length} B)`); continue; }
    // eslint-disable-next-line no-await-in-loop
    const r = await post('/admin/faces/upload', { objectKey: key, contentType: 'image/png', base64: buf.toString('base64') });
    if (r.status === 200) uploaded += 1;
    else { failed += 1; console.error(`FAILED ${key}: ${r.status} ${JSON.stringify(r.json && r.json.error)}`); }
  }
  if (!DRY && uploaded % 40 === 0 && uploaded) console.log(`uploaded ${uploaded} objects…`);
}
console.log(`images: ${uploaded} uploaded, ${failed} failed (${has('--skip-images') ? 'skipped' : `${people.length} faces × 2 objects`})`);

if (!has('--skip-rows')) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    if (DRY) { console.log(`dry-run  bulk-insert FaceGallery ${chunk.length} rows`); continue; }
    // eslint-disable-next-line no-await-in-loop
    const r = await post('/admin/bulk-insert', { table: 'FaceGallery', rows: chunk });
    if (r.status === 200) inserted += r.json.data.inserted;
    else console.error(`bulk-insert FAILED: ${r.status} ${JSON.stringify(r.json && r.json.error)}`);
  }
  console.log(`rows: ${inserted} FaceGallery rows inserted through POST /admin/bulk-insert`);
}

// CSV twin for the CLI path (appends — never re-run on a loaded table, see D-018).
const csvPath = path.join(FACES_DIR, 'FaceGallery.upload.csv');
const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
fs.writeFileSync(csvPath, ['PersonKey,ObjectKey,ThumbKey,Source,Seed,QualityJson,Active']
  .concat(rows.map((r) => [r.PersonKey, r.ObjectKey, r.ThumbKey, r.Source, r.Seed, r.QualityJson, r.Active].map(esc).join(',')))
  .join('\n') + '\n');
console.log(`\nfallback (CLI, appends): catalyst ds:import "${path.relative(ROOT, csvPath).replace(/\\/g, '/')}" --table FaceGallery   # answer the Stratus bucket prompt on stdin (D-018), then verify with GET /identify/gallery`);
