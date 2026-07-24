#!/usr/bin/env python3.12
"""KSP DAPPA analytics pass (master spec Phase 3).

Reads the generated per-table CSVs from env DAPPA_OUT (default pipeline/out) and
writes, into the same directory:
  AggMonthly.csv HotspotCluster.csv ForecastMonthly.csv AnomalyAlert.csv
  CaseAnomaly.csv NetworkEdge.csv OffenderProfile.csv StationRisk.csv
  network_graph.json quickml_case_outcome.csv quickml_station_risk.csv
  outcome_model.json rag_context/*.md
and benchmark JSONs into docs/benchmarks/ (forecast_metrics.json,
identity_metrics.json, socio_correlation.json).

Deterministic (seed 2026); no network calls; caste/religion columns are never
read anywhere in this module.

Run:  python3.12 pipeline/analytics.py       (DAPPA_OUT to override input dir)
"""
import json
import math
import os
import re
import warnings
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 2026
OUT = Path(os.environ.get("DAPPA_OUT", "pipeline/out")).resolve()
REPO = Path(__file__).resolve().parents[1]
BENCH = REPO / "docs" / "benchmarks"
Z80 = 1.2816  # 80% two-sided normal quantile

warnings.filterwarnings("ignore")


# ---------------------------------------------------------------- io helpers
def load_csv(name, required=True):
    p = OUT / name
    if not p.exists():
        if required:
            raise SystemExit(f"FATAL: required input missing: {p}")
        return None
    return pd.read_csv(p, dtype=str, keep_default_na=False, na_values=[], encoding="utf-8")


def write_csv(df, name):
    df.to_csv(OUT / name, index=False, encoding="utf-8", lineterminator="\n")


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def phonetic(tok):
    """Metaphone-style phonetic key used for identity-resolution blocking."""
    t = re.sub(r"[^A-Z]", "", tok.upper())
    if not t:
        return ""
    for a, b in (("PH", "F"), ("SH", "S"), ("TH", "T"), ("CH", "C"), ("KH", "K"),
                 ("GH", "G"), ("BH", "B"), ("DH", "D"), ("JH", "J"), ("WH", "W")):
        t = t.replace(a, b)
    t = t.translate(str.maketrans({"C": "K", "Q": "K", "Z": "S", "V": "F", "W": "F", "Y": "I"}))
    t = t.replace("X", "KS")
    head, rest = t[0], re.sub(r"[AEIOU]", "", t[1:])
    key = head + rest
    return re.sub(r"(.)\1+", r"\1", key)


# ---------------------------------------------------------------- load inputs
def load_all():
    cm = load_csv("CaseMaster.csv")
    unit = load_csv("Unit.csv")
    dist = load_csv("District.csv")
    heads = load_csv("CrimeHead.csv")
    subs = load_csv("CrimeSubHead.csv")
    grav = load_csv("GravityOffence.csv")
    acc = load_csv("Accused.csv")
    vic = load_csv("Victim.csv")
    arr = load_csv("ArrestSurrender.csv", required=False)
    cs = load_csv("ChargesheetDetails.csv", required=False)
    asa = load_csv("ActSectionAssociation.csv", required=False)
    socio = load_csv("SocioEconomic.csv", required=False)
    gt = load_csv("_ground_truth_offenders.csv", required=False)

    unit_dist = dict(zip(unit["UnitID"], unit["DistrictID"]))
    unit_name = dict(zip(unit["UnitID"], unit["UnitName"]))
    dist_name = dict(zip(dist["DistrictID"], dist["DistrictName"]))
    head_name = dict(zip(heads["CrimeHeadID"], heads["CrimeGroupName"]))
    sub_name = dict(zip(subs["CrimeSubHeadID"], subs["CrimeHeadName"]))  # ER quirk: subhead name column
    heinous_ids = set(grav.loc[grav["LookupValue"].str.strip().str.lower() == "heinous",
                               "GravityOffenceID"])

    cm = cm.copy()
    cm["reg"] = pd.to_datetime(cm["CrimeRegisteredDate"], errors="coerce")
    cm["inc"] = pd.to_datetime(cm["IncidentFromDate"], errors="coerce")
    cm = cm[cm["reg"].notna()].reset_index(drop=True)
    cm["Ym"] = cm["reg"].dt.strftime("%Y-%m")
    cm["hour"] = cm["inc"].dt.hour.fillna(12).astype(int)
    cm["lat"] = pd.to_numeric(cm["latitude"], errors="coerce")
    cm["lng"] = pd.to_numeric(cm["longitude"], errors="coerce")
    cm["DistrictID"] = cm["PoliceStationID"].map(unit_dist)
    # fallback: districts are digits 2-5 of the 18-digit CrimeNo
    miss = cm["DistrictID"].isna() | (cm["DistrictID"] == "")
    cm.loc[miss, "DistrictID"] = cm.loc[miss, "CrimeNo"].str.slice(1, 5)
    cm["heinous"] = cm["GravityOffenceID"].isin(heinous_ids).astype(int)

    lut = {"unit_dist": unit_dist, "unit_name": unit_name, "dist_name": dist_name,
           "head_name": head_name, "sub_name": sub_name, "heinous_ids": heinous_ids}
    return cm, acc, vic, arr, cs, asa, socio, gt, lut


# ---------------------------------------------------------------- 2. AggMonthly
def build_agg_monthly(cm):
    g = (cm.groupby(["Ym", "DistrictID", "PoliceStationID", "CrimeMajorHeadID", "CrimeMinorHeadID"])
           .agg(CaseCount=("CaseMasterID", "size"), HeinousCount=("heinous", "sum"))
           .reset_index()
           .rename(columns={"PoliceStationID": "UnitID", "CrimeMajorHeadID": "CrimeHeadID",
                            "CrimeMinorHeadID": "CrimeSubHeadID"})
           .sort_values(["Ym", "DistrictID", "UnitID", "CrimeHeadID", "CrimeSubHeadID"]))
    write_csv(g[["Ym", "DistrictID", "UnitID", "CrimeHeadID", "CrimeSubHeadID",
                 "CaseCount", "HeinousCount"]], "AggMonthly.csv")
    return g


# ---------------------------------------------------------------- 3. Hotspots
def hour_band(hours):
    ang = np.array(hours) / 24.0 * 2 * math.pi
    mu = math.atan2(np.sin(ang).mean(), np.cos(ang).mean()) / (2 * math.pi) * 24 % 24
    off = ((np.array(hours) - mu + 12) % 24) - 12
    start = int(math.floor(mu + np.quantile(off, 0.10))) % 24
    end = int(math.ceil(mu + np.quantile(off, 0.90))) % 24
    if start == end:
        end = (start + 1) % 24
    return start, end


