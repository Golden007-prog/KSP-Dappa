'use strict';
// Catalyst Zia surface used by the API.
//
//   * Text Analytics  — NER + keywords + sentiment over FIR narratives
//                       (flag FEATURE_ZIA), fallback = deterministic
//                       regex/TF extractor over the MO vocabulary.
//   * OCR             — extractOpticalCharacters() over an uploaded FIR scan
//                       (flag FEATURE_ZIA_OCR), fallback = analyse whatever
//                       text the caller could supply, with ocrAvailable:false.
//   * AutoML (tabular)— automl(modelId, data) (flag FEATURE_ZIA_AUTOML),
//                       fallback = the embedded logistic outcome model.
//   * Translation     — Zia translation has no zcatalyst-sdk-node binding in
//                       v3.4.0, so the live path is an operator-configured
//                       endpoint (ZIA_TRANSLATE_URL, flag
//                       FEATURE_ZIA_TRANSLATE) and the fallback is the pinned
//                       domain glossary below. /meta/services reports it as
//                       console-pending until that URL is set — no pretending.
//
// Every path returns the same shape as its fallback.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DISTRICTS } = require('./constants');
const { withTimeout, AI_TIMEOUT_MS } = require('./util');

const MO_VOCAB = {
  weapon: ['country-made pistol', 'country made pistol', 'machete', 'knife', 'pistol', 'firearm', 'iron rod', 'longs'],
  vehicle: ['two-wheeler without plate', 'two-wheeler', 'two wheeler', 'motorcycle', 'scooter', 'autorickshaw', 'without number plate'],
  entry: ['gas-cutter', 'gas cutter', 'lock-breaking', 'lock breaking', 'broke open the lock', 'broke open', 'duplicate key', 'scaled the compound wall', 'window grill'],
  approach: ['fake police', 'fake-police', 'posing as police', 'otp fraud', 'otp', 'one-time password', 'loan app', 'loan-app', 'kyc update', 'lottery prize', 'job offer', 'courier scam', 'electricity bill'],
  item: ['gold mangalsutra', 'mangalsutra', 'gold chain', 'gold ornaments', 'mobile phone', 'cash', 'laptop', 'jewellery', 'jewelry']
};

const NEGATIVE_LEXICON = ['assaulted', 'attacked', 'threatened', 'stabbed', 'murdered', 'killed', 'robbed', 'snatched', 'stolen', 'stole', 'cheated', 'defrauded', 'kidnapped', 'abused', 'injured', 'strangled', 'looted', 'harassed'];

const STOPWORDS = new Set(('the a an and or of in on at to from by with for was were is are be been that this his her their it as into near around about after before ' +
  'complainant accused victim stated reported known unknown person persons police station case').split(/\s+/));

function extractLocal(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const entities = [];
  const moTags = [];

  for (const [category, phrases] of Object.entries(MO_VOCAB)) {
    for (const p of phrases) {
      if (lower.includes(p)) {
        moTags.push(`${category}:${p.replace(/\s+/g, '-')}`);
        entities.push({ text: p, type: `MO_${category.toUpperCase()}` });
        break; // one tag per category keeps output compact
      }
    }
  }

  for (const d of DISTRICTS) {
    if (lower.includes(d.name.toLowerCase())) entities.push({ text: d.name, type: 'LOCATION' });
  }
  const amount = raw.match(/(?:₹|Rs\.?)\s?[\d,]+(?:\.\d+)?/g) || [];
  for (const a of amount) entities.push({ text: a, type: 'AMOUNT' });
  const dates = raw.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g) || [];
  for (const dt of dates) entities.push({ text: dt, type: 'DATE' });
  // Capitalised bigrams past sentence start read as person names in the synthetic narratives.
  const nameHits = raw.match(/(?<!^)(?<![.!?]\s)\b[A-Z][a-z]{2,}\s(?:[A-Z][a-z]{2,}|[A-Z]\b)/g) || [];
  for (const n of nameHits.slice(0, 5)) {
    if (!DISTRICTS.some((d) => d.name === n)) entities.push({ text: n, type: 'PERSON' });
  }

  // TF keyword scoring over non-stopword tokens.
  const counts = new Map();
  for (const tok of lower.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)) {
    if (tok.length < 4 || STOPWORDS.has(tok)) continue;
    counts.set(tok, (counts.get(tok) || 0) + 1);
  }
  const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([w]) => w);

  const negHits = NEGATIVE_LEXICON.filter((w) => lower.includes(w)).length;
  const sentiment = negHits >= 1 ? 'negative' : 'neutral';

  return { entities, keywords, sentiment, moTags };
}

