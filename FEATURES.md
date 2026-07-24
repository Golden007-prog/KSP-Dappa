# KSP DAPPA — Feature Catalog

**486 user-visible features** across nine areas of the prototype, cataloged by a per-area code audit (July 2026). Every entry is an independently usable capability that exists in the deployed app.

## Command Dashboard (47)

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

## Case Explorer & Case Detail (50)

48. Server-paginated case table with total-match count in header and footer range readout
49. Debounced (300ms) full-text search over scanned rows, URL-persisted q param, with clear-search button and '/' focus + Escape-clear shortcuts
50. Search-term highlighting with <mark> in table cells when q is active
51. Filter sheet: district select, dependent station select, crime-head select, dependent subhead select, gravity, client-side status refine, date-range presets, explicit from/to date inputs with preset/custom handoff hint, anomalies-only checkbox
52. Atomic dependent filter clears (district drops station; head drops subhead; range preset vs explicit dates mutually exclusive)
53. Removable active-filter chips with per-chip remove and Clear all button (28px touch targets)
54. Active-filter count badge on the Filters toolbar button and inside the sheet
55. Saved filter presets: save named snapshot, apply, delete, overwrite-by-name, persisted in localStorage, re-read on every sheet open
56. Saved views v2: presets optionally capture visible columns + sort, applied together with the filters
57. Column chooser with locked identity/actions columns, per-column toggles, reset-to-default, persisted in localStorage
58. Client-computed case age column (days since registered, amber past 90d)
59. Row density toggle (shared DensityToggle) inside the Columns sheet
60. Sortable column headers with aria-sort; sort state persisted in the URL (?sort=key.dir)
61. Precision-safe sorting of 18-digit CrimeNos (lexical long-digit compare)
62. Honest 'sorts this page' hint when sorting rides server pagination
63. Rows-per-page selector (25/50/100/200) persisted in localStorage
64. Jump-to-page number input
65. CSV export of the current filter: pages through GET /cases up to 1000 rows, applies client refinements, respects the column chooser, UTF-8 BOM, timestamped filename, toasts, truncation notice, 'e' keyboard shortcut
66. Per-row quick actions with 40px mobile touch targets: star toggle, copy CrimeNo (clipboard API with execCommand fallback), open case
67. Starred cases: localStorage star set, toolbar Starred-only refinement with chip, star toggle on detail header
68. Recently-viewed cases chips row for one-tap return, with Clear
69. Row click opens case detail carrying the current URL filters and a sibling-id list in nav state
70. Collapsible filter-profile bar chart (cases by district/station/head, client-aggregated, theme-aware)
71. Color-coded segmented CrimeNo rendering in table cells with raw fallback; theme-safe segment colors in light mode and print
72. Anomaly flag column with pulsing red badge; anomaly-only deep-linkable filter (anomaly=1)
73. Gravity badge tinted red for heinous offences
74. 'scans newest 200' cap warning with explanatory tooltip when client refinements ride a larger server result
75. Background-refetch 'updating…' indicator (react-query placeholderData keeps previous rows)
76. Table loading skeleton rows, error state with retry, and context-aware empty messages with inline remediation chips
77. Fully shareable URL state for every explorer filter plus sort
78. document.title reflects match count on the explorer and CrimeNo on the detail page
79. Case detail: full-page loading skeleton and error state with Retry + back-to-cases link
80. Case detail header badges: status, gravity (heinous red), pulsing anomaly
81. Prev/Next sibling navigation with position indicator and ArrowLeft/ArrowRight shortcuts
82. Detail header actions: star, copy CrimeNo, copy shareable link, whitelisted JSON export, Print FIR
83. Anomaly callout card with reason text (fallback explanation) and link to the alert feed
84. CrimeNo anatomy card: 5 color-coded segments decoded (category, district, station, year, serial), CaseNo tail, format legend, malformed-format fallback
85. Registration grid: registered date, district, station, head, subhead, incident window (from → to)
86. Investigation lag KPI strip: report/arrest/chargesheet lags with amber threshold warnings
87. Case lifecycle timeline: Incident → Info at PS → FIR → Arrest → Chargesheet → Court stepper with day-gap lag analytics, tolerant of all payload key variants, horizontally scrollable on phones
88. Narrative insights panel: auto-runs POST /ai/narrative on mount, word-boundary-anchored entity highlighting in brief facts, entity chips with types, keyword chips, sentiment badge with score, Zia vs local-fallback source badge, Re-run button, loading/error/empty states
89. Incident mini-map: Leaflet + OSM tiles, styled circle marker with CrimeNo tooltip, coordinates subtitle, no-coordinates empty state, print-only coordinate text fallback
90. Parties panels (complainants/victims/accused) with per-person whitelisted fields, alias chips, count badges, empty states
91. Sections invoked table (act/section/description) with empty state
92. Arrests panel with arrest-specific fields; Chargesheet, Investigating Officer, and Court key-value panels with tolerant multi-key mapping and empty states
93. Next-hearing countdown badge on the Court panel
94. Similar-cases panel (same subhead/head + district) with sibling-carrying navigation
95. Single-case JSON export serializing only whitelisted rendered fields
96. Print stylesheet active on /cases/:id: light palette, flattened scroller, wrapping timeline, hidden interactive chrome
97. Caste/religion safety: whitelist-only rendering in PartyList/KeyValuePanel and whitelist-only JSON export so schema-fidelity fields never reach the UI or a downloaded file

## Alerts, Reports & Print Brief (60)

