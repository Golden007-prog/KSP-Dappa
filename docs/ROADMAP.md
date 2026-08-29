# ROADMAP.md — post-datathon stretch items

Anything not in the Definition of Done lands here instead of gold-plating the
prototype. Ordered roughly by value-for-effort. Items marked *(deck slide 14)*
feed the "Future development" slide.

*Revised 29 August 2026, after the Round-2 build.* Four of the original seven
items shipped and have been struck from the list with a note saying where they
landed; the rest are re-scoped against what Round 2 learned about the platform.

## Shipped in Round 2 — kept here only to say where they went

- ~~**Circuits orchestration**~~ — **not possible on this deployment.** Catalyst
  documents Circuits as unavailable to IN-data-centre users (three Circuits
  pages carry the exclusion; `docs/CATALYST_SERVICE_RESEARCH.md` §3), and this
  project runs on `.catalystserverless.in`. The identical steps run sequentially
  in `lib/circuits.js` and the nightly refresh is the `dappa_nightly` cron
  function; **Job Scheduling** (pool `dappanightly`) is the Catalyst-native
  replacement and is wired in `lib/jobs.js`. See D-019 and D-P3-3.
- ~~**Kannada UI**~~ — shipped. 19 namespaces, English ↔ Kannada parity gated by
  `scripts/check_i18n.mjs` in CI. The **Zia speech** half is not shippable:
  no speech or translation method exists in the Zia docs index or in
  `zcatalyst-sdk-node@3.4.0`, so read-aloud and voice input use the browser's
  own Web Speech API (D-014) and the pinned glossary serves `/zia/translate`.
- ~~**Beat-officer PWA + Push Notifications**~~ — shipped. `/beat` and
  `/station` with a hand-written service worker (offline last-fetched beat
  card), maskable icons and manifest shortcuts; push registration is wired
  behind `FEATURE_PUSH` with the in-app notification centre serving anonymous
  visitors, because Catalyst push is addressed by signed-in user email.
- ~~**CCTNS adapters**~~ — the ingest half shipped as `/ingest`: a CSV in the
  official ER column format is validated (30 reason codes), mapped, previewed,
  loaded in ≤200-row chunks with a resume token, audited into `ActionLog` and
  reported on with a rejection CSV and a "what changed" card. What remains is
  below as item 4.

## Still ahead

1. **Finish the Production environment — data done, env still pending.** The
   environment answers at `project-rainfall-60079891305.catalystserverless.in`,
   and as of **29 Aug 2026 its Data Store is fully loaded**: `node
   scripts/prod_load.mjs` imported all 34 tables (34 ok, 0 failed) and
   `/healthz` there now reports **100% completeness across all 13 tracked
   tables** — 45,000 CaseMaster, 53,836 Victim, 60,948 ActSectionAssociation.
   The loader needed one fix to get there: the CLI asks *two* questions, and
   answering only the Stratus-bucket prompt left every import parked on "Do you
   like to download the report of this job? (y/N)".

   What remains is **environment variables**, and it is a console step by
   construction: `catalyst deploy` has no `--production` flag (it deploys to
   Development only), and the console's *Deploy to Production* migrates code and
   schema but neither rows nor env values. So Production currently runs with
   `quickml`, `zia`, `smartbrowz`, `mail`, `push` and `circuit` all **off** — it
   serves real data through the documented fallbacks, and `/about` reports each
   service honestly. Completing it means re-entering the function env under the
   Production switch, re-pointing `APP_BASE_URL`, and redeploying. Development
   remains the submitted URL, and the README says so rather than implying
   otherwise.

2. **A real identity-resolution scorer.** The current one measures precision
   0.032 / recall 0.571 at threshold 0.92 on the planted ground truth, and the
   Round-2 audit found why: the exact-name anchor pass merges everyone who
   shares a common Kannada name. Dropping that pass lifts best F1 from 0.074 to
   0.354 in the offline sweep (`docs/benchmarks/identity_sweep.json`). Changing
   it means regenerating and re-importing the derived tables, which is a data
   migration rather than a code edit — hence post-datathon. The finding is
   published on `/offenders` rather than hidden.

3. **Face identification on photographs.** Zia's Identity Scanner genuinely
   compares faces (measured: 0.841 for the same generated person, 0.617 for two
   different ones — `docs/benchmarks/face_zia_probe.json`), but Zia Face
   Analytics cannot see a procedurally drawn face at all, so the quality gate is
   advisory on our synthetic gallery. On real casework photographs the gate
   becomes real, the local descriptor engine retires, and the model card needs
   re-measuring on that population — including the demographic breakdown the
   card currently can only cite from NIST rather than measure.

4. **CCTNS / ICJS ingest adapters** *(deck slide 14)* — `/ingest` takes the
   official ER column format today; a real deployment needs the actual Police-IT
   export column names (the IIF form list is verified, the export columns are
   not), incremental sync rather than batch upload, and the PII handling,
   access control and retention rules that real police data requires.

5. **Inter-state data exchange** *(deck slide 14)* — federate identity
   resolution and network analysis across state boundaries (the `State` /
   `NationalityID` dimensions already exist in the ER), enabling cross-border
   offender tracking under data-sharing agreements.

6. **ConvoKraft alternate copilot** — a ConvoKraft NLU bot invoking the same
   Catalyst Functions as Ask-DAPPA, as a flag-switchable alternative and for
   guided slot-filling flows. It stays a roadmap item honestly: ConvoKraft is
   English-only and its actions need Integration Functions or Deluge, neither of
   which is available to us in the IN data centre.

7. **Outcome-trained models.** The action loop now records what an officer
   decided and what happened, and `/alerts/outcomes` reports how many labels
   exist against the minimum a retrain would need. When the labels are there,
   the alert scorer can be trained on them instead of on planted anomalies —
   the point at which DAPPA stops being a demonstration and starts learning from
   the force that uses it. Nothing today claims online learning; the payload
   carries `onlineLearning: false`.