/**
 * deps = { flags, ziaClient? } — ziaClient exposes getNERPrediction/getKeywordExtraction/getSentimentAnalysis
 * (the Catalyst SDK Zia surface). Any flag-path failure falls back locally.
 */
async function analyzeNarrative(text, deps) {
  const d = deps || {};
  if (d.flags && d.flags.zia && d.ziaClient) {
    try {
      const [ner, kw, sent] = await withTimeout(Promise.all([
        d.ziaClient.getNERPrediction([text]),
        d.ziaClient.getKeywordExtraction([text]),
        d.ziaClient.getSentimentAnalysis([text])
      ]), AI_TIMEOUT_MS, 'zia text analytics');
      // Real Zia Text Analytics shape, captured from the console's own
      // "View Response" against this project (all three SDK calls return the
      // same combined envelope):
      //   [{ ner: { general_entities: [{token, ner_tag, confidence_score}] },
      //      keyword_extractor: { keywords: [], keyphrases: [] },
      //      sentiment_prediction: [{ document_sentiment: 'Negative' }] }]
      // The previous mapping read ner[0].entities / kw[0].keywords /
      // sent[0].sentiment, none of which exist — which is why live Zia came
      // back empty while still reporting success.
      const first = (r) => (Array.isArray(r) ? r[0] : (r && Array.isArray(r.data) ? r.data[0] : r)) || {};
      const nerBody = first(ner);
      const kwBody = first(kw);
      const sentBody = first(sent);
      const rawEntities = (nerBody.ner && nerBody.ner.general_entities)
        || nerBody.general_entities || nerBody.entities || [];
      const entities = rawEntities.map((e) => ({
        text: e.token || e.text,
        type: e.ner_tag || e.type,
        confidence: e.confidence_score === undefined ? undefined : Number(e.confidence_score)
      })).filter((e) => e.text);
      const kwBox = kwBody.keyword_extractor || kwBody;
      const keywords = [...(kwBox.keywords || []), ...(kwBox.keyphrases || [])];
      const sp = sentBody.sentiment_prediction;
      const sentiment = (Array.isArray(sp) && sp[0] && sp[0].document_sentiment)
        || sentBody.document_sentiment || sentBody.sentiment || 'neutral';
      const moTags = extractLocal(text).moTags; // MO vocabulary is domain-specific either way
      // A Zia call can SUCCEED and still yield nothing usable — the service
      // returns an empty envelope when Text Analytics is not enabled for the
      // project, and the shape it returns then does not match this mapping.
      // Reporting source:'zia' there would claim live AI while handing back
      // LESS than the deterministic extractor produces. Only keep the Zia
      // result if it actually carries content.
      if (entities.length || keywords.length) {
        return { result: { entities, keywords, sentiment: String(sentiment).toLowerCase(), moTags }, source: 'zia' };
      }
      const local = extractLocal(text);
      return { result: local, source: 'fallback-local', note: 'zia returned no entities or keywords — Text Analytics likely not enabled for this project' };
    } catch (e) {
      // fall through to local extractor
    }
  }
  return { result: extractLocal(text), source: 'fallback-local' };
}

// ---------------------------------------------------------------------------
// OCR — Zia Optical Character Recognition over an uploaded FIR scan.
// ---------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function decodeImage(input) {
  const raw = String(input || '');
  if (!raw) return null;
  // Accept a bare base64 payload or a data: URI.
  const body = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
  try {
    const buf = Buffer.from(body, 'base64');
    return buf.length ? buf : null;
  } catch (e) {
    return null;
  }
}

/**
 * OCR a FIR scan and run the same MO/entity extraction over the recovered text.
 * deps = { flags, ziaClient? }.
 */
