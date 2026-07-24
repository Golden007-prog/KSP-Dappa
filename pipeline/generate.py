#!/usr/bin/env python3.12
"""KSP DAPPA - synthetic data engine (master spec Phase 2).

Writes one CSV per official ER table (docs/ER_TEXT_EXTRACT.txt column names,
verbatim) into pipeline/out/, plus SocioEconomic.csv (Appendix C) and the
private _ground_truth_offenders.csv used only for identity-resolution
benchmarking (never bulk-loaded).

Deterministic under --seed. Scale via env DAPPA_SCALE (default 45000 cases).
Validators run automatically at the end and the process exits non-zero if any
check fails.

Usage:  python3.12 pipeline/generate.py [--seed 2026]
"""
from __future__ import annotations

import argparse
import csv
import os
import random
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dappa_seed import (ACTS, ANOMALIES, BLR_LOCALITIES, BNS_CUTOVER, CASE_CATEGORIES,
                        CASE_STATUSES, CASTES, CITY_LOCALITY_SUFFIX, CRIME_HEADS,
                        CYBER_YOY, DESIGNATIONS, DISTRICTS, DIST_STATION_SUFFIX,
                        FESTIVALS, FESTIVAL_FACTOR, FINAL8_START, GLOBAL_YOY,
                        GRAVITY, HOTSPOTS, HOUR_PROFILES, KA_BBOX, MONSOON_FACTOR,
                        MONSOON_MONTHS, NATIONALITY_ID, OCCUPATIONS, POCSO_SECTIONS,
                        RANKS, RELIGIONS, SECTION_DESC, SECTION_MAP, STATE_ID,
                        SUBHEADS, UDR_SUBHEADS, UNIT_TYPES, WEEKEND_FACTOR,
                        WINDOW_END, WINDOW_START)
from dappa_text import compose_brief, name_variants, pick_name, random_mo
from dappa_validate import run_validators

# ----------------------------------------------------------------- config
SEED = 2026
N_CASES = int(os.environ.get("DAPPA_SCALE", "45000"))
OUT_DIR = os.environ.get("DAPPA_OUT") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "out")
N_OFFENDERS_FULL = 200          # at N=45000; scales down with DAPPA_SCALE
N_COMMUNITIES = 12              # fixed (2 span >= 3 districts)
BENGALURU_SHARE = 0.30          # spec: 28-32% of statewide load
DETECTION_RATE = 0.50           # share of non-UDR cases with known accused
ARREST_RATE = 0.55              # share of detected cases with arrest rows
FINAL_REPORT_AGE_DAYS = 90      # cases older than this may get a final report
FINAL_REPORT_PROB = 0.85
CS_A_WITHIN_DETECTED = 0.84     # -> overall A~42% / B~8% / C~50% of reports

D_IDX = {d[0]: i for i, d in enumerate(DISTRICTS)}
SUB_IDS = sorted(SUBHEADS)
DAY0 = WINDOW_START
N_DAYS = (WINDOW_END - timedelta(days=4) - DAY0).days + 1  # lag headroom


# ----------------------------------------------------------------- helpers
def iso_d(d):
    return d.strftime("%Y-%m-%d")


def iso_dt(d):
    return d.strftime("%Y-%m-%d %H:%M:%S")


def clip_coord(lat, lng):
    return (min(max(lat, KA_BBOX[0] + 0.03), KA_BBOX[1] - 0.03),
            min(max(lng, KA_BBOX[2] + 0.03), KA_BBOX[3] - 0.03))


def day_weights(sub_id):
    """Per-day sampling weights for one subhead over the whole window."""
    _, _, _, _, monsoon, festival, weekend, growth, _ = SUBHEADS[sub_id]
    w = np.ones(N_DAYS)
    fest_days = set()
    for f in FESTIVALS:
        for k in range(-5, 6):
            fest_days.add((f + timedelta(days=k) - DAY0).days)
    for i in range(N_DAYS):
        d = DAY0 + timedelta(days=i)
        yrs = i / 365.25
        w[i] *= GLOBAL_YOY ** yrs
        if growth:
            w[i] *= CYBER_YOY ** yrs
        if monsoon and d.month in MONSOON_MONTHS:
            w[i] *= MONSOON_FACTOR
        if festival and i in fest_days:
            w[i] *= FESTIVAL_FACTOR
        if weekend:
            w[i] *= WEEKEND_FACTOR if d.weekday() >= 5 else 0.95
    return w / w.sum()


def sample_hour_band(rng, h_start, h_end):
    span = (h_end - h_start) % 24 or 24
    return (h_start + rng.randrange(span)) % 24


