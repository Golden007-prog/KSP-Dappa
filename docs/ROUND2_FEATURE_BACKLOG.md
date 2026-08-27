# Round-2 feature backlog — every candidate the research surfaced

*Written 27 August 2026 from the four Phase-2 research documents, the master prompt's committed workstreams (Phases 4–9), `README.md`, `CAPABILITIES.md`, `docs/ROUND2_BASELINE.md`, all 808 entries of `FEATURES.md`, and the current source tree. This is a candidate list, not a commitment list: Phase 8 builds from it highest value-per-effort first.*

## How to read this file

**One row = one candidate.** A row is a capability feature only if it delivers analytic or visual substance the challenge text asks for (master prompt Appendix A). Everything else — controls, write paths, tests, performance, accessibility plumbing, documentation — is tagged `infra`. It is in the backlog because the product needs it, not because it counts.

**Columns.** *Workstream* is one of the eight Phase-8 lanes. *Capability* is C1–C6 or `infra`. *Effort*: S ≤ half a day, M one to two days, L three days or more. *Value* 1–5: 5 = substance a judge can open and that the challenge names, or a credibility defect the competitive scan found we alone have; 1 = marginal. Rows are grouped by workstream and ordered by value-per-effort (S=1, M=2, L=3; ties by value, then by smaller effort).

