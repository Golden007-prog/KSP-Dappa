# KSP DAPPA — agent notes
Mission: KSP Datathon 2026 prototype; deploy ONLY on Zoho Catalyst; demo on 26 Jul.
Rules: official ER schema is law (docs/Police_FIR_ER_Diagram.pdf); Catalyst-native services only (no external AI/hosting/DB); all data synthetic; caste/religion never in ML features; every AI feature has a flag + fallback; never commit secrets.
Commands: `catalyst serve` (local, app on :3000, API under /server/dappa_api) · `catalyst deploy` · `python pipeline/generate.py && python pipeline/analytics.py` · `node scripts/bulk_load.js` · `node scripts/smoke_test.mjs <BASE_URL>`.
State: feature flags in functions/dappa_api catalyst config env; DECISIONS.md logs fallbacks; benchmarks in docs/benchmarks.