# ----------------------------------------------------------------- build fns
def build_units(rng):
    """Returns (unit_rows, stations_by_district, station_meta)."""
    unit_rows = [[1000, "Karnataka State Police Headquarters", 1, "",
                  NATIONALITY_ID, STATE_ID, 101, 1]]
    stations_by_district = {}
    station_meta = {}      # unit_id -> (district, name, lat, lng, is_city)
    next_station = 3001
    for k, (code, name, lat, lng, is_city, _w, _p, _u) in enumerate(DISTRICTS, 1):
        hq_id, circle_id = 1000 + k, 2000 + k
        hq_name = (f"Office of the Commissioner of Police, {name}" if is_city
                   else f"District Police Office, {name}")
        unit_rows.append([hq_id, hq_name, 2 if is_city else 3, 1000,
                          NATIONALITY_ID, STATE_ID, code, 1])
        unit_rows.append([circle_id, f"{name} Circle Office", 4, hq_id,
                          NATIONALITY_ID, STATE_ID, code, 1])
        if code == 101:
            n_st = 14
        elif is_city:
            n_st = rng.randint(8, 10)
        else:
            n_st = rng.randint(4, 9)
        st_ids = []
        for j in range(n_st):
            if code == 101:
                st_name = f"{BLR_LOCALITIES[j]} PS"
            elif is_city:
                st_name = f"{name.replace(' City', '')} {CITY_LOCALITY_SUFFIX[j]} PS"
            else:
                sfx = DIST_STATION_SUFFIX[j % len(DIST_STATION_SUFFIX)]
                st_name = f"{name} {sfx} PS"
            ang = 2 * np.pi * j / n_st + rng.uniform(-0.3, 0.3)
            rad = rng.uniform(0.01, 0.06) if is_city else rng.uniform(0.02, 0.12)
            s_lat, s_lng = clip_coord(lat + rad * np.sin(ang), lng + rad * np.cos(ang))
            unit_rows.append([next_station, st_name, 5, circle_id,
                              NATIONALITY_ID, STATE_ID, code, 1])
            station_meta[next_station] = (code, st_name, s_lat, s_lng, is_city)
            st_ids.append(next_station)
            next_station += 1
        stations_by_district[code] = st_ids
    return unit_rows, stations_by_district, station_meta


def build_employees(rng, stations_by_district):
    """~1200 employees with rank hierarchy; returns rows + per-station pools."""
    rows, io_pool, reg_pool = [], {}, {}
    eid = 100000

    def emp(district, unit, rank, desig):
        nonlocal eid
        eid += 1
        gender = 2 if rng.random() < 0.12 else 1
        dob = date(rng.randint(1970, 2000), rng.randint(1, 12), rng.randint(1, 28))
        appt = dob.replace(year=dob.year + rng.randint(22, 30))
        rows.append([eid, district, unit, rank, desig, f"KG{eid:06d}",
                     pick_name(rng, gender).split(" ")[0], iso_d(dob), gender,
                     rng.randint(1, 8), 1 if rng.random() < 0.02 else 0,
                     iso_d(appt)])
        return eid

    emp(101, 1000, 1, 1)                       # DGP
    for r in (2, 2, 3, 3, 4):                  # ADGPs / IGPs / DIG
        emp(101, 1000, r, 1)
    for k, (code, _n, _la, _ln, is_city, *_r) in enumerate(DISTRICTS, 1):
        hq, circle = 1000 + k, 2000 + k
        emp(code, hq, 5, 2 if is_city else 3)  # SP / Commissioner
        emp(code, hq, 6, 3)
        emp(code, hq, 7, 4)
        emp(code, circle, 8, 5)                # CPI
        for st in stations_by_district[code]:
            sho = emp(code, st, 8, 6)          # Inspector SHO
            si = emp(code, st, 9, 7)           # Sub-Inspector
            asi = emp(code, st, 10, 7)
            staff = [sho, si, asi]
            for _ in range(rng.randint(0, 2)):
                staff.append(emp(code, st, rng.choice([11, 12]), rng.choice([8, 9])))
            io_pool[st] = [sho, si]
            reg_pool[st] = staff
    return rows, io_pool, reg_pool


def build_courts():
    rows, sessions, jmfc = [], {}, {}
    cid = 0
    for code, name, _la, _ln, is_city, *_r in DISTRICTS:
        cid += 1
        cname = (f"City Civil & Sessions Court, {name}" if is_city
                 else f"{name} District & Sessions Court")
        rows.append([cid, cname, code, STATE_ID, 1])
        sessions[code] = cid
        cid += 1
        rows.append([cid, f"JMFC Court, {name}", code, STATE_ID, 1])
        jmfc[code] = cid
    return rows, sessions, jmfc