async function ocrScan(body, deps) {
  const b = body || {};
  const d = deps || {};
  const language = String(b.language || 'eng');
  // What the response REPORTS is what was actually sent: with no
  // {language} the option is omitted and Zia auto-detects the script, so
  // echoing 'eng' would tell an officer a Kannada header was read as English.
  const languageReported = b.language ? language : 'auto';
  const modelType = b.modelType ? String(b.modelType) : undefined;
  const buf = decodeImage(b.imageBase64 || b.image || b.file);
  const suppliedText = String(b.text || '').trim();

  if (buf && buf.length > MAX_IMAGE_BYTES) {
    return { result: { ok: false, reason: `image too large (${buf.length} bytes, max ${MAX_IMAGE_BYTES})` }, source: 'fallback-local' };
  }

  let ocrError = null;
  if (buf && d.flags && d.flags.ziaOcr && d.ziaClient && d.ziaClient.extractOpticalCharacters) {
    // Zia reads the upload's type from the file name, so the temp file must
    // carry the real extension — a generic `.img` came back as a failed call
    // on every scan (28 Aug 2026 live probe; docs/round2/decisions-phase8-catalyst.md).
    const fmt = sniffImageFormat(buf);
    const tmp = path.join(os.tmpdir(), `dappa-ocr-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${fmt === 'jpeg' ? 'jpg' : (fmt || 'png')}`);
    let stream = null;
    try {
      fs.writeFileSync(tmp, buf);
      const opts = modelType ? { language, modelType } : { language };
      if (!b.language) delete opts.language; // omitted -> Zia auto-detects the script
      stream = fs.createReadStream(tmp);
      stream.on('error', () => {});
      const resp = await withTimeout(
        d.ziaClient.extractOpticalCharacters(stream, opts),
        AI_TIMEOUT_MS, 'zia ocr'
      );
      const text = String((resp && resp.text) || '');
      const analysis = extractLocal(text);
      return {
        result: Object.assign({
          ok: true,
          ocrAvailable: true,
          text,
          confidence: resp && resp.confidence !== undefined ? Number(resp.confidence) : null,
          language: languageReported,
          bytes: buf.length
        }, analysis),
        source: 'zia-ocr'
      };
    } catch (e) {
      // fall through to the text-only path, keeping the reason visible
      ocrError = String((e && e.message) || e).slice(0, 200);
    } finally {
      if (stream) stream.destroy();
      try { fs.unlinkSync(tmp); } catch (e) { /* best effort */ }
    }
  }

  const text = suppliedText;
  return {
    result: Object.assign({
      ok: true,
      ocrAvailable: false,
      text,
      confidence: null,
      language: languageReported,
      bytes: buf ? buf.length : 0,
      note: buf
        ? (ocrError
          ? `Zia OCR call failed (${ocrError}); analysed the supplied {text} instead.`
          : 'Zia OCR is disabled or unreachable; supply {text} to analyse an already-transcribed FIR.')
        : 'No image supplied; analysed the provided text.'
    }, extractLocal(text)),
    source: 'fallback-local'
  };
}

const IMAGE_MAGIC = [
  ['png', [0x89, 0x50, 0x4e, 0x47]], ['jpeg', [0xff, 0xd8, 0xff]], ['gif', [0x47, 0x49, 0x46, 0x38]],
  ['bmp', [0x42, 0x4d]], ['tiff', [0x49, 0x49, 0x2a, 0x00]], ['tiff', [0x4d, 0x4d, 0x00, 0x2a]], ['pdf', [0x25, 0x50, 0x44, 0x46]]
];

function sniffImageFormat(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  for (const [name, sig] of IMAGE_MAGIC) if (sig.every((v, i) => buf[i] === v)) return name;
  return null;
}

// ---------------------------------------------------------------------------
// Translation — pinned trilingual glossary (en -> kn / hi) for the domain
// vocabulary the dashboards actually render. This is the fallback AND the
// correctness floor: even with a live translation service the glossary wins for
// these terms, so "Chain Snatching" can never come back as a literal gloss.
// ---------------------------------------------------------------------------

