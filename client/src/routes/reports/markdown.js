// /reports — Markdown rendering of the Weekly Brief for the ".md" download.
// Honors the section toggles and custom section order; data selection comes
// from select.js so it always matches the preview and PDF.
import { fmtInt, fmtNum, fmtPct, dateLabel, monthLabel } from '../../lib/format.js';
import {
  selectOpenAlerts, selectTopHotspots, selectCommunities,
  selectForecastRows, selectRiskRows,
} from './select.js';
import { DEFAULT_ORDER, normalizeOrder } from './briefSections.js';

const esc = (v) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function table(headers, aligns, rows) {
  const sep = aligns.map((a) => (a === 'r' ? '---:' : '---'));
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ];
}

export function buildBriefMarkdown(brief, sections = {}, { order, preparedBy } = {}) {
  const on = (k) => sections[k] !== false;
  const seq = (order ? normalizeOrder(order) : DEFAULT_ORDER).filter(on);
  const { win } = brief;
  const k = brief.kpis.data || {};
  const det = Number(k.detectionRate) <= 1 ? Number(k.detectionRate) * 100 : Number(k.detectionRate);

  const lines = [
    '# Weekly Intelligence Brief',
    '',
    'Karnataka State Police · DAPPA decision-support prototype',
    '',
    `- **Period:** ${dateLabel(win.from)} – ${dateLabel(win.to)} (${win.label})`,
    `- **Generated:** ${dateLabel(new Date().toISOString().slice(0, 10))}`,
    ...(preparedBy ? [`- **Prepared by:** ${esc(preparedBy)}`] : []),
    '',
    '> Synthetic demonstration data — KSP Datathon 2026 prototype. Not real crime records.',
    '',
  ];

  const renderers = {
    kpis: () => {
      if (!brief.kpis.data) return ['## Headline indicators', '', '_Section unavailable._', ''];
      const mom = Number.isFinite(Number(k.momPct)) ? fmtPct(Number(k.momPct), { sign: true, fraction: false }) : '—';
      return [
        '## Headline indicators',
        '',
        ...table(
          ['Total FIRs', 'MoM change', 'Heinous cases', 'Detection rate', 'Active alerts'],
          ['r', 'r', 'r', 'r', 'r'],
          [[fmtInt(k.totalFirs), mom, fmtInt(k.heinousCount), Number.isFinite(det) ? `${det.toFixed(1)}%` : '—', fmtInt(k.activeAlerts)]],
        ),
        '',
      ];
    },
    alerts: () => {
      const rows = selectOpenAlerts(brief, 8);
      if (!rows.length) return ['## New anomaly alerts', '', '_No open anomaly alerts in this window._', ''];
      return [
        '## New anomaly alerts',
        '',
        ...table(
          ['District', 'Crime head', 'Narrative', 'Obs / Exp', 'z', 'Severity'],
          ['l', 'l', 'l', 'r', 'r', 'l'],
          rows.map((a) => [
            a.districtName || a.districtId, a.headName, a.narrative,
            `${fmtInt(a.observed)} / ${fmtInt(a.expected)}`, fmtNum(a.zScore, 1), a.severity,
          ]),
        ),
        '',
      ];
    },
    hotspots: () => {
      const rows = selectTopHotspots(brief, 6);
      if (!rows.length) return ['## Top hotspots', '', '_No hotspot clusters for this window._', ''];
      return [
        '## Top hotspots',
        '',
        ...table(
          ['Hotspot', 'Crime subhead', 'District unit', 'Cases', 'Intensity'],
          ['l', 'l', 'l', 'r', 'r'],
          rows.map((h) => [
            h.label || `Cluster ${h.clusterId}`, h.subHeadName, h.districtName || h.districtId,
            fmtInt(h.caseCount), fmtNum(h.intensity, 2),
          ]),
        ),
        '',
      ];
    },
    network: () => {
      const groups = selectCommunities(brief, 5);
      if (!groups.length) return ['## Network changes', '', '_No network communities resolved._', ''];
      return [
        '## Network changes — largest co-offending clusters',
        '',
        ...groups.map((g) =>
          `- **Group #${g.id}** — ${fmtInt(g.members)} members · ${fmtInt(g.cases)} linked cases${g.top?.label ? ` · key node: ${esc(g.top.label)}` : ''}`),
        '',
      ];
    },
    forecast: () => {
      const rows = selectForecastRows(brief, 3);
      const risk = selectRiskRows(brief, 5);
      const out = ['## Forecast risks — next quarter', ''];
      if (rows.length) {
        out.push(
          ...table(
            ['Month', 'Predicted FIRs', 'Interval'],
            ['l', 'r', 'r'],
            rows.map((f) => [monthLabel(f.ym), fmtInt(f.predicted), `${fmtInt(f.lo)} – ${fmtInt(f.hi)}`]),
          ),
          '',
          `Model: ${brief.forecast.data?.model || '—'}${brief.forecast.data?.mape != null ? ` · backtest MAPE ${fmtNum(brief.forecast.data.mape, 1)}%` : ''}`,
          '',
        );
      } else {
        out.push('_No forecast available._', '');
      }
      if (risk.length) {
        out.push(
          '**Highest-risk stations (30-day horizon):**',
          '',
          ...risk.map((s) =>
            `- **${esc(s.unitName || s.unitId)}** — risk ${fmtNum(s.riskScore, 2)}${Array.isArray(s.drivers) && s.drivers.length ? ` · drivers: ${esc(s.drivers.slice(0, 3).join(', '))}` : ''}`),
          '',
        );
      }
      return out;
    },
  };

  for (const key of seq) lines.push(...(renderers[key]?.() || []));

  lines.push(
    '---',
    '',
    '_Generated by DAPPA — Data Analytics & Predictive Policing Assistant (Zoho Catalyst)._',
    '_All figures derive from synthetic data · caste/religion are never used in analytics._',
  );
  return lines.join('\n');
}
