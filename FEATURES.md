# KSP DAPPA — Feature Catalog

**808 user-visible features** across nine areas, cataloged by two per-area code audits (July 2026). Every entry is an independently usable capability in the deployed app.

## Command Dashboard (86)

1. Four KPI tiles: FIRs this month, Heinous cases, Detection rate, Active alerts — clickable deep-links carrying filters (KpiLinkTile)
2. MoM delta on FIR tile with positiveIsGood=false coloring plus computed YoY delta
3. 12-month sparkline inside the FIRs KPI tile
4. PulseDot on Active-alerts tile when count > 0
5. Per-tile loading skeletons matching final footprint
6. KPI error fallback card with Retry button
7. Ask-DAPPA omnibox: search icon, placeholder suggestion, submit navigates to /copilot?q= with filters carried
8. Omnibox curated demo-question chips + localStorage recent searches
9. Global FilterBar (District / Crime head / Date range) with Clear and loading states
10. URL-persisted filters shared across routes via useUrlFilters
11. Quick filter chips: date presets + busiest districts, one-tap toggle
12. Saved views: store/apply/delete named filter sets (localStorage Sheet)
13. Copy-share-link button with toast
14. Karnataka mini-choropleth (Leaflet, no tiles) summed per census polygon
15. Choropleth value-mode toggle: cases / per-lakh (avg) / MoM rise
16. Choropleth polygon hover tooltip with district name + value and hover highlight stroke
17. Choropleth polygon click drills into /map merging districtId into current filters
18. Anomaly districts outlined red with animated pulse stroke and legend row
19. Theme-aware Low→High density gradient legend
20. GeoIntel and district-density CSV export from the choropleth panel
21. Choropleth loading skeleton and error EmptyState with Retry
22. Filter-aware choropleth subtitle
23. 12-month trend by crime head with stacked / 100% share / line mode toggle (persisted)
24. Trend series click focuses the dashboard on that crime head (toggle to clear)
25. Trend chart PNG export
26. Trend loading skeleton, empty state with API error message, 12-month client-side clipping
27. Responsive trend chart at 360px (rotated labels, reduced height)
28. Month-vs-month CompareStrip with per-head chips and CSV export
29. Rising crime subheads chips (KPI top riser + share risers, deduped) with ▲/▼ deltas linking to /trends
30. Rising chips correct loading gate (skeleton until both sources settle) and empty state
31. Severity-coloured live alerts feed (top 5 open by severity then |z|) with relative time, deep-links carrying filters
32. Alert severity digest badges above the feed
33. Alerts feed reconciled with district filter; scope label (Statewide / district) with open count in subtitle
34. Alerts CSV export; loading/error/empty states with Retry
35. District movers leaderboard (risers/fallers) with click-to-filter and CSV export
36. District compare panel: any two districts side by side
37. Category share donut with click-through to /trends and CSV export
38. Seasonality day × hour heatmap with peak-window callout
39. Panel pin-to-top and collapse persisted in localStorage; pinned panels render first
40. Collapse-all / expand-all and reset-layout controls
41. 60s auto-refresh with countdown, manual refresh, and last-updated timestamp
42. Keyboard shortcuts (?, r, a, /, g-then-key) with shortcuts Sheet
43. Print brief via window.print with print-only header and hidden chrome
44. Dark/light theme-aware ECharts themes and choropleth palettes
45. Responsive layout: 2-col KPI grid on mobile → 4-col xl; 1-col → 3-col panel grid; 40-44px touch targets
46. aria labels on omnibox, toolbars, quick filters, heatmap; decorative SVGs aria-hidden
47. en-IN number formatting on all counts
48. Per-district drill sheet on choropleth click (replaces instant navigation; GeoIntel stays one tap away inside it)
49. Drill sheet: police-unit switcher chips when a census district hosts 2+ units (e.g. Mysuru City vs District)
50. Drill sheet: 12-month district trend sparkline with red 2-sigma spike dots
51. Drill sheet: top-5 crime heads for the district with relative volume bars
52. Drill sheet: time-of-day peak-window badge from the district's hotspot clusters
53. Drill sheet: highest-risk station callout with 30-day risk score and Predict deep-link
54. Drill sheet: open-alert list scoped to the district (severity, z, recency)
55. Drill sheet: derived-population stat plus district total across shared units
56. Drill sheet quick actions: filter dashboard, open GeoIntel/Trends/Cases with the district merged into current filters
57. Choropleth 'Population' shading mode — socio-economic overlay from server-derived population
58. Choropleth 'Risk' shading mode — average predicted 30-day station risk per district
59. Red-zone pulsing from live alert z-scores (districts at z>=2 union server anomaly flags) with red-zone count in the legend
60. City commissionerate markers toggle on the mini choropleth (5 city units, click opens drill sheet)
61. Cases-vs-population Pearson correlation readout under the choropleth ('the why behind the where')
62. Trend 'Total+F' mode: full-history total line with 3-month rolling mean and 2-sigma anomaly dots
63. Forecast extension on the trend chart: dashed next-month projection with shaded confidence band plus model/MAPE caption
64. Month-range brush (slider + shift-wheel zoom) on the trend chart
65. One-tap 'Apply' turns the brushed month range into the global date filter (with discard chip)
66. Detection-rate KPI target progress bar with a 65% state-target tick
67. FIR KPI sparkline baseline: dashed 12-month mean line, latest-point dot, and 12-mo average hint
68. Fifth KPI tile: next-month FIR projection with confidence interval, model name, MAPE and delta vs current month
69. Live intelligence ticker cycling up to ~12 auto-generated insights (pause on hover/focus, prev/next stepping, per-insight deep links)
70. Hotspot windows panel: top spatiotemporal clusters with hour-band chips (night bands red), intensity bars and night-active count
71. Hotspot windows CSV export
72. Station risk watchlist panel: top-6 stations with relative risk bars and model driver chips
73. Station risk watchlist CSV export
74. Panel maximize-to-fullscreen on every panel (Esc or backdrop click restores; placeholder keeps the grid intact)
75. Auto-refresh interval picker cycling 30s / 60s / 5m (persisted)
76. Dashboard PNG situation-poster export: composite canvas with KPI blocks, live trend + donut chart images, top movers and alert digest
77. Alerts feed severity filter (All / High+ / Critical)
78. One-tap acknowledge button on alert feed rows with toast and automatic alerts+KPI refresh
79. Category share Pareto mode: volume-sorted bars, cumulative-share line and 80% concentration marker
80. Live total FIR count in the donut hole
81. Seasonality night-share (22:00-05:00) and weekend-vs-weekday delta chips
82. Compare-strip direction filter (All / Risers / Fallers)
83. District leaderboard 'Busiest' ranking mode alongside risers/fallers
84. Compare districts: one-tap swap button plus state-share and derived-population rows
85. New keyboard shortcuts: v opens saved views, b prints the situation brief (documented in the shortcuts sheet)
86. District density CSV export now includes the derived population column

## Case Explorer & Case Detail (91)

