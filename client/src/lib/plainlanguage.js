// Plain-language glossary — every statistical term the app shows gets an
// officer-facing translation that appears INSTEAD of the jargon, with the
// technical term one tap away. Built as one layer (not scattered string
// edits) so a term reads the same on every screen and in both languages.
//
// Sources: docs/UX_RESEARCH.md §11 — rules traced to the UK Office for
// Statistics Regulation / Government Analysis Function / ONS service manual
// (say "estimate", ranges as a plain sentence, natural frequencies "X out of
// 100", jargon in the tooltip never in the label) and GIGW 3.0 (no
// unexplained jargon; a glossary). Kannada labels marked `unv` in that
// document are proposals awaiting sign-off by a Kannada-speaking officer;
// they are used because an untranslated label is a visible defect, and the
// review status is shown in the About glossary.
//
// Shape per term: label (what the card says), sentence (first line of the
// tooltip / expanded view), example (About glossary), technical (the term and
// formula, always available). {vars} interpolate the same way as i18n.
import { useI18n } from './i18n.jsx';
import { useTierStore } from './tier.js';

export const GLOSSARY = {
  zscore: {
    technical: 'z-score = (observed − expected) / σ',
    en: { label: 'How far above normal', sentence: '0 is normal; each whole number is one normal week-to-week swing. Above 2 is worth a look; above 3 is rare by chance.', example: 'Peenya, burglary: 41 this week against a usual 18 — about 3 swings above normal (z = 3.1).', value: (z) => `${Math.abs(z) < 2 ? 'within the normal range' : `about ${Math.round(Math.abs(z))} swing${Math.round(Math.abs(z)) === 1 ? '' : 's'} ${z >= 0 ? 'above' : 'below'} normal`}` },
    kn: { label: 'ಸಾಮಾನ್ಯಕ್ಕಿಂತ ಎಷ್ಟು ಹೆಚ್ಚು', sentence: '0 ಎಂದರೆ ಸಾಮಾನ್ಯ; ಪ್ರತಿ ಪೂರ್ಣ ಸಂಖ್ಯೆ ಒಂದು ಸಾಮಾನ್ಯ ವಾರದ ಏರಿಳಿತ. 2ಕ್ಕಿಂತ ಮೇಲೆ ಗಮನಿಸಬೇಕು; 3ಕ್ಕಿಂತ ಮೇಲೆ ಆಕಸ್ಮಿಕವಾಗಿ ಅಪರೂಪ.', example: 'ಪೀಣ್ಯ, ಮನೆ ಒಡೆತ: ಸಾಮಾನ್ಯ 18ರ ಬದಲು ಈ ವಾರ 41 — ಸುಮಾರು 3 ಏರಿಳಿತ ಹೆಚ್ಚು (z = 3.1).', value: (z) => (Math.abs(z) < 2 ? 'ಸಾಮಾನ್ಯ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ' : `ಸಾಮಾನ್ಯಕ್ಕಿಂತ ಸುಮಾರು ${Math.round(Math.abs(z))} ಏರಿಳಿತ ${z >= 0 ? 'ಹೆಚ್ಚು' : 'ಕಡಿಮೆ'}`), status: 'unv' },
  },
  mape: {
    technical: 'MAPE — mean absolute percentage error of the backtest',
    en: { label: 'Typical forecast miss', sentence: 'On past months this forecast was off by about {pct}% either way.', example: 'Forecast 140, typical miss 12 % → expect roughly 125–155.' },
    kn: { label: 'ಮುನ್ಸೂಚನೆಯ ಸರಾಸರಿ ದೋಷ', sentence: 'ಹಿಂದಿನ ತಿಂಗಳುಗಳಲ್ಲಿ ಈ ಮುನ್ಸೂಚನೆ ಸುಮಾರು {pct}% ಹೆಚ್ಚು ಅಥವಾ ಕಡಿಮೆ ಇತ್ತು.', example: 'ಮುನ್ಸೂಚನೆ 140, ಸರಾಸರಿ ದೋಷ 12 % → ಸುಮಾರು 125–155 ನಿರೀಕ್ಷಿಸಿ.', status: 'unv' },
  },
  cluster: {
    technical: 'ST-DBSCAN cluster (ε radius, minPts) over lat/lng × hour-of-day',
    en: { label: 'Hotspot', sentence: '{n} incidents within {radius} m of each other, {window}, last {weeks} weeks. This is a patch, not a whole area.', example: '27 incidents within 400 m of each other, 11 PM–3 AM, last 8 weeks.' },
    kn: { label: 'ಹಾಟ್‌ಸ್ಪಾಟ್', sentence: '{n} ಘಟನೆಗಳು ಪರಸ್ಪರ {radius} ಮೀ ಒಳಗೆ, {window}, ಕಳೆದ {weeks} ವಾರಗಳಲ್ಲಿ. ಇದು ಒಂದು ತಾಣ, ಇಡೀ ಪ್ರದೇಶವಲ್ಲ.', example: '27 ಘಟನೆಗಳು 400 ಮೀ ಒಳಗೆ, ರಾತ್ರಿ 11–3, ಕಳೆದ 8 ವಾರ.', status: 'repo' },
  },
  community: {
    technical: 'Louvain community over the co-accusal graph',
    en: { label: 'Group', sentence: '{n} people who keep turning up in the same cases across {districts} districts. The computer only counts shared cases — it does not know they are a gang.', example: '9 people who keep turning up in the same cases across 4 districts.' },
    kn: { label: 'ಗುಂಪು', sentence: '{districts} ಜಿಲ್ಲೆಗಳಲ್ಲಿ ಒಂದೇ ಪ್ರಕರಣಗಳಲ್ಲಿ ಮತ್ತೆ ಮತ್ತೆ ಕಾಣಿಸುವ {n} ಜನ. ಕಂಪ್ಯೂಟರ್ ಹಂಚಿಕೆಯ ಪ್ರಕರಣಗಳನ್ನು ಮಾತ್ರ ಎಣಿಸುತ್ತದೆ — ಅವರು ಗ್ಯಾಂಗ್ ಎಂದು ಅದಕ್ಕೆ ಗೊತ್ತಿಲ್ಲ.', example: '4 ಜಿಲ್ಲೆಗಳಲ್ಲಿ ಒಂದೇ ಪ್ರಕರಣಗಳಲ್ಲಿ ಕಾಣಿಸುವ 9 ಜನ.', status: 'kn-V' },
  },
  gistar: {
    technical: 'Getis–Ord Gi* local spatial statistic',
    en: { label: 'Confirmed hotspot', sentence: 'High here and in the surrounding beats. A pattern like this would show up by chance fewer than 5 times in 100.', example: 'Confirmed hotspot: the unit and its neighbours are all above their usual level.' },
    kn: { label: 'ಖಚಿತಪಡಿಸಿದ ಹಾಟ್‌ಸ್ಪಾಟ್', sentence: 'ಇಲ್ಲೂ ಸುತ್ತಲಿನ ಬೀಟ್‌ಗಳಲ್ಲೂ ಹೆಚ್ಚು. ಇಂತಹ ಮಾದರಿ ಆಕಸ್ಮಿಕವಾಗಿ 100ರಲ್ಲಿ 5ಕ್ಕಿಂತ ಕಡಿಮೆ ಬಾರಿ ಕಾಣಿಸುತ್ತದೆ.', example: 'ಠಾಣೆ ಮತ್ತು ನೆರೆಯ ಠಾಣೆಗಳು ಎಲ್ಲವೂ ಸಾಮಾನ್ಯ ಮಟ್ಟಕ್ಕಿಂತ ಮೇಲೆ.', status: 'unv' },
  },
  coreness: {
    technical: 'k-core number (coreness)',
    en: { label: 'Inner circle level', sentence: 'Level {k} means this person is linked to at least {k} others who are each linked to at least {k} others — a core member, not a hanger-on.', example: 'Level 4: a core member of the group.' },
    kn: { label: 'ಜಾಲದ ಒಳವಲಯ ಮಟ್ಟ', sentence: 'ಮಟ್ಟ {k} ಎಂದರೆ ಈ ವ್ಯಕ್ತಿ ಕನಿಷ್ಠ {k} ಜನರೊಂದಿಗೆ ಸಂಪರ್ಕದಲ್ಲಿದ್ದಾರೆ, ಅವರೂ ಕನಿಷ್ಠ {k} ಜನರೊಂದಿಗೆ — ಕೇಂದ್ರ ಸದಸ್ಯ, ಅಂಚಿನವರಲ್ಲ.', example: 'ಮಟ್ಟ 4: ಗುಂಪಿನ ಕೇಂದ್ರ ಸದಸ್ಯ.', status: 'unv' },
  },
  betweenness: {
    technical: 'betweenness centrality',
    en: { label: 'Go-between', sentence: 'Sits on the shortest path between others more than anyone else here. Remove them and the two groups stop touching.', example: 'The one person linking the Mysuru and Mandya groups.' },
    kn: { label: 'ಸಂಪರ್ಕ ಸೇತು', sentence: 'ಇತರರ ನಡುವಿನ ಕಡಿಮೆ ದಾರಿಯಲ್ಲಿ ಎಲ್ಲರಿಗಿಂತ ಹೆಚ್ಚು ಬಾರಿ ನಿಂತಿದ್ದಾರೆ. ಇವರನ್ನು ತೆಗೆದರೆ ಎರಡು ಗುಂಪುಗಳ ಸಂಪರ್ಕ ನಿಲ್ಲುತ್ತದೆ.', example: 'ಮೈಸೂರು ಮತ್ತು ಮಂಡ್ಯ ಗುಂಪುಗಳನ್ನು ಜೋಡಿಸುವ ಒಬ್ಬ ವ್ಯಕ್ತಿ.', status: 'unv' },
  },
  calibration: {
    technical: 'calibration — predicted probability vs observed frequency',
    en: { label: 'Does the score mean what it says?', sentence: 'When the model said {pct}%, about {pct} of every 100 such past cases did end in a chargesheet. Read the score as a plain percentage.', example: 'When the model said 70 %, about 70 of every 100 such past cases did end in a chargesheet.' },
    kn: { label: 'ಅಂಕ ನಿಜಕ್ಕೂ ಹೊಂದುತ್ತದೆಯೇ?', sentence: 'ಮಾದರಿ {pct}% ಎಂದಾಗ, ಅಂತಹ ಹಿಂದಿನ 100 ಪ್ರಕರಣಗಳಲ್ಲಿ ಸುಮಾರು {pct} ದೋಷಾರೋಪ ಪಟ್ಟಿಯಲ್ಲಿ ಮುಗಿದವು. ಅಂಕವನ್ನು ಸರಳ ಶೇಕಡಾವಾಗಿ ಓದಿ.', example: 'ಮಾದರಿ 70 % ಎಂದಾಗ 100ರಲ್ಲಿ ಸುಮಾರು 70 ಪ್ರಕರಣ ದೋಷಾರೋಪ ಪಟ್ಟಿಯಲ್ಲಿ ಮುಗಿದವು.', status: 'unv' },
  },
  auc: {
    technical: 'ROC-AUC',
    en: { label: 'Sorting power', sentence: 'Take one chargesheeted case and one that was not: the model ranks the right one higher {n} times out of 100. 50 out of 100 is a coin toss.', example: 'Case-status model: 50 out of 100 — no better than a coin; shown as a negative result.', value: (auc) => `${Math.round(auc * 100)} out of 100${auc <= 0.55 ? ' — a coin toss' : ''}` },
    kn: { label: 'ಮಾದರಿಯ ವಿಂಗಡಣಾ ಶಕ್ತಿ', sentence: 'ಒಂದು ದೋಷಾರೋಪ ಪಟ್ಟಿ ಪ್ರಕರಣ ಮತ್ತು ಒಂದು ಅಲ್ಲದ್ದನ್ನು ತೆಗೆದುಕೊಳ್ಳಿ: ಮಾದರಿ 100ರಲ್ಲಿ {n} ಬಾರಿ ಸರಿಯಾದದ್ದನ್ನು ಮೇಲೆ ಇಡುತ್ತದೆ. 100ರಲ್ಲಿ 50 ಎಂದರೆ ನಾಣ್ಯ ಚಿಮ್ಮಿಸಿದಂತೆ.', example: 'ಪ್ರಕರಣ-ಸ್ಥಿತಿ ಮಾದರಿ: 100ರಲ್ಲಿ 50 — ನಾಣ್ಯಕ್ಕಿಂತ ಉತ್ತಮವಲ್ಲ; ನಕಾರಾತ್ಮಕ ಫಲಿತಾಂಶವಾಗಿ ತೋರಿಸಲಾಗಿದೆ.', value: (auc) => `100ರಲ್ಲಿ ${Math.round(auc * 100)}${auc <= 0.55 ? ' — ನಾಣ್ಯ ಚಿಮ್ಮಿಸಿದಂತೆ' : ''}`, status: 'unv' },
  },
  percentile: {
    technical: 'percentile rank',
    en: { label: 'Rank', sentence: 'Higher than {p} of every 100 stations.', example: 'Higher than 90 of every 100 stations.', value: (p) => `higher than ${Math.round(p)} of every 100` },
    kn: { label: 'ಶ್ರೇಣಿ', sentence: '100 ಠಾಣೆಗಳಲ್ಲಿ {p}ಕ್ಕಿಂತ ಹೆಚ್ಚು.', example: '100 ಠಾಣೆಗಳಲ್ಲಿ 90ಕ್ಕಿಂತ ಹೆಚ್ಚು.', value: (p) => `100ರಲ್ಲಿ ${Math.round(p)}ಕ್ಕಿಂತ ಹೆಚ್ಚು`, status: 'unv' },
  },
  interval: {
    technical: '80 % prediction interval',
    en: { label: 'Likely range', sentence: 'We expect around {mid} next month — most likely between {lo} and {hi}; the true number lands in that band 8 times in 10.', example: 'Around 140 cases next month — most likely between 120 and 160.' },
    kn: { label: 'ನಿರೀಕ್ಷಿತ ವ್ಯಾಪ್ತಿ', sentence: 'ಮುಂದಿನ ತಿಂಗಳು ಸುಮಾರು {mid} ನಿರೀಕ್ಷೆ — ಬಹುಶಃ {lo} ಮತ್ತು {hi} ನಡುವೆ; ನಿಜವಾದ ಸಂಖ್ಯೆ 10ರಲ್ಲಿ 8 ಬಾರಿ ಈ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ಬರುತ್ತದೆ.', example: 'ಮುಂದಿನ ತಿಂಗಳು ಸುಮಾರು 140 — ಬಹುಶಃ 120 ರಿಂದ 160.', status: 'unv' },
  },
  anomaly: {
    technical: 'statistical anomaly (robust z-score)',
    en: { label: 'Unusual rise', sentence: 'Well outside this station’s normal range. It says where to look, not why.', example: 'An unusual rise in chain snatching at Yeshwanthpur this week.' },
    kn: { label: 'ಅಸಾಮಾನ್ಯ ಏರಿಕೆ', sentence: 'ಈ ಠಾಣೆಯ ಸಾಮಾನ್ಯ ವ್ಯಾಪ್ತಿಯಿಂದ ಬಹಳ ಹೊರಗೆ. ಎಲ್ಲಿ ನೋಡಬೇಕು ಎಂದು ಹೇಳುತ್ತದೆ, ಏಕೆ ಎಂದಲ್ಲ.', example: 'ಈ ವಾರ ಯಶವಂತಪುರದಲ್ಲಿ ಸರ ಕಳ್ಳತನದ ಅಸಾಮಾನ್ಯ ಏರಿಕೆ.', status: 'unv' },
  },
  baseline: {
    technical: 'seasonal baseline (8-week / same-week-prior-years average)',
    en: { label: 'Usual level', sentence: 'The average of the same weeks in earlier years, adjusted for season.', example: 'Usual level 18/week · this week 41.' },
    kn: { label: 'ಸಾಮಾನ್ಯ ಮಟ್ಟ', sentence: 'ಹಿಂದಿನ ವರ್ಷಗಳ ಅದೇ ವಾರಗಳ ಸರಾಸರಿ, ಋತುವಿಗೆ ಹೊಂದಿಸಿ.', example: 'ಸಾಮಾನ್ಯ ಮಟ್ಟ ವಾರಕ್ಕೆ 18 · ಈ ವಾರ 41.', status: 'unv' },
  },
  seasonality: {
    technical: 'seasonality (hour × weekday, festival windows)',
    en: { label: 'Regular pattern', sentence: 'Thefts rise every festival week and accidents every Saturday night. The forecast knows the rhythm, so a festival spike alone does not raise an alert.', example: 'Regular pattern: Saturday nights and festival weeks.' },
    kn: { label: 'ಋತುಮಾನ ಮಾದರಿ', sentence: 'ಪ್ರತಿ ಹಬ್ಬದ ವಾರ ಕಳ್ಳತನ ಮತ್ತು ಪ್ರತಿ ಶನಿವಾರ ರಾತ್ರಿ ಅಪಘಾತ ಹೆಚ್ಚುತ್ತವೆ. ಮುನ್ಸೂಚನೆಗೆ ಈ ಲಯ ಗೊತ್ತು, ಆದ್ದರಿಂದ ಹಬ್ಬದ ಏರಿಕೆ ಮಾತ್ರ ಎಚ್ಚರಿಕೆ ಎಬ್ಬಿಸುವುದಿಲ್ಲ.', example: 'ಶನಿವಾರ ರಾತ್ರಿ ಮತ್ತು ಹಬ್ಬದ ವಾರಗಳ ಮಾದರಿ.', status: 'repo' },
  },
  ego: {
    technical: 'ego network (1-hop neighbourhood)',
    en: { label: 'This person’s circle', sentence: 'Everyone directly linked to {name}, and how they link to each other. One step out — not the whole network.', example: 'Everyone directly linked to Ravi Kumar.' },
    kn: { label: 'ಈ ವ್ಯಕ್ತಿಯ ಸಂಪರ್ಕ ವಲಯ', sentence: '{name} ಅವರೊಂದಿಗೆ ನೇರ ಸಂಪರ್ಕದಲ್ಲಿರುವ ಎಲ್ಲರೂ, ಮತ್ತು ಅವರ ಪರಸ್ಪರ ಸಂಪರ್ಕ. ಒಂದು ಹೆಜ್ಜೆ ಹೊರಗೆ — ಇಡೀ ಜಾಲವಲ್ಲ.', example: 'ರವಿ ಕುಮಾರ್ ಅವರೊಂದಿಗೆ ನೇರ ಸಂಪರ್ಕದಲ್ಲಿರುವ ಎಲ್ಲರೂ.', status: 'unv' },
  },
  forecast: {
    technical: 'Holt-Winters forecast',
    en: { label: 'Expected next month', sentence: 'What the station usually sees plus its recent trend — an estimate, not a promise.', example: 'Expected next month: around 140.' },
    kn: { label: 'ಮುಂದಿನ ತಿಂಗಳ ನಿರೀಕ್ಷೆ', sentence: 'ಠಾಣೆ ಸಾಮಾನ್ಯವಾಗಿ ಕಾಣುವುದು ಮತ್ತು ಇತ್ತೀಚಿನ ಪ್ರವೃತ್ತಿ — ಅಂದಾಜು, ಭರವಸೆಯಲ್ಲ.', example: 'ಮುಂದಿನ ತಿಂಗಳ ನಿರೀಕ್ಷೆ: ಸುಮಾರು 140.', status: 'kn-V' },
  },
  rate: {
    technical: 'crime rate per lakh population',
    en: { label: 'Per lakh people', sentence: 'Cases for every one lakh residents, so a big city and a small district compare fairly.', example: '312 per lakh in Bengaluru City.' },
    kn: { label: 'ಲಕ್ಷ ಜನಸಂಖ್ಯೆಗೆ', sentence: 'ಪ್ರತಿ ಒಂದು ಲಕ್ಷ ನಿವಾಸಿಗಳಿಗೆ ಪ್ರಕರಣಗಳು, ಆದ್ದರಿಂದ ದೊಡ್ಡ ನಗರ ಮತ್ತು ಸಣ್ಣ ಜಿಲ್ಲೆ ನ್ಯಾಯವಾಗಿ ಹೋಲಿಕೆಯಾಗುತ್ತವೆ.', example: 'ಬೆಂಗಳೂರು ನಗರದಲ್ಲಿ ಲಕ್ಷಕ್ಕೆ 312.', status: 'unv' },
  },
  risk: {
    technical: '30-day station risk index (0–100, drivers weighted)',
    en: { label: 'Risk next 30 days', sentence: 'How busy this station is likely to be compared with the others, from recent volume, trend and hotspots. It ranks where to look — it does not predict a crime.', example: 'Risk next 30 days: high — driven by night burglary and a rising trend.' },
    kn: { label: 'ಮುಂದಿನ 30 ದಿನಗಳ ಅಪಾಯ', sentence: 'ಇತ್ತೀಚಿನ ಪ್ರಮಾಣ, ಪ್ರವೃತ್ತಿ ಮತ್ತು ಹಾಟ್‌ಸ್ಪಾಟ್‌ಗಳಿಂದ, ಈ ಠಾಣೆ ಇತರರಿಗಿಂತ ಎಷ್ಟು ಬಿಡುವಿಲ್ಲದೆ ಇರಬಹುದು. ಎಲ್ಲಿ ನೋಡಬೇಕು ಎಂದು ಶ್ರೇಣಿ ಮಾಡುತ್ತದೆ — ಅಪರಾಧವನ್ನು ಮುನ್ಸೂಚಿಸುವುದಿಲ್ಲ.', example: 'ಮುಂದಿನ 30 ದಿನಗಳ ಅಪಾಯ: ಹೆಚ್ಚು — ರಾತ್ರಿ ಮನೆ ಒಡೆತ ಮತ್ತು ಏರುತ್ತಿರುವ ಪ್ರವೃತ್ತಿ.', status: 'repo' },
  },
  detection: {
    technical: 'detection rate = chargesheeted A / (A + C)',
    en: { label: 'Cases solved', sentence: 'Out of every 100 cases closed, how many ended with a chargesheet.', example: 'Cases solved: 44 of every 100.' },
    kn: { label: 'ಪತ್ತೆಯಾದ ಪ್ರಕರಣಗಳು', sentence: 'ಮುಗಿದ ಪ್ರತಿ 100 ಪ್ರಕರಣಗಳಲ್ಲಿ ಎಷ್ಟು ದೋಷಾರೋಪ ಪಟ್ಟಿಯಲ್ಲಿ ಮುಗಿದವು.', example: 'ಪತ್ತೆ: 100ರಲ್ಲಿ 44.', status: 'repo' },
  },
};

