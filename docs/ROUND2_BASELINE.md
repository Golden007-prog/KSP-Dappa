# Round-2 baseline — ground truth on 27 August 2026

*Phase 0 of the Round-2 programme. Nothing in this file is a claim; every row is
something that was read, run or fetched on 27 Aug 2026 and can be re-run. Where
a number is quoted from a document rather than measured, the document and line
are named.*

## 1. Repository state

| Item | Observed |
|---|---|
| HEAD | `37fac00` fix(network): stop the graph collapsing into a hairball of overlapping labels |
| Previous | `194bdd1` feat(client): retire the Hindi locale and the topbar API-health pill |
| Uncommitted tracked changes | `.gitignore` only (video working-file ignores) — reviewed, kept, extended (see §7) |
| Untracked at root | 8 items: `package.json` + `package-lock.json` + `node_modules/` (a Playwright install used only by `video/tmp/*.mjs`), `video/` (entire folder, 0 files tracked), and 4 zero-byte shell artefacts |
| Tracked files | 504 |
| `docs/` tracked | **0** — the whole folder was gitignored as "internal working docs, strategy kit & organizer material"; `client/CONTRACT.md` (the file `api.js` tells contributors to code against) was also ignored |
| Contract suite | `node functions/dappa_api/test/run.mjs` → **RESULT: 803 passed, 0 failed** (CAPABILITIES.md:776 still says 623) |
| i18n parity gate | `node scripts/check_i18n.mjs` → **OK**, 12 namespaces, en=5286 kn=5369 (CAPABILITIES.md:777 says 5,285) |
| CI | `.github/workflows/pages.yml` only: builds the static demo and deploys GitHub Pages on push to `main`. **No test job** — neither suite runs in CI |

## 2. Root hygiene (Phase 1.3 input)

| Location | Junk entries | Tracked | Untracked/ignored |
|---|---:|---:|---:|
| repo root (82 entries, 19 legitimate) | 63 | 23 (`0`, `0.95`, `1`, `100000`, `195`, `20`, `200`, `22`, `6`, `NOT`, `Top`, `live`, `missing`, `rows`, `second-oldest`, `shown`, `still`, `v`, `a.csv`, `g.csv`, `o.csv`, `p.csv`, `t.csv`) | 40 (code-fragment names, `$p`, `%d`, `Import_*.zip`, root Playwright install) |
| `client/` | 14 tracked (`0`, `0.66`, `1`, `b.key`, `x.key`, `c.locked`, `d.districtId`, `d.value`, `fallback`, `h.crimeHeadId`, `h.value`, `r.value`, `s`, `s.name`) + 5 ignored | 14 | 5 |
| `functions/dappa_api/` | 8 tracked (`0`, `22`, `23`, `24`, `different`, `r.districtId`, `r.hourBandStart`, `spy`) | 8 | 0 |

Root cause, verified today: on this Windows workstation the agent shell turns
`>` / `<` inside quoted `node -e "…"` strings into redirects, so every one-liner
containing an arrow function leaves a zero-byte file named after the code
fragment. Several of today's artefacts are timestamped from this session. Two
earlier purge commits (`f8fb548`, `2a1103a`) removed 309 files; they came back
because the guard was a gitignore pattern, not a check. Both `.key` files are
0 bytes — artefacts, not credentials.

## 3. Catalyst services — declared vs deployed

`functions/dappa_api/lib/servicemap.js` declares **28** services (23 with a real
call site). `GET /meta/services` on the Development deployment, 27 Aug 2026:

| Status | Count | Services |
|---|---:|---|
| live | 9 | serverless-functions, event-functions, cron-job-scheduling, data-store, data-store-search¹, nosql, stratus, cache, authentication |
| active | 5 | push-notifications, zia-text-analytics, zia-ocr, quickml-pipelines, smartbrowz |
| platform | 2 | web-client-hosting, api-gateway |
| console-pending (env var missing, flag on) | 7 | file-store (`FILESTORE_FOLDER_ID`), mail (`MAIL_FROM`, `DIGEST_TO`), circuits (`CIRCUIT_ID`), connections (`CONNECTION_LINK_NAME`), zia-language (`ZIA_TRANSLATE_URL`), zia-automl (`ZIA_AUTOML_MODEL_ID`), quickml-llm-rag (`QUICKML_LLM_URL`) |
| console-pending (structural) | 5 | appsail-managed, appsail-oci, domain-mappings, signals-cross-app, pipelines |

¹ data-store-search is *live* in status but its own `statusReason` says it
"falls through to ZCQL LIKE until the columns are marked searchable in the
console" — a console step, not a code step.

`README.md:122-143` lists **16** services with no status column and says
"Stretch (roadmap): Circuits, ConvoKraft" although `lib/circuits.js` calls
`circuit().execute()` behind `FEATURE_CIRCUIT`. There are no
`SERVICES:START/END` markers.