87. Server-paginated case table with total-match count in header and footer range readout
88. Debounced (300ms) full-text search over scanned rows, URL-persisted q param, with clear-search button and '/' focus + Escape-clear shortcuts
89. Search-term highlighting with <mark> in table cells when q is active
90. Filter sheet: district select, dependent station select, crime-head select, dependent subhead select, gravity, client-side status refine, date-range presets, explicit from/to date inputs with preset/custom handoff hint, anomalies-only checkbox
91. Atomic dependent filter clears (district drops station; head drops subhead; range preset vs explicit dates mutually exclusive)
92. Removable active-filter chips with per-chip remove and Clear all button (28px touch targets)
93. Active-filter count badge on the Filters toolbar button and inside the sheet
94. Saved filter presets: save named snapshot, apply, delete, overwrite-by-name, persisted in localStorage, re-read on every sheet open
95. Saved views v2: presets optionally capture visible columns + sort, applied together with the filters
96. Column chooser with locked identity/actions columns, per-column toggles, reset-to-default, persisted in localStorage
97. Client-computed case age column (days since registered, amber past 90d)
98. Row density toggle (shared DensityToggle) inside the Columns sheet
99. Sortable column headers with aria-sort; sort state persisted in the URL (?sort=key.dir)
100. Precision-safe sorting of 18-digit CrimeNos (lexical long-digit compare)
101. Honest 'sorts this page' hint when sorting rides server pagination
102. Rows-per-page selector (25/50/100/200) persisted in localStorage
103. Jump-to-page number input
104. CSV export of the current filter: pages through GET /cases up to 1000 rows, applies client refinements, respects the column chooser, UTF-8 BOM, timestamped filename, toasts, truncation notice, 'e' keyboard shortcut
105. Per-row quick actions with 40px mobile touch targets: star toggle, copy CrimeNo (clipboard API with execCommand fallback), open case
106. Starred cases: localStorage star set, toolbar Starred-only refinement with chip, star toggle on detail header
107. Recently-viewed cases chips row for one-tap return, with Clear
108. Row click opens case detail carrying the current URL filters and a sibling-id list in nav state
109. Collapsible filter-profile bar chart (cases by district/station/head, client-aggregated, theme-aware)
110. Color-coded segmented CrimeNo rendering in table cells with raw fallback; theme-safe segment colors in light mode and print
111. Anomaly flag column with pulsing red badge; anomaly-only deep-linkable filter (anomaly=1)
112. Gravity badge tinted red for heinous offences
113. 'scans newest 200' cap warning with explanatory tooltip when client refinements ride a larger server result
114. Background-refetch 'updating…' indicator (react-query placeholderData keeps previous rows)
115. Table loading skeleton rows, error state with retry, and context-aware empty messages with inline remediation chips
116. Fully shareable URL state for every explorer filter plus sort
117. document.title reflects match count on the explorer and CrimeNo on the detail page
118. Case detail: full-page loading skeleton and error state with Retry + back-to-cases link
119. Case detail header badges: status, gravity (heinous red), pulsing anomaly
120. Prev/Next sibling navigation with position indicator and ArrowLeft/ArrowRight shortcuts
121. Detail header actions: star, copy CrimeNo, copy shareable link, whitelisted JSON export, Print FIR
122. Anomaly callout card with reason text (fallback explanation) and link to the alert feed
123. CrimeNo anatomy card: 5 color-coded segments decoded (category, district, station, year, serial), CaseNo tail, format legend, malformed-format fallback
124. Registration grid: registered date, district, station, head, subhead, incident window (from → to)
125. Investigation lag KPI strip: report/arrest/chargesheet lags with amber threshold warnings
126. Case lifecycle timeline: Incident → Info at PS → FIR → Arrest → Chargesheet → Court stepper with day-gap lag analytics, tolerant of all payload key variants, horizontally scrollable on phones
127. Narrative insights panel: auto-runs POST /ai/narrative on mount, word-boundary-anchored entity highlighting in brief facts, entity chips with types, keyword chips, sentiment badge with score, Zia vs local-fallback source badge, Re-run button, loading/error/empty states
128. Incident mini-map: Leaflet + OSM tiles, styled circle marker with CrimeNo tooltip, coordinates subtitle, no-coordinates empty state, print-only coordinate text fallback
129. Parties panels (complainants/victims/accused) with per-person whitelisted fields, alias chips, count badges, empty states
130. Sections invoked table (act/section/description) with empty state
131. Arrests panel with arrest-specific fields; Chargesheet, Investigating Officer, and Court key-value panels with tolerant multi-key mapping and empty states
132. Next-hearing countdown badge on the Court panel
133. Similar-cases panel (same subhead/head + district) with sibling-carrying navigation
134. Single-case JSON export serializing only whitelisted rendered fields
135. Print stylesheet active on /cases/:id: light palette, flattened scroller, wrapping timeline, hidden interactive chrome
136. Caste/religion safety: whitelist-only rendering in PartyList/KeyValuePanel and whitelist-only JSON export so schema-fidelity fields never reach the UI or a downloaded file
137. Advanced boolean search syntax: implicit AND terms, a|b OR alternatives, -term NOT exclusion
138. Column-scoped search terms (district:/station:/head:/subhead:/status:/gravity:/no:/case:)
139. #id exact-CaseMasterID search token that also filters the table
140. Interpreted-query chips showing how the advanced search parsed (NOT terms tinted red)
141. Search-syntax help tooltip on the Interpreted eyebrow
142. Multi-term cell highlighting — every positive query term marked, OR alternatives both marked
143. Live CrimeNo decoder strip: an 18-digit query decodes all 5 segments with lookup-resolved district/station names
144. One-tap pivots from a decoded CrimeNo: filter that district, that station, or that registration year
145. 'Open this case' chip when a scanned row matches the typed CrimeNo exactly
146. '#id' open-case jump chip navigating straight to /cases/:id
147. 9-digit CaseNo-tail and wrong-length digit-format explainer hints under the search box
148. Pending-age filter (older than 30/90/180 days) in the filter sheet, URL-persisted with a removable chip and preset support
149. Scan-insights KPI strip: anomaly count+share, heinous share, median pending age, busiest month (collapsible, persisted)
150. Status-mix chips with counts and one-tap apply/clear of the status filter
151. Monthly registration-density chart with click-a-bar drill that sets that month as the from/to filter
152. Day-of-week registration profile chart with the peak day highlighted
153. Bulk-select compare checkboxes per row (cap 3) persisted in sessionStorage across detail round-trips
154. Sticky compare tray with removable case chips, Clear, and Compare button
155. Side-by-side compare sheet: per-field difference highlighting plus a plain-language verdict line (same district / crime pattern / registration span / anomalies)
156. Compare-sheet Open links carrying the compare set as prev/next siblings into the detail
157. 'c' keyboard shortcut opens the compare sheet
158. Row quick-look peek sheet (eye button): CrimeNo segments, full attributes, star/compare/copy/open actions without leaving the list
159. Keyboard-shortcut and search-syntax reference sheet ('?' key plus a toolbar icon)
160. Copy-shareable-view-link button (filters + sort + search encoded)
161. Copy the visible page as a Markdown table (respects the column chooser)
162. Server-side full-fidelity CSV download via GET /cases.csv with the active server filters (up to 5,000 rows; auto-hidden in the static demo)
163. Starred-outside-scan chips: starred cases invisible to the 200-row scan surface as direct-open chips
164. Similar cases v2 through the server pattern engine with a 0-100 similarity score and mini bar per row
165. Why-matched reason chips per similar case (same crime pattern / same station / similar hour of day / within N km)
166. Similar-cases engine badge with automatic client-side fallback when the endpoint is unreachable
167. Same-pattern-nearby overlay on the incident mini-map: ~5 km bbox of same-subhead incidents as teal dots, similar-engine matches amber, tap-to-open
168. Nearby-overlay toggle with live point count on the Incident location card
169. Map auto fit-bounds to the incident plus overlay cloud, with an on-card legend
170. Tile-error notice chip on the incident mini-map mirroring the GeoIntel offline pattern (closes the outstanding sharedRequest)
171. Incident time-band context chip (weekday, clock time, night/morning/afternoon/evening band) in the Registration card
172. Registration card gains Category and Info-received fields from the detail payload
173. Pivot chips on the detail: this station's cases, this district's cases, same crime head, same subhead, same registration year — straight back into the explorer
174. Lifecycle completion percentage progress bar in the Case lifecycle header
175. Days-in-current-stage pendency badge on the lifecycle card (amber past 60d)
176. Copy the sections-invoked list as chargesheet-ready text
177. Accused-to-offender-registry pivot: per-accused name/alias search link into /offenders?q=

## Alerts, Reports & Print Brief (97)

