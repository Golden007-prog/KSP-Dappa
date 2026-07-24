// GeoIntel-local persisted preferences (localStorage, defensive JSON).
// Keeps layer toggles + playback speed across sessions; the zustand store
// already keeps them across in-session navigation.
const KEY = 'dappa.geointel.prefs';

export function loadPrefs() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

export function savePrefs(patch) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* storage full / privacy mode — prefs just don't persist */
  }
}
