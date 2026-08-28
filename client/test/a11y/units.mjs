#!/usr/bin/env node
// units.mjs — pure-function checks for the Phase-5 accessibility layer.
// No DOM, no bundler: lib/chartA11y.js and lib/voice.js chunking are plain
// ES modules. Exits 1 on any failed check.
//   cd client && node test/a11y/units.mjs
import { optionToTable, withChartAria, describeChart, shouldDecal } from '../../src/lib/chartA11y.js';
import { chunkText, pickVoice, speechLangFor } from '../../src/lib/voice.js';
import { formatDocumentTitle } from '../../src/lib/a11y.js';

let pass = 0; let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); } else { fail += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};
const t = (key, vars = {}) => `${key}${Object.keys(vars).length ? ` ${JSON.stringify(vars)}` : ''}`;

console.log('chartA11y.optionToTable');
{
  const cat = { xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar'] }, yAxis: { type: 'value' }, series: [{ name: 'FIRs', type: 'bar', data: [10, 12, 9] }, { name: 'Heinous', type: 'line', data: [1, 2, null] }] };
  const tb = optionToTable(cat);
  check('category axis → one row per category', tb && tb.kind === 'category' && tb.rows.length === 3);
  check('category columns = category + series names', tb && tb.columns.join(',') === 'category,FIRs,Heinous');
  check('null point survives as null', tb && tb.rows[2][2] === null);

  const pie = { series: [{ type: 'pie', data: [{ name: 'Theft', value: 40 }, { name: 'Burglary', value: 25 }] }] };
  const pt = optionToTable(pie);
  check('pie → category/value rows', pt && pt.kind === 'pie' && pt.rows.length === 2 && pt.rows[0][1] === 40);

  const heat = { xAxis: { type: 'category', data: ['Mon', 'Tue'] }, yAxis: { type: 'category', data: ['00', '01'] }, series: [{ type: 'heatmap', data: [[0, 1, 7], [1, 0, 3]] }] };
  const ht = optionToTable(heat);
  check('heatmap → x/y/value rows with axis labels', ht && ht.kind === 'heatmap' && ht.rows[0].join('|') === 'Mon|01|7');

  const radar = { radar: { indicator: [{ name: 'A' }, { name: 'B' }] }, series: [{ type: 'radar', data: [{ name: 'S1', value: [1, 2] }] }] };
  const rt = optionToTable(radar);
  check('radar → series × indicator columns', rt && rt.columns.join(',') === 'series,A,B' && rt.rows[0][2] === 2);

  const xy = { xAxis: { type: 'time' }, yAxis: { type: 'value' }, series: [{ type: 'line', data: [['2026-01', 5], ['2026-02', 6]] }] };
  const xt = optionToTable(xy);
  check('[x, y] pairs → x/y rows', xt && xt.kind === 'xy' && xt.rows.length === 2 && xt.rows[1][1] === 6);

  check('no series → null (toggle hidden)', optionToTable({ series: [] }) === null && optionToTable(null) === null);
}

console.log('chartA11y.withChartAria / describeChart');
{
  const two = { xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }, { type: 'bar', data: [2, 1] }] };
  const one = { xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [1, 2] }] };
  check('decal on for two colour-separated bar series', shouldDecal(two) === true);
  check('decal off for a single series', shouldDecal(one) === false);
  const a = withChartAria(two, { description: 'desc' });
  check('aria.enabled + label.description set', a.aria && a.aria.enabled === true && a.aria.label.description === 'desc');
  check('decal patterns attached when needed', Array.isArray(a.aria.decal?.decals) && a.aria.decal.decals.length === 6);
  check('original option untouched (new object)', !two.aria && a !== two);
  const pre = { aria: { enabled: false }, series: [] };
  check('an option that already carries aria is returned as-is', withChartAria(pre) === pre);
  const d = describeChart(one, t, { title: 'FIRs by month' });
  check('description names kind, span and range', /a11y.chart.a11y.head/.test(d) && /span/.test(d) && /range/.test(d), d);
}

console.log('voice.chunkText');
{
  const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} is about twenty five characters.`).join(' ');
  const chunks = chunkText(long);
  check('long prose splits into ≤220-char chunks', chunks.length > 1 && chunks.every((c) => c.length <= 220));
  check('chunks preserve every sentence', chunks.join(' ').replace(/\s+/g, ' ') === long.replace(/\s+/g, ' '));
  const kn = 'ಈ ವಾರ 41 ಪ್ರಕರಣಗಳು ದಾಖಲಾಗಿವೆ। ಸಾಮಾನ್ಯ 18. ಇದು ಹೆಚ್ಚು?';
  const kc = chunkText(kn, 30);
  check('Kannada danda is a sentence boundary; short sentences merge', kc.length === 2 && kc[0].endsWith('।') && kc[1].endsWith('?'), JSON.stringify(kc));
  check('empty text → no chunks', chunkText('').length === 0);
  const hard = 'x'.repeat(500);
  check('a 500-char run without punctuation hard-wraps', chunkText(hard).every((c) => c.length <= 220));
}

console.log('voice.pickVoice / speechLangFor');
{
  const voices = [{ lang: 'en-US', name: 'A' }, { lang: 'en-IN', name: 'B' }, { lang: 'hi-IN', name: 'C' }];
  check('en prefers en-IN', pickVoice('en', voices)?.name === 'B');
  check('kn hides when no Kannada voice (null)', pickVoice('kn', voices) === null);
  check('kn picks kn-IN when present', pickVoice('kn', [...voices, { lang: 'kn-IN', name: 'K' }])?.name === 'K');
  check('speechLangFor maps ui → BCP-47', speechLangFor('kn') === 'kn-IN' && speechLangFor('en') === 'en-IN' && speechLangFor('xx') === 'en-IN');
}

console.log('a11y.formatDocumentTitle');
{
  check('plain', formatDocumentTitle('Alerts') === 'Alerts — KSP DAPPA');
  check('pending count prefix', formatDocumentTitle('Alerts', 7) === '(7) Alerts — KSP DAPPA');
  check('99+ cap', formatDocumentTitle('Alerts', 250) === '(99+) Alerts — KSP DAPPA');
}

console.log(`\nunits: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
