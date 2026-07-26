"""Catalyst Data Store storage layer for the nightly refresh (cloud mode).

Only used when LOCAL_DRYRUN is not set. Uses the documented zcatalyst-sdk
surface: ``zcatalyst_sdk.initialize()``, ``app.zcql().execute_query(query)``
(ZCQL caps SELECT at 300 rows; pagination is ``LIMIT {offset},{count}``) and
``app.datastore().table(name).insert_rows(rows)``.
"""

import json
import logging

import pandas as pd

LOGGER = logging.getLogger("dappa_nightly.store")
_PAGE = 300
_INSERT_BATCH = 100


def get_app():
    import zcatalyst_sdk  # deferred: not installed (or needed) for dry runs

    return zcatalyst_sdk.initialize()


def _q(value):
    """Escape a value for a single-quoted ZCQL string literal."""
    return str(value).replace("'", "''")


def _normalize_row(row, table_name):
    """ZCQL rows arrive as {table: {col: val}} (or flat dicts); flatten."""
    if isinstance(row, dict) and table_name in row and isinstance(row[table_name], dict):
        return row[table_name]
    return row


def fetch_table(app, table_name, columns, where=None):
    """Full paginated read of selected columns -> DataFrame of strings."""
    zcql = app.zcql()
    cols = ", ".join(columns)
    suffix = f" WHERE {where}" if where else ""
    rows, offset = [], 0
    while True:
        # ZCQL's LIMIT first argument is a 1-BASED START ROW, not a rows-to-skip
        # count, despite the docs describing MySQL skip semantics. Measured
        # against the live store: ``LIMIT 10,10`` returns rows 10..19, so a
        # zero-based offset must be sent as ``offset + 1`` or every page after
        # the first repeats one row. Omitted entirely for the first page.
        # Keep in sync with dappa_api/lib/datastore.js buildZCQL.
        limit = f"LIMIT {offset + 1},{_PAGE}" if offset else f"LIMIT {_PAGE}"
        query = f"SELECT {cols} FROM {table_name}{suffix} {limit}"
        page = zcql.execute_query(query) or []
        rows.extend(_normalize_row(r, table_name) for r in page)
        if len(page) < _PAGE:
            break
        offset += _PAGE
    if not rows:
        return pd.DataFrame(columns=columns)
    df = pd.DataFrame(rows)
    for c in columns:
        if c not in df.columns:
            df[c] = ""
    return df[columns].astype(str)


def apply_agg_delta(app, delta_df):
    """Upsert only the changed AggMonthly rows ('removed' rows are zeroed,
    not deleted, so history stays queryable)."""
    zcql = app.zcql()
    table = app.datastore().table("AggMonthly")
    inserts = []
    updated = 0
    for _, r in delta_df.iterrows():
        if r["ChangeType"] == "new":
            inserts.append({
                "Ym": r["Ym"], "DistrictID": r["DistrictID"], "UnitID": r["UnitID"],
                "CrimeHeadID": r["CrimeHeadID"], "CrimeSubHeadID": r["CrimeSubHeadID"],
                "CaseCount": int(r["NewCaseCount"]),
                "HeinousCount": int(r["NewHeinousCount"]),
            })
            continue
        zcql.execute_query(
            "UPDATE AggMonthly SET "
            f"CaseCount = {int(r['NewCaseCount'])}, "
            f"HeinousCount = {int(r['NewHeinousCount'])} "
            f"WHERE Ym = '{_q(r['Ym'])}' AND DistrictID = '{_q(r['DistrictID'])}' "
            f"AND UnitID = '{_q(r['UnitID'])}' "
            f"AND CrimeHeadID = '{_q(r['CrimeHeadID'])}' "
            f"AND CrimeSubHeadID = '{_q(r['CrimeSubHeadID'])}'")
        updated += 1
    for i in range(0, len(inserts), _INSERT_BATCH):
        table.insert_rows(inserts[i:i + _INSERT_BATCH])
    return {"inserted": len(inserts), "updated": updated}


def replace_open_alerts(app, alerts_df):
    """Refresh semantics: drop previous OPEN alerts (acknowledged ones are
    preserved) and insert the recomputed set."""
    zcql = app.zcql()
    zcql.execute_query("DELETE FROM AnomalyAlert WHERE Status = 'OPEN'")
    rows = []
    for _, r in alerts_df.iterrows():
        rows.append({
            "AlertID": r["AlertID"], "DistrictID": r["DistrictID"],
            "UnitID": r["UnitID"], "CrimeHeadID": r["CrimeHeadID"],
            "PeriodStart": r["PeriodStart"], "PeriodEnd": r["PeriodEnd"],
            "Observed": int(r["Observed"]), "Expected": float(r["Expected"]),
            "ZScore": float(r["ZScore"]), "Severity": int(r["Severity"]),
            "Status": r["Status"], "Narrative": r["Narrative"],
            "CreatedAt": r["CreatedAt"],
        })
    table = app.datastore().table("AnomalyAlert")
    for i in range(0, len(rows), _INSERT_BATCH):
        table.insert_rows(rows[i:i + _INSERT_BATCH])
    return {"inserted": len(rows)}


def upsert_station_risk(app, risk_df):
    zcql = app.zcql()
    existing = fetch_table(app, "StationRisk", ["UnitID"])
    known = set(existing["UnitID"].astype(str)) if len(existing) else set()
    inserts = []
    updated = 0
    for _, r in risk_df.iterrows():
        if str(r["UnitID"]) in known:
            zcql.execute_query(
                "UPDATE StationRisk SET "
                f"RiskScore = {int(r['RiskScore'])}, "
                f"DriversJson = '{_q(r['DriversJson'])}', "
                f"ComputedAt = '{_q(r['ComputedAt'])}' "
                f"WHERE UnitID = '{_q(r['UnitID'])}' "
                f"AND Horizon = {int(r['Horizon'])}")
            updated += 1
        else:
            inserts.append({
                "UnitID": r["UnitID"], "Horizon": int(r["Horizon"]),
                "RiskScore": int(r["RiskScore"]),
                "DriversJson": r["DriversJson"], "ComputedAt": r["ComputedAt"],
            })
    table = app.datastore().table("StationRisk")
    for i in range(0, len(inserts), _INSERT_BATCH):
        table.insert_rows(inserts[i:i + _INSERT_BATCH])
    return {"inserted": len(inserts), "updated": updated}


def replace_forecast(app, forecast_df):
    """Full replace of ForecastMonthly with the seasonal-naive recompute.
    Only invoked when env DAPPA_REFRESH_FORECAST=1 — by default the offline
    pipeline's Holt-Winters rows are left untouched."""
    zcql = app.zcql()
    zcql.execute_query("DELETE FROM ForecastMonthly WHERE Ym is not null")
    rows = forecast_df.to_dict(orient="records")
    table = app.datastore().table("ForecastMonthly")
    for i in range(0, len(rows), _INSERT_BATCH):
        table.insert_rows(rows[i:i + _INSERT_BATCH])
    return {"inserted": len(rows)}


def write_refresh_meta(app, meta):
    """Best effort: persist the refresh timestamp in a RefreshMeta table if
    the project has one; otherwise the structured log line is the record."""
    try:
        app.datastore().table("RefreshMeta").insert_row({
            "RefreshedAt": meta["last_refresh"],
            "DetailsJson": json.dumps(meta, sort_keys=True),
        })
        return True
    except Exception as exc:  # table may not exist in the schema
        LOGGER.warning("RefreshMeta not written (%s); timestamp logged only", exc)
        return False
