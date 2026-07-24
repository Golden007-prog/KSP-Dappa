"""Core analytics-refresh logic for the ``dappa_nightly`` Catalyst cron function.

Pure pandas/numpy and deterministic for identical inputs. Heavy libraries
(statsmodels, scikit-learn) are deliberately NOT used so the function stays
inside Catalyst function limits:
  * AggMonthly refresh   -> exact groupby recompute, delta vs stored rows
  * AnomalyAlert refresh -> robust z-score (median/MAD) on weekly blocks
  * StationRisk refresh  -> linear recompute of the spec's weighted formula
    (0.45 trend slope + 0.35 hotspot proximity + 0.20 recent anomaly weight)

Column contract (docs/02_CLAUDE_CODE_MASTER_PROMPT.md section 2):
  CaseMaster(CaseMasterID, CrimeNo, CrimeRegisteredDate, PoliceStationID,
             GravityOffenceID, CrimeMajorHeadID, CrimeMinorHeadID, latitude,
             longitude, ...)
  AggMonthly(Ym, DistrictID, UnitID, CrimeHeadID, CrimeSubHeadID,
             CaseCount, HeinousCount)
  AnomalyAlert(AlertID, DistrictID, UnitID, CrimeHeadID, PeriodStart,
               PeriodEnd, Observed, Expected, ZScore, Severity, Status,
               Narrative, CreatedAt)
  StationRisk(UnitID, Horizon, RiskScore, DriversJson, ComputedAt)

Guardrail: caste/religion columns are stripped on load and are never part of
any computation here.
"""

import json
import os
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

AGG_KEYS = ["Ym", "DistrictID", "UnitID", "CrimeHeadID", "CrimeSubHeadID"]
AGG_COLS = AGG_KEYS + ["CaseCount", "HeinousCount"]
DELTA_COLS = AGG_KEYS + [
    "OldCaseCount", "NewCaseCount", "OldHeinousCount", "NewHeinousCount", "ChangeType",
]
ANOMALY_COLS = [
    "AlertID", "DistrictID", "UnitID", "CrimeHeadID", "PeriodStart", "PeriodEnd",
    "Observed", "Expected", "ZScore", "Severity", "Status", "Narrative", "CreatedAt",
]
RISK_COLS = ["UnitID", "Horizon", "RiskScore", "DriversJson", "ComputedAt"]
FORECAST_COLS = ["DistrictID", "CrimeHeadID", "Ym", "Actual", "Predicted", "Lo", "Hi", "Model"]

_SENSITIVE_TOKENS = ("caste", "religion")


def now_string():
    """Refresh timestamp, IST. Env DAPPA_NOW ('YYYY-MM-DD HH:MM:SS') pins it
    for deterministic dry runs."""
    pinned = os.environ.get("DAPPA_NOW", "").strip()
    if pinned:
        return pinned
    ist = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist).strftime("%Y-%m-%d %H:%M:%S")


def strip_sensitive(df):
    """Drop any caste/religion column the moment a frame is loaded (organizer
    guardrail: these must never enter analytics)."""
    if df is None:
        return None
    drop = [c for c in df.columns if any(t in c.lower() for t in _SENSITIVE_TOKENS)]
    return df.drop(columns=drop) if drop else df


def resolve_heinous_ids(gravity_df):
    """GravityOffenceID values that mean 'Heinous'. Uses the GravityOffence
    lookup when available; otherwise env DAPPA_HEINOUS_ID (default '1').
    Exact match so 'Non-Heinous' never qualifies."""
    if gravity_df is not None and {"GravityOffenceID", "LookupValue"} <= set(gravity_df.columns):
        ids = gravity_df.loc[
            gravity_df["LookupValue"].str.strip().str.lower() == "heinous", "GravityOffenceID"
        ]
        found = {str(v).strip() for v in ids if str(v).strip()}
        if found:
            return found
    return {os.environ.get("DAPPA_HEINOUS_ID", "1").strip()}


def head_name_map(crimehead_df):
    """CrimeHeadID -> CrimeGroupName, empty dict when the lookup is absent."""
    if crimehead_df is None or not {"CrimeHeadID", "CrimeGroupName"} <= set(crimehead_df.columns):
        return {}
    return {
        str(r["CrimeHeadID"]).strip(): str(r["CrimeGroupName"]).strip()
        for _, r in crimehead_df.iterrows()
    }


