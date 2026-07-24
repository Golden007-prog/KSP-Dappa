// /alerts — opt-in notification primitives. WebAudio two-tone chime (no audio
// asset ships in the bundle) + Notification API wrappers that degrade to no-ops
// where the browser lacks support or the user denied permission.

let audioCtx = null;

/** Short two-tone chime. Safe to call from any handler; first call must come
 * from a user gesture so the AudioContext is allowed to start. */
export function playChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [[880, 0], [1174.7, 0.14]].forEach(([freq, dt]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.35);
    });
  } catch {
    /* audio unavailable (headless / autoplay policy) — silently skip */
  }
}

/** True when the Notification API exists at all. */
export function desktopSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Resolve to true only when we may post desktop notifications (asks once). */
export async function ensureDesktopPermission() {
  if (!desktopSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** Fire-and-forget desktop notification (tag-deduped so bursts collapse). */
export function showDesktopNotification(title, body) {
  if (!desktopSupported() || Notification.permission !== 'granted') return;
  try {
    // eslint-disable-next-line no-new
    new Notification(title, { body, tag: 'dappa-alerts', silent: true });
  } catch {
    /* some browsers require a ServiceWorker — degrade silently */
  }
}