178. Alerts: anomaly feed with severity-rank default ordering (then |z-score|)
179. Alerts: severity filter chips (All/Critical/High/Medium/Low) synced to URL ?sev= for shareable views
180. Alerts: per-severity open-alert counts shown on filter chips
181. Alerts: global shared FilterBar filters (district / crime head / date range) persisted in URL via useUrlFilters
182. Alerts: group-by toggle (severity / district / date) rendered as labelled sections with count badges
183. Alerts: group-by and sort shareable via URL (?group= / ?sort=) with localStorage defaults
184. Alerts: sort control — severity | z-score | most recent
185. Alerts: text search over narrative/district/crime head (URL ?q=)
186. Alerts: unread-only filter toggle (URL ?unread=1)
187. Alerts: saved views — name/apply/delete filter+severity+group+sort combos as quick chips
188. Alerts: open vs acknowledged partition with separate Acknowledged section
189. Alerts: per-card Snooze 24h with collapsible Snoozed section and unsnooze
190. Alerts: header summary counts — open, acknowledged, unread
191. Alerts: overview strip — severity count chips + 14-day alert-volume sparkline
192. Alerts: live pulse indicator that switches to 'watching for anomalies' when notifications are on
193. AlertCard: severity badge with pulse, z-score badge, narrative, period range, observed-vs-expected figures
194. AlertCard: relative 'ended Xd ago' stamp with exact-date tooltip
195. AlertCard: red pulse-glow border escalation for critical/high severity
196. AlertCard: affected-stations chips resolved from lookups (single unit or district scope with +N more)
197. AlertCard: observed-vs-expected ECharts sparkline with expected ±2σ band, dashed expected line, red latest-period dot, and 'no history' fallback — theme-aware colors with an aria-label text alternative
198. AlertCard: sparkline legend caption explaining colors
199. AlertCard: View-on-map deep link to /map?districtId=
200. AlertCard: Copy-as-text button producing a WhatsApp-ready one-liner
201. Alerts: acknowledge with optimistic cache update, pending state, rollback on error, per-card inline retry hint, and friendly read-only-demo 403 toast
202. Alerts: static-demo acknowledge keeps the optimistic state for the session and explains it won't persist
203. Alerts: local unread tracking with 'new' indicator, persisted to localStorage (capped at 500 IDs)
204. Alerts: Mark-all-read button with accurate marked count, disabled at zero
205. Alerts: opt-in WebAudio two-tone chime on new anomalies (primed/previewed on enable, no audio asset)
206. Alerts: opt-in desktop notifications with permission flow, tag-deduped, hidden when API unsupported
207. Alerts: test-notification button (chime + sample desktop pop-up)
208. Alerts: 60s background poll while either notification channel is enabled
209. Alerts: new-anomaly detection that silently absorbs first load and filter changes before chiming
210. Alerts: client-side CSV export of the filtered alerts with dated filename, RFC-4180 escaping, and nothing-to-export guard toast
211. Alerts: keyboard shortcuts — j/k navigate, a ack, m read, s snooze, c copy, u unread, e CSV, / search, 1–4/0 severity
212. Alerts: mobile Options bottom sheet for group/sort/notification settings
213. Alerts: loading skeleton cards, error state with Retry, context-aware empty states (severity / search / unread / snoozed) with one-tap clear actions
214. Alerts a11y: aria-pressed toggles, role=group severity filter, radiogroups with arrow-key navigation, tooltips visible on keyboard focus, 44px touch targets on mobile
215. Reports: window picker (last 7 / last 30 days / custom from–to dates)
216. Reports: five brief-section toggles persisted to localStorage and carried to /print/brief via ?sections=
217. Reports: section reorder with persisted order carried via ?order=
218. Reports: 'Prepared by' officer stamp (persisted, in header and PDF via ?by=)
219. Reports: live print-styled brief preview (exact markup SmartBrowz captures) in a horizontal-scroll A4 container — no clipping at 360px
220. Reports: Generate PDF via POST /reports/weekly-brief that opens the SmartBrowz signed URL, detects popup blocking, and always keeps a Download PDF link
221. Reports: print-CSS fallback path that navigates to /print/brief?autoprint=1 when SmartBrowz is off
222. Reports: PDF error note with 'Open print view' recovery link
223. Reports: copy-to-clipboard plain-text share summary honoring section toggles
224. Reports: export brief as Markdown (.md) honoring toggles, order, prepared-by
225. Reports: per-section CSV exports (alerts / hotspots / risk stations)
226. Reports: flag-gated Email digest button with friendly flag-off 403 handling
227. Reports: 'Open print view' link and SmartBrowz / local-fallback source badge
228. Reports: Generate/Copy/Export disabled with inline hint when all sections are toggled off
229. Brief content: KPI stat boxes with deltas vs the prior window, top-8 open alerts table, top-6 hotspots table with resolved district names, top-5 co-offending communities, 3-month forecast table with model/MAPE, top-5 risk stations with drivers
230. Brief content: per-section loading / error / empty notes so one failed query never blanks the brief
231. Brief content: synthetic-data disclaimer header and caste/religion-never-used footer
232. PrintBrief: bare print route outside Layout with white A4 print CSS (@page, .no-print)
233. PrintBrief: ?window= validation (presets + custom ?from&to), ?sections=/?order=/?by=/?density= handling, and ?autoprint=1 that fires window.print() once after all queries settle (400ms layout delay)
234. PrintBrief: autoprint guard + Retry notice when every brief query failed
235. PrintBrief: compact/comfortable print density toggle honored by SmartBrowz captures via query param
236. PrintBrief: document title swapped while mounted so Save-as-PDF suggests a sensible filename, restored on unmount
237. PrintBrief: no-print toolbar with data-loaded status, N/5 section count, window-switch links carrying all params with aria-current, density toggle, Print/Save button, and Back-to-Reports link — 40px touch targets, no body-level horizontal scroll at 360px
238. Alerts: feed ⇄ triage-board view toggle (URL ?view=board, localStorage default, in mobile Options sheet too)
239. Alerts: kanban triage board with Open / Snoozed / Acknowledged status lanes and per-lane counts
240. Alerts: lane-header severity breakdown dots (critical/high counts per lane)
241. Alerts: compact board cards (severity, z, district, unread dot) honoring the feed's filters and sort
242. Alerts: board-card inline lane actions — Ack / Snooze / Unsnooze move cards between lanes
243. Alerts: per-alert detail bottom sheet (feed info button, board tap, or `o` shortcut)
244. Alerts: SVG z-score gauge with severity-threshold bands (2/3/4) in the detail sheet
245. Alerts: expected-vs-observed mini compare bars on every feed card and in the detail sheet
246. Alerts: escalation SLA countdown badges (critical 4h / high 12h / medium 24h / low 48h from first sighting)
247. Alerts: SLA warning (amber <25% remaining) and breached (pulsing red with overrun time) states with policy tooltip
248. Alerts: first-seen timestamps persisted to localStorage so SLA clocks survive reloads
249. Alerts: 'SLA breached' quick filter (?breached=1) with live count chip, header count, tailored empty state
250. Alerts: triage progress meter — segmented acked/snoozed/read share of the listed alerts with tooltip breakdown
251. Alerts: district roll-up chips clustering open alerts (count + crit/high dots), tap to set / clear the shared district filter
252. Alerts: alert-to-case drill — 'Cases →' per card and 'Open cases →' in the sheet, pre-filtered to district + crime head + period
253. Alerts: similar-alerts list in the detail sheet (same district or crime head) with in-place jump
254. Alerts: new keyboard shortcuts v (board view) and o (open details), help line updated
255. Reports: executive summary section auto-composed as prose from live KPIs, alerts, hotspots, network and forecast
256. Reports: editable executive-summary text with custom/auto badge, live word count, and reset-to-auto
257. Reports: custom summary carried into print view, PDF, Markdown and share summary (?exec= + persisted override)
258. Reports: methodology annex section — numbered notes on z-scores, hotspot clustering, forecast (live model + MAPE), risk scoring, networks, SLAs, data ethics
259. Reports: classification stamp selector (Unclassified / Internal / Confidential), persisted and carried via ?class=
260. Reports: color-coded classification banner in the brief header
261. Print: repeating confidentiality footer on every printed page (classification + synthetic-data notice + generated date)
262. Print: diagonal CONFIDENTIAL watermark on printed pages at the confidential level
263. Print: 'Page N of M' @page margin boxes for paged-media print engines
264. Brief: printed Coverage line (districts / open alerts / hotspot clusters / stations scored)
265. Brief: printed Contents line listing the enabled sections in their custom order
266. Reports: live row-count badges on the section toggle chips
267. Reports: copy-print-link button (absolute SmartBrowz-target URL carrying every builder param)
268. Reports: scheduled-delivery card (visual only) with weekly/monthly frequency, day and time pickers
269. Reports: recipient e-mail chips with validation, duplicate/cap guards and removal
270. Reports: schedule enable toggle with persisted schedule and human-readable summary sentence
271. Reports: computed next-run preview timestamp
272. Reports: 'Send test digest now' from the schedule card (reuses the flag-gated Catalyst Mail digest)
273. Reports: exec summary, annex and classification included in the Markdown export and clipboard share summary
274. PrintBrief: toolbar classification cycle button (URL-synced ?class=, persisted, red-accented at Confidential)

## Trends & Predict (Forecasting) (92)