def district_from_crimeno(crimeno):
    """DistrictID = digits 2-5 of the 18-digit CrimeNo
    ([1 cat][4 district][4 unit][4 year][5 serial], pinned in CONTRACTS.md)."""
    s = crimeno.astype(str).str.strip()
    ok = s.str.fullmatch(r"\d{18}").fillna(False)
    return s.str[1:5].where(ok, "0000")


def _prepare_cases(case_df):
    """Normalized working frame: valid registered date, district, unit, head."""
    df = case_df.copy()
    dates = pd.to_datetime(df["CrimeRegisteredDate"].astype(str).str[:10], errors="coerce")
    df = df.loc[dates.notna()].copy()
    df["_date"] = dates.loc[dates.notna()].dt.normalize()
    df["_district"] = district_from_crimeno(df["CrimeNo"])
    df["_unit"] = df["PoliceStationID"].astype(str).str.strip()
    df["_head"] = df["CrimeMajorHeadID"].astype(str).str.strip()
    return df


def build_agg_monthly(case_df, heinous_ids):
    """Full recompute of AggMonthly from CaseMaster.
    UnitID = PoliceStationID; DistrictID parsed from CrimeNo."""
    df = _prepare_cases(case_df)
    if df.empty:
        return pd.DataFrame(columns=AGG_COLS)
    tmp = pd.DataFrame({
        "Ym": df["_date"].dt.strftime("%Y-%m"),
        "DistrictID": df["_district"],
        "UnitID": df["_unit"],
        "CrimeHeadID": df["_head"],
        "CrimeSubHeadID": df["CrimeMinorHeadID"].astype(str).str.strip(),
        "_heinous": df["GravityOffenceID"].astype(str).str.strip().isin(heinous_ids).astype(int),
    })
    agg = tmp.groupby(AGG_KEYS, as_index=False).agg(
        CaseCount=("_heinous", "size"), HeinousCount=("_heinous", "sum"))
    return agg.sort_values(AGG_KEYS, kind="mergesort").reset_index(drop=True)


def diff_agg(existing_df, fresh_df):
    """Delta rows between the stored AggMonthly and the fresh recompute —
    the rows a Data Store upsert actually needs to touch."""
    fresh = fresh_df.copy()
    for c in AGG_KEYS:
        fresh[c] = fresh[c].astype(str)
    if existing_df is None or existing_df.empty:
        delta = fresh.rename(columns={"CaseCount": "NewCaseCount",
                                      "HeinousCount": "NewHeinousCount"})
        delta["OldCaseCount"] = 0
        delta["OldHeinousCount"] = 0
        delta["ChangeType"] = "new"
        return delta[DELTA_COLS].reset_index(drop=True)

    old = existing_df.copy()
    for c in AGG_KEYS:
        old[c] = old[c].astype(str).str.strip()
    for c in ("CaseCount", "HeinousCount"):
        old[c] = pd.to_numeric(old[c], errors="coerce").fillna(0).astype(int)
    merged = old.merge(fresh, on=AGG_KEYS, how="outer", suffixes=("_old", "_new"),
                       indicator=True)
    for c in ("CaseCount_old", "HeinousCount_old", "CaseCount_new", "HeinousCount_new"):
        merged[c] = merged[c].fillna(0).astype(int)
    merged["ChangeType"] = np.select(
        [merged["_merge"] == "right_only", merged["_merge"] == "left_only"],
        ["new", "removed"], default="changed")
    changed = (
        (merged["_merge"] != "both")
        | (merged["CaseCount_old"] != merged["CaseCount_new"])
        | (merged["HeinousCount_old"] != merged["HeinousCount_new"])
    )
    delta = merged.loc[changed].rename(columns={
        "CaseCount_old": "OldCaseCount", "CaseCount_new": "NewCaseCount",
        "HeinousCount_old": "OldHeinousCount", "HeinousCount_new": "NewHeinousCount"})
    return (delta[DELTA_COLS]
            .sort_values(AGG_KEYS, kind="mergesort")
            .reset_index(drop=True))