def sample_base_cases(rng, nprng, n_base, stations_by_district, station_meta):
    """Vectorized sampling of district, station, subhead, day, hour, coords."""
    dist_w = np.array([d[5] for d in DISTRICTS], dtype=float)
    dist_w[D_IDX[101]] = 0.0
    dist_w = dist_w / dist_w.sum() * (1 - BENGALURU_SHARE)
    dist_w[D_IDX[101]] = BENGALURU_SHARE
    dist_idx = nprng.choice(len(DISTRICTS), size=n_base, p=dist_w)

    sub_w = np.array([SUBHEADS[s][2] for s in SUB_IDS], dtype=float)
    sub_w /= sub_w.sum()
    sub_pick = nprng.choice(len(SUB_IDS), size=n_base, p=sub_w)

    days = np.empty(n_base, dtype=int)
    hours = np.empty(n_base, dtype=int)
    for si, sub in enumerate(SUB_IDS):
        mask = sub_pick == si
        cnt = int(mask.sum())
        if not cnt:
            continue
        days[mask] = nprng.choice(N_DAYS, size=cnt, p=day_weights(sub))
        hw = np.array(HOUR_PROFILES[SUBHEADS[sub][3]], dtype=float)
        hours[mask] = nprng.choice(24, size=cnt, p=hw / hw.sum())

    cases = []
    for i in range(n_base):
        dcode = DISTRICTS[dist_idx[i]][0]
        st = rng.choice(stations_by_district[dcode])
        _c, _n, s_lat, s_lng, is_city = station_meta[st]
        sd = 0.008 if is_city else 0.02
        lat, lng = clip_coord(s_lat + rng.gauss(0, sd), s_lng + rng.gauss(0, sd))
        cases.append({"sub": SUB_IDS[sub_pick[i]], "dist": dcode, "unit": st,
                      "day": int(days[i]), "hour": int(hours[i]),
                      "lat": lat, "lng": lng, "tag": ""})
    return cases


def injected_cases(rng, nprng, stations_by_district, station_meta):
    """6 spatial-hour hotspots (whole window) + 4 final-8-week anomalies."""
    sf = N_CASES / 45000.0
    out = []
    hs_n = max(20, int(round(150 * sf)))
    for dcode, label, lat, lng, sub, h0, h1 in HOTSPOTS:
        # nearest station in the district anchors the hotspot
        best = min(stations_by_district[dcode],
                   key=lambda s: (station_meta[s][2] - lat) ** 2 +
                                 (station_meta[s][3] - lng) ** 2)
        dw = day_weights(sub)
        days = nprng.choice(N_DAYS, size=hs_n, p=dw)
        for k in range(hs_n):
            la, ln = clip_coord(lat + rng.gauss(0, 0.0025), lng + rng.gauss(0, 0.0025))
            out.append({"sub": sub, "dist": dcode, "unit": best,
                        "day": int(days[k]),
                        "hour": sample_hour_band(rng, h0, h1),
                        "lat": la, "lng": ln, "tag": f"hotspot:{label}"})

    sub_w = {s: SUBHEADS[s][2] for s in SUB_IDS}
    tot_w = sum(sub_w.values())
    d_share = {d[0]: d[5] for d in DISTRICTS}
    f8_days = (WINDOW_END - timedelta(days=4) - FINAL8_START).days + 1
    f8_off = (FINAL8_START - DAY0).days
    for dcode, sub, pct, label in ANOMALIES:
        expected = N_CASES * (sub_w[sub] / tot_w) * d_share[dcode] * (56 / 1096)
        n = max(6, int(round(expected * pct / 100.0)))
        hw = np.array(HOUR_PROFILES[SUBHEADS[sub][3]], dtype=float)
        for _ in range(n):
            st = rng.choice(stations_by_district[dcode])
            _c, _n2, s_lat, s_lng, is_city = station_meta[st]
            sd = 0.008 if is_city else 0.02
            la, ln = clip_coord(s_lat + rng.gauss(0, sd), s_lng + rng.gauss(0, sd))
            out.append({"sub": sub, "dist": dcode, "unit": st,
                        "day": f8_off + rng.randrange(f8_days),
                        "hour": int(nprng.choice(24, p=hw / hw.sum())),
                        "lat": la, "lng": ln, "tag": f"anomaly:{label}"})
    return out