const TRANSLATION_GLOSSARY = {
  // crime heads
  'crimes against body': { kn: 'ದೇಹದ ವಿರುದ್ಧದ ಅಪರಾಧಗಳು' },
  'crimes against women': { kn: 'ಮಹಿಳೆಯರ ವಿರುದ್ಧದ ಅಪರಾಧಗಳು' },
  'property crimes': { kn: 'ಆಸ್ತಿ ಅಪರಾಧಗಳು' },
  'economic offences': { kn: 'ಆರ್ಥಿಕ ಅಪರಾಧಗಳು' },
  'cyber crimes': { kn: 'ಸೈಬರ್ ಅಪರಾಧಗಳು' },
  'public order': { kn: 'ಸಾರ್ವಜನಿಕ ಸುವ್ಯವಸ್ಥೆ' },
  narcotics: { kn: 'ಮಾದಕ ವಸ್ತುಗಳು' },
  others: { kn: 'ಇತರೆ' },
  // crime sub-heads
  murder: { kn: 'ಕೊಲೆ' },
  'attempt to murder': { kn: 'ಕೊಲೆ ಯತ್ನ' },
  'grievous hurt': { kn: 'ಗಂಭೀರ ಗಾಯ' },
  kidnapping: { kn: 'ಅಪಹರಣ' },
  rape: { kn: 'ಅತ್ಯಾಚಾರ' },
  'cruelty by husband': { kn: 'ಪತಿಯಿಂದ ಕ್ರೌರ್ಯ' },
  molestation: { kn: 'ಲೈಂಗಿಕ ಕಿರುಕುಳ' },
  dowry: { kn: 'ವರದಕ್ಷಿಣೆ' },
  dacoity: { kn: 'ಡಕಾಯಿತಿ' },
  robbery: { kn: 'ದರೋಡೆ' },
  'hb night': { kn: 'ರಾತ್ರಿ ಮನೆ ಒಡೆತ' },
  'hb day': { kn: 'ಹಗಲು ಮನೆ ಒಡೆತ' },
  theft: { kn: 'ಕಳ್ಳತನ' },
  'vehicle theft': { kn: 'ವಾಹನ ಕಳ್ಳತನ' },
  'chain snatching': { kn: 'ಸರ ಕಳ್ಳತನ' },
  cheating: { kn: 'ವಂಚನೆ' },
  'criminal breach of trust': { kn: 'ಕ್ರಿಮಿನಲ್ ನಂಬಿಕೆ ದ್ರೋಹ' },
  counterfeiting: { kn: 'ನಕಲಿ ತಯಾರಿಕೆ' },
  'online fraud': { kn: 'ಆನ್‌ಲೈನ್ ವಂಚನೆ' },
  'identity theft': { kn: 'ಗುರುತು ಕಳ್ಳತನ' },
  'social-media offence': { kn: 'ಸಾಮಾಜಿಕ ಮಾಧ್ಯಮ ಅಪರಾಧ' },
  riot: { kn: 'ಗಲಭೆ' },
  'unlawful assembly': { kn: 'ಕಾನೂನುಬಾಹಿರ ಸಭೆ' },
  'ndps possession': { kn: 'ಎನ್‌ಡಿಪಿಎಸ್ ಸ್ವಾಧೀನ' },
  'ndps trafficking': { kn: 'ಎನ್‌ಡಿಪಿಎಸ್ ಕಳ್ಳಸಾಗಣೆ' },
  'missing person': { kn: 'ನಾಪತ್ತೆಯಾದ ವ್ಯಕ್ತಿ' },
  'accidental death': { kn: 'ಆಕಸ್ಮಿಕ ಸಾವು' },
  // dashboard vocabulary
  dashboard: { kn: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್' },
  district: { kn: 'ಜಿಲ್ಲೆ' },
  'police station': { kn: 'ಪೊಲೀಸ್ ಠಾಣೆ' },
  alert: { kn: 'ಎಚ್ಚರಿಕೆ' },
  hotspot: { kn: 'ಹಾಟ್‌ಸ್ಪಾಟ್' },
  forecast: { kn: 'ಮುನ್ಸೂಚನೆ' },
  'risk score': { kn: 'ಅಪಾಯದ ಅಂಕ' },
  case: { kn: 'ಪ್ರಕರಣ' },
  offender: { kn: 'ಅಪರಾಧಿ' },
  victim: { kn: 'ಸಂತ್ರಸ್ತ' },
  accused: { kn: 'ಆರೋಪಿ' },
  network: { kn: 'ಜಾಲ' },
  trend: { kn: 'ಪ್ರವೃತ್ತಿ' },
  anomaly: { kn: 'ಅಸಂಗತತೆ' },
  'total firs': { kn: 'ಒಟ್ಟು ಎಫ್‌ಐಆರ್‌ಗಳು' },
  'detection rate': { kn: 'ಪತ್ತೆ ದರ' },
  heinous: { kn: 'ಘೋರ' },
  month: { kn: 'ತಿಂಗಳು' },
  night: { kn: 'ರಾತ್ರಿ' },
  report: { kn: 'ವರದಿ' },
  search: { kn: 'ಹುಡುಕಾಟ' },
  summary: { kn: 'ಸಾರಾಂಶ' },
  'high risk': { kn: 'ಹೆಚ್ಚಿನ ಅಪಾಯ' }
};

const TRANSLATION_LANGS = ['en', 'kn'];

function glossaryLookup(text, target) {
  const key = String(text || '').trim().toLowerCase();
  if (!key) return null;
  if (target === 'en') return TRANSLATION_GLOSSARY[key] ? String(text).trim() : null;
  const hit = TRANSLATION_GLOSSARY[key];
  return hit && hit[target] ? hit[target] : null;
}

/**
 * Translate short UI/domain strings into Kannada (the only non-English UI locale since the Hindi locale was retired on 27 Aug 2026).
 * deps = { flags, fetchImpl? }. The live path needs ZIA_TRANSLATE_URL; the
 * glossary answers everything it knows either way, and untranslated strings
 * come back unchanged with translated:false rather than a guess.
 */
async function translate(body, deps) {
  const b = body || {};
  const d = deps || {};
  const target = TRANSLATION_LANGS.includes(String(b.target || b.to)) ? String(b.target || b.to) : 'kn';
  const sourceLang = TRANSLATION_LANGS.includes(String(b.source || b.from)) ? String(b.source || b.from) : 'en';
  const inputs = (Array.isArray(b.texts) ? b.texts : [b.text]).map((t) => String(t === undefined || t === null ? '' : t)).filter((t) => t.trim());
  if (!inputs.length) return { result: { target, source: sourceLang, items: [] }, source: 'fallback-local' };
  if (inputs.length > 50) return { result: { ok: false, reason: 'max 50 strings per request' }, source: 'fallback-local' };

  const glossed = inputs.map((text) => {
    const hit = glossaryLookup(text, target);
    return { text, translated: hit || text, ok: Boolean(hit), engine: hit ? 'glossary' : 'passthrough' };
  });

  const url = String(process.env.ZIA_TRANSLATE_URL || '').trim();
  if (d.flags && d.flags.ziaTranslate && url) {
    const pending = glossed.filter((g) => !g.ok).map((g) => g.text);
    if (pending.length) {
      try {
        const doFetch = d.fetchImpl || fetch;
        const resp = await doFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Zoho-oauthtoken ${process.env.ZIA_API_KEY || ''}`
          },
          body: JSON.stringify({ text: pending, source_language: sourceLang, target_language: target })
        });
        if (resp && resp.ok) {
          const json = await resp.json();
          const out = (json && (json.data || json.translations || json.result)) || [];
          const list = Array.isArray(out) ? out : [out];
          let i = 0;
          for (const g of glossed) {
            if (g.ok) continue;
            const hit = list[i];
            i += 1;
            const value = hit && (hit.translated_text || hit.translation || hit.text || (typeof hit === 'string' ? hit : null));
            if (value) { g.translated = String(value); g.ok = true; g.engine = 'zia-translate'; }
          }
          return { result: { target, source: sourceLang, items: glossed }, source: 'zia-translate' };
        }
      } catch (e) {
        // fall through to glossary-only output
      }
    }
  }
  return { result: { target, source: sourceLang, items: glossed }, source: 'fallback-local' };
}

// ---------------------------------------------------------------------------
// Zia AutoML (tabular) — model-serving path for the case-outcome model.
// ---------------------------------------------------------------------------

/**
 * deps = { flags, ziaClient? }. Returns null when the flag path is unavailable
 * so the caller can fall back to the embedded logistic model.
 */
async function automlPredict(body, deps) {
  const d = deps || {};
  const modelId = String(process.env.ZIA_AUTOML_MODEL_ID || '').trim();
  if (!(d.flags && d.flags.ziaAutoml) || !d.ziaClient || !d.ziaClient.automl || !modelId) return null;
  try {
    const out = await withTimeout(d.ziaClient.automl(modelId, body || {}), AI_TIMEOUT_MS, 'zia automl');
    const cls = (out && out.classification_result) || null;
    if (cls && typeof cls === 'object') {
      const pA = Number(cls.A !== undefined ? cls.A : cls['1'] !== undefined ? cls['1'] : NaN);
      if (Number.isFinite(pA)) {
        const p = Math.min(1, Math.max(0, pA));
        return {
          probability: Math.round(p * 10000) / 10000,
          predictedClass: p >= 0.5 ? 'A' : 'C',
          probabilities: { A: Math.round(p * 10000) / 10000, C: Math.round((1 - p) * 10000) / 10000 },
          classes: ['A', 'C'],
          modelAuc: null,
          featuresUsed: body || {},
          modelId
        };
      }
    }
    if (out && out.regression_result !== undefined) {
      const p = Math.min(1, Math.max(0, Number(out.regression_result)));
      return {
        probability: Math.round(p * 10000) / 10000,
        predictedClass: p >= 0.5 ? 'A' : 'C',
        probabilities: { A: Math.round(p * 10000) / 10000, C: Math.round((1 - p) * 10000) / 10000 },
        classes: ['A', 'C'],
        modelAuc: null,
        featuresUsed: body || {},
        modelId
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  analyzeNarrative,
  extractLocal,
  ocrScan,
  translate,
  automlPredict,
  glossaryLookup,
  MO_VOCAB,
  TRANSLATION_GLOSSARY,
  TRANSLATION_LANGS,
  MAX_IMAGE_BYTES
};