98. Alerts: anomaly feed with severity-rank default ordering (then |z-score|)
99. Alerts: severity filter chips (All/Critical/High/Medium/Low) synced to URL ?sev= for shareable views
100. Alerts: per-severity open-alert counts shown on filter chips
101. Alerts: global shared FilterBar filters (district / crime head / date range) persisted in URL via useUrlFilters
102. Alerts: group-by toggle (severity / district / date) rendered as labelled sections with count badges
103. Alerts: group-by and sort shareable via URL (?group= / ?sort=) with localStorage defaults
104. Alerts: sort control — severity | z-score | most recent
105. Alerts: text search over narrative/district/crime head (URL ?q=)
106. Alerts: unread-only filter toggle (URL ?unread=1)
107. Alerts: saved views — name/apply/delete filter+severity+group+sort combos as quick chips
108. Alerts: open vs acknowledged partition with separate Acknowledged section
109. Alerts: per-card Snooze 24h with collapsible Snoozed section and unsnooze
110. Alerts: header summary counts — open, acknowledged, unread
111. Alerts: overview strip — severity count chips + 14-day alert-volume sparkline
112. Alerts: live pulse indicator that switches to 'watching for anomalies' when notifications are on
113. AlertCard: severity badge with pulse, z-score badge, narrative, period range, observed-vs-expected figures
114. AlertCard: relative 'ended Xd ago' stamp with exact-date tooltip
115. AlertCard: red pulse-glow border escalation for critical/high severity
116. AlertCard: affected-stations chips resolved from lookups (single unit or district scope with +N more)
117. AlertCard: observed-vs-expected ECharts sparkline with expected ±2σ band, dashed expected line, red latest-period dot, and 'no history' fallback — theme-aware colors with an aria-label text alternative
118. AlertCard: sparkline legend caption explaining colors
119. AlertCard: View-on-map deep link to /map?districtId=
120. AlertCard: Copy-as-text button producing a WhatsApp-ready one-liner
121. Alerts: acknowledge with optimistic cache update, pending state, rollback on error, per-card inline retry hint, and friendly read-only-demo 403 toast
122. Alerts: static-demo acknowledge keeps the optimistic state for the session and explains it won't persist
123. Alerts: local unread tracking with 'new' indicator, persisted to localStorage (capped at 500 IDs)
124. Alerts: Mark-all-read button with accurate marked count, disabled at zero
125. Alerts: opt-in WebAudio two-tone chime on new anomalies (primed/previewed on enable, no audio asset)
126. Alerts: opt-in desktop notifications with permission flow, tag-deduped, hidden when API unsupported
127. Alerts: test-notification button (chime + sample desktop pop-up)
128. Alerts: 60s background poll while either notification channel is enabled
129. Alerts: new-anomaly detection that silently absorbs first load and filter changes before chiming
130. Alerts: client-side CSV export of the filtered alerts with dated filename, RFC-4180 escaping, and nothing-to-export guard toast
131. Alerts: keyboard shortcuts — j/k navigate, a ack, m read, s snooze, c copy, u unread, e CSV, / search, 1–4/0 severity
132. Alerts: mobile Options bottom sheet for group/sort/notification settings
133. Alerts: loading skeleton cards, error state with Retry, context-aware empty states (severity / search / unread / snoozed) with one-tap clear actions
134. Alerts a11y: aria-pressed toggles, role=group severity filter, radiogroups with arrow-key navigation, tooltips visible on keyboard focus, 44px touch targets on mobile
135. Reports: window picker (last 7 / last 30 days / custom from–to dates)
136. Reports: five brief-section toggles persisted to localStorage and carried to /print/brief via ?sections=
137. Reports: section reorder with persisted order carried via ?order=
138. Reports: 'Prepared by' officer stamp (persisted, in header and PDF via ?by=)
139. Reports: live print-styled brief preview (exact markup SmartBrowz captures) in a horizontal-scroll A4 container — no clipping at 360px
140. Reports: Generate PDF via POST /reports/weekly-brief that opens the SmartBrowz signed URL, detects popup blocking, and always keeps a Download PDF link
141. Reports: print-CSS fallback path that navigates to /print/brief?autoprint=1 when SmartBrowz is off
142. Reports: PDF error note with 'Open print view' recovery link
143. Reports: copy-to-clipboard plain-text share summary honoring section toggles
144. Reports: export brief as Markdown (.md) honoring toggles, order, prepared-by
145. Reports: per-section CSV exports (alerts / hotspots / risk stations)
146. Reports: flag-gated Email digest button with friendly flag-off 403 handling
147. Reports: 'Open print view' link and SmartBrowz / local-fallback source badge
148. Reports: Generate/Copy/Export disabled with inline hint when all sections are toggled off
149. Brief content: KPI stat boxes with deltas vs the prior window, top-8 open alerts table, top-6 hotspots table with resolved district names, top-5 co-offending communities, 3-month forecast table with model/MAPE, top-5 risk stations with drivers
150. Brief content: per-section loading / error / empty notes so one failed query never blanks the brief
151. Brief content: synthetic-data disclaimer header and caste/religion-never-used footer
152. PrintBrief: bare print route outside Layout with white A4 print CSS (@page, .no-print)
153. PrintBrief: ?window= validation (presets + custom ?from&to), ?sections=/?order=/?by=/?density= handling, and ?autoprint=1 that fires window.print() once after all queries settle (400ms layout delay)
154. PrintBrief: autoprint guard + Retry notice when every brief query failed
155. PrintBrief: compact/comfortable print density toggle honored by SmartBrowz captures via query param
156. PrintBrief: document title swapped while mounted so Save-as-PDF suggests a sensible filename, restored on unmount
157. PrintBrief: no-print toolbar with data-loaded status, N/5 section count, window-switch links carrying all params with aria-current, density toggle, Print/Save button, and Back-to-Reports link — 40px touch targets, no body-level horizontal scroll at 360px