def finalize_case_timing(rng, cases):
    """Incident from/to, registration (lag 0-3d), info-received, ids, CrimeNo."""
    for c in cases:
        d = DAY0 + timedelta(days=c["day"])
        frm = datetime(d.year, d.month, d.day, c["hour"], rng.randrange(60))
        dur = timedelta(minutes=rng.randint(10, 360))
        if c["sub"] == 303:                      # overnight span for HB Night
            dur = timedelta(hours=rng.randint(4, 9))
        to = frm + dur
        lag = rng.choices([0, 1, 2, 3], weights=[0.55, 0.25, 0.13, 0.07])[0]
        reg = to.date() + timedelta(days=lag)
        info = max(to + timedelta(minutes=rng.randint(30, 240)),
                   datetime(reg.year, reg.month, reg.day, rng.randint(6, 21),
                            rng.randrange(60)))
        c["frm"], c["to"], c["reg"], c["info"] = frm, to, reg, info

    cases.sort(key=lambda c: (c["reg"], c["frm"]))
    serial = defaultdict(int)
    for i, c in enumerate(cases, 1):
        c["id"] = i
        sub = c["sub"]
        if sub in UDR_SUBHEADS:
            cat = 3
        elif sub in (305, 602, 103) and rng.random() < 0.06:
            cat = 4
        elif rng.random() < 0.02:
            cat = 8
        else:
            cat = 1
        c["cat"] = cat
        key = (c["unit"], cat, c["reg"].year)
        serial[key] += 1
        c["crimeno"] = (f"{cat}{c['dist']:04d}{c['unit']:04d}"
                        f"{c['reg'].year:04d}{serial[key]:05d}")
        c["caseno"] = c["crimeno"][-9:]
        c["heinous"] = SUBHEADS[sub][8]
    return cases


