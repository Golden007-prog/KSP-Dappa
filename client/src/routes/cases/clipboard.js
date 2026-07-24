// Clipboard helper — navigator.clipboard first, hidden-textarea fallback for
// non-secure contexts (Catalyst preview over plain http). Resolves true/false;
// callers toast the outcome.
export async function copyText(text) {
  const s = String(text ?? '');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(s);
      return true;
    } catch { /* fall through to legacy path */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
