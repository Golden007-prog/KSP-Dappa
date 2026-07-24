# CONTRACTS.md — cross-agent interface contracts (KSP DAPPA)
Every builder MUST honor these. The master spec is `docs/02_CLAUDE_CODE_MASTER_PROMPT.md`; the official schema text is `docs/ER_TEXT_EXTRACT.txt`. Where this file pins something, it wins over improvisation.

## Environment
- Repo root: `E:\Datathon\ksp-dappa` (Windows 11, PowerShell + Git Bash available).
- Python interpreter: **`python3.12`** (Windows Store). `python` resolves to a broken venv — NEVER use it. All required packages (pandas, numpy, scikit-learn, networkx, scipy, statsmodels, rapidfuzz, faker, pypdf) are installed for `python3.12`.
- Node v25 / npm 11 available. Catalyst CLI v1.27.0, logged in; org `60079891305`, project **Project-Rainfall** id `50643000000013024`.
- Do NOT run `git commit` (the orchestrator commits). Do NOT write `docs/DECISIONS.md` unless you are the scripts+docs agent; report fallbacks in your final JSON summary instead.

## Data pipeline contract
- `pipeline/generate.py` writes one CSV per table into `pipeline/out/`, filename `<TableName>.csv`, headers exactly = Data Store column names from master spec §2 (which matches the official ER). Also writes `SocioEconomic.csv` (from Appendix C values) and `_ground_truth_offenders.csv` (never bulk-loaded).
- `pipeline/analytics.py` reads input/output dir from env `DAPPA_OUT` (default `pipeline/out`); writes derived CSVs (`AggMonthly.csv`, `HotspotCluster.csv`, `ForecastMonthly.csv`, `AnomalyAlert.csv`, `NetworkEdge.csv`, `OffenderProfile.csv`, `StationRisk.csv`), `quickml_case_outcome.csv`, `quickml_station_risk.csv`, `network_graph.json` (nodes/edges for NoSQL + Stratus), `rag_context/*.md`, and benchmark JSONs into `docs/benchmarks/`.
- `Ym` format: `YYYY-MM`. Dates ISO `YYYY-MM-DD`; datetimes `YYYY-MM-DD HH:MM:SS`.
- Scale knob: env `DAPPA_SCALE` (default 45000 cases). Deterministic under `--seed 2026`.
- CrimeNo: `[1-digit cat][4-digit DistrictID][4-digit UnitID][4-digit year][5-digit serial]` — cat: FIR=1, UDR=3, PAR=4, ZeroFIR=8; serial per station+category+year; CaseNo = last 9 digits.

## API contract (functions/dappa_api)
- Base path: `/server/dappa_api/api/v1`. Envelope: success `{"ok":true,"data":...,"meta":{...}}`, error `{"ok":false,"error":{"code":"...","message":"..."}}`.
- Common query filters: `from,to` (YYYY-MM-DD), `districtId,unitId,crimeHeadId,crimeSubHeadId,gravityId`; pagination `page` (1-based), `perPage` (≤200, default 50); list responses set `meta.total,meta.page,meta.perPage`.
- Endpoint list = master spec §6 verbatim. Key data shapes (client codes against these):
  - `/summary/kpis` → `{totalFirs, momPct, heinousCount, detectionRate, activeAlerts, topRisingSubhead:{id,name,deltaPct}}`
  - `/geo/districts` → `[{districtId, districtName, caseCount, ratePerLakh, momDeltaPct, alert:boolean}]`
  - `/geo/stations` → `[{unitId, unitName, districtId, lat, lng, caseCount, riskScore}]`
  - `/geo/hotspots` → `[{clusterId, crimeHeadId, subHeadName, centroidLat, centroidLng, radiusM, caseCount, hourBandStart, hourBandEnd, intensity, label, districtId}]`
  - `/alerts` → `[{alertId, districtId, districtName, unitId, crimeHeadId, headName, periodStart, periodEnd, observed, expected, zScore, severity, status, narrative, sparkline:[num]}]`
  - `/network/graph` → `{nodes:[{id, label, caseCount, communityId, degree}], edges:[{source, target, weight, caseIds:[..]}]}`
  - `/offenders` → rows `{personKey, canonicalName, aliases:[..], caseCount, districts:[..], moTags:[..], riskScore, communityId}`
  - `/forecast` → `{history:[{ym, actual}], forecast:[{ym, predicted, lo, hi}], model, mape}`
  - `/risk/stations` → `[{unitId, unitName, districtId, riskScore, drivers:[".."]}]`
  - `/cases` rows → `{caseMasterId, crimeNo, caseNo, registeredDate, districtName, unitName, headName, subHeadName, statusName, gravityName, anomalyFlag}`; `/cases/:id` adds `{briefFacts, complainants:[..], victims:[..], accused:[..], sections:[{actCode, sectionCode, description}], arrests:[..], chargesheet:{..}, io:{..}, court:{..}, latitude, longitude, incidentFrom, incidentTo}`
  - `/copilot/query` → `{answer, chart?:{type:'bar'|'line'|'pie', title, categories:[..], series:[{name, data:[..]}]}, zcql?, engine:'quickml-rag'|'deterministic'}`
