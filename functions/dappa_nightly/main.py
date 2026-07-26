"""dappa_nightly — Catalyst cron function (Python).

Nightly analytics refresh for KSP DAPPA:
  1. refresh AggMonthly from CaseMaster (delta upserts),
  2. recompute weekly AnomalyAlert robust z-scores,
  3. refresh StationRisk (linear weighted recompute),
  4. write the refresh timestamp.

Modes
  * Catalyst (default): reads/writes the project Data Store via zcatalyst-sdk.
  * LOCAL_DRYRUN=1: reads table CSVs from env DAPPA_OUT (default
    ``pipeline/out``) and writes results to ``<DAPPA_OUT>/_nightly_out/`` —
    no Catalyst project needed. Optional env: DAPPA_NOW pins the refresh
    timestamp, DAPPA_HEINOUS_ID pins the heinous GravityOffenceID when the
    GravityOffence lookup CSV is absent.

Local run:  LOCAL_DRYRUN=1 DAPPA_OUT=... python3.12 main.py
"""

import json
import logging
import os

import nightly_core as core
import notify
import store_local

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
LOGGER = logging.getLogger("dappa_nightly")

CASE_COLUMNS = [
    "CaseMasterID", "CrimeNo", "CrimeRegisteredDate", "PoliceStationID",
    "GravityOffenceID", "CrimeMajorHeadID", "CrimeMinorHeadID",
    "latitude", "longitude",
]


def _run_local(out_dir, now_str):
    case_df = store_local.read_table(out_dir, "CaseMaster")
    if case_df is None or case_df.empty:
        raise RuntimeError(f"CaseMaster.csv missing or empty in {out_dir}")
    case_df = core.strip_sensitive(case_df)
    heinous_ids = core.resolve_heinous_ids(store_local.read_table(out_dir, "GravityOffence"))
    head_names = core.head_name_map(store_local.read_table(out_dir, "CrimeHead"))

    fresh_agg = core.build_agg_monthly(case_df, heinous_ids)
    delta = core.diff_agg(store_local.read_table(out_dir, "AggMonthly"), fresh_agg)
    alerts, data_end = core.compute_weekly_anomalies(
        case_df, head_names=head_names, now_str=now_str)
    existing_risk = store_local.read_table(out_dir, "StationRisk")
    extra_units = existing_risk["UnitID"].tolist() if existing_risk is not None else []
    risk = core.compute_station_risk(
        case_df, alerts_df=alerts,
        hotspot_df=store_local.read_table(out_dir, "HotspotCluster"),
        extra_units=extra_units, head_names=head_names, now_str=now_str)
    forecast = core.compute_forecast_monthly(case_df)

    meta = {
        "mode": "local-dryrun",
        "last_refresh": now_str,
        "data_end": data_end.date().isoformat() if data_end is not None else None,
        "cases_read": int(len(case_df)),
        "agg_rows": int(len(fresh_agg)),
        "agg_delta_rows": int(len(delta)),
        "anomaly_alerts": int(len(alerts)),
        "stations_scored": int(len(risk)),
        "forecast_rows": int(len(forecast)),
        "forecast_model": "seasonal-naive",
    }
    dest = store_local.write_outputs(out_dir, fresh_agg, delta, alerts, risk, forecast, meta)
    meta["output_dir"] = dest
    # Dry runs render the digest but can never send it (no Catalyst app).
    meta["digest"] = {"sent": False, "mode": "local-dryrun",
                      "preview": notify.build_digest(alerts, meta)}
    return meta


def _run_catalyst(now_str):
    import store_catalyst  # deferred: zcatalyst-sdk only exists in the cloud

    app = store_catalyst.get_app()
    case_df = core.strip_sensitive(
        store_catalyst.fetch_table(app, "CaseMaster", CASE_COLUMNS))
    if case_df.empty:
        raise RuntimeError("CaseMaster is empty in the Data Store")
    heinous_ids = core.resolve_heinous_ids(
        store_catalyst.fetch_table(app, "GravityOffence",
                                   ["GravityOffenceID", "LookupValue"]))
    head_names = core.head_name_map(
        store_catalyst.fetch_table(app, "CrimeHead",
                                   ["CrimeHeadID", "CrimeGroupName"]))

    fresh_agg = core.build_agg_monthly(case_df, heinous_ids)
    existing_agg = store_catalyst.fetch_table(app, "AggMonthly", core.AGG_COLS)
    delta = core.diff_agg(existing_agg, fresh_agg)
    agg_stats = store_catalyst.apply_agg_delta(app, delta)

    alerts, data_end = core.compute_weekly_anomalies(
        case_df, head_names=head_names, now_str=now_str)
    alert_stats = store_catalyst.replace_open_alerts(app, alerts)

    hotspots = store_catalyst.fetch_table(
        app, "HotspotCluster", ["ClusterID", "CentroidLat", "CentroidLng", "RadiusM"])
    existing_risk = store_catalyst.fetch_table(app, "StationRisk", ["UnitID"])
    risk = core.compute_station_risk(
        case_df, alerts_df=alerts, hotspot_df=hotspots,
        extra_units=existing_risk["UnitID"].tolist(),
        head_names=head_names, now_str=now_str)
    risk_stats = store_catalyst.upsert_station_risk(app, risk)

    forecast_stats = {"skipped": "set DAPPA_REFRESH_FORECAST=1 to overwrite "
                                 "pipeline Holt-Winters rows with seasonal-naive"}
    if os.environ.get("DAPPA_REFRESH_FORECAST", "").strip() == "1":
        forecast = core.compute_forecast_monthly(case_df)
        forecast_stats = store_catalyst.replace_forecast(app, forecast)

    meta = {
        "mode": "catalyst",
        "last_refresh": now_str,
        "data_end": data_end.date().isoformat() if data_end is not None else None,
        "cases_read": int(len(case_df)),
        "agg_rows": int(len(fresh_agg)),
        "agg_delta_rows": int(len(delta)),
        "agg_write": agg_stats,
        "anomaly_alerts": int(len(alerts)),
        "alert_write": alert_stats,
        "stations_scored": int(len(risk)),
        "risk_write": risk_stats,
        "forecast_write": forecast_stats,
    }
    meta["refresh_meta_persisted"] = store_catalyst.write_refresh_meta(app, meta)
    # Catalyst Mail digest — last step, after everything is persisted, so a
    # mail misconfiguration can never cost the refresh.
    meta["digest"] = notify.send_digest(app, notify.build_digest(alerts, meta))
    return meta


def run_refresh():
    now_str = core.now_string()
    if os.environ.get("LOCAL_DRYRUN", "").strip() == "1":
        out_dir = os.environ.get("DAPPA_OUT", os.path.join("pipeline", "out"))
        meta = _run_local(out_dir, now_str)
    else:
        meta = _run_catalyst(now_str)
    LOGGER.info("nightly refresh done: %s", json.dumps(meta, sort_keys=True))
    return meta


def handler(cron_details, context):
    """Catalyst cron entry point (schedule daily 02:00 IST; manual 'Run Now'
    during judging)."""
    try:
        run_refresh()
        context.close_with_success()
    except Exception:
        LOGGER.exception("nightly refresh failed")
        context.close_with_failure()


if __name__ == "__main__":
    print(json.dumps(run_refresh(), indent=2, sort_keys=True))
