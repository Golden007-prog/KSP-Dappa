// Bilingual UI (English · ಕನ್ನಡ) — zero-dependency i18n core.
//
// Dictionaries live in src/locales/<lang>/<namespace>.js and are picked up
// automatically by import.meta.glob, so a route owner adds a namespace file
// without touching any registry. Keys are namespaced by filename:
// locales/kn/dashboard.js exporting { title: '…' } answers t('dashboard.title').
//
// Lookup order: active language → English → the key itself (dev warns once).
//
// Dictionaries are code-split PER LANGUAGE and awaited before the first render
// (main.jsx calls initI18n()). Eager-importing both languages put 1.2 MB of
// string source — 444 KB en + 788 KB kn — into the entry chunk, which every
// visitor downloaded to read one of them. Now a visitor fetches English (the
// fallback chain needs it) plus their own language, and switching language
// fetches the other one once. The glob is still exhaustive, so a malformed
// locale file is still a build error, not a runtime surprise.
//
// Script support is font-stack-only (tailwind.config.js) — Nirmala UI on
// Windows, Noto Sans Kannada on Android/Linux, Kannada Sangam MN on Apple.
// No webfont downloads: the organizer rules forbid external network calls and
// per-glyph fallback keeps Latin text on Inter regardless of language.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setFormatLocale } from './format.js';

export const LANGS = [
  { code: 'en', label: 'English', native: 'English', short: 'EN' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', short: 'ಕ' },
];
export const LANG_CODES = LANGS.map((l) => l.code);
const STORAGE_KEY = 'dappa-lang';

const modules = import.meta.glob('../locales/*/*.js');

/** { en: {'dashboard.title': '…'}, kn: {…} } — filled by loadLang(). */
const DICTS = Object.fromEntries(LANG_CODES.map((c) => [c, {}]));
const loaded = new Map();

/** Fetch and flatten every namespace of one language. Idempotent and cached;
 *  concurrent callers share one promise. */
export function loadLang(lang) {
  if (!LANG_CODES.includes(lang)) return Promise.resolve();
  if (loaded.has(lang)) return loaded.get(lang);
  const jobs = [];
  for (const [path, load] of Object.entries(modules)) {
    const m = /\/locales\/([a-z]{2})\/([A-Za-z0-9_-]+)\.js$/.exec(path);
    if (!m || m[1] !== lang) continue;
    const ns = m[2];
    jobs.push(load().then((mod) => {
      const entries = (mod && (mod.default || mod)) || {};
      for (const [k, v] of Object.entries(entries)) {
        // `data.js` holds nested id→name maps; everything else is flat strings.
        DICTS[lang][`${ns}.${k}`] = v;
      }
    }));
  }
  const p = Promise.all(jobs).then(() => undefined);
  loaded.set(lang, p);
  return p;
}

/** Awaited by main.jsx before the first render: English is the fallback chain,
 *  so it is always loaded; the visitor's language comes with it. */
export function initI18n() {
  const lang = readStoredLang();
  return Promise.all([loadLang('en'), loadLang(lang)]).then(() => lang);
}

const warned = new Set();

/** Resolve a namespaced key with {var} interpolation. */
export function translate(lang, key, vars) {
  const k = String(key);
  let val = DICTS[lang] && DICTS[lang][k];
  if (val === undefined) val = DICTS.en[k];
  if (val === undefined) {
    if (import.meta.env.DEV && !warned.has(k)) { warned.add(k); console.warn(`[i18n] missing key: ${k}`); }
    // Last resort: the final segment, de-slugged — never a raw key in the UI.
    const tail = k.split('.').pop() || k;
    val = tail.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    val = val.charAt(0).toUpperCase() + val.slice(1);
  }
  if (typeof val !== 'string') return val;
  if (!vars) return val;
  return val.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? m : String(vars[name])));
}

function readStoredLang() {
  try {
    const url = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search);
    const q = url.get('lang');
    if (q && LANG_CODES.includes(q)) return q;
  } catch { /* ignore */ }
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s && LANG_CODES.includes(s)) return s;
  } catch { /* storage unavailable */ }
  try {
    const nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (LANG_CODES.includes(nav)) return nav;
  } catch { /* ignore */ }
  return 'en';
}

const LangCtx = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readStoredLang);
  // Bumped when a lazily fetched dictionary lands, so the tree re-renders with
  // the new strings. Until then translate() falls back to English rather than
  // showing a raw key.
  const [, setDictTick] = useState(0);

  useEffect(() => {
    let alive = true;
    loadLang(lang).then(() => { if (alive) setDictTick((n) => n + 1); });
    return () => { alive = false; };
  }, [lang]);

  useEffect(() => {
    setFormatLocale(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dataset.lang = lang;
    }
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  const setLang = useCallback((next) => {
    if (LANG_CODES.includes(next)) setLangState(next);
  }, []);

  const value = useMemo(() => ({
    lang,
    setLang,
    langs: LANGS,
    t: (key, vars) => translate(lang, key, vars),
    /** Translate an API-supplied name by id, falling back to the API string.
     * Ids are normalised ('0101' and '101' both hit the same entry — the API
     * pads district ids in filter URLs but not in /meta/lookups). */
    tName: (kind, id, fallback) => {
      if (lang === 'en') return fallback || '';
      const map = translate(lang, `data.${kind}`);
      if (!map || typeof map !== 'object') return fallback || '';
      const raw = String(id ?? '');
      const hit = map[raw] !== undefined ? map[raw] : map[raw.replace(/^0+(?=\d)/, '')];
      return hit || fallback || '';
    },
  }), [lang, setLang]);

  // Remounting on language change is deliberate: formatters read a module-level
  // locale, so a subtree that does not consume this context would otherwise
  // keep stale number/date formats until its next unrelated re-render.
  return <LangCtx.Provider value={value}><div key={lang} className="contents">{children}</div></LangCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(LangCtx);
  if (ctx) return ctx;
  // Safe default for anything rendered outside the provider (tests, print page).
  return {
    lang: 'en',
    setLang: () => {},
    langs: LANGS,
    t: (key, vars) => translate('en', key, vars),
    tName: (kind, id, fallback) => fallback || '',
  };
}

/** Most components only need the translator: `const t = useT();` */
export function useT() {
  return useI18n().t;
}

/** Data-name translator for API-supplied district / crime-head names. */
export function useNames() {
  return useI18n().tName;
}
