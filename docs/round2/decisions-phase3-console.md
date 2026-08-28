# Phase 3 — Catalyst console run (lead, 28 Aug 2026)

Driven in the Catalyst console (Development environment of Project-Rainfall,
org 60079891305) with Claude in Chrome on 28 Aug 2026, between 18:25 and
18:50 IST. Every step below was verified on the resulting console page; the
ids are the ones the console printed.

## What the console run created

| Step | Result | Where it is read |
|---|---|---|
| Data Store table `ActionLog` | id **50643000000453003** — AlertKey varchar(64), ActionType varchar(32), Actor varchar(128), ActorRole varchar(32), Unit varchar(64), Note text, OutcomeLabel varchar(32), Payload text, ClientTs datetime (+ ROWID/CREATORID/CREATEDTIME/MODIFIEDTIME) | `lib/actionlog.js`, `lib/routes/actionlog.js` (Phase 7), ingest audit (Phase 8) |
| Data Store table `FaceGallery` | id **50643000000453380** — PersonKey varchar(64), ObjectKey varchar(255), ThumbKey varchar(255), Source varchar(32), Seed varchar(64), QualityJson text, Active boolean | `lib/faces.js`, `lib/routes/faces.js` (Phase 6); rows loaded by `scripts/faces_upload.mjs` |
| Search Index on `CaseMaster.CrimeNo`, `CaseMaster.CaseNo`, `OffenderProfile.CanonicalName` | toggled on (schema view shows *Search Indexed = true*) | `lib/search.js` — Catalyst Search now receives only these columns |
| File Store folder `dappa_reports` | id **50643000000453759** | `FILESTORE_FOLDER_ID` in `catalyst-config.json` (an id, not a credential) → `lib/routes/services.js` /reports/archive |
| Job Scheduling job pool `dappanightly` | id **50643000000453771**, type Function, 512 MB | `lib/jobs.js` (Phase 8 — pool id env var) |

## Decisions

**D-P3-1 · Text columns cannot carry a Search Index; the search engine gets the Var Char columns and ZCQL keeps the rest (lead, 28 Aug 2026).**
The console's *Update Field* dialog offers the *Search Index* toggle for Var
Char columns only — for `BriefFacts`, `AliasesJson` and `MOTagsJson` (Text)
the dialog shows just *Is Mandatory* and *PII/ePHI*. `lib/search.js` therefore
sends `CrimeNo`/`CaseNo` and `CanonicalName` to `search().executeSearchQuery`
(`CASE_INDEXED_COLUMNS`, `OFFENDER_INDEXED_COLUMNS`) and answers narrative
and alias queries through the existing ZCQL `LIKE` fallback over the full
column list. `/search/cases?q=<a CrimeNo>` will report `source:
catalyst-search` after the next deploy; a narrative word still reports
`fallback-zcql-like`, which is the truth. `OffenderProfile.PersonKey` was
left un-indexed (exact-key lookups do not need full-text search).

**D-P3-2 · File Store folder created although File Store is being retired (lead, 28 Aug 2026).**
The console banner says "File Store is scheduled to deprecate in two years"
and pushes Stratus. The folder exists so the `file-store` service row is
honest (*active*), but new artefacts keep going to the Stratus bucket
`dappa-import` first (`lib/artifacts.js`); File Store is the documented
second tier. Folder names accept letters, digits and `_` only (`dappa-reports`
was rejected), so the folder is `dappa_reports`.

**D-P3-3 · Job Scheduling replaces the Circuits story for nightly work (lead, 28 Aug 2026).**
Circuits is unavailable in the IN DC (D-019). A Function-type job pool
`dappanightly` (512 MB) now exists so `lib/jobs.js` can submit the nightly
refresh as a queued job with per-run status; the `dappa_nightly` Cron function
remains the scheduled path. Pool names accept letters and digits only.

**D-P3-4 · What stays console-pending, and why each one is honest (lead, 28 Aug 2026).**
- `mail` — Catalyst Mail cannot verify a Gmail sender ("You will not be able
  to verify public domain email addresses such as Gmail", research §4.11); a
  verified sender needs a domain the team controls DNS for (SPF + DKIM). The
  digest therefore renders as a page (`/alerts/digest`) and JSON, and
  `MAIL_FROM`/`DIGEST_TO` stay empty until such a domain exists.
- `connections` — Connections exist to hold OAuth credentials for a Zoho or
  third-party target; the submission calls no external system, so a link
  name would be a checkbox with nothing behind it. Left empty on purpose.
- `zia-language` — no Zia translation/speech method exists in the docs index
  or in `zcatalyst-sdk-node@3.4.0` (research §5); `ZIA_TRANSLATE_URL` cannot
  be filled by any console step. The row is reclassified *unavailable* (as
  D-019 did for Circuits and AutoML); the pinned glossary serves
  `/zia/translate`.
- `quickml-llm-rag` — LLM Serving and RAG are offered in the IN DC (research
  §6.5-6.6) but need a deployed Generative-AI endpoint created in the QuickML
  console (Generative AI → LLM Serving → deploy → API Details). The QuickML
  console pages did not render inside the automation tab on 28 Aug; the
  click-path is in `docs/CONSOLE_SETUP.md` §2 and the copilot's deterministic
  composer serves until `QUICKML_LLM_URL` is set.
- `pipelines` — connecting the GitHub repository is an OAuth grant to GitHub
  from the Catalyst console; an OAuth grant is a user action, not an agent
  action, so it is left for the team with the click-path (CONSOLE_SETUP §10).
- `appsail-managed`, `appsail-oci`, `domain-mappings`, `signals-cross-app` —
  structural: the API is an advanced-I/O function, no container ships, the
  app runs on the default Catalyst domain, and only the in-project CaseMaster
  signal is bound. No console step changes that.

**D-P3-5 · Production is a data migration and is scheduled last (lead, 28 Aug 2026).**
The Production environment exists (clone completed 27 Aug) and answers at
`https://project-rainfall-60079891305.catalystserverless.in` with the build
migrated on 27 Aug, every Data Store table empty and the AI flags off. The
production load (`catalyst ds:import --production` per table, answering the
Stratus-bucket prompt on stdin — `scripts/prod_load.mjs`), the env-var
configuration under the Production switch and a fresh *Deploy to Production*
are done once, after the final Development deploy, so that the migration
carries the Round-2 tables and code in a single step.

## Before / after

`GET /meta/services` on the Development deployment, 28 Aug 2026 12:36 UTC
(before): live 9 · active 5 · platform 2 · console-pending 12 (7 env-fixable,
5 structural). On the tracked configuration after this run and the Phase 6/7/8
service rows: the counts are recomputed by `node scripts/gen_service_table.mjs`
and recorded in `docs/DECISIONS.md` at integration; the rows that a console
step could fix are now `file-store` (fixed), `data-store-search` (columns
indexed), `job-scheduling` (pool exists) and the two new tables (exist).
