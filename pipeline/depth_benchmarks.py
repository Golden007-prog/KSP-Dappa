#!/usr/bin/env python3.12
"""Offline benchmark artefacts for the Round-2 analytical-depth panels.

Reads pipeline/out (the generator + analytics outputs) and writes three JSON
files to BOTH docs/benchmarks (documented copy) and
functions/dappa_api/lib/depth/bench (the copy the API bundles and serves via
GET /depth/benchmarks), byte-identical:

  forecast_coverage.json  the 6-month holdout replayed with the 80 % band kept:
                          coverage, MAPE by horizon step and calendar month
  identity_sweep.json     precision / recall / F1 across thresholds for the
                          pipeline scorer (v1) and a district-blocked variant (v2)
  recovery_metrics.json   what analytics.py recovered of the patterns
                          generate.py planted (6 hotspots, 4 anomalies,
                          ~200 repeat offenders, 12 co-accused communities)

Run from the repo root:  python3.12 pipeline/depth_benchmarks.py [--skip-identity]
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import analytics as an  # noqa: E402  (pipeline module; main() is guarded)
from dappa_seed import ANOMALIES, FINAL8_START, HOTSPOTS  # noqa: E402

REPO = HERE.parent
BENCH = REPO / "docs" / "benchmarks"
BUNDLE = REPO / "functions" / "dappa_api" / "lib" / "depth" / "bench"
HOLDOUT = 6
SWEEP = [round(0.70 + 0.02 * i, 2) for i in range(14)]  # 0.70 .. 0.96


def write_both(name: str, payload: dict) -> None:
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    for folder in (BENCH, BUNDLE):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_text(text + "\n", encoding="utf-8")
    print(f"[depth] wrote {name} ({len(text)} B) to docs/benchmarks and lib/depth/bench")


# ---------------------------------------------------------------- forecast coverage
def forecast_coverage(cm: pd.DataFrame) -> dict:
    top6 = cm["CrimeMajorHeadID"].value_counts().head(6).index.tolist()
    yms = pd.period_range(cm["reg"].min().to_period("M"), cm["reg"].max().to_period("M"), freq="M")
    ym_list = [str(p) for p in yms]
    counts = (cm[cm["CrimeMajorHeadID"].isin(top6)]
              .groupby(["DistrictID", "CrimeMajorHeadID", "Ym"]).size())
    series, points = [], []
    t0 = time.time()
    for (d, h), grp in counts.groupby(level=[0, 1]):
        s = grp.droplevel([0, 1]).reindex(ym_list, fill_value=0).astype(float)
        y = s.to_numpy()
        use_ets = len(y) >= 24 and y.mean() >= 3.0 and (y > 0).sum() >= 18
        train, test = y[:-HOLDOUT], y[-HOLDOUT:]
        mean, lo, hi, model = an.forecast_series(train, HOLDOUT, use_ets and len(train) >= 24)
        mean, lo, hi = np.maximum(mean, 0), np.maximum(lo, 0), np.maximum(hi, 0)
        inside = [(lo[i] <= test[i] <= hi[i]) for i in range(HOLDOUT)]
        apes = [abs(test[i] - mean[i]) / test[i] if test[i] > 0 else None for i in range(HOLDOUT)]
        valid = [a for a in apes if a is not None]
        width = [((hi[i] - lo[i]) / mean[i]) if mean[i] > 0 else None for i in range(HOLDOUT)]
        series.append({
            "districtId": d, "crimeHeadId": h, "model": model,
            "coverage80": round(float(np.mean(inside)), 4),
            "mape": round(float(np.mean(valid)) * 100, 2) if valid else None,
            "meanMonthly": round(float(y.mean()), 2),
            "meanBandWidthPct": round(float(np.mean([w for w in width if w is not None])) * 100, 1) if any(w is not None for w in width) else None,
        })
        for i in range(HOLDOUT):
            points.append({"h": i + 1, "ym": ym_list[len(y) - HOLDOUT + i], "model": model,
                           "inside": bool(inside[i]), "ape": apes[i]})
    pts = pd.DataFrame(points)
    by_h, by_ym, by_model = [], [], []
    for h, g in pts.groupby("h"):
        valid = g["ape"].dropna()
        by_h.append({"h": int(h), "rows": int(len(g)), "coverage80": round(float(g["inside"].mean()), 4),
                     "mape": round(float(valid.mean()) * 100, 2) if len(valid) else None,
                     "medianApe": round(float(valid.median()) * 100, 2) if len(valid) else None})
    for ym, g in pts.groupby("ym"):
        valid = g["ape"].dropna()
        by_ym.append({"ym": ym, "rows": int(len(g)), "coverage80": round(float(g["inside"].mean()), 4),
                      "mape": round(float(valid.mean()) * 100, 2) if len(valid) else None})
    for m, g in pts.groupby("model"):
        valid = g["ape"].dropna()
        by_model.append({"model": m, "series": int(sum(1 for s in series if s["model"] == m)),
                         "coverage80": round(float(g["inside"].mean()), 4),
                         "mape": round(float(valid.mean()) * 100, 2) if len(valid) else None})
    mapes = [s["mape"] for s in series if s["mape"] is not None]
    summary = {
        "series": len(series), "backtestMonths": HOLDOUT, "holdoutPoints": int(len(pts)),
        "coverage80": round(float(pts["inside"].mean()), 4),
        "coverage80Target": 0.8,
        "coverageGap": round(float(pts["inside"].mean()) - 0.8, 4),
        "medianMape": round(float(np.median(mapes)), 2) if mapes else None,
        "p90Mape": round(float(np.quantile(mapes, 0.9)), 2) if mapes else None,
        "seriesUnderCovered": int(sum(1 for s in series if s["coverage80"] < 0.8)),
        "seriesFullyCovered": int(sum(1 for s in series if s["coverage80"] == 1.0)),
        "driftH1ToH6": (round(by_h[-1]["mape"] - by_h[0]["mape"], 2)
                        if by_h and by_h[0]["mape"] is not None and by_h[-1]["mape"] is not None else None),
        "computeSeconds": round(time.time() - t0, 1),
    }
    return {"summary": summary, "byHorizon": by_h, "byMonth": by_ym, "byModel": by_model, "series": series,
            "method": ("For every district × crime-head series the last 6 months are held out; the model chosen by the "
                       "pipeline's own rule (ETS(A,Ad,A,12) when ≥ 24 months, mean ≥ 3 and ≥ 18 non-zero months, "
                       "else the seasonal-naive blend) is refitted on the rest and its 80 % interval kept. "
                       "coverage80 = share of held-out actuals inside [lo, hi]; MAPE excludes zero-actual months, "
                       "as in analytics.py build_forecasts.")}


# ---------------------------------------------------------------- identity sweep
def identity_sweep(cm: pd.DataFrame, acc: pd.DataFrame, gt: pd.DataFrame) -> dict:
    from rapidfuzz import fuzz
    t0 = time.time()
    case_dist = dict(zip(cm["CaseMasterID"], cm["DistrictID"]))
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
                     "name": " ".join(toks).lower(), "toks": toks, "gender": r["GenderID"],
                     "age": None if pd.isna(age) else int(age), "dist": case_dist[r["CaseMasterID"]]})
    n = len(recs)
    blocks = defaultdict(list)
    for r in recs:
        if r["age"] is None:
            continue
        for tok in {t for t in r["toks"] if len(t) >= 2}:
            blocks[(an.phonetic(tok), r["gender"])].append(r["i"])
    seen, scored, exact = set(), [], []
    for key, idxs in blocks.items():
        if len(idxs) > 4000:
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
                same_dist = ra["dist"] == rb["dist"]
                s = 0.6 * ts + 0.2 * max(0.0, 1 - dage / 5.0) + 0.2 * (1.0 if same_dist else 0.0)
                if ts >= 0.95 and dage <= 2:
                    exact.append((i, j))
                if s >= 0.70:
                    scored.append((i, j, s, same_dist, ts))
    del seen
    aid_col = next(c for c in gt.columns if c.lower() == "accusedmasterid")
    tid_col = next(c for c in gt.columns if c.lower() == "trueoffenderid")
    gt_map = dict(zip(gt[aid_col], gt[tid_col]))
    tid = {r["i"]: gt_map.get(r["aid"]) for r in recs}
    true_pairs = sum(k * (k - 1) // 2 for k in Counter(t for t in tid.values() if t).values())

    exact_same_dist = [(i, j) for i, j in exact if recs[i]["dist"] == recs[j]["dist"]]

    def cluster(threshold, variant):
        uf = an.UnionFind(n)
        for i, j, s, same_dist, ts in scored:
            if s < threshold:
                continue
            if variant == "v2" and not same_dist:
                continue
            uf.union(i, j)
        anchors = exact if variant == "v1" else exact_same_dist if variant == "v2" else []
        for i, j in anchors:
            uf.union(i, j)
        groups = defaultdict(list)
        for i in range(n):
            groups[uf.find(i)].append(i)
        return list(groups.values())

    def evaluate(groups):
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
            fp += len(gts) * non
        prec = tp / (tp + fp) if (tp + fp) else 1.0
        rec = tp / true_pairs if true_pairs else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        clusters = sum(1 for g in groups if len(g) >= 2)
        biggest = max((len(g) for g in groups), default=0)
        return {"precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4),
                "correctPairs": tp, "falsePairs": fp, "clusters": clusters, "largestCluster": biggest}

    curves = {}
    for variant in ("v1", "v2", "v3"):
        pts = []
        for th in SWEEP:
            m = evaluate(cluster(th, variant))
            m["threshold"] = th
            pts.append(m)
        best = max(pts, key=lambda p: p["f1"])
        curves[variant] = {"points": pts, "bestF1": best}
    return {
        "thresholds": SWEEP,
        "truePairs": true_pairs, "groundTruthRows": len(gt_map), "accusedRows": n,
        "candidatePairs": len(scored), "exactAnchors": len(exact), "exactAnchorsSameDistrict": len(exact_same_dist),
        "v1": dict(curves["v1"], label="v1 — pipeline scorer: phonetic + gender blocking, 0.6·ts + 0.2·age + 0.2·district, exact-name anchor across districts"),
        "v2": dict(curves["v2"], label="v2 — district blocking: scored pairs only within a district, exact-name anchors only within a district"),
        "v3": dict(curves["v3"], label="v3 — scorer only: the exact-name anchor pass removed, threshold decides every link"),
        "pipelinePoint": {"threshold": 0.92, "note": "the operating point analytics.py selected (identity_metrics.json)"},
        "computeSeconds": round(time.time() - t0, 1),
        "method": ("Accused rows are blocked on (phonetic key of any name token, gender) and paired within an age "
                   "window of 2 years; each pair is scored 0.6·token_sort_ratio + 0.2·max(0, 1 − |Δage|/5) + "
                   "0.2·[same district]; clusters are union-find components over pairs at or above the threshold "
                   "plus the exact-name anchors. Precision and recall are pairwise against _ground_truth_offenders.csv "
                   "(a planted offender linked to a background person counts as a false pair)."),
    }


# ---------------------------------------------------------------- recovery card
def hour_in_band(h: int, h0: int, h1: int) -> bool:
    return h0 <= h <= h1 if h0 <= h1 else (h >= h0 or h <= h1)


def recovery(cm: pd.DataFrame, acc: pd.DataFrame, gt: pd.DataFrame, lut: dict) -> dict:
    subs = an.load_csv("CrimeSubHead.csv")
    sub_head = dict(zip(subs["CrimeSubHeadID"].astype(int), subs["CrimeHeadID"].astype(int)))
    hs = an.load_csv("HotspotCluster.csv")
    alerts = an.load_csv("AnomalyAlert.csv")
    prof = an.load_csv("OffenderProfile.csv")
    edges = an.load_csv("NetworkEdge.csv")

    # -- hotspots -------------------------------------------------------------
    hs_rows = []
    for dcode, label, lat, lng, sub, h0, h1 in HOTSPOTS:
        head = sub_head[sub]
        best = None
        for _, c in hs.iterrows():
            if int(c["CrimeHeadID"]) != head:
                continue
            d = an.haversine_km(lat, lng, float(c["CentroidLat"]), float(c["CentroidLng"]))
            if best is None or d < best[0]:
                best = (d, c)
        # density rank of the planted spot among 1-km cells for that sub-head + hour band
        sel = cm[(cm["CrimeMinorHeadID"].astype(int) == sub) & cm["lat"].notna()]
        sel = sel[[hour_in_band(int(h), h0, h1) for h in sel["hour"]]]
        cell = lambda la, ln: (int(la * 110.574), int(ln * 111.32 * math.cos(math.radians(15))))  # noqa: E731
        cells = Counter(cell(la, ln) for la, ln in zip(sel["lat"], sel["lng"]))
        planted_cell = cell(lat, lng)
        planted_count = cells.get(planted_cell, 0)
        rank = 1 + sum(1 for v in cells.values() if v > planted_count)
        within1km = int(sum(1 for la, ln in zip(sel["lat"], sel["lng"]) if an.haversine_km(lat, lng, la, ln) <= 1.0))
        hs_rows.append({
            "label": label, "districtId": str(dcode), "subHeadId": sub, "crimeHeadId": head,
            "lat": lat, "lng": lng, "hourBand": [h0, h1],
            "recovered": bool(best is not None and best[0] <= 1.5),
            "nearestClusterKm": round(best[0], 2) if best else None,
            "nearestClusterId": best[1]["ClusterID"] if best else None,
            "nearestClusterLabel": best[1]["Label"] if best else None,
            "nearestClusterHourBand": [int(best[1]["HourBandStart"]), int(best[1]["HourBandEnd"])] if best else None,
            "casesWithin1km": within1km,
            "densityRankOfPlantedCell": rank, "densityCells": len(cells), "plantedCellCases": planted_count,
        })

    # -- anomalies ------------------------------------------------------------
    an_rows = []
    f8 = FINAL8_START.isoformat()
    for dcode, sub, pct, label in ANOMALIES:
        head = sub_head[sub]
        hit = alerts[(alerts["DistrictID"].astype(str) == str(dcode)) & (alerts["CrimeHeadID"].astype(int) == head)
                     & (alerts["PeriodStart"] >= f8)]
        zs = pd.to_numeric(hit["ZScore"], errors="coerce")
        an_rows.append({
            "label": label, "districtId": str(dcode), "subHeadId": sub, "crimeHeadId": head, "plantedUpliftPct": pct,
            "recovered": bool(len(hit) and zs.max() >= 2.0),
            "alertsInWindow": int(len(hit)), "maxZ": round(float(zs.max()), 2) if len(hit) else None,
            "firstAlertWeek": str(hit["PeriodStart"].min()) if len(hit) else None,
            "alertIds": hit["AlertID"].tolist()[:6],
        })

    # -- offenders + communities ---------------------------------------------
    key_cases = defaultdict(set)
    for _, e in edges.iterrows():
        try:
            ids = json.loads(e["CaseIDsJson"])
        except Exception:
            ids = []
        for k in (e["PersonKeyA"], e["PersonKeyB"]):
            key_cases[k].update(str(c) for c in ids)
    key_names = {}
    key_cases_total = {}
    key_comm = {}
    for _, p in prof.iterrows():
        names = {p["CanonicalName"].strip().lower()}
        try:
            names.update(a.strip().lower() for a in json.loads(p["AliasesJson"]))
        except Exception:
            pass
        key_names[p["PersonKey"]] = names
        key_cases_total[p["PersonKey"]] = int(p["CaseCount"])
        key_comm[p["PersonKey"]] = p["CommunityID"]
    by_name_case = defaultdict(set)  # (name, case) -> keys
    for k, cases in key_cases.items():
        for nm in key_names.get(k, ()):
            for c in cases:
                by_name_case[(nm, c)].add(k)

    aid_col = next(c for c in gt.columns if c.lower() == "accusedmasterid")
    tid_col = next(c for c in gt.columns if c.lower() == "trueoffenderid")
    offenders = defaultdict(list)
    for _, r in gt.iterrows():
        offenders[r[tid_col]].append((str(r["CaseMasterID"]), r["AccusedName"].strip().lower(), r.get("CommunityID", "")))
    off_rows = []
    for tid, rows in offenders.items():
        cases = {c for c, _, _ in rows}
        cover = Counter()
        for c, nm, _ in rows:
            for k in by_name_case.get((nm, c), ()):
                cover[k] += 1
        best_key, best_n = (cover.most_common(1)[0] if cover else (None, 0))
        coverage = best_n / len(cases) if cases else 0.0
        off_rows.append({
            "trueId": tid, "community": rows[0][2] or None, "cases": len(cases),
            "bestKey": best_key, "coverage": round(coverage, 3),
            "recovered": coverage >= 0.5, "full": coverage >= 0.999,
            "keyCaseCount": key_cases_total.get(best_key) if best_key else None,
            "overMerge": round(key_cases_total[best_key] / len(cases), 2) if best_key and cases else None,
            "louvain": key_comm.get(best_key) if best_key else None,
        })
    solo = [o for o in off_rows if not o["community"]]
    comm_members = [o for o in off_rows if o["community"]]
    comm_rows = []
    for cid in sorted({o["community"] for o in comm_members}):
        members = [o for o in comm_members if o["community"] == cid]
        louv = Counter(o["louvain"] for o in members if o["recovered"] and o["louvain"])
        top = louv.most_common(1)[0] if louv else (None, 0)
        comm_rows.append({
            "communityId": cid, "members": len(members),
            "membersRecovered": sum(1 for o in members if o["recovered"]),
            "dominantLouvain": top[0], "membersInDominant": top[1],
            "share": round(top[1] / len(members), 3) if members else 0.0,
            "recovered": bool(members) and top[1] / len(members) >= 0.5,
        })
    louvain_sizes = Counter(v for v in prof["CommunityID"] if v)

    return {
        "generatedFrom": "pipeline/out (generate.py seed 2026 → analytics.py outputs)",
        "hotspots": {
            "planted": len(HOTSPOTS), "recovered": sum(1 for r in hs_rows if r["recovered"]),
            "plantedCellTopRanked": sum(1 for r in hs_rows if r["densityRankOfPlantedCell"] == 1),
            "matchRule": "a HotspotCluster of the same crime head within 1.5 km of the planted centre (DBSCAN ran on the last 6 months only; the planted hotspots span the whole 36-month window)",
            "rows": hs_rows,
        },
        "anomalies": {
            "planted": len(ANOMALIES), "recovered": sum(1 for r in an_rows if r["recovered"]),
            "matchRule": f"an AnomalyAlert for the same district × crime head with PeriodStart ≥ {f8} and z ≥ 2",
            "rows": an_rows,
        },
        "offenders": {
            "planted": len(solo), "recovered": sum(1 for o in solo if o["recovered"]),
            "fullyRecovered": sum(1 for o in solo if o["full"]),
            "medianCoverage": round(float(np.median([o["coverage"] for o in solo])), 3) if solo else None,
            "medianOverMerge": round(float(np.median([o["overMerge"] for o in solo if o["overMerge"]])), 2) if any(o["overMerge"] for o in solo) else None,
            "matchRule": "a PersonKey whose NetworkEdge cases and canonical/alias names cover ≥ 50 % of the planted offender's (name, case) rows; full = every row. Only cases with a co-accused are edge-visible, so coverage is a floor.",
            "rows": sorted(solo, key=lambda o: o["trueId"])[:250],
        },
        "communities": {
            "planted": len(comm_rows), "recovered": sum(1 for c in comm_rows if c["recovered"]),
            "plantedMembers": len(comm_members), "membersRecovered": sum(1 for o in comm_members if o["recovered"]),
            "louvainCommunities": len(louvain_sizes),
            "largestLouvain": louvain_sizes.most_common(1)[0][1] if louvain_sizes else 0,
            "matchRule": "≥ 50 % of a planted community's members map to PersonKeys that share one Louvain community id",
            "rows": comm_rows,
        },
    }


def main() -> None:
    skip_identity = "--skip-identity" in sys.argv
    cm, acc, vic, arr, cs, asa, socio, gt, lut = an.load_all()
    if gt is None:
        raise SystemExit("FATAL: pipeline/out/_ground_truth_offenders.csv missing")
    print(f"[depth] cases {len(cm)} accused {len(acc)} ground-truth rows {len(gt)}")
    write_both("recovery_metrics.json", recovery(cm, acc, gt, lut))
    write_both("forecast_coverage.json", forecast_coverage(cm))
    if not skip_identity:
        write_both("identity_sweep.json", identity_sweep(cm, acc, gt))
    # keep the bundled copies of the pipeline's own artefacts in step
    for name in ("forecast_metrics.json", "identity_metrics.json"):
        src = BENCH / name
        if src.exists():
            BUNDLE.mkdir(parents=True, exist_ok=True)
            (BUNDLE / name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
            print(f"[depth] mirrored {name} into lib/depth/bench")


if __name__ == "__main__":
    main()
