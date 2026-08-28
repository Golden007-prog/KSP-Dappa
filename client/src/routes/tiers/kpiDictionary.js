// KPI dictionary in the SCRB's own idiom (docs/DOMAIN_RESEARCH.md §3.1 row 12,
// §4; docs/ROUND2_FEATURE_BACKLOG.md row 16). Three lists: the CCS-17 disposal
// columns of the Comparative Crime Statement (the PDF prints only the
// abbreviations — expansions are the research document's inferred reading and
// the glossary page says so), the 17 Crime Review heads (one page each in the
// monthly review), and the rates / registers an SP reads them against.
// Kannada is given only where the research verified a term (kn-V) or the repo
// already uses it; everything else stays in Latin as a technical loanword.

export const DISPOSAL_STATES = [
  { code: 'Rep', en: { name: 'Reported', plain: 'Every case registered in the period — the top of the funnel.' }, kn: { name: 'ದಾಖಲಾದವು', plain: 'ಅವಧಿಯಲ್ಲಿ ದಾಖಲಾದ ಎಲ್ಲಾ ಪ್ರಕರಣಗಳು — ಕೊಳವೆಯ ಮೇಲ್ಭಾಗ.' } },
  { code: 'Fal', en: { name: 'False', plain: 'Investigation found the complaint false; closed with a B report.' }, kn: { name: 'ಸುಳ್ಳು', plain: 'ತನಿಖೆಯಲ್ಲಿ ದೂರು ಸುಳ್ಳೆಂದು ಕಂಡುಬಂದು ಬಿ ವರದಿಯೊಂದಿಗೆ ಮುಚ್ಚಲಾಗಿದೆ.' } },
  { code: 'Tr', en: { name: 'Transferred', plain: 'Sent to another station or agency for jurisdiction.' }, kn: { name: 'ವರ್ಗಾಯಿಸಿದವು', plain: 'ವ್ಯಾಪ್ತಿಯ ಕಾರಣ ಬೇರೆ ಠಾಣೆ ಅಥವಾ ಸಂಸ್ಥೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ.' } },
  { code: 'Tru', en: { name: 'True', plain: 'Held to be a real offence after investigation — the denominator for detection.' }, kn: { name: 'ನಿಜ', plain: 'ತನಿಖೆಯ ನಂತರ ನಿಜವಾದ ಅಪರಾಧವೆಂದು ಪರಿಗಣಿಸಿದವು — ಪತ್ತೆ ದರದ ಆಧಾರ.' } },
  { code: 'NI', en: { name: 'Not investigated', plain: 'Registered but no investigation taken up (e.g. a non-cognizable referral).' }, kn: { name: 'ತನಿಖೆ ಮಾಡಿಲ್ಲ', plain: 'ದಾಖಲಾಗಿದೆ ಆದರೆ ತನಿಖೆ ಕೈಗೆತ್ತಿಕೊಂಡಿಲ್ಲ.' } },
  { code: 'Con', en: { name: 'Convicted', plain: 'Trial ended in a conviction.' }, kn: { name: 'ಶಿಕ್ಷೆಯಾದವು', plain: 'ವಿಚಾರಣೆ ಶಿಕ್ಷೆಯಲ್ಲಿ ಮುಗಿಯಿತು.' } },
  { code: 'Dis/Acq', en: { name: 'Discharged / acquitted', plain: 'Trial ended without a conviction.' }, kn: { name: 'ಬಿಡುಗಡೆ / ಖುಲಾಸೆ', plain: 'ವಿಚಾರಣೆ ಶಿಕ್ಷೆಯಿಲ್ಲದೆ ಮುಗಿಯಿತು.' } },
  { code: 'Com', en: { name: 'Compounded', plain: 'Settled between the parties where the law allows it.' }, kn: { name: 'ರಾಜಿಯಾದವು', plain: 'ಕಾನೂನು ಅನುಮತಿಸುವಲ್ಲಿ ಪಕ್ಷಗಳ ನಡುವೆ ಇತ್ಯರ್ಥ.' } },
  { code: 'PT', en: { name: 'Pending trial', plain: 'Chargesheet filed; the court has not finished.' }, kn: { name: 'ವಿಚಾರಣೆ ಬಾಕಿ', plain: 'ದೋಷಾರೋಪ ಪಟ್ಟಿ ಸಲ್ಲಿಸಲಾಗಿದೆ; ನ್ಯಾಯಾಲಯದಲ್ಲಿ ಬಾಕಿ.' } },
  { code: 'UI', en: { name: 'Under investigation', plain: 'Still with the investigating officer — the pendency the station is measured on.' }, kn: { name: 'ತನಿಖೆಯಲ್ಲಿ', plain: 'ಇನ್ನೂ ತನಿಖಾಧಿಕಾರಿಯ ಬಳಿ — ಠಾಣೆಯ ಬಾಕಿ ಅಳತೆ.' } },
  { code: 'UN', en: { name: 'Undetected', plain: 'True case, nobody identified; closed as undetected (an A report).' }, kn: { name: 'ಪತ್ತೆಯಾಗದವು', plain: 'ನಿಜ ಪ್ರಕರಣ, ಯಾರೂ ಗುರುತಾಗಿಲ್ಲ; ಪತ್ತೆಯಾಗದೆ ಮುಚ್ಚಲಾಗಿದೆ (ಎ ವರದಿ).' } },
  { code: 'OD', en: { name: 'Other disposal', plain: 'Closed another way — mistake of fact, civil in nature, withdrawn.' }, kn: { name: 'ಇತರ ವಿಲೇವಾರಿ', plain: 'ಬೇರೆ ರೀತಿ ಮುಚ್ಚಲಾಗಿದೆ — ವಾಸ್ತವದ ತಪ್ಪು, ಸಿವಿಲ್ ಸ್ವರೂಪ, ಹಿಂಪಡೆದದ್ದು.' } },
  { code: 'AB', en: { name: 'Abated', plain: 'The accused died before the case ended.' }, kn: { name: 'ರದ್ದಾದವು', plain: 'ಪ್ರಕರಣ ಮುಗಿಯುವ ಮೊದಲು ಆರೋಪಿ ಮೃತರಾದರು.' } },
];