275. Trends: hour x weekday seasonality heatmap with per-cell tooltip and low/high visualMap legend (theme-aware ramp)
276. Trends: monthly multi-line chart per crime head, top-6 heads with the rest folded into a dashed gray 'Other' series
277. Trends: festival-window shading (Ugadi/Dasara/Deepavali) as labeled markAreas on the monthly chart, real 2021-2026 dates
278. Trends: direct end-labels on monthly lines when <=4 series on desktop (dropped at narrow widths), scrollable legend otherwise
279. Trends: 24-month cap plus leading zero-month trim on the monthly chart
280. Trends: Lines | Calendar view switch - month x year heatmap alternate view of the monthly trend
281. Trends: 3-month rolling-mean smoothing toggle on the monthly lines
282. Trends: anomaly markers (trailing z-score |z| >= 2) with anomaly-summary insight sentence
283. Trends: per-lakh normalization toggle (populations derived from /geo/districts) on monthly chart and compare grid
284. Trends: YoY delta chip (latest month vs same month prior year) beside the monthly insight
285. Trends: category-share donut with count+percent tooltip, 'Other' fold, and click-to-filter by crime head
286. Trends: district comparison horizontal bars (top 14) with selected district highlighted solid vs faded rest, click a bar to set/clear the district filter
287. Trends: Cases vs Per-lakh metric toggle on the district comparison (SegmentedControl, 40px targets)
288. Trends: seasonal profile panel - calendar-month average bars with peak/trough insight
289. Trends: deterministic auto-insight sentence under each chart (peak window/night share, leader+MoM+festival delta, dominant head+concentration+fastest riser, leader vs state median, seasonal peak, trajectory)
290. Trends: auto-insights digest strip with 'rule-based / no LLM' badge, staggered fade-up, copy-all-to-clipboard
291. Trends: stacked category-mix-over-time area chart with Count vs Share-% toggle, PNG save, CSV export, error surfacing with Retry
292. Trends: multi-district x multi-head sparkline compare grid with URL deep-linking (cmpD/cmpH), anomaly dots, 3m delta badges, per-lakh normalization, CSV export
293. Trends: palette preference toggle (Standard vs CB-safe Okabe-Ito) persisted in localStorage with light/dark variants, applied to all charts
294. Trends: CSV export on all four core charts
295. Trends: PNG save (toolbox) on monthly and district charts
296. Trends: pinned views - save/restore/delete named URL states via Sheet, localStorage-backed
297. Trends: print stylesheet for a clean chart briefing
298. Trends: per-chart loading skeletons, error states distinct from empty with Retry buttons (in-body and header)
299. Trends: fully theme-aware charts (SURFACE/HEAT_RAMP tokens) - correct rendering in light mode
300. Trends: responsive 360px chart grids (containLabel bars, narrower labels, end-label suppression)
301. Shared FilterBar (district / crime head / date-range presets) persisted in URL search params, shareable+reload-safe, with Clear button and horizontal-scroll chip row on mobile
302. Predict: 30-day station-risk league table ranked by risk score with risk-bar visualization per row
303. Predict: percentile risk-tier badges (Severe/High/Guarded/Low) per station
304. Predict: station/district search box filtering the league
305. Predict: top-6 risk-driver chips that filter the league client-side (toggle on/off, 40px targets)
306. Predict: per-row driver chips (first 3 + '+N' overflow with title tooltip)
307. Predict: 'Show all N stations' / 'Show top 15' expander
308. Predict: league sortable by risk score (DataTable client sort with aria-sort)
309. Predict: row click opens the station's district on /map carrying the current shared filters; station name is a keyboard-accessible button
310. Predict: league CSV export (rank, station, district, risk, tier, drivers)
311. Predict: copy-to-clipboard top-5 risk briefing text
312. Predict: league error state with Retry, loading skeleton rows, search/driver-aware empty message
313. Predict: Karnataka risk choropleth (peak station risk per polygon) with click-to-filter and a theme-matched low/high gradient legend
314. Predict: district filter applied client-side to both league and risk map; FilterBar honestly shows district-only with an 'all crime heads' scope badge
315. Predict: live outcome prediction form (district, crime subhead grouped by head, gravity, hour band, victims, accused, sections, arrest-within-7d)
316. Predict: preset case-profile chips filling the form in one tap
317. Predict: probability gauge with semantic red/amber/teal zones, animated value, theme-aware chrome (light + dark)
318. Predict: predicted-class badge, model-source badge (QuickML live vs embedded logistic fallback via meta.source), ROC-AUC badge, A/C class probabilities line
319. Predict: what-if delta badge vs the previous prediction run
320. Predict: outcome panel pending/error/no-prediction-yet states with Retry; defaults snap to real lookup options if fixture ids are missing
321. Predict: caste/religion exclusion disclaimer text under the form
322. Predict: forecast explorer - district x crime-head monthly line with 80% CI band, dashed forecast continuation connected to last actual, 'forecast ->' markLine, theme-aware series colors
323. Predict: forecast model name + backtest MAPE badges, in-card district/head selects deep-linked via fd/fh URL params, custom Actual/Forecast/CI tooltip, error Retry, CSV export
324. App-wide: dark/light theme-aware ChartPanel (registered dappa/dappa-light echarts themes), lazy routes with error boundaries, offline banner, command palette
325. Trends: STL-style decomposition panel — observed+trend, seasonal, residual small-multiples with linked axis cursor (client-side 2x12 MA + calendar-month indices)
326. Trends: trend-strength and season-strength badges (Hyndman F-statistics) with plain-language tooltips
327. Trends: level-shift changepoint markers on the decomposition with signed % step labels (binary segmentation on SSE)
328. Trends: residual outlier dots (|z| >= 2 after removing trend and season) with per-dot tooltip
329. Trends: decomposition CSV export (observed/trend/seasonal/residual columns)
330. Trends: deterministic decomposition auto-insight (variance split, seasonal peak month, latest shift, residual standout)
331. Trends: YoY % calendar — third monthly view mode, each cell vs same month prior year on a diverging teal-falling/red-rising ramp
332. Trends: 'Level shifts' toggle chip drawing changepoint markLines on the monthly lines chart (coexists with anomaly flags)
333. Trends: changepoint insight sentence listing each detected shift and its step size
334. Trends: seasonality Heatmap|Profile toggle — weekday vs weekend average-cases-per-hour curves
335. Trends: seasonality quick-stat chips (busiest day, peak 3-hour window, weekend share)
336. Trends: socio-economic correlation scatter — rate per lakh vs district indicator, bubble area = population (joins /meta/socio with /geo/districts under current filters)
337. Trends: socio indicator switcher (urbanization % / literacy % / density / income index)
338. Trends: OLS regression line with live Pearson-r badge and strength wording
339. Trends: median-split quadrant lines with corner captions (high/low rate x high/low indicator)
340. Trends: click a scatter bubble to set/clear the shared district filter; selected district gets an ink ring, rest fade
341. Trends: socio auto-insight — correlation strength + district furthest above the fitted line
342. Trends: socio join CSV export (all five indicators + rate + population)
343. Trends: correlation-not-causation method note on the socio card
344. Trends: crime-mix radar — district's per-head share profile vs the Karnataka baseline
345. Trends: radar comparison overlay picker (second district traced in a third hue)
346. Trends: crime-mix over/under-index auto-insight (largest ratio vs state share)
347. Trends: radar CSV export of the share profiles
348. Trends: district similarity finder — on-demand cosine similarity over per-head profiles with fetch progress counter and top-5 ranked bars
349. Trends: clicking a similarity result overlays that district on the radar
350. Predict: client-side 6-month holdout backtest chart — seasonal-naive, drift and 3-month-mean challengers vs actuals with shaded never-seen holdout
351. Predict: backtest scoreboard (MAPE / MAE / signed bias per model, best highlighted, server model MAPE badge for comparison)
352. Predict: backtest holdout CSV export and honesty footnote (single holdout, not cross-validation)
353. Predict: scenario planner — ±30% uplift slider scaling the 6-month forecast and its 80% band without re-running the model
354. Predict: scenario preset chips (festival surge +12%, awareness drive −10%, monsoon lull −5%) plus reset
355. Predict: scenario impact stats — base total, scenario total, additional/avoided cases with semantic coloring
356. Predict: risk-score distribution histogram above the league, bins colored by percentile tier with min/max scale and per-bin tooltips
357. Predict: per-station 6-month case-trend sparkline column in the risk league (uses the previously unused spark field)
358. Predict: station dossier drawer — tier, league percentile, rank, risk bar vs league max
359. Predict: drawer 6-month trend sparkline with 3-month delta chip
360. Predict: rank-ordered driver importance bars in the drawer with an honest 'ranking, not coefficients' note
361. Predict: district context block in the drawer (rank among district stations, district mean risk, above/below gap)
362. Predict: copy-station-brief action in the drawer + open-on-map handoff
363. Predict: model cards sheet — purpose/inputs/method/metrics/caveats card per model (station risk, outcome classifier, forecast), fairness note included
364. Predict: outcome sensitivity sweep — six measured counterfactual rescorings rendered as a tornado (teal raises detection probability, red lowers)
365. Predict: biggest-lever insight sentence under the tornado
366. Predict: outcome run-history strip — session log of scorings with time, probability, class, source tooltip, per-run delta and clear

## GeoIntel Map (109)

