// /reports — machine-readable brief bundle.
//
// The PDF is for reading, the CSVs are for one table at a time. This is the
// whole brief as one JSON document: the window, the reference code, the
// classification, every enabled section's selected rows, and a provenance block
// naming the Catalyst endpoints each section came from. It is what a district
// analyst pastes into a notebook, and what makes the printed numbers auditable
// — every figure in the PDF has a matching field here.
import { downloadBlob } from '../alerts/csv.js';
import { translate } from '../../lib/i18n.jsx';
import {
  selectOpenAlerts, selectTopHotspots, selectCommunities,
  selectForecastRows, selectRiskRows, hotspotLabel, sevKey,
} from './select.js';
import { DEFAULT_ORDER, normalizeOrder } from './briefSections.js';
import { composeExecutiveSummary } from './exec.js';
import { annexNotes } from './annex.js';
import { normalizeClass } from './classification.js';
import { triageStats } from './triagePerf.js';
import { briefReference } from './reference.js';
import { statusKey, direction } from '../alerts/severity.js';
import { explainAlert } from '../alerts/explain.js';

const enT = (key, vars) => translate('en', key, vars);
const passThrough = (_kind, _id, fallback) => fallback || '';

/** Which live endpoint backs each section — printed into the bundle. */
const SOURCES = {
  kpis: 'GET /summary/kpis',
  alerts: 'GET /alerts',
  triage: 'GET /alerts (client-side SLA roll-up)',
  emerging: 'GET /insight/emerging',
  hotspots: 'GET /geo/hotspots',
  socio: 'GET /insight/socio-correlation',
  network: 'GET /network/graph',
  forecast: 'GET /forecast + GET /risk/stations',
  exec: 'composed client-side from the sections above',
  annex: 'static methodology notes + live forecast model metadata',
};

const round = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(Number(v).toFixed(d)) : null);

/** Build the bundle object (exported separately so tests / callers can inspect). */
export function buildBriefBundle(brief, sections = {}, opts = {}) {
  const { order, preparedBy, execText, classification, t = enT, tName = passThrough } = opts;
  const on = (key) => sections[key] !== false;
  const seq = (order ? normalizeOrder(order) : DEFAULT_ORDER).filter(on);
  const cls = normalizeClass(classification);
  const { win } = brief;
  const stats = triageStats(brief);

  const payload = {
    document: {
      kind: 'dappa-weekly-intelligence-brief',
      reference: briefReference(win, seq, cls),
      generatedAt: new Date().toISOString(),
      classification: cls,
      preparedBy: preparedBy || null,
      language: t('alerts.brief.title'),
      disclaimer: t('alerts.brief.disclaimer'),
    },
    window: {
      key: win.value, label: win.label, from: win.from, to: win.to, days: win.days,
      previous: { from: brief.prevWin?.from || null, to: brief.prevWin?.to || null },
    },
    sections: seq,
    provenance: Object.fromEntries(seq.map((k) => [k, SOURCES[k] || 'client-derived'])),
    data: {},
  };

  const d = payload.data;
  if (on('exec')) d.executiveSummary = (execText && String(execText).trim()) || composeExecutiveSummary(brief, t, tName);
  if (on('kpis')) d.kpis = { current: brief.kpis.data || null, previous: brief.prevKpis?.data || null };
  if (on('alerts')) {
    d.alerts = selectOpenAlerts(brief, 50).map((a) => {
      const e = explainAlert(a);
      return {
        alertId: a.alertId,
        districtId: a.districtId,
        districtName: a.districtName,
        crimeHeadId: a.crimeHeadId,
        headName: a.headName,
        periodStart: a.periodStart,
        periodEnd: a.periodEnd,
        observed: a.observed,
        expected: a.expected,
        zScore: a.zScore,
        severityCode: a.severity,
        severityBand: sevKey(a.severity) || null,
        status: statusKey(a.status),
        direction: direction(a) || null,
        excess: round(e.excess),
        sigma: round(e.sigma),
        narrative: a.narrative,
      };
    });
  }
  if (on('triage')) d.triage = stats;
  if (on('emerging')) {
    d.emerging = {
      anchorYm: brief.emerging?.data?.anchorYm || null,
      fromYm: brief.emerging?.data?.fromYm || null,
      rising: (brief.emerging?.data?.rising || []).slice(0, 10),
      falling: (brief.emerging?.data?.falling || []).slice(0, 10),
    };
  }
  if (on('hotspots')) {
    d.hotspots = selectTopHotspots(brief, 20).map((h) => ({ ...h, label: hotspotLabel(h, t, tName) }));
  }
  if (on('socio')) {
    d.socioEconomic = {
      fromYm: brief.socio?.data?.fromYm || null,
      toYm: brief.socio?.data?.toYm || null,
      indicators: brief.socio?.data?.indicators || [],
      districtPoints: (brief.socio?.data?.points || []).length,
    };
  }
  if (on('network')) d.network = selectCommunities(brief, 10);
  if (on('forecast')) {
    d.forecast = {
      model: brief.forecast.data?.model || null,
      mape: brief.forecast.data?.mape ?? null,
      horizon: selectForecastRows(brief, 6),
      riskStations: selectRiskRows(brief, 20),
    };
  }
  if (on('annex')) d.methodology = annexNotes(brief, t).map((n) => ({ key: n.key, title: n.title, body: n.body }));

  return payload;
}

/** Download the bundle; returns the reference code that was stamped into it. */
export function exportBriefJson(brief, sections, opts = {}) {
  const bundle = buildBriefBundle(brief, sections, opts);
  downloadBlob(
    `dappa-weekly-brief-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(bundle, null, 2),
    'application/json;charset=utf-8',
  );
  return bundle.document.reference;
}