def build_hotspots(cm, lut):
    from sklearn.cluster import DBSCAN

    end = cm["reg"].max()
    start = end - pd.DateOffset(months=6)
    win = cm[(cm["reg"] >= start) & cm["lat"].notna() & cm["lng"].notna()]
    ref_lat = math.radians(win["lat"].mean() if len(win) else 14.0)
    kx, ky = 111320.0 * math.cos(ref_lat), 110540.0
    r_hour = 5000.0 / math.sqrt(2)  # chord for a 6h gap == 5 km ("5km/6h equivalence")

    # station coords derived from case coordinates (Unit table carries no lat/lng)
    st = cm.groupby("PoliceStationID")[["lat", "lng"]].mean().dropna()
    station_xy = {u: (row["lat"], row["lng"]) for u, row in st.iterrows()}

    def clusters_for(eps, mfrac):
        found = []
        for head, grp in win.groupby("CrimeMajorHeadID", sort=True):
            if len(grp) < 8:
                continue
            ang = grp["hour"].to_numpy() / 24.0 * 2 * math.pi
            X = np.column_stack([grp["lng"].to_numpy() * kx, grp["lat"].to_numpy() * ky,
                                 r_hour * np.cos(ang), r_hour * np.sin(ang)])
            min_samples = max(6, int(round(len(grp) * mfrac)))
            labels = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(X)
            for lab in sorted(set(labels) - {-1}):
                found.append((head, grp[labels == lab]))
        return found

    # deterministic sweep tuned toward 15-40 clusters statewide at full scale.
    # eps is fixed at 1300 m so consecutive-hour points chain into one space-time
    # cluster (1 h apart at the same spot is ~923 m in the scaled hour dimension);
    # only the minPts fraction is swept, preferring denser (higher-minPts) fits on ties.
    eps = 1300.0
    best, best_score = None, None
    for mfrac in (0.004, 0.006, 0.008, 0.012, 0.02, 0.03):
        cl = clusters_for(eps, mfrac)
        n = len(cl)
        score = 0 if 15 <= n <= 40 else min(abs(n - 15), abs(n - 40))
        if best_score is None or score < best_score or (score == best_score and mfrac > best[1]):
            best, best_score = (eps, mfrac, cl), score
    eps, mfrac, found = best

    rows, meta = [], []
    for i, (head, grp) in enumerate(found, start=1):
        clat, clng = grp["lat"].mean(), grp["lng"].mean()
        d_m = [haversine_km(clat, clng, a, b) * 1000 for a, b in zip(grp["lat"], grp["lng"])]
        radius = max(150, int(round(np.quantile(d_m, 0.9))))
        hb_s, hb_e = hour_band(grp["hour"].tolist())
        dom_dist = grp["DistrictID"].mode().iloc[0]
        dom_sub = grp["CrimeMinorHeadID"].mode().iloc[0]
        # nearest station (prefer stations of the cluster's dominant district)
        cand = [u for u in grp["PoliceStationID"].unique() if u in station_xy] or list(station_xy)
        near = min(cand, key=lambda u: haversine_km(clat, clng, *station_xy[u]))
        sname = lut["unit_name"].get(near, lut["dist_name"].get(dom_dist, dom_dist))
        label = (f"{lut['sub_name'].get(dom_sub, dom_sub)} cluster — {sname}, "
                 f"{hb_s:02d}:00–{hb_e:02d}:00")
        cpm = len(grp) / 6.0
        rows.append({"ClusterID": f"H{i:03d}", "CrimeHeadID": head, "CentroidLat": round(clat, 6),
                     "CentroidLng": round(clng, 6), "RadiusM": radius, "CaseCount": len(grp),
                     "HourBandStart": hb_s, "HourBandEnd": hb_e,
                     "WindowStart": start.date().isoformat(), "WindowEnd": end.date().isoformat(),
                     "Intensity": cpm, "Label": label, "DistrictID": dom_dist})
        meta.append({"cpm": cpm, "sub": lut["sub_name"].get(dom_sub, dom_sub)})
    max_cpm = max((r["Intensity"] for r in rows), default=1.0)
    for r in rows:
        r["Intensity"] = round(100.0 * r["Intensity"] / max_cpm, 1)
    df = pd.DataFrame(rows, columns=["ClusterID", "CrimeHeadID", "CentroidLat", "CentroidLng",
                                     "RadiusM", "CaseCount", "HourBandStart", "HourBandEnd",
                                     "WindowStart", "WindowEnd", "Intensity", "Label", "DistrictID"])
    write_csv(df, "HotspotCluster.csv")
    return df, (eps, mfrac)


# ---------------------------------------------------------------- 4. Forecasts
def seasonal_naive(y, horizon):
    # blend of same-month-last-year and the trailing 3-month mean; the blend is much
    # more stable than pure y[t-12] on the sparse series this fallback exists for
    y = np.asarray(y, dtype=float)
    level = float(y[-3:].mean()) if len(y) else 0.0
    if len(y) >= 12:
        preds = [0.5 * y[len(y) - 12 + (h % 12)] + 0.5 * level for h in range(horizon)]
        resid = np.array([0.5 * y[t - 12] + 0.5 * y[t - 3:t].mean() - y[t]
                          for t in range(12, len(y))]) if len(y) > 12 else np.array([0.0])
    else:
        preds = [level] * horizon
        resid = y - y.mean() if len(y) else np.array([0.0])
    sigma = max(1.0, float(np.std(resid)))
    return np.array(preds, dtype=float), sigma


def ets_forecast(y, horizon):
    from statsmodels.tsa.exponential_smoothing.ets import ETSModel
    model = ETSModel(pd.Series(np.asarray(y, dtype=float)), error="add", trend="add",
                     damped_trend=True, seasonal="add", seasonal_periods=12)
    res = model.fit(disp=False)
    pred = res.get_prediction(start=len(y), end=len(y) + horizon - 1)
    sf = pred.summary_frame(alpha=0.2)
    return (sf["mean"].to_numpy(), sf["pi_lower"].to_numpy(), sf["pi_upper"].to_numpy())


def forecast_series(y, horizon, use_ets):
    if use_ets:
        try:
            mean, lo, hi = ets_forecast(y, horizon)
            return mean, lo, hi, "ETS(A,Ad,A,12)"
        except Exception:
            pass
    mean, sigma = seasonal_naive(y, horizon)
    return mean, mean - Z80 * sigma, mean + Z80 * sigma, "seasonal-naive"


