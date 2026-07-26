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
      const [ner, kw, sent] = await Promise.all([
        d.ziaClient.getNERPrediction([text]),
        d.ziaClient.getKeywordExtraction([text]),
        d.ziaClient.getSentimentAnalysis([text])
      ]);
      const entities = ((ner && ner[0] && ner[0].entities) || []).map((e) => ({ text: e.token || e.text, type: e.ner_tag || e.type }));
      const keywords = (kw && kw[0] && (kw[0].keywords || kw[0].keyphrases)) || [];
      const sentiment = (sent && sent[0] && (sent[0].sentiment || (sent[0].document_sentiment || {}).sentiment)) || 'neutral';
      const moTags = extractLocal(text).moTags; // MO vocabulary is domain-specific either way
      return { result: { entities, keywords, sentiment: String(sentiment).toLowerCase(), moTags }, source: 'zia' };
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
  const modelType = b.modelType ? String(b.modelType) : undefined;
  const buf = decodeImage(b.imageBase64 || b.image || b.file);
  const suppliedText = String(b.text || '').trim();

  if (buf && buf.length > MAX_IMAGE_BYTES) {
    return { result: { ok: false, reason: `image too large (${buf.length} bytes, max ${MAX_IMAGE_BYTES})` }, source: 'fallback-local' };
  }

  if (buf && d.flags && d.flags.ziaOcr && d.ziaClient && d.ziaClient.extractOpticalCharacters) {
    const tmp = path.join(os.tmpdir(), `dappa-ocr-${Date.now()}-${Math.floor(Math.random() * 1e6)}.img`);
    try {
      fs.writeFileSync(tmp, buf);
      const opts = modelType ? { language, modelType } : { language };
      const resp = await d.ziaClient.extractOpticalCharacters(fs.createReadStream(tmp), opts);
      const text = String((resp && resp.text) || '');
      const analysis = extractLocal(text);
      return {
        result: Object.assign({
          ok: true,
          ocrAvailable: true,
          text,
          confidence: resp && resp.confidence !== undefined ? Number(resp.confidence) : null,
          language,
          bytes: buf.length
        }, analysis),
        source: 'zia-ocr'
      };
    } catch (e) {
      // fall through to the text-only path
    } finally {
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
      language,
      bytes: buf ? buf.length : 0,
      note: buf
        ? 'Zia OCR is disabled or unreachable; supply {text} to analyse an already-transcribed FIR.'
        : 'No image supplied; analysed the provided text.'
    }, extractLocal(text)),
    source: 'fallback-local'
  };
}

// ---------------------------------------------------------------------------
// Translation — pinned trilingual glossary (en -> kn / hi) for the domain
// vocabulary the dashboards actually render. This is the fallback AND the
// correctness floor: even with a live translation service the glossary wins for
// these terms, so "Chain Snatching" can never come back as a literal gloss.
// ---------------------------------------------------------------------------

