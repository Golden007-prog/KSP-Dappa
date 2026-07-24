# Console Setup — Catalyst AI integrations (Phase 7)

Manual console procedures the CLI cannot perform. Work top-to-bottom; each step
ends with the environment variable(s) to set on `dappa_api` and the feature
flag to flip. **The app is fully demoable with every flag off** — do these to
upgrade fallbacks to live Catalyst AI, never to unblock the demo.

**Console:** https://console.catalyst.zoho.com (or `.in` — open whichever DC your
CLI login lands on) → sign in as `basuoikantik@gmail.com` → project
**Project-Rainfall** (id `50643000000013024`, org `60079891305`).

**Setting env vars on `dappa_api`** (referenced by every step below):
Console → Project-Rainfall → left nav **Develop ▸ Functions** → click
**dappa_api** → **Configuration** (gear) tab → **Environment Variables** →
**+ Add** → enter key/value → **Save**. If a changed value does not take effect
on the next request, redeploy once: `catalyst deploy` from the repo root.

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

> **Set on `dappa_api`:** `QUICKML_OUTCOME_URL=<endpoint URL>`,
> `CATALYST_QUICKML_KEY=<API key>` · **Flip:** `FEATURE_QUICKML=on`

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

> **Set on `dappa_api`:** `QUICKML_LLM_URL=<endpoint URL>` (key: reuse
> `CATALYST_QUICKML_KEY`) · **Flip:** `FEATURE_QUICKML_LLM=on`
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

---

## After flipping any flag

1. Redeploy if needed: `catalyst deploy`.
2. Re-run the smoke suite against the deployed URL:
   `node scripts/smoke_test.mjs <URL>` — every endpoint must stay green; a
   flipped flag changes `meta.source` from `fallback-local` to live, never the
   response shape.
3. Warm the cache: `node scripts/warmup.mjs <URL>`.
