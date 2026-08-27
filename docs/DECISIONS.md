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

**D-008 · Hindi locale retired; the UI is English · ಕನ್ನಡ (lead engineer, 2026-08-27).**
The third locale was removed from the client (`locales/hi/`, `LANGS`), the API
glossary (`lib/zia.js` now carries Kannada only, `TRANSLATION_LANGS = ['en','kn']`;
an unsupported target falls back to Kannada), the service map wording, the
screenshots and the deck. Why: Karnataka police work happens in Kannada and
English; a third language that nobody maintains reads as decoration, and every
untranslated string is a visible defect. `scripts/check_i18n.mjs` gates
en ↔ kn parity and runs in CI.

**D-009 · Engineering docs are tracked; the strategy kit stays local (lead engineer, 2026-08-27).**
`docs/` was gitignored wholesale. From commit `9a38e6a` the engineering
documents a judge needs (this file, ROADMAP, CONTRACTS, CONSOLE_SETUP,
SCHEMA_CHECKLIST, benchmarks, screenshots, ROUND2_*, research) are in the
repository; the agent master prompts (`docs/0*_*.md`), the organizer's ER
diagram and its text extract, media and decks remain local. Why: a claim in a
file that is not in the repo cannot be checked.

**D-010 · Tree hygiene is a failing check, not a gitignore pattern (lead engineer, 2026-08-27).**
Root cause verified: on the Windows workstation, `>`/`<` inside a quoted
`node -e` one-liner become shell redirects and leave zero-byte files named
after code fragments at the repo root, `client/` and `functions/dappa_api/`;
309 were purged in July and 89 more on 27 Aug. `scripts/check_tree_hygiene.mjs`
now fails on any entry at a guarded level that is not on an explicit allowlist;
it runs as the pre-commit hook (`git config core.hooksPath scripts/hooks`) and
as the first CI step. Working rule for agents: no `node -e` with arrows —
scripts go in files.

**D-011 · The README service table is generated (lead engineer, 2026-08-27).**
`scripts/gen_service_table.mjs` regenerates the README block and
`docs/service_table.json` from `lib/servicemap.js` against the tracked
configuration; `--check` runs in the pre-commit hook and CI, and the deck's
services line reads the JSON. Why: the hand-written table listed 16 of 28
services and called Circuits a roadmap item while `lib/circuits.js` already
called it. Circuits is therefore no longer "stretch"; ConvoKraft is the only
honest roadmap service.

**D-012 · Credentials never enter `catalyst-config.json` (lead engineer, 2026-08-27).**
`QUICKML_STATUS_ENDPOINT_KEY` had been committed in `1c1794a` and is on the
public remote; it is treated as burned and will be regenerated in the console
(Phase 3). The tracked file keeps empty strings; `scripts/deploy.mjs` injects
values from an untracked `functions/dappa_api/.env.deploy` for the duration of
`catalyst deploy` and restores the file. Why: `catalyst deploy` ships the
tracked env block verbatim, so a value that is not in the file at deploy time
is blanked on the deployment — the only safe place for it is a wrapper.

**D-013 · Development URL is what is deployed today; Production is a data migration, not a switch (lead engineer, 2026-08-27).**
Catalyst's "Deploy to Production" migrates code and metadata only: Data Store
rows, Cache and File Store contents do not move, and resources cannot be
created inside Production afterwards (docs: production-environment,
initial-deployment). Promotion therefore means enabling the environment,
re-loading ~350,000 rows with `bulk_load.js --production`, re-pointing
`APP_BASE_URL` and re-verifying — scheduled with the console run (Phase 3)
rather than done blind. Billing confirmed active on 27 Aug (Basic plan
₹1,500 + ₹300 free, ₹1.34 forecast usage for August).

**D-014 · Browser Web Speech API for voice; no Catalyst speech service exists (lead engineer, 2026-08-27).**
Read-aloud (`speechSynthesis`) and voice input (`SpeechRecognition`) run in
the browser, ship in the bundle and call no external endpoint, so they are
inside the Catalyst-only rule as libraries rather than services. Kannada
(`kn-IN`) is used when the device has a Kannada voice and the control is
hidden rather than speaking the wrong language when it does not. Why: Zoho
offers no TTS/STT service; Zia Translate covers text only.