## 4. Environment (functions/dappa_api/catalyst-config.json)

| Item | Observed |
|---|---|
| Flags | all 14 `FEATURE_*` = `on`; `PUBLIC_DEMO=true` |
| Empty env vars | 14: `FORCE_FIXTURE_TABLES`, `QUICKML_OUTCOME_URL`, `QUICKML_LLM_URL`, `QUICKML_ENDPOINT_KEY`, `QUICKML_API_KEY`, `ZIA_AUTOML_MODEL_ID`, `ZIA_TRANSLATE_URL`, `ZIA_API_KEY`, `MAIL_FROM`, `DIGEST_TO`, `FILESTORE_FOLDER_ID`, `CIRCUIT_ID`, `CONNECTION_LINK_NAME`, `CONNECTION_TARGET_URL` (13 tied to a flag) |
| **Secret in a tracked file** | `QUICKML_STATUS_ENDPOINT_KEY` holds a 96-hex-char value, committed in `1c1794a`, present on `origin/main`. Policy (CLAUDE.md, master prompt) says this file keeps empty strings. Needs rotation + blanking (Phase 1) |
| `APP_BASE_URL` | `…-60079891305.development.catalystserverless.in/app` — Development, not Production. `.catalystrc` lists only the Development environment; the CLI has no promotion command, so Production is a console step |
| Data completeness (`/healthz`) | 94.8 % overall; `ChargesheetDetails` **12,600 / 31,655 (39.8 %)**; every other table 100 %. Resume offset per `scripts/.apiload_state.json` = 12,600; AggMonthly already complete (34,021), so runbook step 2 is stale |
| NoSQL | `/healthz` reports `nosql.mode = fixture-demo` while `/meta/services` reports it `live` |

## 5. Documentation consistency (Phase 1.1 / 1.2 input)

| Document | Observed |
|---|---|
| `CAPABILITIES.md` | Two incompatible versions in one file. Scorecard (L22-27): C1 240 · C2 **139** · C3 167 · C4 173 · C5 **121** · C6 125, "all six clear". Body: What-changed table (L59) C5 85, C2 105; C5 heading (L451) "85 ❌ SHORT BY 15"; "Why it is still short" (L500-529) lists the five C5 items as *missing* that L33-35 say were *built*; Shortfall (L666-687) C5 −15, "union 159"; Overlap matrix (L746-753) diagonal 240/105/167/173/85/125 = 895 (L83). Audit date 26 Jul (L12, L774, L801) with one 27 Aug row (L777). Broken anchor `#c5` (L36). Endpoint count "66 routes / 623 tests" (L137, L776) vs 74 distinct paths / 803 checks today |
| `README.md` | Scorecard (L104-113) is the audit *before* CAPABILITIES': 186/62/119/106/45/85, "three do not clear". Links `#shortfalls` (anchor is `#shortfall`), "14 backend-only endpoints" (now 10). No deployed URL anywhere; team table `_TBD_` |
| `FEATURES.md` | 808 entries numbered 1..808 in nine *area* sections; **no capability tags, no infrastructure marker, no overlap declaration**, so none of the six scorecard numbers can be derived from it. Entry 665 is marked RETIRED but still counted; entry 704 still advertises the removed 60 s health polling. Lacks the ~230 post-26-Jul features CAPABILITIES counts |
| `docs/DECISIONS.md` | Stops at D-007 (2026-07-24). Undocumented since: Hindi retirement, browser Web Speech instead of Zia speech, admin/viewer role model, `FORCE_FIXTURE_TABLES` + blanked detection-rate KPI, Circuits inline fallback, shipping the Development URL |
| `docs/ROADMAP.md` | Item 1 (Circuits) already implemented behind a flag; item 4 half done (Kannada UI shipped, "Zia speech" contradicted — no Catalyst TTS exists); item 5 plumbing exists (manifest, install prompt, push.js) with no service worker or beat view |
| `docs/CONTRACTS.md` | 24 documented endpoints vs **74** registered; 6 flags documented vs 14 read by `lib/flags.js` |
| `docs/CONSOLE_SETUP.md` | Names `CATALYST_QUICKML_KEY`, which no code reads (code reads `QUICKML_API_KEY` / `QUICKML_ENDPOINT_KEY`); no click-path for searchable columns or Production promotion |
| `docs/04_SUBMISSION_KIT.md` | Repo URL placeholder `<you>`, no Catalyst/video URL; cites benchmarks (p95 latency, Lighthouse ≥ 85) that do not exist in `docs/benchmarks/` |
| Hindi | Client: retired (en + kn only). API: `lib/zia.js` still declares `TRANSLATION_LANGS ['en','kn','hi']` with Hindi glossary values; `servicemap.js:230` says "trilingual"; `docs/screenshots/11-dashboard-hi.jpg` survives; `scripts/deck_content.py` still cites the Hindi screenshot |

