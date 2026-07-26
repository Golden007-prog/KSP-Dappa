// /reports — Markdown rendering of the Weekly Brief for the ".md" download.
// Honors the section toggles, custom section order, the executive-summary
// override, and the classification stamp; data selection comes from select.js
// (and exec.js / annex.js) so it always matches the preview and PDF.
// Headings and table headers follow the active UI language.
import { fmtInt, fmtNum, fmtPct, dateLabel, monthLabel } from '../../lib/format.js';
import { translate } from '../../lib/i18n.jsx';
import {
  selectOpenAlerts, selectTopHotspots, selectCommunities,
  selectForecastRows, selectRiskRows, hotspotLabel, sevKey,
} from './select.js';
import { triageStats } from './triagePerf.js';
import { briefReference } from './reference.js';
import { DEFAULT_ORDER, normalizeOrder } from './briefSections.js';
import { composeExecutiveSummary } from './exec.js';
import { annexNotes } from './annex.js';
import { classMeta } from './classification.js';

const enT = (key, vars) => translate('en', key, vars);
const passThrough = (_kind, _id, fallback) => fallback || '';

const esc = (v) => String(v ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function table(headers, aligns, rows) {
  const sep = aligns.map((a) => (a === 'r' ? '---:' : '---'));
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ];
}

