// /reports — self-contained HTML export.
//
// A single .html file with its styles inlined and no external references: it
// opens on any machine with a browser, prints to the same A4 layout as the
// SmartBrowz PDF, and can be attached to an e-mail or dropped on a shared drive
// without the app being reachable. That matters for a police deployment where
// the reader is often outside the network the console lives on.
//
// Rendered from the same select.js data the preview uses, so the file and the
// screen cannot drift.
import { downloadBlob } from '../alerts/csv.js';
import { fmtInt, fmtNum, fmtPct, dateLabel, monthLabel } from '../../lib/format.js';
import { translate } from '../../lib/i18n.jsx';
import {
  selectOpenAlerts, selectTopHotspots, selectCommunities,
  selectForecastRows, selectRiskRows, hotspotLabel, sevKey,
} from './select.js';
import { DEFAULT_ORDER, normalizeOrder } from './briefSections.js';
import { composeExecutiveSummary } from './exec.js';
import { annexNotes } from './annex.js';
import { classMeta, normalizeClass } from './classification.js';
import { triageStats } from './triagePerf.js';
import { briefReference } from './reference.js';

const enT = (key, vars) => translate('en', key, vars);
const passThrough = (_kind, _id, fallback) => fallback || '';

const esc = (v) => String(v ?? '—')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const table = (headers, rows, aligns = []) => [
  '<table><thead><tr>',
  headers.map((h, i) => `<th${aligns[i] === 'r' ? ' class="r"' : ''}>${esc(h)}</th>`).join(''),
  '</tr></thead><tbody>',
  rows.map((r) => `<tr>${r.map((c, i) => `<td${aligns[i] === 'r' ? ' class="r"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join(''),
  '</tbody></table>',
].join('');

const CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f3f4f6; color: #111827;
  font: 13px/1.5 "Segoe UI", Roboto, "Helvetica Neue", Arial, "Nirmala UI", "Noto Sans Kannada", "Noto Sans Devanagari", sans-serif; }
main { max-width: 210mm; margin: 0 auto; background: #fff; padding: 16mm 14mm; box-shadow: 0 1px 12px rgba(0,0,0,.12); }
h1 { font-size: 22px; margin: 0; letter-spacing: -.01em; }
h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #b45309;
  border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin: 18px 0 8px; }
p { margin: 0 0 6px; }
.org, .meta, .note { color: #6b7280; font-size: 11px; }
.banner { text-align: center; font-size: 10px; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; margin: 0 0 8px; }
.banner.c { color: #b91c1c; } .banner.i { color: #b45309; }
.head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.rule { border: 0; border-top: 2px solid #0b1220; margin: 12px 0 0; }
.disc { font-size: 10px; color: #b91c1c; margin-top: 6px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 2px; }
th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .05em;
  color: #6b7280; font-weight: 600; padding: 4px 8px; border-bottom: 1px solid #e5e7eb; }
td { font-size: 12px; padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.stats { display: flex; gap: 8px; flex-wrap: wrap; }
.stat { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; flex: 1; min-width: 110px; }
.stat b { display: block; font-size: 20px; font-variant-numeric: tabular-nums; }
.stat span { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
ul, ol { margin: 0; padding-left: 18px; } li { font-size: 12px; margin: 3px 0; }
footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e5e7eb;
  display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 10px; color: #6b7280; }
@media print {
  body { background: #fff; } main { box-shadow: none; padding: 0; max-width: none; }
  @page { size: A4; margin: 14mm; }
  section { break-inside: avoid; }
}
@media (max-width: 640px) { main { padding: 12px; } table { display: block; overflow-x: auto; } }
`;

/** Build the standalone document string. */
export function buildBriefHtml(brief, sections = {}, opts = {}) {
  const { order, preparedBy, execText, classification, t = enT, tName = passThrough } = opts;
  const on = (key) => sections[key] !== false;
  const seq = (order ? normalizeOrder(order) : DEFAULT_ORDER).filter(on);
  const cls = normalizeClass(classification);
  const meta = classMeta(cls, t);
  const { win } = brief;
  const k = brief.kpis.data || {};
  const reference = briefReference(win, seq, cls);
  const stats = triageStats(brief);
  const sec = (key, body) => `<section><h2>${esc(t(`alerts.brief.h.${key}`))}</h2>${body}</section>`;

  const parts = {
    exec: () => {
      const text = (execText && String(execText).trim()) || composeExecutiveSummary(brief, t, tName);
      return sec('exec', text
        ? text.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')
        : `<p class="note">${esc(t('alerts.brief.execNotEnough'))}</p>`);
    },
    kpis: () => sec('kpis', `<div class="stats">${[
      [t('alerts.brief.kpi.totalFirs'), fmtInt(k.totalFirs)],
      [t('alerts.brief.kpi.mom'), Number.isFinite(Number(k.momPct)) ? fmtPct(Number(k.momPct), { sign: true }) : '—'],
      [t('alerts.brief.kpi.heinous'), fmtInt(k.heinousCount)],
      [t('alerts.brief.kpi.detection'), Number.isFinite(Number(k.detectionRate)) ? `${Number(k.detectionRate).toFixed(1)}%` : '—'],
      [t('alerts.brief.kpi.activeAlerts'), fmtInt(k.activeAlerts)],
    ].map(([label, v]) => `<div class="stat"><span>${esc(label)}</span><b>${esc(v)}</b></div>`).join('')}</div>`),
    alerts: () => {
      const rows = selectOpenAlerts(brief, 12);
      if (!rows.length) return sec('alerts', `<p class="note">${esc(t('alerts.brief.empty.alerts'))}</p>`);
      return sec('alerts', table(
        [t('alerts.brief.col.district'), t('alerts.brief.col.crimeHead'), t('alerts.brief.col.narrative'),
          t('alerts.brief.col.obsExp'), t('alerts.brief.col.z'), t('alerts.brief.col.severity')],
        rows.map((a) => {
          const key = sevKey(a.severity);
          return [
            tName('districts', a.districtId, a.districtName || a.districtId),
            tName('crimeHeads', a.crimeHeadId, a.headName),
            a.narrative,
            `${fmtInt(a.observed)} / ${fmtInt(a.expected)}`,
            fmtNum(a.zScore, 1),
            key ? t(`alerts.sevLower.${key}`) : '—',
          ];
        }),
        ['l', 'l', 'l', 'r', 'r', 'l'],
      ));
    },
    triage: () => {
      if (!stats) return sec('triage', `<p class="note">${esc(t('alerts.brief.empty.triage'))}</p>`);
      return sec('triage', `<div class="stats">${[
        [t('alerts.brief.triage.total'), fmtInt(stats.total)],
        [t('alerts.brief.triage.open'), fmtInt(stats.openCount)],
        [t('alerts.brief.triage.handled'), fmtInt(stats.handled)],
        [t('alerts.brief.triage.sla'), stats.slaPct === null ? '—' : `${stats.slaPct.toFixed(0)}%`],
        [t('alerts.brief.triage.medianAge'), stats.medianOpenAgeDays === null ? '—' : `${stats.medianOpenAgeDays}d`],
      ].map(([label, v]) => `<div class="stat"><span>${esc(label)}</span><b>${esc(v)}</b></div>`).join('')}</div>
        <p class="note">${esc(t('alerts.brief.triage.split', {
        surges: fmtInt(stats.surges), drops: fmtInt(stats.drops),
      }))}</p>`);
    },
    emerging: () => {
      const rising = (brief.emerging?.data?.rising || []).slice(0, 6);
      const falling = (brief.emerging?.data?.falling || []).slice(0, 4);
      if (!rising.length && !falling.length) return sec('emerging', `<p class="note">${esc(t('alerts.brief.empty.emerging'))}</p>`);
      return sec('emerging', table(
        [t('alerts.brief.col.subhead'), t('alerts.brief.col.crimeHead'), t('alerts.brief.col.recent'),
          t('alerts.brief.col.baseline'), t('alerts.brief.col.growth'), t('alerts.brief.col.trend')],
        [...rising, ...falling].map((r) => [
          r.subHeadName,
          tName('crimeHeads', r.headId, r.headName),
          fmtNum(r.recentAvg, 1),
          fmtNum(r.baselineAvg, 1),
          fmtPct(Number(r.growthPct), { sign: true }),
          t(Number(r.growthPct) >= 0 ? 'alerts.brief.trend.rising' : 'alerts.brief.trend.falling'),
        ]),
        ['l', 'l', 'r', 'r', 'r', 'l'],
      ));
    },
    hotspots: () => {
      const rows = selectTopHotspots(brief, 8);
      if (!rows.length) return sec('hotspots', `<p class="note">${esc(t('alerts.brief.empty.hotspots'))}</p>`);
      return sec('hotspots', table(
        [t('alerts.brief.col.hotspot'), t('alerts.brief.col.crimeSubhead'), t('alerts.brief.col.districtUnit'),
          t('alerts.brief.col.cases'), t('alerts.brief.col.intensity')],
        rows.map((h) => [
          hotspotLabel(h, t, tName),
          tName('crimeHeads', h.crimeHeadId, h.subHeadName),
          tName('districts', h.districtId, h.districtName || h.districtId),
          fmtInt(h.caseCount), fmtNum(h.intensity, 2),
        ]),
        ['l', 'l', 'l', 'r', 'r'],
      ));
    },
    socio: () => {
      const inds = brief.socio?.data?.indicators || [];
      if (!inds.length) return sec('socio', `<p class="note">${esc(t('alerts.brief.empty.socio'))}</p>`);
      return sec('socio', `${table(
        [t('alerts.brief.col.indicator'), t('alerts.brief.col.r'), t('alerts.brief.col.n'),
          t('alerts.brief.col.strength'), t('alerts.brief.col.directionCol')],
        inds.map((i) => [
          i.label || i.key,
          i.r === null || i.r === undefined ? '—' : fmtNum(i.r, 2),
          fmtInt(i.n),
          i.strength || '—',
          i.direction || '—',
        ]),
        ['l', 'r', 'r', 'l', 'l'],
      )}<p class="note">${esc(t('alerts.brief.socioNote'))}</p>`);
    },
    network: () => {
      const groups = selectCommunities(brief, 5);
      if (!groups.length) return sec('network', `<p class="note">${esc(t('alerts.brief.empty.network'))}</p>`);
      return sec('network', `<ul>${groups.map((g) =>
        `<li><b>${esc(t('alerts.brief.group', { id: g.id }))}</b> — ${esc(t('alerts.brief.members', { n: fmtInt(g.members) }))} · ${esc(t('alerts.brief.linkedCases', { n: fmtInt(g.cases) }))}</li>`).join('')}</ul>`);
    },
    forecast: () => {
      const rows = selectForecastRows(brief, 3);
      const risk = selectRiskRows(brief, 5);
      const fc = rows.length
        ? table([t('alerts.brief.col.month'), t('alerts.brief.col.predicted'), t('alerts.brief.col.interval')],
          rows.map((f) => [monthLabel(f.ym), fmtInt(f.predicted), `${fmtInt(f.lo)} – ${fmtInt(f.hi)}`]), ['l', 'r', 'r'])
        : `<p class="note">${esc(t('alerts.brief.empty.forecast'))}</p>`;
      const rk = risk.length
        ? `<p class="note">${esc(t('alerts.brief.riskHeading'))}</p><ul>${risk.map((s) =>
          `<li><b>${esc(s.unitName || s.unitId)}</b> — ${esc(t('alerts.brief.riskScore', { v: fmtNum(s.riskScore, 2) }))}</li>`).join('')}</ul>`
        : '';
      return sec('forecast', fc + rk);
    },
    annex: () => sec('annex', `<ol>${annexNotes(brief, t).map((n) =>
      `<li><b>${esc(n.title)}.</b> ${esc(n.body)}</li>`).join('')}</ol>`),
  };

  const body = seq.map((key) => parts[key]?.() || '').join('');
  const generated = dateLabel(new Date().toISOString().slice(0, 10));

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('alerts.print.docTitle', { win: win.label }))}</title>
<style>${CSS}</style></head>
<body><main>
${meta.banner ? `<p class="banner ${cls === 'confidential' ? 'c' : 'i'}">${esc(meta.banner)}</p>` : ''}
<div class="head">
  <div><h1>${esc(t('alerts.brief.title'))}</h1><p class="org">${esc(t('alerts.brief.org'))}</p></div>
  <div class="meta" style="text-align:right">
    <div>${esc(t('alerts.brief.period'))}: ${esc(dateLabel(win.from))} – ${esc(dateLabel(win.to))}</div>
    <div>${esc(t('alerts.brief.window'))}: ${esc(win.label)}</div>
    <div>${esc(t('alerts.brief.generated'))}: ${esc(generated)}</div>
    ${preparedBy ? `<div>${esc(t('alerts.brief.preparedBy'))}: ${esc(preparedBy)}</div>` : ''}
    <div>${esc(t('alerts.brief.reference'))}: ${esc(reference)}</div>
  </div>
</div>
<p class="disc">${esc(t('alerts.brief.disclaimer'))}</p>
<hr class="rule">
${body}
<footer><span>${esc(t('alerts.brief.footerLeft'))}</span><span>${esc(t('alerts.brief.footerRight'))}</span></footer>
</main></body></html>`;
}

/** Download the standalone HTML; returns the reference code stamped into it. */
export function exportBriefHtml(brief, sections, opts = {}) {
  const html = buildBriefHtml(brief, sections, opts);
  downloadBlob(
    `dappa-weekly-brief-${new Date().toISOString().slice(0, 10)}.html`,
    html,
    'text/html;charset=utf-8',
  );
  return briefReference(
    brief.win,
    (opts.order ? normalizeOrder(opts.order) : DEFAULT_ORDER).filter((key) => sections?.[key] !== false),
    normalizeClass(opts.classification),
  );
}