## Trends & Predict (Forecasting) (50)

158. Trends: hour x weekday seasonality heatmap with per-cell tooltip and low/high visualMap legend (theme-aware ramp)
159. Trends: monthly multi-line chart per crime head, top-6 heads with the rest folded into a dashed gray 'Other' series
160. Trends: festival-window shading (Ugadi/Dasara/Deepavali) as labeled markAreas on the monthly chart, real 2021-2026 dates
161. Trends: direct end-labels on monthly lines when <=4 series on desktop (dropped at narrow widths), scrollable legend otherwise
162. Trends: 24-month cap plus leading zero-month trim on the monthly chart
163. Trends: Lines | Calendar view switch - month x year heatmap alternate view of the monthly trend
164. Trends: 3-month rolling-mean smoothing toggle on the monthly lines
165. Trends: anomaly markers (trailing z-score |z| >= 2) with anomaly-summary insight sentence
166. Trends: per-lakh normalization toggle (populations derived from /geo/districts) on monthly chart and compare grid
167. Trends: YoY delta chip (latest month vs same month prior year) beside the monthly insight
168. Trends: category-share donut with count+percent tooltip, 'Other' fold, and click-to-filter by crime head
169. Trends: district comparison horizontal bars (top 14) with selected district highlighted solid vs faded rest, click a bar to set/clear the district filter
170. Trends: Cases vs Per-lakh metric toggle on the district comparison (SegmentedControl, 40px targets)
171. Trends: seasonal profile panel - calendar-month average bars with peak/trough insight
172. Trends: deterministic auto-insight sentence under each chart (peak window/night share, leader+MoM+festival delta, dominant head+concentration+fastest riser, leader vs state median, seasonal peak, trajectory)
173. Trends: auto-insights digest strip with 'rule-based / no LLM' badge, staggered fade-up, copy-all-to-clipboard
174. Trends: stacked category-mix-over-time area chart with Count vs Share-% toggle, PNG save, CSV export, error surfacing with Retry
175. Trends: multi-district x multi-head sparkline compare grid with URL deep-linking (cmpD/cmpH), anomaly dots, 3m delta badges, per-lakh normalization, CSV export
176. Trends: palette preference toggle (Standard vs CB-safe Okabe-Ito) persisted in localStorage with light/dark variants, applied to all charts
177. Trends: CSV export on all four core charts
178. Trends: PNG save (toolbox) on monthly and district charts
179. Trends: pinned views - save/restore/delete named URL states via Sheet, localStorage-backed
180. Trends: print stylesheet for a clean chart briefing
181. Trends: per-chart loading skeletons, error states distinct from empty with Retry buttons (in-body and header)
182. Trends: fully theme-aware charts (SURFACE/HEAT_RAMP tokens) - correct rendering in light mode
183. Trends: responsive 360px chart grids (containLabel bars, narrower labels, end-label suppression)
184. Shared FilterBar (district / crime head / date-range presets) persisted in URL search params, shareable+reload-safe, with Clear button and horizontal-scroll chip row on mobile
185. Predict: 30-day station-risk league table ranked by risk score with risk-bar visualization per row
186. Predict: percentile risk-tier badges (Severe/High/Guarded/Low) per station
187. Predict: station/district search box filtering the league
188. Predict: top-6 risk-driver chips that filter the league client-side (toggle on/off, 40px targets)
189. Predict: per-row driver chips (first 3 + '+N' overflow with title tooltip)
190. Predict: 'Show all N stations' / 'Show top 15' expander
191. Predict: league sortable by risk score (DataTable client sort with aria-sort)
192. Predict: row click opens the station's district on /map carrying the current shared filters; station name is a keyboard-accessible button
193. Predict: league CSV export (rank, station, district, risk, tier, drivers)
194. Predict: copy-to-clipboard top-5 risk briefing text
195. Predict: league error state with Retry, loading skeleton rows, search/driver-aware empty message
196. Predict: Karnataka risk choropleth (peak station risk per polygon) with click-to-filter and a theme-matched low/high gradient legend
197. Predict: district filter applied client-side to both league and risk map; FilterBar honestly shows district-only with an 'all crime heads' scope badge
198. Predict: live outcome prediction form (district, crime subhead grouped by head, gravity, hour band, victims, accused, sections, arrest-within-7d)
199. Predict: preset case-profile chips filling the form in one tap
200. Predict: probability gauge with semantic red/amber/teal zones, animated value, theme-aware chrome (light + dark)
201. Predict: predicted-class badge, model-source badge (QuickML live vs embedded logistic fallback via meta.source), ROC-AUC badge, A/C class probabilities line
202. Predict: what-if delta badge vs the previous prediction run
203. Predict: outcome panel pending/error/no-prediction-yet states with Retry; defaults snap to real lookup options if fixture ids are missing
204. Predict: caste/religion exclusion disclaimer text under the form
205. Predict: forecast explorer - district x crime-head monthly line with 80% CI band, dashed forecast continuation connected to last actual, 'forecast ->' markLine, theme-aware series colors
206. Predict: forecast model name + backtest MAPE badges, in-card district/head selects deep-linked via fd/fh URL params, custom Actual/Forecast/CI tooltip, error Retry, CSV export
207. App-wide: dark/light theme-aware ChartPanel (registered dappa/dappa-light echarts themes), lazy routes with error boundaries, offline banner, command palette

## GeoIntel Map (70)