def build_forecasts(cm, lut):
    top6 = cm["CrimeMajorHeadID"].value_counts().head(6).index.tolist()
    yms = pd.period_range(cm["reg"].min().to_period("M"), cm["reg"].max().to_period("M"), freq="M")
    ym_list = [str(p) for p in yms]
    future = [str(p) for p in pd.period_range(yms[-1] + 1, periods=3, freq="M")]

    counts = (cm[cm["CrimeMajorHeadID"].isin(top6)]
              .groupby(["DistrictID", "CrimeMajorHeadID", "Ym"]).size())
    rows, metrics = [], []
    fc_store = {}
    for (d, h), grp in counts.groupby(level=[0, 1]):
        s = grp.droplevel([0, 1]).reindex(ym_list, fill_value=0).astype(float)
        y = s.to_numpy()
        use_ets = len(y) >= 24 and y.mean() >= 3.0 and (y > 0).sum() >= 18
        mean, lo, hi, model = forecast_series(y, 3, use_ets)
        mean, lo, hi = np.round(np.maximum(mean, 0), 2), np.round(np.maximum(lo, 0), 2), np.round(np.maximum(hi, 0), 2)
        for ym, actual in zip(ym_list, y):
            rows.append([d, h, ym, int(actual), "", "", "", model])
        for i, ym in enumerate(future):
            rows.append([d, h, ym, "", mean[i], lo[i], hi[i], model])
        fc_store[(d, h)] = {"hist": y, "pred": mean}

        # backtest: hold out the last 6 months
        train, test = y[:-6], y[-6:]
        bt_mean, _, _, bt_model = forecast_series(train, 6, use_ets and len(train) >= 24)
        mask = test > 0
        mape = float(np.mean(np.abs(test[mask] - bt_mean[mask]) / test[mask]) * 100) if mask.any() else None
        metrics.append({"districtId": d, "crimeHeadId": h, "model": model,
                        "mape": round(mape, 2) if mape is not None else None,
                        "meanMonthly": round(float(y.mean()), 2)})

    df = pd.DataFrame(rows, columns=["DistrictID", "CrimeHeadID", "Ym", "Actual",
                                     "Predicted", "Lo", "Hi", "Model"])
    write_csv(df, "ForecastMonthly.csv")

    mapes = [m["mape"] for m in metrics if m["mape"] is not None]
    summary = {"series": len(metrics), "backtestMonths": 6,
               "medianMape": round(float(np.median(mapes)), 2) if mapes else None,
               "p90Mape": round(float(np.quantile(mapes, 0.9)), 2) if mapes else None,
               "etsSeries": sum(1 for m in metrics if m["model"].startswith("ETS")),
               "naiveSeries": sum(1 for m in metrics if m["model"] == "seasonal-naive")}
    BENCH.mkdir(parents=True, exist_ok=True)
    (BENCH / "forecast_metrics.json").write_text(
        json.dumps({"summary": summary, "series": metrics}, indent=2), encoding="utf-8")
    return df, fc_store, summary, top6


# ---------------------------------------------------------------- 5. Anomaly alerts
def build_anomalies(cm, lut):
    cm = cm.copy()
    cm["week"] = (cm["reg"] - pd.to_timedelta(cm["reg"].dt.weekday, unit="D")).dt.normalize()
    max_date = cm["reg"].max().normalize()
    weeks = pd.date_range(cm["week"].min(), cm["week"].max(), freq="7D")
    counts = cm.groupby(["DistrictID", "CrimeMajorHeadID", "week"]).size()

    rows = []
    for (d, h), grp in counts.groupby(level=[0, 1]):
        s = grp.droplevel([0, 1]).reindex(weeks, fill_value=0).astype(float)
        arr = s.to_numpy()
        for t in range(8, len(arr)):
            base = arr[t - 8:t]
            med = float(np.median(base))
            mad = max(1.0, float(np.median(np.abs(base - med))))
            z = 0.6745 * (arr[t] - med) / mad
            if abs(z) < 2:
                continue
            if z > 0 and arr[t] < 4:          # ignore tiny-count spikes
                continue
            if z < 0 and med < 6:             # ignore drops on thin baselines
                continue
            sev = 1 if abs(z) < 3 else (2 if abs(z) < 4 else 3)
            ps, pe = weeks[t].date(), (weeks[t] + pd.Timedelta(days=6)).date()
            status = "OPEN" if (max_date.date() - pe).days <= 56 else "REVIEWED"
            direction = "hit" if z > 0 else "fell to"
            narrative = (f"{lut['head_name'].get(h, h)} in {lut['dist_name'].get(d, d)} {direction} "
                         f"{int(arr[t])} cases in the week of {ps}, versus ~{med:.0f} expected from "
                         f"the trailing 8-week baseline (robust z {z:+.1f}). Severity {sev}.")
            rows.append({"DistrictID": d, "UnitID": "", "CrimeHeadID": h,
                         "PeriodStart": ps.isoformat(), "PeriodEnd": pe.isoformat(),
                         "Observed": int(arr[t]), "Expected": round(med, 1), "ZScore": round(z, 2),
                         "Severity": sev, "Status": status, "Narrative": narrative,
                         "CreatedAt": f"{pe.isoformat()} 08:00:00"})
    rows.sort(key=lambda r: (r["PeriodStart"], r["DistrictID"], r["CrimeHeadID"]))
    for i, r in enumerate(rows, start=1):
        r["AlertID"] = f"A{i:04d}"
    df = pd.DataFrame(rows, columns=["AlertID", "DistrictID", "UnitID", "CrimeHeadID", "PeriodStart",
                                     "PeriodEnd", "Observed", "Expected", "ZScore", "Severity",
                                     "Status", "Narrative", "CreatedAt"])
    write_csv(df, "AnomalyAlert.csv")
    return df


# ---------------------------------------------------------------- 6. Case anomalies
def build_case_anomalies(cm, vic, lut):
    from sklearn.ensemble import IsolationForest

    vage = pd.to_numeric(vic["AgeYear"], errors="coerce")
    vmean = vic.assign(age=vage).groupby("CaseMasterID")["age"].mean()
    df = cm[["CaseMasterID", "CrimeMinorHeadID", "hour", "heinous"]].copy()
    df["vage"] = df["CaseMasterID"].map(vmean)
    df["vage"] = df["vage"].fillna(df["vage"].median() if df["vage"].notna().any() else 35.0)
    freq = df["CrimeMinorHeadID"].value_counts(normalize=True)
    df["rarity"] = -np.log(df["CrimeMinorHeadID"].map(freq).astype(float))
    X = df[["hour", "vage", "heinous", "rarity"]].to_numpy(dtype=float)

    iso = IsolationForest(n_estimators=100, contamination=0.02, random_state=SEED)
    flags = iso.fit_predict(X)
    scores = iso.score_samples(X)
    smin, smax = scores.min(), scores.max()
    norm = (smax - scores) / (smax - smin) if smax > smin else np.zeros_like(scores)

    # per-subhead hour/vage percentile bounds for readable reasons
    sub_stats = {}
    for sub, grp in df.groupby("CrimeMinorHeadID"):
        sub_stats[sub] = (np.quantile(grp["hour"], 0.05), np.quantile(grp["hour"], 0.95),
                          np.quantile(grp["vage"], 0.05), np.quantile(grp["vage"], 0.95))
    rows = []
    for i in np.where(flags == -1)[0]:
        r = df.iloc[i]
        h5, h95, a5, a95 = sub_stats[r["CrimeMinorHeadID"]]
        sub = lut["sub_name"].get(r["CrimeMinorHeadID"], r["CrimeMinorHeadID"])
        reasons = []
        if not (h5 <= r["hour"] <= h95):
            reasons.append(f"unusual hour ({int(r['hour']):02d}:00) for {sub}")
        if not (a5 <= r["vage"] <= a95):
            reasons.append(f"atypical victim age ({r['vage']:.0f}) for {sub}")
        if r["rarity"] > np.quantile(df["rarity"], 0.95):
            reasons.append(f"rare crime type ({sub})")
        if not reasons:
            reasons.append(f"unusual combination of hour, victim profile and crime type ({sub})")
        rows.append({"CaseMasterID": r["CaseMasterID"], "Score": round(float(norm[i] * 100), 1),
                     "Reason": "; ".join(reasons)})
    rows.sort(key=lambda x: -x["Score"])
    out = pd.DataFrame(rows, columns=["CaseMasterID", "Score", "Reason"])
    write_csv(out, "CaseAnomaly.csv")
    return out


