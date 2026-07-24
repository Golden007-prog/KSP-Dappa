// Clipboard helper shared by the copilot (copy answer / transcript) and the
// Reports share-summary button — both route folders belong to the same owner,
// and shared components/lib are off-limits to route fillers.

/** Copy text to the clipboard; resolves true on success. Falls back to a
 * hidden textarea + execCommand for non-secure contexts. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
