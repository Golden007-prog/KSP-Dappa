# Round 2 · Phase 8 — console steps for the lead

Numbered click-throughs in docs/CONSOLE_SETUP.md style. Console: https://console.catalyst.zoho.com (IN DC) → **Project-Rainfall** (id `50643000000013024`, org `60079891305`). Every env value goes into `functions/dappa_api/.env.deploy` (gitignored) and ships with `node scripts/deploy.mjs`; the tracked `catalyst-config.json` keeps `""`. **The demo works with every step below undone** — each one upgrades a labelled fallback to the live Catalyst service.

## 1. Data Store OLAP (rows 155) — `FEATURE_OLAP` is already `on`

1. Console → **Cloud Scale ▸ Storage ▸ Data Store** → top-right **OLAP Database** (or the *Analytics* tab) → **Enable**. Wait for the status to read *Enabled* (the live probe currently returns `OLAP System is not available`).
2. `.env.deploy`: `OLAP_ENABLED=on`.
3. Deploy, then verify: `curl "$BASE/meta/olap-benchmark?nocache=1"` → `data.legs.olap.ok:true`, compare `legs.olap.ms` with `legs.zcql.ms` (1,027 ms on 28 Aug) and check `rowsAgree:true`. If `legs.olap.possiblyCapped` is true, OLAP shares the 300-row cap and `lib/olap.js` needs paging before it is used for the cube — leave `OLAP_ENABLED` unset in that case.
4. After phase 4 lands, apply the one-line `/tiers/state` swap in decisions D-phase8-2.

## 2. Job Scheduling (row 156) — `FEATURE_JOBS` is already `on`

1. The pool already exists: Console → **Job Scheduling ▸ Job Pools** shows **dappanightly** (id `50643000000453771`, Function, 512 MB). Nothing to create.
2. `.env.deploy`: `JOB_POOL_NAME=dappanightly` (optionally `JOB_RETRIES=2`, `JOB_RETRY_INTERVAL_SEC=900` — already the defaults in the tracked config).
3. Deploy, then submit one job from the **/about ▸ Nightly run ▸ Run now** button with the demo token, or `curl -X POST -H "x-admin-token: demo-admin" "$BASE/admin/jobs/nightly-refresh"` → `data.mode:"job"`, `data.jobId`. Poll `GET $BASE/admin/jobs/<jobId>` (same header) until `status:"successful"`; the console **Job Scheduling ▸ Jobs** list shows the same run with retries.
4. Optional: move the 02:00 IST schedule from the legacy cron to **Job Scheduling ▸ Crons ▸ Create** (Calendar, daily 02:00 Asia/Kolkata, target Function `dappa_nightly`, pool `dappanightly`) and disable the legacy cron so the nightly gets retries too.

## 3. Zia object recognition, moderation and OCR (rows 158, 161, 169) — flags already `on`

1. Nothing to enable: all three answered live on 28 Aug (OCR confidence 97 on fir_01; moderation weapon 1.0 on the knife scene; object detection returns nothing/`scissors` on the procedural drawings — decisions D-phase8-3/4/5).
2. Budget: Zia is a pooled **100 calls/month**; this phase spent 9. The OCR page spends **2 calls per scan** (moderation + OCR). Turn `FEATURE_ZIA_MODERATION=off` if the intake guard is not worth a call during judging — the page then shows *Not screened* honestly.
3. Optional Kannada check (1 call): `node scratch/probe.mjs $BASE ocr fir_01` with `language:'kan'` in the body — record the result in decisions.

## 4. APM + Logs (row 163)

1. Console → **DevOps ▸ APM** → **Enable** for `dappa_api` (free tier 5,000 requests). Console → **DevOps ▸ Logs** needs nothing.
2. `.env.deploy`: `APM_ENABLED=on` (attestation only — the SDK has no read API; the About card keeps reporting in-function latency and says so).
3. Optional: **DevOps ▸ Application Alerts ▸ Create** → *Cron* → `dappa_nightly` → on failure → email (5 alerts allowed in development).

## 5. Authentication roles per tier (rows 160, 171)