- Feature flags (env, all default off/fallback): `FEATURE_QUICKML`, `FEATURE_QUICKML_LLM`, `FEATURE_ZIA`, `FEATURE_SMARTBROWZ`, `FEATURE_MAIL`, `PUBLIC_DEMO=true`. Fallback responses keep identical shape with `meta.source:"fallback-local"`.

## Client contract (client/)
- Vite + React 18, **plain JSX (no TypeScript)**, Tailwind. Dev API base: `import.meta.env.VITE_API_BASE || '/server/dappa_api/api/v1'`.
- The scaffold agent writes `client/CONTRACT.md` (shared component APIs + hooks). Route fillers own ONLY their route files and route-specific subfolders; never touch package.json, App.jsx, shared components.
- GeoJSON: `client/public/data/karnataka_districts.geojson` (copy of `data/geo/karnataka_districts.geojson`, 23KB, 30 features, property `district` = name below, `dt_code`).
- Police-unit → map polygon mapping (2011-census districts; commissionerates share parent polygon; choropleth SUMS all units mapped to a polygon; city units also get a clickable circle marker at their Appendix C coords):
  0101 Bengaluru City→Bengaluru Urban · 0102 Bengaluru District→Bengaluru Rural · 0103 Mysuru City→Mysuru · 0104 Mysuru District→Mysuru · 0105 Mangaluru City→Dakshina Kannada · 0106 Dakshina Kannada→Dakshina Kannada · 0107 Hubballi-Dharwad City→Dharwad · 0108 Dharwad District→Dharwad · 0109 Belagavi City→Belagavi · 0110 Belagavi District→Belagavi · 0111 Kalaburagi→Kalaburagi · 0112 Ballari→Ballari · 0113 Vijayapura→Vijayapura · 0114 Davanagere→Davanagere · 0115 Shivamogga→Shivamogga · 0116 Tumakuru→Tumakuru · 0117 Udupi→Udupi · 0118 Hassan→Hassan · 0119 Chikkamagaluru→Chikkamagaluru · 0120 Kodagu→Kodagu · 0121 Chamarajanagar→Chamarajanagara · 0122 Mandya→Mandya · 0123 Kolar→Kolar · 0124 Chikkaballapur→Chikkaballapura · 0125 Ramanagara→Ramanagara · 0126 Bagalkot→Bagalkote · 0127 Gadag→Gadag · 0128 Haveri→Haveri · 0129 Uttara Kannada→Uttara Kannada · 0130 Raichur→Raichur · 0131 Koppal→Koppal · 0132 Yadgir→Yadgir · 0133 Bidar→Bidar · 0134 Chitradurga→Chitradurga · 0135 Kodagu-Virajpet→Kodagu · 0136 KGF→Kolar · 0137 Vijayanagara→Ballari · 0138 Bengaluru Rural South→Bengaluru Rural

## Catalyst function scaffolds
- Do NOT guess `catalyst-config.json` shapes — verify against https://docs.catalyst.zoho.com (functions stack/type reference) via WebFetch/context7 before writing. `dappa_api` = Advanced I/O, Node 20, Express. `dappa_nightly` = Job/Cron function, Python 3.x. The orchestrator handles root `catalyst.json` (via `catalyst init`) — do not create it.

## Guardrails (organizer rules)
- No external AI/LLM/hosting/DB/auth APIs anywhere in produced code. OSM tiles + open GeoJSON are fine as client data sources.
- Caste/religion columns exist in schema (fidelity) but must NEVER appear in any model feature set, analytics output, or UI analytics.
- All data synthetic; visible disclaimer banner in UI.
