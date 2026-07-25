// /copilot — pure derivation helpers that make the AI story legible per
// answer: which Data Store tables an answer cites (parsed from its ZCQL),
// a confidence classification (exact aggregate vs modelled estimate vs
// unmatched), a human label for the parsed intent, and contextual follow-up
// question suggestions. No React, no side effects — safe to reuse from the
// transcript exporters.

/** Data dictionary for every table the copilot's ZCQL can touch. `route` is
 * the app screen where that table's data is explorable interactively.
 * `desc`/`routeLabel` are the English source strings (used by the transcript
 * exporters, which stay English); the UI reads t('copilot.table.<name>') and
 * t(`common.${navKey}`) so the strip localises without a second dictionary. */
export const TABLE_INFO = {
  AggMonthly: {
    desc: 'Nightly district × crime-head monthly aggregate distilled from CaseMaster (45k synthetic FIRs)',
    route: '/trends',
    routeLabel: 'Trends',
    navKey: 'nav.trends',
  },
  StationRisk: {
    desc: 'Predictive 30-day station risk scores with per-station driver explanations',
    route: '/predict',
    routeLabel: 'Predict',
    navKey: 'nav.predict',
  },
  ForecastMonthly: {
    desc: 'Holt-Winters monthly forecasts with 80% confidence intervals and backtest MAPE',
    route: '/predict',
    routeLabel: 'Predict',
    navKey: 'nav.predict',
  },
  AnomalyAlert: {
    desc: 'Z-score anomaly alerts — categories spiking vs their historical baseline',
    route: '/alerts',
    routeLabel: 'Alerts',
    navKey: 'nav.alerts',
  },
  HotspotCluster: {
    desc: 'DBSCAN spatial hotspot clusters from geocoded incident points',
    route: '/map',
    routeLabel: 'GeoIntel',
    navKey: 'nav.geointel',
  },
  OffenderProfile: {
    desc: 'Identity-resolved repeat-offender profiles with linked-case counts and risk',
    route: '/offenders',
    routeLabel: 'Offenders',
    navKey: 'nav.offenders',
  },
  ChargesheetDetails: {
    desc: 'Chargesheet outcomes (A/C finals) from the official ER schema',
    route: '/cases',
    routeLabel: 'Cases',
    navKey: 'nav.cases',
  },
  Employee: {
    desc: 'Investigating-officer roster (official ER schema) — used only to scope by district',
    route: null,
    routeLabel: '',
    navKey: '',
  },
};

