// Alias-resolution confidence heuristic for the Offender views. The pipeline's
// true match scores are not exposed by the API, so the UI computes a
// deterministic client-side proxy: normalized edit similarity between the
// alias and the canonical name, blended with token overlap (with an initials
// bonus so 'R Kumar' scores against 'Ravi Kumar'). Clearly labelled a
// heuristic wherever rendered.

function levenshtein(a, b) {
  const m = a.length; const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** 0–1 confidence that `alias` refers to the same person as `canonical`. */
export function aliasConfidence(alias, canonical) {
  const a = String(alias || '').toLowerCase().trim();
  const c = String(canonical || '').toLowerCase().trim();
  if (!a || !c) return 0;
  if (a === c) return 1;
  const editSim = 1 - levenshtein(a, c) / Math.max(a.length, c.length);
  const at = a.split(/\s+/).filter(Boolean);
  const ct = new Set(c.split(/\s+/).filter(Boolean));
  let hit = 0;
  for (const t of at) {
    if (ct.has(t)) hit += 1;
    else if (t.length === 1 && [...ct].some((x) => x.startsWith(t))) hit += 0.6;
    else if ([...ct].some((x) => x.startsWith(t) || t.startsWith(x))) hit += 0.4;
  }
  const tokenSim = hit / Math.max(at.length, ct.size);
  return Math.max(0, Math.min(1, 0.55 * editSim + 0.45 * tokenSim));
}

/**
 * A confirmed face-search lead for the same person (routes/identify) raises
 * the alias score toward 1 by 60 % of the remaining gap, scaled by the face
 * confidence — never to 1 on its own — and carries the reason code
 * 'face-corroborated' so the chip can say why. No face figure, no boost.
 */
export function faceCorroborated(conf, faceConf) {
  const c = Math.max(0, Math.min(1, Number(conf) || 0));
  const f = Number(faceConf);
  if (!Number.isFinite(f) || f <= 0) return { conf: c, reasons: [] };
  return { conf: Math.min(1, c + (1 - c) * Math.max(0, Math.min(1, f)) * 0.6), reasons: ['face-corroborated'], face: f };
}

/** Confidence → display band: a stable id (the caller translates it through
 *  network.confidence.<id>) plus a text color class for inline percentages. */
export function confidenceBand(conf) {
  const n = Number(conf) || 0;
  if (n >= 0.72) return { id: 'high', text: 'text-teal' };
  if (n >= 0.45) return { id: 'med', text: 'text-amber' };
  return { id: 'low', text: 'text-muted' };
}