**Source codes.** `DOM §n` = [docs/DOMAIN_RESEARCH.md](DOMAIN_RESEARCH.md); `UX §n` = [docs/UX_RESEARCH.md](UX_RESEARCH.md); `CAT §n` = [docs/CATALYST_SERVICE_RESEARCH.md](CATALYST_SERVICE_RESEARCH.md); `COMP §n` = [docs/COMPETITIVE_SCAN.md](COMPETITIVE_SCAN.md); `MP Ph n` = `docs/06_ROUND2_MASTER_PROMPT.md` phase n (local file, a requirement rather than a finding); `CAP §Cn` = [CAPABILITIES.md](../CAPABILITIES.md); `BASE §n` = [docs/ROUND2_BASELINE.md](ROUND2_BASELINE.md); `Code: path` = a file read for this backlog. **`V`** after a code means the underlying fact is marked VERIFIED in that document (read on the linked page) or was read in the named file today; **`I`** means it is an inference — the research document's or mine — and a reviewer can disagree with it. Every external URL behind a `V` is in the cited document's Sources list; the ones this backlog relies on directly are repeated in [Sources](#sources).

**Duplicate control.** Every row was checked against the 808 catalogued entries in `FEATURES.md` and against the ~230 uncatalogued components `CAPABILITIES.md` counts (crews, MO evolution, behaviour change, peer cohorts, learned MO vocabulary, victim and location panels, LinkLab, Gi\* grid, catchment, deployment planner, series detector, accuracy board, horizon panel, driver lift, alert decomposition — all confirmed present under `client/src/routes/*` today). Three scaffolds exist untracked and unwired and are treated as *existing plumbing*, not as delivered features: `client/src/lib/tier.js` (tier store, no `/beat` `/station` `/state` routes in `App.jsx`), `client/src/lib/plainlanguage.js` + `components/PlainTerm.jsx` (glossary layer, no consumer found by grep), `client/src/lib/voice.js` + `components/ReadAloudButton.jsx` (kn-IN voice picking; the copilot's own read-aloud and voice input are `FEATURES.md` 604/639). Rows that wire those scaffolds say so.

**The honest headline before the table.** The master prompt asks for "200+ genuinely new capability-bearing features". This backlog holds **258 candidates, of which 114 are capability-bearing and 144 are infra**. Without inflating — counting a loading state, a toggle or a write path as a scored feature — the research does not yield 200 capability features. The prompt's own rule is "adjust with reasoning, do not silently drift": the reasoning is that the credibility work (evidence in the README, one scorecard, validation cards), the officer-tier work and the action loop are mostly infra by the counting rules the repository already publishes, and they are worth more to a judge than the count. The per-workstream and per-capability totals are at the end.

---

## 1. Officer-tier UX + plain language (57)

| # | Feature | Workstream | Capability (C1-C6 or infra) | Effort (S/M/L) | Value (1-5) | Source (doc §) |
|---|---|---|---|---|---|---|
| 1 | Tier switcher (Beat / Station / District / State) in the topbar with a `?tier=` deep link, wired to the existing `useTierStore` — the demo asset that walks a judge from DGP to constable | Officer-tier UX | infra | S | 5 | MP Ph4 · Code: client/src/lib/tier.js V (store exists, no UI consumer I) |
| 2 | Alert cards say the plain sentence first — "41 this week against a usual 18 — about 3 swings above normal" — with z = 3.1 behind the (i); wires `plainlanguage.js` `zscore.value` into `AlertCard` | Officer-tier UX | C3 | S | 5 | UX §11.2 #1 V · Code: client/src/lib/plainlanguage.js V |
| 3 | Tier home routes `/beat`, `/station`, `/state` registered (none exist in `App.jsx`) with tier-default scope and date window (beat 7 days, station 4 weeks, district month, state YTD) | Officer-tier UX | infra | S | 4 | MP Ph4 · Code: client/src/App.jsx V |
| 4 | Plain-language toggle in the topbar bound to the store's `plainLanguage` / `setPlainLanguage`, on by default below District | Officer-tier UX | infra | S | 4 | MP Ph4 · Code: tier.js V |
| 5 | "Within the normal range" wording for every KPI / trend delta with \|z\| < 2, never "up 12 %" (Government Analysis Function rule) | Officer-tier UX | C3 | S | 4 | UX §11.1 rule 3 V |
| 6 | Forecast plain sentence on the KPI tile and forecast explorer — "expect around 140 next month, most likely 120–160; the true number lands in that band 8 times in 10" (ONS band-plus-sentence form, 80 % band) | Officer-tier UX | C6 | S | 4 | UX §11.1 rule 2 V · UX §11.2 #11 V |
| 7 | Hotspot cards read "27 incidents within 400 m of each other, 11 PM–3 AM, last 8 weeks — a patch, not a whole area"; ε / minPts move to the technical reveal | Officer-tier UX | C4 | S | 4 | UX §11.2 #3 V |
| 8 | My Beat: last-7-days FIRs registered in my unit (head, time band, CrimeNo) — the beat tile's "what happened" list | Officer-tier UX | C1 | S | 4 | DOM §5 tier 1 I · MP Ph4 |
| 9 | Station: "needs action today" — open alerts for my unit with SLA clocks and anything escalated to me | Officer-tier UX | C3 | S | 4 | MP Ph4 · DOM §5 tier 2 I |
| 10 | State: MoM / YoY prose auto-generated per head in the Crime Review's own sentence pattern ("There is a decrease in the reported cases of Murder during the current month when compared to the previous month and the corresponding month of the previous year") | Officer-tier UX | C4 | S | 4 | DOM §3.1 V |
| 11 | Lawful-next-steps panel on every person view: BNSS s.35 necessity checklist and the *Arnesh Kumar* directions, s.84 proclamation, ss.126–129 security proceedings, KPA s.55 externment — the words "arrest" and "detain" never appear as prompts | Officer-tier UX | infra | S | 4 | DOM §8.4 V · DOM §6.3 V |
| 12 | Percentile rendered as "higher than 90 of every 100 stations" on risk tiers (replaces the `p{p}` label in `cases.js:844`) | Officer-tier UX | C3 | S | 3 | UX §11.2 #10 V |
| 13 | AUC as "sorts the right case higher 78 times out of 100 — 50 is a coin toss" on model cards, and the QuickML case-status 0.500 stated in the same frame as a negative result | Officer-tier UX | C6 | S | 3 | UX §11.2 #9 V · CAP §C6 V |
| 14 | Network group plain sentence ("9 people who keep turning up in the same cases across 4 districts — the computer only counts shared cases, it does not know they are a gang") on the community summary and Offender-360 | Officer-tier UX | C5 | S | 3 | UX §11.2 #4 V |
| 15 | Officer glossary page: the 15 worked terms × English / Kannada, label → sentence → example → formula, with the Kannada sign-off status (`kn-V` / `repo` / `unv`) shown — GIGW's "list of abbreviations or a glossary" and WCAG 3.2.6 self-help | Officer-tier UX | infra | S | 3 | UX §11.2 V · UX §3 V |
| 16 | KPI dictionary in the SCRB's idiom: CCS-17 disposal states (Rep / Fal / Tr / Tru / NI / Con / Dis-Acq / Com / PT / UI / UN / OD / AB) and the Crime Review heads as the label vocabulary everywhere | Officer-tier UX | infra | S | 3 | DOM §3.1 row 12 V (expansions I) · DOM §8.12 I |
| 17 | Provenance stamp under every figure — "as on <date> · provisional · window · method" — from a `meta.provenance` block on every API response, in the Crime Review's own footer idiom | Officer-tier UX | infra | S | 3 | DOM §8.8 V · DOM §3.1 V |
| 18 | Purpose statement line on every analytic screen and in the brief: produced for patrol allocation and supervision (BNSS s.168 lane), never as grounds for individual suspicion (s.170) | Officer-tier UX | infra | S | 3 | DOM §8.1 V · DOM §6.1 V |
| 19 | Festival-week chip on beat and station cards (Ugadi / Dasara / Deepavali windows already in the trends chart) plus full-moon dates on the station crime chart — the manual-era crime-chart annotation | Officer-tier UX | C4 | S | 3 | DOM §1.13 V · Code: FEATURES.md 277 V |
| 20 | Station: possible-series auto-scan scoped to my unit with a plain sentence ("3 burglaries in 9 days at this station — possibly one series") reusing `SeriesDetector` | Officer-tier UX | C4 | S | 3 | DOM §3.3 V (crime review objectives) · CAP §C4 V |
| 21 | Station: 8-week unit trend sparkline against the district median | Officer-tier UX | C1 | S | 3 | DOM §5 tier 2 I |
| 22 | District: "needs decision" queue — items escalated from the station tier (alerts, aliases, watch requests) with the decision recorded | Officer-tier UX | infra | S | 3 | MP Ph4 · MP Ph7 |
| 23 | State: unit-wise breakup panel for rare heads (dacoity, murder, POCSO by unit), the Crime Review's per-head "unit wise break up" | Officer-tier UX | C1 | S | 3 | DOM §3.1 V |
| 24 | Tier-scoped data: unit / district filters locked by tier — Beat and Station never see statewide rollups, District never sees another district's operational detail | Officer-tier UX | infra | S | 3 | MP Ph4 |
| 25 | Role → tier from Catalyst Authentication's `role_details.role_name` (constable → beat, SI / SHO → station, SP / DSP → district, IGP / DGP / SCRB → state; anonymous → district) using the existing `tierForRole` | Officer-tier UX | infra | S | 3 | CAT §4.7 V · Code: tier.js V |
| 26 | Tier-aware copilot suggestions ("what happened in my station this week?" / "ಈ ವಾರ ನನ್ನ ಠಾಣೆಯಲ್ಲಿ ಏನಾಗಿದೆ?") | Officer-tier UX | C6 | S | 3 | MP Ph5 |
| 27 | Sources page: which ER tables feed each screen (CaseMaster → cases / hotspots; NetworkEdge → network; AggMonthly → trends …) — the data-minimisation safeguard made visible | Officer-tier UX | infra | S | 3 | DOM §8.9 V |
| 28 | My Beat: today's risk for my unit in plain words (StationRisk score → tier word) with the top driver spelled out, one card | Officer-tier UX | C3 | M | 5 | MP Ph4 · DOM §5 tier 1 I |
| 29 | My Beat: nearby hotspots (distance, hour band, "when to patrol" chip) from `/geo/hotspots` scoped to the unit | Officer-tier UX | C4 | M | 5 | MP Ph4 · DOM §3.4 V (beat duties) |
| 30 | Station console: this week's registrations by crime head for my unit against the usual level, in the Crime Review's month-vs-month idiom | Officer-tier UX | C1 | M | 5 | DOM §5 tier 2 I · DOM §3.1 V |
| 31 | District: CCS-17 disposal funnel per unit — Rep → True → UI / UN / PT → Con / Acq / Abated — the state's own detection and pendency vocabulary | Officer-tier UX | C4 | M | 5 | DOM §3.1 row 12 V · DOM §9 I |
| 32 | State: 38-unit × crime-head matrix (Crime Review section 2 replica with the "AS ON <date>" stamp), OLAP-backed where enabled | Officer-tier UX | C1 | M | 5 | DOM §3.1 row 2 V · CAT §18.1 V |
| 33 | Status = colour + glyph + word on every pill, badge and choropleth legend (▲ RISING / ಏರಿಕೆ, ● WATCH / ನಿಗಾ, ✓ STABLE / ಸ್ಥಿರ, ▼ FALLING / ಇಳಿಕೆ, — NO DATA) — the same meaning on every screen and on a mono printer | Officer-tier UX | C1 | M | 4 | UX §10 V · MP Ph4 |
| 34 | My Beat: my assigned cases (CaseMaster.IOID → Employee, Employee.UnitID) with pendency age | Officer-tier UX | C1 | M | 4 | Code: docs/ER_TEXT_EXTRACT.txt (IOID, Employee) V · MP Ph4 |
| 35 | My Beat: beat map tile — unit centroid, overlapping hotspot circles, last-7-day points; GeoJSON only, no tile server needed offline | Officer-tier UX | C1 | M | 4 | DOM §5 tier 1 I · UX §6 I |
| 36 | Station: undetected property cases older than 30 days (the CCS-17 "UN" lens) | Officer-tier UX | C4 | M | 4 | DOM §3.1 V · DOM §5 tier 2 I |
| 37 | Station: accused with no arrest record after N days (Accused ⋈ ArrestSurrender) — the absconder watch that routes to s.84, never to an action prompt | Officer-tier UX | C2 | M | 4 | DOM §6.4 V · Code: ER_TEXT_EXTRACT (ArrestSurrender) V |
| 38 | Station: hotspots in my unit with no patrol stop this week — beat coverage against the hotspot overlap | Officer-tier UX | C4 | M | 4 | DOM §3.4 V (SHO receives the beats) · CAP §C4 V |
| 39 | Station: my officers' caseload and median pendency per IO | Officer-tier UX | C1 | M | 4 | Code: ER_TEXT_EXTRACT (IOID) V |
| 40 | District: Crime Review triad per head — this month vs last month vs the same month last year — with the fixed prose sentence and the sub-split rows | Officer-tier UX | C4 | M | 4 | DOM §3.1 V |
| 41 | State: range / commissionerate rollup (7 ranges + 6 commissionerates + Railways) built from `Unit.ParentUnit` | Officer-tier UX | C1 | M | 4 | DOM §3.1 row 9 V · DOM §5 V · Code: ER_TEXT_EXTRACT (Unit.ParentUnit) V |
| 42 | Three-questions header on each tier home — *What is happening? Why does it matter? What should I do?* — composed from live KPIs, alerts and hotspots; a panel that cannot answer the third goes to the analyst drawer | Officer-tier UX | C1 | M | 4 | MP Ph4 |
| 43 | Per-tier one-page print brief (Beat card, Station page) that survives a black-and-white station printer, extending `PrintBrief.jsx` | Officer-tier UX | C1 | M | 4 | MP Ph4 · UX §9 V |
| 44 | "Trained on" allow-list on Predict and in `pipeline/analytics.py`: complainant-reported heads only; police-initiated heads (KPA gambling, Excise, NDPS, COTPA, 126–129 BNSS, MV Act) excluded from hotspot and forecast training | Officer-tier UX | C6 | M | 4 | DOM §8.6 V (Lum & Isaac; Crime Review SLL counts) |
| 45 | Registration-collapse anomaly type — a station whose registrations drop abnormally is flagged as a data-quality / burking signal, not celebrated as a fall in crime | Officer-tier UX | C3 | M | 4 | DOM §2.4 V (ORF) · DOM §8.7 I |
| 46 | Disparity panel: share of hotspot-hours and alerts landing on each district's socio-economic class (`SocioEconomic` indicators; caste and religion never used) | Officer-tier UX | C3 | M | 4 | DOM §8.7 I · DOM §7.1 V |
| 47 | Mobile-first Beat / Station homes at 360×640: one action button in the bottom third, 44–48 px targets, one-handed | Officer-tier UX | infra | M | 4 | MP Ph4 · UX §8 V |
| 48 | Copilot parses Kannada questions through the verified officer glossary (ಠಾಣೆ, ಜಿಲ್ಲೆ, ಸರಗಳ್ಳತನ, ರೌಡಿಶೀಟರ್, ಯುಡಿಆರ್ …) and answers in the plain-language register when plain mode is on | Officer-tier UX | C6 | M | 4 | DOM §4 V · UX §11.1 rule 10 I |
| 49 | Kannada by default for Beat and Station tiers (user override persists) | Officer-tier UX | infra | S | 2 | DOM §1.14 V (vocabulary) · I |
| 50 | Monthly Crime Review generator — 17 heads, the triad, sub-splits, the 38-unit table, range rollup, "provisional / as on" footer — from synthetic data, delivered as the SmartBrowz PDF | Officer-tier UX | C1 | L | 5 | DOM §9 I · DOM §3.1 V · CAT §7 V |
| 51 | Station: "today vs the usual weekday" — this weekday's registrations against the same-weekday average | Officer-tier UX | C3 | M | 3 | DOM §5 I · CAP §C4 V (53×7 grid exists) |
| 52 | District: Crime Review sub-splits as panels — chain-snatching vs other robbery, HBT day vs night, murder for gain vs other | Officer-tier UX | C4 | M | 3 | DOM §3.1 V |
| 53 | District: Long Pending Register view — cases pending beyond N days with untraced accused, by station | Officer-tier UX | C4 | M | 3 | DOM §4 (LPR row) I · CAP §C4 V (pendency exists) |
| 54 | State: Comparative Crime Statement — three-year YTD per Part-I head | Officer-tier UX | C4 | M | 3 | DOM §3.1 row 12 V |
| 55 | Progressive-disclosure layout on tier homes: answer card → evidence drawer → method drawer; the method never leads | Officer-tier UX | infra | M | 3 | MP Ph4 |
| 56 | Unit-hierarchy scope breadcrumb (station → circle → sub-division → district → range) from `Unit.ParentUnit` | Officer-tier UX | infra | M | 3 | DOM §5 V · Code: ER_TEXT_EXTRACT V |
| 57 | Preventive Action Report panel (126 / 128 / 129 BNSS counts by unit) — only if the crime-head lookup carries security-proceedings heads; today it does not, so this needs a generator and lookup change first | Officer-tier UX | C1 | L | 2 | DOM §1.4 V · DOM §6.2 V · Code: functions/dappa_api/lib/constants.js (no such head) V |

## 2. Face identification (30)

| # | Feature | Workstream | Capability (C1-C6 or infra) | Effort (S/M/L) | Value (1-5) | Source (doc §) |
|---|---|---|---|---|---|---|
| 58 | Ranked candidate grid where the confidence figure sits beside every candidate and the word "match" never appears alone | Face identification | C1 | S | 5 | MP Ph6 · DOM §1.11 V (Delhi's 80 % rule) |
| 59 | Confidence floor with an honest dead band — below the floor the screen says "no reliable match", not a weak best guess; the floor is visible and configurable (Zia's own `matched` flips at 0.5) | Face identification | C6 | S | 5 | MP Ph6 · CAT §5.1 V · DOM §7.4 V |
| 60 | Quality-gate result card: bounding box and landmarks drawn on the upload, `faces_count`, confidence, and a plain reason when rejected | Face identification | C1 | S | 4 | CAT §5.2 V |
| 61 | Shortlist explanation line — "25 candidates from Bengaluru City vehicle-theft cases, 2019–2026; top match 87 %" | Face identification | C6 | S | 4 | MP Ph6 |
| 62 | Purpose binding: a linked case number and a selected legal basis are required before the search button enables | Face identification | infra | S | 4 | MP Ph6 · DOM §8.1 V |
| 63 | Confirm / reject per candidate recorded with the officer's identity into `ActionLog` (`SubjectType` = face) | Face identification | infra | S | 4 | MP Ph6 · MP Ph7 |
| 64 | Offender-360 face panel: gallery image, quality score, "compare with an upload" | Face identification | C1 | S | 4 | MP Ph6 |
| 65 | Alias verification mode: `compareFace` between the gallery images of the two persons in a weak alias pair — no upload, answers "same person?" for the queue | Face identification | C2 | S | 4 | CAT §5.1 V |
| 66 | `/identify` upload (jpeg / png / webp, ≤ 10 MB per the Identity Scanner limit) under a persistent "synthetic gallery — generated faces only" banner | Face identification | infra | S | 3 | CAT §5.1 V · MP §0 |
| 67 | Side-by-side compare view: upload vs candidate with the 5-point landmark overlay from `analyseFace` `mode: 'moderate'` | Face identification | C1 | S | 3 | CAT §5.2 V |
| 68 | Face-search history view with the outcome of each search | Face identification | infra | S | 3 | MP Ph6 |
| 69 | Face-search outcome statistics: confirm rate, "no reliable match" rate, median top confidence | Face identification | C6 | S | 3 | MP Ph6 I |
| 70 | Floor-sensitivity board: how many past searches would flip at 0.7 / 0.8 / 0.9, computed from logged confidences | Face identification | C6 | S | 3 | DOM §1.11 V · I |
| 71 | Gallery ingest quality via `analyseFace` (single face, confidence) stored as `Quality`; low-quality images excluded from shortlists | Face identification | C6 | S | 3 | CAT §5.2 V |
| 72 | Coverage stamp on every result — "N of M gallery images searched" | Face identification | infra | S | 3 | MP §0 (checkable) |
| 73 | Zia quota meter: the pooled 100 Zia calls / month free tier, with the cost of a search shown before it runs | Face identification | infra | S | 3 | CAT §5 V |
| 74 | `FEATURE_FACE` flag with an honest unavailable state — no fake candidate list when Zia is unreachable | Face identification | infra | S | 3 | MP §0 |
| 75 | Contract test: no face endpoint returns a verdict without a confidence; still images only, no stream input accepted | Face identification | infra | S | 3 | MP Ph6 |
| 76 | Quality gate via `app.zia().analyseFace(stream, { mode: 'moderate', … })`: reject no face, more than one face, low confidence, extreme pose (from landmarks) before any comparison call | Face identification | C6 | M | 5 | CAT §5.2 V · MP Ph6 |
| 77 | Structured pre-filter to a bounded shortlist — district, crime head, age band, gender, MO tags, time window — cap 25 by default and visible; never a gallery sweep | Face identification | C2 | M | 5 | MP Ph6 · CAT §5.1 V (1:1 only) |
| 78 | 1:1 `app.zia().compareFace(source, query)` across the shortlist, ranked by `confidence`; `matched` compared as the string the API returns | Face identification | C6 | M | 5 | CAT §5.1 V |
| 79 | Face model card: measured TPR / FPR at the floor on the synthetic gallery (same-person vs different-person pairs), a demographic-limitation statement, and "a face match is an investigative lead, not evidence of identity" | Face identification | C6 | M | 5 | MP Ph6 · DOM §7.4 V |
| 80 | Confirmed face match strengthens the `AliasQueue` decision — a face-corroborated alias carries the comparison confidence on its chip | Face identification | C2 | M | 5 | MP Ph6 · CAP §C2 V |
| 81 | `FaceSearchLog`: who searched, image key, filters, candidates returned, decisions, when — immutable and queryable, shown on screen so the officer knows it is logged | Face identification | infra | M | 4 | MP Ph6 · DOM §8.5 V |
| 82 | `FaceGallery` Data Store table (`PersonKey`, `StratusKey`, `SourceCaseID`, `Quality`, `AddedAt`) with images in Stratus served by `generatePreSignedUrl(key, 'GET', { expiryIn })` | Face identification | infra | M | 4 | MP Ph6 · CAT §4.4 V |
| 83 | Age-band estimate from `analyseFace` (Zia's 0–2 … 70+ brackets) used only to pre-narrow the shortlist and labelled as an estimate with its confidence | Face identification | C6 | S | 2 | CAT §5.2 V · CAT §18.9 I |
| 84 | Result rows link to the candidate's FIRs (`SourceCaseID`) and Offender-360 | Face identification | infra | S | 2 | MP Ph6 |
| 85 | Batch alias verification over the N weakest queue pairs that both have gallery images, with the call cost shown first | Face identification | C2 | M | 3 | CAT §5 V (quota) |
| 86 | Face-search record PDF via SmartBrowz for the case file — filters, floor, candidates, decisions, audit banner | Face identification | C1 | M | 3 | CAT §7 V |
| 87 | Synthetic gallery: one generated face per `OffenderProfile`, produced offline (no runtime service), with the generator, licence and "generated faces only" statement recorded in `DECISIONS.md` — the source of generated faces is still undecided | Face identification | infra | L | 4 | MP Ph6 · MP §0 · I |

## 3. Action loop + audit (30)

| # | Feature | Workstream | Capability (C1-C6 or infra) | Effort (S/M/L) | Value (1-5) | Source (doc §) |
|---|---|---|---|---|---|---|
| 88 | `ActionLog` Data Store table: `ActionID`, `SubjectType` (alert / case / alias / face / watch), `SubjectID`, `OfficerID`, `Decision`, `Rationale`, `LegalBasis`, `CreatedAt`, `OutcomeStatus`, `OutcomeAt` | Action loop | infra | S | 5 | MP Ph7 |
| 89 | Action controls on every alert card: acknowledge / assign / dismiss (reason required) / escalate | Action loop | infra | S | 5 | MP Ph7 |
| 90 | `AliasQueue` confirm / reject persisted server-side — replaces the client-only worklist `CAPABILITIES.md` admits to | Action loop | infra | S | 5 | CAP §C2 V |
| 91 | Alert acknowledgement records rank, unit and a free-text reason (extends `POST /alerts/:id/ack`) | Action loop | infra | S | 4 | DOM §8.3 V |
| 92 | Outcome feedback on alerts (confirmed rise / false alarm / resolved) with a "labels available: N — what a retrain would need" note; no online-learning claim | Action loop | C6 | S | 4 | MP Ph7 |
| 93 | Action controls on emerging-risk cards and crew rows (watch / dismiss with reason) | Action loop | infra | S | 3 | MP Ph7 |
| 94 | Dismissal-reason taxonomy and a reason-distribution chart | Action loop | C3 | S | 3 | MP Ph7 I |
| 95 | Watch review clock: person-level entries expire unless re-approved, mirroring the manual's own clocks (Part C one year; history sheets reviewed each December) | Action loop | infra | S | 3 | DOM §6.5 V |
| 96 | Assignment push to the Beat PWA — `pushNotification().web().sendNotification(message, recipients)`, recipients by email, ≤ 50 per call | Action loop | infra | S | 3 | CAT §4.12 V |
| 97 | Escalation to the District tier: escalated items appear in the district "needs decision" queue and carry their resolution back | Action loop | infra | S | 3 | MP Ph4 · MP Ph7 |
| 98 | Server-side SLA compliance board from `ActionLog` (time-to-ack by severity, breaches) — the current SLA badges are `localStorage`-timed | Action loop | C3 | S | 3 | CAP §C3 V · Code: FEATURES.md 246–248 V |
| 99 | Action history on Offender-360 and inside each alert sheet — every decision on this subject | Action loop | infra | S | 3 | MP Ph7 |
| 100 | "Decisions this week" tile on the Station and District homes | Action loop | C1 | S | 3 | MP Ph7 |
| 101 | Answer record export (question, ZCQL, result hash, time, engine) an officer can attach to a file | Action loop | infra | S | 3 | COMP §8.10 V |
| 102 | Pre-registered evaluation plan section in the brief — the success criterion and the sunset date stated before any pilot | Action loop | infra | S | 3 | DOM §8.10 V (CAS stopped for lack of proof) |
| 103 | Closing posture on `/about` and in the brief — "DAPPA never tells an officer what to do. It tells them where to look, records what they decided, and learns from what happened" — with the live action-loop numbers beside it | Action loop | infra | S | 3 | MP Ph7 |
| 104 | `POST /actions` + `GET /actions` write / read path, officer-gated, validated enums, contract-tested | Action loop | infra | M | 5 | MP Ph7 |
| 105 | "What happened to past alerts" panel: acted / dismissed / escalated counts, outcome mix, time-to-action distribution | Action loop | C3 | M | 5 | MP Ph7 |
| 106 | Alert precision from feedback: share confirmed vs dismissed-as-noise per severity and per z threshold — the evaluation predictive-policing vendors never published | Action loop | C6 | M | 5 | DOM §8.10 I · COMP §6 V (Geolitica < 1 %) |
| 107 | Threshold suggestion from history ("z ≥ 2.6 would have kept 90 % of confirmed alerts and dropped 40 % of dismissed ones") — presented as analysis, not as learning | Action loop | C6 | M | 4 | MP Ph7 |
| 108 | Watchlist persisted in a `Watchlist` Data Store table; `POST /offenders/watch` becomes a real write (today `lib/watchlist.js` saves to Cache and the UI to `localStorage`) | Action loop | infra | M | 4 | MP Ph7 · CAP honesty flags V |
| 109 | Hearing dossier export for a watched person: the FIR and chargesheet references behind every claim, for the SDPO hearing the High Court now requires | Action loop | C1 | M | 4 | DOM §8.11 I · DOM §1.5 V (KHC 2026) |
| 110 | Assign an alert or case to an officer (`Employee`) so it appears in the Beat "my assignments" card | Action loop | infra | M | 4 | MP Ph7 · Code: ER_TEXT_EXTRACT (Employee) V |
| 111 | Copilot provenance: SHA-256 of the executed ZCQL plus a result digest in the answer envelope, persisted to an `AnswerLedger` table, and `GET /copilot/verify/:id` re-runs the query and compares | Action loop | C6 | M | 4 | COMP §2 V (KAVAL) · COMP §10 V |
| 112 | Retention job in `dappa_nightly` purging person-level view logs on a stated schedule | Action loop | infra | S | 2 | DOM §8.5 V (PUCL "destroyed when no longer needed") |
| 113 | Unacknowledged alerts expire past their SLA into an "expired" state counted by the past-alerts panel | Action loop | infra | S | 2 | MP Ph7 |
| 114 | Outcome-label CSV export for offline retraining | Action loop | infra | S | 2 | MP Ph7 |
| 115 | Watch approval workflow: a person-level watch is pending until an SP / SDPO-rank user approves it (KPM 1059 "prior orders") | Action loop | infra | M | 3 | DOM §1.5 V |
| 116 | SHO daily digest on a Job Scheduling cron via Catalyst Mail — sender must be on a domain with SPF / DKIM (a Gmail `MAIL_FROM` cannot be verified) | Action loop | infra | M | 3 | CAT §4.11 V · CAT §10 V |
| 117 | Person-view audit: who opened which Offender-360 or face page, with a reason prompt | Action loop | infra | M | 3 | DOM §8.5 V |

## 4. Voice + accessibility (29)

| # | Feature | Workstream | Capability (C1-C6 or infra) | Effort (S/M/L) | Value (1-5) | Source (doc §) |
|---|---|---|---|---|---|---|
| 118 | Read-aloud button on every alert card, brief, case summary and tier home, reading the plain-language summary — kn-IN when the device has a Kannada voice, en-IN otherwise, hidden when neither (wires the untracked `ReadAloudButton.jsx` / `voice.js`) | Voice + accessibility | infra | S | 4 | MP Ph5 · Code: client/src/lib/voice.js V · DECISIONS D-014 V |
| 119 | Copilot speech-to-text follows the UI language (`kn-IN` recognition) with a silent fall back to the text box | Voice + accessibility | infra | S | 4 | MP Ph5 · Code: routes/copilot/useSpeechInput.js V |
| 120 | Contrast fixes: eyebrow captions 4.14 / 3.54, dark red pill 4.07, light amber pill 4.32 → ≥ 4.5:1; `--t-grid` borders 1.2–1.3 → ≥ 3:1 where a border is the only control boundary | Voice + accessibility | infra | S | 4 | UX §1 MEASURED V · UX §2.1 V |
| 121 | ECharts `aria.enabled` generated descriptions and `aria.decal` pattern fills on every chart (none used today) | Voice + accessibility | infra | S | 4 | UX §10 V · UX §1 V |
| 122 | Spoken open-alerts digest ("read my alerts") on the Station tier | Voice + accessibility | infra | S | 3 | MP Ph5 |
| 123 | Tooltip rewrite: Esc-dismissible, hoverable, persistent (WCAG 1.4.13; `.tt` is `pointer-events: none` today) | Voice + accessibility | infra | S | 3 | UX §2.1 V |
| 124 | Persistent font-size control (A− / A+) | Voice + accessibility | infra | S | 3 | MP Ph5 |
| 125 | Explicit pause button on the intelligence ticker for touch users (WCAG 2.2.2) | Voice + accessibility | infra | S | 3 | UX §2.2 V |
| 126 | `scroll-padding` on `#main-scroll` so focus is never hidden under the sticky bar, offline banner or toasts (WCAG 2.4.11) | Voice + accessibility | infra | S | 3 | UX §2.2 V |
| 127 | Icon-only button audit: `aria-label` on every unlabeled icon button (17 of 603 buttons labelled today) | Voice + accessibility | infra | S | 3 | UX §1 MEASURED V |
| 128 | Print and achromatopsia emulation screenshots in `docs/screenshots/` — the checkable mono-print artefact | Voice + accessibility | infra | S | 3 | UX §9 V · UX §10 V |
| 129 | Help entry in the same slot on every page (WCAG 3.2.6 and GIGW Quality Row 14) | Voice + accessibility | infra | S | 3 | UX §2.3 V · UX §3 V |
| 130 | Kannada font test screenshots (Windows / Android / iOS) for GIGW Quality Row 13 | Voice + accessibility | infra | S | 3 | UX §3 V · UX §7 V |
| 131 | Screen-reader announcements for filter result counts and the "N alerts" badge (WCAG 4.1.3) | Voice + accessibility | infra | S | 3 | UX §2.4 V |
| 132 | Accessibility statement page with measured results — axe score, the contrast table, known gaps | Voice + accessibility | infra | S | 3 | UX §12 V |
| 133 | `DECISIONS.md` D-014 extended with the hide-the-button rule for a missing Kannada voice and the reclassification of the `zia-language` row (no Catalyst translation or speech endpoint exists) | Voice + accessibility | infra | S | 3 | CAT §5 V · Code: docs/DECISIONS.md D-014 V |
| 134 | Keyboard-operable map: `keyboard: true` and a descriptive `alt` on every marker (city / station markers are `keyboard: false` today), plus declared table equivalents for the map and the Cytoscape canvas (WCAG 2.1.1) | Voice + accessibility | infra | M | 4 | UX §2.2 V (Leaflet reference) |
| 135 | Text-equivalent data table behind every `ChartPanel` (toggle), also rendered under each chart in print — the copilot already has one, the shared panel does not | Voice + accessibility | infra | M | 4 | MP Ph5 · UX §2.1 (1.1.1) V · Code: FEATURES.md 588 V |
| 136 | axe-core in CI with `target-size` enabled, score published in the README | Voice + accessibility | infra | M | 4 | MP Ph5 · UX §2.5 V |
| 137 | Mono-safe print stylesheets for `/network`, `/predict`, `/alerts`, `/map` (only cases, trends, Offender-360, copilot and the brief have one) | Voice + accessibility | infra | M | 4 | UX §9 V · Code: client/src/routes/* (print css files) V |
| 138 | `@media (forced-colors: active)` borders on cards and canvas fallbacks for Windows contrast themes | Voice + accessibility | infra | S | 2 | UX §9 V |
| 139 | `lang="en"` on untranslated English sentences in Kannada mode (WCAG 3.1.2) | Voice + accessibility | infra | S | 2 | UX §2.3 V |
| 140 | Optional bundled Noto Sans Kannada (one or two woff2 weights, loaded only under `html[lang='kn']`) for devices that strip Indic fonts | Voice + accessibility | infra | S | 2 | UX §7 V |
| 141 | Speech-to-text transcript editable before send, with a confidence hint | Voice + accessibility | infra | S | 2 | MP Ph5 I |
| 142 | Read-aloud rate / voice picker, persisted | Voice + accessibility | infra | S | 2 | MP Ph5 I |
| 143 | 320 px reflow pass for KPI tiles, filter bar, copilot and alert cards (WCAG 1.4.10; map, network and tables are exempt) | Voice + accessibility | infra | M | 3 | UX §2.1 V |
| 144 | Target-size audit: pills, sort headers, calendar cells, legend swatches ≥ 24 px or spaced (2.5.8); primary mobile actions 44–48 px | Voice + accessibility | infra | M | 3 | UX §8 V · UX §2.2 V |
| 145 | Dragging alternatives: typed inputs for every slider, pan buttons for map and network (WCAG 2.5.7) | Voice + accessibility | infra | M | 3 | UX §2.2 V |
| 146 | "Listen to this brief" whole-page read-aloud with paragraph highlighting | Voice + accessibility | infra | M | 2 | MP Ph5 I |

## 5. New Catalyst surfaces (31)

| # | Feature | Workstream | Capability (C1-C6 or infra) | Effort (S/M/L) | Value (1-5) | Source (doc §) |
|---|---|---|---|---|---|---|
| 147 | Web push registration in the client — `catalyst.notification.enableNotification()` plus `messageHandler` from the console snippet — so a browser can actually receive what `lib/push.js` sends (no registration call exists in `client/src` today) | New Catalyst surfaces | infra | S | 4 | CAT §4.12 V · CAT §18.5 V |
| 148 | Reclassify `circuits` and `zia-automl` as `unavailable-in-dc` (both blocked for IN-DC users) and `zia-language` as having no Catalyst endpoint; drop the Circuit console step from the Phase-3 list | New Catalyst surfaces | infra | S | 4 | CAT §2 V · CAT §5 V · CAT §17 V |
| 149 | Push-delivered critical alerts to subscribed officers by email id | New Catalyst surfaces | infra | S | 3 | CAT §4.12 V |
| 150 | Nightly-run observability card on `/about` — last run, retries, duration from Job Scheduling plus `RefreshMeta` | New Catalyst surfaces | infra | S | 3 | CAT §10 V |
| 151 | Object tags from scene photos feed the MO vocabulary (weapon / vehicle tags joining the mined tag set) | New Catalyst surfaces | C5 | S | 3 | CAT §18.3 I · CAP §C5 V |
| 152 | Data Store Search: mark the Var Char columns of `CaseMaster` / `OffenderProfile` searchable in the console (Text columns cannot be indexed) so `search().executeSearchQuery` serves `/search/cases`, plus the missing client consumer | New Catalyst surfaces | infra | S | 3 | CAT §4.2 V · BASE §3 V |
| 153 | Catalyst Mail sender on a domain the team controls (SPF / DKIM records issued by Catalyst) — the blocker behind every digest row | New Catalyst surfaces | infra | S | 3 | CAT §4.11 V |
| 154 | Stratus pre-signed upload URLs (`generatePreSignedUrl(key, 'PUT', …)`) for ingest CSVs and gallery images | New Catalyst surfaces | infra | S | 3 | CAT §4.4 V |
| 155 | OLAP database enabled once in the console; heavy `GROUP BY` aggregates routed through `app.zcql().executeOLAPQuery(sql)` with `executeZCQLQuery` as the fallback (method verified in the 3.4.0 typings; its docs page is 404 — exercise once in `catalyst serve` before claiming it) | New Catalyst surfaces | infra | M | 4 | CAT §4.1 V · CAT §18.1 V · CAT §19 V |
| 156 | Job Scheduling `app.jobScheduling().JOB.submitJob({ target_type: 'Function', … job_config: { number_of_retries, retry_interval } })` for the nightly refresh with retries — replaces the Circuits path this DC cannot run; needs a console job pool | New Catalyst surfaces | infra | M | 4 | CAT §10 V · CAT §18.8 V |
| 157 | SmartBrowz `takeScreenshot(mapUrl, { page_options: { viewport }, output_options: { output_type: 'png' } })` of the hotspot map embedded in the Weekly Brief PDF | New Catalyst surfaces | C1 | M | 4 | CAT §7 V · CAT §18.6 V |
| 158 | Zia OCR client surface: upload a scanned complaint or FIR (Kannada is a supported OCR language) → `extractOpticalCharacters(stream, { language, modelType: 'OCR' })` → the narrative NER / keyword panel; `/zia/ocr` exists with no client consumer | New Catalyst surfaces | C6 | M | 4 | CAT §5.5 V · CAP honesty flags V |
| 159 | QuickML Gen-AI RAG endpoint in "Document Search" mode returning the FIR chunks that support a copilot answer (KB from .txt / .pdf ≤ 500 KB per file) | New Catalyst surfaces | C6 | M | 4 | CAT §6.6 V |
| 160 | Catalyst Authentication custom roles per tier read through `role_details.role_name`, with `registerUser` invites (development limit 25 users) | New Catalyst surfaces | infra | M | 4 | CAT §4.7 V |
| 161 | Zia Image Moderation on every upload — `moderateImage(stream, { mode: 'advanced' })` weapons / violence probabilities as an intake guard | New Catalyst surfaces | C6 | S | 2 | CAT §5.6 V · CAT §18.7 V |
| 162 | Zia Barcode / QR `scanBarcode(stream, { format: 'ALL' })` on property-seizure tags → `PropertySeized` lookup — worth it only if a QR evidence chain exists in the UI, which it does not today | New Catalyst surfaces | C1 | S | 2 | CAT §5.4 V · CAT §18.10 V |
| 163 | APM enabled and a Logs summary card (function latency, error rate) on `/about` | New Catalyst surfaces | infra | S | 2 | CAT §13 V |
| 164 | Application Alerts: email on nightly cron failure (5 alerts in development, 20 in production) | New Catalyst surfaces | infra | S | 2 | CAT §13 V |
| 165 | Cache segment for per-unit tier cards (`segment.put`, expiry in hours) | New Catalyst surfaces | infra | S | 2 | CAT §4.6 V |
| 166 | Stratus object versioning on ingest files, with the malware-scan flag surfaced | New Catalyst surfaces | infra | S | 2 | CAT §4.4 V |
| 167 | LLM answer composer on QuickML LLM Serving (GLM 4.7 Flash; the Qwen models are deprecated) with a numeric firewall — every number in the answer must come from the executed ZCQL, and the deterministic parser stays as the fallback | New Catalyst surfaces | C6 | L | 5 | CAT §6.5 V · COMP §2 V (KAVAL's firewall) |
| 168 | SmartBrowz `generateFromTemplate(templateId, template_data)` for a console-designed Monthly Crime Review template (placeholder syntax is undocumented — a gap) | New Catalyst surfaces | C1 | M | 3 | CAT §7 V · CAT §19 V |
| 169 | Zia Object Recognition on synthetic scene photos: `detectObject(stream)` → tagged bounding boxes (knife, car, cellphone, baseball bat …) on the case detail; needs generated scene images first | New Catalyst surfaces | C6 | M | 3 | CAT §5.3 V · CAT §18.3 V · I |
| 170 | QuickML AutoML pipeline (available in IN) as a challenger outcome model, its AUC reported beside the embedded logistic model | New Catalyst surfaces | C6 | M | 3 | CAT §6.3 V · CAT §2 V |
| 171 | Embedded sign-in (`catalyst.auth.signIn("<element id>")` via the Web SDK) for officer login; `PUBLIC_DEMO` stays read-only | New Catalyst surfaces | infra | M | 3 | CAT §4.7 V |
| 172 | Pipelines: `catalyst-pipelines.yaml` plus the GitHub link so CI/CD flips from console-pending (push / merge triggers only) | New Catalyst surfaces | infra | M | 3 | CAT §12 V |
| 173 | Agentic RAG / tool calling binding `/trends/*` and `/geo/*` as tools for multi-step copilot questions | New Catalyst surfaces | C6 | L | 4 | CAT §6.5 V · CAT §6.6 V |
| 174 | QuickML "Zia Language detection" pipeline node routing Kannada vs English copilot input — the only language-detection capability Catalyst offers | New Catalyst surfaces | C6 | M | 2 | CAT §6.4 V |
| 175 | Signals custom publisher + webhook: an external synthetic feed posts FIR events into the event function (REST with an API key; no SDK publish method) | New Catalyst surfaces | infra | M | 2 | CAT §9 V |
| 176 | QuickML Knowledge Base over the public SCRB Monthly Crime Review PDFs so the copilot can cite the state's published figures — labelled as real public statistics, kept apart from the synthetic app data | New Catalyst surfaces | C6 | L | 3 | CAT §6.6 V · DOM §3.1 V · I |
| 177 | Corpus-level Zia Text Analytics (nightly batch NER / keywords → keyword trends per district) — 1,500 characters per request and 100 pooled Zia calls a month make this a paid feature | New Catalyst surfaces | C4 | L | 2 | CAT §5.7 V · CAT §5 V |

## 6. Analytical depth on C5 / C2 (31)

| # | Feature | Workstream | Capability (C1-C6 or infra) | Effort (S/M/L) | Value (1-5) | Source (doc §) |
|---|---|---|---|---|---|---|
| 178 | Forecast headline numbers surfaced beside the `AccuracyBoard` — median MAPE 47.78, p90 83.7 over 228 series, 85 ETS / 143 seasonal-naive (today they live only in `docs/benchmarks/forecast_metrics.json`) | Analytical depth | C6 | S | 4 | COMP §8.6 V · Code: docs/benchmarks/forecast_metrics.json V |
| 179 | Identity-resolution validation card: precision 0.0321 / recall 0.5712 / F1 0.0608 at threshold 0.92 against `_ground_truth_offenders.csv`, with the scoring formula shown | Analytical depth | C2 | S | 4 | COMP §8.5 V · Code: docs/benchmarks/identity_metrics.json V |
| 180 | Per-alias "why linked" breakdown — the token-sort ratio, age-closeness and district-overlap components behind each alias confidence | Analytical depth | C2 | S | 4 | Code: identity_metrics.json `scoring` V · CAP §C2 V |
| 181 | Forecast band coverage check — the share of backtest actuals inside the 80 % band, which should sit near 80 % (the `HorizonPanel` reports width, not coverage) | Analytical depth | C6 | S | 4 | CAP §C6 V · I |
| 182 | Hotspot stability index — Jaccard overlap of the top-10 Gi\* cells month to month | Analytical depth | C4 | S | 3 | COMP §8.9 I |
| 183 | Two-period hot-spot comparison — cell-level change of Gi\* class between two windows | Analytical depth | C4 | S | 3 | COMP §6 V (Esri "Hot Spot Analysis Comparison") |
| 184 | Crew reach map — a crew's cases plotted with a spread radius and its hotspot overlap | Analytical depth | C5 | S | 3 | CAP §C5 V (crews exist) · I |
| 185 | Socio-economic residual choropleth on `/map` (how far each district sits above or below the crime level its profile predicts) | Analytical depth | C3 | S | 3 | CAP §C3 V (residual ranking exists on `/`) |
| 186 | Crew ↔ hotspot overlap board — which crews operate inside which clusters | Analytical depth | C5 | S | 3 | CAP §C5 V · CAP §C2 V (LocationPanels) |
| 187 | Injected-pattern recovery card: the generator plants 6 spatial-hour hotspots, 4 final-8-week anomalies, ~200 repeat offenders and 12 co-accused communities — show what `analytics.py` recovered of each | Analytical depth | C6 | M | 5 | COMP §2 V (kkeerthanaaaa) · COMP §10 V · Code: pipeline/generate.py `injected_cases`, `plant_offenders` V |
| 188 | Repeat / near-repeat classification — originator / repeat / near-repeat by distance × time bands over `CaseMaster` lat/lng × date | Analytical depth | C4 | M | 5 | COMP §6 V (Esri) · COMP §8.8 V |
| 189 | Emerging-hotspot trajectory classes over the monthly Gi\* series — new / persistent / intensifying / diminishing / sporadic / oscillating | Analytical depth | C4 | M | 5 | COMP §6 V · COMP §8.9 V |
| 190 | Identity resolution v2 — phonetic (the `phonetic()` helper exists) + age + district blocking with a threshold sweep; the precision / recall curve published alongside the current point | Analytical depth | C2 | M | 5 | Code: pipeline/analytics.py V · COMP §10 V |
| 191 | Station-risk calibration plot — predicted risk decile vs realised next-30-day counts on the backtest window ("does 70 % mean 70 out of 100?") | Analytical depth | C6 | M | 5 | UX §11.2 #8 V · Code: no calibration view under routes/predict I |
| 192 | Near-repeat prediction zones as a map layer — the spatial and temporal range of influence around originators | Analytical depth | C4 | M | 4 | COMP §6 V (Esri "Calculate Prediction Zones") |
| 193 | Travelling-offender corridors — per-person district-hop sequences aggregated into corridor arcs on the map | Analytical depth | C2 | M | 4 | CAP §C2 V (per-person hops exist) |
| 194 | Recidivism curve — time-to-next-case survival by MO family and case-count band | Analytical depth | C5 | M | 4 | CAP §C5 V (tempo exists) · I |
| 195 | Escalation ladder — gravity transition matrix per offender and corpus-wide (petty → heinous) | Analytical depth | C5 | M | 4 | CAP §C5 V (escalation delta exists; no transition matrix I) |
| 196 | Escalation watchlist as an alert type — everyone whose behaviour-change flag fired this quarter, corpus-wide (`BehaviourChangeCard` is per person) | Analytical depth | C5 | M | 4 | Code: routes/offenders/BehaviourChangeCard.jsx V · CAP §C5 V |
| 197 | Festival uplift estimator — % uplift per head with a confidence interval across years (the shading exists; the estimate does not) | Analytical depth | C4 | M | 4 | CAP §C4 V · DOM §1.13 V |
| 198 | Specialisation index (entropy of case mix) as a sortable registry column | Analytical depth | C5 | S | 2 | CAP §C5 V (case-mix card exists) |
| 199 | Full-moon annotation on crime charts (astronomical computation, no service) | Analytical depth | C4 | S | 2 | DOM §1.13 V |
| 200 | Knox space-time interaction test — are incidents closer in space *and* time than chance | Analytical depth | C4 | M | 3 | I (standard method; no source doc) |
| 201 | Victim ⇄ accused overlap — the same person on both sides of different FIRs, via the identity matcher | Analytical depth | C2 | M | 3 | CAP §C2 V · I |
| 202 | Corpus MO transition matrix — which tag tends to follow which across careers | Analytical depth | C5 | M | 3 | CAP §C5 V (per-person evolution exists) |
| 203 | Dormant-crew reactivation detector — a crew inactive ≥ 12 months that gains a new shared case | Analytical depth | C5 | M | 3 | CAP §C5 V · I |
| 204 | Co-offending age structure per crew (older core, younger periphery — age only, never caste or religion) | Analytical depth | C5 | M | 3 | CAP §C2 V (victim demographics use age/gender only) · I |
| 205 | Crew MO signature evolution by year | Analytical depth | C5 | M | 3 | CAP §C5 V |
| 206 | Forecast drift monitor — monthly realised MAPE of the deployed model against its backtest | Analytical depth | C6 | M | 3 | CAP §C6 V (drift gap) |
| 207 | Cross-station series — gap-chaining across neighbouring stations within N km (today one station only) | Analytical depth | C4 | M | 3 | COMP §8.8 V |
| 208 | Lead–lag cross-correlation between crime heads per district (does theft lead robbery by a month?) | Analytical depth | C6 | M | 3 | CAP §C6 V (correlation matrix exists) · I |

## 7. Data ingest CSV → ER (25)

| # | Feature | Workstream | Capability (C1-C6 or infra) | Effort (S/M/L) | Value (1-5) | Source (doc §) |
|---|---|---|---|---|---|---|
| 209 | Row-level rejection report — reason per rejected row, downloadable CSV | Data ingest | infra | S | 5 | MP Ph8 |
| 210 | CrimeNo structure validator — 1 · 4 · 4 · 4 · 5 digits, district / station / year consistent with the row | Data ingest | infra | S | 4 | README "Official ER schema" V |
| 211 | Mapped preview (first 50 rows) with per-cell validation marks | Data ingest | infra | S | 4 | MP Ph8 |
| 212 | Dry-run (validate only) mode | Data ingest | infra | S | 4 | MP Ph8 |
| 213 | Caste / religion columns accepted for schema fidelity, flagged never-used, optional drop; phone / address marked PII and excluded from exports | Data ingest | infra | S | 4 | README data ethics V · MP §0 |
| 214 | "What changed" after a load — KPIs before / after and the alerts the batch raised | Data ingest | C3 | S | 4 | MP Ph8 I |
| 215 | Ingest audit into `ActionLog` — who, table, rows accepted / rejected, batch id | Data ingest | infra | S | 4 | MP Ph7 |
| 216 | Contract tests for the ingest endpoints including the privacy guard | Data ingest | infra | S | 4 | MP §0 |
| 217 | Official column-template CSV download per table | Data ingest | infra | S | 3 | MP Ph8 |
| 218 | Free-tier budget check before a load (Data Store Insert 5,000 / month) with the estimated cost | Data ingest | infra | S | 3 | CAT §4.1 V |
| 219 | Load progress and `/healthz` completeness updated per table | Data ingest | infra | S | 3 | CAP data foundation V |
| 220 | Point-in-polygon check — lat / lng inside the row's district polygon (`data/geo`) | Data ingest | infra | S | 3 | Code: data/geo V |
| 221 | Encoding and locale handling — UTF-8 BOM, Kannada text, dd-mm-yyyy dates, Indian digit grouping | Data ingest | infra | S | 3 | UX §11.1 rule 5 V |
| 222 | Ingest demo dataset — a 200-row official-format CSV in the repo for the video's twenty seconds | Data ingest | infra | S | 3 | MP Ph8 |
| 223 | `/ingest` route: CSV upload (Stratus pre-signed PUT or function multipart) with a picker over the 26 ER tables | Data ingest | infra | M | 5 | MP Ph8 |
| 224 | Schema validation — required columns, Data Store types and limits (Var Char 255, Text 10,000, Date / DateTime, Int / Double / Boolean), FK existence | Data ingest | infra | M | 5 | CAT §4.1 V |
| 225 | Column mapping UI — auto-map by header similarity, manual override, saved mapping templates | Data ingest | infra | M | 4 | MP Ph8 |
| 226 | Duplicate detection against the Data Store (CrimeNo / CaseMasterID) | Data ingest | infra | M | 4 | MP Ph8 |
| 227 | Chunked bulk write (Data Store bulk write) with a resume token | Data ingest | infra | M | 4 | CAT §4.1 V |
| 228 | Post-load recompute — AggMonthly upsert and z-check for the batch (the event function does this per insert; a batch path is new) | Data ingest | infra | M | 4 | Code: FEATURES.md 779 V |
| 229 | Upload data-quality profile — null rates, date range, unit coverage, coordinate sanity | Data ingest | infra | M | 4 | MP Ph8 |
| 230 | Reference-data ingest (District / Unit / CrimeHead lookups) with FK ordering enforced | Data ingest | infra | M | 3 | MP Ph8 |
| 231 | Batch rollback by ingest batch id | Data ingest | infra | M | 3 | MP Ph8 |
| 232 | Mapping presets for CCTNS IIF-1-style FIR exports (IF1 → CaseMaster …) — the form list is verified, the export column names are not | Data ingest | infra | L | 3 | DOM §2.1 V · I |
| 233 | Stratus-drop ingest — object-created Signal → validate → queue for review | Data ingest | infra | M | 2 | CAT §4.4 V (Signals triggers) |

## 8. UI / UX system (25)

| # | Feature | Workstream | Capability (C1-C6 or infra) | Effort (S/M/L) | Value (1-5) | Source (doc §) |
|---|---|---|---|---|---|---|
| 234 | README evidence: production URL, the eleven `docs/screenshots` linked, the video link and the team table (eleven of twelve 2026 peers publish a live URL; DAPPA publishes none) | UI/UX system | infra | S | 5 | COMP §8.1 V · COMP §8.2 V |
| 235 | Correct `CAPABILITIES.md` §C2 — victim and location nodes exist (`CytoGraph.jsx`, `netlinks.js`) though the text denies them | UI/UX system | infra | S | 4 | COMP §8.7 V |
| 236 | Drop the "808 features" lead from the README; lead with Catalyst purity, the official ER schema and the published negative results — the three things no peer has | UI/UX system | infra | S | 4 | COMP §8.4 V · COMP §9 V |
| 237 | Lighthouse `budget.json` in CI — script ≤ 650 KB, total ≤ 1.3 MB, third-party requests 0 — failing on regression | UI/UX system | infra | S | 4 | UX §5 V |
| 238 | "Saved copy from <time> · offline" status pill (`role="status"`) on every cached view | UI/UX system | infra | S | 4 | UX §6 V |
| 239 | Reorder `/predict`: accuracy board and the calibrated logistic model first; case-status AUC 0.500 presented as a labelled negative result | UI/UX system | infra | S | 3 | MP App. B V · CAP §C6 V |
| 240 | One categorical palette in one order everywhere (Okabe–Ito: blue, vermilion, bluish green, orange, reddish purple, sky blue) | UI/UX system | infra | S | 3 | UX §10 V |
| 241 | Debounced filter inputs and incremental `setOption` so INP stays ≤ 200 ms under a 4× CPU throttle | UI/UX system | infra | S | 3 | UX §5 V · UX §4 V |
| 242 | Fixed-height chart and map containers (CLS ≤ 0.1) | UI/UX system | infra | S | 3 | UX §4 V |
| 243 | PNG maskable icons (192 / 512) and an update-prompt toast (`registerType: 'prompt'`, never a silent reload mid-demo) | UI/UX system | infra | S | 3 | UX §6 V |
| 244 | Fresh screenshots — all tiers × both themes × English / Kannada — and regenerated deck diagrams | UI/UX system | infra | S | 3 | MP Ph9 |
| 245 | Chunk-graph guard in CI — no shared component may pull cytoscape or leaflet into the index chunk | UI/UX system | infra | S | 3 | UX §5 V |
| 246 | Thumb-zone placement on mobile — filter bar, language toggle and Ack reachable from the bottom third; map layer toggles not only top-right | UI/UX system | infra | S | 3 | UX §8 V |
| 247 | One reconciled scorecard plus `scripts/check_capabilities.mjs` in CI — scorecard, per-capability sections, overlap matrix and shortfall must agree (three incompatible sets exist today) | UI/UX system | infra | M | 5 | BASE §5 V · COMP §8.3 V |
| 248 | Service worker via `vite-plugin-pwa` (`generateSW`): precached shell with `navigateFallback`, `NetworkFirst` with `networkTimeoutSeconds: 4` on intel GETs, `StaleWhileRevalidate` on lookups and GeoJSON, `NetworkOnly` on POST / AI — "works offline" claimed only for shell + reference data + last-fetched intel | UI/UX system | infra | M | 5 | UX §6 V |
| 249 | `FEATURES.md` capability tags and the ~230 uncatalogued features catalogued; entries 665 (retired) and 704 (removed polling) fixed | UI/UX system | infra | M | 4 | BASE §5 V |
| 250 | Split the locales — lazy-load the active language namespaces (en 330 KB and kn 600 KB of source both ride in the index chunk) | UI/UX system | infra | M | 4 | UX §1 MEASURED V · UX §5 V |
| 251 | Defer ECharts until a chart is on screen and import by component (`echarts/core`) — 352 KB gzip off the first paint | UI/UX system | infra | M | 4 | UX §5 V |
| 252 | Lighthouse mobile ≥ 90 on the production URL — three simulated runs, median recorded in `docs/benchmarks/` (the Submission Kit's "≥ 85" has no artefact) | UI/UX system | infra | M | 4 | MP Ph9 · UX §5 V · BASE §5 V |
| 253 | Drop the non-Latin Inter subsets and `.woff` fallbacks from the build (56 files today; 4 Latin woff2 needed) | UI/UX system | infra | S | 2 | UX §1 MEASURED V · UX §5 V |
| 254 | Kannada 200 % zoom and text-spacing check on `whitespace-nowrap` pills | UI/UX system | infra | S | 2 | UX §2.1 V |
| 255 | Icon-set unification (one library, one stroke weight) | UI/UX system | infra | S | 2 | MP Ph9 I |
| 256 | Design-token audit → one token set for colour, spacing, radius, shadow and motion, published on a `/styleguide` route | UI/UX system | infra | M | 3 | MP Ph9 |
| 257 | Light-theme parity audit on map, charts and print — pills and badges pass contrast in both themes | UI/UX system | infra | M | 3 | MP Ph9 · UX §1 V |
| 258 | Loading / empty / error audit on every panel — an empty state says what would appear and why, an error says what failed and what still works | UI/UX system | infra | M | 3 | MP Ph9 |

---

## Descoped by the research (not in the table, with the reason)

- **Circuits console step (Phase 3 item 1) and Zia AutoML.** Both are "not available to Catalyst users accessing from the … IN … data centers" ([Circuits intro](https://docs.catalyst.zoho.com/en/serverless/help/circuits/introduction/), [AutoML SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/automl/)) — CAT §2 V. Row 148 reclassifies them; row 156 replaces the orchestration story with Job Scheduling.
- **Zia translate / speech (`zia-language` row, MP Ph5 "Zia translate handles any string the bundle misses").** No translation, speech or language-detection method exists in the Zia docs index or in `zcatalyst-sdk-node@3.4.0` — CAT §5 V. The pinned glossary fallback stays; row 133 records it.
- **Identity Scanner document processing (Aadhaar / PAN / cheque / passbook).** Available in IN, but demonstrating it would mean fabricating identity documents for a police demo — CAT §5.1 I.
- **ConvoKraft.** English-only; its actions need Integration Functions (not in IN) or Deluge / webhooks; it duplicates the copilot — CAT §8 V, §18 I. Stays the single honest roadmap item.
- **Live video, CCTV, real-time surveillance of any kind.** Outside the challenge, impossible on synthetic data, and the master prompt says to refuse — MP Ph6 item 7; COMP §6 V (Motorola, Staqu are the products that do this).
- **SmartBrowz Dataverse, Mobile Device Management, Slate, Domain Mappings.** US-only, IN-blocked, or platform surface with no analytic value — CAT §2 V, §11 V, §4.14 V.
- **The undocumented `queue` / `gql` SDK modules.** A judge cannot check them against any docs page — CAT §16 V.

## Corrections to the research the code contradicts

- COMP §8.13 says `/about` "renders a hardcoded constant" for the service list. `client/src/routes/About.jsx` and `routes/about/ServiceMatrix.jsx` say in their headers that they consume `GET /meta/services` and `GET /ml/models` (read today, not run). No backlog row was created for it; verify at runtime during Phase 10.
- `CAPABILITIES.md` §C2 says victim and location nodes do not exist; `routes/network/VictimPanels.jsx`, `LocationPanels.jsx`, `CytoGraph.jsx` and `lib/routes/netlinks.js` implement them (read today). Row 235 fixes the document.

## SDK and API names used above — where each was read

Every method name in this backlog is quoted from `docs/CATALYST_SERVICE_RESEARCH.md`, which quotes it from the page linked here; none is invented.

| Name | Page |
|---|---|
| `app.zia().compareFace(source, query)` → `{ confidence, matched }` | [Identity Scanner facial comparison](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/facial-comparison/) |
| `app.zia().analyseFace(stream, { mode, age, emotion, gender })` | [Face Analytics SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/face-analytics/) |
| `zia.detectObject(stream)` | [Object Recognition SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/object-recognition/) |
| `zia.scanBarcode(stream, { format })` | [Barcode Scanner SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/barcode-scanner/) |
| `zia.moderateImage(stream, { mode })` | [Image Moderation SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/image-moderation/) |
| `zia.extractOpticalCharacters(stream, { language, modelType })` | [OCR SDK](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/ocr/) |
| `app.zcql().executeOLAPQuery(sql)` | `zcatalyst-sdk-node@3.4.0` `zcql.d.ts` (installed) and the reference on [execute-zcql-query](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/zcql/execute-zcql-query/); the dedicated docs page is 404 |
| `app.search().executeSearchQuery({ search, search_table_columns })` | [Search data](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/search/search-data/) |
| `smartbrowz.takeScreenshot(source, options)` / `generateFromTemplate(templateId, data)` | [Generate PDF & screenshot](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/smartbrowz/generate-pdfnscreenshot/) |
| `app.jobScheduling().JOB.submitJob({...})` | [Create job](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/job-scheduling/jobs/create-job/) |
| `app.pushNotification().web().sendNotification(message, userList)` | [Send notifications](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/push-notifications/send-notifications/) |
| `catalyst.notification.enableNotification()` + `messageHandler` | [Web push](https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/web/) |
| `bucket.generatePreSignedUrl(key, method, { expiryIn })` | [Stratus download object](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/download-object/) (upload URLs listed on the [overview](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/overview/)) |
| `registerUser(signupConfig, userConfig)`; `role_details.role_name` | [Add new user](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/add-new-user/), [Get user details](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/get-user-details/) |
| `catalyst.auth.signIn("<element id>")` | [Web SDK overview](https://docs.catalyst.zoho.com/en/sdk/web/v4/overview/) |
| `app.quickML().predict(endpointKey, input)` | [Execute QuickML endpoints](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/quickml/execute-quickml-endpoints/) |
| `cache.segment().put(key, value, hours)` | [Insert data into cache](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/cache/insert-data-into-cache/) |
| `email().sendMail({...})` and the no-public-domain sender rule | [Send email](https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/mail/send-email/), [Mail domains](https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/domains/) |

---

## Summary — counts per workstream

| Workstream | Rows | Capability-bearing | infra | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Officer-tier UX + plain language | 57 | 41 | 16 | 14 | 1 | 8 | 12 | 1 | 5 |
| Face identification | 30 | 18 | 12 | 5 | 4 | 0 | 0 | 0 | 9 |
| Action loop + audit | 30 | 9 | 21 | 2 | 0 | 3 | 0 | 0 | 4 |
| Voice + accessibility | 29 | 0 | 29 | 0 | 0 | 0 | 0 | 0 | 0 |
| New Catalyst surfaces | 31 | 14 | 17 | 3 | 0 | 0 | 1 | 1 | 9 |
| Analytical depth on C5 / C2 | 31 | 31 | 0 | 0 | 5 | 1 | 9 | 10 | 6 |
| Data ingest CSV → ER | 25 | 1 | 24 | 0 | 0 | 1 | 0 | 0 | 0 |
| UI / UX system | 25 | 0 | 25 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **258** | **114** | **144** | **24** | **10** | **13** | **22** | **12** | **33** |

## Summary — counts per capability

| Capability | Candidates | Where they mostly come from |
|---|---:|---|
| C1 · Advanced Visualization | 24 | Tier homes (beat / station / state panels), the Monthly Crime Review, SmartBrowz map capture, face result surfaces |
| C2 · Criminological Network & Link Analysis | 10 | Identity resolution v2 and its validation, face-corroborated aliases, corridors, victim ⇄ accused overlap |
| C3 · Sociological & AI-Driven Predictive Dashboards | 13 | Plain-language alert and delta sentences, beat risk card, registration-collapse anomaly, disparity panel, past-alerts outcomes |
| C4 · Pattern & Trend Discovery | 22 | Near-repeat classification and zones, Gi\* trajectory classes, CCS-17 funnel, Crime Review triads, festival uplift, cross-station series |
| C5 · Network & Behavioural Analysis | 12 | Recidivism curve, escalation ladder and watchlist, MO transition matrix, crew reach / evolution / reactivation |
| C6 · AI/ML-Driven Intelligence | 33 | Face quality gate, comparison, floor and model card; validation and calibration cards; LLM composer with the numeric firewall; RAG document search; OCR; alert precision from feedback; copilot provenance |
| infra | 144 | Everything that makes the above a product — write paths, PWA, accessibility, performance, ingest, evidence in the README |

Against the master prompt's Phase-8 targets (~45 / 30 / 25 / 25 / 25 / 30 / 20, i.e. 200+ capability features): the eight lanes hold 258 candidates but only 114 capability-bearing ones under the counting rules in `CAPABILITIES.md` and Appendix A. The gap is structural, not a shortfall of ideas — the officer-tier, action-loop, accessibility and ingest lanes are mostly infra by definition. The recommendation for Phase 8 is to build by value-per-effort within each lane exactly as ordered above, report the honest split, and let the Catalyst-purity, ER-schema and negative-result story carry the count argument (COMP §9).

## Gaps — what this backlog could not verify

- **Generated faces (row 87).** No source of photoreal generated faces that Zia's detector will accept has been chosen; procedural avatars will not pass `analyseFace`. This blocks rows 58–86 until decided and recorded.
- **Security-proceedings heads (row 57).** `functions/dappa_api/lib/constants.js` carries no 126 / 128 / 129 BNSS head; a Preventive Action Report needs a lookup and generator change before it is honest.
- **`executeOLAPQuery` (row 155).** Verified only from the installed typings and one sentence on the ZCQL page; the docs page is 404. Exercise it once before any claim.
- **CCTNS export column names (row 232).** The IIF form list is verified; what a Police IT export actually looks like column-by-column is not.
- **Runtime state of the `/about` service matrix.** Read in source, not run; see Corrections above.
- **Whether `BehaviourChangeCard` already runs corpus-wide (row 196).** Its header reads as per-person; a grep did not settle the render scope. Check before building.
- **Kannada labels.** Every `unv` label in `plainlanguage.js` still needs a Kannada-speaking officer's sign-off (UX §13); rows 15, 33 and 48 inherit that dependency.
- **No runtime numbers.** Nothing here was built, deployed or measured; effort and value are judgments, and the "existing" checks are greps and file reads on 27 August 2026.

<a id="sources"></a>
## Sources

Repository files read for this backlog (27 Aug 2026): `README.md`, `CAPABILITIES.md`, `FEATURES.md` (all 808 entries), `docs/ROUND2_BASELINE.md`, `docs/06_ROUND2_MASTER_PROMPT.md` (phases 4–10, appendices A–B), `docs/DECISIONS.md` (D-008 … D-016), `docs/ROADMAP.md`, `docs/ER_TEXT_EXTRACT.txt` (Unit, Employee, ArrestSurrender columns), `docs/benchmarks/forecast_metrics.json`, `docs/benchmarks/identity_metrics.json`, `client/src/App.jsx`, `client/src/lib/tier.js`, `client/src/lib/plainlanguage.js`, `client/src/lib/voice.js`, `client/src/components/ReadAloudButton.jsx`, `client/src/routes/*` (component listings and the headers of `BehaviourChangeCard.jsx`, `MoEvolutionCard.jsx`, `PeerCohortCard.jsx`, `OrgCrimeCrews.jsx`, `MoVocabulary.jsx`, `VictimPanels.jsx`, `LocationPanels.jsx`, `LinkLab.jsx`, `EvidenceLoader.jsx`, `PeerCohortPanel.jsx`, `About.jsx`, `ServiceMatrix.jsx`, `ModelRegistry.jsx`), `functions/dappa_api/lib/routes/*.js` (route registrations), `functions/dappa_api/lib/constants.js`, `pipeline/analytics.py` (function list), `pipeline/generate.py` (`injected_cases`, `plant_offenders`), `client/package.json`, `client/vite.config.js`, `git status`, `git log`.

Research documents whose sections are cited by code: [docs/CATALYST_SERVICE_RESEARCH.md](CATALYST_SERVICE_RESEARCH.md), [docs/DOMAIN_RESEARCH.md](DOMAIN_RESEARCH.md), [docs/UX_RESEARCH.md](UX_RESEARCH.md), [docs/COMPETITIVE_SCAN.md](COMPETITIVE_SCAN.md) — each carries the URL of every external fact it reports and its own VERIFIED / INFERRED tag.

External pages relied on directly in this file (all listed in the research documents' own Sources and marked VERIFIED there):

1. https://docs.catalyst.zoho.com/en/serverless/help/circuits/introduction/
2. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/automl/
3. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/identity-scanner/facial-comparison/
4. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/face-analytics/
5. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/object-recognition/
6. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/barcode-scanner/
7. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/image-moderation/
8. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/zia-services/ocr/
9. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/zcql/execute-zcql-query/
10. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/search/search-data/
11. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/smartbrowz/generate-pdfnscreenshot/
12. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/job-scheduling/jobs/create-job/
13. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/push-notifications/send-notifications/
14. https://docs.catalyst.zoho.com/en/cloud-scale/help/push-notifications/web/
15. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/download-object/
16. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/stratus/overview/
17. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/add-new-user/
18. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/authentication/get-user-details/
19. https://docs.catalyst.zoho.com/en/sdk/web/v4/overview/
20. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/quickml/execute-quickml-endpoints/
21. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/cache/insert-data-into-cache/
22. https://docs.catalyst.zoho.com/en/sdk/nodejs/v2/cloud-scale/mail/send-email/
23. https://docs.catalyst.zoho.com/en/cloud-scale/help/mail/domains/
24. https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/llm-serving/
25. https://docs.catalyst.zoho.com/en/quickml/help/generative-ai/rag/
26. https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/olap-database/introduction/
27. https://ksp.karnataka.gov.in/storage/pdf-files/CRIME%20REVIEW%20-%20JULY%20-%202026.pdf (Monthly Crime Review, July 2026 — the structure rows 10, 23, 30–32, 40–41, 50, 52, 54 replicate)
28. https://indiankanoon.org/doc/177181757/ (Ravi v State of Karnataka, KHC 29 Jan 2026 — rowdy-sheet hearing requirement behind rows 109, 115)
29. https://m.thewire.in/article/government/delhi-police-ai-facial-recognition (Delhi Police 80 % face-match rule behind rows 58–59, 70)
30. https://police.py.gov.in/Police%20manual/Chapter%20PDF/CHAPTER%2034%20Police%20Station%20records.pdf (Puducherry manual crime-chart annotations behind rows 19, 199)
31. https://rss.onlinelibrary.wiley.com/doi/full/10.1111/j.1740-9713.2016.00960.x (Lum & Isaac feedback loop behind row 44)
32. https://www.w3.org/TR/WCAG22/ and the Understanding pages cited in UX §2 (rows 120–145)
33. https://guidelines.india.gov.in/annexure-ii-matrix-to-check-conformity/ (GIGW rows behind 15, 129, 130)
34. https://service-manual.ons.gov.uk/data-visualisation/guidance/showing-uncertainty-in-charts and https://analysisfunction.civilservice.gov.uk/policy-store/communicating-quality-uncertainty-and-change/ (plain-language rules behind rows 2, 5, 6)
35. https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/component/aria.md (row 121)
36. https://infrequently.org/2024/01/performance-inequality-gap-2024/ (budget behind rows 237, 250–252)
37. https://vite-pwa-org.netlify.app/workbox/generate-sw.html and https://developer.chrome.com/docs/workbox/caching-strategies-overview (row 248)
38. https://doc.arcgis.com/en/arcgis-solutions/11.5/reference/tool-reference.htm and https://resource.esriuk.com/blog/2018-8-31-crime-analysis-in-arcgis-pro/ (rows 183, 188–189, 192)
39. https://github.com/SarmaHighOnCode/KSPDatathon and https://github.com/kkeerthanaaaa/KSP-Hackathon-Deploy (rows 111, 167, 187)
40. https://themarkup.org/prediction-bias/2023/10/02/predictive-policing-software-terrible-at-predicting-crimes (row 106)
41. https://algorithmwatch.org/en/dutch-police-cas-predictive-policing/ (row 102)

*Written 27 August 2026 for Phase 8 of the Round-2 build. Re-run the greps named in "Duplicate control" before treating any row as new — the untracked scaffolds may have been wired since.*