367. Full-bleed Leaflet map of Karnataka (OSM tiles, zoom control bottom-right, zoomSnap 0.25, min/max zoom bounds)
368. Dark-theme tile treatment via CSS invert/hue-rotate filter under html.dark; light theme keeps plain OSM
369. Six toggleable layers as chip buttons: choropleth, incident heat, incident points, hotspots, stations, alert pulse (aria-pressed, hint tooltip on incident points)
370. Layer toggle state persisted in zustand across route navigation and mirrored to localStorage across sessions (prefs.js)
371. URL-synced layer state (?layers=) so a pasted link reproduces the exact map composition
372. One-click layer presets: Command / Patrol / Analyst with active-preset highlight
373. Playback speed preference (0.5x/1x/2x) persisted to localStorage
374. District choropleth colored by the active metric with hover tooltip (name, formatted value, drill hint) and amber hover-highlight stroke
375. Choropleth metric switcher: total cases / cases-per-lakh / MoM change / mean station risk, with legend + tooltips tracking the metric
376. Diverging month-over-month choropleth mode (teal down / red up, server momDeltaPct)
377. Top movers strip: 3 biggest MoM swings with click-to-fly + drill
378. Theme-aware choropleth palette: dark and light ramps, zero-fill, strokes and legend gradients
379. Choropleth + heat opacity sliders persisted in prefs
380. District polygon click drills into a station list panel and flies the map to the polygon bounds
381. Alert-pulse overlay: animated red stroke/fill on districts flagged alert (non-interactive pane)
382. Incident heat layer (leaflet.heat) with 4-stop gradient, driven by up to 2000 incident points
383. Individual incident circle markers appear only at zoom >= 12, capped at 600, each with popup card (crime head name via lookups, registered date, deep link to /cases/:id)
384. Hotspot cluster circles sized by radiusM (300m floor), colored by relative intensity band, popup with case count, intensity, and peak hour band annotation
385. Hotspot hour-band filter chips (Night / Day / Evening) filtering both chips and map circles
386. Station bubbles sized by sqrt(caseCount), colored by 3-band risk color, hover tooltip with cases + risk score
387. Selected-station highlight (larger radius + theme-aware ring) synced with the drill panel
388. Always-on city commissionerate markers at pinned coordinates with tooltip (name + case count) and click-to-drill
389. Ranked top-10 hotspot chips row (ul/li/button semantics) with rank number, label, district name, case count, relative score bar, and hour band; click flies to the cluster, force-enables the hotspot layer, and opens its popup; selected chip highlighted; stale selection auto-cleared on refetch/filter change
390. Hotspot chips loading skeleton row and error chip with retry
391. Month time-scrubber slider (0 = whole filter window, 1..N = individual months, last 24 months max) that re-windows the incident heat layer per month
392. Play/pause month animation with speed-scaled interval
393. Loop on/off toggle with auto-pause at the final month when loop is off (persisted)
394. Speed-cycle button (0.5x -> 1x -> 2x)
395. Large translucent month-label overlay on the map while the animation plays
396. Scrub month mirrored to the URL as ?m=YYYY-MM and applied from a deep link on cold load (auto-enables heat layer; race-free)
397. Auto-enable of the heat layer when scrubbing or pressing play
398. Scrubber status readout: current month label, month N/M position, loading indicator, aria-valuetext on the range input
399. placeholderData on the incidents query so the previous month's heat stays on screen while the next month loads
400. Locate search combobox over 38 pinned police units + currently loaded stations: keyboard nav, active-option highlight, clear button, no-results message, ARIA combobox/listbox roles
401. Locate search fuzzy subsequence matching and last-5 recent picks shown on empty focus (localStorage)
402. Picking a locate result flies the map and opens the matching district/station drill (city units get point-fly at zoom 11)
403. Fullscreen map mode: toolbar button with tooltip + F keyboard shortcut (input-focus guarded)
404. Layered Escape handling: help overlay > measure tool > open popup > drill panel > fullscreen; inputs keep their own Esc
405. Keyboard shortcuts: Space play/pause, ArrowLeft/Right month step, / focuses locate search, '?' shortcuts help overlay
406. Reset view chip that flies back to the full Karnataka framing
407. Shared URL-persisted FilterBar (district / crime head / date range) overlaid on the map; all layers refetch on filter change
408. Scrub index clamped when a filter change shrinks the month list
409. Loading chip while any base layer is loading
410. Per-source error chips with retry for choropleth, stations (only when layer on), and incident layer; GeoJSON failure shows a compact EmptyState with retry while the base map keeps working
411. Basemap on/off toggle and tile-error notice chip with one-click blank-basemap fallback for offline demos
412. Collapsible desktop legend bar (metric-aware density ramp, station risk colors, commissionerate, incident point, anomaly pulse dot) with metric chips + opacity sliders
413. Desktop right side panel, district mode: unit chips, station list sorted by case volume with per-station risk bars, station/case totals, loading skeleton, error + retry, no-stations empty state
414. District drill 12-month trend sparkline (per-unit trends fan-out, summed)
415. District drill day-of-week x hour seasonality heat-strip (per-unit fan-out, merged matrix)
416. Desktop right side panel, station mode: KPI tiles (cases in window, 30-day risk score with color + label), risk driver chips, recent 8 cases with anomaly badges and deep links, 'Open explorer' link carrying the district filter, total-in-window count, loading/error/empty states
417. Recent-cases status quick-filter chips inside the station drill
418. Station pin-to-compare: two pinned stations render side-by-side KPI columns (cases, risk, drivers) in the panel
419. Back-to-district navigation from station drill and close button on the panel
420. District drill fans out one /geo/stations query per police unit (1-3 units per census polygon)
421. Station drill drops the district filter so a station outside the filtered district still shows its cases
422. Saved views: name/apply/delete camera + layers + metric + filters + scrub month (localStorage)
423. Copy-share-link toolbar button (filters + layers + month) with copied-toast
424. CSV export menu: visible stations / hotspots / incident window with filter+month-stamped filenames and row counts
425. Two-click measure tool with km label, Esc exit, and drill-click suppression while measuring
426. Metric scale bar + click-to-copy cursor coordinate readout
427. Print briefing mode: print rules reduce the route to map + legend + print-only header with active filters and month
428. Mobile (<md) swipeable docked bottom sheet: collapsed peek shows the compact time scrubber, expanded shows drill panel or locate search + hotspot band filter + top hotspots + display controls (metric + opacity) + legend grid; swipe gestures, tap handle toggle, aria-expanded, safe-area padding
429. Sheet auto-opens when a drill is triggered from the map
430. Auto-drill + fly on arrival with ?districtId= (e.g. from the dashboard choropleth), re-armed when the filter clears
431. Deterministic layer z-ordering via seven custom Leaflet panes
432. Fly-to commands execute exactly once per seq: polygon flights wait for GeoJSON, completed point/hotspot flights never replay
433. ResizeObserver calls map.invalidateSize() so sidebar collapse and window resize never leave dead tiles
434. HTML-escaping helper applied to all string-built tooltip/popup content (XSS-safe against odd fixture strings)
435. Leaflet popups and tooltips restyled to follow the app theme via CSS variables
436. 40px touch targets on coarse pointers for all primary overlay controls (layer/preset/hotspot/band/metric chips, scrubber + toolbar buttons, locate box, sheet handle)
437. Hour-of-day lens: 0-23 scrubber filters hotspot clusters by HourBandStart/End coverage (wrap-aware)
438. 24-hour play sweep animating hotspot activity across the day (900ms/hour, wraps at midnight)
439. Day/night basemap auto-dim during hour-lens night hours (19-06), distinct dusk filters for light and dark themes
440. Hour lens deep-linked as ?h= so share links reproduce the exact spatiotemporal view
441. Sun/moon + day-part indicator with live active/total hotspot count readout on the hour scrubber
442. H keyboard shortcut toggling the hour lens
443. Hotspot cluster detail drill panel (third drill mode): cases, intensity, radius-km KPI tiles and peak hour band
444. 24-hour district activity histogram in the cluster panel with the cluster's peak band highlighted
445. Nearest-station readout with haversine distance and one-click jump into that station's drill
446. Incidents-within-cluster-radius stat (count + dominant crime head) computed against the loaded incident window
447. Single-cluster GeoJSON export button in the hotspot panel
448. Numbered rank badges (1-3) rendered on the map at top hotspot centroids, synced with the chip ranking
449. Patrol-route suggestion: nearest-neighbour-ordered dashed polyline connecting the top-3 visible hotspots
450. Numbered patrol stop markers with leg-distance tooltips
451. Patrol summary pill: ordered stop chips, per-leg km, total km and drive-time estimate at 30 km/h
452. Copy-patrol-route-as-text action (ordered stops with coordinates and legs) for shift briefings
453. Patrol route respects the hour-band and hour-lens filters (a night band yields a night patrol route)
454. P keyboard shortcut toggling the patrol route
455. A/B month compare mode: second leaflet.heat layer for month A, canvas clip-path split against the current month
456. Draggable swipe divider with A/B month label chips and a grab handle
457. Compare strip: month A/B pickers, swap button, incident-count delta readout with signed percent and up/down colour
458. C keyboard shortcut with one-click vs-previous-month compare setup (auto-enables the heat layer)
459. District multi-select mode: polygon clicks build a spatial selection instead of drilling (lasso fallback)
460. Primary-coloured selection outline on selected polygons with select-aware hover tooltips
461. Selection summary bar: district count, aggregate cases, share-of-state percent
462. Focus-selection action flying to the combined bounds of all selected polygons (new multi-polygon fly command)
463. Selection CSV export (district, cases, sharePct) plus removable per-district chips and clear-all
464. Risk-halo layer: pulsing red rings on stations with predicted risk >= 70, reduced-motion aware, persisted across sessions
465. Red-zone tour button cycling fly-throughs of anomaly-flagged districts with a position counter
466. GeoJSON FeatureCollection exports (hotspots / stations / incidents) added to the export menu alongside CSV
467. Radius probe tool: click-to-place probe with live incident count, dominant crime head and density per km2
468. Probe radius +/- adjustment (0.5-25 km) with live circle redraw; probe force-enables the incident fetch
469. Click-to-jump monthly histogram bars above the time scrubber slider with current-month highlight
470. Copy-text situational brief (scope, top-3 hotspots with peak bands, top MoM movers, red-zone districts, layer counts)
471. M keyboard shortcut for the measure tool plus extended layered-Esc handling (probe, selection, compare)
472. Saved views now also capture and restore the hour lens, hotspot band filter and risk-halo state
473. Hotspot hour-band filter persisted to localStorage across sessions
474. Legend entries for the patrol route line and high-risk halo ring
475. Mobile sheet Tools section: hour lens (compact scrubber), patrol route pill, risk halos and red-zone tour at 360px

## Network Graph, Offenders & Offender-360 (105)