208. Full-bleed Leaflet map of Karnataka (OSM tiles, zoom control bottom-right, zoomSnap 0.25, min/max zoom bounds)
209. Dark-theme tile treatment via CSS invert/hue-rotate filter under html.dark; light theme keeps plain OSM
210. Six toggleable layers as chip buttons: choropleth, incident heat, incident points, hotspots, stations, alert pulse (aria-pressed, hint tooltip on incident points)
211. Layer toggle state persisted in zustand across route navigation and mirrored to localStorage across sessions (prefs.js)
212. URL-synced layer state (?layers=) so a pasted link reproduces the exact map composition
213. One-click layer presets: Command / Patrol / Analyst with active-preset highlight
214. Playback speed preference (0.5x/1x/2x) persisted to localStorage
215. District choropleth colored by the active metric with hover tooltip (name, formatted value, drill hint) and amber hover-highlight stroke
216. Choropleth metric switcher: total cases / cases-per-lakh / MoM change / mean station risk, with legend + tooltips tracking the metric
217. Diverging month-over-month choropleth mode (teal down / red up, server momDeltaPct)
218. Top movers strip: 3 biggest MoM swings with click-to-fly + drill
219. Theme-aware choropleth palette: dark and light ramps, zero-fill, strokes and legend gradients
220. Choropleth + heat opacity sliders persisted in prefs
221. District polygon click drills into a station list panel and flies the map to the polygon bounds
222. Alert-pulse overlay: animated red stroke/fill on districts flagged alert (non-interactive pane)
223. Incident heat layer (leaflet.heat) with 4-stop gradient, driven by up to 2000 incident points
224. Individual incident circle markers appear only at zoom >= 12, capped at 600, each with popup card (crime head name via lookups, registered date, deep link to /cases/:id)
225. Hotspot cluster circles sized by radiusM (300m floor), colored by relative intensity band, popup with case count, intensity, and peak hour band annotation
226. Hotspot hour-band filter chips (Night / Day / Evening) filtering both chips and map circles
227. Station bubbles sized by sqrt(caseCount), colored by 3-band risk color, hover tooltip with cases + risk score
228. Selected-station highlight (larger radius + theme-aware ring) synced with the drill panel
229. Always-on city commissionerate markers at pinned coordinates with tooltip (name + case count) and click-to-drill
230. Ranked top-10 hotspot chips row (ul/li/button semantics) with rank number, label, district name, case count, relative score bar, and hour band; click flies to the cluster, force-enables the hotspot layer, and opens its popup; selected chip highlighted; stale selection auto-cleared on refetch/filter change
231. Hotspot chips loading skeleton row and error chip with retry
232. Month time-scrubber slider (0 = whole filter window, 1..N = individual months, last 24 months max) that re-windows the incident heat layer per month
233. Play/pause month animation with speed-scaled interval
234. Loop on/off toggle with auto-pause at the final month when loop is off (persisted)
235. Speed-cycle button (0.5x -> 1x -> 2x)
236. Large translucent month-label overlay on the map while the animation plays
237. Scrub month mirrored to the URL as ?m=YYYY-MM and applied from a deep link on cold load (auto-enables heat layer; race-free)
238. Auto-enable of the heat layer when scrubbing or pressing play
239. Scrubber status readout: current month label, month N/M position, loading indicator, aria-valuetext on the range input
240. placeholderData on the incidents query so the previous month's heat stays on screen while the next month loads
241. Locate search combobox over 38 pinned police units + currently loaded stations: keyboard nav, active-option highlight, clear button, no-results message, ARIA combobox/listbox roles
242. Locate search fuzzy subsequence matching and last-5 recent picks shown on empty focus (localStorage)
243. Picking a locate result flies the map and opens the matching district/station drill (city units get point-fly at zoom 11)
244. Fullscreen map mode: toolbar button with tooltip + F keyboard shortcut (input-focus guarded)
245. Layered Escape handling: help overlay > measure tool > open popup > drill panel > fullscreen; inputs keep their own Esc
246. Keyboard shortcuts: Space play/pause, ArrowLeft/Right month step, / focuses locate search, '?' shortcuts help overlay
247. Reset view chip that flies back to the full Karnataka framing
248. Shared URL-persisted FilterBar (district / crime head / date range) overlaid on the map; all layers refetch on filter change
249. Scrub index clamped when a filter change shrinks the month list
250. Loading chip while any base layer is loading
251. Per-source error chips with retry for choropleth, stations (only when layer on), and incident layer; GeoJSON failure shows a compact EmptyState with retry while the base map keeps working
252. Basemap on/off toggle and tile-error notice chip with one-click blank-basemap fallback for offline demos
253. Collapsible desktop legend bar (metric-aware density ramp, station risk colors, commissionerate, incident point, anomaly pulse dot) with metric chips + opacity sliders
254. Desktop right side panel, district mode: unit chips, station list sorted by case volume with per-station risk bars, station/case totals, loading skeleton, error + retry, no-stations empty state
255. District drill 12-month trend sparkline (per-unit trends fan-out, summed)
256. District drill day-of-week x hour seasonality heat-strip (per-unit fan-out, merged matrix)
257. Desktop right side panel, station mode: KPI tiles (cases in window, 30-day risk score with color + label), risk driver chips, recent 8 cases with anomaly badges and deep links, 'Open explorer' link carrying the district filter, total-in-window count, loading/error/empty states
258. Recent-cases status quick-filter chips inside the station drill
259. Station pin-to-compare: two pinned stations render side-by-side KPI columns (cases, risk, drivers) in the panel
260. Back-to-district navigation from station drill and close button on the panel
261. District drill fans out one /geo/stations query per police unit (1-3 units per census polygon)
262. Station drill drops the district filter so a station outside the filtered district still shows its cases
263. Saved views: name/apply/delete camera + layers + metric + filters + scrub month (localStorage)
264. Copy-share-link toolbar button (filters + layers + month) with copied-toast
265. CSV export menu: visible stations / hotspots / incident window with filter+month-stamped filenames and row counts
266. Two-click measure tool with km label, Esc exit, and drill-click suppression while measuring
267. Metric scale bar + click-to-copy cursor coordinate readout
268. Print briefing mode: print rules reduce the route to map + legend + print-only header with active filters and month
269. Mobile (<md) swipeable docked bottom sheet: collapsed peek shows the compact time scrubber, expanded shows drill panel or locate search + hotspot band filter + top hotspots + display controls (metric + opacity) + legend grid; swipe gestures, tap handle toggle, aria-expanded, safe-area padding
270. Sheet auto-opens when a drill is triggered from the map
271. Auto-drill + fly on arrival with ?districtId= (e.g. from the dashboard choropleth), re-armed when the filter clears
272. Deterministic layer z-ordering via seven custom Leaflet panes
273. Fly-to commands execute exactly once per seq: polygon flights wait for GeoJSON, completed point/hotspot flights never replay
274. ResizeObserver calls map.invalidateSize() so sidebar collapse and window resize never leave dead tiles
275. HTML-escaping helper applied to all string-built tooltip/popup content (XSS-safe against odd fixture strings)
276. Leaflet popups and tooltips restyled to follow the app theme via CSS variables
277. 40px touch targets on coarse pointers for all primary overlay controls (layer/preset/hotspot/band/metric chips, scrubber + toolbar buttons, locate box, sheet handle)

