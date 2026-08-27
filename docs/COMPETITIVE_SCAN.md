# Competitive scan — how crime-analytics submissions and products present themselves, against KSP DAPPA

*Round-2 research note, written 27 August 2026. Scope: hackathon/datathon
crime-analytics submissions (with the KSP Datathon 2026 peer repositories as
the primary set), Indian police analytics systems, and commercial products.
For each: what they show, how they present credibility, what they do that
DAPPA does not, and what DAPPA does better. Ends with two checkable lists.*

## Method and legend

Every external claim carries the URL it came from, inline. Pages were read
through a fetch tool that returns the page's extracted content; a quoted phrase
is one that appeared in that content. DAPPA-side claims were checked by reading
`README.md`, `CAPABILITIES.md`, `docs/ROUND2_BASELINE.md`, the benchmark JSON
files and the source files named, or by running the grep shown.

- **VERIFIED** — read on the page (or in the repo file) named.
- **INFERRED** — deduced from a search-result snippet, a repository's metadata
  field, or a fetched page that returned only a title; the deduction is stated.
- **INACCESSIBLE** — the page could not be read (HTTP 403/500, connection reset,
  DNS failure, or a JavaScript-only shell); no content from it is used beyond
  what the failure itself shows. All such pages are listed in [§ 11 Gaps](#gaps).

The GitHub peer set was found with the GitHub repository search
`"Karnataka State Police" datathon` sorted by stars (443 results on 27 Aug 2026)
plus `crime hotspot dashboard react leaflet`; the twelve 2026 repositories below
are every result created in June–July 2026 whose README could be fetched. It is
a sample of public repos, not the entrant list.

---

## 1. The reference point: what DAPPA claims and what evidence it ships

VERIFIED from the repository on 27 Aug 2026:

- **Claims.** `README.md` leads with "808 cataloged features", an "official ER
  schema, verbatim" (26 ER tables + 8 analytics tables, 18-digit `CrimeNo`
  breakdown), identity resolution across jurisdictions, "28 Catalyst services
  mapped by `GET /meta/services`, 23 with a real call site", and flag-gated AI
  with "identical-shape local fallbacks" (`README.md` L21-42, L124-165).
  `CAPABILITIES.md` maps the six scored capabilities to routes a judge can open,
  with an overlap matrix and a list of backend-only endpoints.
- **Evidence assets in the repo.** One screenshot embedded in the README
  (`.github/media/command-dashboard.jpg`); eleven route screenshots plus two
  diagrams in `docs/screenshots/` (`01-dashboard-en.jpg` … `12-dashboard-kn.jpg`,
  `diagram-architecture.png`, `diagram-flow.png`) that the README does not link;
  three benchmark files in `docs/benchmarks/` — `forecast_metrics.json`
  (228 series, 6-month backtest, `medianMape: 47.78`, `p90Mape: 83.7`),
  `identity_metrics.json` (`threshold: 0.92, precision: 0.0321, recall: 0.5712,
  f1: 0.0608`) and `socio_correlation.json` (Pearson/Spearman with p-values over
  38 districts); a contract suite that ran **803 passed, 0 failed** on 27 Aug
  (`docs/ROUND2_BASELINE.md` §1); a 3-minute video *script* under `video/script/`.
- **Evidence assets missing.** No deployed URL anywhere in `README.md`
  (`grep -n -i "catalystserverless\|onslate\|catalystappsail\|youtu" README.md`
  returns nothing; the only URL is `http://localhost:3000`); no video link; the
  Team table is `_TBD_` (`README.md` L351-354). `CAPABILITIES.md` carries two
  incompatible sets of numbers — the scorecard at L22-27 says C5 = 121 "PASS",
  the section heading at L451 says "85 ❌ SHORT BY 15" — documented in
  `docs/ROUND2_BASELINE.md` §5. The README scorecard (L104-113) is a third,
  older set (186/62/119/106/45/85).
- **A doc-vs-code mismatch that matters for this scan.** `CAPABILITIES.md` §C2
  says "there are no victim nodes in the graph … There are no location nodes
  either", but `client/src/routes/network/CytoGraph.jsx` L7-10 and L107-113
  style `node[kind = "victim"]` (round-rectangle), location nodes (hexagon) and
  `victimLink` / `locationLink` edges, and
  `functions/dappa_api/lib/routes/netlinks.js` L9-11 registers
  `GET /network/victim-links`, `GET /network/locations` and
  `GET /network/communities/score`. The capability exists; the document denies it.

Everything below is read against that baseline.

---

## 2. Direct peers — KSP Datathon 2026 repositories

All VERIFIED from the README each repository serves, fetched 27 Aug 2026, unless
marked. Star counts and creation dates are GitHub API metadata.

