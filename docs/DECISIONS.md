# DECISIONS.md — fallbacks and judgment calls

Running log of every deviation, fallback, and non-obvious decision taken while
building KSP DAPPA. Append new entries at the bottom (date · owner · decision ·
why). Seeded by the orchestrator on 2026-07-24.

## Seeded decisions (orchestrator)

**D-001 · Python interpreter.** `python` on PATH resolves to a broken hermes
venv on this machine. All tooling, docs, and scripts invoke **`python3.12`**
(Windows Store build) instead — never bare `python`.

**D-002 · Karnataka GeoJSON source.** District polygons taken from
`github.com/udit-001/india-maps-data` (2011-census boundaries, 30 districts),
simplified with mapshaper to 15% → **23 KB** at
`data/geo/karnataka_districts.geojson` (copied to
`client/public/data/` for the SPA). Small enough to ship in the bundle; no
runtime fetch from third parties.

**D-003 · Police-unit → polygon mapping.** The 38 police units (33 districts +
5 city commissionerates) map onto the 30 census polygons per the table in
`docs/CONTRACTS.md`: city commissionerates share their parent district polygon
(choropleth **sums** all units mapped to a polygon; city units additionally get
a clickable circle marker at their Appendix C coordinates). Post-2011 units map
to parent census districts: **Vijayanagara → Ballari**, **KGF → Kolar**.

**D-004 · Non-interactive `catalyst init`.** Run with
`--org 60079891305 --project 50643000000013024` to link the existing
**Project-Rainfall** without prompts; `.catalystrc` created at the repo root.

**D-005 · Bulk-load path.** Primary = CLI **`catalyst ds:import`** (discovered
in zcatalyst-cli 1.27.0; `scripts/bulk_load.js` drives it per table, resumable
via `scripts/.bulkload_state.json`). Fallback = console CSV import per table
(Data Store → table → Import); the script prints exact instructions for any
table that fails.

**D-006 · QuickML fallback predictor.** `pipeline/analytics.py` trains a local
LogisticRegression on the same features as the QuickML pipeline and exports its
coefficients to `outcome_model.json`. With `FEATURE_QUICKML=off`,
`POST /predict/outcome` scores requests from these embedded coefficients with
an identical response shape (`meta.source:"fallback-local"`). The file is never
bulk-loaded to the Data Store.

## Build-time decisions (append below)

**D-007 · verify_load auth path (scripts agent, 2026-07-24).** Headless ZCQL
via the Catalyst REST API is not possible with CLI credentials: the token from
`catalyst token:generate --current` is CLI-scoped (`w_1000.*`) and the query
endpoint (`/baas/v1/project/<id>/query`) rejects it with `INVALID_TOKEN` on
both `.com` and `.in` DCs (verified 2026-07-24). `scripts/verify_load.mjs`
therefore uses **`catalyst ds:export`** (CLI session auth) for per-table row
counts and computes the five spot joins locally over the exported CSVs,
printing the equivalent ZCQL for replay in the console's ZCQL tab.

<!-- Append new decisions here: **D-00N · Title (owner, date).** Decision + why. -->