## Network Graph, Offenders & Offender-360 (69)

278. Network: Cytoscape co-accused graph — node color = community, node size = degree, edge width = shared-FIR weight
279. Network: theme-aware graph styling that restyles live on light/dark toggle
280. Network: layout switcher (Force/Rings/Grid) persisted to localStorage
281. Network: district filter via shared FilterBar, URL-synced, with unit-code→district-name resolution
282. Network: min-degree slider (1–8), URL-synced
283. Network: edge-tier checkboxes (1 case / 2 cases / 3+ cases) with explanatory tooltips
284. Network: bridge-edge toggle (hide cross-community links)
285. Network: community picker dropdown with members/cases/districts stats per group
286. Network: community chip strip (top 8) with click-to-isolate/un-isolate
287. Network: community detail summary while isolated (members/cases/districts/density + fly-to member list)
288. Network: node search combobox with autocomplete, ArrowUp/Down/Enter/Escape keyboard navigation and full ARIA wiring
289. Network: fly-to animation on search pick / deep-link focus
290. Network: Fit-to-view button and zoom + / − buttons
291. Network: keyboard shortcuts (/ find, 0 fit, + − zoom, Esc clear) with Legend hints
292. Network: PNG export of the graph at 2x with theme-resolved background + toast feedback
293. Network: CSV export of visible nodes + edges (two files)
294. Network: copy-view-link button
295. Network: saved views (name/save/apply/delete the URL state, localStorage)
296. Network: node-label visibility toggle, persisted
297. Network: neighbor-focus highlight toggle (dim non-neighbors of the selection), persisted
298. Network: ego-focus mode with 1/2/3-hop depth segmented control, URL-synced, exit button, teal ego ring
299. Network: shortest-path tool (two person selects, hop-count badge, clickable path breadcrumb, clear button)
300. Network: path highlight on graph with everything else dimmed
301. Network: node drawer — stats, aliases, MO tags, districts (enriched via GET /offenders/:key), Offender 360 link, isolate-group, ego-focus, set-as-path-A/B, add-to-compare
302. Network: edge drawer — endpoint chips, shared-case list linking to /cases/:id
303. Network: selected edges visibly highlighted on the graph
304. Network: stale drawer selections auto-close when filters remove the element
305. Network: desktop persistent selection panel vs mobile bottom Sheet (Esc/overlay close, focus restore)
306. Network: stats bar (people/links/components/groups) with district / isolated / capped / ego-missing badges
307. Network: node cap at top 400 by degree with badge
308. Network: Top connectors panel (top 10 by degree, click = select + fly-to)
309. Network: deep link ?communityId=&focus= from Offenders/Offender360 with one-shot auto-select + fly-to after layout
310. Network: legend panel (community colors, size/width/ring encodings, gesture + keyboard hints) with show/hide persisted
311. Network: loading skeleton, error state with Retry, empty state with Clear-graph-filters action
312. Network: pinch-zoom/pan touch support (touch-action none) and ResizeObserver canvas resize
313. Network: accessible name on the graph canvas with keyboard-equivalent paths (search + Top connectors)
314. Offenders: registry table with sticky first column and horizontal scroll
315. Offenders: free-text search across name/personKey/aliases/MO tags, URL-synced (q)
316. Offenders: risk-band segmented filter (All/High/Med/Low), URL-synced
317. Offenders: risk-band distribution strip (proportional bar + count chips that apply the band filter)
318. Offenders: MO-tag multi-select filter chips (URL-synced 'mo', AND semantics, per-tag counts)
319. Offenders: repeat-only (≥3 cases) toggle, URL-synced plus localStorage default for fresh visits
320. Offenders: full-filtered-set column sorting (name, cases, risk) with aria-sort
321. Offenders: client-side pagination (25/page) with range footer, Prev/Next and shrink-safe page clamping
322. Offenders: CSV export of filtered+sorted rows (BOM, proper escaping) with toasts for success/empty
323. Offenders: copy-view-link button
324. Offenders: table density toggle (shared DensityToggle)
325. Offenders: compare tray (up to 3) with name chips, per-chip remove, Clear, capacity toast, persisted in localStorage
326. Offenders: compare bottom sheet — side-by-side metric table with per-person enrichment fetches and skeleton cells
327. Offenders: compare sheet best/worst highlighting (max risk red tint, max cases/degree amber tint)
328. Offenders: row click navigates to Offender 360; canonical-name cell is a real keyboard-accessible Link
329. Offenders: community chip per row deep-linking into Network Explorer with focus
330. Offenders: 'top 200 by risk loaded' truncation badge (compact on mobile)
331. Offenders: recently-viewed offender chip row with Clear
332. Offenders: loading skeleton rows, error+Retry, context-aware empty messages (search vs repeat-only vs MO tags vs filters)
333. Offender360: header with back link, canonical name, personKey, add-to-compare, print-dossier and community deep-link buttons
334. Offender360: identity card with ECharts risk gauge, risk percentile vs loaded registry, fact tiles (cases, districts, degree, first/last seen)
335. Offender360: cases-per-year activity sparkline in the identity card
336. Offender360: alias chips with identity-resolution provenance note
337. Offender360: operating-area mini choropleth with per-district markers decoded from CrimeNo digits
338. Offender360: chronological district-hop sequence (consecutive duplicates collapsed)
339. Offender360: MO signature badge list with empty state
340. Offender360: known-associates list (top 8 by shared cases) with registry name enrichment and links
341. Offender360: mini ego graph (depth-1, tap an associate to open their profile)
342. Offender360: case timeline sorted most-recent-first with year group headers, status/district chip filters, outcome badges, /cases/:id links guarded against missing ids
343. Offender360: printable dossier via @media print stylesheet (ink-on-white token remap, chrome hidden)
344. Offender360: recently-viewed push into the /offenders chip row
345. Offender360: loading skeletons and 404-aware error state with Retry + back link
346. Shared: RiskBadge / OutcomeBadge / MoChips tone-coded chips reused across the three views