**D-015 · Two roles today, four officer tiers next (lead engineer, 2026-08-27).**
`lib/auth.js` resolves *admin* (Catalyst role or admin token) and *viewer*
(everyone else, including `PUBLIC_DEMO` anonymous visitors). The Round-2
officer tiers (Beat / Station / District / State) are a presentation layer on
top of that claim plus a visible tier switcher for judges; anonymous visitors
land on the read-only District tier. Recorded here so the switcher is not
mistaken for authorization.

**D-016 · `FORCE_FIXTURE_TABLES` and the blank detection-rate KPI (lead engineer, 2026-08-27, retro-recording a July decision).**
`ChargesheetDetails` stopped at 12,600 of 31,655 rows on the free-tier bulk
ceiling; because it is the denominator of the detection-rate KPI, the KPI
renders "—" with the reason in `/about` rather than a false 0 %, and
`FORCE_FIXTURE_TABLES` can answer a partially loaded table from the fixture.
The load is finished in Phase 3 now that credits are active, after which the
variable is removed.

**D-017 · Capability counts are derived from per-entry tags, and the honest numbers are lower (team, 27 Aug 2026).**
The 26 July CAPABILITIES.md carried two incompatible versions of itself
(scorecard C5 121 / C2 139 against a body that said 85 / 105) and README
carried a third set (186 / 62 / 119 / 106 / 45 / 85). Rather than pick one,
every one of the 905 `FEATURES.md` entries now carries a capability tag under
the Round-2 counting rule (Appendix A of the master prompt) and
`scripts/check_capabilities.mjs` derives the scorecard, the overlap matrix,
`docs/capability_counts.json`, the README table and the deck's slide 4 from
those tags, failing the pre-commit hook and CI on any disagreement. The tags
were calibrated by four independent skeptics (infra tags: 1 of 122 sampled
wrong; scored tags: 15 of 119 sampled were double-counts of a control or
explanatory layer around a counted analytic). That bias was systematic, so
all 345 scored entries were swept for the same class and 24 more demotions
survived adversarial verification; 48 tags changed in total, plus three
features shipped on 26 July that both audits had missed (903-905). Result:
C1 134 · C2 81 · C3 81 · C4 85 · C5 44 · C6 52 — one capability clears the
bar, five do not, and the document says so. The five C5 items the July
shortfall named as missing exist in code (behaviour.js, crews.js); the count
fell because the rule got stricter, not because anything was removed. The
Round-2 backlog assigns new work to the thinnest capabilities first.

**D-018 · ChargesheetDetails finished by a keyed top-up, not a re-import (team, 27 Aug 2026).**
The table held CSID 1–12,600 of 31,655 (verified in the ZCQL console:
COUNT 12,600, MIN 1, MAX 12,600). `catalyst ds:import` appends, so re-running
the full CSV would have duplicated 12,600 rows; the CSV was filtered to
CSID > 12,600 (19,055 rows) and imported once. The CLI now stops at a Stratus
bucket prompt, which the helper answers on stdin. `/healthz?nocache=1` reports
31,655 / 31,655 and every table at 100 %; `FORCE_FIXTURE_TABLES` (D-016) is no
longer needed for this table.

**D-019 · Circuits and Zia AutoML are reclassified as unavailable in the IN data centre (team, 27 Aug 2026).**
Phase-2 research (`docs/CATALYST_SERVICE_RESEARCH.md` §3, §5) found both
services documented as not offered to IN-DC users; this project runs on
`.catalystserverless.in`. Leaving them "console-pending" would imply a step
exists. The service map now carries a distinct `unavailable` status with the
research citation, the code paths and flags stay (call shapes verified against
the SDK typings), and the in-process fallbacks serve: sequential nightly steps
via the `dappa_nightly` cron function, and the embedded logistic outcome model.
Console-pending count on the tracked configuration: 13 → 11.

<!-- Append new decisions here: **D-00N · Title (owner, date).** Decision + why. -->
