'use strict';
// Case-outcome prediction. Flag path POSTs the QuickML deployment endpoint
// (env QUICKML_OUTCOME_URL + QUICKML_API_KEY); fallback evaluates the
// embedded logistic model in assets/outcome_model.json. Identical shape.

const fs = require('fs');
const path = require('path');
const { toNum, round } = require('./util');

let localModel = null;

function loadLocalModel() {
  if (!localModel) {
    const p = path.join(__dirname, '..', 'assets', 'outcome_model.json');
    localModel = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return localModel;
}

// Feature naming convention in the model file:
//   plain name  -> numeric input taken from body[name] (0 when absent)
//   "key=value" -> one-hot: 1 when the mapped body field equals value
const CATEGORICAL_SOURCES = {
  district: (b) => b.districtId,
  subhead: (b) => b.crimeSubHeadId,
  gravity: (b) => b.gravity || b.gravityName,
  category: (b) => b.category
};

function featureValue(name, body) {
  const eq = name.indexOf('=');
  if (eq > 0) {
    const key = name.slice(0, eq);
    const val = name.slice(eq + 1);
    const src = CATEGORICAL_SOURCES[key];
    const got = src ? src(body) : body[key];
    return String(got) === String(val) ? 1 : 0;
  }
  if (name === 'hourNight') {
    const hour = toNum(body.hour, NaN);
    if (Number.isFinite(hour)) return hour >= 22 || hour < 5 ? 1 : 0;
    return body.hourBand === 'night' ? 1 : 0;
  }
  if (name === 'arrestWithin7d') {
    return body.arrestWithin7d === true || String(body.arrestWithin7d) === '1' || String(body.arrestWithin7d) === 'true' ? 1 : 0;
  }
  return toNum(body[name], 0);
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function predictLocal(body) {
  const model = loadLocalModel();
  let z = toNum(model.intercept, 0);
  const used = {};
  model.features.forEach((name, i) => {
    const v = featureValue(name, body || {});
    used[name] = v;
    z += toNum(model.coefficients[i], 0) * v;
  });
  const pFirst = Math.min(1, Math.max(0, sigmoid(z)));
  const classes = model.classes || ['A', 'C'];
  const predictedClass = pFirst >= 0.5 ? classes[0] : classes[1];
  return {
    probability: round(pFirst, 4),
    predictedClass,
    probabilities: { [classes[0]]: round(pFirst, 4), [classes[1]]: round(1 - pFirst, 4) },
    classes,
    modelAuc: toNum(model.auc, null),
    featuresUsed: used
  };
}

/** Tolerant mapping of a QuickML deployment response onto our shape. */
function mapRemote(json, body) {
  const r = json || {};
  const inner = r.data || r.result || r;
  let prob = toNum(inner.probability, NaN);
  if (!Number.isFinite(prob) && Array.isArray(inner) && inner.length) prob = toNum(inner[0], NaN);
  if (!Number.isFinite(prob) && inner.prediction && inner.prediction.probability !== undefined) prob = toNum(inner.prediction.probability, NaN);
  const cls = inner.predictedClass || inner.class || inner.label || (Array.isArray(inner.result) ? inner.result[0] : undefined);
  // prob is P(class A). When the remote gives a class but no parseable
  // probability, synthesize one CONSISTENT with that class (a 'C' verdict must
  // not ship as {A:0.5, C:0.5}).
  if (!Number.isFinite(prob)) prob = cls === 'A' ? 0.75 : cls === 'C' ? 0.25 : 0.5;
  prob = Math.min(1, Math.max(0, prob));
  // Deployments often report P(predicted class); if that contradicts the
  // declared class under our P(A) convention, flip it so class + confidence agree.
  if (cls === 'C' && prob > 0.5) prob = 1 - prob;
  return {
    probability: round(prob, 4),
    predictedClass: cls || (prob >= 0.5 ? 'A' : 'C'),
    probabilities: { A: round(prob, 4), C: round(1 - prob, 4) },
    classes: ['A', 'C'],
    modelAuc: toNum(inner.auc, null),
    featuresUsed: body
  };
}

/** Everything QuickML's SDK accepts is a string map. */
function stringifyInputs(body) {
  const out = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
  }
  return out;
}

/** Map a QuickML SDK response ({status, result:[...]}) onto our shape. */
function mapSdk(resp, body) {
  const first = resp && Array.isArray(resp.result) ? resp.result[0] : undefined;
  if (first === undefined) return null;
  const asNum = Number(first);
  if (Number.isFinite(asNum) && asNum >= 0 && asNum <= 1) {
    return mapRemote({ probability: asNum }, body);
  }
  return mapRemote({ predictedClass: String(first) }, body);
}

/**
 * deps = { flags, fetchImpl?, quickmlClient? } — fetchImpl injectable for tests
 * (defaults to global fetch); quickmlClient is the Catalyst SDK QuickML handle.
 *
 * Order: QuickML SDK deployment (QUICKML_ENDPOINT_KEY) -> raw deployment URL
 * (QUICKML_OUTCOME_URL) -> Zia AutoML (when its flag + model id are set) ->
 * the embedded logistic model. Every hop is a documented fallback.
 */
async function predictOutcome(body, deps) {
  const d = deps || {};
  const endpointKey = String(process.env.QUICKML_ENDPOINT_KEY || '').trim();
  if (d.flags && d.flags.quickml && d.quickmlClient && endpointKey) {
    try {
      const resp = await d.quickmlClient.predict(endpointKey, stringifyInputs(body));
      const mapped = mapSdk(resp, body);
      if (mapped) return { result: mapped, source: 'quickml-sdk' };
    } catch (e) {
      // fall through to the raw deployment URL
    }
  }
  const url = process.env.QUICKML_OUTCOME_URL;
  if (d.flags && d.flags.quickml && url) {
    try {
      const doFetch = d.fetchImpl || fetch;
      const resp = await doFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Zoho-oauthtoken ${process.env.QUICKML_API_KEY || ''}`,
          'X-QuickML-Key': process.env.QUICKML_API_KEY || ''
        },
        body: JSON.stringify({ data: body })
      });
      if (!resp.ok) throw new Error(`quickml http ${resp.status}`);
      const json = await resp.json();
      return { result: mapRemote(json, body), source: 'quickml' };
    } catch (e) {
      // fall back locally — the demo must never show an error state
    }
  }
  if (d.ziaAutoml) {
    try {
      const auto = await d.ziaAutoml(body);
      if (auto) return { result: auto, source: 'zia-automl' };
    } catch (e) {
      // fall back locally
    }
  }
  return { result: predictLocal(body), source: 'fallback-local' };
}

/**
 * Serving/training status for every model the platform can reach, so the AI
 * page can show what is live vs what needs a console step. `deps` mirrors
 * predictOutcome's; nothing here calls out over the network.
 */
function modelRegistry(deps) {
  const d = deps || {};
  const flags = d.flags || {};
  const model = (() => {
    try { return loadLocalModel(); } catch (e) { return {}; }
  })();
  const has = (v) => Boolean(String(v || '').trim());
  const state = (enabled, configured) => (enabled && configured ? 'serving' : enabled ? 'console-pending' : 'disabled');
  return [
    {
      key: 'outcome-logistic-local',
      name: 'Case-outcome logistic model (embedded)',
      task: 'binary-classification',
      target: 'Chargesheet A vs C',
      status: 'serving',
      service: 'in-function',
      trainedAt: model.trainedAt || model.trained_at || null,
      metrics: { auc: toNum(model.auc, null), features: (model.features || []).length },
      endpoint: 'POST /predict/outcome',
      fallbackFor: null
    },
    {
      key: 'quickml-outcome',
      name: 'QuickML case-outcome deployment',
      task: 'binary-classification',
      target: 'Chargesheet A vs C',
      status: state(flags.quickml, has(process.env.QUICKML_ENDPOINT_KEY) || has(process.env.QUICKML_OUTCOME_URL)),
      service: 'QuickML (no-code pipelines)',
      flag: 'FEATURE_QUICKML',
      requires: ['QUICKML_ENDPOINT_KEY or QUICKML_OUTCOME_URL', 'QUICKML_API_KEY'],
      endpoint: 'POST /predict/outcome',
      fallbackFor: 'outcome-logistic-local'
    },
    {
      key: 'zia-automl-outcome',
      name: 'Zia AutoML tabular model',
      task: 'binary-classification',
      target: 'Chargesheet A vs C',
      status: state(flags.ziaAutoml, has(process.env.ZIA_AUTOML_MODEL_ID)),
      service: 'Zia AutoML',
      flag: 'FEATURE_ZIA_AUTOML',
      requires: ['ZIA_AUTOML_MODEL_ID'],
      endpoint: 'POST /predict/outcome',
      fallbackFor: 'outcome-logistic-local'
    },
    {
      key: 'quickml-llm-rag',
      name: 'QuickML LLM serving + RAG copilot',
      task: 'text-generation',
      target: 'Natural-language crime questions',
      status: state(flags.quickmlLlm, has(process.env.QUICKML_LLM_URL)),
      service: 'QuickML LLM Serving',
      flag: 'FEATURE_QUICKML_LLM',
      requires: ['QUICKML_LLM_URL', 'QUICKML_API_KEY'],
      endpoint: 'POST /copilot/query',
      fallbackFor: 'copilot-deterministic'
    },
    {
      key: 'copilot-deterministic',
      name: 'Deterministic NL copilot',
      task: 'text-generation',
      target: 'Natural-language crime questions',
      status: 'serving',
      service: 'in-function',
      endpoint: 'POST /copilot/query',
      fallbackFor: null
    },
    {
      key: 'forecast-holt-winters',
      name: 'Holt-Winters monthly forecast',
      task: 'time-series',
      target: 'District x crime-head monthly counts',
      status: 'serving',
      service: 'offline pipeline -> ForecastMonthly',
      endpoint: 'GET /forecast',
      fallbackFor: null
    },
    {
      key: 'anomaly-robust-z',
      name: 'Robust z-score anomaly detector',
      task: 'anomaly-detection',
      target: 'District x crime-head monthly series',
      status: 'serving',
      service: 'dappa_nightly cron + dappa_event',
      endpoint: 'GET /alerts',
      fallbackFor: null
    },
    {
      key: 'zia-text-analytics',
      name: 'Zia Text Analytics (NER / keywords / sentiment)',
      task: 'nlp',
      target: 'FIR brief facts',
      status: flags.zia ? 'serving' : 'disabled',
      service: 'Zia Services',
      flag: 'FEATURE_ZIA',
      endpoint: 'POST /ai/narrative',
      fallbackFor: 'mo-vocabulary-extractor'
    },
    {
      key: 'mo-vocabulary-extractor',
      name: 'MO vocabulary extractor (deterministic)',
      task: 'nlp',
      target: 'FIR brief facts',
      status: 'serving',
      service: 'in-function',
      endpoint: 'POST /ai/narrative',
      fallbackFor: null
    },
    {
      key: 'zia-ocr',
      name: 'Zia OCR (FIR scan transcription)',
      task: 'ocr',
      target: 'Uploaded FIR scans',
      status: flags.ziaOcr ? 'serving' : 'disabled',
      service: 'Zia Services',
      flag: 'FEATURE_ZIA_OCR',
      endpoint: 'POST /zia/ocr',
      fallbackFor: 'mo-vocabulary-extractor'
    }
  ];
}

module.exports = { predictOutcome, predictLocal, loadLocalModel, modelRegistry, mapSdk, stringifyInputs };