## DAPPA Copilot & About (44)

347. Copilot: chat with user/assistant bubbles, distinct styling (amber user bubbles right-aligned, avatar on assistant)
348. Copilot: relative per-message timestamps (just now / N min ago) with absolute time tooltip, 60s ticker
349. Copilot: animated typing indicator while a query is pending, with sr-only live 'DAPPA is thinking' announcement
350. Copilot: aria-live role=log conversation region announcing new answers to screen readers
351. Copilot: theme-aware ECharts chart block inside answers (bar/line/pie, dappa/dappa-light palettes) with defensive payload validation
352. Copilot: chart PNG export with theme-matched opaque background (client-side)
353. Copilot: chart bar⇄line type toggle
354. Copilot: chart data-table toggle (accessible table) and CSV export
355. Copilot: 'Explore in Trends' link under monthly-series charts
356. Copilot: collapsible 'Show ZCQL' reveal with copy-ZCQL button (keyboard accessible)
357. Copilot: copy-answer-to-clipboard button with toast feedback and execCommand fallback
358. Copilot: Regenerate button on assistant answers (re-asks in place)
359. Copilot: engine provenance badge per answer (QuickML RAG / deterministic parser / static demo; unknown engines shown verbatim) and last-engine badge in header
360. Copilot: response latency chip per answer, included in transcript exports
361. Copilot: 8 suggested-question chips in the empty state (pinned questions first, 44px targets)
362. Copilot: horizontally scrollable suggestion chip carousel above the input (pinned-first, 40px chips/arrows, touch scroll)
363. Copilot: pinned questions — star on user bubbles/chips, persisted to localStorage, unpinnable
364. Copilot: recent-questions section in the empty state from persisted history, with clear-history
365. Copilot: transcript export menu — .txt, .md, .json (timestamps, ZCQL, engine, latency, synthetic-data disclaimer)
366. Copilot: conversation persistence across navigation (localStorage, capped) with 'New chat' reset that keeps input history
367. Copilot: share-question deep link per user bubble (HashRouter-safe, auto-asks on open)
368. Copilot: shell-style input history recall via ArrowUp/ArrowDown, draft restore, persisted (cap 50)
369. Copilot: keyboard shortcuts — '/' focus, Esc stop-voice/blur, hint line under input
370. Copilot: voice input via webkitSpeechRecognition (en-IN), hidden when unsupported, listening pulse, aria-pressed, per-code error toasts, abort on unmount
371. Copilot: dismissible disclaimer banner (decision support, not decisions), dismissal persisted, 40px dismiss target
372. Copilot: auto-send of ?q= URL param from the Dashboard omnibox — queued when a request is in flight, re-armed after New chat, deduped per distinct value
373. Copilot: error bubble with message and Retry button that replaces the failed bubble in place
374. Copilot: empty state with title/message and clickable starter questions
375. Copilot: auto-scroll to newest message, smooth
376. Copilot: send button disabled while pending or input empty; 'Thinking…' label while pending
377. Copilot: input autofocus on fine-pointer devices only (no soft-keyboard pop on mobile), aria-label, 'Listening…' placeholder during voice capture
378. Copilot: duplicate-suppression in input history (no consecutive repeats)
379. Copilot: tooltips on Export/New chat/mic/pin/share/regenerate buttons
380. Copilot: print stylesheet — clean white Q&A record with ZCQL expanded on Ctrl+P
381. Copilot: mobile-safe chat shell height (accounts for bottom tab bar at <md, no outer scroll at 360px)
382. About: project story card with 4-step Generate/Precompute/Serve/Decide flow
383. About: quick stats tiles (routes, tables, live services computed from data, external services)
384. About: external links card (live Catalyst demo, GitHub Pages mirror, source repo) with accent styling and per-link copy-URL buttons
385. About: sticky in-page anchor nav with smooth scroll to six sections
386. About: pure-CSS architecture diagram (tiers + arrows with flow labels)
387. About: Catalyst services matrix (18 services) with All/Live/Roadmap filter chips and computed live count; roadmap items dimmed with badge
388. About: data-ethics card (synthetic data, caste/religion exclusion, human-in-the-loop, read-only demo)
389. About: team & credits card — TEAM constant rendering initial-avatars when filled, graceful 'Team Rainfall' card while empty (no placeholder artifacts); tech-stack chip list
390. About: prototype / 100%-synthetic-data badges in the header