476. Network: Cytoscape co-accused graph — node color = community, node size = degree, edge width = shared-FIR weight
477. Network: theme-aware graph styling that restyles live on light/dark toggle
478. Network: layout switcher (Force/Rings/Grid) persisted to localStorage
479. Network: district filter via shared FilterBar, URL-synced, with unit-code→district-name resolution
480. Network: min-degree slider (1–8), URL-synced
481. Network: edge-tier checkboxes (1 case / 2 cases / 3+ cases) with explanatory tooltips
482. Network: bridge-edge toggle (hide cross-community links)
483. Network: community picker dropdown with members/cases/districts stats per group
484. Network: community chip strip (top 8) with click-to-isolate/un-isolate
485. Network: community detail summary while isolated (members/cases/districts/density + fly-to member list)
486. Network: node search combobox with autocomplete, ArrowUp/Down/Enter/Escape keyboard navigation and full ARIA wiring
487. Network: fly-to animation on search pick / deep-link focus
488. Network: Fit-to-view button and zoom + / − buttons
489. Network: keyboard shortcuts (/ find, 0 fit, + − zoom, Esc clear) with Legend hints
490. Network: PNG export of the graph at 2x with theme-resolved background + toast feedback
491. Network: CSV export of visible nodes + edges (two files)
492. Network: copy-view-link button
493. Network: saved views (name/save/apply/delete the URL state, localStorage)
494. Network: node-label visibility toggle, persisted
495. Network: neighbor-focus highlight toggle (dim non-neighbors of the selection), persisted
496. Network: ego-focus mode with 1/2/3-hop depth segmented control, URL-synced, exit button, teal ego ring
497. Network: shortest-path tool (two person selects, hop-count badge, clickable path breadcrumb, clear button)
498. Network: path highlight on graph with everything else dimmed
499. Network: node drawer — stats, aliases, MO tags, districts (enriched via GET /offenders/:key), Offender 360 link, isolate-group, ego-focus, set-as-path-A/B, add-to-compare
500. Network: edge drawer — endpoint chips, shared-case list linking to /cases/:id
501. Network: selected edges visibly highlighted on the graph
502. Network: stale drawer selections auto-close when filters remove the element
503. Network: desktop persistent selection panel vs mobile bottom Sheet (Esc/overlay close, focus restore)
504. Network: stats bar (people/links/components/groups) with district / isolated / capped / ego-missing badges
505. Network: node cap at top 400 by degree with badge
506. Network: Top connectors panel (top 10 by degree, click = select + fly-to)
507. Network: deep link ?communityId=&focus= from Offenders/Offender360 with one-shot auto-select + fly-to after layout
508. Network: legend panel (community colors, size/width/ring encodings, gesture + keyboard hints) with show/hide persisted
509. Network: loading skeleton, error state with Retry, empty state with Clear-graph-filters action
510. Network: pinch-zoom/pan touch support (touch-action none) and ResizeObserver canvas resize
511. Network: accessible name on the graph canvas with keyboard-equivalent paths (search + Top connectors)
512. Offenders: registry table with sticky first column and horizontal scroll
513. Offenders: free-text search across name/personKey/aliases/MO tags, URL-synced (q)
514. Offenders: risk-band segmented filter (All/High/Med/Low), URL-synced
515. Offenders: risk-band distribution strip (proportional bar + count chips that apply the band filter)
516. Offenders: MO-tag multi-select filter chips (URL-synced 'mo', AND semantics, per-tag counts)
517. Offenders: repeat-only (≥3 cases) toggle, URL-synced plus localStorage default for fresh visits
518. Offenders: full-filtered-set column sorting (name, cases, risk) with aria-sort
519. Offenders: client-side pagination (25/page) with range footer, Prev/Next and shrink-safe page clamping
520. Offenders: CSV export of filtered+sorted rows (BOM, proper escaping) with toasts for success/empty
521. Offenders: copy-view-link button
522. Offenders: table density toggle (shared DensityToggle)
523. Offenders: compare tray (up to 3) with name chips, per-chip remove, Clear, capacity toast, persisted in localStorage
524. Offenders: compare bottom sheet — side-by-side metric table with per-person enrichment fetches and skeleton cells
525. Offenders: compare sheet best/worst highlighting (max risk red tint, max cases/degree amber tint)
526. Offenders: row click navigates to Offender 360; canonical-name cell is a real keyboard-accessible Link
527. Offenders: community chip per row deep-linking into Network Explorer with focus
528. Offenders: 'top 200 by risk loaded' truncation badge (compact on mobile)
529. Offenders: recently-viewed offender chip row with Clear
530. Offenders: loading skeleton rows, error+Retry, context-aware empty messages (search vs repeat-only vs MO tags vs filters)
531. Offender360: header with back link, canonical name, personKey, add-to-compare, print-dossier and community deep-link buttons
532. Offender360: identity card with ECharts risk gauge, risk percentile vs loaded registry, fact tiles (cases, districts, degree, first/last seen)
533. Offender360: cases-per-year activity sparkline in the identity card
534. Offender360: alias chips with identity-resolution provenance note
535. Offender360: operating-area mini choropleth with per-district markers decoded from CrimeNo digits
536. Offender360: chronological district-hop sequence (consecutive duplicates collapsed)
537. Offender360: MO signature badge list with empty state
538. Offender360: known-associates list (top 8 by shared cases) with registry name enrichment and links
539. Offender360: mini ego graph (depth-1, tap an associate to open their profile)
540. Offender360: case timeline sorted most-recent-first with year group headers, status/district chip filters, outcome badges, /cases/:id links guarded against missing ids
541. Offender360: printable dossier via @media print stylesheet (ink-on-white token remap, chrome hidden)
542. Offender360: recently-viewed push into the /offenders chip row
543. Offender360: loading skeletons and 404-aware error state with Retry + back link
544. Shared: RiskBadge / OutcomeBadge / MoChips tone-coded chips reused across the three views
545. Network: Tree (hierarchical org-chart) graph layout, rooted at each component's highest-degree connector
546. Network: Bridges toolbar toggle — highlights cross-community links and broker people (dashed amber) while dimming the rest, persisted
547. Network: 'no bridge links in view' honesty badge when the toggle finds nothing under current filters
548. Network: node drawer bridge context badge (bridges N other groups · M cross-links, computed on the full graph)
549. Network: node drawer cut-vertex badge via articulation-point detection ('removal splits the group')
550. Network: node drawer watchlist star toggle with capacity toast
551. Network: watchlisted people render as diamond nodes on the graph + legend note
552. Network: Watchlist sidebar panel — fly-to for in-view members, muted 'not in view' rows, per-row unstar
553. Network: edge drawer link-strength tier badge (single link / repeat pair / strong tie)
554. Network: edge drawer mutual-associates chips (common neighbors of the pair, tap to open their panel)
555. Network: graph density % and average-degree stats in the stats bar with explanatory tooltips
556. Network: degree-distribution histogram (1..8+) in the Legend card
557. Network: shortest-path swap-ends (⇄) button
558. Network: shortest-path evidence-strength badge (Σ shared FIRs across the hops)
559. Network: community summary now shows top-5 member MO tags and a fly-to 'key connector' (most cross-community links)
560. Offenders: KPI tile strip — loaded offenders, high-risk (≥70), cross-district, watchlisted (loading-aware)
561. Offenders: per-row watchlist star column (toggle without leaving the table)
562. Offenders: watchlist-only filter chip, URL-synced (watch=1), with watch-aware empty state
563. Offenders: cross-jurisdiction filter chip (2+ districts), URL-synced (span=multi)
564. Offenders: district-span dot indicator in the Districts cells (hover lists district names)
565. Offenders: Aliases and Districts columns now sortable by count
566. Offenders: MO co-occurrence matrix card — cell intensity = offenders carrying both tags, cell click applies the pair as an AND filter, collapsible + persisted
567. Compare drawer: per-offender activity-by-year sparkline row
568. Compare drawer: direct-links row showing shared-FIR co-accused links between the compared people
569. Compare drawer: common-associates footer row (people co-accused with 2+ of the compared set, linked)
570. Compare drawer: MO tags shared by 2+ compared offenders highlighted amber
571. Offender360: watchlist star toggle in the header + '★ watchlisted' badge
572. Offender360: copy-profile-link button
573. Offender360: cross-jurisdiction badge (spans N districts, hover lists them)
574. Offender360: prev/next risk-rank navigation through the loaded registry (← higher risk / lower risk →)
575. Offender360: alias-resolution confidence percentages on alias chips (heuristic name-similarity, tooltip-explained)
576. Offender360: Behavioral tempo card — days since last case, median inter-case gap, active span, last-12-mo vs prior-12-mo escalation delta
577. Offender360: Case-mix card — crime-head distribution with proportional bars
578. Offender360: associate rows enriched with risk badges and watchlist stars
579. Offender360 timeline: crime-head filter chips (third chip group)
580. Offender360 timeline: dormancy markers flagging 12+ month gaps between consecutive cases

## DAPPA Copilot & About (73)

581. Copilot: chat with user/assistant bubbles, distinct styling (amber user bubbles right-aligned, avatar on assistant)
582. Copilot: relative per-message timestamps (just now / N min ago) with absolute time tooltip, 60s ticker
583. Copilot: animated typing indicator while a query is pending, with sr-only live 'DAPPA is thinking' announcement
584. Copilot: aria-live role=log conversation region announcing new answers to screen readers
585. Copilot: theme-aware ECharts chart block inside answers (bar/line/pie, dappa/dappa-light palettes) with defensive payload validation
586. Copilot: chart PNG export with theme-matched opaque background (client-side)
587. Copilot: chart bar⇄line type toggle
588. Copilot: chart data-table toggle (accessible table) and CSV export
589. Copilot: 'Explore in Trends' link under monthly-series charts
590. Copilot: collapsible 'Show ZCQL' reveal with copy-ZCQL button (keyboard accessible)
591. Copilot: copy-answer-to-clipboard button with toast feedback and execCommand fallback
592. Copilot: Regenerate button on assistant answers (re-asks in place)
593. Copilot: engine provenance badge per answer (QuickML RAG / deterministic parser / static demo; unknown engines shown verbatim) and last-engine badge in header
594. Copilot: response latency chip per answer, included in transcript exports
595. Copilot: 8 suggested-question chips in the empty state (pinned questions first, 44px targets)
596. Copilot: horizontally scrollable suggestion chip carousel above the input (pinned-first, 40px chips/arrows, touch scroll)
597. Copilot: pinned questions — star on user bubbles/chips, persisted to localStorage, unpinnable
598. Copilot: recent-questions section in the empty state from persisted history, with clear-history
599. Copilot: transcript export menu — .txt, .md, .json (timestamps, ZCQL, engine, latency, synthetic-data disclaimer)
600. Copilot: conversation persistence across navigation (localStorage, capped) with 'New chat' reset that keeps input history
601. Copilot: share-question deep link per user bubble (HashRouter-safe, auto-asks on open)
602. Copilot: shell-style input history recall via ArrowUp/ArrowDown, draft restore, persisted (cap 50)
603. Copilot: keyboard shortcuts — '/' focus, Esc stop-voice/blur, hint line under input
604. Copilot: voice input via webkitSpeechRecognition (en-IN), hidden when unsupported, listening pulse, aria-pressed, per-code error toasts, abort on unmount
605. Copilot: dismissible disclaimer banner (decision support, not decisions), dismissal persisted, 40px dismiss target
606. Copilot: auto-send of ?q= URL param from the Dashboard omnibox — queued when a request is in flight, re-armed after New chat, deduped per distinct value
607. Copilot: error bubble with message and Retry button that replaces the failed bubble in place
608. Copilot: empty state with title/message and clickable starter questions
609. Copilot: auto-scroll to newest message, smooth
610. Copilot: send button disabled while pending or input empty; 'Thinking…' label while pending
611. Copilot: input autofocus on fine-pointer devices only (no soft-keyboard pop on mobile), aria-label, 'Listening…' placeholder during voice capture
612. Copilot: duplicate-suppression in input history (no consecutive repeats)
613. Copilot: tooltips on Export/New chat/mic/pin/share/regenerate buttons
614. Copilot: print stylesheet — clean white Q&A record with ZCQL expanded on Ctrl+P
615. Copilot: mobile-safe chat shell height (accounts for bottom tab bar at <md, no outer scroll at 360px)
616. About: project story card with 4-step Generate/Precompute/Serve/Decide flow
617. About: quick stats tiles (routes, tables, live services computed from data, external services)
618. About: external links card (live Catalyst demo, GitHub Pages mirror, source repo) with accent styling and per-link copy-URL buttons
619. About: sticky in-page anchor nav with smooth scroll to six sections
620. About: pure-CSS architecture diagram (tiers + arrows with flow labels)
621. About: Catalyst services matrix (18 services) with All/Live/Roadmap filter chips and computed live count; roadmap items dimmed with badge
622. About: data-ethics card (synthetic data, caste/religion exclusion, human-in-the-loop, read-only demo)
623. About: team & credits card — TEAM constant rendering initial-avatars when filled, graceful 'Team Rainfall' card while empty (no placeholder artifacts); tech-stack chip list
624. About: prototype / 100%-synthetic-data badges in the header
625. Copilot: source citation chips per answer — Data Store tables parsed from the answer's ZCQL, each with a data-dictionary tooltip
626. Copilot: 'Explore in <route> →' deep link on cited tables (AggMonthly→Trends, AnomalyAlert→Alerts, HotspotCluster→GeoIntel, StationRisk/ForecastMonthly→Predict, OffenderProfile→Offenders, ChargesheetDetails→Cases)
627. Copilot: per-answer confidence badge (Exact aggregate / Modelled estimate / Unmatched) with a method-explanation tooltip
628. Copilot: 'Understood as' intent chip surfacing the parser's intent classification on every answer
629. Copilot: 'How this was answered' collapsible pipeline reveal — parse → intent → query → template, filled with the answer's actual values
630. Copilot: contextual follow-up chips under the newest answer (crime/district extracted from the question, intent-specific next steps, always grammar-parseable)
631. Copilot: unmatched answers render the server's suggested rephrasings as clickable chips inside the bubble
632. Copilot: question-history panel (header button, bottom sheet) with the full persisted history
633. Copilot: search filter inside the history panel
634. Copilot: pin/star toggle per question in the history panel
635. Copilot: per-question delete plus clear-all in the history panel
636. Copilot: compare mode — pick any two answers via a per-bubble Compare toggle, with a live selection status bar
637. Copilot: side-by-side compare sheet (question, answer, chart, engine/confidence/latency/source chips and ZCQL per pane; stacks on mobile)
638. Copilot: swap-panes button in the compare view
639. Copilot: read-answer-aloud via SpeechSynthesis (en-IN) with stop toggle, hidden when unsupported, cancelled on unmount/new chat
640. Copilot: jump-to-latest floating button when the reader scrolls up in the chat
641. Copilot: session stats chip in the header (questions asked, average latency; engine-mix breakdown in tooltip)
642. Copilot: copy-answer-as-Markdown button (question, answer, provenance line, fenced ZCQL)
643. Copilot: transcript exports (.txt/.md/.json) enriched with confidence, intent and cited source tables
644. Copilot: 'What can I ask?' capability guide in the empty state — 13 question families with clickable guaranteed-to-answer examples
645. About: datathon challenge-coverage matrix — the 6 scored capabilities mapped to app areas with deep-link route chips
646. About: '6/6 covered' summary badge and per-capability live badges
647. About: data-lineage strip (generate.py → bulk_load.js → analytics.py → dappa_api → React SPA) in pure CSS, responsive
648. About: AI degradation-design explainer — live path vs deterministic fallback for each AI feature
649. About: accessibility statement card covering keyboard, touch targets, screen readers, chart-table equivalents, contrast and motion
650. About: embedded keyboard-shortcut reference (global, go-to and copilot-local keys)
651. About: tech stack regrouped into layered groups (Frontend / API & data / Analytics & ML)
652. About: anchor nav extended to 11 sections covering the new content
653. About: scroll-spy active-section highlighting in the sticky anchor nav (IntersectionObserver)

