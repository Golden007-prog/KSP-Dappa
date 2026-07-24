# client/CONTRACT.md — shared component APIs + hooks (KSP DAPPA SPA)

Route fillers code against THIS file blindly. The scaffold owns everything shared;
you own ONLY your route file(s) under `src/routes/` (plus, if you need private
sub-components, a new subfolder `src/routes/<yourroute>/`). **Never touch**
`package.json`, `App.jsx`, `main.jsx`, `index.css`, `tailwind.config.js`,
`vite.config.js`, anything in `src/components/` or `src/lib/`, and **never run
`npm install`** — every dependency you need is already installed.

## Stack / commands

- Vite 5 + React 18, plain JSX (NO TypeScript). Tailwind 3 (dark command-center theme).
- Router: **react-router-dom v6 with HashRouter** (Catalyst hosting serves the SPA at
  `/app/index.html` with no rewrite rules; hash routing keeps deep links working).
  Route paths in code are normal (`/map`, `/cases/:id`); browser URLs look like
  `…/app/index.html#/map?districtId=0101`.
- Data: @tanstack/react-query v5 (`isLoading` / `isPending`, `error`, `refetch`).
- Charts: echarts 5 via `ChartPanel` (echarts-for-react under the hood).
- Maps: leaflet 1.9 (+ `leaflet.heat` side-effect plugin). `leaflet/dist/leaflet.css`
  is already imported globally in `main.jsx`.
- Graph: cytoscape 3 + `cytoscape-fcose` (installed; register it yourself:
  `import cytoscape from 'cytoscape'; import fcose from 'cytoscape-fcose'; cytoscape.use(fcose);`).
- Also available: date-fns v4, zustand v5.
- Build/dev: `cd client && npm run build` · `npm run dev` (vite on :5173 proxies
  `/server` → `http://localhost:3000`, i.e. `catalyst serve`).

## Design tokens (Tailwind classes)

| token | class | hex |
|---|---|---|
| page background | `bg-base` | #0B1220 |
| panel | `bg-panel` | #111A2C |
| grid / borders | `border-grid`, `bg-grid` | #1E2A44 |
| primary accent | `text-amber`, `bg-amber` | #F5A623 |
| alert red | `text-signal`, `bg-signal` | #E5484D |
| positive teal | `text-teal`, `bg-teal` | #2DD4BF |
| text | `text-ink` | #E6EAF2 |
| muted text | `text-muted` | #8A94A8 |

Utility classes defined in `index.css`: `.page-title`, `.page-subtitle`, `.num`
(tabular-nums — use on every numeric cell/tile), `.input-dark`, `.btn`,
`.btn-primary`, `.chip`, `.skeleton`, `.pulse-dot` (+ `--amber`/`--teal`),
`.alert-poly` (animated red stroke for Leaflet SVG paths), `.dappa-tooltip`
(Leaflet tooltip skin), `.print-page` + `.no-print` (print CSS for /print/brief).
Spacing is 8-pt (`gap-2/3/4`, `p-4`); cards are `rounded-xl` with 1px borders.
Keyframes available: `pulse-ring`, `pulse-glow` (`animate-pulse-glow`), `poly-pulse`, `shimmer`.

## API layer — `src/lib/api.js`

