#!/usr/bin/env node
// fix_bools.mjs — Catalyst Data Store Boolean columns reject 1/0 on bulk import
// ("Invalid input value for Active. Please give a correct boolean value").
// Rewrites the boolean columns of affected pipeline/out CSVs to true/false,
// emitting to pipeline/.bool_fixed/<Table>.csv (originals untouched).
// Affected tables/columns per docs/SCHEMA_CHECKLIST.md.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'pipeline', 'out');
const FIXED = path.join(ROOT, 'pipeline', '.bool_fixed');

const BOOL_COLS = {
  State: ['Active'],
  District: ['Active'],
  UnitType: ['Active'],
  Unit: ['Active'],
  Rank: ['Active'],
  Designation: ['Active'],
  CrimeHead: ['Active'],
  Act: ['Active'],
  Section: ['Active'],
  Court: ['Active'],
  Employee: ['PhysicallyChallenged'],
  ArrestSurrender: ['IsAccused', 'IsComplainantAccused'],
};

fs.mkdirSync(FIXED, { recursive: true });
for (const [table, cols] of Object.entries(BOOL_COLS)) {
  const src = path.join(OUT, table + '.csv');
  if (!fs.existsSync(src)) { console.log(`skip ${table} (no csv)`); continue; }
  const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);
  const header = lines[0].split(',');
  const idx = cols.map((c) => header.indexOf(c));
  if (idx.some((i) => i < 0)) { console.log(`skip ${table} (col not found)`); continue; }
  for (let l = 1; l < lines.length; l++) {
    if (!lines[l]) continue;
    const parts = lines[l].split(',');
    for (const i of idx) {
      if (parts[i] === '1') parts[i] = 'true';
      else if (parts[i] === '0') parts[i] = 'false';
    }
    lines[l] = parts.join(',');
  }
  fs.writeFileSync(path.join(FIXED, table + '.csv'), lines.join('\n'));
  console.log(`fixed ${table} (${cols.join(',')}) rows=${lines.filter(Boolean).length - 1}`);
}