def compute_weekly_anomalies(case_df, head_names=None, now_str="",
                             eval_weeks=4, baseline_weeks=8, min_baseline_weeks=4):
    """Robust weekly z-scores per district x crime head.

    Weeks are exact 7-day blocks counted back from the newest registered date
    (block 0 = the most recent 7 days), so the evaluated week is always
    complete and the result is deterministic for a given dataset. Baseline is
    the trailing ``baseline_weeks`` blocks; z uses median/MAD (scaled by
    1.4826). |z| >= 2 raises an alert; severity 1 for 2<=|z|<3, 2 for
    3<=|z|<4, 3 for |z|>=4 (master spec section 4.4).
    """
    head_names = head_names or {}
    df = _prepare_cases(case_df)
    if df.empty:
        return pd.DataFrame(columns=ANOMALY_COLS), None
    data_end = df["_date"].max()
    df["_block"] = ((data_end - df["_date"]).dt.days // 7).astype(int)
    span_blocks = int(df["_block"].max()) + 1
    counts = df.groupby(["_district", "_head", "_block"]).size()
    unit_counts = df.groupby(["_district", "_head", "_block", "_unit"]).size()

    records = []
    for d, h in sorted({(i[0], i[1]) for i in counts.index}):
        for b in range(eval_weeks):
            if span_blocks < b + 1 + min_baseline_weeks:
                continue
            base = np.array(
                [counts.get((d, h, bb), 0) for bb in range(b + 1, b + 1 + baseline_weeks)],
                dtype=float)
            obs = int(counts.get((d, h, b), 0))
            med = float(np.median(base))
            if obs < 3 and med < 1.0:  # too little signal either way
                continue
            mad = float(np.median(np.abs(base - med)))
            denom = 1.4826 * mad
            if denom == 0.0:
                # constant baseline: fall back to std, floor 1 (count data)
                denom = max(float(base.std()), 1.0)
            z = (obs - med) / denom
            if abs(z) < 2.0:
                continue
            severity = 1 if abs(z) < 3 else (2 if abs(z) < 4 else 3)
            p_start = (data_end - timedelta(days=7 * b + 6)).date().isoformat()
            p_end = (data_end - timedelta(days=7 * b)).date().isoformat()
            try:
                per_unit = unit_counts.loc[(d, h, b)]
                top_unit = sorted(per_unit[per_unit == per_unit.max()].index)[0]
            except KeyError:
                top_unit = ""
            hname = head_names.get(str(h), f"Crime head {h}")
            direction = "rose to" if z > 0 else "fell to"
            narrative = (
                f"{hname} cases in district {d} {direction} {obs} against an "
                f"expected ~{med:.1f} for {p_start} to {p_end} "
                f"(robust z-score {z:+.1f}).")
            records.append({
                "DistrictID": d, "UnitID": top_unit, "CrimeHeadID": h,
                "PeriodStart": p_start, "PeriodEnd": p_end,
                "Observed": obs, "Expected": round(med, 2),
                "ZScore": round(z, 2), "Severity": severity,
                "Status": "OPEN", "Narrative": narrative, "CreatedAt": now_str,
            })

    records.sort(key=lambda r: (-abs(r["ZScore"]), r["DistrictID"],
                                r["CrimeHeadID"], r["PeriodStart"]))
    for i, r in enumerate(records):
        r["AlertID"] = f"NA-{data_end:%Y%m%d}-{i + 1:04d}"
    alerts = pd.DataFrame(records, columns=ANOMALY_COLS)
    return alerts, data_end


def compute_forecast_monthly(case_df, min_cases=30, horizon=3):
    """Seasonal-naive ForecastMonthly refresh (the statsmodels-free fallback
    sanctioned by master spec section 4: Holt-Winters stays in the offline
    pipeline; the function ships month+12 seasonal-naive with an 80% CI from
    seasonal residuals, or a 3-month-mean naive when history is under 13
    months). History rows carry Actual; forecast rows carry Predicted/Lo/Hi.
    """
    df = _prepare_cases(case_df)
    if df.empty:
        return pd.DataFrame(columns=FORECAST_COLS)
    df["_period"] = df["_date"].dt.to_period("M")
    end_p = df["_date"].max().to_period("M")
    counts = df.groupby(["_district", "_head", "_period"]).size()
    rows = []
    for d, h in sorted({(i[0], i[1]) for i in counts.index}):
        sub = counts.loc[(d, h)]
        if int(sub.sum()) < min_cases:
            continue
        periods = pd.period_range(sub.index.min(), end_p, freq="M")
        y = np.array([sub.get(p, 0) for p in periods], dtype=float)
        for p, actual in zip(periods, y):
            rows.append({"DistrictID": d, "CrimeHeadID": h, "Ym": str(p),
                         "Actual": int(actual), "Predicted": "", "Lo": "",
                         "Hi": "", "Model": ""})
        if len(y) >= 13:
            model = "seasonal-naive"
            preds = [float(y[len(y) - 12 + i]) if len(y) - 12 + i < len(y)
                     else float(y[-1]) for i in range(horizon)]
            resid = y[12:] - y[:-12]
        else:
            model = "naive-mean3"
            base = float(y[-3:].mean()) if len(y) >= 3 else float(y.mean())
            preds = [base] * horizon
            resid = y - y.mean()
        sd = float(np.std(resid)) if len(resid) else 0.0
        for i in range(horizon):
            pred = preds[i]
            rows.append({
                "DistrictID": d, "CrimeHeadID": h, "Ym": str(end_p + (i + 1)),
                "Actual": "", "Predicted": round(pred, 1),
                "Lo": round(max(0.0, pred - 1.28 * sd), 1),
                "Hi": round(pred + 1.28 * sd, 1), "Model": model,
            })
    return pd.DataFrame(rows, columns=FORECAST_COLS)


def _haversine_m(lat1, lng1, lat2, lng2):
    """Great-circle distance in metres; inputs in degrees (numpy arrays ok)."""
    r = 6371000.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = np.radians(lat2 - lat1)
    dl = np.radians(lng2 - lng1)
    a = np.sin(dp / 2.0) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2.0) ** 2
    return 2.0 * r * np.arcsin(np.sqrt(a))


