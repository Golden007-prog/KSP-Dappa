# ROADMAP.md — post-datathon stretch items

Anything not in the Definition of Done lands here instead of gold-plating the
prototype. Ordered roughly by value-for-effort. Items marked *(deck slide 14)*
feed the "Future development" slide.

1. **Circuits orchestration** *(deck slide 14)* — replace the single
   `dappa_nightly` cron with a Catalyst Circuits workflow: generate → aggregate
   → hotspots → forecasts → anomalies → network as discrete, retryable steps
   with per-step observability and partial re-runs.

2. **ConvoKraft alternate copilot** — a ConvoKraft NLU bot (JS SDK embed)
   invoking the same Catalyst Functions as Ask-DAPPA, as a flag-switchable
   alternative when QuickML LLM Serving is unavailable on an org; also gives
   guided-conversation flows (slot-filling for district/date-range).

3. **Slate Git auto-deploy** — connect the GitHub repo to Slate for per-push
   preview URLs of `client/`, keeping Web Client Hosting as the stable
   submission URL; promotes review-app workflow for the UI.

4. **Kannada UI + Zia speech** *(deck slide 14)* — i18n layer with a full
   Kannada translation (ಕನ್ನಡ) of the command-center UI, plus Zia speech
   services for voice-driven copilot queries in Kannada and English.

5. **Beat-officer PWA + Push Notifications** *(deck slide 14)* — a mobile-first
   installable PWA for beat officers: my-beat risk card, nearby hotspots,
   assigned-case list; Catalyst Push Notifications deliver anomaly alerts for
   the officer's jurisdiction.

6. **CCTNS adapters** *(deck slide 14)* — replace the synthetic generator with
   ingest adapters for real CCTNS/KSP exports (same official ER schema, so the
   mapping is column-for-column), with PII handling, access control, and audit
   logging appropriate for production police data.

7. **Inter-state data exchange** *(deck slide 14)* — federate identity
   resolution and network analysis across state boundaries (the `State` /
   `NationalityID` dimensions already exist in the ER), enabling cross-border
   offender tracking with data-sharing agreements.
