// /reports — plain-text "share summary" of the Weekly Brief, built from the
// same useBriefData queries the preview renders, honoring the section toggles,
// the executive-summary override, and the classification stamp. Meant for the
// clipboard → WhatsApp / e-mail; keep it terse.
// Data selection lives in select.js so this never disagrees with BriefContent.
import { fmtInt, fmtNum, fmtPct, dateLabel, monthLabel } from '../../lib/format.js';
import { translate } from '../../lib/i18n.jsx';
import { selectOpenAlerts, selectTopHotspots, selectForecastRows, selectRiskRows, hotspotLabel } from './select.js';
import { composeExecutiveSummary } from './exec.js';
import { classMeta } from './classification.js';

const en = (key, vars) => translate('en', key, vars);
const passThrough = (_kind, _id, fallback) => fallback || '';

export function buildShareSummary(brief, sections = {}, { execText, classification, t = en, tName = passThrough } = {}) {
  const on = (k) => sections[k] !== false;
  const { win } = brief;
  const classBanner = classMeta(classification, t).banner;
  const lines = [
    t('alerts.sum.title', { win: win.label, from: dateLabel(win.from), to: dateLabel(win.to) }),
    t('alerts.sum.org'),
    ...(classBanner ? [classBanner] : []),
    '',
  ];

  if (on('exec')) {
    const text = (execText && String(execText).trim()) || composeExecutiveSummary(brief, t, tName);
    if (text) lines.push(text, '');
  }

  if (on('kpis') && brief.kpis.data) {
    const k = brief.kpis.data;
    const det = Number(k.detectionRate); // server contract: PERCENT 0-100 (read.js rounds A/(A+C)*100)
    const mom = Number.isFinite(Number(k.momPct)) ? fmtPct(Number(k.momPct), { sign: true, fraction: false }) : '—';
    lines.push(
      t('alerts.sum.headline', {
        firs: fmtInt(k.totalFirs),
        mom,
        heinous: fmtInt(k.heinousCount),
        det: Number.isFinite(det) ? `${det.toFixed(1)}%` : '—',
        alerts: fmtInt(k.activeAlerts),
      }),
      '',
    );
  }

  if (on('alerts')) {
    const top = selectOpenAlerts(brief, 5);
    if (top.length) {
      lines.push(t('alerts.sum.topAlerts'));
      top.forEach((a, i) => {
        const sevKey = String(a.severity || '').toLowerCase();
        lines.push(`  ${i + 1}. ${t('alerts.sum.alertRow', {
          sev: t(sevKey ? `alerts.sevLower.${sevKey}` : 'alerts.sevLower.none'),
          head: tName('crimeHeads', a.crimeHeadId, a.headName) || t('alerts.anomaly'),
          district: tName('districts', a.districtId, a.districtName || a.districtId) || '?',
          z: fmtNum(a.zScore, 1),
          obs: fmtInt(a.observed),
          exp: fmtInt(a.expected),
        })}`);
      });
      lines.push('');
    }
  }

  if (on('hotspots')) {
    const top = selectTopHotspots(brief, 3);
    if (top.length) {
      lines.push(t('alerts.sum.hotspots', {
        list: top.map((h) => t('alerts.sum.hotspotItem', {
          label: hotspotLabel(h, t, tName),
          n: fmtInt(h.caseCount),
        })).join(' · '),
      }), '');
    }
  }

  if (on('network')) {
    const nodes = brief.network.data?.nodes || [];
    if (nodes.length) {
      const communities = new Set(nodes.map((n) => n.communityId ?? '—')).size;
      lines.push(t('alerts.sum.network', { n: fmtInt(nodes.length), g: fmtInt(communities) }), '');
    }
  }

  if (on('forecast')) {
    const f = selectForecastRows(brief, 1)[0];
    if (f) {
      lines.push(t('alerts.sum.forecast', {
        month: monthLabel(f.ym), n: fmtInt(f.predicted), lo: fmtInt(f.lo), hi: fmtInt(f.hi),
      }) + (brief.forecast.data?.model
        ? t('alerts.sum.forecastModel', { model: brief.forecast.data.model })
        : ''));
    }
    const risk = selectRiskRows(brief, 3);
    if (risk.length) {
      lines.push(t('alerts.sum.risk', {
        list: risk.map((s) => t('alerts.sum.riskItem', {
          station: s.unitName || s.unitId, score: fmtNum(s.riskScore, 2),
        })).join(' · '),
      }));
    }
    if (f || risk.length) lines.push('');
  }

  lines.push(t('alerts.sum.footer'));
  return lines.join('\n');
}