def plant_offenders(rng, cases):
    """~200 repeat offenders + 12 co-accused communities on detected cases.

    Fills case['planted'] = [(true_id, variant, age, gender, comm_id)], keeps a
    per-offender fixed MO on case['mo'] so BriefFacts vocabulary is consistent.
    Returns ground-truth person registry.
    """
    pools = defaultdict(list)
    for c in cases:
        if c["detected"]:
            pools[(c["sub"], c["dist"])].append(c)
    used = set()
    persons = {}

    def take_cases(subs, dists, want, spread=False):
        got = []
        if spread:  # round-robin over districts so wide rings really span
            per = defaultdict(list)
            for s in subs:
                for d in dists:
                    per[d].extend(x for x in pools[(s, d)] if x["id"] not in used)
            di = 0
            dlist = [d for d in dists if per[d]]
            while len(got) < want and dlist:
                d = dlist[di % len(dlist)]
                while per[d] and per[d][-1]["id"] in used:
                    per[d].pop()
                if per[d]:
                    c = per[d].pop()
                    used.add(c["id"])
                    got.append(c)
                else:
                    dlist.remove(d)
                    continue
                di += 1
            return got
        cands = []
        for s in subs:
            for d in dists:
                cands.extend(x for x in pools[(s, d)] if x["id"] not in used)
        rng.shuffle(cands)
        for c in cands[:want]:
            used.add(c["id"])
            got.append(c)
        return got

    fallback = {3: [305, 306, 303, 307, 302], 4: [401, 402], 5: [501, 502],
                1: [103], 7: [701]}
    dist_codes = [d[0] for d in DISTRICTS]
    dist_wts = [d[5] for d in DISTRICTS]

    # --- solo repeat offenders ------------------------------------------------
    n_off = min(N_OFFENDERS_FULL, max(24, int(round(N_OFFENDERS_FULL * N_CASES / 45000))))
    made = 0
    for k in range(n_off * 3):                 # retry budget
        if made >= n_off:
            break
        gender = 1 if rng.random() < 0.92 else 2
        canonical = pick_name(rng, gender)
        base_age = int(rng.triangular(19, 45, 27))
        mo_sub = rng.choices([303, 305, 306, 307, 302, 401, 501],
                             weights=[20, 22, 20, 14, 8, 8, 8])[0]
        nd = rng.choices([1, 2, 3, 4], weights=[35, 30, 20, 15])[0]
        dists = []
        while len(dists) < nd:
            d = rng.choices(dist_codes, weights=dist_wts)[0]
            if d not in dists:
                dists.append(d)
        want = rng.choices([3, 4, 5, 6, 7, 8, 9],
                           weights=[24, 22, 18, 14, 10, 7, 5])[0]
        got = take_cases([mo_sub], dists, want)
        if len(got) < want:
            got += take_cases(fallback[SUBHEADS[mo_sub][1]], dists, want - len(got))
        if len(got) < 3:
            for c in got:
                used.discard(c["id"])
            continue
        made += 1
        pid = f"P{made:03d}"
        variants = name_variants(rng, canonical)
        mo = random_mo(rng)
        persons[pid] = {"canonical": canonical, "gender": gender, "mo_sub": mo_sub,
                        "comm": ""}
        for j, c in enumerate(got):
            age = max(18, base_age + rng.choice([-1, 0, 0, 1]))
            c.setdefault("planted", []).append(
                (pid, variants[j % len(variants)], age, gender, ""))
            c["mo"] = mo

    # --- organized co-accused communities ------------------------------------
    ring_types = [306, 301, 501, 307]
    for ci in range(N_COMMUNITIES):
        comm_id = f"C{ci + 1:02d}"
        sub = ring_types[ci % len(ring_types)]
        wide = ci < 2                           # 2 communities span >= 3 districts
        nd = rng.randint(3, 4) if wide else rng.randint(1, 2)
        dists = []
        while len(dists) < nd:
            d = rng.choices(dist_codes, weights=dist_wts)[0]
            if d not in dists:
                dists.append(d)
        n_mem = rng.randint(5, 12)
        members = []
        for m in range(n_mem):
            gender = 1 if rng.random() < 0.95 else 2
            canonical = pick_name(rng, gender)
            pid = f"{comm_id}-M{m + 1:02d}"
            persons[pid] = {"canonical": canonical, "gender": gender,
                            "mo_sub": sub, "comm": comm_id}
            members.append((pid, canonical, gender, int(rng.triangular(19, 42, 26)),
                            name_variants(rng, canonical)))
        want = max(4, n_mem // 2 + 2)
        got = take_cases([sub], dists, want, spread=wide)
        if len(got) < want:
            got += take_cases(fallback[SUBHEADS[sub][1]], dists, want - len(got),
                              spread=wide)
        mo = random_mo(rng)
        mi = 0
        for c in got:
            k = rng.randint(2, min(5, n_mem))
            for _ in range(k):
                pid, canonical, gender, base_age, variants = members[mi % n_mem]
                mi += 1
                age = max(18, base_age + rng.choice([-1, 0, 0, 1]))
                c.setdefault("planted", []).append(
                    (pid, variants[mi % len(variants)], age, gender, comm_id))
            c["mo"] = mo
    return persons


def main():
    ap = argparse.ArgumentParser(description="KSP DAPPA synthetic data engine")
    ap.add_argument("--seed", type=int, default=SEED)
    args = ap.parse_args()
    t0 = time.time()
    rng = random.Random(args.seed)
    nprng = np.random.default_rng(args.seed)
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"[generate] seed={args.seed} N_CASES={N_CASES} out={OUT_DIR}")

    unit_rows, stations_by_district, station_meta = build_units(rng)
    emp_rows, io_pool, reg_pool = build_employees(rng, stations_by_district)
    court_rows, sessions_court, jmfc_court = build_courts()

    inj = injected_cases(rng, nprng, stations_by_district, station_meta)
    n_base = N_CASES - len(inj)
    cases = sample_base_cases(rng, nprng, n_base, stations_by_district,
                              station_meta) + inj
    cases = finalize_case_timing(rng, cases)
    print(f"[generate] {len(cases)} cases ({len(inj)} injected: "
          f"6 hotspots + 4 anomalies)")

    for c in cases:
        c["detected"] = (c["sub"] not in UDR_SUBHEADS
                         and rng.random() < DETECTION_RATE)
    persons = plant_offenders(rng, cases)
    n_planted = sum(len(c.get("planted", [])) for c in cases)
    print(f"[generate] planted {len(persons)} true persons "
          f"({n_planted} accused appearances)")

    # ------------------------------------------------------------- party rows
    acc_rows, vic_rows, comp_rows, asa_rows, arr_rows, cs_rows, gt_rows = \
        [], [], [], [], [], [], []
    cm_rows = []
    acc_id = vic_id = comp_id = arr_id = cs_id = 0
    cutoff = WINDOW_END - timedelta(days=FINAL_REPORT_AGE_DAYS)
    officer_led = {403, 601, 602, 701, 702}

    for c in cases:
        sub = c["sub"]
        sub_meta = SUBHEADS[sub]
        head, profile = sub_meta[1], sub_meta[3]
        is_udr = sub in UDR_SUBHEADS
        mo = c.get("mo") or random_mo(rng)

        # accused ------------------------------------------------------------
        acc_names = []
        if c["detected"]:
            planted = c.get("planted", [])
            n_target = rng.choices([1, 2, 3, 4, 5],
                                   weights=[55, 25, 12, 5, 3])[0]
            n_acc_case = max(n_target, len(planted))
            case_acc_ids = []
            for j in range(n_acc_case):
                acc_id += 1
                if j < len(planted):
                    pid, name, age, gender, comm = planted[j]
                    gt_rows.append([pid, acc_id, c["id"], name, gender, age,
                                    c["dist"], persons[pid]["canonical"],
                                    persons[pid]["mo_sub"], comm])
                else:
                    gender = 1 if rng.random() < 0.9 else 2
                    name, age = pick_name(rng, gender), int(rng.triangular(18, 26, 55))
                acc_rows.append([acc_id, c["id"], name, age, gender, f"A{j + 1}"])
                acc_names.append(name)
                case_acc_ids.append(acc_id)

        # victims ------------------------------------------------------------
        if sub in (201, 202, 203, 204):
            v_gender, n_vic = 2, 1
        elif sub == 601:
            v_gender, n_vic = 0, rng.randint(1, 3)
        else:
            v_gender, n_vic = 0, rng.choices([1, 2], weights=[80, 20])[0]
        pocso = sub == 201 and rng.random() < 0.15
        vic_names = []
        for _ in range(n_vic):
            vic_id += 1
            g = v_gender or (2 if rng.random() < 0.4 else 1)
            if pocso:
                v_age = rng.randint(8, 17)
            elif sub == 801:
                v_age = rng.randint(10, 70)
            else:
                v_age = rng.randint(18, 70)
            vname = pick_name(rng, g)
            vic_names.append(vname)
            vic_rows.append([vic_id, c["id"], vname, v_age, g,
                             1 if rng.random() < 0.01 else 0])

        # complainants -------------------------------------------------------
        n_comp = rng.choices([1, 2], weights=[82, 18])[0]
        comp_names = []
        for _ in range(n_comp):
            comp_id += 1
            g = 2 if rng.random() < 0.35 else 1
            cname = pick_name(rng, g)
            if sub in officer_led:
                cname = f"{('SI' if rng.random() < 0.7 else 'PI')} {cname}"
                occ = 2
            else:
                occ = rng.choice(OCCUPATIONS)[0]
            comp_names.append(cname)
            comp_rows.append([comp_id, c["id"], cname, rng.randint(21, 65), occ,
                              rng.choices([r[0] for r in RELIGIONS],
                                          weights=[78, 13, 4, 2, 1, 1, 1])[0],
                              rng.choices([x[0] for x in CASTES],
                                          weights=[30, 34, 20, 8, 8])[0], g])

        # sections (era by incident date) -------------------------------------
        era = "ipc" if c["frm"].date() < BNS_CUTOVER else "bns"
        secs = list(SECTION_MAP[sub][era])
        for prob, ipc_ref, bns_ref in SECTION_MAP[sub]["extra"]:
            if len(secs) >= 4:
                break
            if rng.random() < prob:
                ref = ipc_ref if era == "ipc" else bns_ref
                if ref not in secs:
                    secs.append(ref)
        if pocso and len(secs) < 4:
            secs.append(POCSO_SECTIONS[0] if rng.random() < 0.7 else POCSO_SECTIONS[1])
        act_order, seen_act = {}, []
        for act, _s in secs:
            if act not in act_order:
                seen_act.append(act)
                act_order[act] = len(seen_act)
        sec_ord = defaultdict(int)
        for act, s in secs[:4]:
            sec_ord[act] += 1
            asa_rows.append([c["id"], act, s, act_order[act], sec_ord[act]])

        # chargesheet / status / arrests --------------------------------------
        cstype = None
        if not is_udr and c["reg"] <= cutoff and rng.random() < FINAL_REPORT_PROB:
            if c["detected"]:
                cstype = "A" if rng.random() < CS_A_WITHIN_DETECTED else "B"
            else:
                cstype = "C"
        io = rng.choice(io_pool[c["unit"]])
        if cstype:
            cs_id += 1
            csdate = datetime.combine(c["reg"] + timedelta(days=rng.randint(20, 85)),
                                      datetime.min.time()).replace(hour=rng.randint(10, 17))
            cs_rows.append([cs_id, c["id"], iso_dt(csdate), cstype, io])
            status = (3 if cstype in ("B", "C")
                      else rng.choice([2, 4]))
        elif is_udr:
            status = 3 if c["reg"] <= cutoff else 1
        else:
            status = 1
        if c["detected"] and rng.random() < ARREST_RATE:
            max_off = (min(30, (csdate.date() - c["reg"]).days - 1)
                       if cstype in ("A", "B") else 30)
            chosen = [a for a in case_acc_ids if rng.random() < 0.8] or \
                     [case_acc_ids[0]]
            for a in chosen:
                arr_id += 1
                a_date = c["reg"] + timedelta(days=rng.randint(0, max(0, max_off)))
                arr_rows.append([arr_id, c["id"],
                                 2 if rng.random() < 0.1 else 1, iso_d(a_date),
                                 STATE_ID, c["dist"], c["unit"], io,
                                 sessions_court[c["dist"]], a, 1, 0])

        # brief facts ---------------------------------------------------------
        if acc_names:
            a_txt = (f"the accused {acc_names[0]}" if len(acc_names) == 1
                     else f"the accused {acc_names[0]} and associates")
        else:
            a_txt = "unknown persons"
        brief = compose_brief(rng, sub, profile, {
            "c": comp_names[0], "v": vic_names[0] if vic_names else "the victim",
            "a": a_txt, "station": station_meta[c["unit"]][1], "mo": mo})

        court = (sessions_court[c["dist"]] if c["heinous"] or rng.random() < 0.5
                 else jmfc_court[c["dist"]])
        cm_rows.append([c["id"], c["crimeno"], c["caseno"], iso_d(c["reg"]),
                        rng.choice(reg_pool[c["unit"]]), c["unit"], c["cat"],
                        1 if c["heinous"] else 2, head, sub, status, court,
                        iso_dt(c["frm"]), iso_dt(c["to"]), iso_dt(c["info"]),
                        f"{c['lat']:.6f}", f"{c['lng']:.6f}", brief])

    # ------------------------------------------------------------- lookups
    chas = []
    seen = set()
    for sub, m in SECTION_MAP.items():
        head = SUBHEADS[sub][1]
        refs = list(m["ipc"]) + list(m["bns"]) + \
            [r for _p, a, b in m["extra"] for r in (a, b)]
        if sub == 201:
            refs += POCSO_SECTIONS
        for act, s in refs:
            if (head, act, s) not in seen:
                seen.add((head, act, s))
                chas.append([head, act, s])

    socio = []
    for code, _name, _la, _ln, is_city, _w, pop_m, urban in DISTRICTS:
        lit = round(rng.uniform(82, 92) if is_city else rng.uniform(62, 84), 1)
        dens = (rng.randint(4000, 12000) if is_city else rng.randint(150, 600))
        pci = round(rng.uniform(118, 160) if is_city else rng.uniform(70, 115), 1)
        socio.append([code, int(pop_m * 1e6), urban, lit, dens, pci])

    tables = {
        "State": (["StateID", "StateName", "NationalityID", "Active"],
                  [[STATE_ID, "Karnataka", NATIONALITY_ID, 1]]),
        "District": (["DistrictID", "DistrictName", "StateID", "Active"],
                     [[d[0], d[1], STATE_ID, 1] for d in DISTRICTS]),
        "UnitType": (["UnitTypeID", "UnitTypeName", "CityDistState", "Hierarchy",
                      "Active"], [[*u, 1] for u in UNIT_TYPES]),
        "Unit": (["UnitID", "UnitName", "TypeID", "ParentUnit", "NationalityID",
                  "StateID", "DistrictID", "Active"], unit_rows),
        "Rank": (["RankID", "RankName", "Hierarchy", "Active"],
                 [[*r, 1] for r in RANKS]),
        "Designation": (["DesignationID", "DesignationName", "Active", "SortOrder"],
                        [[d[0], d[1], d[2], d[3]] for d in DESIGNATIONS]),
        "Employee": (["EmployeeID", "DistrictID", "UnitID", "RankID",
                      "DesignationID", "KGID", "FirstName", "EmployeeDOB",
                      "GenderID", "BloodGroupID", "PhysicallyChallenged",
                      "AppointmentDate"], emp_rows),
        "CaseCategory": (["CaseCategoryID", "LookupValue"],
                         [list(x) for x in CASE_CATEGORIES]),
        "GravityOffence": (["GravityOffenceID", "LookupValue"],
                           [list(x) for x in GRAVITY]),
        "CaseStatusMaster": (["CaseStatusID", "CaseStatusName"],
                             [list(x) for x in CASE_STATUSES]),
        "CasteMaster": (["caste_master_id", "caste_master_name"],
                        [list(x) for x in CASTES]),
        "ReligionMaster": (["ReligionID", "ReligionName"],
                           [list(x) for x in RELIGIONS]),
        "OccupationMaster": (["OccupationID", "OccupationName"],
                             [list(x) for x in OCCUPATIONS]),
        "Court": (["CourtID", "CourtName", "DistrictID", "StateID", "Active"],
                  court_rows),
        "Act": (["ActCode", "ActDescription", "ShortName", "Active"],
                [[a, d, s, 1] for a, d, s in ACTS]),
        "Section": (["ActCode", "SectionCode", "SectionDescription", "Active"],
                    [[a, s, d, 1] for (a, s), d in SECTION_DESC.items()]),
        "CrimeHead": (["CrimeHeadID", "CrimeGroupName", "Active"],
                      [[i, n, 1] for i, n in CRIME_HEADS]),
        "CrimeSubHead": (["CrimeSubHeadID", "CrimeHeadID", "CrimeHeadName",
                          "SeqID"],
                         [[s, SUBHEADS[s][1], SUBHEADS[s][0], s % 100]
                          for s in SUB_IDS]),
        "CrimeHeadActSection": (["CrimeHeadID", "ActCode", "SectionCode"], chas),
        "CaseMaster": (["CaseMasterID", "CrimeNo", "CaseNo",
                        "CrimeRegisteredDate", "PolicePersonID",
                        "PoliceStationID", "CaseCategoryID", "GravityOffenceID",
                        "CrimeMajorHeadID", "CrimeMinorHeadID", "CaseStatusID",
                        "CourtID", "IncidentFromDate", "IncidentToDate",
                        "InfoReceivedPSDate", "latitude", "longitude",
                        "BriefFacts"], cm_rows),
        "ComplainantDetails": (["ComplainantID", "CaseMasterID",
                                "ComplainantName", "AgeYear", "OccupationID",
                                "ReligionID", "CasteID", "GenderID"], comp_rows),
        "Victim": (["VictimMasterID", "CaseMasterID", "VictimName", "AgeYear",
                    "GenderID", "VictimPolice"], vic_rows),
        "Accused": (["AccusedMasterID", "CaseMasterID", "AccusedName", "AgeYear",
                     "GenderID", "PersonID"], acc_rows),
        "ActSectionAssociation": (["CaseMasterID", "ActID", "SectionID",
                                   "ActOrderID", "SectionOrderID"], asa_rows),
        "ArrestSurrender": (["ArrestSurrenderID", "CaseMasterID",
                             "ArrestSurrenderTypeID", "ArrestSurrenderDate",
                             "ArrestSurrenderStateId", "ArrestSurrenderDistrictId",
                             "PoliceStationID", "IOID", "CourtID",
                             "AccusedMasterID", "IsAccused",
                             "IsComplainantAccused"], arr_rows),
        "ChargesheetDetails": (["CSID", "CaseMasterID", "csdate", "cstype",
                                "PolicePersonID"], cs_rows),
        "SocioEconomic": (["DistrictID", "Population", "UrbanPct", "LiteracyPct",
                           "DensityPerKm2", "PerCapitaIncomeIdx"], socio),
        "_ground_truth_offenders": (["TrueOffenderID", "AccusedMasterID",
                                     "CaseMasterID", "AccusedName", "GenderID",
                                     "AgeYear", "DistrictID", "CanonicalName",
                                     "MOSubHeadID", "CommunityID"], gt_rows),
    }
    for name, (header, rows) in tables.items():
        with open(os.path.join(OUT_DIR, f"{name}.csv"), "w", newline="",
                  encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)

    blr = sum(1 for c in cases if c["dist"] == 101) / len(cases)
    n_cs = len(cs_rows)
    mix = {t: sum(1 for r in cs_rows if r[3] == t) for t in "ABC"}
    print(f"[generate] Bengaluru City share {blr:.1%} | chargesheets "
          f"A {mix['A'] / n_cs:.0%} / B {mix['B'] / n_cs:.0%} / C {mix['C'] / n_cs:.0%} "
          f"| arrests on {len({r[1] for r in arr_rows})} cases "
          f"({len({r[1] for r in arr_rows}) / max(1, sum(1 for c in cases if c['detected'])):.0%} of detected)")
    print(f"[generate] wrote {len(tables)} CSVs in {time.time() - t0:.1f}s; "
          f"running validators...")

    fails, counts = run_validators(OUT_DIR)
    print(f"\n{'Table':<28}{'Rows':>10}")
    print("-" * 38)
    for name in tables:
        print(f"{name:<28}{counts.get(name, 0):>10,}")
    print("-" * 38)
    if fails:
        print(f"\nVALIDATION FAILED ({len(fails)} issue(s)):")
        for m in fails:
            print(f"  FAIL: {m}")
        sys.exit(1)
    print(f"\nALL VALIDATORS PASSED ({len(counts)} tables, "
          f"{sum(counts.values()):,} total rows, {time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
