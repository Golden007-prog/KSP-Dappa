# KSP DAPPA — Challenge Capability Coverage

**An honest audit of how the shipped app maps onto the six scored capabilities of
the KSP Datathon 2026 challenge, _"AI-Driven Crime Analytics & Visualization
Platform."_**

This document is written to be *checked*, not believed. Every claim is a
numbered pointer into [`FEATURES.md`](FEATURES.md) (808 cataloged features) and a
route or endpoint a judge can open. Three of the six capabilities currently
clear the 100-feature bar and three do not; the shortfalls are stated in
[§ Shortfalls](#shortfalls) with exact gap sizes rather than smoothed over.

---

## Scorecard

| # | Capability | Features | Bar | Status | Gap |
|---|---|---:|---:|---|---:|
| **C1** | Advanced Visualization | **186** | 100 | ✅ clears | +86 |
| **C2** | Criminological Network & Link Analysis | **62** | 100 | ❌ **short** | **−38** |
| **C3** | Sociological & AI-Driven Predictive Dashboards | **119** | 100 | ✅ clears | +19 |
| **C4** | Pattern & Trend Discovery | **106** | 100 | ✅ clears | +6 |
| **C5** | Network & Behavioural Analysis | **45** | 100 | ❌ **short** | **−55** |
| **C6** | AI/ML-Driven Intelligence | **85** | 100 | ❌ **short** | **−15** |

Of the 808 cataloged features, **398 back at least one scored capability** and
**410 do not** — those 410 are enabling infrastructure (app shell, command
palette, toasts, error boundaries, PWA, print plumbing, i18n machinery, loading
and empty states, CSV/clipboard utilities, accessibility scaffolding). They make
DAPPA a real product rather than a demo, but they are not evidence for a scored
capability and are **deliberately excluded from every count above**. Inflating
the six numbers with them would produce 808 across six capabilities and mean
nothing.

### Counting rules

1. **A feature counts for a capability only if it delivers analytic or
   visual substance the challenge text actually asks for.** A hotspot hour-band
   filter counts for C1 and C4. A loading skeleton on the panel that shows it
   does not count for anything.
2. **Multi-capability features are declared, never hidden.** 184 of the 398
   classified features genuinely serve more than one capability — a red-pulsing
   choropleth is simultaneously visualization (C1) and anomaly call-out (C3).
   Each is counted in every capability it serves, and the full overlap matrix is
   published in [§ Overlap](#overlap) so a judge can subtract if they disagree.
   The six numbers therefore sum to 603 attributions across 398 distinct
   features — they are not a partition of 808 and are not presented as one.
3. **Backend-only features are flagged.** 14 catalog entries are endpoints that
   are implemented, contract-tested and curl-verifiable but that **no client
   file calls**. They are counted, and every one is named in
   [§ Backend-only](#backend-only) so the count can be read either way. Excluding
   them entirely moves C1→184, C2→59, C3→114, C4→103, C5→43, C6→83 — it changes
   no pass/fail verdict.

**Where to look.** Client routes are under the SPA root (HashRouter); API paths
are relative to `/server/dappa_api`. The contract suite backing the endpoint
claims is `functions/dappa_api/test/run.mjs`.

---

## C1 — Advanced Visualization · 186 features ✅

### What the challenge asks for

> Interactive dashboards and geospatial maps. District-level drill-down to
> police stations. Spatiotemporal clusters — crime hotspots layering **time of
> day** with location. Emerging-trend alerts with **red-zone pulsing** when a
> crime category spikes versus historical averages.

### How DAPPA delivers it

The Command Dashboard and the GeoIntel map are the two anchors. The dashboard is
a pinnable, collapsible, maximizable panel grid over a Karnataka choropleth with
five shading modes (cases, per-lakh, MoM change, population, predicted risk),
a 12-month crime-head trend with forecast extension and confidence band, five
KPI tiles including a next-month projection, a live intelligence ticker, and a
per-district drill sheet that opens on polygon click.

GeoIntel is the full-bleed map: six toggleable layers over seven ordered Leaflet
panes, district polygons that drill into a station list with per-station risk
bars (**the district → station drill-down the challenge names explicitly**), a
month time-scrubber with play/pause animation, an A/B month swipe-compare with a
draggable divider, and a radius probe.

The challenge's two most specific asks are met literally and are the easiest
things for a judge to verify:

- **Time of day layered over location** — the hour-of-day lens (`?h=`) is a 0–23
  scrubber that filters hotspot clusters by wrap-aware `HourBandStart/End`
  coverage, with a 24-hour play sweep, a day/night basemap auto-dim, and a
  sun/moon day-part indicator showing live active-vs-total cluster counts
  (features 437–441, 443–445). The hotspot cluster panel adds a 24-hour district
  activity histogram with the cluster's peak band highlighted.
- **Red-zone pulsing on a category spike** — districts whose live alert z-score
  reaches 2 (union server anomaly flags) get an animated red pulse stroke and a
  red-zone count in the legend on the dashboard choropleth (feature 59); the map
  carries the same as a dedicated non-interactive alert-pulse pane (381) plus a
  red-zone tour that flies through flagged districts (465); alert cards escalate
  to a pulsing red glow border at critical/high severity (195).

### Feature list (186)

**Command Dashboard — 63 · route `/`**
1, 2, 3, 4, 9, 11, 14, 15, 16, 17, 18, 19, 20, 23, 24, 25, 28, 29, 31, 32, 33,
35, 36, 37, 38, 39, 40, 41, 44, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 74, 76, 77, 79, 80, 81, 82,
83, 84

**GeoIntel map — 61 · route `/map`**
367, 368, 369, 372, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385,
386, 387, 388, 389, 391, 392, 395, 400, 402, 403, 412, 413, 414, 415, 416, 418,
425, 426, 428, 435, 437, 438, 439, 441, 443, 444, 445, 448, 449, 450, 455, 456,
457, 459, 460, 461, 462, 464, 465, 467, 468, 469, 470, 474, 475

**Trends + Predict — 22 · routes `/trends`, `/predict`**
275, 276, 277, 280, 281, 285, 286, 288, 291, 292, 299, 309, 313, 317, 322, 331,
334, 336, 340, 344, 345, 356

**Alerts + Reports — 11 · routes `/alerts`, `/reports`**
191, 192, 193, 195, 196, 197, 199, 229, 244, 245, 251

**Catalyst backend — 10**
738, 739, 740, 741, 743, 744, 745, 746, 788, 789

**Case Explorer + FIR detail — 8 · routes `/cases`, `/cases/:id`**
109, 126, 128, 151, 152, 167, 168, 169

**Design-system visualization primitives — 6**
679, 680, 681, 682, 690, 695

**Network + Offenders — 4 · routes `/network`, `/offenders`**
476, 515, 535, 556

**Copilot — 1 · route `/copilot`** · 585

### Where a judge sees it working

| What | Where |
|---|---|
| Dashboard grid, choropleth, 5 shading modes, forecast KPI | `/` |
| District drill sheet with unit switcher, peak-window badge | `/` → click any polygon |
| Full map, six layers, layer presets | `/map` |
| District → station drill-down | `/map` → click a district polygon → station list → click a station |
| **Hour-of-day lens over hotspots** | `/map?h=23&layers=hotspots` — press `H` |
| **Red-zone pulsing** | `/` (choropleth legend shows red-zone count) · `/map` alert-pulse layer · `/alerts` critical cards |
| Month animation / A/B compare | `/map` — `Space` to play, `C` to compare |
| API | `GET /summary/kpis` · `/geo/districts` · `/geo/stations` · `/geo/incidents` · `/geo/hotspots` · `/trends/monthly` |

---

## C2 — Criminological Network & Link Analysis · 62 features ❌ short by 38

### What the challenge asks for

> Relationship mapping across suspects, victims and recurring locations.
> Repeat-offender tracking with Modus Operandi **across jurisdictions**.
> Association detection surfacing **hidden criminal links**.

### How DAPPA delivers it

A Cytoscape co-accusal graph where node colour is community, node size is degree
and edge width is shared-FIR weight, served by `GET /network/graph` over a
NoSQL → Stratus → `NetworkEdge` fallback chain. On top of it sit the link-analysis
tools: ego-focus at 1/2/3 hops, a two-endpoint shortest-path finder with a
clickable breadcrumb and an evidence-strength badge summing shared FIRs across
hops, articulation-point ("removal splits the group") detection, bridge/broker
highlighting, and mutual-associate chips on the edge drawer — the last three are
the app's answer to *hidden* links, since they surface structure no single FIR
record shows.

Cross-jurisdiction tracking is real and is the strongest part of this capability:
the Accused table has no person ID (faithful to the official ER schema), so DAPPA
resolves identity heuristically from name and alias similarity, exposes the
confidence percentage on each alias chip, and then shows the offender's
chronological district-hop sequence and a "spans N districts" badge. The
offender registry has a dedicated cross-jurisdiction filter (2+ districts).

**Why it is short.** The graph itself is deep but narrow: 62 features. The
victim and *recurring-location* halves of "suspects, victims and recurring
locations" are the thinnest — victims appear only as a case-detail party panel
(129), and location linking exists as case-similarity geo-proximity (165) rather
than as first-class location nodes in the graph.

### Feature list (62)

**Network + Offenders + Offender-360 — 49 · routes `/network`, `/offenders`, `/offenders/:personKey`**
476, 478, 479, 480, 481, 482, 483, 484, 495, 496, 497, 498, 499, 500, 501, 504,
506, 512, 513, 514, 515, 517, 523, 524, 527, 532, 534, 535, 536, 538, 539, 540,
545, 546, 548, 549, 553, 554, 555, 556, 558, 560, 563, 564, 568, 569, 573, 575,
578

**Catalyst backend — 8** · 752, 753, 755, 790, 791, 792, 794, 795

**Case Explorer + FIR detail — 4** · 127, 129, 165, 177

**App shell — 1** · 712 (command-palette live offender lookup)

### Where a judge sees it working

| What | Where |
|---|---|
| Co-accusal graph, communities, layouts | `/network` |
| Shortest association path + evidence strength | `/network` → pick person A and B in the path tool |
| Hidden-link tooling: bridges, cut-vertices, mutual associates | `/network` → Bridges toggle; open any node/edge drawer |
| Repeat-offender registry, cross-jurisdiction filter | `/offenders?span=multi&repeat=1` |
| Identity resolution + alias confidence + district hops | `/offenders/:personKey` |
| Accused → registry pivot from a live FIR | `/cases/:id` → accused row → `/offenders?q=` |
| API | `GET /network/graph` · `/network/path` · `/offenders` · `/offenders/:personKey` · `POST /offenders/watch` |

---

## C3 — Sociological & AI-Driven Predictive Dashboards · 119 features ✅

### What the challenge asks for

> Socio-economic correlation — urbanisation, population, indicators — explaining
> the **"why" behind the "where"**. Predictive risk scoring for high-risk areas.
> Anomaly-detection call-outs linking complex cases.

### How DAPPA delivers it

All three legs are present and each has a dedicated surface.

**The "why" behind the "where"** is the socio-economic scatter on `/trends`:
crime rate per lakh against a switchable district indicator (urbanisation %,
literacy %, density, per-capita income index), bubble area encoding population,
with an OLS fit line, a live Pearson-r badge, median-split quadrant lines with
corner captions, and an auto-insight naming the district furthest above the
fitted line. A correlation-is-not-causation note sits on the card. The dashboard
carries the compact version — a cases-versus-population Pearson readout under the
choropleth (61) plus population and risk shading modes (57, 58).

**Predictive risk scoring** is the `/predict` league: 30-day station risk with
percentile tier badges, a risk-score distribution histogram binned by tier,
per-station 6-month sparklines, filterable driver chips, a station dossier
drawer with rank-ordered driver-importance bars (honestly labelled "ranking, not
coefficients"), and a risk choropleth. Risk also surfaces as station bubble
colour and pulsing halos on `/map` and as a highest-risk-station callout in the
dashboard drill sheet.

**Anomaly call-outs linking complex cases** is the `/alerts` surface: a robust
z-score feed with severity ranking, a kanban triage board, SLA countdown badges
that escalate to a breached state, a z-score gauge with threshold bands,
expected-versus-observed compare bars, similar-alert lists, and an alert→case
drill that opens the explorer pre-filtered to the alert's district, crime head
and period. Case-level anomaly flags carry a reason callout on the FIR detail.

### Feature list (119)

**Alerts + Reports — 37 · routes `/alerts`, `/reports`**
178, 179, 180, 182, 184, 188, 189, 190, 191, 192, 193, 195, 196, 197, 201, 205,
206, 208, 209, 229, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 249, 250,
251, 252, 253, 255, 258

**Trends + Predict — 30 · routes `/trends`, `/predict`**
282, 283, 287, 292, 302, 303, 305, 306, 311, 313, 315, 322, 328, 336, 337, 338,
339, 340, 341, 342, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362

**Command Dashboard — 18 · route `/`**
18, 31, 32, 53, 54, 55, 57, 58, 59, 61, 63, 68, 72, 73, 77, 78, 84, 86

**Catalyst backend — 16**
744, 747, 748, 749, 750, 756, 757, 771, 779, 780, 784, 785, 786, 787, 796, 797

**GeoIntel map — 8 · route `/map`** · 375, 381, 386, 413, 416, 418, 464, 465

**Case Explorer + FIR detail — 6** · 111, 119, 122, 133, 149, 164

**Network + Offenders — 2** · 514, 532 · **App shell — 2** · 666, 733

### Where a judge sees it working

| What | Where |
|---|---|
| **Socio-economic correlation scatter, 4 indicators, Pearson r** | `/trends` → Socio-economic correlation card |
| Cases-vs-population correlation readout | `/` → under the choropleth |
| Population / risk choropleth shading | `/` → choropleth mode switcher |
| **Station risk league, tiers, drivers, dossier drawer** | `/predict` |
| Risk choropleth + risk halos on the map | `/predict` risk map · `/map` risk-halo layer |
| **Anomaly feed, triage board, SLA, z-gauge** | `/alerts` · `/alerts?view=board` · `/alerts?breached=1` |
| Alert → case drill | `/alerts` → any card → "Cases →" |
| Case-level anomaly callout | `/cases?anomaly=1` → open a flagged FIR |
| API | `GET /meta/socio` · `/insight/socio-correlation` · `/risk/stations` · `/alerts` · `/alerts/:id` · `/forecast` |

---

## C4 — Pattern & Trend Discovery · 106 features ✅

### What the challenge asks for

> Statistical **spatial and temporal hotspots** driving smarter **resource
> deployment**.

### How DAPPA delivers it

Temporal discovery lives on `/trends` and is genuinely statistical rather than
decorative: an STL-style decomposition (client-side 2×12 moving average plus
calendar-month indices) rendered as observed/trend/seasonal/residual small
multiples with a linked axis cursor, Hyndman trend-strength and season-strength
F-statistics with plain-language tooltips, level-shift changepoints found by
binary segmentation on SSE and drawn as signed-percent step markers, residual
outlier dots at |z| ≥ 2 *after* removing trend and season, a YoY-percent calendar
on a diverging ramp, festival-window shading on real 2021–2026 Ugadi/Dasara/
Deepavali dates, a crime-mix radar against the state baseline, and a district
similarity finder using cosine distance over per-head profiles.

Spatial discovery is the hotspot cluster layer on `/map` — centroid, radius,
intensity band and hour band per cluster, ranked top-10 chips, numbered rank
badges at the top-3 centroids, a nearest-station haversine readout, an
incidents-within-radius statistic with dominant crime head, and a click-to-place
radius probe reporting live density per km².

**Resource deployment** — the clause that distinguishes C4 from C1 — is the
patrol-route suggestion: a nearest-neighbour-ordered dashed polyline over the
top-3 visible hotspots, numbered stop markers with per-leg distance tooltips, a
summary pill with total km and a drive-time estimate at 30 km/h, and a
copy-as-text action for shift briefings. Critically, **the route respects the
hour-band and hour-lens filters**, so a night band yields a night patrol route
(features 449–453).

### Feature list (106)

**Trends + Predict — 33 · routes `/trends`, `/predict`**
275, 276, 277, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292,
325, 326, 327, 328, 330, 331, 332, 333, 334, 335, 344, 345, 346, 348, 349, 357,
359

**GeoIntel map — 30 · route `/map`**
375, 376, 377, 384, 385, 389, 391, 392, 414, 415, 437, 438, 441, 443, 444, 445,
446, 448, 449, 450, 451, 452, 453, 455, 457, 461, 467, 468, 469, 470

**Command Dashboard — 18 · route `/`**
2, 15, 23, 28, 29, 35, 36, 38, 50, 52, 62, 69, 70, 71, 79, 81, 82, 83

**Case Explorer + FIR detail — 13 · routes `/cases`, `/cases/:id`**
109, 125, 126, 133, 149, 151, 152, 155, 164, 165, 167, 168, 171

**Catalyst backend — 11** · 739, 740, 741, 742, 743, 746, 761, 788, 789, 799, 800

**Alerts — 1** · 253

### Where a judge sees it working

| What | Where |
|---|---|
| **STL decomposition + strength stats + changepoints** | `/trends` → Decomposition panel |
| Seasonality heat-map / weekday-vs-weekend profile | `/trends` → Seasonality card, Heatmap ⇄ Profile toggle |
| Festival-window shading, YoY calendar, level shifts | `/trends` → monthly chart view switcher |
| Crime-mix radar + district similarity finder | `/trends` → Crime-mix card |
| **Spatial hotspot clusters, ranked chips, rank badges** | `/map?layers=hotspots` |
| **Patrol route for resource deployment** | `/map` → press `P` (combine with `H` for a night route) |
| Radius probe, density per km² | `/map` → probe tool |
| Case-similarity pattern engine with why-matched reasons | `/cases/:id` → Similar cases panel |
| API | `GET /trends/seasonality` · `/geo/hotspots` · `/trends/category-share` · `/insight/emerging` · `/cases/:id/similar` |

---

## C5 — Network & Behavioural Analysis · 45 features ❌ short by 55

### What the challenge asks for

> Connections between suspects and **organised crime networks**. **Recurring
> modus operandi** detection.

### How DAPPA delivers it

Organised-crime structure is community-first: Louvain communities precomputed
into the graph, a community picker with per-group member/case/district stats, a
chip strip with click-to-isolate, an isolated-community summary reporting edge
density, districts spanned, top-5 member MO tags and a fly-to "key connector"
(the member with the most cross-community links), and a hierarchical tree layout
rooted at each component's highest-degree connector — the closest thing to an
org chart the data supports.

Recurring MO detection runs on both ends. Server-side, `POST /ai/narrative`
extracts weapon / vehicle / entry / approach vocabulary from `BriefFacts` via a
Zia flag path with a deterministic local extractor behind it, and
`GET /offenders/mo-patterns` mines MO signatures with cross-jurisdiction
detection. Client-side, the offender registry carries an MO co-occurrence matrix
whose cell intensity is the number of offenders carrying both tags and whose
cells apply the pair as an AND filter, plus AND-semantics MO tag chips with
per-tag counts, and the compare drawer highlights MO tags shared by 2+ compared
offenders.

Behavioural profiling is the Offender-360 depth: a behavioural-tempo card (days
since last case, median inter-case gap, active span, last-12-months-versus-prior
escalation delta), a case-mix distribution, a cases-per-year activity sparkline,
dormancy markers flagging 12+ month gaps in the timeline, and a watchlist that
renders starred people as diamond nodes on the graph with a dedicated sidebar.

**Why it is short.** 45 features is the thinnest capability in the app and the
one furthest from the bar. Almost everything lives on two routes; there is no
behavioural *cohort* analysis, no MO-evolution-over-time view, no
organised-crime scoring of a community as a whole, and the MO vocabulary is
extraction-based rather than learned.

### Feature list (45)

**Network + Offenders + Offender-360 — 35 · routes `/network`, `/offenders`, `/offenders/:personKey`**
476, 482, 483, 484, 485, 499, 506, 513, 516, 524, 527, 532, 533, 536, 537, 540,
545, 546, 548, 550, 551, 552, 559, 560, 561, 562, 566, 567, 570, 571, 576, 577,
578, 579, 580

**Catalyst backend — 8** · 752, 755, 763, 792, 793, 794, 795, 796

**Case detail — 1** · 127 (narrative MO extraction) · **Reports — 1** · 229 (co-offending communities in the brief)

### Where a judge sees it working

| What | Where |
|---|---|
| Community picker, isolate, density, key connector | `/network` → community chip strip |
| Organised-crime tree layout | `/network` → layout switcher → Tree |
| **MO co-occurrence matrix** | `/offenders` → MO co-occurrence card → click a cell |
| MO tag filters with AND semantics | `/offenders?mo=vehicle-theft,night-entry` |
| **Behavioural tempo, case-mix, dormancy markers** | `/offenders/:personKey` |
| Watchlist (diamond nodes + sidebar) | `/network` → star a node → Watchlist panel |
| Narrative MO extraction from FIR text | `/cases/:id` → Narrative insights panel |
| Co-offending communities in the printed brief | `/reports` → `/print/brief` |
| API | `GET /network/communities` · `/offenders/mo-patterns` · `POST /ai/narrative` · `POST /offenders/watch` |

---

## C6 — AI/ML-Driven Intelligence · 85 features ❌ short by 15

### What the challenge asks for

> ML models surfacing **hidden correlations**, **detecting anomalies**, and
> **predicting emerging crime risk**.

### How DAPPA delivers it

Five distinct model families ship, each with a flag-gated live path and an
identical-shape deterministic fallback, and each is *explained* in the UI rather
than presented as an oracle:

- **Anomaly detection** — robust median/MAD z-scores refreshed nightly by
  `dappa_nightly`, plus a live path in `dappa_event` where an FIR insert triggers
  an incremental `AggMonthly` upsert, a z-check and a deduplicated
  `AnomalyAlert` insert (the register-FIR-see-alert demo storyline). Surfaced
  with observed-vs-expected sparklines carrying an expected ±2σ band.
- **Forecasting** — Holt-Winters monthly forecasts with 80% confidence bands and
  a backtest MAPE, plus a *client-side* 6-month holdout backtest that races
  seasonal-naive, drift and 3-month-mean challengers against actuals and scores
  them on MAPE / MAE / signed bias, with an honesty footnote that this is a
  single holdout and not cross-validation.
- **Outcome classification** — `POST /predict/outcome` via QuickML with an
  embedded logistic fallback, reporting predicted class, ROC-AUC, a what-if
  delta versus the previous run, and a six-point counterfactual sensitivity
  sweep rendered as a tornado with a biggest-lever insight sentence.
- **Risk scoring** — weighted station risk recomputed nightly with named drivers.
- **NL copilot** — `POST /copilot/query` with a QuickML LLM+RAG flag path falling
  through to a deterministic 15-intent parser, exposing the generated ZCQL, the
  cited Data Store tables, an "Understood as" intent chip, a confidence badge
  (Exact aggregate / Modelled estimate / Unmatched) and a parse→intent→query→
  template pipeline reveal.

Hidden-correlation surfacing is the OLS/Pearson fit on the socio scatter, the
`GET /insight/socio-correlation` endpoint scoring five indicators with
plain-language interpretation, the district cosine-similarity finder, and the
copilot's *"why is X rising"* diagnostic which returns a trend verdict plus a
contributing sub-pattern, a matching open alert and the strongest hotspot as
cited causes.

Model governance is a first-class surface: a model-cards sheet giving purpose,
inputs, method, metrics, caveats and a fairness note per model; a methodology
annex in the brief; and an AI degradation-design explainer on `/about` naming
the live path and the fallback for each feature.

**Why it is short.** 85 is close, and the gap is 15. The models are real but the
count is limited by there being five of them — much of the ML surface area is
concentrated in `/predict` and `/copilot`, and the copilot's contribution is
mostly transparency chrome rather than distinct inference capabilities.

### Feature list (85)

**Trends + Predict — 32 · routes `/trends`, `/predict`**
282, 289, 290, 302, 305, 306, 313, 315, 317, 318, 319, 322, 323, 325, 326, 327,
328, 330, 338, 341, 348, 350, 351, 352, 353, 354, 355, 360, 363, 364, 365, 366

**Catalyst backend — 18**
747, 748, 756, 757, 761, 762, 763, 764, 765, 766, 779, 780, 784, 788, 798, 799,
800, 801

**Copilot — 16 · route `/copilot`**
585, 589, 590, 593, 595, 625, 626, 627, 628, 629, 630, 631, 636, 637, 644, 648

**Alerts + Reports — 8** · 178, 193, 197, 229, 244, 245, 255, 258

**Command Dashboard — 6** · 7, 8, 59, 62, 63, 68

**Case detail — 4** · 111, 122, 127, 164 · **Offender-360 — 1** · 575

### Where a judge sees it working

| What | Where |
|---|---|
| **Model cards — purpose, method, metrics, caveats, fairness** | `/predict` → Model cards sheet |
| Outcome classifier + AUC + what-if delta | `/predict` → outcome form → Score |
| **Counterfactual sensitivity tornado** | `/predict` → after a scoring run |
| **Holdout backtest scoreboard (MAPE/MAE/bias)** | `/predict` → Backtest panel |
| Forecast with 80% CI + model + MAPE | `/predict` → Forecast explorer · `/` → 5th KPI tile |
| Scenario planner (±30% uplift over the forecast) | `/predict` → Scenario panel |
| **NL copilot with ZCQL reveal, intent, confidence** | `/copilot` |
| "Why is X rising" causal diagnostic | `/copilot` → ask *"why is theft rising in Bengaluru"* |
| Live anomaly pipeline (event function) | register an FIR → alert appears at `/alerts` |
| AI degradation design (live path vs fallback) | `/about` → AI degradation card |
| API | `POST /predict/outcome` · `/copilot/query` · `/ai/narrative` · `GET /forecast` · `/risk/stations` · `/insight/socio-correlation` |

---

## Shortfalls

**Three capabilities do not clear 100 working features.** This is the list the
frontend agents build against; the numbers are gaps, not targets to argue down.

| Capability | Now | Bar | **Gap** | Where the thin ground is |
|---|---:|---:|---:|---|
| **C5 Network & Behavioural** | 45 | 100 | **−55** | Everything lives on `/network` + `/offenders`. No cohort/peer-group behavioural analysis, no MO-evolution-over-time, no whole-community organised-crime scoring, no MO-vs-outcome analysis, no behavioural change detection (escalation/de-escalation alerts). The MO co-occurrence matrix is the only true MO-mining UI. |
| **C2 Network & Link Analysis** | 62 | 100 | **−38** | Victims and *recurring locations* are barely in the graph — victims are a case-detail party panel only, locations only appear as case-similarity geo-proximity. No location nodes, no victim-suspect bipartite view, no temporal link evolution, no link-prediction ("who is likely connected but not yet co-accused"), no multi-hop path ranking beyond a single shortest path. |
| **C6 AI/ML Intelligence** | 85 | 100 | **−15** | Closest to the bar. Five model families, but inference surface is concentrated; no model-comparison UI beyond the forecast backtest, no drift monitoring, no per-prediction explanation beyond driver ranking, no batch scoring, no confidence calibration view. |

Two structural notes that bear on how the shortfalls get closed:

**C2 and C5 overlap by 23 features and their union is 84.** The challenge scores
them separately but the two capability statements genuinely overlap. If a judge
merged them into one network capability, the honest merged number is **84, still
short of 100** — closing them separately is the safer plan, and features that
serve both (community isolation, node drawers, the offender registry) are the
efficient place to build.

<a id="backend-only"></a>
**14 features are backend-only.** These endpoints are implemented, contract-tested
in `functions/dappa_api/test/run.mjs`, and answer correctly to `curl` — but no
client file calls them, verified by grepping `client/src` for each path:

| Feature(s) | Endpoint | Status in the UI |
|---|---|---|
| 790, 791 | `GET /network/path` | Capability **is** visible — the client runs its own BFS in `client/src/routes/network/graphUtils.js` (features 497–498). Endpoint unused. |
| 792 | `GET /network/communities` | Visible — client derives communities from graph node fields (483–485). Endpoint unused. |
| 784–787 | `GET /insight/socio-correlation` | Visible — `SocioScatter.jsx` computes Pearson client-side from `/meta/socio` + `/geo/districts` (336–343). Endpoint unused. |
| 788, 789 | `GET /insight/emerging` | Visible — dashboard rising chips derive from KPI `topRisingSubhead` + category share (feature 29). Endpoint unused. |
| 793 | `GET /offenders/mo-patterns` | Visible — MO co-occurrence matrix is computed client-side in `Offenders.jsx` (566). Endpoint unused. |
| 797 | `GET /alerts/summary` | Visible — counts derived from `/alerts` (190). Endpoint unused. |
| 782, 783 | `GET /meta/challenge` | About page renders a **hardcoded client constant**, not the endpoint (645–646). |
| 742 | `GET /trends/compare` | No UI consumer at all; compare views issue two `/trends/monthly` calls. |

None of these is a missing capability — in every case but `/trends/compare` the
capability is on screen. They are duplicated logic, and wiring the client to the
server endpoints would move the computation onto Catalyst functions (stronger
under the platform rule) and free the client of maths it should not be doing.
This is a cleanup, not a gap, and it is worth doing before the demo.

### Two other honesty flags

- **Feature 268–271, the scheduled-delivery card on `/reports`, is explicitly
  visual only.** The frequency, day, time and recipient pickers persist and
  render a human-readable summary and a computed next-run timestamp, but nothing
  schedules. The "Send test digest now" button is real (Catalyst Mail, flag-gated).
  It is counted as infrastructure, not toward any capability.
- **Feature 604, copilot voice input, uses the browser's
  `webkitSpeechRecognition`, not Catalyst Zia speech-to-text.** The organiser's
  platform rule says using a third-party alternative where a Catalyst service
  exists invalidates the submission, and Zia speech-to-text is on the sanctioned
  list. A browser API is arguably not a third-party *service*, but this is the
  one place in the app where that argument has to be made rather than avoided.
  It is counted as infrastructure, not toward C6.

<a id="overlap"></a>
## Overlap

184 of the 398 classified features serve more than one capability. The matrix
below is the full disclosure — read a row as "of C*row*'s features, N are also
counted under C*col*". The diagonal is each capability's total.

|  | C1 | C2 | C3 | C4 | C5 | C6 |
|---|---:|---:|---:|---:|---:|---:|
| **C1** | **186** | 4 | 40 | 71 | 2 | 14 |
| **C2** | 4 | **62** | 2 | 1 | 23 | 2 |
| **C3** | 40 | 2 | **119** | 12 | 3 | 35 |
| **C4** | 71 | 1 | 12 | **106** | 0 | 15 |
| **C5** | 2 | 23 | 3 | 0 | **45** | 3 |
| **C6** | 14 | 2 | 35 | 15 | 3 | **85** |

The heavy pairs are unsurprising and defensible: **C1∩C4 = 71** (a hotspot
cluster you can see *and* that was found statistically is both), **C3∩C6 = 35**
(a risk score is both a predictive dashboard and an ML model), **C1∩C3 = 40**
(anomaly call-outs are rendered visually), and **C2∩C5 = 23** (the graph serves
link analysis and organised-crime roll-up alike).

If a judge prefers a strict partition with no feature counted twice — attributing
each feature to its single strongest capability — the numbers become **C1 186,
C3 77, C2 58, C6 33, C4 24, C5 20**, summing to the 398 classified features.
That view is defensible but misleading: it collapses C4 to 24 purely because
most of its features are also visualization, which is a fact about how the app
renders discovery rather than about whether discovery happens.

---

## Verification

| Check | Command |
|---|---|
| Endpoint contracts (all 43 routes, fixture mode, auth, privacy guardrail) | `node functions/dappa_api/test/run.mjs` |
| Trilingual key parity (3,356 English keys × kn + hi) | `node scripts/check_i18n.mjs` |
| Live smoke test against a deployment | `node scripts/smoke_test.mjs <BASE_URL>` |
| Data completeness per table vs expected counts | `GET /server/dappa_api/healthz` |
| Caste/religion never reaches the UI or an export | contract suite — privacy guardrail case, enforced on `GET /cases/:id` |

**Audit method.** Classification was done by reading all 808 entries of
[`FEATURES.md`](FEATURES.md) against the challenge text, then spot-verifying
capability-critical claims in source: the hour-band spatiotemporal filtering
(`client/src/routes/geointel/`), the BFS path finder
(`client/src/routes/network/graphUtils.js`), the socio scatter
(`client/src/routes/trends/SocioScatter.jsx`), the server capability map and
correlation endpoint (`functions/dappa_api/lib/routes/extras.js`), and the client
consumers of every second-pass endpoint. The app is 154 client components across
~36,650 lines plus a 4,667-line Catalyst function set — the catalog is not
inflated relative to the code.

*Last audited against the repository state of 26 July 2026.*