export const TERM_KEYS = Object.keys(GLOSSARY);

function fill(s, vars) {
  if (!s || !vars) return s;
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}

/**
 * Resolve a term for the current language and plain-language setting.
 * Returns { label, sentence, example, technical, plain, status }. When plain
 * mode is off the label IS the technical term (jargon back on the card) and
 * the plain sentence moves to the tooltip.
 */
export function resolveTerm(key, { lang = 'en', plain = true, vars } = {}) {
  const g = GLOSSARY[key];
  if (!g) return { label: key, sentence: '', example: '', technical: key, plain, status: 'missing' };
  const loc = g[lang] || g.en;
  const technicalName = g.technical.split(/ [=—(]/)[0].trim();
  return {
    label: plain ? loc.label : technicalName,
    sentence: fill(loc.sentence, vars),
    example: loc.example,
    technical: g.technical,
    technicalName,
    plain,
    status: loc.status || 'ok',
    value: loc.value || g.en.value || null,
  };
}

/** Hook: `const { term, plain, fmt } = usePlain();` — term(key, vars) → resolved entry;
 * fmt(key, value) → officer-facing phrasing of a raw metric value. */
export function usePlain() {
  const { lang } = useI18n();
  const plain = useTierStore((s) => s.plainLanguage);
  return {
    plain,
    lang,
    term: (key, vars) => resolveTerm(key, { lang, plain, vars }),
    fmt: (key, value) => {
      const r = resolveTerm(key, { lang, plain });
      return r.value && value !== null && value !== undefined && Number.isFinite(Number(value)) ? r.value(Number(value)) : String(value ?? '—');
    },
  };
}