/** Unique table names referenced by a ZCQL string, in appearance order. */
export function tablesFromZcql(zcql) {
  const out = [];
  const s = String(zcql || '');
  const re = /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Human labels for the deterministic parser's intent kinds. */
export const INTENT_LABELS = {
  trend: 'Trend over time',
  topDistricts: 'District ranking',
  topHeads: 'Crime-head ranking',
  compareYears: 'Year comparison',
  risk: 'Station risk',
  detectionRate: 'Detection rate',
  heinousShare: 'Heinous share',
  ratePerLakh: 'Rate per lakh',
  alerts: 'Active alerts',
  hotspots: 'Hotspots',
  offenders: 'Repeat offenders',
  forecast: 'Forecast',
  seasonality: 'Seasonality',
  totalFirs: 'FIR count',
  unknown: 'Not understood',
};

export const intentLabel = (kind) => INTENT_LABELS[kind] || '';

/**
 * Classify an assistant answer's confidence:
 *  - 'high'  exact deterministic aggregation (ZCQL reproduces the number)
 *  - 'model' statistical model output (forecast / risk score) — an estimate
 *  - 'low'   the parser could not map the question; no query was run
 * Returns {level, label, tone, desc} or null for non-answers.
 */
export function confidenceFor(message) {
  if (!message || message.role !== 'assistant' || message.error) return null;
  if (message.intent === 'unknown' || (!message.zcql && !message.chart)) {
    return {
      level: 'low',
      label: 'Unmatched',
      tone: 'slate',
      desc: 'The intent grammar could not map this question, so no query was run — try one of the suggested phrasings.',
    };
  }
  const tables = tablesFromZcql(message.zcql);
  const modelled = message.intent === 'forecast' || message.intent === 'risk'
    || tables.includes('ForecastMonthly') || tables.includes('StationRisk');
  if (modelled) {
    return {
      level: 'model',
      label: 'Modelled estimate',
      tone: 'amber',
      desc: 'Backtested statistical model output (Holt-Winters forecast / risk scoring) — an estimate with uncertainty, not an observed count.',
    };
  }
  return {
    level: 'high',
    label: 'Exact aggregate',
    tone: 'teal',
    desc: 'Deterministic aggregation over the synthetic Data Store — the ZCQL under this answer reproduces the number exactly.',
  };
}

// --- contextual follow-ups ---------------------------------------------------

// Light client-side mirror of the backend grammar's best-covered phrases, so
// generated follow-ups always parse into a real answer.
const CRIME_TERMS = [
  'chain snatching', 'vehicle theft', 'two-wheeler theft', 'house burglary',
  'murders', 'murder', 'robbery', 'cheating', 'cyber crimes', 'cyber crime',
  'property crimes', 'crimes against women', 'narcotics',
];

const DISTRICT_ALIASES = [
  ['bengaluru', 'Bengaluru City'], ['bangalore', 'Bengaluru City'],
  ['mysuru', 'Mysuru City'], ['mysore', 'Mysuru City'],
  ['mangaluru', 'Mangaluru City'], ['mangalore', 'Mangaluru City'],
  ['hubballi', 'Hubballi-Dharwad City'], ['hubli', 'Hubballi-Dharwad City'],
  ['belagavi', 'Belagavi'], ['belgaum', 'Belagavi'],
  ['kalaburagi', 'Kalaburagi'], ['gulbarga', 'Kalaburagi'],
];

const norm = (s) => String(s || '').toLowerCase().replace(/[?.!,;:]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Up to 3 follow-up questions contextual to an assistant answer — derived from
 * the crime/district mentioned in the original question, the parsed intent,
 * and (for rankings) the top chart category. Every suggestion is phrased to
 * hit the deterministic grammar, so it always answers.
 */
export function followUpsFor(message) {
  if (!message || message.role !== 'assistant' || message.error) return [];
  const q = norm(message.question);
  const crime = CRIME_TERMS.find((c) => q.includes(c)) || null;
  const districtHit = DISTRICT_ALIASES.find(([alias]) => q.includes(alias));
  const district = districtHit ? districtHit[1] : null;
  const c = crime || 'property crimes';
  const inPlace = district ? ` in ${district}` : '';
  const y = new Date().getFullYear();
  const topCat = Array.isArray(message.chart?.categories) ? String(message.chart.categories[0] || '') : '';

  let picks = [];
  switch (message.intent) {
    case 'trend':
    case 'totalFirs':
      picks = [`top 5 districts for ${c} this year`, `forecast for ${c}${inPlace}`, `seasonality of ${c}`];
      break;
    case 'topDistricts':
      picks = [
        topCat ? `${c} in ${topCat} last 6 months` : `compare ${c} ${y - 1} vs ${y}${inPlace}`,
        `compare ${c} ${y - 1} vs ${y}${inPlace}`,
        `seasonality of ${c}`,
      ];
      break;
    case 'topHeads':
      picks = [`heinous share this year`, `top 5 districts for ${c} this year`, `what is the detection rate this year?`];
      break;
    case 'compareYears':
      picks = [`${c}${inPlace} last 12 months`, `forecast for ${c}${inPlace}`, `top 5 districts for ${c} this year`];
      break;
    case 'forecast':
      picks = ['which stations are highest risk next month?', 'show active alerts', `seasonality of ${c}`];
      break;
    case 'risk':
      picks = ['show active alerts', 'hotspots in Bengaluru City', 'top repeat offenders'];
      break;
    case 'alerts':
      picks = ['hotspots in Bengaluru City', 'which stations are highest risk next month?', 'top repeat offenders'];
      break;
    case 'hotspots':
      picks = ['show active alerts', 'top repeat offenders', 'which stations are highest risk next month?'];
      break;
    case 'offenders':
      picks = ['which stations are highest risk next month?', 'show active alerts', 'hotspots in Bengaluru City'];
      break;
    case 'seasonality':
      picks = [`${c}${inPlace} last 12 months`, `top 5 districts for ${c} this year`, `forecast for ${c}${inPlace}`];
      break;
    case 'detectionRate':
    case 'heinousShare':
    case 'ratePerLakh':
      picks = [`compare ${c} ${y - 1} vs ${y}${inPlace}`, 'total FIRs last month', 'top 3 crime heads in Kalaburagi last 6 months'];
      break;
    default:
      return [];
  }
  const seen = new Set([q]);
  return picks.filter((p) => {
    const k = norm(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}
