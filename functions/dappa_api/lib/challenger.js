'use strict';
// QuickML AutoML challenger for the case-outcome model (backlog row 170).
//
// Real path : ctx.services.quickmlClient.predict(QUICKML_AUTOML_ENDPOINT_KEY,
//             stringified features) -> { status:'success', result:[...] }
//             (3.4.0 quick-ml.d.ts; the endpoint is created in the console
//             from an AutoML pipeline — Create Pipeline -> "Create an
//             Auto-generated pipeline using AutoML").
// Flag      : FEATURE_QUICKML_AUTOML + QUICKML_AUTOML_ENDPOINT_KEY.
// Fallback  : champion only. The challenger's AUC is NEVER computed here — it
//             is read from QUICKML_AUTOML_AUC, the number the operator copies
//             from the pipeline's evaluation tab, so a figure on screen is
//             always one a judge can find in the console.
//
// The champion is the embedded logistic model (lib/quickml.js predictLocal).
// Both answer the same question (chargesheet A vs C) on the same features, so
// the two probabilities are comparable and the panel can say whether they
// agree.

const { withTimeout, AI_TIMEOUT_MS, round } = require('./util');
const { predictLocal, mapSdk, stringifyInputs, loadLocalModel } = require('./quickml');

function challengerAuc() {
  const v = Number(process.env.QUICKML_AUTOML_AUC);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : null;
}

function agreementOf(champ, chall) {
  if (!champ || !chall) return null;
  const same = champ.predictedClass === chall.predictedClass;
  const gap = round(Math.abs(champ.probability - chall.probability), 4);
  return { sameClass: same, probabilityGap: gap, word: same ? (gap <= 0.15 ? 'agree' : 'agree-on-class') : 'disagree' };
}

/**
 * deps = { flags, quickmlClient? }. Returns
 * { champion, challenger|null, agreement|null, status, source }.
 */
async function predictChallenger(body, deps) {
  const d = deps || {};
  const features = body || {};
  const champion = predictLocal(features);
  const model = (() => { try { return loadLocalModel(); } catch (e) { return {}; } })();
  const key = String(process.env.QUICKML_AUTOML_ENDPOINT_KEY || '').trim();
  const base = {
    champion: Object.assign({ model: 'logistic-embedded', auc: model.auc === undefined ? null : Number(model.auc) }, champion),
    challengerAuc: challengerAuc()
  };

  if (!(d.flags && d.flags.quickmlAutoml)) {
    return Object.assign(base, { challenger: null, agreement: null, status: 'disabled', source: 'fallback-local', note: 'FEATURE_QUICKML_AUTOML off; champion only' });
  }
  if (!d.quickmlClient || !key) {
    return Object.assign(base, { challenger: null, agreement: null, status: 'console-pending', source: 'fallback-local', note: 'Train the AutoML pipeline in the QuickML console and set QUICKML_AUTOML_ENDPOINT_KEY' });
  }
  try {
    const resp = await withTimeout(d.quickmlClient.predict(key, stringifyInputs(features)), AI_TIMEOUT_MS, 'quickml automl');
    const mapped = mapSdk(resp, features);
    if (!mapped) throw new Error('unparseable QuickML response');
    const challenger = Object.assign({ model: 'quickml-automl', auc: challengerAuc() }, mapped);
    return Object.assign(base, { challenger, agreement: agreementOf(champion, challenger), status: 'serving', source: 'quickml-sdk' });
  } catch (e) {
    return Object.assign(base, { challenger: null, agreement: null, status: 'error-fallback', source: 'fallback-local', note: `QuickML AutoML call failed (${String((e && e.message) || e).slice(0, 160)}); champion only` });
  }
}

module.exports = { predictChallenger, agreementOf, challengerAuc };
