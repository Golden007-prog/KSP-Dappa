#!/usr/bin/env node
// check_capabilities.mjs — the capability numbers must agree everywhere.
//
// Source of truth: FEATURES.md, where every entry ends with a capability tag
// `[C1 C4]` (the scored capabilities it delivers substance for), `[infra]`
// (excluded from every count) or `[C6 endpoint]` (backend-only endpoint —
// counted, and named as such so the count can be read either way).
//
// From those tags this script derives the six counts, the overlap matrix,
// the attribution total and the distinct-feature total, and then checks that
// CAPABILITIES.md (scorecard, section headings, what-changed "Now" column,
// overlap matrix, attribution sentence, shortfall section) and README.md
// (challenge-coverage table) state exactly those numbers.
//
//   node scripts/check_capabilities.mjs            # exit 1 on any disagreement
//   node scripts/check_capabilities.mjs --print    # also print the derived numbers + matrix
//
// The 26 Jul 2026 audit had two incompatible versions of CAPABILITIES.md in
// one file (scorecard 121/139 vs body 85/105). This check exists so that
// cannot happen again: a scorecard edit without the matching body edit fails.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const PRINT = process.argv.includes('--print');
const CAPS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
const BAR = 100;

const features = fs.readFileSync(path.join(ROOT, 'FEATURES.md'), 'utf8');
const capabilities = fs.readFileSync(path.join(ROOT, 'CAPABILITIES.md'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

const problems = [];
const fail = (msg) => problems.push(msg);

// ---------------------------------------------------------------- FEATURES.md
const entries = [];
let expectNum = 1;
for (const line of features.split(/\r?\n/)) {
  const m = /^(\d+)\.\s+(.*)$/.exec(line);
  if (!m) continue;
  const n = Number(m[1]);
  if (n !== expectNum) fail(`FEATURES.md: entry ${n} follows ${expectNum - 1} — numbering must be continuous`);
  expectNum = n + 1;
  const tag = /\[((?:C[1-6](?:\s+C[1-6])*(?:\s+endpoint)?)|infra|retired)\]\s*$/.exec(m[2]);
  if (!tag) { fail(`FEATURES.md: entry ${n} has no capability tag ([C1 C4], [C6 endpoint], [infra] or [retired])`); continue; }
  const words = tag[1].split(/\s+/);
  entries.push({ n, caps: words.filter((w) => /^C[1-6]$/.test(w)), infra: words[0] === 'infra', retired: words[0] === 'retired', endpoint: words.includes('endpoint') });
}
const total = entries.length;
const scored = entries.filter((e) => e.caps.length);
const counts = Object.fromEntries(CAPS.map((c) => [c, scored.filter((e) => e.caps.includes(c)).length]));
const matrix = Object.fromEntries(CAPS.map((a) => [a, Object.fromEntries(CAPS.map((b) => [b, scored.filter((e) => e.caps.includes(a) && e.caps.includes(b)).length]))]));
const attributions = CAPS.reduce((s, c) => s + counts[c], 0);
const distinct = scored.length;
const infra = entries.filter((e) => e.infra).length;
const retired = entries.filter((e) => e.retired).length;
const endpoints = scored.filter((e) => e.endpoint).length;
const strict = Object.fromEntries(CAPS.map((c) => [c, 0]));
for (const e of scored) strict[e.caps[0]] += 1; // first tag = strongest capability, by convention

// header count
const header = /\*\*(\d[\d,]*) (?:user-visible |catalogued |cataloged )?features\*\*/i.exec(features);
if (header && Number(header[1].replace(/,/g, '')) !== total) fail(`FEATURES.md header says ${header[1]} features but ${total} entries are numbered`);
// per-area heading counts
let areaSum = 0;
for (const m of features.matchAll(/^## .+? \((\d+)\)\s*$/gm)) areaSum += Number(m[1]);
if (areaSum && areaSum !== total) fail(`FEATURES.md area headings sum to ${areaSum} but ${total} entries are numbered`);

// ---------------------------------------------------------------- CAPABILITIES.md
const num = (s) => Number(String(s).replace(/[,*\s]/g, ''));
for (const c of CAPS) {
  // scorecard row: | **C1** | Name | **240** | 100 | ✅ **PASS** | +140 |
  const row = new RegExp(`^\\|\\s*\\*\\*${c}\\*\\*\\s*\\|[^|]*\\|\\s*\\*\\*?([\\d,]+)\\*\\*?\\s*\\|\\s*(\\d+)\\s*\\|\\s*([^|]*)\\|\\s*([+−-]?\\d+)\\s*\\|`, 'm').exec(capabilities);
  if (!row) { fail(`CAPABILITIES.md: no scorecard row for ${c}`); continue; }
  const stated = num(row[1]);
  const margin = Number(row[4].replace('−', '-'));
  if (stated !== counts[c]) fail(`CAPABILITIES.md scorecard ${c} = ${stated}, FEATURES.md tags give ${counts[c]}`);
  if (margin !== counts[c] - BAR) fail(`CAPABILITIES.md scorecard ${c} margin ${row[4]} ≠ ${counts[c] - BAR}`);
  const pass = counts[c] >= BAR;
  if (pass && !/PASS/.test(row[3])) fail(`CAPABILITIES.md scorecard ${c} verdict should be PASS (${counts[c]} ≥ ${BAR})`);
  if (!pass && /PASS/.test(row[3])) fail(`CAPABILITIES.md scorecard ${c} verdict says PASS but ${counts[c]} < ${BAR}`);
  // section heading: ## C1 — Name · 240 features ✅ PASS (+140)
  const head = new RegExp(`^## ${c} — .+? · ([\\d,]+) features`, 'm').exec(capabilities);
  if (!head) fail(`CAPABILITIES.md: no section heading for ${c}`);
  else if (num(head[1]) !== counts[c]) fail(`CAPABILITIES.md section heading ${c} says ${head[1]} features, tags give ${counts[c]}`);
  // overlap matrix row: | **C1** | 240 | 7 | 52 | 96 | 4 | 22 |
  const mrow = new RegExp(`^\\|\\s*\\*\\*${c}\\*\\*\\s*\\|((?:\\s*\\*{0,2}[\\d,]+\\*{0,2}\\s*\\|){6})\\s*$`, 'm').exec(capabilities);
  if (!mrow) fail(`CAPABILITIES.md: no overlap-matrix row for ${c}`);
  else {
    const cells = mrow[1].split('|').map((x) => x.trim()).filter(Boolean).map(num);
    CAPS.forEach((d, i) => { if (cells[i] !== matrix[c][d]) fail(`CAPABILITIES.md overlap matrix ${c}×${d} = ${cells[i]}, tags give ${matrix[c][d]}`); });
  }
}
// attribution sentence: "**965 attributions across 700 distinct features**"
const attr = /\*\*([\d,]+) attributions across (?:~)?([\d,]+) distinct features\*\*/.exec(capabilities);
if (!attr) fail('CAPABILITIES.md: no "**N attributions across M distinct features**" sentence');
else {
  if (num(attr[1]) !== attributions) fail(`CAPABILITIES.md says ${attr[1]} attributions, tags give ${attributions}`);
  if (num(attr[2]) !== distinct) fail(`CAPABILITIES.md says ${attr[2]} distinct features, tags give ${distinct}`);
}
// shortfall section must list exactly the capabilities below the bar
const short = CAPS.filter((c) => counts[c] < BAR);
const shortSection = /<a id="shortfall"><\/a>[\s\S]*?(?=\n## |$)/.exec(capabilities);
if (!shortSection) fail('CAPABILITIES.md: no <a id="shortfall"></a> section');
else {
  for (const c of CAPS) {
    const listed = new RegExp(`\\|\\s*\\*\\*${c}\\b`).test(shortSection[0]);
    if (listed && !short.includes(c)) fail(`CAPABILITIES.md shortfall lists ${c} but it clears the bar (${counts[c]})`);
    if (!listed && short.includes(c)) fail(`CAPABILITIES.md shortfall omits ${c} (${counts[c]} < ${BAR})`);
  }
  if (!short.length && !/no capability is below the bar|every capability clears/i.test(shortSection[0])) fail('CAPABILITIES.md shortfall section must say that no capability is below the bar');
}
// strict partition sentence, if present: "C1 178, C3 88, C2 66, ..."
const strictLine = /single strongest capability[^\n]*?(C[1-6] [\d,]+(?:, C[1-6] [\d,]+){5})/.exec(capabilities);
if (strictLine) {
  for (const m of strictLine[1].matchAll(/(C[1-6]) ([\d,]+)/g)) if (num(m[2]) !== strict[m[1]]) fail(`CAPABILITIES.md strict partition ${m[1]} = ${m[2]}, tags give ${strict[m[1]]}`);
  // A strict partition assigns each feature exactly once, so its parenthetical
  // total IS the distinct-feature count. Unchecked, it stayed at 324 while the
  // six numbers beside it summed to 412.
  const strictTotal = /single strongest capability[\s\S]{0,400}?\(([\d,]+) distinct features\)/.exec(capabilities);
  if (strictTotal && num(strictTotal[1]) !== distinct) fail(`CAPABILITIES.md strict-partition total is ${strictTotal[1]}, tags give ${distinct}`);
}

// ---------------------------------------------------------------- README.md
for (const c of CAPS) {
  const row = new RegExp(`^\\|\\s*${c} · [^|]*\\|\\s*([\\d,]+)\\s*\\|\\s*([^|]*)\\|`, 'm').exec(readme);
  if (!row) { fail(`README.md: no challenge-coverage row for ${c}`); continue; }
  if (num(row[1]) !== counts[c]) fail(`README.md ${c} = ${row[1]}, tags give ${counts[c]}`);
  const pass = counts[c] >= BAR;
  if (pass && !/clears/.test(row[2])) fail(`README.md ${c} should read "clears 100"`);
  if (!pass && !/short by (\d+)/.test(row[2])) fail(`README.md ${c} should read "short by ${BAR - counts[c]}"`);
}
// The headline sentence carries BOTH totals: "**1,138 cataloged features, 412
// of them analytic.**" An earlier version of this regex required a period
// immediately after "features", so it never matched the real comma form and
// the pair sat at 905/324 — two catalogue revisions stale — while this script
// reported OK. Match the sentence as written and check both halves.
const readmeTotal = /\*\*([\d,]+) cataloged features,\s*([\d,]+) of them analytic\.\*\*/.exec(readme);
if (!readmeTotal) fail('README.md: no "**N cataloged features, M of them analytic.**" headline');
else {
  if (num(readmeTotal[1]) !== total) fail(`README.md says ${readmeTotal[1]} cataloged features, FEATURES.md has ${total}`);
  if (num(readmeTotal[2]) !== distinct) fail(`README.md says ${readmeTotal[2]} analytic, tags give ${distinct}`);
}
// The body repeats the same split in prose; keep it tied to the tags too.
const readmeSplit = /Of the ([\d,]+) catalogued entries, ([\d,]+) deliver analytic[\s\S]{0,80}?and ([\d,]+) are enabling/.exec(readme);
if (readmeSplit) {
  if (num(readmeSplit[1]) !== total) fail(`README.md prose says ${readmeSplit[1]} catalogued entries, tags give ${total}`);
  if (num(readmeSplit[2]) !== distinct) fail(`README.md prose says ${readmeSplit[2]} analytic, tags give ${distinct}`);
  if (num(readmeSplit[3]) !== infra) fail(`README.md prose says ${readmeSplit[3]} infrastructure, tags give ${infra}`);
}

// ---------------------------------------------------------------- docs/capability_counts.json
// The deck (scripts/deck_content.py) and any generated copy read this file, so the
// numbers a judge sees on a slide are the numbers the tags produce.
const countsPath = path.join(ROOT, 'docs/capability_counts.json');
const countsDoc = {
  generatedFrom: 'FEATURES.md capability tags via scripts/check_capabilities.mjs',
  bar: BAR, total, scored: distinct, endpoints, infra, retired, attributions,
  counts, strictPartition: strict, overlap: matrix,
  verdicts: Object.fromEntries(CAPS.map((c) => [c, counts[c] >= BAR ? 'PASS' : `SHORT BY ${BAR - counts[c]}`])),
};
const countsNext = JSON.stringify(countsDoc, null, 2) + '\n';
const WRITE = process.argv.includes('--write');
if (WRITE) fs.writeFileSync(countsPath, countsNext);
else if (!fs.existsSync(countsPath) || fs.readFileSync(countsPath, 'utf8') !== countsNext) fail('docs/capability_counts.json is stale — run `node scripts/check_capabilities.mjs --write`');

// ---------------------------------------------------------------- report
if (PRINT || problems.length) {
  console.log(`FEATURES.md: ${total} entries · ${distinct} scored (${endpoints} backend-only endpoints) · ${infra} infrastructure · ${retired} retired · ${attributions} attributions`);
  console.log('counts: ' + CAPS.map((c) => `${c}=${counts[c]}`).join(' '));
  console.log('strict partition (first tag): ' + CAPS.map((c) => `${c}=${strict[c]}`).join(' '));
  console.log('overlap matrix (row ∩ col):');
  for (const a of CAPS) console.log('  ' + a + ' | ' + CAPS.map((b) => String(matrix[a][b]).padStart(4)).join(''));
}
if (problems.length) {
  for (const p of problems) console.error('MISMATCH  ' + p);
  console.error(`capability consistency FAILED — ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`capability consistency OK — ${CAPS.map((c) => `${c} ${counts[c]}`).join(' · ')} agree across FEATURES.md, CAPABILITIES.md and README.md`);