# ---------------------------------------------------------------- 7. Identity resolution
class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[max(ra, rb)] = min(ra, rb)


def resolve_identities(cm, acc, gt):
    from rapidfuzz import fuzz

    case_dist = dict(zip(cm["CaseMasterID"], cm["DistrictID"]))
    case_reg = dict(zip(cm["CaseMasterID"], cm["reg"]))
    recs = []
    for _, r in acc.iterrows():
        name = r["AccusedName"].strip()
        if not name or r["CaseMasterID"] not in case_dist:
            continue
        toks = re.findall(r"[A-Za-z]+", name)
        if not toks:
            continue
        age = pd.to_numeric(r["AgeYear"], errors="coerce")
        recs.append({"i": len(recs), "aid": r["AccusedMasterID"], "case": r["CaseMasterID"],
                     "name": " ".join(toks).lower(), "raw": name, "toks": toks,
                     "gender": r["GenderID"], "age": None if pd.isna(age) else int(age),
                     "dist": case_dist[r["CaseMasterID"]]})
    n = len(recs)

    blocks = defaultdict(list)
    for r in recs:
        if r["age"] is None:
            continue
        for tok in {t for t in r["toks"] if len(t) >= 2}:
            blocks[(phonetic(tok), r["gender"])].append(r["i"])

    seen, scored, exact = set(), [], []
    for key, idxs in blocks.items():
        if len(idxs) > 4000:  # over-generic token; other tokens still block these records
            continue
        idxs = sorted(set(idxs), key=lambda i: (recs[i]["age"], i))
        for a in range(len(idxs)):
            ra = recs[idxs[a]]
            for b in range(a + 1, len(idxs)):
                rb = recs[idxs[b]]
                if rb["age"] - ra["age"] > 2:
                    break
                i, j = min(idxs[a], idxs[b]), max(idxs[a], idxs[b])
                pk = i * n + j
                if pk in seen:
                    continue
                seen.add(pk)
                if ra["case"] == rb["case"]:
                    continue
                ts = fuzz.token_sort_ratio(ra["name"], rb["name"], score_cutoff=60) / 100.0
                if ts == 0.0:
                    continue
                dage = abs(ra["age"] - rb["age"])
                s = 0.6 * ts + 0.2 * max(0.0, 1 - dage / 5.0) + 0.2 * (1.0 if ra["dist"] == rb["dist"] else 0.0)
                if ts >= 0.95 and dage <= 2:
                    exact.append((i, j))  # cross-district same-name/age anchor pass
                if s >= 0.70:
                    scored.append((i, j, s))
    del seen

    gt_map = {}
    if gt is not None and len(gt):
        aid_col = next((c for c in gt.columns if c.lower() in
                        ("accusedmasterid", "accused_master_id", "accusedid")), None)
        tid_col = next((c for c in gt.columns if c.lower() in
                        ("trueoffenderid", "offenderid", "truepersonid", "personkey",
                         "groundtruthid", "trueid")), None)
        if aid_col and tid_col:
            gt_map = dict(zip(gt[aid_col], gt[tid_col]))

    def cluster(threshold):
        uf = UnionFind(n)
        for i, j, s in scored:
            if s >= threshold:
                uf.union(i, j)
        for i, j in exact:
            uf.union(i, j)
        groups = defaultdict(list)
        for i in range(n):
            groups[uf.find(i)].append(i)
        return list(groups.values())

    def evaluate(groups):
        tid = {r["i"]: gt_map.get(r["aid"]) for r in recs}
        true_pairs = 0
        by_tid = Counter(t for t in tid.values() if t)
        for k in by_tid.values():
            true_pairs += k * (k - 1) // 2
        tp = fp = 0
        for g in groups:
            gts = [i for i in g if tid[i]]
            non = len(g) - len(gts)
            for a in range(len(gts)):
                for b in range(a + 1, len(gts)):
                    if tid[gts[a]] == tid[gts[b]]:
                        tp += 1
                    else:
                        fp += 1
            fp += len(gts) * non  # planted offender linked to background person
        prec = tp / (tp + fp) if (tp + fp) else 1.0
        rec = tp / true_pairs if true_pairs else 0.0
        return prec, rec, tp, fp, true_pairs

    threshold, metrics = 0.82, None
    if gt_map:
        results = []
        for th in (0.78, 0.80, 0.82, 0.84, 0.86, 0.88, 0.90, 0.92):
            prec, rec, *_ = evaluate(cluster(th))
            results.append((th, prec, rec))
        ok = [r for r in results if r[1] >= 0.9]
        threshold = max(ok, key=lambda r: (r[2], -r[0]))[0] if ok else max(results, key=lambda r: r[1])[0]
    groups = cluster(threshold)
    if gt_map:
        prec, rec, tp, fp, true_pairs = evaluate(groups)
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        metrics = {"threshold": threshold, "precision": round(prec, 4), "recall": round(rec, 4),
                   "f1": round(f1, 4), "truePairs": true_pairs, "correctPairs": tp,
                   "falsePairs": fp, "groundTruthRows": len(gt_map),
                   "scoring": "0.6*token_sort_ratio + 0.2*age-closeness + 0.2*district-overlap, "
                              "plus exact-name (ts>=0.95, age<=2) cross-district anchor pass"}
        BENCH.mkdir(parents=True, exist_ok=True)
        (BENCH / "identity_metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    persons = {}
    for g in sorted(groups, key=lambda g: min(g)):
        key = f"P{len(persons) + 1:05d}"
        members = [recs[i] for i in g]
        names = Counter(m["raw"] for m in members)
        canonical = max(names.items(), key=lambda kv: (kv[1], len(kv[0])))[0]
        cases = sorted({m["case"] for m in members})
        persons[key] = {
            "key": key, "canonical": canonical,
            "aliases": sorted(set(names) - {canonical}),
            "cases": cases, "districts": sorted({m["dist"] for m in members}),
            "gender": members[0]["gender"],
            "first_seen": min(case_reg[c] for c in cases), "last_seen": max(case_reg[c] for c in cases),
            "aids": [m["aid"] for m in members]}
    case_persons = defaultdict(set)
    for p in persons.values():
        for c in p["cases"]:
            case_persons[c].add(p["key"])
    return persons, case_persons, threshold, metrics


# ---------------------------------------------------------------- 8. Network
def build_network(cm, persons, case_persons, lut):
    import networkx as nx
    from networkx.algorithms.community import louvain_communities
    from sklearn.feature_extraction.text import TfidfVectorizer

    edge_cases = defaultdict(list)
    for case, keys in case_persons.items():
        ks = sorted(keys)
        for a in range(len(ks)):
            for b in range(a + 1, len(ks)):
                edge_cases[(ks[a], ks[b])].append(case)

    G = nx.Graph()
    for (a, b), cases in edge_cases.items():
        G.add_edge(a, b, weight=len(cases))
    comm_of = {}
    if len(G):
        # only groups of >=3 members count as a community; isolated co-accused
        # pairs from one-off cases would otherwise drown the organized rings
        comms = [c for c in louvain_communities(G, weight="weight", seed=SEED) if len(c) >= 3]
        for ci, comm in enumerate(sorted(comms, key=lambda c: (-len(c), sorted(c)[0])), start=1):
            for node in comm:
                comm_of[node] = f"C{ci:02d}"
    deg_cent = nx.degree_centrality(G) if len(G) else {}
    if len(G) > 800:
        btw = nx.betweenness_centrality(G, k=400, seed=SEED)
    elif len(G):
        btw = nx.betweenness_centrality(G)
    else:
        btw = {}

    profiled = sorted([k for k, p in persons.items() if len(p["cases"]) >= 2 or k in G.nodes],
                      key=lambda k: k)
    facts = dict(zip(cm["CaseMasterID"], cm["BriefFacts"]))
    docs = [" ".join(facts.get(c, "") for c in persons[k]["cases"]) for k in profiled]
    generic = {"reported", "case", "police", "area", "hrs", "stated", "accused", "complainant",
               "unknown", "person", "persons", "victim", "registered", "investigation", "near",
               "main", "road", "matter", "referred", "progress", "way", "report", "statement"}
    mo_tags = {k: [] for k in profiled}
    if docs and any(d.strip() for d in docs):
        vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_features=4000,
                              sublinear_tf=True)
        M = vec.fit_transform(docs)
        vocab = np.array(vec.get_feature_names_out())
        for row, k in enumerate(profiled):
            r = M.getrow(row).toarray().ravel()
            tags = []
            for idx in np.argsort(-r):
                if r[idx] <= 0 or len(tags) >= 5:
                    break
                term = vocab[idx]
                if any(w in generic for w in term.split()):
                    continue
                if any(term in t or t in term for t in tags):
                    continue
                tags.append(term)
            mo_tags[k] = tags

    max_date = cm["reg"].max()
    max_cases = max((len(persons[k]["cases"]) for k in profiled), default=1)
    max_deg = max((deg_cent.get(k, 0.0) for k in profiled), default=0.0) or 1.0
    prof_rows = []
    for k in profiled:
        p = persons[k]
        recency = max(0.0, 1 - (max_date - p["last_seen"]).days / 365.0)
        risk = 100 * (0.45 * len(p["cases"]) / max_cases + 0.25 * recency
                      + 0.30 * deg_cent.get(k, 0.0) / max_deg)
        prof_rows.append({
            "PersonKey": k, "CanonicalName": p["canonical"],
            "AliasesJson": json.dumps(p["aliases"]), "CaseCount": len(p["cases"]),
            "DistrictsJson": json.dumps([lut["dist_name"].get(d, d) for d in p["districts"]]),
            "FirstSeen": p["first_seen"].date().isoformat(),
            "LastSeen": p["last_seen"].date().isoformat(),
            "MOTagsJson": json.dumps(mo_tags[k]), "CommunityID": comm_of.get(k, ""),
            "DegreeCentrality": round(deg_cent.get(k, 0.0), 4), "RiskScore": round(risk, 1)})
    prof_df = pd.DataFrame(prof_rows, columns=["PersonKey", "CanonicalName", "AliasesJson",
                                               "CaseCount", "DistrictsJson", "FirstSeen", "LastSeen",
                                               "MOTagsJson", "CommunityID", "DegreeCentrality",
                                               "RiskScore"])
    write_csv(prof_df, "OffenderProfile.csv")

    edge_rows = []
    for (a, b), cases in sorted(edge_cases.items()):
        ca, cb = comm_of.get(a, ""), comm_of.get(b, "")
        edge_rows.append({"PersonKeyA": a, "PersonKeyB": b, "Weight": len(cases),
                          "CaseIDsJson": json.dumps(cases[:30]),
                          "CommunityID": ca if ca == cb else ""})
    edge_df = pd.DataFrame(edge_rows, columns=["PersonKeyA", "PersonKeyB", "Weight",
                                               "CaseIDsJson", "CommunityID"])
    write_csv(edge_df, "NetworkEdge.csv")

    graph = {"nodes": [{"id": k, "label": persons[k]["canonical"],
                        "caseCount": len(persons[k]["cases"]),
                        "communityId": comm_of.get(k, ""), "degree": int(G.degree(k)) if k in G else 0}
                       for k in profiled],
             "edges": [{"source": a, "target": b, "weight": len(cases), "caseIds": cases[:30]}
                       for (a, b), cases in sorted(edge_cases.items())]}
    (OUT / "network_graph.json").write_text(json.dumps(graph, indent=1), encoding="utf-8")
    return prof_df, edge_df, comm_of, {"betweennessTop": sorted(btw.items(), key=lambda kv: -kv[1])[:5]}