export function buildBriefMarkdown(
  brief,
  sections = {},
  { order, preparedBy, execText, classification, t = enT, tName = passThrough } = {},
) {
  const on = (key) => sections[key] !== false;
  const seq = (order ? normalizeOrder(order) : DEFAULT_ORDER).filter(on);
  const { win } = brief;
  const k = brief.kpis.data || {};
  const det = Number(k.detectionRate) <= 1 ? Number(k.detectionRate) * 100 : Number(k.detectionRate);
  const classBanner = classMeta(classification, t).banner;
  const stats = triageStats(brief);
  const reference = briefReference(win, seq, classification);
  const h = (key) => `## ${t(`alerts.brief.h.${key}`)}`;

  const lines = [
    `# ${t('alerts.brief.title')}`,
    '',
    ...(classBanner ? [`**${classBanner}**`, ''] : []),
    t('alerts.brief.org'),
    '',
    `- ${t('alerts.md.period', { from: dateLabel(win.from), to: dateLabel(win.to), win: win.label })}`,
    `- ${t('alerts.md.generated', { date: dateLabel(new Date().toISOString().slice(0, 10)) })}`,
    ...(preparedBy ? [`- ${t('alerts.md.preparedBy', { who: esc(preparedBy) })}`] : []),
    `- ${t('alerts.md.reference', { code: reference })}`,
    '',
    `> ${t('alerts.brief.disclaimer')}`,
    '',
  ];

  const renderers = {
    exec: () => {
      const text = (execText && String(execText).trim()) || composeExecutiveSummary(brief, t, tName);
      if (!text) return [h('exec'), '', t('alerts.md.execNotEnough'), ''];
      return [h('exec'), '', text, ''];
    },
    annex: () => [
      h('annex'),
      '',
      ...annexNotes(brief, t).map((n, i) => `${i + 1}. **${n.title}.** ${n.body}`),
      '',
    ],
    kpis: () => {
      if (!brief.kpis.data) return [h('kpis'), '', t('alerts.md.sectionUnavailable'), ''];
      const mom = Number.isFinite(Number(k.momPct)) ? fmtPct(Number(k.momPct), { sign: true, fraction: false }) : '—';
      return [
        h('kpis'),
        '',
        ...table(
          [
            t('alerts.brief.kpi.totalFirs'), t('alerts.brief.kpi.mom'), t('alerts.brief.kpi.heinous'),
            t('alerts.brief.kpi.detection'), t('alerts.brief.kpi.activeAlerts'),
          ],
          ['r', 'r', 'r', 'r', 'r'],
          [[fmtInt(k.totalFirs), mom, fmtInt(k.heinousCount), Number.isFinite(det) ? `${det.toFixed(1)}%` : '—', fmtInt(k.activeAlerts)]],
        ),
        '',
      ];
    },
    alerts: () => {
      const rows = selectOpenAlerts(brief, 8);
      if (!rows.length) return [h('alerts'), '', `_${t('alerts.brief.empty.alerts')}_`, ''];
      return [
        h('alerts'),
        '',
        ...table(
          [
            t('alerts.brief.col.district'), t('alerts.brief.col.crimeHead'), t('alerts.brief.col.narrative'),
            t('alerts.brief.col.obsExp'), t('alerts.brief.col.z'), t('alerts.brief.col.severity'),
          ],
          ['l', 'l', 'l', 'r', 'r', 'l'],
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
        ),
        '',
      ];
    },
    triage: () => {
      if (!stats) return [h('triage'), '', `_${t('alerts.brief.empty.triage')}_`, ''];
      return [
        h('triage'),
        '',
        ...table(
          [t('alerts.brief.triage.total'), t('alerts.brief.triage.open'), t('alerts.brief.triage.handled'),
            t('alerts.brief.triage.sla'), t('alerts.brief.triage.medianAge')],
          ['r', 'r', 'r', 'r', 'r'],
          [[
            fmtInt(stats.total), fmtInt(stats.openCount), fmtInt(stats.handled),
            stats.slaPct === null ? '—' : `${stats.slaPct.toFixed(0)}%`,
            stats.medianOpenAgeDays === null ? '—' : `${stats.medianOpenAgeDays}d`,
          ]],
        ),
        '',
        t('alerts.brief.triage.split', { surges: fmtInt(stats.surges), drops: fmtInt(stats.drops) }),
        '',
      ];
    },
    emerging: () => {
      const rising = (brief.emerging?.data?.rising || []).slice(0, 6);
      const falling = (brief.emerging?.data?.falling || []).slice(0, 4);
      const rows = [...rising, ...falling];
      if (!rows.length) return [h('emerging'), '', `_${t('alerts.brief.empty.emerging')}_`, ''];
      return [
        h('emerging'),
        '',
        ...table(
          [t('alerts.brief.col.subhead'), t('alerts.brief.col.crimeHead'), t('alerts.brief.col.recent'),
            t('alerts.brief.col.baseline'), t('alerts.brief.col.growth')],
          ['l', 'l', 'r', 'r', 'r'],
          rows.map((r) => [
            r.subHeadName,
            tName('crimeHeads', r.headId, r.headName),
            fmtNum(r.recentAvg, 1),
            fmtNum(r.baselineAvg, 1),
            fmtPct(Number(r.growthPct), { sign: true }),
          ]),
        ),
        '',
      ];
    },
    socio: () => {
      const inds = brief.socio?.data?.indicators || [];
      if (!inds.length) return [h('socio'), '', `_${t('alerts.brief.empty.socio')}_`, ''];
      return [
        h('socio'),
        '',
        ...table(
          [t('alerts.brief.col.indicator'), t('alerts.brief.col.r'), t('alerts.brief.col.n'),
            t('alerts.brief.col.strength'), t('alerts.brief.col.directionCol')],
          ['l', 'r', 'r', 'l', 'l'],
          inds.map((i) => [
            i.label || i.key,
            i.r === null || i.r === undefined ? '—' : fmtNum(i.r, 2),
            fmtInt(i.n),
            i.strength || '—',
            i.direction || i.note || '—',
          ]),
        ),
        '',
        t('alerts.brief.socioNote'),
        '',
      ];
    },
    hotspots: () => {
      const rows = selectTopHotspots(brief, 6);
      if (!rows.length) return [h('hotspots'), '', `_${t('alerts.brief.empty.hotspots')}_`, ''];
      return [
        h('hotspots'),
        '',
        ...table(
          [
            t('alerts.brief.col.hotspot'), t('alerts.brief.col.crimeSubhead'), t('alerts.brief.col.districtUnit'),
            t('alerts.brief.col.cases'), t('alerts.brief.col.intensity'),
          ],
          ['l', 'l', 'l', 'r', 'r'],
          rows.map((x) => [
            hotspotLabel(x, t, tName),
            tName('crimeHeads', x.crimeHeadId, x.subHeadName),
            tName('districts', x.districtId, x.districtName || x.districtId),
            fmtInt(x.caseCount), fmtNum(x.intensity, 2),
          ]),
        ),
        '',
      ];
    },
    network: () => {
      const groups = selectCommunities(brief, 5);
      if (!groups.length) return [h('network'), '', `_${t('alerts.brief.empty.network')}_`, ''];
      return [
        h('network'),
        '',
        ...groups.map((g) =>
          `- **${t('alerts.brief.group', { id: g.id })}** — ${t('alerts.brief.members', { n: fmtInt(g.members) })} · ${t('alerts.brief.linkedCases', { n: fmtInt(g.cases) })}${g.top?.label ? ` · ${t('alerts.brief.keyNode', { label: esc(g.top.label) })}` : ''}`),
        '',
      ];
    },
    forecast: () => {
      const rows = selectForecastRows(brief, 3);
      const risk = selectRiskRows(brief, 5);
      const out = [h('forecast'), ''];
      if (rows.length) {
        out.push(
          ...table(
            [t('alerts.brief.col.month'), t('alerts.brief.col.predicted'), t('alerts.brief.col.interval')],
            ['l', 'r', 'r'],
            rows.map((f) => [monthLabel(f.ym), fmtInt(f.predicted), `${fmtInt(f.lo)} – ${fmtInt(f.hi)}`]),
          ),
          '',
          t('alerts.brief.model', { model: brief.forecast.data?.model || '—' })
            + (brief.forecast.data?.mape != null
              ? t('alerts.brief.mape', { v: fmtNum(brief.forecast.data.mape, 1) }) : ''),
          '',
        );
      } else {
        out.push(`_${t('alerts.brief.empty.forecast')}_`, '');
      }
      if (risk.length) {
        out.push(
          t('alerts.md.riskHeading'),
          '',
          ...risk.map((s) =>
            `- **${esc(s.unitName || s.unitId)}** — ${t('alerts.brief.riskScore', { v: fmtNum(s.riskScore, 2) })}${Array.isArray(s.drivers) && s.drivers.length ? ` · ${t('alerts.brief.drivers', { list: esc(s.drivers.slice(0, 3).join(', ')) })}` : ''}`),
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
    `_${t('alerts.brief.footerLeft')}._`,
    `_${t('alerts.brief.footerRight')}._`,
  );
  return lines.join('\n');
}
