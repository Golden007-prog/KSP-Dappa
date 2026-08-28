# Console Setup — Catalyst AI integrations (Phase 7)

Manual console procedures the CLI cannot perform. Work top-to-bottom; each step
ends with the environment variable(s) to set on `dappa_api` and the feature
flag to flip. **The app is fully demoable with every flag off** — do these to
upgrade fallbacks to live Catalyst AI, never to unblock the demo.

**Console:** https://console.catalyst.zoho.com (or `.in` — open whichever DC your
CLI login lands on) → sign in as `basuoikantik@gmail.com` → project
**Project-Rainfall** (id `50643000000013024`, org `60079891305`).

**Setting env vars on `dappa_api`** (referenced by every step below). Two
places must agree, because `catalyst deploy` ships the tracked
`functions/dappa_api/catalyst-config.json` verbatim and would blank whatever
the console holds:

1. Put the real value in `functions/dappa_api/.env.deploy` (gitignored,
   `KEY=value` per line) and deploy with `node scripts/deploy.mjs` — the
   wrapper injects the values for the duration of the deploy and restores the
   tracked file. **Never** paste a real value into `catalyst-config.json`.
2. Optionally also set it in the console for immediate effect without a
   redeploy: Console → Project-Rainfall → left nav **Develop ▸ Functions** →
   **dappa_api** → **Configuration** (gear) → **Environment Variables** →
   **+ Add** → **Save**. The next deploy must still carry the value (step 1).

Since 27 Aug 2026 the key names below match what `lib/quickml.js`,
`lib/zia.js` and `lib/servicemap.js` actually read (`requires` fields);
`CATALYST_QUICKML_KEY`, which no code reads, is gone.

---

## 1. QuickML — case-outcome classifier (tabular)

1. Console → Project-Rainfall → left nav **QuickML** (under AI/ML) → **Create Pipeline**.
2. Name: `dappa_outcome`. Dataset: **Upload** → `pipeline/out/quickml_case_outcome.csv`
   (written by `python3.12 pipeline/analytics.py`).
3. Target column: **`cstype`** (binary A/C). Confirm caste/religion columns are
   absent from the dataset — the pipeline never emits them (organizer rule).
4. Preprocessing stages: **missing-value imputation** → **categorical encoding**
   (one-hot/label as offered). Keep all remaining feature columns.
5. Model stage: **CatBoost Classifier** (fall back to any gradient-boosted tree
   if CatBoost is not offered). → **Train**.
6. When training finishes, open the evaluation tab and record **ROC-AUC**
   (target ≥ 0.75 — the generator plants signal, so this is achievable).
   Screenshot → `docs/screenshots/console_quickml_metrics.png` (deck slide 12).
7. **Deploy** the trained version → copy the **endpoint URL** and **API key**.

> **Set on `dappa_api`:** `QUICKML_ENDPOINT_KEY=<deployment endpoint key>` (SDK
> path) or `QUICKML_OUTCOME_URL=<endpoint URL>` (REST path), plus
> `QUICKML_API_KEY=<API key>` · **Flip:** `FEATURE_QUICKML=on`.
> The case-status Random Forest already deployed on 26 Jul is served through
> `QUICKML_STATUS_ENDPOINT_KEY`, which lives in `.env.deploy` only.

## 2. QuickML — LLM Serving + RAG (Ask-DAPPA copilot)

1. Console → **QuickML** → **LLM Serving** (tab/section) → **Create Knowledge Base**.
2. Name: `dappa_rag`. Upload every file from `pipeline/out/rag_context/`
   (markdown: schema summary, per-district monthly aggregates, offender/community
   summaries, "how to read CrimeNo").
3. Create an **LLM endpoint** with this knowledge base attached (pick the
   default hosted model offered by QuickML — no external providers). → **Deploy**.
4. Copy the endpoint URL (and key if a separate one is issued; otherwise the
   key from step 1 is reused).
5. Screenshot the deployed endpoint page → `docs/screenshots/console_quickml_llm.png`.

> **Set on `dappa_api`:** `QUICKML_LLM_URL=<endpoint URL>` and
> `QUICKML_API_KEY=<API key>` (the same key as step 1 unless a separate one is
> issued) · **Flip:** `FEATURE_QUICKML_LLM=on`
> (copilot badge switches from "Deterministic parser" to "QuickML LLM · RAG")

## 3. Zia Text Analytics (NER/keywords/sentiment on BriefFacts)

1. Console → Project-Rainfall → left nav **Zia Services**.
2. Enable **Text Analytics** (covers sentiment + NER + keyword extraction).
   No dataset upload is needed — `dappa_api` calls the SDK per request.
3. If the console asks for scope confirmation, accept for this project only.
4. Screenshot the enabled state → `docs/screenshots/console_zia.png`.

> **Set on `dappa_api`:** nothing · **Flip:** `FEATURE_ZIA=on`

## 4. SmartBrowz (Weekly Intelligence Brief PDF)