## App Shell, Design System & Accessibility (51)

391. Collapsible grouped desktop sidebar (5 groups, 13 routes) with collapsed icon-only mode + tooltips, collapse state persisted across reloads
392. Mobile bottom tab bar (4 primary tabs + More) with active indicator bar and safe-area padding
393. Mobile More sheet listing remaining routes plus Theme (dark/light/auto), table density, and reduce-motion controls (44px targets)
394. Command palette (Ctrl/Cmd-K) with fuzzy search over routes + actions, full keyboard nav, result count footer, focus restore
395. Command palette actions: theme toggle + system theme, density, sidebar, zen mode, reduce motion, copy link, refresh data, shortcuts help
396. Command palette Recent section (last 5 executed actions, persisted) and hidden-until-typed district filter jumps + clear-all-filters
397. Dark/light/auto (system) theme with pre-paint no-flash script, localStorage persistence, meta theme-color sync, animated cross-fade honoring reduced motion
398. Table density toggle (cozy/compact) with single source of truth in the shared store — all instances + palette stay in sync; pre-paint applied; drives --density-y
399. URL-persisted shared filters (district / crime head / date-range presets) carried across routes by all nav links, with Clear button
400. Active-filter chips row with per-chip clearing, labels resolved via lookups
401. Saved filter views: save/apply/delete named filter combos from the FilterBar Views sheet
402. Live API health pill polling every 60s (Live / Checking / API down); dot-only variant on mobile
403. Live active-alerts count badge (clamped at 99+) on Alerts nav items, pulse dots on collapsed sidebar and mobile More tab
404. Document title sync per route with (N) active-alert prefix
405. Offline/online connectivity banner with transient back-online confirmation
406. Toast notification system (success/error/info) with tone icons, aria-live viewport, max-4 stacking, longer error duration, no timer leaks
407. Per-route ErrorBoundary keyed by pathname with Retry — no white screens
408. Route-level code splitting with page-shaped Suspense skeleton fallback
409. 404 NotFound route with back-to-dashboard link
410. Skip-to-content link that works under HashRouter (JS focus, no route hijack)
411. Scroll reset to top on every route change (search-param edits don't jump)
412. Back-to-top floating button on the inner scroller, reduced-motion aware
413. Global keyboard shortcut layer (g+letter go-to, t theme, f zen, ? help sheet) paused while typing or in dialogs
414. DataTable: client/server sorting with aria-sort, server pagination footer, row click, sticky first column, skeleton rows, empty state, density-aware padding
415. DataTable CSV export of visible rows (default on) and opt-in client-side quick filter
416. ChartPanel: ECharts wrapper with registered dark + light themes (re-instantiates on swap), loading/empty states, exported DAPPA palettes
417. ChartPanel PNG download (theme-correct background) and fullscreen expand overlay on every chart
418. MiniChoropleth Karnataka Leaflet choropleth with theme palettes, alert-pulse outlines, city markers, hover/click, HTML-escaped tooltips, skeleton + retry
419. KpiTile with en-IN value, StatDelta chip (positiveIsGood flip, sr-only direction), accent hairline, pulse dot, hint, skeleton, optional SVG sparkline
420. Badge status pill (5 tones, optional pulse)
421. Tabs with tablist semantics, roving focus, badges, 44px targets, horizontal scroll
422. SegmentedControl radio-group with arrow keys (36px sm / 44px md targets)
423. Sheet modal (bottom sheet mobile / floating card md+) with Esc + overlay close, focus move/restore, focus trap, background scroll lock, drag handle, sticky header
424. Focus trap + scroll lock shared helpers applied to every dialog (Sheet, palette, chart overlay)
425. CSS-only Tooltip on hover and keyboard focus, 4 positions
426. EmptyState and LoadingSkeleton primitives (compact mode, line/block variants)
427. PulseDot animated alert indicator (3 colors)
428. Global focus-visible outline, themed scrollbars, ::selection tint
429. prefers-reduced-motion collapse plus in-app reduce-motion override (persisted, pre-painted)
430. Print: full-page Ctrl+P of any route (scroll-chain unclamped), A4 @page, /print/brief bare route
431. Print-only header on every view: crest, view name, filter summary, IST timestamp, synthetic-data notice
432. Zen / wall-display mode hiding sidebar + disclaimer (persisted, f key, palette, topbar exit)
433. Data freshness indicator + refresh-all control in topbar
434. IST session clock in desktop topbar
435. Copy-link-to-view with filters included
436. Static-demo API mode with snapshot fallback chain and DEMO_MISS messaging
437. PWA manifest + SVG favicon + OG/meta tags (relative og:image removed)
438. Synthetic-data disclaimer banner
439. Persisted UI store: sidebar collapse, GeoIntel map layers (default-merged), zen mode
440. en-IN number/percent/date formatters with em-dash fallbacks (fmtPct now percent-by-default, fraction opt-in) plus describeFilters summary helper
441. React-query caching (60s staleTime, lookups 1h, geojson forever) with abort-signal wiring and 60s health polling

## Catalyst Backend (Functions & API) (45)

442. GET /meta/lookups — districts, units, crime heads/subheads, categories, statuses, gravities with 1h cache and compiled-constants fallback
443. GET /summary/kpis — total FIRs, MoM %, heinous count, detection rate, active alerts, top rising subhead; honors district/unit/head/subhead filters; windowed+district-scoped detection rate; 10-min cache
444. GET /trends/monthly — zero-filled monthly series with from/to, district, unit, head/subhead filters
445. GET /trends/seasonality — weekday x hour heatmap matrix from incident timestamps, with all common filters
446. GET /trends/category-share — crime-head distribution with share % over the filter window
447. GET /trends/compare — two filter-sets (A/B) returned as aligned series for side-by-side comparison views
448. GET /geo/districts — choropleth stats: case count, rate-per-lakh, MoM delta, open-alert badge
449. GET /geo/stations — station markers with avg lat/lng, case counts, joined StationRisk score (now 10-min cached)
450. GET /geo/incidents — point layer with bbox, limit (cap 2000), date and crime filters (now 5-min cached)
451. GET /geo/hotspots — cluster centroid/radius/hour-band/intensity/label, filterable by district and head
452. GET /alerts — paginated anomaly alerts ordered by z-score, status filter, deterministic 8-point sparkline per alert
453. GET /alerts/:id — alert detail with 12-month observed AggMonthly series and robust baseline median for a real context chart
454. POST /alerts/:id/ack — acknowledge alert, admin-gated, persisted even in fixture-demo mode
455. POST /alerts/:id/status — OPEN/ACK/DISMISSED triage lifecycle, admin-gated, validated enum
456. GET /alerts.csv — CSV export of the alert list with the same filters
457. GET /network/graph — criminal network with fallback chain NoSQL -> Stratus -> NetworkEdge table; community/district/ego-net filters; district filter falls through to the table graph when a snapshot lacks per-node districts
458. GET /offenders — repeat-offender list with repeatOnly, minCases, district filter, q= name/alias search, pagination, risk ordering
459. GET /offenders.csv — CSV export of offender profiles with the same filters
460. GET /offenders/:personKey — profile with aliases, MO tags, associates and linked-case timeline
461. GET /forecast — history + forecast with 80% CI bands, model name, backtest MAPE
462. GET /risk/stations — ranked station risk with horizon param, explainable drivers, and last-6-month sparkline per station
463. GET /cases — paginated case explorer with date/district/unit/head/subhead/gravity filters and per-row anomaly flag
464. GET /cases.csv — CSV export of the case list with the same filters
465. GET /cases/:id — full ER-join detail with caste/religion never selected (privacy guardrail, test-enforced)
466. GET /cases/:id/similar — top-5 similar cases by subhead + hour-band + station/district + geo proximity with whyMatched reasons
467. POST /predict/outcome — case-outcome probability via QuickML flag path or embedded logistic fallback, with class/probability coherence on remote payloads
468. POST /ai/narrative — entity/keyword/sentiment/MO-tag extraction via Zia flag path or deterministic local extractor
469. POST /copilot/query — deterministic NL copilot: 15 intents incl. rate-per-lakh, heinous-share, scoped detection rate, month-name parsing, graceful unknown-intent suggestions; chart payloads and ZCQL transparency; 18 smoke-tested canned utterances
470. POST /copilot/query QuickML-LLM RAG flag path with graceful fall-through to the deterministic parser
471. GET /copilot/suggestions — guaranteed-to-answer question chips for the copilot UI
472. POST /reports/weekly-brief — SmartBrowz PDF render + Stratus signed URL flag path, print-CSS URL fallback
473. GET /reports/brief-data — single-call KPIs + top alerts + top risk + top districts payload for the brief page and PDF path
474. POST /notify/test-digest — Catalyst Mail digest of top open alerts with preview, admin-gated, disabled/error fallbacks
475. GET /meta/refresh — data freshness: nightly last-run, live event alerts, anchor month, honest fixture-demo mode
476. GET /meta/socio — district socio-economic context (population, urbanisation, literacy, density, income idx)
477. GET /healthz — datastore row counts, cache backend, NoSQL graph check, flags, honest 'fixture-demo' mode reporting
478. PUBLIC_DEMO self-healing: failed ZCQL/NoSQL calls transparently answered from the bundled fixture, with raw UPDATE writes applied to the fixture so demo actions persist
479. Response caching (Catalyst Cache segment or in-memory) with ?nocache=1 bypass, meta.cached flag, and meta.asOf (anchor Ym + generated-at) on cached reads
480. Consistent {ok,data,meta}/{ok,error} envelope, JSON 404/500 handlers, structured single-line request logging
481. Admin gating: public demo is read-only; mutating endpoints require an exact ADMIN_TOKEN match (x-admin-token or Bearer; documented demo-admin default) — any-header bypass closed
482. ZCQL pagination on doc-verified skip semantics (LIMIT offset,count), aligned across Node buildZCQL and Python fetch_table so cloud reads never drop or duplicate boundary rows
483. IST-anchored month calculations so UTC Catalyst containers agree with the IST-shaped dataset around month boundaries
484. dappa_event: FIR insert -> incremental AggMonthly upsert -> live robust z-check -> deduplicated AnomalyAlert insert (register-FIR-see-alert demo storyline; race documented, self-healed by nightly recompute)
485. dappa_nightly: AggMonthly delta recompute, weekly median/MAD anomaly refresh (ACK-preserving), StationRisk weighted recompute with drivers, seasonal-naive forecast (opt-in), RefreshMeta persistence, LOCAL_DRYRUN CSV mode with caste/religion stripping
486. Contract test suite (test/run.mjs): 345 checks covering every endpoint shape, the fixture-fallback mode end-to-end, write persistence, the auth hardening, and the caste/religion privacy guardrail