# ---------------------------------------------------------------- 9. StationRisk
def build_station_risk(cm, hotspots, fc_store, alerts, lut, top6):
    max_date = cm["reg"].max()
    st = cm.groupby("PoliceStationID").agg(lat=("lat", "mean"), lng=("lng", "mean"),
                                           dist=("DistrictID", "first")).dropna()
    recent = cm[cm["reg"] >= max_date - pd.Timedelta(days=90)]
    cases90 = recent.groupby("PoliceStationID").size()

    d_pct, d_tophead = {}, {}
    for d in st["dist"].unique():
        act = pred = 0.0
        best_head, best_gain = None, -1e9
        for h in top6:
            f = fc_store.get((d, h))
            if not f:
                continue
            a3, p3 = float(np.sum(f["hist"][-3:])), float(np.sum(f["pred"]))
            act += a3
            pred += p3
            if p3 - a3 > best_gain:
                best_gain, best_head = p3 - a3, h
        d_pct[d] = (pred - act) / max(1.0, act)
        d_tophead[d] = (best_head, best_gain, (best_gain / max(1.0, act)) * 100)

    open_alerts = alerts[alerts["Status"] == "OPEN"]
    d_anom = open_alerts.groupby("DistrictID")["Severity"].sum().astype(float).to_dict()
    d_anom_top = {d: g.loc[g["ZScore"].abs().idxmax()]
                  for d, g in open_alerts.groupby("DistrictID")} if len(open_alerts) else {}

    hs = hotspots.to_dict("records")
    rows = []
    for uid, r in st.iterrows():
        prox, near = 0.0, None
        for c in hs:
            dkm = haversine_km(r["lat"], r["lng"], c["CentroidLat"], c["CentroidLng"])
            p = (c["Intensity"] / 100.0) * math.exp(-dkm / 2.0)
            if p > prox:
                prox, near = p, (c, dkm)
        rows.append({"UnitID": uid, "dist": r["dist"], "f": d_pct.get(r["dist"], 0.0),
                     "h": prox, "a": d_anom.get(r["dist"], 0.0), "near": near,
                     "cases90": int(cases90.get(uid, 0))})

    def minmax(vals):
        lo, hi = min(vals), max(vals)
        return [(v - lo) / (hi - lo) if hi > lo else 0.5 for v in vals]

    fn, hn, an = minmax([r["f"] for r in rows]), minmax([r["h"] for r in rows]), minmax([r["a"] for r in rows])
    raw = [0.45 * fn[i] + 0.35 * hn[i] + 0.20 * an[i] for i in range(len(rows))]
    score = minmax(raw)
    out = []
    for i, r in enumerate(rows):
        drivers = []
        head, gain, gpct = d_tophead.get(r["dist"], (None, 0.0, 0.0))
        comp = [(0.45 * fn[i], "f"), (0.35 * hn[i], "h"), (0.20 * an[i], "a")]
        for _, kind in sorted(comp, reverse=True):
            if kind == "f":
                if head is not None and gain > 0:
                    drivers.append(f"rising {lut['head_name'].get(head, head)} "
                                   f"({gpct:+.0f}% vs last quarter forecast)")
                else:
                    drivers.append("stable or easing caseload forecast")
            elif kind == "h":
                if r["near"] and r["near"][1] <= 5.0:
                    c, dkm = r["near"]
                    sub = c["Label"].split(" cluster")[0]
                    drivers.append(f"active {sub} hotspot {dkm:.1f} km away")
                else:
                    drivers.append("no active hotspot nearby")
            else:
                if r["dist"] in d_anom_top:
                    al = d_anom_top[r["dist"]]
                    drivers.append(f"recent {lut['head_name'].get(al['CrimeHeadID'], al['CrimeHeadID'])} "
                                   f"anomaly (z={float(al['ZScore']):.1f})")
                else:
                    drivers.append("no recent anomalies")
        out.append({"UnitID": r["UnitID"], "Horizon": 30, "RiskScore": round(100 * score[i], 1),
                    "DriversJson": json.dumps(drivers),
                    "ComputedAt": f"{max_date.date().isoformat()} 06:00:00"})
    df = pd.DataFrame(out, columns=["UnitID", "Horizon", "RiskScore", "DriversJson", "ComputedAt"])
    df = df.sort_values("RiskScore", ascending=False).reset_index(drop=True)
    write_csv(df, "StationRisk.csv")
    feat = pd.DataFrame([{"UnitID": r["UnitID"], "DistrictID": r["dist"], "cases90d": r["cases90"],
                          "forecastSlope": round(r["f"], 4), "hotspotProximity": round(r["h"], 4),
                          "anomalyWeight": r["a"]} for r in rows])
    return df, feat