## 6. Models (`/ml/models`)

| Model | Status | Metric |
|---|---|---|
| Embedded logistic outcome model (A vs C) | serving | AUC 0.78 (12 features) |
| QuickML case-status Random Forest | serving | **AUC 0.500** (accuracy 0.749) — disclosed as a negative result |
| QuickML outcome deployment | console-pending | needs `QUICKML_ENDPOINT_KEY`/`QUICKML_OUTCOME_URL` + `QUICKML_API_KEY` |
| Zia AutoML outcome | console-pending | needs `ZIA_AUTOML_MODEL_ID` |

## 7. Decisions taken in Phase 0

1. **`.gitignore` now whitelists engineering docs.** `docs/DECISIONS.md`,
   `ROADMAP.md`, `CONTRACTS.md`, `CONSOLE_SETUP.md`, `SCHEMA_CHECKLIST.md`,
   `benchmarks/`, `screenshots/` and every `ROUND2_*` / research document are
   tracked from this commit. The agent master prompts (`docs/0*_*.md`), the
   organizer's ER diagram and its text extract, `docs/media/`, deck previews and
   `*.pptx` stay local. `client/CONTRACT.md` is tracked. Reason: the Round-2
   plan makes these documents part of the submission; a judge cannot check a
   file that is not in the repository.
2. **`video/`**: only `video/script/` (the produced 3-minute narration, 17 KB)
   and `video/logs/` (production QA notes) are tracked; renders, b-roll,
   voice-over and working files (≈ 480 MB) stay local.
3. The uncommitted `.gitignore` change found at the start of Phase 0 (video
   working-file ignores) is kept, folded into the rewrite above.

## 8. Phase-1 work list derived from this baseline

1.1 Reconcile `CAPABILITIES.md` to one set of numbers, re-derived from a tagged
catalog (FEATURES.md gains capability tags and the ~230 uncatalogued features),
and add a consistency test. 1.2 Generate the README service table from
`servicemap.js` (28 rows, with status) and remove the Circuits "roadmap" line.
1.3 Purge 45 tracked + ~45 ignored artefacts across root, `client/`,
`functions/dappa_api/`; add `scripts/check_tree_hygiene.mjs` as pre-commit hook
and CI step; move the Playwright dependency under `video/`. 1.4 Promote to
Production (console), re-point `APP_BASE_URL`. 1.5 Finish the Hindi retirement
(zia.js glossary/langs, servicemap wording, screenshot, deck script). Plus:
blank and rotate `QUICKML_STATUS_ENDPOINT_KEY`; add a CI test job.

## 9. Tag calibration (Phase 1.1, 27 Aug 2026)

Every `FEATURES.md` entry was tagged under the Round-2 counting rule by six
independent passes (135 entries each) and the post-July additions were
catalogued from `git diff 87bd651..HEAD` (143 proposed, 94 admitted after
sampling). Four skeptics then sampled the result without seeing each other:

| Sample | Entries | Disagreements | Rate | Direction |
|---|---:|---:|---:|---|
| infra-A (every 9th `[infra]` entry) | 61 | 1 | 1.6 % | one per-case lag analytic (126) wrongly infra — its three siblings (125, 174, 175) corrected with it |
| infra-B (offset sample of `[infra]`) | 61 | 0 | 0 % | none |
| scored-A (every 6th scored entry) | 60 | 10 | 16.7 % | 8 double-counts → infra, 2 under-tags (532, 902) |
| scored-B (offset sample of scored) | 59 | 10 | 16.9 % | 7 double-counts → infra, 3 under-tags (566, 789, 476), 1 wrong capability (164) |

The double-counts shared one shape — a selector, filter, cross-filter,
deep-link, playback control, provenance badge, methodology text or shared
component inheriting the tag of the analytic it sits next to — so a full
sweep of all 345 scored entries looked for exactly that class (3 finders,
one adversarial verifier each). 24 proposals, 24 confirmed, all demoted. Three
components built on 26 July (`SocioBoard.jsx`, `SocioContext.jsx`, the
GeoIntel density/urban/bivariate modes) were found to be in neither audit
and were added as entries 903-905.

Net effect on the derived counts (before calibration → after):
C1 142 → 134 · C2 87 → 81 · C3 86 → 81 · C4 89 → 85 · C5 46 → 44 · C6 61 → 52;
scored entries 355 → 324 (33 backend-only), infrastructure 546 → 580,
attributions 511 → 477. The residual error after calibration is unknown but
the sampled rate in the demoted direction was ~13 % before the sweep, so the
±8 tolerance stated in CAPABILITIES.md is a floor, not a guarantee — which is
why the document rounds nothing up.

