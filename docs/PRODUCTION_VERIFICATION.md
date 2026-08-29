# Production verification — 29 August 2026

A section-by-section test of the **Production** deployment, driven through a real
browser rather than by reading the code. It records what was tested, what broke,
what the fix was, and what the same test returned afterwards.

- **Environment tested:** `https://project-rainfall-60079891305.catalystserverless.in/app/index.html`
- **Method:** Claude-in-Chrome extension against the live site — navigate each
  route, wait for skeletons to clear, then read the rendered DOM. Interactive
  tools were exercised, not just loaded.
- **Screenshots:** [`docs/screenshots/production/`](screenshots/production/), one per section.

> The submitted URL is still the **Development** deployment; this document is
> about bringing Production to parity and proving it. See
> [`ROADMAP.md`](ROADMAP.md) item 1.

---

## 1. What the test does

For each route the probe records: the heading, rendered text length, chart and
canvas counts, table row counts, how many loading skeletons are still on screen,
and whether the error boundary is showing.

```js
window.__probe = () => {
  const t = document.body.innerText;
  const h = (document.querySelector('main h1,main h2') || {}).textContent || '';
  return {
    r: location.hash,
    h: h.trim().slice(0, 34),
    len: t.length,
    charts: document.querySelectorAll('[_echarts_instance_]').length,
    canvas: document.querySelectorAll('main canvas').length,
    rows: document.querySelectorAll('main tbody tr').length,
    skel: document.querySelectorAll('.skeleton').length,
    crash: /broke while rendering|Something went wrong|Unexpected error/i.test(t),
  };
};
```

**A note on that last line, because it matters.** The first version tested only
`Something went wrong|Unexpected error`. The app's actual copy is *"Something
broke while rendering About."* — so the detector reported a healthy page it had
never really checked, and `/about` only surfaced because its rendered length
(644 characters) was absurd next to every other route. A detector tuned to the
wrong string is worse than no detector, because it manufactures confidence.

Two habits follow from that, and both are used below: **compare the measurement
against a neighbour** (644 chars against 11,523 is a signal on its own), and
**verify the detector fires** before trusting a green result.

---

## 2. Step-by-step

### Step 1 — Open the site with the cache bypassed

The browser will hold the previous client bundle. This wasted a real diagnosis
during the session: Production looked like it still had the old 11-item sidebar
minutes after a successful migration.

```
https://project-rainfall-60079891305.catalystserverless.in/app/index.html?cb=1&lang=en#/
```

The `?cb=` parameter changes the URL, so the SPA shell is refetched. `&lang=en`
pins the language — the Kannada build renders different copy, and an
English-only regex silently misses a Kannada error message.

Confirm the bundle actually changed before testing anything:

```js
[...document.querySelectorAll('script[src]')]
  .map((s) => s.src.split('/').pop())
  .find((s) => /^index-/.test(s));
```

### Step 2 — Walk every route and wait for the page to settle

Navigating is not the same as being loaded. `/network` still had four skeletons
after ten seconds and resolved cleanly at twenty; a test that measured at ten
would have filed a bug that does not exist.

```js
window.__walk = async (routes) => {
  const z = (m) => new Promise((r) => setTimeout(r, m));
  const out = [];
  for (const r of routes) {
    location.hash = '#' + r;
    await z(1200);
    let last = null;
    for (let i = 0; i < 24; i++) {          // settle: poll until quiet
      await z(700);
      const p = window.__probe();
      if (p.skel === 0 && p.len > 1200) { last = p; break; }
      last = p;
    }
    out.push(last);
  }
  return out;
};
```

The Chrome tabs here render **hidden**, so `requestAnimationFrame` never fires
and `setTimeout` is throttled. Long `await`-driven loops must therefore be
started and collected in separate calls rather than awaited inline, and the
`computer` tool's `wait` action is the reliable way to pass time.

### Step 3 — Exercise the interactive tools, do not just render them

