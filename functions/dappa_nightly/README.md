# dappa_nightly — nightly analytics refresh (Catalyst cron function, Python)

Refreshes the derived analytics tables from `CaseMaster`:

1. **AggMonthly** — exact recompute, then delta upsert (only changed rows are written).
2. **AnomalyAlert** — weekly robust z-scores (median/MAD, |z| ≥ 2, severity 1–3) per district × crime head; previous `OPEN` alerts are replaced, acknowledged ones kept.
3. **StationRisk** — `100 · minmax(0.45·trend-slope + 0.35·hotspot-proximity + 0.20·anomaly-weight)` with human-readable `DriversJson`.
4. **ForecastMonthly** — seasonal-naive (month−12) with 80% CI, `naive-mean3` under 13 months of history. Always written locally; in cloud mode it only overwrites the table when `DAPPA_REFRESH_FORECAST=1`, so the pipeline's Holt-Winters rows survive by default.
5. Refresh timestamp — `RefreshMeta` row in cloud mode (best effort), `refresh_meta.json` locally.
6. **Catalyst Mail digest** — the recomputed alerts rendered and sent through `app.email()`. Runs last, after everything is persisted, and never raises: a mail misconfiguration costs the digest, not the refresh. Flag `FEATURE_MAIL` (off by default) with `MAIL_FROM` (a console-verified sender) and `DIGEST_TO` (comma-separated). Fallback: the rendered digest is logged and returned as `meta["digest"]["preview"]`, and `mode` reports exactly why it did not send (`disabled` / `not-configured` / `no-send-method` / `error-fallback`). Dry runs always report `local-dryrun`.

No statsmodels/scikit-learn: seasonal-naive/linear methods keep the function inside Catalyst limits (see master spec §4 vendoring note).

## Files

- `catalyst-config.json` — cron function, `python_3_12` stack, entry `main.py` (`handler(cron_details, context)`).
- `main.py` — entry point + mode switch; also runnable directly for dry runs.
- `nightly_core.py` — pure pandas/numpy refresh logic (deterministic).
- `notify.py` — Catalyst Mail digest (render + guarded send).
- `store_local.py` / `store_catalyst.py` — CSV vs Data Store I/O.
- `test_fixture/` — deterministic tiny dataset (`make_fixture.py` regenerates it).

## Local dry run (no Catalyst needed)

```bash
LOCAL_DRYRUN=1 DAPPA_OUT=functions/dappa_nightly/test_fixture \
DAPPA_NOW="2026-07-24 02:00:00" python3.12 functions/dappa_nightly/main.py
```

Reads `<DAPPA_OUT>/<Table>.csv`, writes `<DAPPA_OUT>/_nightly_out/` (AggMonthly.csv, AggMonthly_delta.csv, AnomalyAlert.csv, StationRisk.csv, refresh_meta.json). `GravityOffence.csv`, `CrimeHead.csv` and `HotspotCluster.csv` are optional lookups; without them the heinous ID defaults to `1` (env `DAPPA_HEINOUS_ID`) and crime heads are labeled by ID.

## Scheduling

Console → Cron: daily 02:00 IST targeting `dappa_nightly` (master spec §8.7 — keep manual trigger during judging). Caste/religion columns are stripped on load and never used.
