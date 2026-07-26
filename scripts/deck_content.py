# -*- coding: utf-8 -*-
"""Copy for the KSP Datathon 2026 prototype submission deck.

Every number here was measured, not estimated. Sources:
  live API  https://project-rainfall-60079891305.development.catalystserverless.in
  docs/benchmarks/*.json, CAPABILITIES.md, FEATURES.md, functions/dappa_api/lib/servicemap.js
Kept in a separate module so the wording can be reviewed without reading layout code.
"""

APP_URL = ("https://project-rainfall-60079891305.development."
           "catalystserverless.in/app/index.html")
API_URL = ("https://project-rainfall-60079891305.development."
           "catalystserverless.in/server/dappa_api/api/v1/healthz")
REPO_URL = "https://github.com/Golden007-prog/KSP-Dappa"
DEMO_VIDEO = "DEMO_VIDEO_URL"   # replace before submitting

TEAM = {
    "team_name": "TODO — your team name",
    "leader": "TODO — team leader name",
    "size": "TODO",
    "problem": ("Data-Driven Crime Analytics for Karnataka State Police — turning FIR "
                "records into visual, predictive and network intelligence for officers."),
}

SLIDES = [
    {
        "slideNumber": 2,
        "bullets": [
            "KSP DAPPA (Data Analytics Platform for Police Action) turns raw FIR records into decisions a station officer can act on the same shift.",
            "One serverless app on Zoho Catalyst: 45,000 synthetic FIRs modelled exactly on the official Karnataka Police FIR ER diagram, across 35 related tables.",
            "Ten officer surfaces — Command Dashboard, GeoIntel map, Trends, Alerts, Network, Offenders, Predict, Ask DAPPA, Cases, Reports.",
            "Ask DAPPA answers plain-language questions (“top 5 districts for vehicle theft this year”) in ~0.3 s and shows the ZCQL it ran, so the officer can verify before acting.",
            "Trilingual interface — English, Kannada and Hindi — switchable at any time, rendered with system fonts so nothing is fetched from outside Catalyst.",
            "Built for scrutiny: every response names the engine that produced it, and model cards publish measured metrics including the ones that are weak.",
        ],
        "images": ["hero-command-centre.png"],
        "caption": "Illustrative concept render",
        "size": 11.0,
    },
    {
        "slideNumber": 3,
        "bullets": [
            "Different: most crime dashboards stop at counting. DAPPA links people across FIRs, mines shared modus operandi, and ranks every station for the next 30 days.",
            "Different: every AI answer is auditable. “Show ZCQL” reveals the exact query behind a number, and meta.source names the engine that answered it.",
            "Solves the problem: an officer stops exporting spreadsheets and instead opens one ranked list of stations, alerts and repeat offenders, already filtered to the district.",
            "Solves the problem: 665 statistical anomaly alerts are generated from observed-versus-expected volumes, so a surge is flagged before it is noticed manually.",
            "USP 1 — honest AI. Model cards publish measured metrics, including a QuickML model whose AUC is 0.500, rather than hiding a weak result behind a confident number.",
            "USP 2 — fairness by construction. Caste and religion exist in the schema for ER fidelity but never enter a model feature set and are never rendered in the UI.",
            "USP 3 — Catalyst-native end to end. No external AI, hosting or database anywhere in the runtime path.",
        ],
        "size": 11.6,
    },
    {
        "slideNumber": 4,
        "bullets": [
            "808 user-visible features catalogued across nine areas (FEATURES.md), audited twice by code review rather than estimated.",
            "Advanced visualisation (240): choropleth, incident heat, Gi* hotspots, patrol routing, hour×weekday seasonality, brushed 12-month trends, CB-safe palette.",
            "Network & link analysis (105): co-accused graph over 23,833 edges, shortest path between two persons, community detection, top-connector ranking.",
            "Predictive dashboards (167): 30-day risk score for all 282 stations with named drivers, Holt-Winters forecasts with 80% intervals and backtest MAPE.",
            "Pattern & trend discovery (173): auto-insights recomputed on every filter change, emerging-category watch, z-score anomaly feed with SLA ageing.",
            "Organised crime (121) and socio-economic analysis (125): crew derivation from shared rare MO, district crime rate against urbanisation, density and literacy.",
            "Case work: 45,000-case explorer with server-side paging, full-ER FIR detail, saved views, CSV/JSON export and a printable Weekly Intelligence Brief.",
        ],
        "size": 11.2,
    },
    {
        "slideNumber": 5,
        "images": ["diagram-flow.png"],
        "caption": "Process flow — from a registered FIR to a ranked patrol decision, with the engine named at every hop.",
    },
    {
        "slideNumber": 6,
        "images": ["01-dashboard-en.jpg", "02-geointel-map.jpg",
                   "03-trends.jpg", "04-network-graph.jpg"],
        "caption": "Live screens from the deployed build — Command Dashboard, GeoIntel, Trends, Network Explorer.",
    },
    {
        "slideNumber": 7,
        "images": ["diagram-architecture.png"],
        "caption": "Every runtime component is a Catalyst service. The Python pipeline runs at build time only.",
    },
    {
        "slideNumber": 8,
        "bullets": [
            "Frontend: React 18 + Vite + Tailwind CSS, HashRouter SPA, TanStack Query for server state, zustand for UI state.",
            "Visualisation: Apache ECharts (charts), Leaflet + OpenStreetMap tiles (maps), Cytoscape.js (network graph).",
            "Backend: Node 20 on a Catalyst Advanced I/O function running Express — 120+ REST routes, uniform {ok, data, meta} envelope.",
            "Data: Catalyst Data Store queried with ZCQL; Cache for hot aggregates; NoSQL for graph snapshots; Stratus for CSV, GeoJSON and PDFs.",
            "ML / analytics: Python 3.12 offline pipeline (pandas, statsmodels Holt-Winters, scikit-learn, networkx, rapidfuzz); QuickML Random Forest served online.",
            "i18n: 12 namespaces per locale, ~5,300 keys each for English, Kannada and Hindi, loaded eagerly via import.meta.glob; system fonts only, zero external requests.",
            "Quality: 789-assertion API contract suite plus a 34-check live smoke script; GitHub Actions builds the static demo mirror.",
        ],
        "size": 11.2,
    },
    {
        "slideNumber": 9,
        "bullets": [
            "GET /meta/services maps 28 Catalyst services; 14 are exercised by the deployed build and the rest are wired with the console step named.",
            "Compute: Advanced I/O Function (dappa_api), Event/Signals Function (dappa_event), Cron Job (dappa_nightly), Circuits, API Gateway, Web Client Hosting.",
            "Data: Data Store with ZCQL (35 tables), Data Store full-text Search, Cache (KPI + choropleth aggregates), NoSQL (network-graph snapshots).",
            "Storage & delivery: Stratus (CSV, GeoJSON, generated PDF briefs, pre-signed URLs), File Store (FIR scan uploads), Catalyst Mail (weekly digest).",
            "AI: QuickML pipelines + published endpoint (live), Zia Text Analytics (live NER/keyword/sentiment), Zia OCR, Zia Translate, Zia AutoML, SmartBrowz.",
            "Platform: Catalyst Authentication with a public read-only demo mode, Push Notifications, Connections (OAuth), Catalyst CLI for deployment.",
            "Nothing outside Catalyst is called at runtime — no external LLM, CDN, webfont, map API key or third-party database.",
        ],
        "size": 11.2,
    },
    {
        "slideNumber": 10,
        "bullets": [
            "Catalyst bills by consumption, so the prototype cost is dominated by one-time data loading rather than by serving traffic.",
            "Free tier carried the entire build until the bulk load: 45,000 FIRs plus 12 child tables (~350,000 rows) exhausted the free Data Store write allowance.",
            "Actual spend to date: one paid top-up to finish the row load. Serving the live demo — reads, cache hits, function invocations — has stayed inside the free tier.",
            "Estimated statewide production (real KSP volumes, ~800k FIRs/year): Data Store + function invocations are the two dominant lines; QuickML and Zia are per-call.",
            "Cost control already built in: Cache fronts every expensive aggregate, the nightly Cron precomputes risk and anomalies, and AI calls are flag-gated with a 4 s timeout.",
            "These are estimates from a prototype on synthetic data, not a quoted price. A real deployment needs a sizing exercise against actual KSP record volumes.",
        ],
        "size": 11.4,
    },
    {
        "slideNumber": 11,
        "images": ["07-predict-risk.jpg", "05-offenders.jpg",
                   "09-copilot-answer.jpg", "06-alerts.jpg",
                   "12-dashboard-kn.jpg", "11-dashboard-hi.jpg"],
        "caption": "Predict · Offenders · Ask DAPPA · Alerts · the same dashboard in Kannada and in Hindi — all captured from the live deployment.",
    },
    {
        "slideNumber": 12,
        "bullets": [
            "Data: 94.8% of the target corpus is loaded and served live — CaseMaster 45,000/45,000, ActSection 60,948, Victim 53,836, NetworkEdge 23,833, Alerts 665.",
            "API latency (live, cold-ish): /healthz 391 ms, /geo/choropleth 401 ms, /summary/kpis 626 ms, /risk/stations 900 ms. /network/graph is the outlier at 19.2 s.",
            "Ask DAPPA answers in ~0.3 s through the deterministic parser; Zia Text Analytics returns NER, keywords and sentiment in ~1.4 s.",
            "Forecast backtest, 6 months held out over 228 district×head series: median MAPE 47.8%, p90 83.7% — but 16.8% on the 8 series carrying ≥20 cases/month.",
            "Identity resolution at threshold 0.92: recall 0.571 but precision 0.032 (F1 0.061). It over-links, and the number is published rather than hidden.",
            "Socio-economic signal is real: district crime rate per lakh correlates with urbanisation r=0.90 and density r=0.89 (both p<0.001) across 38 districts.",
            "Verification: 789-assertion contract suite green, 34/34 live smoke checks green against the deployed URL.",
            "Adversarial audit: 50 agents probed the live API; 6 defects survived independent refutation and 3 critical ones are fixed and redeployed.",
        ],
        "size": 10.8,
    },
    {
        "slideNumber": 13,
        "bullets": [
            "GitHub Public Repository:",
            "Demo Video (3 minutes):",
            "Deployed Link (live app):",
            "Live API health check:",
        ],
        "subBullets": [
            "0|" + REPO_URL,
            "1|" + DEMO_VIDEO,
            "2|" + APP_URL,
            "3|" + API_URL,
        ],
        "size": 13.0,
    },
    {
        "slideNumber": 14,
        "bullets": [
            "Known limitation — the QuickML case-status model measures AUC 0.500. Status here is driven by registration recency, which QuickML cannot take as a feature.",
            "Why: Type Conversion offers only Text/Timestamp for a Date, Custom Expression is arithmetic-only, and Custom Code (Python) needs a Zoho support request to enable.",
            "Known limitation — ChargesheetDetails is 12,600 of 31,655 rows (39.8%), so the detection-rate KPI renders “—” rather than a misleading 0%.",
            "Known limitation — identity resolution over-links (precision 0.032); the next fix is blocking on district plus phone before fuzzy name scoring.",
            "Known limitation — /network/graph takes 19.2 s uncached and is capped at 3,000 of 23,833 edges; it needs a precomputed adjacency snapshot in NoSQL.",
            "Fixed during this audit: CSV exports were serving fixture rows over the 300-row ZCQL cap, and ZCQL LIMIT turned out to be a 1-based start row, so every page repeated a record.",
            "Next: enable Custom Code to add a case-age feature, verify the Catalyst Mail from-address to switch digests on, and finish the chargesheet load.",
            "Then: role-based officer accounts via Catalyst Authentication, Kannada voice input for Ask DAPPA, and an ingest adapter for the real KSP CCTNS feed.",
        ],
        "size": 10.6,
    },
]
