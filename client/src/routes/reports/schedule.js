// Report-schedule model for the visual-only scheduling card on /reports —
// persisted client-side (localStorage) and deliberately NOT wired to the API
// yet; the /admin console will own real delivery later. Pure helpers: load /
// save, next-run computation, and a human-readable description.
const KEY = 'dappa-report-schedule';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const DEFAULT_SCHEDULE = {
  enabled: false,
  freq: 'weekly', // 'weekly' | 'monthly'
  weekday: 1, // Monday (JS getDay order)
  monthday: 1, // 1–28 so every month qualifies
  time: '08:00',
  recipients: [],
};

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

const clampInt = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : fallback;
};

export function loadSchedule() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (!v || typeof v !== 'object') return { ...DEFAULT_SCHEDULE };
    return {
      enabled: !!v.enabled,
      freq: v.freq === 'monthly' ? 'monthly' : 'weekly',
      weekday: clampInt(v.weekday, 0, 6, DEFAULT_SCHEDULE.weekday),
      monthday: clampInt(v.monthday, 1, 28, DEFAULT_SCHEDULE.monthday),
      time: /^\d{2}:\d{2}$/.test(String(v.time || '')) ? v.time : DEFAULT_SCHEDULE.time,
      recipients: Array.isArray(v.recipients) ? v.recipients.filter(isEmail).slice(0, 12) : [],
    };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
}

export function saveSchedule(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

/** Next occurrence of the schedule after `now` (Date), or null when disabled. */
export function nextRun(s, now = new Date()) {
  if (!s?.enabled) return null;
  const [hh, mm] = String(s.time || '08:00').split(':').map(Number);
  if (s.freq === 'monthly') {
    const d = new Date(now.getFullYear(), now.getMonth(), s.monthday, hh, mm, 0, 0);
    if (d <= now) d.setMonth(d.getMonth() + 1);
    return d;
  }
  // weekly: scan today + the next 7 days for the target weekday/time
  for (let i = 0; i <= 7; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh, mm, 0, 0);
    if (d.getDay() === s.weekday && d > now) return d;
  }
  return null;
}

export function describeSchedule(s) {
  const when = s.freq === 'monthly'
    ? `Monthly on day ${s.monthday} at ${s.time}`
    : `Every ${WEEKDAYS[s.weekday]} at ${s.time}`;
  const who = s.recipients.length
    ? `${s.recipients.length} recipient${s.recipients.length === 1 ? '' : 's'}`
    : 'no recipients yet';
  return `${when} · ${who}`;
}
