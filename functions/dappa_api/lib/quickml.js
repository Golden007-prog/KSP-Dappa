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

/**
 * deps = { flags, fetchImpl? } — fetchImpl injectable for tests (defaults to global fetch).
 */
async function predictOutcome(body, deps) {
  const d = deps || {};
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
  return { result: predictLocal(body), source: 'fallback-local' };
}

module.exports = { predictOutcome, predictLocal, loadLocalModel };