1. Console → Project-Rainfall → left nav **SmartBrowz** → **Get Started/Enable**.
2. No template setup needed — the function calls the PDF-from-URL API against
   the app's print route `/print/brief`.
3. Screenshot the enabled dashboard → `docs/screenshots/console_smartbrowz.png`.

> **Set on `dappa_api`:** nothing · **Flip:** `FEATURE_SMARTBROWZ=on`

## 5. Catalyst Mail (alert digests)

1. Console → Project-Rainfall → left nav **Mail** (under Communicate/Settings).
2. **Add From Address** → `basuoikantik@gmail.com` (or another address you
   control) → complete the email verification link.
3. Wait for the address to show **Verified** in the console list.

> **Set on `dappa_api`:** `MAIL_FROM=<verified address>`,
> `DIGEST_TO=<recipient address>` · **Flip:** `FEATURE_MAIL=on`

## 6. Signals — event function on CaseMaster insert

1. Console → Project-Rainfall → left nav **Signals** (a.k.a. Event Listeners).
2. **Create Signal/Rule** → source: **Data Store** → table **CaseMaster** →
   event **Insert**.
3. Target: the project's **Event function** (bind it if `functions/` ships one;
   if only `dappa_api` + `dappa_nightly` are deployed, mark this step **N/A —
   documented as roadmap** and skip; nothing else depends on it).
4. Test: insert one row via Data Store UI → confirm the event fires (logs).

> **Set on `dappa_api`:** nothing · **Flip:** nothing (server-side wiring only)

## 7. Cron — nightly analytics refresh

1. Console → Project-Rainfall → left nav **Cron** (under Develop/Serverless).
2. **Create Cron** → type: **Function** → target **dappa_nightly**.
3. Schedule: **Every day, 02:00 IST** (`Asia/Kolkata` — project timezone).
4. **During judging keep the cron DISABLED** and use **Run Now** for manual
   triggers — a scheduled run must never race a live demo.

> **Set on `dappa_api`:** nothing · **Flip:** nothing

## 8. API Gateway — routing + throttle

1. Console → Project-Rainfall → left nav **API Gateway** → enable if prompted.
2. **Add API/Route**: method **ANY**, path `/api/v1/*` → target function
   **dappa_api** (pass-through; keep the function's own `/api/v1` base path).
3. Throttling: **60 requests/minute** per client.
4. Authentication on the route: **none/public** (judge access; the function
   itself enforces `PUBLIC_DEMO` semantics).

> **Set on `dappa_api`:** nothing · **Flip:** nothing

## 9. Authentication — public demo mode

1. Console → Project-Rainfall → left nav **Authentication** → **Enable**.
2. Add sign-in method: **Email/password** (default). Do not add social providers.
3. Do NOT put the web client behind a login wall — judges must reach the app
   anonymously. Auth exists for `/admin` actions (ack alert, trigger digest)
   once demo mode is switched off after the datathon.

> **Set on `dappa_api`:** keep `PUBLIC_DEMO=true` (already the default) ·
> **Flip:** nothing

## 10. (Optional) Slate preview deploys + Pipelines CI/CD

1. Console → left nav **Slate** → **Connect Git Repository** → GitHub →
   authorize → repo `ksp-dappa`, branch `main`, root dir `client/`,
   build `npm run build`, output `dist/`. Every push gets a preview URL.
2. Console → **Pipelines** (CI/CD) → connect the same repo → trigger on `main`
   push → deploy step = `catalyst deploy`.
3. These are bonus deploys; **Web Client Hosting stays the primary URL** for
   the submission (same-origin `/server` routing → zero CORS risk).

> **Set on `dappa_api`:** nothing · **Flip:** nothing

## 11. Data Store — mark the search columns full-text searchable

`lib/search.js` calls `search().executeSearchQuery` on every `/search/cases`
request and falls through to ZCQL `LIKE` when the engine answers nothing.

**Done on 28 Aug 2026** (see `docs/round2/decisions-phase3-console.md`): the
*Search Index* toggle lives in each column's **Edit** dialog (Data Store →
table → column row → *Edit* → *Search Index* → *Update*) and the console
offers it for **Var Char columns only** — a Text column's dialog has no such
toggle. Indexed: `CaseMaster.CrimeNo`, `CaseMaster.CaseNo`,
`OffenderProfile.CanonicalName`. `BriefFacts`, `AliasesJson` and `MOTagsJson`
are Text and stay on the ZCQL `LIKE` path, so `GET /search/cases?q=<CrimeNo>`
reports `source: catalyst-search` while a narrative word still reports
`fallback-zcql-like`.

> **Set on `dappa_api`:** nothing · **Flip:** `FEATURE_SEARCH` is already on

## 12. Circuits — not available in the IN data centre (no console step)