| Repo | What it shows | Stack and platform purity | Data | Credibility devices |
|---|---|---|---|---|
| [kkeerthanaaaa/KSP-Hackathon-Deploy](https://github.com/kkeerthanaaaa/KSP-Hackathon-Deploy) (4★, Challenge 2) | Density maps/heatmaps with district→station drill-down and "Day vs night pattern analysis"; red zones by "z-score-based statistical anomaly detection"; suspect–victim–station network with "repeat-offender groups" by cosine-similarity clustering; XGBoost weekly station risk with "SHAP explanations" | React/Vite, React-Leaflet, react-force-graph-2d, Recharts; FastAPI; **Supabase (PostgreSQL + PostGIS)** because "Catalyst's native Data Store does not provide the PostGIS capabilities"; Docker on Catalyst AppSail | Synthetic, with "7 deliberately injected crime patterns" | **Ground-truth validation**: risk MAE 5.00 vs baseline 6.66; burglary night pattern observed 2.28× vs injected 2.2×; "Correctly identified all 5 injected repeat offenders". Live URL on `catalystserverless.in` (fetched 27 Aug: only the SPA shell text "frontend" came back — liveness INFERRED, content unverified). No screenshots. |
| [SarmaHighOnCode/KSPDatathon](https://github.com/SarmaHighOnCode/KSPDatathon) — "KAVAL" (2★, Challenge 01) | Bilingual (incl. "code-switched Kanglish") conversational NL-to-SQL with a "numeric firewall" — "the LLM *architecturally cannot* state a statistic that didn't come from an executed query"; inline hotspot/network/trend widgets; hash-chained audit trail; "court-ready export" with a Bharatiya Sakshya Adhiniyam §63-style certificate | FastAPI, PostgreSQL 16 + PostGIS + pgvector; React 18/TS/Tailwind v4; target Catalyst AppSail custom OCI + Web Client Hosting | "This repo ships **no crime data, real or synthetic**" | No screenshots, no live URL, no result stated; detailed PRD and week-by-week roadmap |
| [Dharaneesh20/PRAHARI](https://github.com/Dharaneesh20/PRAHARI) (2★) | "Crime Map Hotspot Analysis", tactical analytics, copilot with "Intensive LLM Fallback Mechanism", built-in app tour | React 19/TS/Vite; FastAPI + DuckDB; NetworkX; Catalyst AppSail + Slate + Zia OCR + Zia translation/speech; **NVIDIA-hosted DeepSeek/Nemotron/Mistral and Groq LLaMA** | Not specified | Live URL `prahariai.onsite.in`; three named developers; no screenshots or metrics |
| [MdSaifAli063/…-For-KSP](https://github.com/MdSaifAli063/AI-Driven-Crime-Analytics-Visualization-Platform-For-KSP) — "CrimeIQ Karnataka" (5★) | Five modules: SCRB executive dashboard (KPIs, incident feed), Leaflet hotspot map with "Active Spike Analysis", force-directed network of "offenders, victims, organizations", 90-day forecast with confidence gauges + "Socio-Economic Correlation", alerts centre | React 19, TanStack Start/Router, Recharts, Leaflet, React Force Graph, Tailwind v4, Framer Motion; front-end only | Mock/simulated | Live URL on `catalystappsail.in`; 27 commits; no screenshots |
| [srixram08/crimevision-AI](https://github.com/srixram08/crimevision-AI) (4★) | "Interactive crime hotspot visualization with risk-based zones" with district→station drill-down; "Transparent risk scoring with feature importance"; suspect network "connecting suspects, victims, and locations" with cross-district tracing; anomaly alerts "with recommended actions"; glassmorphism command-centre UI | React/Vite/Tailwind/Framer Motion/Recharts/React Force Graph/Leaflet; static | "entirely synthetic" JSON | Live URL on `onslate.in` — fetched 27 Aug, page title "CrimeVision AI — Karnataka State Police / SCRB Command Platform" (VERIFIED title only); no screenshots, no metrics |
| [Xmanish8/KSP_DATATHON](https://github.com/Xmanish8/KSP_DATATHON) — "SurakshaAI" (4★, 3 forks) | 7-page Streamlit dashboard: hotspots/heatmaps/choropleth, XGBoost LOW/MEDIUM/HIGH risk, Prophet forecasts, IsolationForest anomalies, DBSCAN, Pyvis co-occurrence network | Python/Flask/Streamlit; Folium/Plotly; "Zoho Catalyst" named as cloud layer | 11 datasets of "~350–435 rows" from "19 raw CSVs" — NCRB state data and "57 district-level IPC CSVs (Karnataka)" | Live URL on `catalystserverless.in`; "Feature importance + confusion matrix" listed as outputs; 3 contributors |
| [Aadhithya-balu/Saksha_Datathon](https://github.com/Aadhithya-balu/Saksha_Datathon) (4★) | Eight modules: dashboards, hotspots, network, repeat offenders, predictive, anomaly, socio-economic, conversational AI | React/Tailwind/Mapbox-or-Leaflet/D3; FastAPI/Node; **PostgreSQL + PostGIS, Neo4j, Llama + LangChain + vector DB** | Described as KSP crime records | Live URL on `catalystappsail.in`; 239 commits; no screenshots or metrics |
| [mohammadsahil74808/Project-Drishti](https://github.com/mohammadsahil74808/Project-Drishti) (2★) | "geospatial analytics, predictive crime forecasting, NLP-driven investigation support, and real-time command dashboards" | React/Vite/TS; FastAPI; **PostgreSQL + PostGIS**; Docker + GitHub Actions; "100% free/open-source" | Synthetic generators + seeds | Status "Scaffold stage — structure only"; live URL exists; no screenshots |
| [Mappillai-Meeran/CrimeLens-OS](https://github.com/Mappillai-Meeran/CrimeLens-OS) (2★, Challenge 1) | Investigation workspace: case files, entity extraction, timeline reconstruction, contradiction detection, "SCRB Memory" similarity to 10 historical cases, bilingual copilot, PDF brief, browser voice | React 19/Vite 8/Tailwind v4 on Catalyst Slate; Catalyst Serverless Function `geminiProxy` → **Google Gemini API**; rule-based offline fallback | Fictional, 11 demo cases | Live `crimelens-os.onslate.in`; 49 commits; tagline "The AI assists. The officer decides"; screenshots referenced but not displayed |
| [MUKUL-PRASAD-SIGH/Project-Falcon](https://github.com/MUKUL-PRASAD-SIGH/Project-Falcon) (8★, "Problem Statement 2") | "Six-pillar" analytics (geospatial, repeat-offender risk, forecasting, anomaly, network, case similarity); PICO NL→SQL copilot; Kannada/English TTS/STT; RBAC + audit logging | "100% Zoho Catalyst-native": FastAPI on AppSail, React 18, QuickML, Zia, Data Store, Functions; "No external third-party AI APIs" | Synthetic demo; real ingestion "documented but not implemented" | Live URL on `catalystserverless.in`; **YouTube demo link**; **PDF deck**; architecture + ER diagrams; 36 commits |
| [Ak-Nobelwolf/aarakshaka](https://github.com/Ak-Nobelwolf/aarakshaka) (0★) | 3D force-directed criminal network (Three.js + react-force-graph-3d), 30 Karnataka district polygons with risk colouring, KPI cards, monthly trends, socio-economic vs Census 2011, "30-Day Forecast — Weighted moving average with seasonal multipliers", "425+ Translation Keys per language" | Catalyst Functions (Python 3.13), Data Store (ZCQL), Cache, SmartBrowz; React 18/Vite/Tailwind, Leaflet, Recharts; AI layer "GLM-4.7-Flash (30B MoE)" with statistical fallback (hosting of that model not stated — external-service status INFERRED) | "~433,000" records, "27 relational tables", 240 stations; "87,102 accused persons, 62,495 victims" | **19 screenshots** (desktop/tablet/bilingual); live `aarakshaka-kar.onslate.in` — fetched 27 Aug, title "AARAKSHAKA - Karnataka State Police" (VERIFIED title only) |
| [AbdulRehman-18/KSP_Datathon](https://github.com/AbdulRehman-18/KSP_Datathon) (2★) | FIR map/network dashboard across 25 districts; NL queries | Next.js 16/React 19/D3/Leaflet/Recharts; **Google Gemini 2.5 Flash**; Catalyst Data Store primary with fallback to an in-memory seed; **hosted on Vercel** | "150 realistic FIR cases", "55+ simulated police stations"; "The data model mirrors the official Karnataka Police FIR ER diagram with 30+ tables" | Live `ksp-datathon-beta.vercel.app`; E2E test suite mentioned; MIT |

Other 2026 repos surfaced but not fetched (GitHub metadata only, INFERRED):
[Astroidkiller/SAHAYA--AI-KSP-Datathon](https://github.com/Astroidkiller/SAHAYA--AI-KSP-Datathon) (HTML, 3★),
[anujmglni/datathon](https://github.com/anujmglni/datathon) ("ksp ai agent", 2★),
[kumbharvivek93-cmyk/Datathon-2026-project-team---AI-sonnet](https://github.com/kumbharvivek93-cmyk/Datathon-2026-project-team---AI-sonnet) (3★). A stub blog post,
[KSP Crime Intelligence Copilot | Datathon 2026](https://www.chatgptzen.com/ksp-crime-intelligence-copilot-datathon-2026-ai-powered-crime-investigation-platform/)
(19 Jul 2026), links only to a YouTube video — no content beyond the headline.

### What the peer set has in common (VERIFIED across the table above)

1. **Eleven of twelve publish a live URL in the README**; the exception (KAVAL)
   ships no data at all. DAPPA's README publishes none.
2. **Screenshots are rare** — only aarakshaka embeds them (19). A demo video link
   appears once (Project Falcon). Nobody links a deck except Falcon.
3. **Quantified validation is rare** — kkeerthanaaaa's injected-pattern recovery
   is the only ground-truth test in the set; SurakshaAI lists a confusion matrix
   as an output. Nobody states a negative result.
4. **Catalyst purity is the exception, not the rule.** Supabase/PostGIS
   (kkeerthanaaaa), Neo4j + Llama/LangChain (Saksha), Google Gemini (CrimeLens,
   AbdulRehman), NVIDIA/Groq LLMs (PRAHARI), Vercel hosting (AbdulRehman), an
   OSS-only stack (Drishti). Only Project Falcon *claims* "100% Zoho
   Catalyst-native"; CrimeIQ and CrimeVision are static front-ends that use
   Catalyst for hosting alone.
5. **The feature vocabulary is nearly identical to DAPPA's** — hotspots,
   district→station drill-down, day/night, red-zone z-scores, suspect–victim–
   location networks, station risk with explainability, socio-economic
   correlation, bilingual copilot. Differentiation is in depth and evidence, not
   in the list of screens.
6. **Two ideas in the set are stronger than DAPPA's equivalent**: KAVAL's
   provenance chain (numeric firewall + hash-chained audit + court-ready export)
   versus DAPPA's copilot (ZCQL reveal, cited tables, confidence badge — no
   tamper-evident chain); and kkeerthanaaaa's injected-pattern validation versus
   DAPPA's unsurfaced `identity_metrics.json`.

---

## 3. The previous edition — KSP Datathon 2024

- The 2024 edition ran on **Microsoft Azure** ("participants are expected to
  deploy their final solutions on Microsoft Azure") with five problem statements
  — Predictive Crime Analytics ("predict high-risk areas for specific crime
  types"), traffic, "an analytical dashboard that tracks key performance
  indicators (response times, crime clearance rates)", data-privacy
  anonymisation, and accident analysis; registration 16 Jan 2024, final
  submission 19 May, Demo Day 22 Jun 2024 (VERIFIED,
  [Hack2skill KSP Datathon 2024](http://hack2skill.com/hack/kspdatathon2024/)).
  Judging criteria are not on the page.
- The first-prize team (Team Lumina) built the response-time / clearance-rate
  KPI dashboard (INFERRED from the search snippet of
  [Tarun Behera's Medium write-up](https://medium.com/@tarunbehera032/my-experience-at-the-karnataka-state-police-datathon-2bf0f5c7aac5),
  which was INACCESSIBLE — two connection resets and a 403). The Deccan Herald
  report ["'Datathon' promotes tech innovation for safer communities"](https://www.deccanherald.com/india/karnataka/bengaluru/datathon-promotes-tech-innovation-for-safer-communities-3077235)
  (23 Jun 2024) returned only its headline and subhead ("the computer wing of
  the KSP is attempting to integrate advanced technology and data analytics into
  law enforcement practices"); body INACCESSIBLE.
- Public 2024 repos (VERIFIED from READMEs):
  [Rakshekanetra](https://github.com/shreyas27092004/crime-rate-prediction) —
  Streamlit + Google Maps API + scikit-learn, one screenshot, no metrics, no
  demo link;
  [Laxmisneha05/KSP-Dashboard](https://github.com/Laxmisneha05/KSP-Dashboard) —
  a Power BI file plus React shell over what the README presents as real
  Bengaluru FIR records ("nearly 49,000 cases over the past four years",
  "10,640 registrations" in 2023, "90.35%" non-heinous), multiple screenshots,
  no live demo;
  [brittosamjose2004/…police_rescue](https://github.com/brittosamjose2004/karnataka_state_police_hackathon-police_rescue/blob/main/README.md) —
  Flask, logistic-regression prediction, ARIMA forecast, heat maps, clustering,
  a Codespaces demo with `admin`/`admin123`, no accuracy figures.
- Take-away: the 2024 bar was a KPI dashboard on a general-purpose cloud. The
  2026 set is a full generation ahead (networks, explainable risk, copilots),
  which is why evidence, not screen count, is where the field is thin.

---

## 4. The wider hackathon field

**Devpost exemplars** (VERIFIED from project pages):

- [MapMySafety](https://devpost.com/software/mapmysafety) (Alameda Hacks) —
  "800,000+" Toronto records, 158 neighbourhoods, Folium heatmaps, and the
  headline "Predicts future crime counts with 82% accuracy (R² Score: 0.82)"
  plus "85% accuracy using Logistic Regression"; video + slides linked, "Live
  Demo: [Coming Soon]". The accuracy claims carry no validation detail.
- [Minority Report](https://devpost.com/software/minority-report-j5p6dy) (Data
  Day Grind 2.0, "Third Overall") — Dash/Plotly + Keras over "2,160,953 rows" of
  SFPD data; two screenshots, Heroku live link, patrol-warning concept with a
  feedback loop.
- [LAPD Crime Dashboard](https://devpost.com/software/lapd-crime-dashboard)
  (HopHacks Fall 2024) — React + BigQuery + Cloud Functions, one screenshot, no
  demo, no metrics.

**GitHub, ranked by stars** (VERIFIED from the topic pages
[crime-analysis](https://github.com/topics/crime-analysis) and
[predictive-policing](https://github.com/topics/predictive-policing)): the most
starred public crime-analysis repos are notebooks and R packages —
`LLM-Dynamic-Analytics-Policing` (74★), `PAASBAAN-crime-prediction` "Crime
classification, analysis & prediction in Indore city" (66★),
`crime-analysis` association-rule mining (42★), a Django "Crime Visualization
and ML Application" (38★), `crimedata` R package (27★), a D3 Manhattan
dashboard (22★), `Predictive_Guardians` (17★). Under predictive-policing the
top is a 16★ notebook; notably
[MelihOrel/lapd-crime-hotspots-fairness](https://github.com/topics/predictive-policing)
"with a focus on algorithmic fairness". Dashboard-style React repos:
[CopSight](https://github.com/krittikabiswas/copsight-police-app) (6★; React
18/TS/Tailwind/Vite/Recharts/Leaflet + FastAPI/PostgreSQL + Prophet, "Synthetic
CCTNS datasets", eight pre-trained models, **no screenshots, demo or metrics**),
[crimespot_detection](https://github.com/Mohitha2508/crimespot_detection) (33★;
React/Vite/Leaflet + FastAPI + XGBoost, "Seed 500 sample records", no
screenshots or demo), and
[crimeintel-ai](https://github.com/vipulsystems/crimeintel-ai) (19★; description
only — INFERRED: news/Reddit/Twitter aggregation with live alerts).

**Other Indian police hackathons** (VERIFIED problem statements):
[Kerala Police HAC'KP](https://hackp.kerala.gov.in/2020/problem-statements/)
lists "Predictive Policing using Bigdata Analysis" (historical crime data +
"societal factors to optimize resource deployment"), "Smart Policing using AI &
FR Technology", "Intelligent Log Analysis" and "OSINT Analysis Platform";
[Rajasthan Police Hackathon 1.0](https://www.police.rajasthan.gov.in/old/hackathon/)
(finale 17–18 Jan 2024; ₹50,000/35,000/25,000 per problem) asks for "Analysis
of FIR using AI/ML for proper Act and Section", financial-fraud money-flow
visualisation with "temporal and spatial data", and dark-web monitoring. The
BPR&D hackathon page and the Manthan "Identification of crime prone areas"
statement (INTL-DA-07) were INACCESSIBLE (HTTP 500; DNS failure) — the latter's
gist ("predictive policing… sample data from emergency services (112)") is
INFERRED from the search snippet. Smart India Hackathon's problem-statement
table renders empty without JavaScript
([sih.gov.in/sih2024PS](https://www.sih.gov.in/sih2024PS)); no SIH statement is
cited here.

**How judges score elsewhere** — the one public rubric found:
[Big Data Hackathon for San Diego 2025](https://bigdataforsandiego.github.io/)
judged "Quality of the idea", "Innovativeness / Creativity", "Readiness of the
idea to go to market", impact, teamwork and "development and design of the
idea", with "5 minutes to present + 1 minute for Q&A" (VERIFIED; the 2025 theme
was homelessness, with ARJIS crime data among the open datasets). No public
rubric for KSP Datathon 2026 was found
([hack2skill.com/event/datathon2026](https://hack2skill.com/event/datathon2026)
serves a JavaScript shell — INACCESSIBLE).

---

## 5. Indian government and state systems

**Delhi Police CMAPS** (Crime Mapping, Analytics and Predictive System).
VERIFIED from the CAG's
[Report No. 15 of 2020, ch. 9 "Digital Initiatives of Delhi Police"](https://cag.gov.in/uploads/download_audit_report/2020/9.%20Digital%20Initiatives%20of%20Delhi%20Police-05f911198e45a25.81448827.pdf)
(text extracted from the PDF, pp. 69–70): an MoU with ISRO-ADRIN was signed in
December 2015 for "a web-based application deployed in Delhi Police Headquarters
and accessible via a browser from all police stations", "primarily envisioned
as a Decision Support System"; four planned phases ("Crime analytics module,
Security module (target threat rating…), News Module (Geo tagging, clustering)
and Social media… (Social network analysis, Text annotation)"); the audit
"observed that CMAPS largely fetches data from PA-100 only and complete
integration with CCTNS was yet to be achieved (as of September 2019)", "the
advanced features like security module, open source content analysis… have not
been implemented", "no progress" on criminal profiling / mobile CMAPS after
November 2017, and "IT projects were… inadequately monitored as seen in CMAPS,
which witnessed diminished interest after initial stages." The 2016 launch
coverage ([BW Police World](https://www.bwpoliceworld.com/article/delhi-police-implements-crime-mapping-analytics-predictive-system-cmaps-134283))
described PDA devices, "records of more than two lakh criminals", GPS-traced
distress calls, and a move from crime mapping "every 15 days" to real time.
[Vidhi](https://vidhilegalpolicy.in/blog/indias-tryst-with-predictive-policing/)
notes "very little is known about the effect of the CMAPS due to large
exceptions for law enforcement agencies under the Right to Information (RTI)
Act". The MediaNama 2020 piece was INACCESSIBLE (403).

**Telangana / Hyderabad.** VERIFIED: TSCOP (2018) lets officers "click photos of
suspects and run it through the databases for identification during patrols"
against CCTNS ([SFLC](https://sflc.in/tracing-the-rise-of-predictive-policing-in-india/));
the Hyderabad City Police IT Cell page lists TSCOP, TECDATUM, CCTNS, e-petty
cases, a "Data Analysis Unit", and oversight of "lakhs of CCTVs" feeding the
state command centre ([hyderabadpolice.gov.in/itcell](https://hyderabadpolice.gov.in/itcell.html));
the Telangana Integrated Command and Control Centre "integrates over a lakh
CCTV cameras state-wide for real-time monitoring and predictive policing",
cost over ₹600 crore, opened 4 Aug 2022, with no software vendor named
([Wikipedia](https://en.wikipedia.org/wiki/Telangana_Integrated_Command_and_Control_Centre)).

**Bengaluru.** Deccan Herald, 23 Feb 2025, "Map software, AI to lend a hand in
Bengaluru crime fight" — only the subhead was readable: "Crime mapping and
crime hotspot analysis allow the police to assess crime frequency using data
from FIRs and the 112 helpline. By identifying high-risk areas, they can
strategically deploy patrol vehicles" ([DH](https://www.deccanherald.com/india/karnataka/bengaluru/map-software-ai-to-lend-a-hand-in-bengaluru-crime-fight-3418518);
body INACCESSIBLE). Karnataka also publishes district-level crime tables as open
data ([Karnataka Crime Data 2025, OpenCity CKAN](https://data.opencity.in/dataset/karnataka-crime-data-2025)
— listed in search results, not fetched; INFERRED).

**The systemic critique** (VERIFIED, [SFLC](https://sflc.in/tracing-the-rise-of-predictive-policing-in-india/)):
"basic details regarding system design, training datasets, accuracy benchmarks,
vendor contracts, and standard operating procedures remain inaccessible";
feedback-loop bias ("Areas or communities that have been historically subjected
to heavier police presence are more likely to generate higher volumes of police
data"); Safe City AI alerts "largely unreliable, with most flagged incidents
turning out to be false positives".

What this means for DAPPA: the incumbent Indian systems are opaque about
accuracy and under-delivered on their analytics modules. A submission that
publishes its metrics (including bad ones), names its data lineage, and shows
the CCTNS-shaped schema end-to-end is answering the exact criticism on record —
that is a presentation asset, not just an ethics footnote.

---

## 6. Commercial products

### Palantir Gotham

- **What it shows** (VERIFIED from Palantir's own
  [G-Cloud 14 service definition, Nov 2024](https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/92736/801146272055049-service-definition-document-2024-11-26-1253.pdf),
  text extracted from the PDF): an "Ontology" of objects and relationships;
  applications **Browser** (search + "dashboard summaries"), **Object Explorer**
  ("top-down analysis… bar chart, histogram, or pie chart", real-time object
  alerts), **Graph** with helpers "Histogram", "Selection", "History" (who
  changed the graph and when), "Table", "Search Around" ("visually query…
  can also return complex graphs"), "Timeline" ("forecast future activity"),
  HTML export; **Gaia** (geo-search by "radius, route, polygon, temporal",
  heatmaps, SHP/KMZ/KML overlays, "five-kilometer radius search for all
  individuals around the location of a known incident"); **Inbox** ("Search
  feeds" and "Geofence alert"); **Dossier** and **Slides** with live-data links;
  **Video** (full-motion video with AR overlays and third-party AI/ML detections);
  "Call Detail Record (CDR) analysis". The 2016 NCRIC user manual described
  people/vehicle search across "LAPD and LASD data sources", a Histogram tool for
  "correlations" and "Virtual Dossiers", and ALPR map search
  ([Vice](https://www.vice.com/en/article/revealed-this-is-palantirs-top-secret-user-manual-for-cops/)).
- **Credibility devices**: "operationally deployed… across all Five Eyes
  nations", named police customers (New Orleans PD predictive-policing
  programme 2012; Danish POL-INTEL 2017 "heat map identifying areas with higher
  crime rates" — [Wikipedia](https://en.wikipedia.org/wiki/Palantir_Technologies)),
  "Useful Resources: Please visit our website and YouTube channel to access a
  variety of case studies, technical documentation, product demonstrations".
  The public product pages are JavaScript shells (INACCESSIBLE).
- **Does that DAPPA does not**: entity-level ontology across every data source;
  graph edit history; geofence/search-feed alerting; CDR and video analysis;
  dossier/slide products bound to live data.
- **DAPPA does better**: publishes its evaluation numbers (Palantir's
  predictive-policing use "has elicited some controversy over racism in their
  AI analytics" and no public accuracy figures appear in any source above);
  runs on an official FIR schema a judge can read; is open source.

### i2 Analyst's Notebook (formerly IBM i2)

- **What it shows** (VERIFIED, [i2group product page](https://i2group.com/solutions/i2-analysts-notebook)):
  "core link analysis capabilities", "integrated Social Network Analysis tools"
  for "structure, hierarchy and operations of complex networks", "temporal
  analysis tools", "assisted drag-and-drop importing", multi-dimensional
  analysis; ELP (entity-link-property) charts.
- **Credibility devices**: "relied upon for more than 30 years by over 2,000
  organizations worldwide", interface screenshots throughout, "Book a demo",
  a "What's new in v10?" video, Cyber Essentials / ISO 27001 / SOC badges.
- **Does that DAPPA does not**: analyst-authored charts (hand-placed entities,
  annotations, import wizards), timeline-as-first-class canvas.
- **DAPPA does better**: algorithmic SNA is computed, not hand-drawn — Adamic–
  Adar link prediction, Brandes betweenness, k-core, bridges/cut-vertices over a
  23,833-edge graph (`CAPABILITIES.md` §C2, §C5;
  `client/src/routes/network/analysis.js`), served in a browser with no desktop
  install.

### Esri ArcGIS Crime Analysis solution

- **What it shows** (VERIFIED, [Crime Analysis tool reference, ArcGIS Solutions 11.5](https://doc.arcgis.com/en/arcgis-solutions/11.5/reference/tool-reference.htm)):
  "80-20 Analysis", "Summarize Incident Count", "Summarize Percent Change",
  "Optimized Hot Spot Analysis" ("statistically significant hot and cold spots
  using the Getis-Ord Gi* statistic"), "Kernel Density", "Space Time Kernel
  Density", "Hot Spot Analysis Comparison", "Create Space Time Cube",
  "Emerging Hot Spot Analysis", "Colocation Analysis", "Density-based
  Clustering", "Find Space Time Matches", cell-site/CDR tools ("Generate Call
  Links"), "New Link Chart", "New Report", and a Repeat-and-Near-Repeat family —
  "Repeat and Near Repeat Classification" ("uses a series of distance and time
  values to classify incidents as originators, repeats, or near repeats") and
  "Calculate Prediction Zones" ("Identify areas at risk of repeat and
  near-repeat incidents by specifying the spatial and temporal range of
  influence"). Emerging Hot Spot output classifies areas as "persistent,
  sporadic, diminishing and oscillating"
  ([Esri UK blog](https://resource.esriuk.com/blog/2018-8-31-crime-analysis-in-arcgis-pro/)).
- **Credibility devices**: named agencies and cities (Naperville, La Grange,
  Redlands PD), a video blog series, learning paths, "the industry standard for
  crime analysis technology" ([Esri law-enforcement page](https://www.esri.com/en-us/industries/law-enforcement/strategies/crime-analysis)).
- **Does that DAPPA does not** (VERIFIED by grep on 27 Aug:
  `grep -rln -i "near.repeat" client/src functions/dappa_api/lib pipeline` and
  `grep -rln -i "oscillating\|sporadic\|diminishing" client/src pipeline` both
  return nothing): repeat/near-repeat classification and prediction zones;
  emerging-hotspot categorisation over a space-time cube; hot-spot comparison
  between two periods; space-time kernel density.
- **DAPPA does better**: the same Gi* test with 95%/99% bands runs in the
  browser on a live filter, plus top-10-cell share and Gini, DBSCAN clusters,
  co-located cluster pairs, catchment coverage gaps and a deployment planner
  (`CAPABILITIES.md` §C4) — Esri's equivalents are desktop geoprocessing tools.
  DAPPA's `StationLoad` Pareto line is the 80-20 idea applied to stations.

### SAS Law Enforcement Intelligence / SAS Visual Investigator

- **What it shows** (VERIFIED, [SAS LEI](https://www.sas.com/en_us/software/law-enforcement-intelligence.html),
  [SAS Visual Investigator](https://www.sas.com/en_us/software/intelligence-analytics-visual-investigator.html)):
  "collaborative investigation workspaces", "Geospatial and timeline
  visualizations", "Visual network analysis", "entity resolution and network
  analysis", alerts "generated through scenarios, business rules and APIs" with
  triage queues, "free-text, field-based, relationship or geospatial searches",
  text analytics, "SAS Mobile Investigator", role-based access and "complete
  audit trails".
- **Credibility devices**: interface screenshots, a customer-story blog, a
  white paper, and a free SAS Viya trial environment.
- **Does that DAPPA does not**: case/evidence management workflow; rule-driven
  alert queues with disposition; entity resolution as a governed product
  feature; audit trails on analyst actions.
- **DAPPA does better**: identity resolution is done against a schema with no
  person ID and its confidence is shown per alias (`CAPABILITIES.md` §C2); the
  alert engine states its statistical caveats ("not a p-value to quote in
  court") rather than presenting rule hits as findings.

### Motorola Solutions CommandCentral Aware

- **What it shows** (VERIFIED, [product page](https://www.motorolasolutions.com/en_xl/products/smart-public-safety-solutions/intelligence-led-public-safety/commandcentral-aware.html)):
  "streaming video, real-time alerts, advanced data analytics, resource
  tracking, social media analytics, voice, Computer Aided Dispatch (CAD),
  records information into a single, intuitive interface with layered
  geospatial mapping" — a real-time crime centre. The 20 Apr 2026 release adds
  "missions", "a unified digital workspace that enables [analysts] to
  seamlessly log, analyze and measure every investigative action in real time",
  an AI "Assist", and a dashboard of "time spent, data feeds accessed and
  actions taken" to "demonstrate a clear return on investment"
  ([press release](https://www.motorolasolutions.com/newsroom/press-releases/motorola-solutions-centers-workflows-around-measurable-missions.html)).
- **Credibility devices**: named sheriff's offices quoted (Collier County, Leon
  County — "cut our analysts' administrative time in half"), brochure download,
  RTCC use cases.
- **Does that DAPPA does not**: live video/CAD/sensor fusion; measuring the
  analyst's own work as a replayable timeline.
- **DAPPA does better**: strategic (monthly/weekly) analytics on FIR records —
  the challenge's domain — rather than real-time sensor fusion, which is out of
  scope and impossible on synthetic data.

### Staqu (JARVIS / Trinetra / Crime GPT)

- **What it shows** (VERIFIED, [staqu.com](https://www.staqu.com/)): JARVIS video
  analytics, ANPR, PPE/fire detection; TRINETRA with "800,000+ Digitized
  Criminal Records" and "99.7% Face Match Accuracy"; Crime GPT — generative-AI
  search over UP Police's criminal records by "written or voice prompts", with
  "facial recognition, speaker identification, voice recognition, criminal
  network analysis" ([AIM](https://analyticsindiamag.com/ai-news-updates/staqu-unveils-trinetra-2-crime-gpt-tool-with-up-police);
  page dated 24 Dec 2025 as fetched — the launch was reported in March 2024 per
  the Business Standard listing, INFERRED).
- **Credibility devices**: hard numbers ("100,000+ live CCTV streams",
  "10,000,000+ real-time alerts processed monthly", "9 State Police
  departments"), event deployments (Ayodhya inauguration, G20), ISO 27001, "NIST
  Face Recognition Vendor Test (FRVT)", a CVPR 2024 paper, executive quotes.
- **Does that DAPPA does not**: biometrics, video, voice — all outside the
  challenge and the synthetic-data rule.
- **DAPPA does better**: every number is re-derivable from a seeded generator
  and a contract suite; no vendor-supplied accuracy figure has to be trusted.

### Innefu Labs (Prophecy Alethia)

- **What it shows** (VERIFIED, [Innefu](https://innefu.com/ai-driven-data-analytics-for-law-enforcement-and-defence/),
  [Tribune, 29 Dec 2025](https://www.tribuneindia.com/news/business/innefu-labs-strengthens-smart-policing-with-ai-powered-predictive-policing-platform-prophecy-alethia/)):
  data fusion of "structured and unstructured data", "dynamic heatmaps and
  geo-fenced analysis", network analysis, timeline mapping, telecom/device
  forensics, natural-language summarisation; sister products AI Vision,
  Innsight (OSINT), RapiDFIR, InteleLinx (CDR/IPDR).
- **Credibility devices**: "100+ installations across Indian Subcontinent,
  Middle East and South East Asia", a case-study narrative ("a measurable
  reduction in repeat incidents") with **no quantified metrics**, press
  coverage, expo appearances. (The ANI copy was INACCESSIBLE, 403.)
- **Does that DAPPA does not**: OSINT and CDR ingestion; forensics integration.
- **DAPPA does better**: publishes metrics at all; documents fallbacks and
  console-pending status per service (`README.md` service table) instead of
  claiming seamless integration.

### Two reference points on evidence

- **Geolitica (ex-PredPol)** — the cautionary case. The Markup checked 23,631
  predictions for Plainfield NJ (Feb–Dec 2018) and found a hit rate "less than
  1%" ("0.6% for robberies/assaults, 0.1% for burglaries"), the department paid
  "$20,500" and its captain said "I don't believe we really used it very often,
  if at all" ([The Markup](https://themarkup.org/prediction-bias/2023/10/02/predictive-policing-software-terrible-at-predicting-crimes),
  VERIFIED). A vendor that never published its own evaluation had it done for
  it.
- **NYPD CompStat 2.0** — the public-dashboard reference. It maps "each
  incident… to the nearest intersection" for "the last 7 days, the last 28 days,
  or the year to date", but was criticised for no download button, discarding
  "the previous week's data" each week, and no way to "compare one precinct's
  incidents to another's, or to compare one month of incidents to another"
  ([Reinvent Albany](https://reinventalbany.org/2016/03/nypd-launches-compstat-2-0-portal-with-rough-edges-no-bulk-download/),
  VERIFIED). DAPPA ships CSV exports, a multi-district compare board, a month
  scrubber and A/B swipe compare (`CAPABILITIES.md` §C1) — the exact features
  CompStat 2.0 was faulted for lacking.

---

## 7. Credibility devices — what the field uses, ranked by how often it appeared

| Device | Seen in | DAPPA today |
|---|---|---|
| Live URL in README | 11/12 KSP-2026 peers; Devpost (Minority Report); every vendor ("Book a demo", free trial) | **None** in README (`docs/ROUND2_BASELINE.md` §5: "No deployed URL anywhere") |
| Screenshots in README | aarakshaka (19); Laxmisneha05 (2024); i2, SAS, Esri pages | One (`.github/media/command-dashboard.jpg`); eleven more sit unlinked in `docs/screenshots/` |
| Demo video / deck | Project Falcon (YouTube + PDF); MapMySafety (video + slides); i2 ("What's new in v10?") | Script only (`video/script/`), no link |
| Quantified validation | kkeerthanaaaa (injected patterns recovered); MapMySafety ("R² Score: 0.82", unvalidated); Staqu ("99.7%", NIST FRVT) | `docs/benchmarks/*.json`, `GET /ml/models`, AccuracyBoard with three challengers — **none of it surfaced in README**, and identity precision 0.032 appears only in an internal prompt (`docs/05_VIDEO_PRODUCTION_PROMPT.md` L34) |
| Honest negative result | **Nobody** in the field | QuickML AUC 0.500 disclosed; `detectionRate: null` instead of 0; ChargesheetDetails 39.8% load disclosed (`CAPABILITIES.md` "Data foundation", §C6) |
| Named deployments / users | i2 "over 2,000 organizations"; Staqu "9 State Police departments"; Motorola sheriff quotes; Innefu "100+ installations" | Not applicable (prototype) — the analogue is a **team table and a live URL**, both empty |
| Data lineage stated | aarakshaka (433k rows/27 tables); AbdulRehman ("mirrors the official… ER diagram with 30+ tables"); KAVAL (none shipped, said so) | 45k FIRs, 26 ER + 8 analytics tables, seed 2026, `/healthz` completeness — strong |
| Self-reported service status | Nobody | `GET /meta/services` + generated README table — unique, but the endpoint has no client consumer (`CAPABILITIES.md` "Honesty flags") |
| Feature counts | Nobody (CrimeIQ says "5 modules"; Falcon "six pillars") | "808 cataloged features" and three mutually inconsistent scorecards |
| Analyst-action audit / provenance | KAVAL (hash-chained); Palantir Graph "History"; Motorola "missions"; SAS "complete audit trails" | Alert triage audit is client-side only (`client/src/routes/alerts/TriageNotes.jsx` L2-4: the table "has no Note / Owner / Audit columns") |

---

<a id="worse"></a>
## 8. What we do worse — each item checkable

1. **No live URL, video link or team in the README.** Eleven of twelve 2026
   peers publish a live URL; Falcon also links a YouTube demo and a deck.
   Check: `grep -n -i "catalystserverless\|onslate\|youtu" README.md` (empty);
   `README.md` L351-354 (`_TBD_`).
2. **Screenshots exist but are not shown.** aarakshaka embeds 19; DAPPA's README
   embeds one while `docs/screenshots/01…12-*.jpg` sit unlinked. Check:
   `ls docs/screenshots` vs `grep -n "docs/screenshots" README.md` (empty).
3. **The scorecard contradicts itself.** `CAPABILITIES.md` L22-27 (C5 = 121,
   "PASS") vs L451 ("85 ❌ SHORT BY 15") vs `README.md` L104-113 (C5 = 45). No
   peer publishes any scorecard; publishing three that disagree is worse than
   publishing none. Check: `sed -n '22,27p;451p' CAPABILITIES.md`.
4. **Feature-count framing has no analogue in the field.** Vendors lead with
   named deployments and outcomes; peers with modules and a URL. "808 features"
   reads as inflation to a judge who has just read Falcon's "six pillars".
   Check: `README.md` L23.
5. **No ground-truth validation is surfaced.** kkeerthanaaaa's README states
   "Correctly identified all 5 injected repeat offenders" and 2.28× vs 2.2×.
   DAPPA has `_ground_truth_offenders.csv`-based metrics but the result —
   precision 0.0321 / recall 0.5712 at threshold 0.92 — lives only in
   `docs/benchmarks/identity_metrics.json` and an internal prompt. Check:
   `grep -rn "0.0321\|identity_metrics" README.md CAPABILITIES.md` (empty).
6. **The forecast headline number is unsurfaced.** `forecast_metrics.json`
   says median MAPE 47.78, p90 83.7 over 228 series; `CAPABILITIES.md` describes
   MAPE "quality tiers" without the number. Check:
   `grep -rn "47.78\|medianMape" README.md CAPABILITIES.md client/src` (empty).
7. **CAPABILITIES denies a capability the code has.** §C2 says victim and
   location nodes do not exist; `CytoGraph.jsx` L107-113 and
   `netlinks.js` L9-11 implement them. A judge who checks the doc first marks C2
   down for nothing. Check the two files.
8. **No repeat/near-repeat classification or prediction zones.** Esri ships
   "Repeat and Near Repeat Classification" and "Calculate Prediction Zones";
   DAPPA's series detector chains cases by gap at one station, not by
   space-time proximity. Check:
   `grep -rln -i "near.repeat" client/src functions/dappa_api/lib pipeline` (empty).
9. **No emerging-hotspot categorisation.** Esri classifies cells as
   "persistent, sporadic, diminishing and oscillating"; DAPPA's Gi* is a
   single-window test and `EmergingBoard` scores growth, not cell trajectory.
   Check: `grep -rln -i "oscillating\|sporadic\|diminishing" client/src pipeline` (empty).
10. **No tamper-evident provenance on copilot answers.** KAVAL hash-chains its
    audit trail and emits a court-style certificate; DAPPA reveals ZCQL and
    cited tables but nothing an officer could attach to a file. Check:
    `CAPABILITIES.md` §C6 copilot row; `grep -rln -i "hash-chain\|sha256" client/src functions/dappa_api/lib`.
11. **No server-side analyst audit trail.** SAS, Palantir (Graph "History"),
    Motorola ("missions") and KAVAL all record what the analyst did; DAPPA's
    alert triage audit is `localStorage`-backed (`TriageNotes.jsx` L2-4) and the
    offender watchlist is "`localStorage` only" (`CAPABILITIES.md` "Honesty
    flags").
12. **Copilot voice is a browser API, not Zia.** PRAHARI and Falcon claim Zia
    speech; DAPPA's `webkitSpeechRecognition` is flagged in `CAPABILITIES.md`
    as "the one place in the app where that argument has to be made".
13. **The Catalyst-purity story is not on screen.** It is DAPPA's clearest
    differentiator against the peer set, and `GET /meta/services` "has no client
    consumer yet" (`CAPABILITIES.md` "Honesty flags"); `/about` renders a
    hardcoded constant.

<a id="better"></a>
## 9. What we do better — each item checkable

1. **Catalyst-only services, verifiably.** At least six of twelve peers depend
   on Supabase, Neo4j, Gemini, NVIDIA/Groq LLMs or Vercel (§2 table); only
   Falcon claims full nativity. DAPPA's rule is enforced in code — every AI
   path is flag-gated with a Catalyst call site named per row. Check:
   `functions/dappa_api/lib/servicemap.js`; `README.md` service table;
   `grep -rn "supabase\|openai\|gemini\|groq" functions/dappa_api/lib client/src` (empty).
2. **Official ER schema, end to end.** 26 ER tables plus the 18-digit `CrimeNo`
   breakdown in the FIR view; only AbdulRehman ("30+ tables") and aarakshaka
   ("27 relational tables") are comparable, and most peers run on flat CSV/JSON
   (SurakshaAI: "~350–435 rows"). Check: `/cases/:id`; `pipeline/generate.py`.
3. **Honest negative results, which nobody else publishes.** QuickML
   case-status AUC 0.500 disclosed with the reason; detection rate reported as
   unknown, never 0%; ChargesheetDetails at 39.8% disclosed on `/healthz`.
   Against Innefu (no metrics), Staqu (only 99.x% figures), MapMySafety
   ("82%" unvalidated) and Geolitica (never published, later found <1%), this
   is the strongest credibility asset in the scan. Check: `GET /ml/models`;
   `CAPABILITIES.md` §C6 "The honest caveat on 'AI'".
4. **Statistical hotspots equal to the desktop standard.** Getis-Ord Gi* with
   95%/99% bands, Gini concentration, DBSCAN and co-located clusters, catchment
   coverage gaps — the same tests Esri sells as "Optimized Hot Spot Analysis"
   and "Density-based Clustering", but live in the browser on a filtered window.
   No peer claims a significance test. Check:
   `client/src/routes/geointel/stats.js`; `/map` → Analysis dock.
5. **Link analysis is computed, not drawn.** Adamic–Adar hidden-link prediction,
   Dijkstra strongest-evidence path, Tarjan bridges, Brandes betweenness,
   k-core, Jaccard pair overlap over 23,833 edges; peers stop at a force graph
   (CrimeIQ, CrimeVision, aarakshaka's 3D graph). Check:
   `client/src/routes/network/analysis.js`; `/network` → Link suggestions.
6. **Resource deployment is implemented, not implied.** Patrol route that
   respects the hour lens, a 60/40 deployment planner with the split stated,
   station-load Pareto — the challenge's "smarter resource deployment" clause.
   Peers and CompStat-style dashboards stop at the map. Check: `/` →
   Deployment panel; `/map` → `P`.
7. **Fairness by contract.** Caste/religion excluded from every model and
   export, enforced by a contract-suite guardrail; SFLC's critique of Indian
   systems is precisely that such details are "inaccessible". Only one repo in
   the wider field (MelihOrel) treats fairness at all. Check:
   `node functions/dappa_api/test/run.mjs` (privacy guardrail case).
8. **Test evidence.** 803 contract checks, a smoke suite, a bilingual parity
   gate at 5,286 keys (aarakshaka: "425+" keys). AbdulRehman is the only peer
   to mention tests. Check: `docs/ROUND2_BASELINE.md` §1;
   `node scripts/check_i18n.mjs`.
9. **Degradation design is self-describing.** Every AI feature has a flag, an
   identical-shape fallback and a `console-pending` reason on
   `GET /meta/services`; PRAHARI's "LLM fallback" is a chain of external
   models, CrimeLens's fallback is rule-based, and vendors do not discuss
   fallbacks at all. Check: `README.md` environment table.
10. **Public-dashboard hygiene that CompStat 2.0 lacks.** CSV export
    (`/alerts.csv`, `/cases.csv`), multi-district compare, month scrubber, A/B
    swipe compare, per-alert decomposition. Check: `CAPABILITIES.md` §C1, §C3.
11. **Synthetic data that is documented as synthetic.** Deterministic seed,
    visible banner, 45k FIRs; Laxmisneha05 (2024) appears to publish real
    Bengaluru FIR figures, KAVAL ships none. Check: `README.md` "Data ethics";
    `pipeline/generate.py --seed 2026`.

---

## 10. Implications for Round 2 (candidates, not commitments)

Only items that add analytic or visual substance the challenge asks for, or fix
a credibility defect — no screen counts.

- **Fix the evidence gap first; it is cheap and it is where the field is
  thin.** Live Production URL, the eleven screenshots, the video link and the
  team in the README; one reconciled scorecard (`scripts/check_capabilities.mjs`
  already exists for this per `CLAUDE.md`); correct §C2 to match `CytoGraph.jsx`.
- **Surface the numbers we already have, kkeerthanaaaa-style.** A "validation"
  card: injected patterns in `generate.py` → recovered by `analytics.py`
  (hotspots, series, identity pairs), with the identity precision/recall shown
  as-is and the threshold explained; forecast median/p90 MAPE beside the
  AccuracyBoard.
- **Two spatial-statistics additions close the Esri gap inside C4**: emerging-
  hotspot trajectory classes over the monthly Gi* series (persistent /
  intensifying / diminishing / sporadic / oscillating) and a repeat/near-repeat
  classifier with prediction zones over `CaseMaster` lat/lng × date. Both are
  pure computation over data already loaded.
- **Provenance on copilot answers** (KAVAL's idea, Catalyst-native): hash the
  executed ZCQL + result digest into the answer envelope and persist it in Data
  Store so an answer can be re-verified — a real C6 "intelligence" feature, not
  chrome.
- **Server-side analyst audit** for alert acknowledgements and watchlist adds
  (`POST /offenders/watch` exists and is unused per `CAPABILITIES.md`), which is
  what SAS/Palantir/Motorola all treat as table stakes.
- **Put `/meta/services` on `/about`** so the Catalyst-purity differentiator is
  visible without `curl`.

---

<a id="gaps"></a>
## 11. Gaps — what could not be verified

- [Tarun Behera's KSP Datathon 2024 write-up](https://medium.com/@tarunbehera032/my-experience-at-the-karnataka-state-police-datathon-2bf0f5c7aac5) — ECONNRESET twice, 403 via the alternate fetcher; winner details are from a search snippet only.
- [Deccan Herald, 23 Jun 2024](https://www.deccanherald.com/india/karnataka/bengaluru/datathon-promotes-tech-innovation-for-safer-communities-3077235) and [23 Feb 2025](https://www.deccanherald.com/india/karnataka/bengaluru/map-software-ai-to-lend-a-hand-in-bengaluru-crime-fight-3418518) — only headline and subhead returned; bodies paywalled/JS.
- [Hack2skill Datathon 2026](https://hack2skill.com/event/datathon2026) — JavaScript shell; no public judging criteria found anywhere.
- [Palantir Gotham](https://www.palantir.com/platforms/gotham/) and [Gotham Europa](https://www.palantir.com/platforms/gotham/europa/) pages — JavaScript shells; the G-Cloud PDF, Vice and Wikipedia were used instead.
- [Manthan INTL-DA-07](https://manthan.mic.gov.in/ps_details.php?psid=INTL-DA-07) — DNS failure; [BPR&D hackathons](https://bprd.nic.in/page/hackathons_by_bprd) — HTTP 500; [SIH 2024 PS table](https://www.sih.gov.in/sih2024PS) — empty without JS. No SIH statement is cited.
- [MediaNama on CMAPS (2020)](https://www.medianama.com/2020/11/223-how-delhi-police-uses-data-from-emergency-calls-to-track-map-crime/), [ANI on Prophecy Alethia](https://aninews.in/news/business/innefu-labs-strengthens-smart-policing-with-ai-powered-predictive-policing-platform-prophecy-alethia20251229175155/), Esri's ["What's new in the Crime Analysis solution"](https://www.esri.com/arcgis-blog/products/arcgis-solutions/public-safety/whats-new-in-the-crime-analysis-solution) and ["Introducing the new crime analysis tools"](https://www.esri.com/arcgis-blog/products/arcgis-pro/public-safety/introducing-the-new-crime-analysis-tools-in-arcgis-pro) — 403; substitutes cited above.
- Peer live demos — three fetched ([kkeerthanaaaa](https://project-rainfall-60078528363.development.catalystserverless.in/app/index.html), [aarakshaka](https://aarakshaka-kar.onslate.in/), [CrimeVision](https://crimevision-ai-cqetlerx.onslate.in/)) returned only SPA titles; whether the apps work was not verified. The others were not fetched.
- Devpost's search page is JavaScript-only; three project pages were read directly. LinkedIn posts and YouTube videos were not attempted.
- The 2026 peer set is a public-repo sample from GitHub search, not the entrant list; teams with private repos are invisible to this scan.
- The Staqu/AIM article carries a 24 Dec 2025 page date while the launch was reported in March 2024 (Business Standard listing, not fetched); the date discrepancy is noted, not resolved.
- Star counts, dates and descriptions for repos not fetched come from the GitHub API and were not read in a README.

---

## Sources

DAPPA repository (read 27 Aug 2026): `README.md`, `CAPABILITIES.md`,
`docs/ROUND2_BASELINE.md`, `docs/benchmarks/forecast_metrics.json`,
`docs/benchmarks/identity_metrics.json`, `docs/benchmarks/socio_correlation.json`,
`docs/screenshots/` listing, `client/src/routes/network/CytoGraph.jsx`,
`functions/dappa_api/lib/routes/netlinks.js`, `client/src/routes/alerts/TriageNotes.jsx`,
`docs/05_VIDEO_PRODUCTION_PROMPT.md` (local-only file, cited for one line).

External pages (VERIFIED unless marked):

1. https://github.com/kkeerthanaaaa/KSP-Hackathon-Deploy
2. https://github.com/SarmaHighOnCode/KSPDatathon
3. https://github.com/Dharaneesh20/PRAHARI
4. https://github.com/MdSaifAli063/AI-Driven-Crime-Analytics-Visualization-Platform-For-KSP
5. https://github.com/srixram08/crimevision-AI
6. https://github.com/Xmanish8/KSP_DATATHON
7. https://github.com/Aadhithya-balu/Saksha_Datathon
8. https://github.com/mohammadsahil74808/Project-Drishti
9. https://github.com/Mappillai-Meeran/CrimeLens-OS
10. https://github.com/MUKUL-PRASAD-SIGH/Project-Falcon
11. https://github.com/Ak-Nobelwolf/aarakshaka
12. https://github.com/AbdulRehman-18/KSP_Datathon
13. https://github.com/shreyas27092004/crime-rate-prediction
14. https://github.com/Laxmisneha05/KSP-Dashboard
15. https://github.com/brittosamjose2004/karnataka_state_police_hackathon-police_rescue/blob/main/README.md
16. http://hack2skill.com/hack/kspdatathon2024/
17. https://medium.com/@tarunbehera032/my-experience-at-the-karnataka-state-police-datathon-2bf0f5c7aac5 — INACCESSIBLE
18. https://www.deccanherald.com/india/karnataka/bengaluru/datathon-promotes-tech-innovation-for-safer-communities-3077235 — headline/subhead only
19. https://www.chatgptzen.com/ksp-crime-intelligence-copilot-datathon-2026-ai-powered-crime-investigation-platform/ — stub
20. https://hack2skill.com/event/datathon2026 — INACCESSIBLE (JS shell)
21. https://devpost.com/software/mapmysafety
22. https://devpost.com/software/minority-report-j5p6dy
23. https://devpost.com/software/lapd-crime-dashboard
24. https://github.com/topics/crime-analysis
25. https://github.com/topics/predictive-policing
26. https://github.com/krittikabiswas/copsight-police-app
27. https://github.com/Mohitha2508/crimespot_detection
28. https://github.com/vipulsystems/crimeintel-ai — metadata only (INFERRED)
29. https://bigdataforsandiego.github.io/
30. https://hackp.kerala.gov.in/2020/problem-statements/
31. https://www.police.rajasthan.gov.in/old/hackathon/
32. https://manthan.mic.gov.in/ps_details.php?psid=INTL-DA-07 — INACCESSIBLE (DNS)
33. https://bprd.nic.in/page/hackathons_by_bprd — INACCESSIBLE (500)
34. https://www.sih.gov.in/sih2024PS — empty without JS
35. https://cag.gov.in/uploads/download_audit_report/2020/9.%20Digital%20Initiatives%20of%20Delhi%20Police-05f911198e45a25.81448827.pdf
36. https://www.bwpoliceworld.com/article/delhi-police-implements-crime-mapping-analytics-predictive-system-cmaps-134283
37. https://vidhilegalpolicy.in/blog/indias-tryst-with-predictive-policing/
38. https://www.medianama.com/2020/11/223-how-delhi-police-uses-data-from-emergency-calls-to-track-map-crime/ — INACCESSIBLE (403)
39. https://sflc.in/tracing-the-rise-of-predictive-policing-in-india/
40. https://hyderabadpolice.gov.in/itcell.html
41. https://en.wikipedia.org/wiki/Telangana_Integrated_Command_and_Control_Centre
42. https://www.deccanherald.com/india/karnataka/bengaluru/map-software-ai-to-lend-a-hand-in-bengaluru-crime-fight-3418518 — headline/subhead only
43. https://data.opencity.in/dataset/karnataka-crime-data-2025 — search listing only (INFERRED)
44. https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/92736/801146272055049-service-definition-document-2024-11-26-1253.pdf
45. https://www.vice.com/en/article/revealed-this-is-palantirs-top-secret-user-manual-for-cops/
46. https://en.wikipedia.org/wiki/Palantir_Technologies
47. https://www.palantir.com/platforms/gotham/ — INACCESSIBLE (JS shell)
48. https://www.palantir.com/platforms/gotham/europa/ — INACCESSIBLE (JS shell)
49. https://i2group.com/solutions/i2-analysts-notebook
50. https://doc.arcgis.com/en/arcgis-solutions/11.5/reference/tool-reference.htm
51. https://resource.esriuk.com/blog/2018-8-31-crime-analysis-in-arcgis-pro/
52. https://doc.arcgis.com/en/arcgis-solutions/latest/reference/introduction-to-crime-analysis.htm
53. https://www.esri.com/en-us/industries/law-enforcement/strategies/crime-analysis
54. https://www.esri.com/arcgis-blog/products/arcgis-solutions/public-safety/whats-new-in-the-crime-analysis-solution — INACCESSIBLE (403)
55. https://www.esri.com/arcgis-blog/products/arcgis-pro/public-safety/introducing-the-new-crime-analysis-tools-in-arcgis-pro — INACCESSIBLE (403)
56. https://www.sas.com/en_us/software/law-enforcement-intelligence.html
57. https://www.sas.com/en_us/software/intelligence-analytics-visual-investigator.html
58. https://www.motorolasolutions.com/en_xl/products/smart-public-safety-solutions/intelligence-led-public-safety/commandcentral-aware.html
59. https://www.motorolasolutions.com/newsroom/press-releases/motorola-solutions-centers-workflows-around-measurable-missions.html
60. https://www.staqu.com/
61. https://analyticsindiamag.com/ai-news-updates/staqu-unveils-trinetra-2-crime-gpt-tool-with-up-police
62. https://innefu.com/ai-driven-data-analytics-for-law-enforcement-and-defence/
63. https://www.tribuneindia.com/news/business/innefu-labs-strengthens-smart-policing-with-ai-powered-predictive-policing-platform-prophecy-alethia/
64. https://aninews.in/news/business/innefu-labs-strengthens-smart-policing-with-ai-powered-predictive-policing-platform-prophecy-alethia20251229175155/ — INACCESSIBLE (403)
65. https://themarkup.org/prediction-bias/2023/10/02/predictive-policing-software-terrible-at-predicting-crimes
66. https://reinventalbany.org/2016/03/nypd-launches-compstat-2-0-portal-with-rough-edges-no-bulk-download/
67. https://project-rainfall-60078528363.development.catalystserverless.in/app/index.html — SPA shell only
68. https://aarakshaka-kar.onslate.in/ — title only
69. https://crimevision-ai-cqetlerx.onslate.in/ — title only

*Written 27 Aug 2026 for the Round-2 build. Re-run the greps in §8–§9 before
quoting any DAPPA-side claim; the peer READMEs may have changed since fetch.*