export const REVIEW_HEADS = [
  { en: 'Murder', kn: 'ಕೊಲೆ', split: 'For gain / other' },
  { en: 'Dacoity', kn: 'ದರೋಡೆ', split: 'Unit-wise breakup' },
  { en: 'Robbery', kn: 'ದರೋಡೆ / ಸುಲಿಗೆ', split: 'Chain snatching (ಸರಗಳ್ಳತನ) / other robbery' },
  { en: 'Burglary', kn: 'ಮನೆ ಒಡೆತ', split: 'Night / day (H.B.T.)' },
  { en: 'Theft', kn: 'ಕಳ್ಳತನ', split: 'House theft (ಮನೆ ಕಳ್ಳತನ) / two-wheeler / other' },
  { en: 'Riots', kn: 'ಗಲಭೆ', split: '' },
  { en: 'Hurt', kn: 'ಹಲ್ಲೆ', split: '' },
  { en: 'Special & local laws', kn: 'ವಿಶೇಷ ಮತ್ತು ಸ್ಥಳೀಯ ಕಾನೂನು', split: 'KPA gambling, Excise, COTPA …' },
  { en: 'Crime against women', kn: 'ಮಹಿಳೆಯರ ಮೇಲಿನ ಅಪರಾಧ', split: 'Rape / dowry death / cruelty' },
  { en: 'POCSO', kn: 'ಪೋಕ್ಸೊ', split: '' },
  { en: 'SC & ST (PoA) Act', kn: 'ಎಸ್‌ಸಿ / ಎಸ್‌ಟಿ ದೌರ್ಜನ್ಯ ತಡೆ ಕಾಯ್ದೆ', split: '' },
  { en: 'Security cases', kn: 'ಭದ್ರತಾ ಪ್ರಕರಣಗಳು', split: '126 / 128 / 129 BNSS' },
  { en: 'Cyber crimes', kn: 'ಸೈಬರ್ ಅಪರಾಧ', split: 'OTP fraud, investment fraud, digital arrest …' },
  { en: 'Economic offences', kn: 'ಆರ್ಥಿಕ ಅಪರಾಧ', split: 'CBT / cheating / counterfeiting' },
  { en: 'MMDR & KMMCR', kn: 'ಗಣಿ ಕಾಯ್ದೆಗಳು', split: '' },
  { en: 'Motor vehicle theft', kn: 'ವಾಹನ ಕಳ್ಳತನ', split: 'Two-wheelers / four-wheelers' },
  { en: 'NDPS', kn: 'ಎನ್‌ಡಿಪಿಎಸ್', split: '' },
];

