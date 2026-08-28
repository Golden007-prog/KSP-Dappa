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

**D-020 · The Round-2 decision record lives per phase; this file carries the cross-cutting ones (lead, 29 Aug 2026).**
Seven parallel workstreams produced 99 decision entries, which is more than one
chronological file can hold without becoming unreadable. They live beside the
work in `docs/round2/decisions-<phase>.md` — phase3-console, phase4 (officer
tiers), phase5 (voice + accessibility), phase6 (face identification), phase7
(action loop), phase8-catalyst (new service surfaces), phase8-depth (analytical
depth), phase8-ingest (CSV → ER). Each is written in this file's style and cites
the measurement behind it. From D-021 onward this file records only what a judge
would ask about across phases, and points at the phase file for the detail. Why:
a decision log nobody finishes reading is a decision log that does not work.

**D-021 · Development is the submitted URL; Production is finished after the datathon (lead, 29 Aug 2026).**
The Production environment exists and answers, but Catalyst migrates code and
metadata only — the Data Store arrives empty and function env values do not
travel (D-013). Finishing it means re-loading ~350,000 rows with
`scripts/prod_load.mjs`, re-entering the env under the Production switch,
re-pointing `APP_BASE_URL` and a second *Deploy to Production*. The Development
URL is a legitimate Catalyst deployment, carries the full dataset and every
configured service, and is what the README publishes. Doing the migration in
the last hours before a deadline would risk the one URL a judge opens to save
a cosmetic ".development" in the hostname. The runbook is `CONSOLE_SETUP.md` §14.

**D-022 · OpenStreetMap basemap tiles are declared, not removed (lead, 29 Aug 2026).**
Two independent reviewers flagged the Leaflet tile layers
(`geointel/MapCanvas.jsx`, `cases/IncidentMap.jsx`) as an external-endpoint
violation; two independent refuters overturned both, and they were right. The
organiser rule this project is held to is scoped to *services* —
`docs/CONTRACTS.md` §Guardrails: "No external AI/LLM/hosting/DB/auth APIs
anywhere in produced code. OSM tiles + open GeoJSON are fine as client data
sources", with the same carve-out in the round-1 master prompt. A tile request
carries a {z}/{x}/{y} coordinate and nothing of ours. The decision is therefore
to keep the basemap and *declare* it: the README's data-ethics section names the
two files, states it is the only outbound request the app makes, and points at
GeoIntel's Basemap on/off control, which turns it off entirely — every analytic
layer (choropleth, hotspots, heat, incidents, beat map) is drawn from bundled
GeoJSON and the Catalyst API and is unchanged with tiles off. Why declare rather
than delete: a judge who opens a network tab should find the request already
explained, and removing the basemap would cost the geographic context under the
choropleth for no gain against the rule as written.

**D-023 · The Round-2 claims were audited adversarially before publication (lead, 29 Aug 2026).**
Seven workstreams built in parallel and each wrote its own feature and decision
records, which is exactly the situation where a project starts believing its own
summaries. So before any of it reached `FEATURES.md`, nine independent reviewers
were briefed to **refute** the claims — one per workstream, one for cross-cutting
integration, one for the non-negotiables — working from the running code, the
deployed API and a browser rather than from the documents. They raised 100
findings. Each critical or major finding then went to two further reviewers whose
only job was to knock it down: 4 were refuted and dropped, 53 were confirmed.
Seven fix agents closed them: 79 fixed, 5 partial, 2 rejected as wrong on the
evidence. What the audit caught is the point of recording it: a sample-capture
path that returned a similarity of exactly 1.0 by construction; a "two
independent signals" rule that was re-testing the filter the officer had already
chosen; a numeric firewall that let a fabricated small integer through; a
festival estimator that double-counted the days two festivals shared; prediction
zones drawn around cases with no repeat history; a locale string telling officers
the alias matcher runs at "~0.9 precision" when it measures 0.032; and five whole
feature areas that were dead on the GitHub Pages demo because nobody had baked
their snapshots. None of those would have been found by re-reading our own notes.

**D-024 · Three of the four refuted findings were misreadings of our own vocabulary (lead, 29 Aug 2026).**
Worth recording because it says something about the documents rather than the
reviewers. Three findings died because "overlap" in this repository means a
*multi-capability attribution* (one feature tagged `[C5 C2]`, published in the
overlap matrix), not two features covering the same ground — a reviewer reading
`CAPABILITIES.md` cold took the everyday meaning. The fourth died because the
reviewers were briefed with a stricter rule than the project actually holds:
"no external endpoint anywhere" rather than the organiser's "no external
AI/LLM/hosting/DB/auth **APIs**", which explicitly permits OSM tiles (D-022).
Both are documentation faults, not reviewer faults: a term of art that a careful
outsider misreads is a term of art that needs a gloss, and a rule quoted from
memory rather than from `docs/CONTRACTS.md` is how a team talks itself into a
wrong conclusion. The overlap matrix now says what it means where it is defined.

**D-025 · The recount after the build: two of six capabilities clear the bar, and C3's three-feature gap is published as too close to call (lead, 29 Aug 2026).**
Folding the 233 Round-2 entries gives C1 152 · C2 90 · C3 97 · C4 108 · C5 57 ·
C6 85 — up from 134 / 81 / 81 / 85 / 44 / 52, with C4 crossing the bar and C6
gaining the most (+33, where face identification, the model card, the forecast
audit and alert precision landed). Of the 233, 88 are capability-bearing and 145
are infrastructure; the fix wave's own output — a colour-token rename, tooltip
CSS, a topbar overflow menu, snapshot generation — was counted as **zero**
features, at the fixing agents' own insistence. Two phase counts were corrected
downward against their authors' totals before folding (phase 4 claimed 24 scored
and audits to 22; phase 6 claimed 15 and folds at 15 with one line demoted and
one added). C3 lands three short of the bar, which is inside the stated ±8
hand-classification tolerance, so it is published as **too close to call** rather
than as a pass: on a slightly more generous reading of three panels it clears,
and on a stricter one it does not. Rounding it up is precisely the thing this
document exists to prevent.

<!-- Append new decisions here: **D-00N · Title (owner, date).** Decision + why. -->
