#!/usr/bin/env node
// check_i18n.mjs — key-parity gate for the bilingual UI.
//
// Every namespace under client/src/locales/en must exist in kn with the SAME
// key set. A missing key silently falls back to English at runtime, which
// is the right failure mode for a live demo but hides an untranslated screen
// from the team — this makes it visible.
//
//   node scripts/check_i18n.mjs          # report, exit 1 on any gap
//   node scripts/check_i18n.mjs --quiet  # summary lines only
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOCALES = path.join(ROOT, 'client', 'src', 'locales');
const LANGS = ['en', 'kn'];
const quiet = process.argv.includes('--quiet');

/** Flatten one namespace module into dotted keys (data.js nests id maps). */
function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

async function loadLang(lang) {
  const dir = path.join(LOCALES, lang);
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const ns = file.replace(/\.js$/, '');
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    out[ns] = flatten(mod.default || mod);
  }
  return out;
}

const dicts = {};
for (const lang of LANGS) dicts[lang] = await loadLang(lang);

let problems = 0;
const namespaces = [...new Set(Object.values(dicts).flatMap((d) => Object.keys(d)))].sort();

// 'data' (district / crime-head names) has no English file by design: English
// names come straight from /meta/lookups, so tName() returns the API string.
// It only has to exist and be non-empty.
const NO_EN_BASE = new Set(['data']);

for (const ns of namespaces) {
  if (NO_EN_BASE.has(ns)) {
    const kn = Object.keys(dicts.kn[ns] || {});
    if (!kn.length) {
      problems += 1;
      console.error(`DATA MISSING  ${ns}: kn has no reference names`);
    } else if (!quiet) {
      console.log(`  data namespace: ${kn.length} reference names in kn (English comes from the API)`);
    }
    continue;
  }
  const en = dicts.en[ns];
  if (!en) {
    console.error(`MISSING BASE  ${ns} — exists in a translation but not in en/`);
    problems += 1;
    continue;
  }
  const enKeys = Object.keys(en);
  for (const lang of ['kn']) {
    const other = dicts[lang][ns];
    if (!other) {
      console.error(`MISSING FILE  ${lang}/${ns}.js (en has ${enKeys.length} keys)`);
      problems += 1;
      continue;
    }
    const missing = enKeys.filter((k) => other[k] === undefined);
    const extra = Object.keys(other).filter((k) => en[k] === undefined);
    // An untranslated value identical to English is legitimate for tokens like
    // "CSV" or "DAPPA", but a long sentence that matches exactly is a miss.
    const untranslated = enKeys.filter((k) => typeof en[k] === 'string'
      && other[k] === en[k] && en[k].length > 24);
    if (missing.length || extra.length) problems += 1;
    if (missing.length) console.error(`MISSING KEYS  ${lang}/${ns}: ${missing.length} — ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`);
    if (extra.length) console.error(`EXTRA KEYS    ${lang}/${ns}: ${extra.length} — ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ' …' : ''}`);
    if (untranslated.length && !quiet) console.warn(`  note: ${lang}/${ns} has ${untranslated.length} long value(s) identical to English`);
  }
}

const totals = LANGS.map((l) => `${l}=${Object.values(dicts[l]).reduce((n, d) => n + Object.keys(d).length, 0)}`).join(' ');
console.log(`\ni18n: ${namespaces.length} namespaces · keys ${totals}`);
if (problems) {
  console.error(`i18n FAILED — ${problems} parity problem(s).`);
  process.exit(1);
}
console.log('i18n OK — every English key has a Kannada counterpart.');
