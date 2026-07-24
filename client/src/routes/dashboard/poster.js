// Dashboard poster export — composes a shareable PNG "situation poster"
// entirely client-side on a canvas: header + filter context, KPI blocks, the
// live trend and category-share chart images (ECharts getDataURL), district
// movers and the open-alert digest. No external services, no new deps.
// Command-center dark look on purpose — posters are a single committed style.

const C = {
  bg: '#0B1220',
  panel: '#111A2C',
  grid: '#1E2A44',
  ink: '#E6EAF2',
  muted: '#8A94A8',
  amber: '#F5A623',
  red: '#E5484D',
  teal: '#2DD4BF',
};

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx, text, maxWidth) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= maxWidth) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * buildDashboardPoster(input) → Promise<dataURL|null>.
 * input: { filterSummary, generatedAt, kpis:[{label, value, delta?, tone?}],
 *   trendImg?, donutImg?, movers:[{name, deltaPct, caseCount}],
 *   alertLine?, footnote? }
 */
export async function buildDashboardPoster({
  filterSummary = '', generatedAt = '', kpis = [], trendImg = null, donutImg = null,
  movers = [], alertLine = '', footnote = 'Synthetic demonstration data',
} = {}) {
  const W = 1200;
  const PAD = 48;
  const innerW = W - PAD * 2;

  const [trend, donut] = await Promise.all([loadImage(trendImg), loadImage(donutImg)]);

  const kpiH = kpis.length ? 128 : 0;
  const trendH = trend ? Math.min(430, Math.round((innerW * trend.height) / trend.width)) : 0;
  const donutW = 480;
  const donutH = donut ? Math.min(360, Math.round((donutW * donut.height) / donut.width)) : 0;
  const moversH = movers.length ? 34 + movers.length * 30 : 0;
  const bottomBlockH = Math.max(donut ? donutH + 34 : 0, moversH);

  let H = 170; // header
  if (kpiH) H += kpiH + 26;
  if (trendH) H += trendH + 60;
  if (bottomBlockH) H += bottomBlockH + 26;
  if (alertLine) H += 44;
  H += 78; // footer

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = C.amber;
  ctx.fillRect(PAD, 58, 5, 46);
  ctx.fillStyle = C.ink;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText('KSP DAPPA — Command Dashboard', PAD + 20, 92);
  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(truncate(ctx, filterSummary, innerW - 240), PAD + 20, 122);
  ctx.textAlign = 'right';
  ctx.fillText(generatedAt, W - PAD, 92);
  ctx.textAlign = 'left';
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 150);
  ctx.lineTo(W - PAD, 150);
  ctx.stroke();

  let y = 176;

  // KPI blocks
  if (kpis.length) {
    const gap = 16;
    const bw = (innerW - gap * (kpis.length - 1)) / kpis.length;
    kpis.forEach((k, i) => {
      const x = PAD + i * (bw + gap);
      ctx.fillStyle = C.panel;
      roundRect(ctx, x, y, bw, kpiH, 12);
      ctx.fill();
      ctx.strokeStyle = C.grid;
      ctx.stroke();
      ctx.fillStyle = k.tone === 'red' ? C.red : k.tone === 'teal' ? C.teal : C.amber;
      ctx.fillRect(x, y + 12, 3, kpiH - 24);
      ctx.fillStyle = C.muted;
      ctx.font = `600 12px ${FONT}`;
      ctx.fillText(truncate(ctx, String(k.label || '').toUpperCase(), bw - 32), x + 18, y + 34);
      ctx.fillStyle = C.ink;
      ctx.font = `700 32px ${FONT}`;
      ctx.fillText(truncate(ctx, String(k.value ?? '—'), bw - 32), x + 18, y + 76);
      if (k.delta) {
        ctx.font = `600 14px ${FONT}`;
        ctx.fillStyle = k.delta.startsWith('▼') ? C.teal : k.delta.startsWith('▲') ? C.red : C.muted;
        ctx.fillText(truncate(ctx, k.delta, bw - 32), x + 18, y + 102);
      }
    });
    y += kpiH + 26;
  }

  const sectionLabel = (text, atY) => {
    ctx.fillStyle = C.muted;
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(text.toUpperCase(), PAD, atY);
  };

  // trend chart
  if (trend) {
    sectionLabel('12-month trend by crime head', y + 6);
    ctx.drawImage(trend, PAD, y + 18, innerW, trendH);
    ctx.strokeStyle = C.grid;
    ctx.strokeRect(PAD, y + 18, innerW, trendH);
    y += trendH + 60;
  }

  // donut + movers
  if (donut || movers.length) {
    const rowTop = y;
    if (donut) {
      sectionLabel('Category share', rowTop + 6);
      ctx.drawImage(donut, PAD, rowTop + 18, donutW, donutH);
      ctx.strokeStyle = C.grid;
      ctx.strokeRect(PAD, rowTop + 18, donutW, donutH);
    }
    if (movers.length) {
      const mx = donut ? PAD + donutW + 40 : PAD;
      sectionLabel('District movers — month over month', rowTop + 6);
      ctx.font = `400 15px ${FONT}`;
      movers.forEach((m, i) => {
        const my = rowTop + 44 + i * 30;
        ctx.fillStyle = C.muted;
        ctx.fillText(`${i + 1}.`, mx, my);
        ctx.fillStyle = C.ink;
        ctx.fillText(truncate(ctx, m.name, 300), mx + 28, my);
        const d = Number(m.deltaPct);
        ctx.fillStyle = Number.isFinite(d) ? (d >= 0 ? C.red : C.teal) : C.muted;
        ctx.fillText(Number.isFinite(d) ? `${d >= 0 ? '▲' : '▼'}${Math.abs(d).toFixed(1)}%` : '—', mx + 344, my);
        ctx.fillStyle = C.muted;
        ctx.fillText(`${m.caseCount ?? ''}`, mx + 440, my);
      });
    }
    y += bottomBlockH + 26;
  }

  // alerts line
  if (alertLine) {
    ctx.fillStyle = C.panel;
    roundRect(ctx, PAD, y, innerW, 34, 8);
    ctx.fill();
    ctx.strokeStyle = C.grid;
    ctx.stroke();
    ctx.fillStyle = C.red;
    ctx.beginPath();
    ctx.arc(PAD + 18, y + 17, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText(truncate(ctx, alertLine, innerW - 60), PAD + 34, y + 22);
    y += 44;
  }

  // footer
  ctx.strokeStyle = C.grid;
  ctx.beginPath();
  ctx.moveTo(PAD, H - 52);
  ctx.lineTo(W - PAD, H - 52);
  ctx.stroke();
  ctx.fillStyle = C.muted;
  ctx.font = `400 13px ${FONT}`;
  ctx.fillText(`Generated ${generatedAt} · ${footnote}`, PAD, H - 26);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.amber;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('DAPPA · Strategic Intelligence Hub', W - PAD, H - 26);
  ctx.textAlign = 'left';

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