## App Shell, Design System & Accessibility (83)

654. Collapsible grouped desktop sidebar (5 groups, 13 routes) with collapsed icon-only mode + tooltips, collapse state persisted across reloads
655. Mobile bottom tab bar (4 primary tabs + More) with active indicator bar and safe-area padding
656. Mobile More sheet listing remaining routes plus Theme (dark/light/auto), table density, and reduce-motion controls (44px targets)
657. Command palette (Ctrl/Cmd-K) with fuzzy search over routes + actions, full keyboard nav, result count footer, focus restore
658. Command palette actions: theme toggle + system theme, density, sidebar, zen mode, reduce motion, copy link, refresh data, shortcuts help
659. Command palette Recent section (last 5 executed actions, persisted) and hidden-until-typed district filter jumps + clear-all-filters
660. Dark/light/auto (system) theme with pre-paint no-flash script, localStorage persistence, meta theme-color sync, animated cross-fade honoring reduced motion
661. Table density toggle (cozy/compact) with single source of truth in the shared store — all instances + palette stay in sync; pre-paint applied; drives --density-y
662. URL-persisted shared filters (district / crime head / date-range presets) carried across routes by all nav links, with Clear button
663. Active-filter chips row with per-chip clearing, labels resolved via lookups
664. Saved filter views: save/apply/delete named filter combos from the FilterBar Views sheet
665. Live API health pill polling every 60s (Live / Checking / API down); dot-only variant on mobile
666. Live active-alerts count badge (clamped at 99+) on Alerts nav items, pulse dots on collapsed sidebar and mobile More tab
667. Document title sync per route with (N) active-alert prefix
668. Offline/online connectivity banner with transient back-online confirmation
669. Toast notification system (success/error/info) with tone icons, aria-live viewport, max-4 stacking, longer error duration, no timer leaks
670. Per-route ErrorBoundary keyed by pathname with Retry — no white screens
671. Route-level code splitting with page-shaped Suspense skeleton fallback
672. 404 NotFound route with back-to-dashboard link
673. Skip-to-content link that works under HashRouter (JS focus, no route hijack)
674. Scroll reset to top on every route change (search-param edits don't jump)
675. Back-to-top floating button on the inner scroller, reduced-motion aware
676. Global keyboard shortcut layer (g+letter go-to, t theme, f zen, ? help sheet) paused while typing or in dialogs
677. DataTable: client/server sorting with aria-sort, server pagination footer, row click, sticky first column, skeleton rows, empty state, density-aware padding
678. DataTable CSV export of visible rows (default on) and opt-in client-side quick filter
679. ChartPanel: ECharts wrapper with registered dark + light themes (re-instantiates on swap), loading/empty states, exported DAPPA palettes
680. ChartPanel PNG download (theme-correct background) and fullscreen expand overlay on every chart
681. MiniChoropleth Karnataka Leaflet choropleth with theme palettes, alert-pulse outlines, city markers, hover/click, HTML-escaped tooltips, skeleton + retry
682. KpiTile with en-IN value, StatDelta chip (positiveIsGood flip, sr-only direction), accent hairline, pulse dot, hint, skeleton, optional SVG sparkline
683. Badge status pill (5 tones, optional pulse)
684. Tabs with tablist semantics, roving focus, badges, 44px targets, horizontal scroll
685. SegmentedControl radio-group with arrow keys (36px sm / 44px md targets)
686. Sheet modal (bottom sheet mobile / floating card md+) with Esc + overlay close, focus move/restore, focus trap, background scroll lock, drag handle, sticky header
687. Focus trap + scroll lock shared helpers applied to every dialog (Sheet, palette, chart overlay)
688. CSS-only Tooltip on hover and keyboard focus, 4 positions
689. EmptyState and LoadingSkeleton primitives (compact mode, line/block variants)
690. PulseDot animated alert indicator (3 colors)
691. Global focus-visible outline, themed scrollbars, ::selection tint
692. prefers-reduced-motion collapse plus in-app reduce-motion override (persisted, pre-painted)
693. Print: full-page Ctrl+P of any route (scroll-chain unclamped), A4 @page, /print/brief bare route
694. Print-only header on every view: crest, view name, filter summary, IST timestamp, synthetic-data notice
695. Zen / wall-display mode hiding sidebar + disclaimer (persisted, f key, palette, topbar exit)
696. Data freshness indicator + refresh-all control in topbar
697. IST session clock in desktop topbar
698. Copy-link-to-view with filters included
699. Static-demo API mode with snapshot fallback chain and DEMO_MISS messaging
700. PWA manifest + SVG favicon + OG/meta tags (relative og:image removed)
701. Synthetic-data disclaimer banner
702. Persisted UI store: sidebar collapse, GeoIntel map layers (default-merged), zen mode
703. en-IN number/percent/date formatters with em-dash fallbacks (fmtPct now percent-by-default, fraction opt-in) plus describeFilters summary helper
704. React-query caching (60s staleTime, lookups 1h, geojson forever) with abort-signal wiring and 60s health polling
705. ChartPanel error+onRetry props: in-card 'Chart failed to load' state with the API message and a Retry button (sharedRequest)
706. ChartPanel header retry icon action while a chart is errored
707. ChartPanel fullscreen overlay gains its own Download-PNG button
708. Toast action buttons ({label,onClick}) rendered inline, auto-dismissing after the action runs (sharedRequest)
709. Toast auto-dismiss pauses on hover/keyboard focus and resumes with the remaining time
710. Toast 'Dismiss all (N)' control appears once 3+ toasts stack
711. Command palette: saved FilterBar views surface as a 'Saved views' section and apply from anywhere
712. Command palette: live offender lookup while typing (debounced GET /offenders?q=, abortable) jumping straight to Offender 360, with a searching-progress row
713. Command palette: numeric queries offer 'Open case record N' (by case ID, graceful 404)
714. Command palette: 'Search case records for …' verb deep-links into the Cases full-text q= search
715. Command palette action verb: 'Print this view' (window.print with the print header)
716. Command palette action verb: 'Open the A4 print brief'
717. Command palette action: 'Install DAPPA as an app' shown while a deferred install prompt is available
718. Command palette: hidden-until-typed crime-head quick filters (mirrors the district jumps)
719. Command palette: matched characters highlighted in result labels (substring and fuzzy-subsequence)
720. Command palette Recent now records every page visit (sidebar, tabs, links) — true recent pages, not just palette runs
721. Keyboard shortcuts sheet: per-route 'On this view' section (Dashboard, GeoIntel, Alerts, Cases, FIR detail, Network, Ask DAPPA) mirroring each route's real bindings
722. Error boundary: 'Copy error details' diagnostics button (message, component stack, route, UA) with copied feedback
723. Error boundary: 'Back to Dashboard' escape action that also resets the boundary
724. Error boundary: stale-deploy detection — failed lazy-chunk imports get 'A newer version was deployed' with a Reload-app action
725. Error boundary: collapsible 'Technical details' component-stack block
726. PWA install hint toast (beforeinstallprompt) with an Install action button, shown once and never in standalone mode
727. 'DAPPA installed' confirmation toast on appinstalled
728. PWA manifest app shortcuts: Dashboard, GeoIntel map, Alerts, Case explorer (long-press/right-click jump list when installed)
729. OG + Twitter summary_large_image cards with absolute og:url/og:image (dashboard screenshot now self-hosted at <pages>/media/command-dashboard.jpg, 1476x812 + alt)
730. Offline banner shows how long you have been offline (live-updating m/h)
731. Offline banner 'Check now' button re-probes connectivity via a no-store same-origin fetch
732. Route-shaped Suspense skeletons: map canvas for /map, filter-bar+8 table rows for /cases /offenders /alerts, chat bubbles for /copilot, header+columns for detail routes
733. Favicon alert badge: red dot drawn onto the crest (Path2D canvas) while alerts are pending, restored at zero
734. Global print polish: cards/figures/table rows avoid page-break splits, headings keep their content, shadows stripped, ink-safe hairlines and de-tinted links
735. Topbar active-filter pill: live count with tooltip filter summary and one-click clear-all (desktop)
736. noscript fallback card explaining the app needs JavaScript (self-styled since CSS ships with the JS bundle)

## Catalyst Backend (Functions & API) (72)

737. GET /meta/lookups — districts, units, crime heads/subheads, categories, statuses, gravities with 1h cache and compiled-constants fallback
738. GET /summary/kpis — total FIRs, MoM %, heinous count, detection rate, active alerts, top rising subhead; honors district/unit/head/subhead filters; windowed+district-scoped detection rate; 10-min cache
739. GET /trends/monthly — zero-filled monthly series with from/to, district, unit, head/subhead filters
740. GET /trends/seasonality — weekday x hour heatmap matrix from incident timestamps, with all common filters
741. GET /trends/category-share — crime-head distribution with share % over the filter window
742. GET /trends/compare — two filter-sets (A/B) returned as aligned series for side-by-side comparison views
743. GET /geo/districts — choropleth stats: case count, rate-per-lakh, MoM delta, open-alert badge
744. GET /geo/stations — station markers with avg lat/lng, case counts, joined StationRisk score (now 10-min cached)
745. GET /geo/incidents — point layer with bbox, limit (cap 2000), date and crime filters (now 5-min cached)
746. GET /geo/hotspots — cluster centroid/radius/hour-band/intensity/label, filterable by district and head
747. GET /alerts — paginated anomaly alerts ordered by z-score, status filter, deterministic 8-point sparkline per alert
748. GET /alerts/:id — alert detail with 12-month observed AggMonthly series and robust baseline median for a real context chart
749. POST /alerts/:id/ack — acknowledge alert, admin-gated, persisted even in fixture-demo mode
750. POST /alerts/:id/status — OPEN/ACK/DISMISSED triage lifecycle, admin-gated, validated enum
751. GET /alerts.csv — CSV export of the alert list with the same filters
752. GET /network/graph — criminal network with fallback chain NoSQL -> Stratus -> NetworkEdge table; community/district/ego-net filters; district filter falls through to the table graph when a snapshot lacks per-node districts
753. GET /offenders — repeat-offender list with repeatOnly, minCases, district filter, q= name/alias search, pagination, risk ordering
754. GET /offenders.csv — CSV export of offender profiles with the same filters
755. GET /offenders/:personKey — profile with aliases, MO tags, associates and linked-case timeline
756. GET /forecast — history + forecast with 80% CI bands, model name, backtest MAPE
757. GET /risk/stations — ranked station risk with horizon param, explainable drivers, and last-6-month sparkline per station
758. GET /cases — paginated case explorer with date/district/unit/head/subhead/gravity filters and per-row anomaly flag
759. GET /cases.csv — CSV export of the case list with the same filters
760. GET /cases/:id — full ER-join detail with caste/religion never selected (privacy guardrail, test-enforced)
761. GET /cases/:id/similar — top-5 similar cases by subhead + hour-band + station/district + geo proximity with whyMatched reasons
762. POST /predict/outcome — case-outcome probability via QuickML flag path or embedded logistic fallback, with class/probability coherence on remote payloads
763. POST /ai/narrative — entity/keyword/sentiment/MO-tag extraction via Zia flag path or deterministic local extractor
764. POST /copilot/query — deterministic NL copilot: 15 intents incl. rate-per-lakh, heinous-share, scoped detection rate, month-name parsing, graceful unknown-intent suggestions; chart payloads and ZCQL transparency; 18 smoke-tested canned utterances
765. POST /copilot/query QuickML-LLM RAG flag path with graceful fall-through to the deterministic parser
766. GET /copilot/suggestions — guaranteed-to-answer question chips for the copilot UI
767. POST /reports/weekly-brief — SmartBrowz PDF render + Stratus signed URL flag path, print-CSS URL fallback
768. GET /reports/brief-data — single-call KPIs + top alerts + top risk + top districts payload for the brief page and PDF path
769. POST /notify/test-digest — Catalyst Mail digest of top open alerts with preview, admin-gated, disabled/error fallbacks
770. GET /meta/refresh — data freshness: nightly last-run, live event alerts, anchor month, honest fixture-demo mode
771. GET /meta/socio — district socio-economic context (population, urbanisation, literacy, density, income idx)
772. GET /healthz — datastore row counts, cache backend, NoSQL graph check, flags, honest 'fixture-demo' mode reporting
773. PUBLIC_DEMO self-healing: failed ZCQL/NoSQL calls transparently answered from the bundled fixture, with raw UPDATE writes applied to the fixture so demo actions persist
774. Response caching (Catalyst Cache segment or in-memory) with ?nocache=1 bypass, meta.cached flag, and meta.asOf (anchor Ym + generated-at) on cached reads
775. Consistent {ok,data,meta}/{ok,error} envelope, JSON 404/500 handlers, structured single-line request logging
776. Admin gating: public demo is read-only; mutating endpoints require an exact ADMIN_TOKEN match (x-admin-token or Bearer; documented demo-admin default) — any-header bypass closed
777. ZCQL pagination on doc-verified skip semantics (LIMIT offset,count), aligned across Node buildZCQL and Python fetch_table so cloud reads never drop or duplicate boundary rows
778. IST-anchored month calculations so UTC Catalyst containers agree with the IST-shaped dataset around month boundaries
779. dappa_event: FIR insert -> incremental AggMonthly upsert -> live robust z-check -> deduplicated AnomalyAlert insert (register-FIR-see-alert demo storyline; race documented, self-healed by nightly recompute)
780. dappa_nightly: AggMonthly delta recompute, weekly median/MAD anomaly refresh (ACK-preserving), StationRisk weighted recompute with drivers, seasonal-naive forecast (opt-in), RefreshMeta persistence, LOCAL_DRYRUN CSV mode with caste/religion stripping
781. Contract test suite (test/run.mjs): 345 checks covering every endpoint shape, the fixture-fallback mode end-to-end, write persistence, the auth hardening, and the caste/religion privacy guardrail
782. GET /meta/challenge — six-capability challenge coverage map with per-capability highlights + endpoint inventory (About page)
783. Challenge map live counts: distinct endpoints (27) and guaranteed copilot utterances (21)
784. GET /insight/socio-correlation — Pearson r of per-lakh crime rate vs each socio indicator (urbanisation, literacy, density, income, population) from AggMonthly+SocioEconomic, fixture-safe
785. Per-district scatter points (rate + all indicators) returned alongside the correlations for client charting
786. Plain-language correlation interpretation per indicator: strength, direction, and honest 'not computable' notes on zero variance
787. Socio-correlation honors crimeHeadId/crimeSubHeadId and from/to window filters
788. GET /insight/emerging — rising vs cooling crime sub-patterns (last-3-months avg vs prior-9 baseline) with 12-month sparklines
789. emerging:true flag (>=15% growth) per mover for red-zone pulsing in the UI
790. GET /network/path — BFS shortest association path between two personKeys with hops, total/weakest edge weight
791. Path hops annotated with shared case IDs per edge (association evidence); found:false with honest reason for disconnected/unknown persons
792. GET /network/communities — organized-crime community roll-up: risk-ranked members, edge density, linked cases, districts spanned, top MO tags, key person
793. GET /offenders/mo-patterns — recurring MO signature mining with cross-jurisdiction detection (tag spanning >=2 districts) and top offenders per signature
794. POST /offenders/watch — watchlist validation returning enriched profiles + notFound keys (max 50, 400 on bad input)
795. Watch enrichment: days-since-last-seen recency and network associate counts per person
796. Watch enrichment: count of open anomaly alerts inside each offender's active districts
797. GET /alerts/summary — triage stats: counts by status, open counts by severity, top districts by open alerts, latest alert timestamp
798. Copilot: 'compare <district> and <district>' two-district comparison with dual-series chart and higher/lower verdict
799. Copilot: 'why is X rising' diagnostics — trend verdict plus contributing sub-pattern, matching open alert, and strongest hotspot as cited causes
800. Copilot: time-of-day hotspot queries ('hotspots at night/evening/morning/afternoon') with circular hour-band overlap filtering
801. Three new guaranteed copilot suggestion chips (smoke-tested canned utterances, total 21)
802. Weak ETag on every JSON GET with If-None-Match -> 304 revalidation (hash over data only so volatile meta never defeats it)
803. Cache-Control: no-cache pairing so browsers revalidate cheaply via 304 with zero client changes
804. X-Request-Id correlation header (echoes sane client ids or mints one) on every response and in structured logs
805. X-RateLimit-Limit/Remaining/Reset headers on every response; 429 + Retry-After past the env-tunable RATE_LIMIT_PER_MIN budget
806. X-Response-Time server-timing header on all envelope responses
807. healthz dataCompleteness: per-table actual vs expected counts with percent (CaseMaster 45000, AggMonthly 34021, Victim 53836, Accused 36093, NetworkEdge 23833, ForecastMonthly 8892, OffenderProfile 2048, District 38) plus weighted overallPct
808. Per-endpoint cache TTL policy (ROUTE_TTL map: refresh/alerts-summary 120s, incidents 180s, kpis 300s, seasonality/hotspots/correlations 900s) surfaced as meta.ttlSec