export const METRICS = [
  { en: { name: 'Detection rate', plain: 'Out of every 100 cases closed, how many ended with a chargesheet (A / (A + C)).' }, kn: { name: 'ಪತ್ತೆ ದರ', plain: 'ಮುಗಿದ ಪ್ರತಿ 100 ಪ್ರಕರಣಗಳಲ್ಲಿ ಎಷ್ಟು ದೋಷಾರೋಪ ಪಟ್ಟಿಯಲ್ಲಿ ಮುಗಿದವು.' } },
  { en: { name: 'Charge-sheeting rate', plain: 'Chargesheeted cases as a share of cases disposed by police (NCRB definition).' }, kn: { name: 'ದೋಷಾರೋಪ ಪಟ್ಟಿ ದರ', plain: 'ಪೊಲೀಸರು ವಿಲೇವಾರಿ ಮಾಡಿದ ಪ್ರಕರಣಗಳಲ್ಲಿ ದೋಷಾರೋಪ ಪಟ್ಟಿ ಸಲ್ಲಿಸಿದವರ ಪಾಲು.' } },
  { en: { name: 'Crime rate per lakh', plain: 'Cases for every one lakh residents, so a big city and a small district compare fairly.' }, kn: { name: 'ಲಕ್ಷ ಜನಸಂಖ್ಯೆಗೆ ಅಪರಾಧ ದರ', plain: 'ಪ್ರತಿ ಲಕ್ಷ ನಿವಾಸಿಗಳಿಗೆ ಪ್ರಕರಣಗಳು, ದೊಡ್ಡ ನಗರ ಮತ್ತು ಸಣ್ಣ ಜಿಲ್ಲೆ ನ್ಯಾಯವಾಗಿ ಹೋಲಿಕೆಯಾಗಲು.' } },
  { en: { name: 'Pendency (UI / PT)', plain: 'Cases still under investigation or pending trial at the end of the period.' }, kn: { name: 'ಬಾಕಿ (UI / PT)', plain: 'ಅವಧಿಯ ಕೊನೆಯಲ್ಲಿ ಇನ್ನೂ ತನಿಖೆಯಲ್ಲಿ ಅಥವಾ ವಿಚಾರಣೆಯಲ್ಲಿ ಬಾಕಿ ಇರುವ ಪ್ರಕರಣಗಳು.' } },
  { en: { name: 'Long Pending Register (LPR)', plain: 'The station register of cases pending beyond the review threshold with untraced accused.' }, kn: { name: 'ದೀರ್ಘ ಬಾಕಿ ದಾಖಲೆ (LPR)', plain: 'ಪತ್ತೆಯಾಗದ ಆರೋಪಿಗಳೊಂದಿಗೆ ಮಿತಿ ಮೀರಿ ಬಾಕಿ ಇರುವ ಪ್ರಕರಣಗಳ ಠಾಣಾ ದಾಖಲೆ.' } },
  { en: { name: 'Provisional · as on <date>', plain: 'The Crime Review footer: figures may still change; this is the day they were counted.' }, kn: { name: 'ತಾತ್ಕಾಲಿಕ · <ದಿನಾಂಕ>ರಂತೆ', plain: 'ಅಪರಾಧ ಸಮೀಕ್ಷೆಯ ಅಡಿಟಿಪ್ಪಣಿ: ಅಂಕಿಅಂಶಗಳು ಬದಲಾಗಬಹುದು; ಎಣಿಸಿದ ದಿನ ಇದು.' } },
];