The Catalyst documentation lists Circuits as available only in the US data
centre ("EU, AU, IN, JP, SA or CA" users are excluded — three Circuits pages
carry the sentence; see `docs/CATALYST_SERVICE_RESEARCH.md` §3). This project
runs on `.catalystserverless.in`, so `dappa_nightly_refresh` cannot be created
here and `CIRCUIT_ID` stays empty by design. `lib/circuits.js` keeps the exact
`circuit().execute / status / abort` call shape; the identical
aggregate → detect-anomalies → notify steps run sequentially in-process and
the nightly refresh is the `dappa_nightly` **Cron** function (§7). The service
table reports the row as **unavailable in IN DC** rather than console-pending.
Zia AutoML (tabular) is in the same position (§5 of the research); the
embedded logistic outcome model serves `/predict/outcome`.

## 13. Zia — Face Analytics + Identity Scanner (face identification, Phase 6)

1. Console → left nav **Zia** → **Face Analytics** → Enable (detection,
   landmarks, age/emotion/gender — used only as the input quality gate).
2. Console → **Zia** → **Identity Scanner** → Enable **E-KYC face comparison**
   (1:1 comparison of two images with a confidence score; all data centres).
   Document processing (Aadhaar/PAN) is **not** enabled — DAPPA never reads
   identity documents.
3. Console → **Cloud Scale ▸ Stratus** → bucket `dappa-import` (the
   project's existing bucket, `STRATUS_BUCKET`) → prefix `face-gallery/v1/`
   (generated, synthetic faces only — uploaded by `scripts/faces_upload.mjs`
   through the deployed admin endpoint after `node scripts/deploy.mjs`).
4. The `FaceGallery` Data Store table already exists (id 50643000000453380,
   created 28 Aug 2026 — see §15).

> **Set on `dappa_api`:** nothing · **Flip:** `FEATURE_FACE_ID=on`

## 14. Production environment

`catalyst deploy` from the CLI always targets **Development**. Production is
a console-created environment, and — per the Catalyst docs — only **code and
metadata** migrate: Data Store tables come across **empty**, Cache and File
Store contents do not move, and resources cannot be created inside
Production afterwards.

1. Console → project header → **Deploy to Production** → Settings ▸
   Environments ▸ Deployments → **Deploy** → *Yes, Proceed* (requires a payment
   method; the Basic plan is active since 25 Aug 2026). **Done once on
   27 Aug 2026**: `https://project-rainfall-60079891305.catalystserverless.in`
   answers, with every table empty and the flags off — repeat this step after
   the final Development deploy so the Round-2 tables and code migrate.
2. Load the data into Production: `node scripts/prod_load.mjs` (sequential,
   resumable; `catalyst ds:import --table <T> --production <csv>` per table,
   boolean-fixed CSVs from `pipeline/.bool_fixed` first; it answers the CLI's
   "Select a bucket" prompt on stdin, which `bulk_load.js` cannot), then
   `node scripts/verify_load.mjs --production --counts-only` and
   `GET <prod>/healthz?nocache=1` (13 tables at 100 %).
3. Set the Production function's env vars (same list as Development; the
   27 Aug migration did **not** carry the flags — `/healthz` on Production
   reports them off) in **Functions ▸ dappa_api ▸ Configuration** under the
   *Production* environment switch, including the `.env.deploy` secrets.
4. Re-point `APP_BASE_URL` to
   `https://project-rainfall-60079891305.catalystserverless.in/app`, redeploy
   to Development with `node scripts/deploy.mjs`, then **Deploy to Production**
   again so the code change migrates.
5. `node scripts/warmup.mjs https://project-rainfall-60079891305.catalystserverless.in`
   and `node scripts/smoke_test.mjs <same URL>`; walk every route in an
   incognito window.

> **Set on `dappa_api`:** `APP_BASE_URL=<production /app URL>` · **Flip:** nothing

## 15. Round-2 resources created on 28 Aug 2026 (Development)

All created in the console by the lead and verified on the resulting page;
`docs/round2/decisions-phase3-console.md` has the column-by-column record.

| Resource | Name | Id | Used by |
|---|---|---|---|
| Data Store table | `ActionLog` | 50643000000453003 | action loop (`lib/actionlog.js`), ingest audit |
| Data Store table | `FaceGallery` | 50643000000453380 | face identification (`lib/faces.js`) |
| File Store folder | `dappa_reports` | 50643000000453759 | `FILESTORE_FOLDER_ID` → report archive |
| Job Scheduling pool | `dappanightly` (Function, 512 MB) | 50643000000453771 | `lib/jobs.js` nightly refresh job |

Console rules learned: table/folder names accept letters, digits and `_`;
job-pool names accept letters and digits only; a table's *Search Index*
toggle exists for Var Char columns only; "Deploy to Production" migrates
schema and code but neither rows nor env values.

> **Set on `dappa_api`:** `FILESTORE_FOLDER_ID=50643000000453759` (tracked — it is an id, not a credential) · **Flip:** nothing

---

## After flipping any flag

1. Redeploy if needed: `node scripts/deploy.mjs` (wraps `catalyst deploy`).
2. Re-run the smoke suite against the deployed URL:
   `node scripts/smoke_test.mjs <URL>` — every endpoint must stay green; a
   flipped flag changes `meta.source` from `fallback-local` to live, never the
   response shape.
3. Warm the cache: `node scripts/warmup.mjs <URL>`.