`API_BASE = import.meta.env.VITE_API_BASE || '/server/dappa_api/api/v1'`.
Envelope `{ok,data,meta}` is unwrapped for you; errors throw `ApiError {code,message,status}`
(network failures → code `'NETWORK'`; envelope errors keep the server's code).
Raw helpers if you need them: `apiGet(path, params)`, `apiPost(path, body)` — both
resolve to `{data, meta}`. Query keys always include the pruned params object, so
passing different filters refetches automatically.

### Query hooks (react-query `useQuery` results; shapes below are `query.data`)

All accept an optional `params` object; spread `useUrlFilters().apiParams` into it
for the shared filters. `…filters` below = `{from?, to?, districtId?, unitId?, crimeHeadId?, crimeSubHeadId?, gravityId?}`.

| hook | endpoint | `data` shape |
|---|---|---|
| `useKpis(params?)` | GET /summary/kpis | `{totalFirs, momPct, heinousCount, detectionRate, activeAlerts, topRisingSubhead:{id,name,deltaPct}}` |
| `useDistrictsGeo(params?)` | GET /geo/districts | `[{districtId, districtName, caseCount, ratePerLakh, momDeltaPct, alert:boolean}]` |
| `useStations(params?)` | GET /geo/stations | `[{unitId, unitName, districtId, lat, lng, caseCount, riskScore}]` (defaults `perPage:200` — first 200) |
| `useIncidents(params?)` | GET /geo/incidents | raw array of thinned points (defaults `limit:2000`; pass `bbox` yourself). Shape not pinned — expect `[{lat, lng, …}]` and guard. |
| `useHotspots(params?)` | GET /geo/hotspots | `[{clusterId, crimeHeadId, subHeadName, centroidLat, centroidLng, radiusM, caseCount, hourBandStart, hourBandEnd, intensity, label, districtId}]` |
| `useAlerts(params?)` | GET /alerts | `[{alertId, districtId, districtName, unitId, crimeHeadId, headName, periodStart, periodEnd, observed, expected, zScore, severity, status, narrative, sparkline:[num]}]` (defaults `perPage:200`; pass `{status}` to filter server-side) |
| `useNetworkGraph(params?)` | GET /network/graph | `{nodes:[{id, label, caseCount, communityId, degree}], edges:[{source, target, weight, caseIds:[..]}]}` (params: `communityId`/`districtId`/`personKey`, `depth`) |
| `useOffenders(params?)` | GET /offenders | **paginated**: `{rows:[{personKey, canonicalName, aliases:[..], caseCount, districts:[..], moTags:[..], riskScore, communityId}], total, page, perPage, meta}` (params incl. `repeatOnly`, `minCases`, `district`, `page`, `perPage`) |
| `useOffender(personKey)` | GET /offenders/:personKey | full profile object (row shape above + case list + MO tags + timeline). Enabled only when `personKey` truthy. |
| `useForecast(params?)` | GET /forecast | `{history:[{ym, actual}], forecast:[{ym, predicted, lo, hi}], model, mape}` (params: `districtId`, `crimeHeadId`) |
| `useStationRisk(params?)` | GET /risk/stations | `[{unitId, unitName, districtId, riskScore, drivers:[".."]}]` (defaults `horizon:30`) |
| `useCases(params?)` | GET /cases | **paginated**: `{rows:[{caseMasterId, crimeNo, caseNo, registeredDate, districtName, unitName, headName, subHeadName, statusName, gravityName, anomalyFlag}], total, page, perPage, meta}` (defaults `page:1, perPage:50`; keeps previous page as placeholder while fetching) |
| `useCase(id)` | GET /cases/:id | case row above **plus** `{briefFacts, complainants:[..], victims:[..], accused:[..], sections:[{actCode, sectionCode, description}], arrests:[..], chargesheet:{..}, io:{..}, court:{..}, latitude, longitude, incidentFrom, incidentTo}`. Enabled only when `id` truthy. |
| `useLookups()` | GET /meta/lookups | **normalized**: `{districts:[{districtId, districtName}], units:[{unitId, unitName, districtId, unitTypeId}], crimeHeads:[{crimeHeadId, headName}], crimeSubHeads:[{crimeSubHeadId, subHeadName, crimeHeadId}], categories:[{id,name}], statuses:[{id,name}], gravities:[{id,name}]}` (cached 1 h; all ids are strings) |
| `useTrendsMonthly(params?)` | GET /trends/monthly | **normalized**: `{months:['YYYY-MM',… ascending], series:[{name, data:[num aligned to months]}]}` |
| `useSeasonality(params?)` | GET /trends/seasonality | **normalized**: `{days:['Mon'..'Sun'], hours:[0..23], matrix:number[7][24], max}` |
| `useCategoryShare(params?)` | GET /trends/category-share | **normalized**: `[{id, name, count, sharePct, deltaPct|null}]` (sharePct computed from counts when the server omits it) |
| `useHealthz()` | GET /healthz | raw health object (no retry) |
| `useKarnatakaGeoJson()` | static `public/data/karnataka_districts.geojson` | GeoJSON FeatureCollection, 30 features, props `district`, `dt_code` (cached forever) |

“**normalized**” hooks guarantee that output shape even if the server varies
(array-of-rows vs prebuilt series) — those endpoint shapes are not pinned in
docs/CONTRACTS.md, so always go through the hook, never `apiGet` them directly.

### Mutation hooks (react-query `useMutation`; use `.mutate/.mutateAsync`, `.isPending`, `.data`)

All mutations resolve to **`{data, meta}`** — check `meta.source === 'fallback-local'`
to render the engine/source badge.

| hook | call | resolves `data` |
|---|---|---|
| `useAckAlert()` | `.mutate(alertId)` → POST /alerts/:id/ack | server response; auto-invalidates `alerts` + `kpis` queries |
| `useCopilotQuery()` | `.mutate(queryText)` → POST /copilot/query (body `{query, q}` — same text under both keys) | `{answer, chart?:{type:'bar'|'line'|'pie', title, categories:[..], series:[{name, data:[..]}]}, zcql?, engine:'quickml-rag'|'deterministic'}` |
| `usePredictOutcome()` | `.mutate(featureObject)` → POST /predict/outcome | prediction object (probability + label; shows QuickML or fallback via `meta.source`) |
| `useNarrative()` | `.mutate({caseId})` → POST /ai/narrative | Zia/fallback narrative insights (entities, keywords, sentiment) |
| `useWeeklyBrief()` | `.mutate({window?})` → POST /reports/weekly-brief | brief generation result (PDF URL when SmartBrowz on) |

## Filters — `src/lib/filters.js` + `<FilterBar />`

Shared filter state lives in URL search params (`districtId`, `crimeHeadId`,
`range`, `from`, `to`) and follows the user across routes (Layout's nav links
carry them). In a route:

```jsx
const { districtId, crimeHeadId, range, from, to, apiParams, setFilter, setFilters, reset } = useUrlFilters();
const cases = useCases({ ...apiParams, page });
```

- `apiParams` is `{districtId?, crimeHeadId?, from?, to?}` already pruned — spread it into hooks.
- `range` presets: `'all'|'30d'|'90d'|'12m'|'ytd'` (`DATE_RANGES` has labels;
  `rangeToDates(range)` → `{from,to}`). Explicit `from`/`to` params win over `range`;
  setting `range` clears them. `setFilter('districtId', '0103')`, `reset()`.
- `FILTER_KEYS`, `filterSearchString(searchParams)` exported for nav-building.

`<FilterBar show={['district','crimeHead','dateRange']}>…extras…</FilterBar>` —
renders the standard selects (options from `useLookups()`); `show` picks a subset;
children render right-aligned (put route-specific toggles there). Every screen
should render a FilterBar unless it is a detail/print view.

## Geo mapping — `src/lib/districtGeoMap.js`

Pinned 38-police-unit → 30-census-polygon mapping (docs/CONTRACTS.md).
- `UNITS` — `[{unitId:'0101', name:'Bengaluru City', polygon:'Bengaluru Urban', lat, lng}, ×38]`
- `UNIT_TO_POLYGON`, `POLYGON_NAMES`, `CITY_UNIT_IDS` (`['0101','0103','0105','0107','0109']` — commissionerates that share a parent polygon; give them circle markers at their coords)
- `normalizeUnitCode(id)` → `'0101'` (accepts `101`, `'101'`, `'0101'`)
- `polygonForUnit(unitId)` → polygon name | null · `unitsForPolygon(name)` → `['0101',…]` · `unitInfo(unitId)` → full record | null
- `aggregateCountsPerPolygon(rows, {getUnit?, getValue?})` → `{ [polygonName]: sum }`
  (defaults: unit from `row.districtId ?? row.unitId`, value from `row.caseCount ?? row.count`).
  A choropleth must SUM all units mapped to a polygon — this does it.
- `groupRowsPerPolygon(rows, getUnit?)` → `{ [polygonName]: row[] }`

## Components — `src/components/`

- **`Layout.jsx`** — app shell (left nav w/ 11 routes, synthetic-data banner, `<Outlet/>`).
  Registered once in App.jsx; routes render inside it automatically — never import it in a route.
- **`Card`** `{title?, subtitle?, actions?, padded?=true, className?, children}` — base panel.
- **`KpiTile`** `{label, value, delta?, deltaLabel?='MoM', positiveIsGood?=true, accent?='amber'|'red'|'teal', pulse?, hint?, loading?, className?}` — number value gets en-IN grouping; delta is a signed percent NUMBER (not fraction).
- **`ChartPanel`** `{option, height?=300, loading?, empty?, emptyMessage?, title?, subtitle?, actions?, onEvents?, notMerge?=true, className?}` — ECharts on the registered `'dappa'` dark theme inside a Card; handles loading skeleton + empty state. Also exports `DAPPA_CHART_COLORS`. Don't set `backgroundColor`/text colors in options — the theme does it.
- **`DataTable`** `{columns:[{key,label,sortable?,render?(row),align?,width?,className?}], rows, rowKey?, loading?, emptyMessage?, total?, page?, perPage?, onPageChange?, sort?:{key,dir}, onSortChange?, onRowClick?, dense?}` — pagination footer renders when `total`+`onPageChange` given; with `onSortChange` sorting is yours (server), without it the current page sorts client-side.
- **`FilterBar`** — see above.
- **`MiniChoropleth`** `{values:{[polygonName]:number}, alerts?:[polygonName], markers?:[{lat,lng,label?,value?,unitId?}], onPolygonClick?(name,feature), onMarkerClick?(marker), height?=280, valueLabel?='cases', className?}` — Karnataka polygons on the dark base (no tiles), amber density ramp, red pulse stroke for `alerts`, own loading/error states. Feed it `aggregateCountsPerPolygon(...)` output. (For the full-bleed GeoIntel map build your own Leaflet map with OSM tiles + attribution; MiniChoropleth is for dashboard/360-style inserts.)
- **`LoadingSkeleton`** `{lines?=3, height?, className?}` — `height` (px or CSS) renders one block instead of lines.
- **`ErrorBoundary`** `{label?, children}` — already wraps every route in App.jsx; only nest your own if you need a boundary INSIDE your route.
- **`EmptyState`** `{title, message?, icon?, action?, compact?, className?}`.
- **`Badge`** `{tone?='neutral'|'amber'|'red'|'teal'|'slate', pulse?, className?, children}`.
- **`PulseDot`** `{color?='red'|'amber'|'teal', className?}` — the red alert pulse.

## Formatters — `src/lib/format.js`

`fmtInt(12345)`→`'12,345'` · `fmtCompact` · `fmtPct(v,{digits,sign,fraction})`
(`fraction:'auto'` treats |v|≤1 as a fraction) · `fmtNum(v,digits)` ·
`monthLabel('2026-07')`→`'Jul 26'` · `dateLabel('2026-07-24')`→`'24 Jul 2026'`.

## UI store — `src/lib/store.js` (zustand)

`useUiStore` — `{sidebarCollapsed, toggleSidebar, mapLayers:{choropleth,heat,hotspots,stations,alertPulse}, setMapLayer(name,on)}`.
GeoIntel should read/write `mapLayers` so toggles survive navigation. Add new
cross-route UI state here ONLY via the scaffold owner; route-local state stays in the route.

## Route conventions + template

Rules: never white-screen (queries → check `.isLoading` → skeleton, `.error` →
`EmptyState` with a Retry button calling `.refetch()`); numbers get `.num`;
detail routes read params via `useParams()`; anything AI-derived shows its source
(`meta.source === 'fallback-local'` → `Badge` "local fallback", else the live
service name); `/print/brief` renders bare (no Layout) inside `.print-page` and
must stay printable (white background, no `.no-print` leaks). Caste/religion
never appear in any analytics UI.

A well-formed route file (this is the pattern fillers should follow):

```jsx
// src/routes/Example.jsx — replace the stub file contents entirely.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCases } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import Card from '../components/Card.jsx';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import { dateLabel } from '../lib/format.js';

export default function Example() {
  const navigate = useNavigate();
  const { apiParams } = useUrlFilters();
  const [page, setPage] = useState(1);
  const cases = useCases({ ...apiParams, page });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Case Explorer</h1>
        <p className="page-subtitle">Server-paginated FIR registry</p>
      </div>

      <FilterBar />

      <Card padded={false}>
        {cases.error ? (
          <EmptyState
            title="Couldn't load cases"
            message={cases.error.message}
            action={<button type="button" className="btn" onClick={() => cases.refetch()}>Retry</button>}
          />
        ) : (
          <DataTable
            columns={[
              { key: 'crimeNo', label: 'Crime No', className: 'font-medium' },
              { key: 'registeredDate', label: 'Registered', sortable: true, render: (r) => dateLabel(r.registeredDate) },
              { key: 'districtName', label: 'District' },
              { key: 'headName', label: 'Crime head' },
              { key: 'statusName', label: 'Status' },
              { key: 'anomalyFlag', label: '', width: 60, render: (r) => (r.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null) },
            ]}
            rows={cases.data?.rows || []}
            rowKey="caseMasterId"
            loading={cases.isLoading}
            total={cases.data?.total}
            page={cases.data?.page || page}
            perPage={cases.data?.perPage || 50}
            onPageChange={setPage}
            onRowClick={(r) => navigate(`/cases/${r.caseMasterId}`)}
          />
        )}
      </Card>
    </div>
  );
}
```

## Route ownership map

| path | file | owner |
|---|---|---|
| `/` | `src/routes/Dashboard.jsx` | scaffold (BUILT — do not touch) |
| `/about` | `src/routes/About.jsx` | scaffold (BUILT — do not touch) |
| `/map` | `src/routes/GeoIntel.jsx` | filler (stub now) |
| `/trends` | `src/routes/Trends.jsx` | filler (stub now) |
| `/alerts` | `src/routes/Alerts.jsx` | filler (stub now) |
| `/network` | `src/routes/Network.jsx` | filler (stub now) |
| `/offenders` | `src/routes/Offenders.jsx` | filler (stub now) |
| `/offenders/:personKey` | `src/routes/Offender360.jsx` | filler (stub now) |
| `/predict` | `src/routes/Predict.jsx` | filler (stub now) |
| `/copilot` (`?q=` prefill from omnibox) | `src/routes/Copilot.jsx` | filler (stub now) |
| `/cases` | `src/routes/Cases.jsx` | filler (stub now) |
| `/cases/:id` | `src/routes/CaseDetail.jsx` | filler (stub now) |
| `/reports` | `src/routes/Reports.jsx` | filler (stub now) |
| `/print/brief` (`?window=`, bare/no Layout) | `src/routes/PrintBrief.jsx` | filler (stub now) |

After your edit, verify with `cd client && npm run build` — it must stay green.