1. Console → **Cloud Scale ▸ Authentication ▸ Roles** → **+ Create Role** four times: `Constable` (App User scopes), `SHO`, `SP`, `DGP` (DGP may inherit App Administrator). Copy each **Role ID**.
2. `.env.deploy`: `AUTH_ROLE_ID_BEAT=<Constable id>`, `AUTH_ROLE_ID_STATION=<SHO id>`, `AUTH_ROLE_ID_DISTRICT=<SP id>`, `AUTH_ROLE_ID_STATE=<DGP id>`.
3. Invite a judge account: `curl -X POST -H "x-admin-token: demo-admin" -H "Content-Type: application/json" -d '{"email":"<judge email>","tier":"station"}' "$BASE/auth/invite"` → `invited:true` (development cap 25 users). Signing in as that user makes `GET /auth/me` return `tier:"station"` and the app opens on the Station console.
4. **Decision for the lead:** set `FEATURE_AUTH_EMBED=on` only if the embedded sign-in card (Catalyst Web SDK from static.zohocdn.com — decisions D-phase8-11) is wanted on the judged deployment. Off, the OCR page uses the demo token; on, the Catalyst sign-in form renders inside the card on the Catalyst host.

## 6. QuickML AutoML challenger (row 170) — `FEATURE_QUICKML_AUTOML` is already `on`

1. Console → **QuickML ▸ Create Pipeline** → tick **Create an Auto-generated pipeline using AutoML** → dataset `pipeline/out/quickml_case_outcome.csv` (from `python3.12 pipeline/analytics.py`), target `cstype` (A/C). Confirm no caste/religion column is present (the pipeline never emits them).
2. Train → open the evaluation tab → note **ROC-AUC** (write it down; it is displayed beside the champion's).
3. **Deploy** the best version → **Endpoints** → copy the **endpoint key**.
4. `.env.deploy`: `QUICKML_AUTOML_ENDPOINT_KEY=<key>`, `QUICKML_AUTOML_AUC=<the AUC you noted, e.g. 0.81>`.
5. Verify: `curl -X POST -H "Content-Type: application/json" -d '{"districtId":"0101","crimeSubHeadId":303,"hour":23}' "$BASE/predict/outcome/challenger"` → `status:"serving"`, `challenger.probability`, `agreement.word`.

## 7. LLM answer composer (row 167) — `FEATURE_QUICKML_LLM` is already `on`

1. Console → **QuickML ▸ Generative AI ▸ LLM Serving** → pick **GLM 4.7 Flash** (the Qwen models are deprecated) → deploy as a Generative AI endpoint → **API Details** → copy the endpoint URL and the OAuth token/API key (docs/CONSOLE_SETUP.md §2 describes the same screens for the RAG endpoint).
2. `.env.deploy`: `QUICKML_LLM_URL=<endpoint URL>`, `QUICKML_API_KEY=<key>` (both already exist as keys).
3. Verify: `curl -X POST -H "Content-Type: application/json" -d '{"q":"total FIRs last month","tier":"beat"}' "$BASE/copilot/compose"` → `engine:"quickml-llm"` with `firewall.passed:true`, or `engine:"deterministic"` with `firewall.mode:"rejected"` and the invented numbers listed. If the endpoint's request body key is not `question`, adjust `buildPrompt`'s caller in `lib/composer.js` (one line) — the response reader already accepts `answer|response|text|output`.

## 8. SmartBrowz map screenshot (row 157) — `FEATURE_SMARTBROWZ` is already `on`

1. No console object to create. The call fails under an anonymous context with `No such User with the given id exists` (decisions D-phase8-8), exactly like `convertToPdf`. Whatever fixes the brief PDF (a signed-in Catalyst session on the request, or the project-level SmartBrowz permission the console offers under **SmartBrowz ▸ Settings**) fixes this one; verify with `curl -X POST -H "Content-Type: application/json" -d '{"districtId":"0101"}' "$BASE/reports/map-snapshot?nocache=1"` → `mode:"screenshot"`, `key`.
2. Budget: **50 PDFs/month** pooled with the brief; the snapshot is cached 6 h per district.

## 9. Stratus pre-signed links (row 154)

1. Nothing to create; bucket `dappa-import` exists. Pre-signed URLs need the same user context as step 8; until then `GET /reports/artifacts/:id/url` returns the API proxy path and says so.

## 10. Deploy and smoke

1. `node scripts/deploy.mjs` (injects `.env.deploy`), then `node scripts/smoke_test.mjs "$BASE"`.
2. New-endpoint smoke: `GET /meta/nightly`, `GET /meta/observability`, `GET /olap/cube`, `GET /zia/objects/samples`, `GET /ocr/samples`, `GET /auth/roles`, `POST /zia/objects {"sceneId":"scene_03","caseId":"1"}` — all must be 200 with `meta.source` naming the engine.
3. Open `/app/index.html#/ocr`, pick a sample, confirm the engine badge reads **Zia OCR**; open `/app/index.html#/cases/1` and confirm the *Evidence objects* card renders with its source badge; open `/about` and scroll to *Nightly run* / *Function health*.
4. Revert the workstation CLI change if wanted: `catalyst config:set node20.bin=` (decisions D-phase8-15).
