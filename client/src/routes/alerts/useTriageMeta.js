// /alerts — per-alert triage metadata this console owns: a free-text note, an
// assigned owner, and an append-only audit trail of what happened to the alert
// while an officer worked it.
//
// Persisted to localStorage under the existing 'dappa-*' convention rather than
// written back to AnomalyAlert: the table has no Note/Owner/Audit columns and
// route fillers do not get to migrate the schema. The trail is still real —
// every entry is a timestamped action the user actually took in this console —
// and it survives reloads, which is what makes the SLA story defensible.
import { useCallback, useState } from 'react';

const KEY = 'dappa-alerts-triage';
/** Alerts we keep metadata for. Oldest-touched entries are pruned past this. */
const CAP = 300;
/** Audit entries kept per alert. */
const EVENT_CAP = 24;
const NOTE_MAX = 400;
const OWNER_MAX = 48;

/** Every action the trail can record — each has a locale key alerts.audit.<k>. */
export const AUDIT_KINDS = [
  'seen', 'read', 'note', 'owner', 'snooze', 'unsnooze', 'ack', 'dismiss', 'copy', 'digest',
];

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function save(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

const blank = () => ({ note: '', owner: '', events: [], touched: 0 });

/** Drop the least-recently-touched entries once the map outgrows CAP. */
function prune(map) {
  const keys = Object.keys(map);
  if (keys.length <= CAP) return map;
  const ordered = keys.sort((a, b) => (map[a]?.touched || 0) - (map[b]?.touched || 0));
  const out = { ...map };
  for (const k of ordered.slice(0, keys.length - CAP)) delete out[k];
  return out;
}

export function useTriageMeta() {
  const [map, setMap] = useState(load);

  const patch = useCallback((alertId, fn) => {
    const id = String(alertId || '');
    if (!id) return;
    setMap((prev) => {
      const cur = prev[id] || blank();
      const next = fn(cur);
      if (!next) return prev;
      const merged = prune({ ...prev, [id]: { ...next, touched: Date.now() } });
      save(merged);
      return merged;
    });
  }, []);

  /** Read-only accessor — always returns a usable object. */
  const metaFor = useCallback((alertId) => map[String(alertId || '')] || blank(), [map]);

  const setNote = useCallback((alertId, text) => {
    const note = String(text || '').slice(0, NOTE_MAX);
    patch(alertId, (cur) => ({
      ...cur,
      note,
      events: note && note !== cur.note
        ? [...cur.events, { k: 'note', ts: Date.now() }].slice(-EVENT_CAP)
        : cur.events,
    }));
  }, [patch]);

  const setOwner = useCallback((alertId, name) => {
    const owner = String(name || '').trim().slice(0, OWNER_MAX);
    patch(alertId, (cur) => ({
      ...cur,
      owner,
      events: owner !== cur.owner
        ? [...cur.events, { k: 'owner', ts: Date.now(), v: owner }].slice(-EVENT_CAP)
        : cur.events,
    }));
  }, [patch]);

  /** Append one audit entry. Repeat 'seen'/'read' entries are collapsed. */
  const logEvent = useCallback((alertId, kind, value) => {
    if (!AUDIT_KINDS.includes(kind)) return;
    patch(alertId, (cur) => {
      if ((kind === 'seen' || kind === 'read') && cur.events.some((e) => e.k === kind)) return null;
      return { ...cur, events: [...cur.events, { k: kind, ts: Date.now(), v: value }].slice(-EVENT_CAP) };
    });
  }, [patch]);

  /** Distinct owner names already used — powers the assignment datalist. */
  const owners = Object.values(map)
    .map((m) => m?.owner)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort();

  /** ids that carry a note — the feed shows a marker for these. */
  const notedIds = new Set(Object.entries(map).filter(([, m]) => m?.note).map(([id]) => id));

  const clearAll = useCallback(() => {
    setMap({});
    save({});
  }, []);

  return { metaFor, setNote, setOwner, logEvent, owners, notedIds, clearAll };
}
