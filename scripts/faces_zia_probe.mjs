#!/usr/bin/env node
// faces_zia_probe.mjs — exercise Zia Face Analytics + Identity Scanner on the
// procedural faces through the deployed admin endpoint and print what came
// back VERBATIM (Round 2, Phase 6; the numbers go into
// docs/round2/decisions-phase6.md). Budget: ≤4 analyseFace + ≤4 compareFace
// calls — eight of the pooled 100 free Zia calls a month.
//
//   node scripts/faces_zia_probe.mjs --base https://<domain>/server/dappa_api/api/v1 [--token demo-admin]
//        [--faces pipeline/out/faces] [--keys P00001,P00002] [--out <file.json>]
//
// analyse : gallery P00001, gallery P00002, probe P00001, probe P00002
// compare : (gallery P00001, probe P00001) same person · (gallery P00001, gallery P00002) different
//           (gallery P00002, probe P00002) same person · (probe P00001, gallery P00002) different
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const BASE = String(opt('--base', process.env.DAPPA_BASE || '')).replace(/\/+$/, '');
const TOKEN = opt('--token', process.env.ADMIN_TOKEN || 'demo-admin');
const FACES_DIR = path.resolve(ROOT, opt('--faces', 'pipeline/out/faces'));
const [K1, K2] = String(opt('--keys', 'P00001,P00002')).split(',');
const OUT = opt('--out', path.join(ROOT, 'docs/benchmarks/face_zia_probe.json'));
if (!BASE) { console.error('--base <deployed API base> is required'); process.exit(2); }

const img = (rel) => fs.readFileSync(path.join(FACES_DIR, rel)).toString('base64');
const g1 = img(`${K1}.png`);
const g2 = img(`${K2}.png`);
const p1 = img(`probes/${K1}.png`);
const p2 = img(`probes/${K2}.png`);

const body = {
  mode: 'moderate',
  analyse: [
    { label: `gallery ${K1}`, image: g1 },
    { label: `gallery ${K2}`, image: g2 },
    { label: `probe ${K1}`, image: p1 },
    { label: `probe ${K2}`, image: p2 }
  ],
  pairs: [
    { label: `same person: gallery ${K1} vs probe ${K1}`, a: g1, b: p1 },
    { label: `different: gallery ${K1} vs gallery ${K2}`, a: g1, b: g2 },
    { label: `same person: gallery ${K2} vs probe ${K2}`, a: g2, b: p2 },
    { label: `different: probe ${K1} vs gallery ${K2}`, a: p1, b: g2 }
  ]
};

const t0 = Date.now();
const res = await fetch(`${BASE}/admin/faces/zia-probe`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN }, body: JSON.stringify(body) });
const text = await res.text();
let json = null;
try { json = JSON.parse(text); } catch { /* keep text */ }
const record = { ranAt: new Date().toISOString(), base: BASE, status: res.status, ms: Date.now() - t0, response: json || text };
fs.writeFileSync(OUT, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
console.log(`\nwritten ${path.relative(ROOT, OUT)}`);