| Tool | Action driven | What proves it worked |
|---|---|---|
| Ask DAPPA | typed a question, clicked **Ask** | a real ranked answer plus the engine badge |
| Identify | clicked **Use a sample capture** | caption reads `sample capture of P00001` |
| Scan FIR | clicked a bundled sample scan | text recovered, engine badge shown |
| Data ingest | opened the table picker | the bundled ER table list renders |
| Reports | listed the action buttons | Generate PDF / exports / email digest present |

### Step 4 — Read the crash's real stack, not the minified one

When `/about` failed, the console gave offsets into a minified chunk. Fetching
that chunk and slicing around the offsets named the two failing expressions
directly, which was faster than reasoning about the source:

```bash
curl -s ".../app/assets/About-BnNcIfiK.js" > about.js
# then slice line:col from the stack — the surrounding string literals
# identify the component even when the identifiers are mangled
```

### Step 5 — Fix, deploy, re-test, and only then call it done

`catalyst deploy` targets **Development only**. Production is updated by the
console's *Create Deployment* (Development ⇒ Production). The client is carried
across even when the diff reports zero Serverless changes.

---

## 3. What broke, and what fixed it

### 3.1 `/about` died in its error boundary — on **both** deployments

**Symptom.** 644 characters rendered instead of ~35,000.
`TypeError: Cannot read properties of undefined (reading 'length')`, twice —
at `ProvenancePanel` (`s.unknown.length`) and `HonestyLedger` (`s.incomplete.length`).

**Cause.** `DataStateBanner`, added earlier the same day, queried `/healthz`
under the key `['about-healthz']` with a comment claiming it thereby *shared a
probe* with the provenance panel. That is not what a shared key does.
React Query caches **by key**: two hooks with the same key and different
`queryFn`s do not share work, they race, and whichever resolves first defines
the cached *shape* for both. When the banner won, its raw `/healthz` payload sat
in the slot `useProvenance` expects to hold its normalized
`{tables, incomplete, unknown, overallPct}`.

**Fix.** The banner owns `['shell-datastate-healthz']`. One extra cheap probe is
the right price for not corrupting another component's cache entry.

**Why nothing caught it.** The accessibility sweep renders every route, but it
builds with `VITE_STATIC_DEMO`, where the probe fails and never writes to the
cache — so the collision cannot occur there. The contract suite now reads both
files and asserts the banner's key is not one of the About introspection keys.

### 3.2 `/identify` could not load a sample capture in Production

**Symptom.** "Use a sample capture" reported that the image could not be read;
without a probe image the search can never run.
`GET /identify/gallery` returned `items: []`.

**Cause.** `FaceGallery` has a generated CSV but was never in `prod_load.mjs`'s
`TABLE_ORDER`, so it was not among the 34 tables imported. `CaseAnomaly` was
missing for the same reason — it degrades quietly, which is precisely why its
absence went unnoticed.

**Fix.** Both added to the load order and imported (`36s` and `16s`).
`/identify/thumb/P00001.svg` now returns 200 and the caption reads
`sample capture of P00001`.

### 3.3 Production was serving a two-day-old client

Covered in [`ROADMAP.md`](ROADMAP.md) item 1: Production was a 27 August snapshot
with 11 routes. A console Development ⇒ Production deployment brought it to the
same bundle with all 19. Row counts were captured before and compared after —
**zero tables changed**, so the migration carries code and schema, not rows.

---

## 4. Result after the fixes

Every section re-tested on Production. `crash` false and `skel` 0 everywhere.

