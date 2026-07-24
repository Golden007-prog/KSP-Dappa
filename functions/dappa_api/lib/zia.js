'use strict';
// Narrative insight extraction. Flag path calls Catalyst Zia Text Analytics;
// fallback is a deterministic regex/TF-IDF extractor over the generator's MO
// vocabulary. Both return the same shape.

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

module.exports = { analyzeNarrative, extractLocal, MO_VOCAB };
