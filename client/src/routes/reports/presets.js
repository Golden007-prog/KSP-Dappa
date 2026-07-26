// /reports — named brief presets.
//
// The builder has grown a lot of state: window, ten section toggles, section
// order, classification, prepared-by, page breaks. A weekly "Range DIG brief"
// and a monthly "Commissioner pack" differ in every one of them, and rebuilding
// either by hand before a meeting is exactly the friction that stops a tool
// being used. A preset captures the whole configuration under a name and
// restores it in one tap.
//
// Data only — no React, no side effects beyond localStorage — so /print/brief
// can read a preset by name from the URL without pulling in the builder.
import { normalizeOrder } from './briefSections.js';
import { normalizeClass } from './classification.js';

const KEY = 'dappa-brief-presets';
const CAP = 10;
const NAME_MAX = 40;

/** Shape one stored preset defensively; returns null for junk. */
function sanitize(p) {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.name || '').trim().slice(0, NAME_MAX);
  if (!name) return null;
  return {
    name,
    windowKey: String(p.windowKey || 'last-7-days'),
    from: String(p.from || '').slice(0, 10),
    to: String(p.to || '').slice(0, 10),
    sections: p.sections && typeof p.sections === 'object' ? { ...p.sections } : {},
    order: normalizeOrder(p.order),
    classification: normalizeClass(p.classification),
    preparedBy: String(p.preparedBy || '').slice(0, 80),
    pageBreaks: !!p.pageBreaks,
  };
}

export function loadPresets() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v.map(sanitize).filter(Boolean).slice(0, CAP) : [];
  } catch {
    return [];
  }
}

function persist(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ }
  return list;
}

/** Add or replace a preset by name; returns the new list. */
export function savePreset(preset) {
  const clean = sanitize(preset);
  if (!clean) return loadPresets();
  const rest = loadPresets().filter((p) => p.name !== clean.name);
  return persist([...rest, clean].slice(-CAP));
}

export function deletePreset(name) {
  return persist(loadPresets().filter((p) => p.name !== String(name)));
}

/** One-line human description of a preset, for the chip tooltip. */
export function describePreset(p, t) {
  const enabled = (p.order || []).filter((k) => p.sections?.[k] !== false).length;
  return t('alerts.presets.describe', {
    win: p.windowKey === 'custom' && p.from ? `${p.from} → ${p.to}` : p.windowKey,
    n: enabled,
    cls: t(`alerts.class.${normalizeClass(p.classification)}.label`),
  });
}