| Section | Route | Text | Rows | Charts | Screenshot |
|---|---|---:|---:|---:|---|
| Command Dashboard | `/` | 11,523 | 76 | 4 | [01](screenshots/production/01-dashboard.png) |
| My beat (phone) | `/beat` | 8,708 | — | — | [02](screenshots/production/02-beat-mobile.png) |
| Station | `/station` | 10,282 | 21 | — | [03](screenshots/production/03-station.png) |
| State rollup | `/state` | 6,979 | 38 | — | [04](screenshots/production/04-state.png) |
| GeoIntel | `/map` | 2,776 | — | Leaflet + 24 tiles | [05](screenshots/production/05-geointel.png) |
| Trends | `/trends` | 14,905 | 245 | 12 | [06](screenshots/production/06-trends.png) |
| Alerts | `/alerts` | 49,255 | 11 | 81 | [07](screenshots/production/07-alerts.png) |
| Alert digest | `/alerts/digest` | 7,530 | — | — | — |
| Network | `/network` | 27,060 | — | 3 canvas | [08](screenshots/production/08-network.png) |
| Offenders | `/offenders` | 5,434 | 33 | — | [09](screenshots/production/09-offenders.png) |
| Predict | `/predict` | 13,388 | 141 | 5 | [10](screenshots/production/10-predict.png) |
| Ask DAPPA | `/copilot` | 1,833 | — | 1 | [11](screenshots/production/11-copilot.png) |
| Cases | `/cases` | 24,875 | 336 | 4 | [12](screenshots/production/12-cases.png) |
| Reports | `/reports` | 11,275 | 34 | — | [13](screenshots/production/13-reports.png) |
| Identify | `/identify` | 2,889 | — | — | [14](screenshots/production/14-identify.png) |
| Data ingest | `/ingest` | 2,572 | — | — | [15](screenshots/production/15-ingest.png) |
| Scan FIR | `/ocr` | 2,456 | — | — | [16](screenshots/production/16-ocr.png) |
| Glossary | `/glossary` | 25,167 | 13 | — | [17](screenshots/production/17-glossary.png) |
| About | `/about` | 34,840 | 8 | — | [18](screenshots/production/18-about.png) |
| Style guide | `/styleguide` | 3,255 | 9 | — | [19](screenshots/production/19-styleguide.png) |

Interactive results:

- **Ask DAPPA** — *"top 5 districts for vehicle theft this year"* returned
  "1. Bengaluru City (344), 2. Hubballi-Dharwad…", engine badge **Deterministic
  parser** (the honest fallback; `QUICKML_LLM_URL` is unset in Production).
- **Scan FIR** — a bundled sample recovered its text with engine **Zia OCR**, a
  genuinely live Zia call in Production.
- **Identify** — sample capture loads `P00001`, 256×256 PNG, no decode error.

Platform state at the end:

| | Development | Production |
|---|---|---|
| Client bundle | `index-DTAsR2PN.js` | `index-DTAsR2PN.js` |
| Routes | 19 | 19 |
| Smoke suite | 34 / 34 | 34 / 34 |
| Data completeness | 100% | 100% |
| Differing feature flags | — | none |

---

## 5. Known differences that are *not* defects

Production reports more `console-pending` service rows than Development. That is
per-environment console provisioning, and each row names its own reason on
`/about`:

- **`FILESTORE_FOLDER_ID`** — deliberately not copied. The Development folder id
  would be a wrong id in Production, not parity.
- **`QUICKML_STATUS_ENDPOINT_KEY`** — a credential; it lives only in the
  gitignored `.env.deploy` and has to be pasted by a human.
- **A Production job pool** and **Search Index constraints** — console objects
  that exist per environment.

Everything above degrades through a documented fallback rather than failing, and
`meta.source` on each response names the engine that actually answered.

## 6. Reproducing this

```bash
# 1. data (once per environment)
node scripts/prod_load.mjs                  # 36 tables, resumable

# 2. code: console -> Settings -> Environments -> Create Deployment
#    Development => Production, then Generate Diff, then Initiate

# 3. verify from a shell
node scripts/smoke_test.mjs https://project-rainfall-60079891305.catalystserverless.in
curl -s .../api/v1/healthz      | python3.12 -m json.tool   # completeness
curl -s .../api/v1/meta/services | python3.12 -m json.tool  # per-service status

# 4. verify in a browser — open with ?cb=<n>&lang=en and walk every route
```