const TRANSLATION_GLOSSARY = {
  // crime heads
  'crimes against body': { kn: 'ದೇಹದ ವಿರುದ್ಧದ ಅಪರಾಧಗಳು', hi: 'शरीर के विरुद्ध अपराध' },
  'crimes against women': { kn: 'ಮಹಿಳೆಯರ ವಿರುದ್ಧದ ಅಪರಾಧಗಳು', hi: 'महिलाओं के विरुद्ध अपराध' },
  'property crimes': { kn: 'ಆಸ್ತಿ ಅಪರಾಧಗಳು', hi: 'संपत्ति संबंधी अपराध' },
  'economic offences': { kn: 'ಆರ್ಥಿಕ ಅಪರಾಧಗಳು', hi: 'आर्थिक अपराध' },
  'cyber crimes': { kn: 'ಸೈಬರ್ ಅಪರಾಧಗಳು', hi: 'साइबर अपराध' },
  'public order': { kn: 'ಸಾರ್ವಜನಿಕ ಸುವ್ಯವಸ್ಥೆ', hi: 'लोक व्यवस्था' },
  narcotics: { kn: 'ಮಾದಕ ವಸ್ತುಗಳು', hi: 'मादक पदार्थ' },
  others: { kn: 'ಇತರೆ', hi: 'अन्य' },
  // crime sub-heads
  murder: { kn: 'ಕೊಲೆ', hi: 'हत्या' },
  'attempt to murder': { kn: 'ಕೊಲೆ ಯತ್ನ', hi: 'हत्या का प्रयास' },
  'grievous hurt': { kn: 'ಗಂಭೀರ ಗಾಯ', hi: 'गंभीर चोट' },
  kidnapping: { kn: 'ಅಪಹರಣ', hi: 'अपहरण' },
  rape: { kn: 'ಅತ್ಯಾಚಾರ', hi: 'बलात्कार' },
  'cruelty by husband': { kn: 'ಪತಿಯಿಂದ ಕ್ರೌರ್ಯ', hi: 'पति द्वारा क्रूरता' },
  molestation: { kn: 'ಲೈಂಗಿಕ ಕಿರುಕುಳ', hi: 'छेड़छाड़' },
  dowry: { kn: 'ವರದಕ್ಷಿಣೆ', hi: 'दहेज' },
  dacoity: { kn: 'ಡಕಾಯಿತಿ', hi: 'डकैती' },
  robbery: { kn: 'ದರೋಡೆ', hi: 'लूट' },
  'hb night': { kn: 'ರಾತ್ರಿ ಮನೆ ಒಡೆತ', hi: 'रात्रि गृहभेदन' },
  'hb day': { kn: 'ಹಗಲು ಮನೆ ಒಡೆತ', hi: 'दिवस गृहभेदन' },
  theft: { kn: 'ಕಳ್ಳತನ', hi: 'चोरी' },
  'vehicle theft': { kn: 'ವಾಹನ ಕಳ್ಳತನ', hi: 'वाहन चोरी' },
  'chain snatching': { kn: 'ಸರ ಕಳ್ಳತನ', hi: 'चेन स्नैचिंग' },
  cheating: { kn: 'ವಂಚನೆ', hi: 'धोखाधड़ी' },
  'criminal breach of trust': { kn: 'ಕ್ರಿಮಿನಲ್ ನಂಬಿಕೆ ದ್ರೋಹ', hi: 'आपराधिक न्यासभंग' },
  counterfeiting: { kn: 'ನಕಲಿ ತಯಾರಿಕೆ', hi: 'जालसाजी' },
  'online fraud': { kn: 'ಆನ್‌ಲೈನ್ ವಂಚನೆ', hi: 'ऑनलाइन धोखाधड़ी' },
  'identity theft': { kn: 'ಗುರುತು ಕಳ್ಳತನ', hi: 'पहचान की चोरी' },
  'social-media offence': { kn: 'ಸಾಮಾಜಿಕ ಮಾಧ್ಯಮ ಅಪರಾಧ', hi: 'सोशल मीडिया अपराध' },
  riot: { kn: 'ಗಲಭೆ', hi: 'दंगा' },
  'unlawful assembly': { kn: 'ಕಾನೂನುಬಾಹಿರ ಸಭೆ', hi: 'गैरकानूनी जमाव' },
  'ndps possession': { kn: 'ಎನ್‌ಡಿಪಿಎಸ್ ಸ್ವಾಧೀನ', hi: 'एनडीपीएस कब्जा' },
  'ndps trafficking': { kn: 'ಎನ್‌ಡಿಪಿಎಸ್ ಕಳ್ಳಸಾಗಣೆ', hi: 'एनडीपीएस तस्करी' },
  'missing person': { kn: 'ನಾಪತ್ತೆಯಾದ ವ್ಯಕ್ತಿ', hi: 'लापता व्यक्ति' },
  'accidental death': { kn: 'ಆಕಸ್ಮಿಕ ಸಾವು', hi: 'आकस्मिक मृत्यु' },
  // dashboard vocabulary
  dashboard: { kn: 'ಡ್ಯಾಶ್‌ಬೋರ್ಡ್', hi: 'डैशबोर्ड' },
  district: { kn: 'ಜಿಲ್ಲೆ', hi: 'जिला' },
  'police station': { kn: 'ಪೊಲೀಸ್ ಠಾಣೆ', hi: 'पुलिस थाना' },
  alert: { kn: 'ಎಚ್ಚರಿಕೆ', hi: 'चेतावनी' },
  hotspot: { kn: 'ಹಾಟ್‌ಸ್ಪಾಟ್', hi: 'हॉटस्पॉट' },
  forecast: { kn: 'ಮುನ್ಸೂಚನೆ', hi: 'पूर्वानुमान' },
  'risk score': { kn: 'ಅಪಾಯದ ಅಂಕ', hi: 'जोखिम स्कोर' },
  case: { kn: 'ಪ್ರಕರಣ', hi: 'मामला' },
  offender: { kn: 'ಅಪರಾಧಿ', hi: 'अपराधी' },
  victim: { kn: 'ಸಂತ್ರಸ್ತ', hi: 'पीड़ित' },
  accused: { kn: 'ಆರೋಪಿ', hi: 'अभियुक्त' },
  network: { kn: 'ಜಾಲ', hi: 'नेटवर्क' },
  trend: { kn: 'ಪ್ರವೃತ್ತಿ', hi: 'रुझान' },
  anomaly: { kn: 'ಅಸಂಗತತೆ', hi: 'विसंगति' },
  'total firs': { kn: 'ಒಟ್ಟು ಎಫ್‌ಐಆರ್‌ಗಳು', hi: 'कुल एफआईआर' },
  'detection rate': { kn: 'ಪತ್ತೆ ದರ', hi: 'पहचान दर' },
  heinous: { kn: 'ಘೋರ', hi: 'जघन्य' },
  month: { kn: 'ತಿಂಗಳು', hi: 'महीना' },
  night: { kn: 'ರಾತ್ರಿ', hi: 'रात' },
  report: { kn: 'ವರದಿ', hi: 'रिपोर्ट' },
  search: { kn: 'ಹುಡುಕಾಟ', hi: 'खोज' },
  summary: { kn: 'ಸಾರಾಂಶ', hi: 'सारांश' },
  'high risk': { kn: 'ಹೆಚ್ಚಿನ ಅಪಾಯ', hi: 'उच्च जोखिम' }
};

const TRANSLATION_LANGS = ['en', 'kn', 'hi'];

function glossaryLookup(text, target) {
  const key = String(text || '').trim().toLowerCase();
  if (!key) return null;
  if (target === 'en') return TRANSLATION_GLOSSARY[key] ? String(text).trim() : null;
  const hit = TRANSLATION_GLOSSARY[key];
  return hit && hit[target] ? hit[target] : null;
}

/**
 * Translate short UI/domain strings into kn/hi.
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
    const out = await d.ziaClient.automl(modelId, body || {});
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