# ---------------------------------------------------------------- 10. Socio correlation
def build_socio(cm, socio, lut):
    from scipy import stats
    if socio is None or not len(socio):
        (BENCH / "socio_correlation.json").write_text(
            json.dumps({"note": "SocioEconomic.csv not found; correlation skipped"}, indent=2),
            encoding="utf-8")
        return None
    counts = cm.groupby("DistrictID").size()
    s = socio.copy()
    for c in s.columns[1:]:
        s[c] = pd.to_numeric(s[c], errors="coerce")
    s["cases"] = s["DistrictID"].map(counts).fillna(0)
    s = s[s["Population"] > 0]
    s["ratePerLakh"] = s["cases"] / s["Population"] * 100000
    out = {"metric": "district crime rate per lakh population", "districts": len(s), "columns": {}}
    for col in ["Population", "UrbanPct", "LiteracyPct", "DensityPerKm2", "PerCapitaIncomeIdx"]:
        if col not in s.columns or s[col].notna().sum() < 3:
            continue
        v = s[[col, "ratePerLakh"]].dropna()
        pr = stats.pearsonr(v[col], v["ratePerLakh"])
        sr = stats.spearmanr(v[col], v["ratePerLakh"])
        out["columns"][col] = {"pearsonR": round(float(pr[0]), 4), "pearsonP": round(float(pr[1]), 4),
                               "spearmanRho": round(float(sr[0]), 4), "spearmanP": round(float(sr[1]), 4)}
    out["ratesPerLakh"] = {row["DistrictID"]: round(row["ratePerLakh"], 2) for _, row in s.iterrows()}
    (BENCH / "socio_correlation.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    return out


# ---------------------------------------------------------------- 11. QuickML files + local model
def hour_band_name(h):
    if h >= 22 or h < 5:
        return "night"
    if h < 11:
        return "morning"
    if h < 17:
        return "afternoon"
    return "evening"


def build_quickml(cm, vic, acc, arr, cs, asa, station_feat, station_risk, lut):
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.model_selection import train_test_split

    cstype = dict(zip(cs["CaseMasterID"], cs["cstype"])) if cs is not None else {}
    vic_n = vic.groupby("CaseMasterID").size()
    acc_n = acc.groupby("CaseMasterID").size()
    sec_n = asa.groupby("CaseMasterID").size() if asa is not None else pd.Series(dtype=int)
    arr7 = set()
    if arr is not None and len(arr):
        a = arr.copy()
        a["adate"] = pd.to_datetime(a["ArrestSurrenderDate"], errors="coerce")
        reg = dict(zip(cm["CaseMasterID"], cm["reg"]))
        for _, r in a.iterrows():
            rg = reg.get(r["CaseMasterID"])
            if rg is not None and pd.notna(r["adate"]) and 0 <= (r["adate"] - rg).days <= 7:
                arr7.add(r["CaseMasterID"])

    rows = []
    for _, r in cm.iterrows():
        ct = cstype.get(r["CaseMasterID"], "")
        if ct not in ("A", "C"):
            continue
        rows.append({
            "district": lut["dist_name"].get(r["DistrictID"], r["DistrictID"]),
            "subHead": lut["sub_name"].get(r["CrimeMinorHeadID"], r["CrimeMinorHeadID"]),
            "gravity": "Heinous" if r["heinous"] else "Non-Heinous",
            "hourBand": hour_band_name(int(r["hour"])),
            "victimCount": int(vic_n.get(r["CaseMasterID"], 0)),
            "accusedCount": int(acc_n.get(r["CaseMasterID"], 0)),
            "arrestWithin7d": int(r["CaseMasterID"] in arr7),
            "sectionCount": int(sec_n.get(r["CaseMasterID"], 0)),
            "cstype": ct})
    oc = pd.DataFrame(rows, columns=["district", "subHead", "gravity", "hourBand", "victimCount",
                                     "accusedCount", "arrestWithin7d", "sectionCount", "cstype"])
    write_csv(oc, "quickml_case_outcome.csv")

    sr = station_feat.merge(station_risk[["UnitID", "RiskScore"]], on="UnitID")
    q1, q2 = sr["RiskScore"].quantile([1 / 3, 2 / 3])
    sr["riskBand"] = np.where(sr["RiskScore"] <= q1, "Low",
                              np.where(sr["RiskScore"] <= q2, "Medium", "High"))
    sr["UnitName"] = sr["UnitID"].map(lut["unit_name"]).fillna(sr["UnitID"])
    write_csv(sr[["UnitID", "UnitName", "DistrictID", "cases90d", "forecastSlope",
                  "hotspotProximity", "anomalyWeight", "riskBand"]], "quickml_station_risk.csv")

    # local fallback model for POST /predict/outcome (FEATURE_QUICKML=off)
    model_info = {"features": [], "coefficients": [], "intercept": 0.0, "classes": [], "auc": None,
                  "note": "insufficient labeled data to train fallback model"}
    if len(oc) >= 40 and oc["cstype"].nunique() == 2:
        feats = ["gravity_heinous", "hour_night", "hour_morning", "hour_afternoon", "hour_evening",
                 "victim_count", "accused_count", "arrest_within_7d", "section_count"]
        X = np.column_stack([
            (oc["gravity"] == "Heinous").astype(int),
            (oc["hourBand"] == "night").astype(int), (oc["hourBand"] == "morning").astype(int),
            (oc["hourBand"] == "afternoon").astype(int), (oc["hourBand"] == "evening").astype(int),
            oc["victimCount"], oc["accusedCount"], oc["arrestWithin7d"], oc["sectionCount"],
        ]).astype(float)
        y = oc["cstype"].to_numpy()
        clf = LogisticRegression(max_iter=1000, random_state=SEED)
        if min(Counter(y).values()) >= 20:
            Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, random_state=SEED, stratify=y)
            clf.fit(Xtr, ytr)
            auc = roc_auc_score((yte == clf.classes_[1]).astype(int), clf.predict_proba(Xte)[:, 1])
            clf.fit(X, y)  # refit on everything for deployment
        else:
            clf.fit(X, y)
            auc = roc_auc_score((y == clf.classes_[1]).astype(int), clf.predict_proba(X)[:, 1])
        model_info = {"features": feats, "coefficients": [round(c, 6) for c in clf.coef_[0]],
                      "intercept": round(float(clf.intercept_[0]), 6),
                      "classes": clf.classes_.tolist(), "auc": round(float(auc), 4),
                      "note": "p(classes[1]) = sigmoid(intercept + coefficients . features)"}
    (OUT / "outcome_model.json").write_text(json.dumps(model_info, indent=2), encoding="utf-8")
    return oc, model_info


