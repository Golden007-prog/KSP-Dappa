// Executive summary for the Weekly Brief — auto-composed prose from the same
// useBriefData queries the sections render (select.js keeps the data choices
// identical), plus the officer-edited override persisted in localStorage.
// The composed text degrades gracefully: any section that hasn't loaded (or
// errored) simply contributes no sentence. Every sentence is a translated
// template so the printed brief reads natively in both languages.
import { fmtInt, fmtNum, dateLabel, monthLabel } from '../../lib/format.js';
import { translate } from '../../lib/i18n.jsx';
import {
  sevRank, selectOpenAlerts, selectTopHotspots, selectForecastRows, selectRiskRows, hotspotLabel,
} from './select.js';

const KEY = 'dappa-brief-exec';

const en = (key, vars) => translate('en', key, vars);
const passThrough = (_kind, _id, fallback) => fallback || '';

export function loadExecOverride() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

export function saveExecOverride(text) {
  try {
    if (text) localStorage.setItem(KEY, String(text));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

export const wordCount = (t) => (String(t || '').trim().match(/\S+/g) || []).length;

const hourFmt = (h) => (Number.isFinite(Number(h)) ? `${String(Number(h)).padStart(2, '0')}:00` : '—');

export function composeExecutiveSummary(brief, t = en, tName = passThrough) {
  const parts = [];
  const { win } = brief;
  const k = brief.kpis.data || {};
  const pk = brief.prevKpis?.data || {};

  if (Number.isFinite(Number(k.totalFirs))) {
    // /summary/kpis is month-anchored and ignores from/to entirely: the same
    // 1,151 comes back for every window. Printing it as "{days}-day window
    // {from} – {to}" made the brief's FIRST SENTENCE false by roughly 4x, and
    // because the prior-window call is the same endpoint it returned the same
    // object — so the delta compared a number with itself and rendered "level
    // with the preceding 7 days" as a finding of stability. Say which month the
    // figure covers, and when both queries resolved to the same anchor month
    // (which proves no comparison happened) print no delta at all.
    const sameAnchor = k.asOfYm && pk.asOfYm && k.asOfYm === pk.asOfYm;
    let s = k.asOfYm
      ? t('alerts.exec.firsMonth', { n: fmtInt(k.totalFirs), month: monthLabel(k.asOfYm) })
      : t('alerts.exec.firs', {
        n: fmtInt(k.totalFirs), days: win.days, from: dateLabel(win.from), to: dateLabel(win.to),
      });
    const c = Number(k.totalFirs);
    const p = Number(pk.totalFirs);
    if (!sameAnchor && Number.isFinite(p) && p > 0) {
      const pct = ((c - p) / p) * 100;
      s += Math.abs(pct) < 0.5
        ? t('alerts.exec.level', { days: win.days })
        : t(pct > 0 ? 'alerts.exec.up' : 'alerts.exec.down', {
          pct: Math.abs(pct).toFixed(1), days: win.days,
        });
    }
    const det = Number(k.detectionRate);
    if (Number.isFinite(det)) s += t('alerts.exec.detection', { pct: det.toFixed(1) });
    // Sentence terminator comes from the dictionary (alerts.exec.stop) so a locale
    // can swap it — a danda, for instance — without touching this code.
    parts.push(`${s}${t('alerts.exec.stop')}`);
  }

  const alerts = selectOpenAlerts(brief, Infinity);
  if (alerts.length) {
    const hot = alerts.filter((a) => sevRank(a.severity) >= 3).length;
    const top = alerts[0];
    parts.push(
      t(alerts.length === 1 ? 'alerts.exec.alerts.one' : 'alerts.exec.alerts.other', { n: fmtInt(alerts.length) })
      + (hot ? t('alerts.exec.alertsHot', { n: fmtInt(hot) }) : '')
      + t('alerts.exec.sharpest', {
        head: tName('crimeHeads', top.crimeHeadId, top.headName) || t('alerts.exec.anAnomaly'),
        district: tName('districts', top.districtId, top.districtName || top.districtId)
          || t('alerts.exec.unresolvedDistrict'),
        z: fmtNum(top.zScore, 1),
        obs: fmtInt(top.observed),
        exp: fmtInt(top.expected),
      }),
    );
  }

  const hs = selectTopHotspots(brief, 1)[0];
  if (hs) {
    const sub = tName('crimeHeads', hs.crimeHeadId, hs.subHeadName);
    // Non-empty only when tName resolved a translated head, i.e. hotspotLabel
    // composed the label and already names the crime head — so the English
    // parenthetical is kept and the Kannada duplicate is dropped.
    const composedHead = tName('crimeHeads', hs.crimeHeadId, '');
    parts.push(t('alerts.exec.hotspot', {
      label: hotspotLabel(hs, t, tName),
      sub: sub && !composedHead ? t('alerts.exec.hotspotSub', { sub }) : '',
      n: fmtInt(hs.caseCount),
      from: hourFmt(hs.hourBandStart),
      to: hourFmt(hs.hourBandEnd),
    }));
  }

  const nodes = brief.network.data?.nodes || [];
  if (nodes.length) {
    const groups = new Map();
    let largest = 0;
    for (const n of nodes) {
      const id = n.communityId ?? '—';
      groups.set(id, (groups.get(id) || 0) + 1);
      largest = Math.max(largest, groups.get(id));
    }
    if (largest > 1) {
      parts.push(t('alerts.exec.network', {
        n: fmtInt(nodes.length), g: fmtInt(groups.size), m: fmtInt(largest),
      }));
    }
  }

  const f = selectForecastRows(brief, 1)[0];
  const r = selectRiskRows(brief, 1)[0];
  if (f) {
    parts.push(t('alerts.exec.forecast', {
      n: fmtInt(f.predicted),
      month: monthLabel(f.ym),
      lo: fmtInt(f.lo),
      hi: fmtInt(f.hi),
      risk: r
        ? t('alerts.exec.forecastRisk', { station: r.unitName || r.unitId, score: fmtNum(r.riskScore, 2) })
        : '',
    }));
  }

  return parts.join(' ');
}
