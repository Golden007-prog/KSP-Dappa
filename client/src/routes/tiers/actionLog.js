// Beat / Station decisions → the Phase-7 action log (POST /alerts/:alertKey/
// actions, functions/dappa_api/lib/routes/actionlog.js) with an honest local
// fallback: when there is no alert to hang the decision on, or the API is
// unreachable / offline, the record is kept in localStorage and the screen
// says "saved on this phone only". Nothing here ever silently drops a reason.
//
//   recordDecision({ alertKey, actionType:'dismiss'|'note', note, unit, tier })
//     → { source: 'api' | 'local', ts, statusUpdated?, error? }
//   lastDecision(unitId) → the newest local record for a unit, or null
import { apiPost } from '../../lib/api.js';

const KEY = 'dappa-tier-actions';
const MAX = 50;

function readAll() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* private mode */ }
}

function remember(entry) {
  writeAll(readAll().concat([entry]));
  return entry;
}

export function lastDecision(unitId) {
  const rows = readAll().filter((r) => !unitId || r.unit === String(unitId));
  return rows.length ? rows[rows.length - 1] : null;
}

/** The API's dismiss contract needs a reason category; a free-text officer
 * reason travels as reason:'other' + note (the endpoint requires the note). */
export async function recordDecision({ alertKey, actionType, note, unit, tier }) {
  const ts = new Date().toISOString();
  const base = { alertKey: alertKey || null, actionType, note: String(note || '').trim(), unit: unit ? String(unit) : '', tier, ts };
  if (!alertKey) return remember({ ...base, source: 'local', why: 'no-alert' });
  try {
    const body = {
      actionType,
      note: base.note,
      unit: base.unit,
      actorRole: tier,
      clientTs: ts,
      source: 'tier-home',
      ...(actionType === 'dismiss' ? { reason: 'other' } : {}),
    };
    const res = await apiPost(`/alerts/${encodeURIComponent(alertKey)}/actions`, body);
    const d = res?.data || {};
    return remember({ ...base, source: 'api', statusUpdated: Boolean(d.statusUpdated), storage: res?.meta?.storage || null });
  } catch (err) {
    return remember({ ...base, source: 'local', why: err?.code || err?.message || 'network' });
  }
}