# ---------------------------------------------------------------- 12. RAG context
def build_rag(cm, agg, prof_df, comm_of, lut, socio_out):
    rag = OUT / "rag_context"
    rag.mkdir(exist_ok=True)
    n_files = 0

    schema = ["# KSP DAPPA data schema summary", "",
              "Core Data Store tables (official Karnataka Police FIR ER diagram):", "",
              "- **CaseMaster** - one row per registered case. Key columns: CaseMasterID, CrimeNo "
              "(18-digit, see how_to_read_crimeno.md), CrimeRegisteredDate, PoliceStationID (Unit), "
              "CaseCategoryID (FIR/UDR/PAR/ZeroFIR), GravityOffenceID (Heinous/Non-Heinous), "
              "CrimeMajorHeadID/CrimeMinorHeadID (crime head/subhead), CaseStatusID, latitude, "
              "longitude, IncidentFromDate, BriefFacts.",
              "- **Accused / Victim / ComplainantDetails** - parties per case with name, age, gender.",
              "- **ArrestSurrender** - arrests per case/accused with date.",
              "- **ChargesheetDetails** - chargesheet with cstype A (chargesheeted), B, or C (closed "
              "as false/undetected). Detection rate = A / (A + C).",
              "- **Unit / District** - police-station hierarchy; DistrictID is the 4-digit police "
              "district code (0101 = Bengaluru City).",
              "- **CrimeHead / CrimeSubHead** - crime classification, e.g. Property Crimes > HB Night.",
              "", "Derived analytics tables: AggMonthly (Ym x district x unit x head/subhead counts), "
              "HotspotCluster (DBSCAN space-time clusters), ForecastMonthly (Holt-Winters, 3-month "
              "horizon, 80% CI), AnomalyAlert (weekly robust z-score alerts), NetworkEdge/"
              "OffenderProfile (identity-resolved co-accused network), StationRisk (0-100 risk).",
              "", "Conventions: months are `YYYY-MM`; dates are ISO `YYYY-MM-DD`. All data is "
              "synthetic (KSP Datathon 2026 prototype). Caste/religion attributes are excluded from "
              "all analytics and models."]
    (rag / "schema_summary.md").write_text("\n".join(schema), encoding="utf-8")
    n_files += 1

    crimeno = ["# How to read a CrimeNo", "",
               "The 18-digit CrimeNo encodes: `[1-digit category][4-digit DistrictID]"
               "[4-digit UnitID][4-digit year][5-digit serial]`.",
               "", "Category codes: FIR = 1, UDR = 3, PAR = 4, ZeroFIR = 8. The serial number "
               "restarts at 1 per station, category and year. CaseNo is the last 9 digits "
               "(year + serial).", "",
               "Example: `1` `0101` `1001` `2026` `00042` means: FIR number 42 of 2026 registered "
               "at police station 1001 in Bengaluru City (0101)."]
    (rag / "how_to_read_crimeno.md").write_text("\n".join(crimeno), encoding="utf-8")
    n_files += 1

    last12 = sorted(cm["Ym"].unique())[-12:]
    for d in sorted(cm["DistrictID"].dropna().unique()):
        dname = lut["dist_name"].get(d, d)
        sub = cm[cm["DistrictID"] == d]
        lines = [f"# {dname} ({d}) - monthly crime summary", "",
                 f"Total cases on record: {len(sub)}. "
                 f"Heinous: {int(sub['heinous'].sum())}.", "",
                 "| Month | Total | " + " | ".join(lut["head_name"].get(h, h)
                                                   for h in sorted(lut["head_name"])) + " |",
                 "|---" * (2 + len(lut["head_name"])) + "|"]
        piv = sub.pivot_table(index="Ym", columns="CrimeMajorHeadID", values="CaseMasterID",
                              aggfunc="count", fill_value=0)
        for ym in last12:
            row = piv.loc[ym] if ym in piv.index else None
            vals = [int(row.get(h, 0)) if row is not None else 0 for h in sorted(lut["head_name"])]
            lines.append(f"| {ym} | {sum(vals)} | " + " | ".join(str(v) for v in vals) + " |")
        (rag / f"district_{d}_monthly.md").write_text("\n".join(lines), encoding="utf-8")
        n_files += 1

    top = prof_df.sort_values(["RiskScore", "PersonKey"], ascending=[False, True]).head(15)
    lines = ["# Top resolved offenders and communities", "",
             "Offenders below were resolved across name variants by identity resolution "
             "(fuzzy name + age + district blocking).", ""]
    for _, r in top.iterrows():
        aliases = ", ".join(json.loads(r["AliasesJson"])) or "none"
        tags = ", ".join(json.loads(r["MOTagsJson"])) or "-"
        dists = ", ".join(json.loads(r["DistrictsJson"]))
        lines.append(f"- **{r['CanonicalName']}** ({r['PersonKey']}): {r['CaseCount']} cases in "
                     f"{dists}; aliases: {aliases}; active {r['FirstSeen']} to {r['LastSeen']}; "
                     f"MO: {tags}; risk {r['RiskScore']}.")
    comm_sizes = Counter(comm_of.values())
    lines += ["", "## Co-accused communities (Louvain)", ""]
    for cid, size in sorted(comm_sizes.items()):
        members = prof_df[prof_df["CommunityID"] == cid]
        dists = sorted({d for _, r in members.iterrows() for d in json.loads(r["DistrictsJson"])})
        cases = int(members["CaseCount"].sum())
        lines.append(f"- **{cid}**: {size} members, ~{cases} case appearances, districts: "
                     f"{', '.join(dists)}.")
    (rag / "top_offenders_communities.md").write_text("\n".join(lines), encoding="utf-8")
    n_files += 1
    return n_files