def _minmax(values):
    arr = np.asarray(values, dtype=float)
    lo, hi = arr.min(), arr.max()
    if hi <= lo:
        return np.zeros_like(arr)
    return (arr - lo) / (hi - lo)


def compute_station_risk(case_df, alerts_df=None, hotspot_df=None, extra_units=(),
                         head_names=None, now_str="", horizon=30,
                         trend_months=6, hotspot_days=90):
    """StationRisk = 100 * minmax(0.45*trend + 0.35*hotspot + 0.20*anomaly).

    * trend: linear slope (np.polyfit) of the station's monthly counts over
      the trailing ``trend_months`` months, scaled by its mean volume, then
      min-max normalized across stations.
    * hotspot: fraction of the station's last-``hotspot_days``-day cases that
      fall inside any HotspotCluster radius (0 when no hotspot table).
    * anomaly: severity-weighted OPEN alerts in the station's district,
      normalized by the max across stations.
    """
    head_names = head_names or {}
    df = _prepare_cases(case_df)
    if df.empty:
        return pd.DataFrame(columns=RISK_COLS)
    data_end = df["_date"].max()
    df["_period"] = df["_date"].dt.to_period("M")
    end_p = data_end.to_period("M")
    periods = [end_p - i for i in range(trend_months - 1, -1, -1)]
    monthly = df.groupby(["_unit", "_period"]).size()
    units = sorted(set(df["_unit"]) | {str(u).strip() for u in extra_units if str(u).strip()})

    x = np.arange(trend_months, dtype=float)
    slope, rel = {}, {}
    for u in units:
        y = np.array([monthly.get((u, p), 0) for p in periods], dtype=float)
        s = float(np.polyfit(x, y, 1)[0]) if trend_months >= 2 else 0.0
        slope[u] = s
        rel[u] = s / max(1.0, float(y.mean()))
    trend_norm = dict(zip(units, _minmax([rel[u] for u in units])))

    recent = df.loc[(data_end - df["_date"]).dt.days < hotspot_days].copy()
    hot_frac = {u: 0.0 for u in units}
    hot_n = {u: 0 for u in units}
    if (hotspot_df is not None and len(hotspot_df) and len(recent)
            and {"latitude", "longitude"} <= set(recent.columns)):
        clat = pd.to_numeric(hotspot_df["CentroidLat"], errors="coerce").to_numpy()
        clng = pd.to_numeric(hotspot_df["CentroidLng"], errors="coerce").to_numpy()
        crad = pd.to_numeric(hotspot_df["RadiusM"], errors="coerce").to_numpy()
        keep = ~(np.isnan(clat) | np.isnan(clng) | np.isnan(crad))
        clat, clng, crad = clat[keep], clng[keep], crad[keep]
        lat = pd.to_numeric(recent["latitude"], errors="coerce")
        lng = pd.to_numeric(recent["longitude"], errors="coerce")
        ok = lat.notna() & lng.notna()
        if len(clat) and ok.any():
            pts = recent.loc[ok]
            plat = lat[ok].to_numpy()[:, None]
            plng = lng[ok].to_numpy()[:, None]
            inside = (_haversine_m(plat, plng, clat[None, :], clng[None, :])
                      <= crad[None, :]).any(axis=1)
            flags = pd.Series(inside, index=pts.index)
            grp = pts.assign(_in=flags).groupby("_unit")["_in"]
            for u, frac in grp.mean().items():
                hot_frac[u] = float(frac)
            for u, n in grp.sum().items():
                hot_n[u] = int(n)

    unit_district = df.groupby("_unit")["_district"].agg(lambda s: sorted(s.mode())[0])
    dist_weight = {}
    if alerts_df is not None and len(alerts_df):
        open_alerts = alerts_df.loc[alerts_df["Status"].astype(str) == "OPEN"]
        w = open_alerts.groupby("DistrictID")["Severity"].apply(
            lambda s: pd.to_numeric(s, errors="coerce").fillna(0).sum())
        dist_weight = {str(k): float(v) for k, v in w.items()}
    anom_w = {u: dist_weight.get(str(unit_district.get(u, "")), 0.0) for u in units}
    max_w = max(anom_w.values()) if anom_w else 0.0
    anom_norm = {u: (anom_w[u] / max_w if max_w > 0 else 0.0) for u in units}

    raw = [0.45 * trend_norm[u] + 0.35 * hot_frac[u] + 0.20 * anom_norm[u] for u in units]
    scores = np.rint(100.0 * _minmax(raw)).astype(int)

    rec90 = df.loc[(data_end - df["_date"]).dt.days < 90]
    top_head = {}
    if len(rec90):
        hc = rec90.groupby(["_unit", "_head"]).size()
        for u in {i[0] for i in hc.index}:
            per = hc.loc[u]
            top_head[u] = sorted(per[per == per.max()].index)[0]

    rows = []
    for u, score in zip(units, scores):
        contributions = []
        if slope[u] > 0:
            hname = head_names.get(top_head.get(u, ""), None)
            what = f"rising {hname} trend" if hname else "rising case trend"
            contributions.append((0.45 * trend_norm[u],
                                  f"{what} ({slope[u]:+.1f} cases/month)"))
        elif slope[u] < 0:
            contributions.append((0.45 * trend_norm[u],
                                  f"declining case trend ({slope[u]:+.1f} cases/month)"))
        if hot_n[u] > 0:
            contributions.append((0.35 * hot_frac[u],
                                  f"{hot_frac[u] * 100:.0f}% of last-{hotspot_days}-day "
                                  f"cases inside an active hotspot ({hot_n[u]} cases)"))
        if anom_w[u] > 0:
            contributions.append((0.20 * anom_norm[u],
                                  f"{int(anom_w[u])} severity-weighted anomaly alert(s) "
                                  f"in district {unit_district.get(u, '?')}"))
        contributions.sort(key=lambda t: (-t[0], t[1]))
        drivers = [t[1] for t in contributions[:3] if t[0] > 0]
        if not drivers:
            drivers = ["no significant risk drivers in the recent window"]
        rows.append({
            "UnitID": u, "Horizon": horizon, "RiskScore": int(score),
            "DriversJson": json.dumps(drivers), "ComputedAt": now_str,
        })
    return pd.DataFrame(rows, columns=RISK_COLS)
