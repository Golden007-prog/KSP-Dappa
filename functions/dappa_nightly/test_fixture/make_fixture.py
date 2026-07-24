"""Deterministic tiny fixture for the dappa_nightly LOCAL_DRYRUN test.

Writes CaseMaster.csv, AggMonthly.csv, StationRisk.csv (+ HotspotCluster.csv
to exercise the hotspot-proximity component) into this directory. 20 weeks of
history ending 2026-07-20 with a planted vehicle-theft spike at station 9001
in the final week, so the run must produce a severity-3 anomaly, a non-empty
AggMonthly delta (the stored AggMonthly snapshot excludes the last 10 days),
and station 9001 as the top risk.

Regenerate with:  python3.12 make_fixture.py   (from this directory)
"""

import csv
import os
import random
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
RNG = random.Random(2026)
DATA_END = date(2026, 7, 20)
WEEKS = 20

# (station/PoliceStationID, district, CrimeNo unit, base lat, base lng)
STATIONS = {
    "9001": ("0101", "0101", 12.9716, 77.5946),
    "9002": ("0101", "0101", 12.9352, 77.6245),
    "9003": ("0103", "0103", 12.2958, 76.6394),
}

CASE_COLS = ["CaseMasterID", "CrimeNo", "CaseNo", "CrimeRegisteredDate",
             "PoliceStationID", "CaseCategoryID", "GravityOffenceID",
             "CrimeMajorHeadID", "CrimeMinorHeadID", "CaseStatusID",
             "latitude", "longitude"]


def main():
    serials = {}
    cases = []

    def add_case(day, station, head, subhead, gravity="2"):
        district, unit, lat0, lng0 = STATIONS[station]
        key = (station, "1", day.year)
        serials[key] = serials.get(key, 0) + 1
        serial = serials[key]
        crimeno = f"1{district}{unit}{day.year:04d}{serial:05d}"
        cases.append({
            "CaseMasterID": str(10000 + len(cases) + 1),
            "CrimeNo": crimeno,
            "CaseNo": crimeno[-9:],
            "CrimeRegisteredDate": day.isoformat(),
            "PoliceStationID": station,
            "CaseCategoryID": "1",
            "GravityOffenceID": gravity,
            "CrimeMajorHeadID": head,
            "CrimeMinorHeadID": subhead,
            "CaseStatusID": "1",
            "latitude": f"{lat0 + RNG.uniform(-0.008, 0.008):.6f}",
            "longitude": f"{lng0 + RNG.uniform(-0.008, 0.008):.6f}",
        })

    for week in range(WEEKS - 1, -1, -1):  # oldest week first
        week_start = DATA_END - timedelta(days=7 * week + 6)
        def day_in_week():
            return week_start + timedelta(days=RNG.randint(0, 6))

        # 9001: vehicle theft (head 3 / sub 33), ~5 per week, MAD ~1
        for _ in range(RNG.choice([4, 5, 5, 6])):
            add_case(day_in_week(), "9001", "3", "33")
        # 9001: occasional murder (head 1 / sub 11, heinous)
        if week % 2 == 0:
            add_case(day_in_week(), "9001", "1", "11", gravity="1")
        # 9002: cyber (head 5 / sub 51), rising ~1 extra case every 4 weeks
        for _ in range(2 + (WEEKS - 1 - week) // 4):
            add_case(day_in_week(), "9002", "5", "51")
        # 9003: ordinary theft (head 3 / sub 32), flat ~4 per week
        for _ in range(RNG.choice([3, 4, 4, 5])):
            add_case(day_in_week(), "9003", "3", "32")

    # Planted spike: +15 vehicle thefts at 9001 in the final week
    final_start = DATA_END - timedelta(days=6)
    for i in range(15):
        add_case(final_start + timedelta(days=i % 7), "9001", "3", "33")

    cases.sort(key=lambda c: (c["CrimeRegisteredDate"], c["CrimeNo"]))
    with open(os.path.join(HERE, "CaseMaster.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=CASE_COLS)
        w.writeheader()
        w.writerows(cases)

    # Stored AggMonthly = snapshot that predates the last 10 days -> the
    # nightly run must report a non-empty delta.
    cutoff = (DATA_END - timedelta(days=10)).isoformat()
    agg = {}
    for c in cases:
        if c["CrimeRegisteredDate"] > cutoff:
            continue
        key = (c["CrimeRegisteredDate"][:7], c["CrimeNo"][1:5], c["PoliceStationID"],
               c["CrimeMajorHeadID"], c["CrimeMinorHeadID"])
        cnt, hein = agg.get(key, (0, 0))
        agg[key] = (cnt + 1, hein + (1 if c["GravityOffenceID"] == "1" else 0))
    with open(os.path.join(HERE, "AggMonthly.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["Ym", "DistrictID", "UnitID", "CrimeHeadID", "CrimeSubHeadID",
                    "CaseCount", "HeinousCount"])
        for key in sorted(agg):
            w.writerow(list(key) + [agg[key][0], agg[key][1]])

    # Stale StationRisk (9099 has no cases any more -> must be re-scored low)
    with open(os.path.join(HERE, "StationRisk.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["UnitID", "Horizon", "RiskScore", "DriversJson", "ComputedAt"])
        for unit, score in (("9001", 10), ("9002", 20), ("9003", 30), ("9099", 40)):
            w.writerow([unit, 30, score, '["stale driver"]', "2026-06-01 02:00:00"])

    # One active hotspot on top of station 9001
    with open(os.path.join(HERE, "HotspotCluster.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["ClusterID", "CrimeHeadID", "CentroidLat", "CentroidLng", "RadiusM",
                    "CaseCount", "HourBandStart", "HourBandEnd", "WindowStart",
                    "WindowEnd", "Intensity", "Label", "DistrictID"])
        w.writerow(["H1", "3", "12.9716", "77.5946", "1500", "40", "22", "4",
                    "2026-02-01", "2026-07-20", "80",
                    "Vehicle theft cluster - station 9001, 22:00-04:00", "0101"])

    print(f"fixture written: {len(cases)} cases, {len(agg)} stored agg rows")


if __name__ == "__main__":
    main()