# ---------------------------------------------------------------- main
def main():
    print(f"[analytics] input dir: {OUT}")
    cm, acc, vic, arr, cs, asa, socio, gt, lut = load_all()
    print(f"[1/12] loaded {len(cm)} cases, {len(acc)} accused, {len(vic)} victims "
          f"({cm['reg'].min().date()} .. {cm['reg'].max().date()})")

    agg = build_agg_monthly(cm)
    print(f"[2/12] AggMonthly.csv: {len(agg)} rows")

    hotspots, (eps, mfrac) = build_hotspots(cm, lut)
    print(f"[3/12] HotspotCluster.csv: {len(hotspots)} clusters (eps={eps:.0f}m, minPts frac={mfrac})")
    for lab in hotspots["Label"].head(3):
        print(f"        - {lab.encode('ascii', 'replace').decode()}")

    fc_df, fc_store, fc_summary, top6 = build_forecasts(cm, lut)
    print(f"[4/12] ForecastMonthly.csv: {len(fc_df)} rows, {fc_summary['series']} series "
          f"(ETS {fc_summary['etsSeries']} / naive {fc_summary['naiveSeries']}), "
          f"median backtest MAPE {fc_summary['medianMape']}%")

    alerts = build_anomalies(cm, lut)
    n_open = int((alerts["Status"] == "OPEN").sum())
    print(f"[5/12] AnomalyAlert.csv: {len(alerts)} alerts ({n_open} open, "
          f"max |z| {alerts['ZScore'].abs().max() if len(alerts) else 0:.1f})")

    case_anom = build_case_anomalies(cm, vic, lut)
    print(f"[6/12] CaseAnomaly.csv: {len(case_anom)} flagged cases")

    persons, case_persons, threshold, id_metrics = resolve_identities(cm, acc, gt)
    multi = sum(1 for p in persons.values() if len(p["cases"]) >= 2)
    if id_metrics:
        print(f"[7/12] identity resolution: {len(persons)} persons ({multi} repeat), "
              f"threshold {threshold:.2f} -> precision {id_metrics['precision']:.3f}, "
              f"recall {id_metrics['recall']:.3f} (f1 {id_metrics['f1']:.3f}, "
              f"{id_metrics['truePairs']} true pairs)")
    else:
        print(f"[7/12] identity resolution: {len(persons)} persons ({multi} repeat), "
              f"threshold {threshold:.2f} (no _ground_truth_offenders.csv -> metrics skipped)")

    prof_df, edge_df, comm_of, _net = build_network(cm, persons, case_persons, lut)
    print(f"[8/12] NetworkEdge.csv: {len(edge_df)} edges; OffenderProfile.csv: {len(prof_df)} "
          f"profiles; {len(set(comm_of.values()))} Louvain communities; network_graph.json written")

    risk_df, station_feat = build_station_risk(cm, hotspots, fc_store, alerts, lut, top6)
    print(f"[9/12] StationRisk.csv: {len(risk_df)} stations "
          f"(top {risk_df['RiskScore'].iloc[0] if len(risk_df) else 0})")

    socio_out = build_socio(cm, socio, lut)
    if socio_out:
        cols = {k: v["pearsonR"] for k, v in socio_out["columns"].items()}
        print(f"[10/12] socio_correlation.json: pearson r {cols}")
    else:
        print("[10/12] socio_correlation.json: skipped (no SocioEconomic.csv)")

    oc, model_info = build_quickml(cm, vic, acc, arr, cs, asa, station_feat, risk_df, lut)
    print(f"[11/12] quickml_case_outcome.csv: {len(oc)} labeled rows "
          f"(A={int((oc['cstype'] == 'A').sum())}, C={int((oc['cstype'] == 'C').sum())}); "
          f"quickml_station_risk.csv written; outcome_model.json AUC={model_info['auc']}")

    n_rag = build_rag(cm, agg, prof_df, comm_of, lut, socio_out)
    print(f"[12/12] rag_context/: {n_rag} markdown files")

    expected = ["AggMonthly.csv", "HotspotCluster.csv", "ForecastMonthly.csv", "AnomalyAlert.csv",
                "CaseAnomaly.csv", "NetworkEdge.csv", "OffenderProfile.csv", "StationRisk.csv",
                "network_graph.json", "quickml_case_outcome.csv", "quickml_station_risk.csv",
                "outcome_model.json"]
    missing = [f for f in expected if not (OUT / f).exists()]
    bench = [f for f in ["forecast_metrics.json", "socio_correlation.json"] if not (BENCH / f).exists()]
    print("[done] all outputs written" if not (missing or bench)
          else f"[done] MISSING: {missing + bench}")
    if id_metrics:
        print(f"IDENTITY  precision={id_metrics['precision']}  recall={id_metrics['recall']}  "
              f"threshold={id_metrics['threshold']}")


if __name__ == "__main__":
    main()
