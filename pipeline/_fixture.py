#!/usr/bin/env python3.12
"""Deterministic ~1500-case fixture for developing/verifying pipeline/analytics.py.

Writes schema-correct CSVs (headers = master spec section 2 / CONTRACTS.md) into
pipeline/.fixture/out, with planted signal so every analytics step has something
real to find:
  * 24 repeat offenders (name variants, age +/-1, same gender, consistent MO
    vocabulary) -> _ground_truth_offenders.csv
  * 4 co-accused rings of 6 members each (2 rings span multiple districts)
  * a dense spatiotemporal hotspot (Peenya HB Night, 23:00-03:00) plus a
    Whitefield chain-snatching corridor
  * an emerging anomaly spike (Mangaluru City online fraud, final 3 weeks)

Run:  python3.12 pipeline/_fixture.py
"""
import csv
import random
import re
from datetime import date, datetime, timedelta
from pathlib import Path

SEED = 2026
HERE = Path(__file__).resolve().parent
OUT = HERE / ".fixture" / "out"

# (DistrictID, DistrictName, lat, lng, background weight)
DISTRICTS = [
    ("0101", "Bengaluru City", 12.972, 77.594, 0.30),
    ("0103", "Mysuru City", 12.296, 76.639, 0.10),
    ("0105", "Mangaluru City", 12.870, 74.843, 0.08),
    ("0109", "Belagavi City", 15.850, 74.500, 0.08),
    ("0111", "Kalaburagi", 17.329, 76.834, 0.07),
    ("0114", "Davanagere", 14.464, 75.921, 0.07),
    ("0116", "Tumakuru", 13.340, 77.101, 0.08),
    ("0117", "Udupi", 13.340, 74.747, 0.07),
    ("0123", "Kolar", 13.137, 78.130, 0.08),
    ("0130", "Raichur", 16.207, 77.356, 0.07),
]

STATION_NAMES = {
    "0101": ["Peenya", "Whitefield", "Jayanagar", "Koramangala", "Yeshwanthpur", "Hebbal"],
    "0103": ["Devaraja", "Lashkar", "VV Puram", "Mysuru South"],
    "0105": ["Barke", "Kadri", "Ullal", "Surathkal"],
    "0109": ["Belagavi Market", "Camp", "Tilakwadi", "Shahapur BGM"],
    "0111": ["Kalaburagi Town", "Brahmpur", "Ashok Nagar KLB", "Sedam Road"],
    "0114": ["Davanagere North", "Davanagere South", "Harihara Town", "KTJ Nagar"],
    "0116": ["Tumakuru Town", "Kyathsandra", "Tiptur Town", "Sira Town"],
    "0117": ["Udupi Town", "Malpe", "Manipal", "Kaup"],
    "0123": ["Kolar Town", "Bangarpet", "Mulbagal", "Malur"],
    "0130": ["Raichur West", "Raichur East", "Sindhanur Town", "Manvi"],
}
# hand-placed coords for the two hotspot stations; others = centroid + fixed offsets
STATION_COORD_OVERRIDE = {"Peenya": (13.030, 77.515), "Whitefield": (12.970, 77.750)}

SUBHEADS = {  # CrimeSubHeadID -> (CrimeHeadID, name)
    101: (1, "Murder"), 102: (1, "Attempt to Murder"), 103: (1, "Grievous Hurt"), 104: (1, "Kidnapping"),
    201: (2, "Rape"), 202: (2, "Cruelty by Husband"), 203: (2, "Molestation"), 204: (2, "Dowry"),
    301: (3, "Dacoity"), 302: (3, "Robbery"), 303: (3, "HB Night"), 304: (3, "HB Day"),
    305: (3, "Theft"), 306: (3, "Vehicle Theft"), 307: (3, "Chain Snatching"),
    401: (4, "Cheating"), 402: (4, "Criminal Breach of Trust"), 403: (4, "Counterfeiting"),
    501: (5, "Online Fraud"), 502: (5, "Identity Theft"), 503: (5, "Social-Media Offence"),
    601: (6, "Riot"), 602: (6, "Unlawful Assembly"),
    701: (7, "NDPS Possession"), 702: (7, "NDPS Trafficking"),
    801: (8, "Missing Person"), 802: (8, "Accidental Death"),
}
HEADS = {1: "Crimes Against Body", 2: "Crimes Against Women", 3: "Property Crimes",
         4: "Economic Offences", 5: "Cyber Crimes", 6: "Public Order", 7: "Narcotics", 8: "Others"}
HEINOUS = {101, 102, 104, 201, 301, 302}
UDR_SUBS = {801, 802}

HEAD_W = [(1, 0.12), (2, 0.10), (3, 0.34), (4, 0.12), (5, 0.12), (6, 0.06), (7, 0.06), (8, 0.08)]
SUB_W = {
    1: [(101, 0.18), (102, 0.17), (103, 0.40), (104, 0.25)],
    2: [(201, 0.18), (202, 0.34), (203, 0.30), (204, 0.18)],
    3: [(301, 0.04), (302, 0.09), (303, 0.12), (304, 0.08), (305, 0.32), (306, 0.25), (307, 0.10)],
    4: [(401, 0.62), (402, 0.28), (403, 0.10)],
    5: [(501, 0.55), (502, 0.25), (503, 0.20)],
    6: [(601, 0.45), (602, 0.55)],
    7: [(701, 0.68), (702, 0.32)],
    8: [(801, 0.55), (802, 0.45)],
}

# Sections: (ActCode, SectionCode) lists; IPC before 2024-07-01, BNS after; IT/NDPS act-specific
SEC_PRE = {
    101: [("IPC", "302")], 102: [("IPC", "307")], 103: [("IPC", "325")], 104: [("IPC", "363")],
    201: [("IPC", "376")], 202: [("IPC", "498A")], 203: [("IPC", "354")], 204: [("IPC", "304B")],
    301: [("IPC", "395")], 302: [("IPC", "392")], 303: [("IPC", "457"), ("IPC", "380")],
    304: [("IPC", "454"), ("IPC", "380")], 305: [("IPC", "379")], 306: [("IPC", "379")],
    307: [("IPC", "379"), ("IPC", "356")], 401: [("IPC", "420")], 402: [("IPC", "406")],
    403: [("IPC", "489A")], 501: [("IPC", "420"), ("IT", "66D")], 502: [("IPC", "419"), ("IT", "66C")],
    503: [("IPC", "469"), ("IT", "66D")], 601: [("IPC", "147")], 602: [("IPC", "143")],
    701: [("NDPS", "20")], 702: [("NDPS", "21")], 801: [], 802: [],
}
SEC_POST = {
    101: [("BNS", "103")], 102: [("BNS", "109")], 103: [("BNS", "117")], 104: [("BNS", "137")],
    201: [("BNS", "64")], 202: [("BNS", "85")], 203: [("BNS", "74")], 204: [("BNS", "80")],
    301: [("BNS", "310")], 302: [("BNS", "309")], 303: [("BNS", "331"), ("BNS", "305")],
    304: [("BNS", "331"), ("BNS", "303")], 305: [("BNS", "303")], 306: [("BNS", "303")],
    307: [("BNS", "303"), ("BNS", "304")], 401: [("BNS", "318")], 402: [("BNS", "316")],
    403: [("BNS", "178")], 501: [("BNS", "318"), ("IT", "66D")], 502: [("BNS", "319"), ("IT", "66C")],
    503: [("BNS", "356"), ("IT", "66D")], 601: [("BNS", "191")], 602: [("BNS", "189")],
    701: [("NDPS", "20")], 702: [("NDPS", "21")], 801: [], 802: [],
}
ACTS = [("IPC", "Indian Penal Code 1860", "IPC"), ("BNS", "Bharatiya Nyaya Sanhita 2023", "BNS"),
        ("IT", "Information Technology Act 2000", "IT Act"), ("NDPS", "NDPS Act 1985", "NDPS"),
        ("ARMS", "Arms Act 1959", "Arms"), ("POCSO", "POCSO Act 2012", "POCSO")]

FIRST_M = ["Ravi", "Manjunath", "Shivakumar", "Nagaraj", "Prakash", "Suresh", "Ramesh", "Mahesh",
           "Girish", "Harish", "Venkatesh", "Srinivas", "Anand", "Kiran", "Lokesh", "Mohan",
           "Krishna", "Raghavendra", "Santosh", "Umesh", "Vijay", "Basavaraj", "Chandra", "Dinesh",
           "Ganesh", "Puttaswamy", "Siddesh", "Yogesh", "Nataraj", "Chetan"]
FIRST_F = ["Lakshmamma", "Savitha", "Geetha", "Sunitha", "Rekha", "Manjula", "Shobha", "Padma",
           "Kavitha", "Asha", "Bhagya", "Deepa"]
LAST = ["Gowda", "Shetty", "Hegde", "Rao", "Naik", "Kumar", "Reddy", "Poojary", "Acharya",
        "Bhat", "Patil", "Desai", "Kulkarni", "Swamy", "Murthy", "Setty", "Jain", "Achar"]

WEAPONS = ["a knife", "a machete", "a country-made pistol", "an iron rod"]
VEHICLES = ["a two-wheeler without a number plate", "a stolen motorcycle", "a white autorickshaw"]
ENTRIES = ["using a gas-cutter on the shutter", "by breaking the door lock", "by scaling the compound wall"]
APPROACH = ["posing as fake police on bank verification", "through an OTP fraud call",
            "via loan-app threat messages", "offering a fake job deposit scheme"]
ITEMS = ["a gold mangalsutra", "a mobile phone", "cash of Rs 18,000", "gold ornaments", "a laptop bag"]

MONTHS = [(y, m) for y in (2023, 2024, 2025, 2026) for m in range(1, 13)
          if (y, m) >= (2023, 8) and (y, m) <= (2026, 7)]
DATA_END = date(2026, 7, 18)


def wchoice(rng, pairs):
    r = rng.random() * sum(w for _, w in pairs)
    acc = 0.0
    for v, w in pairs:
        acc += w
        if r <= acc:
            return v
    return pairs[-1][0]


def hour_for(rng, sub):
    if sub == 303:
        return rng.choice([22, 23, 23, 0, 0, 1, 1, 2, 2, 3, 4])
    if sub in (307, 302):
        return rng.choice([5, 6, 19, 20, 20, 21, 21, 22, 22, 23])
    if sub in (401, 402, 403):
        return rng.randint(10, 18)
    if sub in (501, 502, 503):
        return rng.randint(9, 21)
    if sub in (101, 102, 103):
        return rng.choice([14, 15, 18, 19, 20, 20, 21, 21, 22, 23])
    return rng.randint(6, 22)


class Fixture:
    def __init__(self):
        self.rng = random.Random(SEED)
        self.rows = {t: [] for t in [
            "State", "District", "UnitType", "Unit", "Rank", "Designation", "Employee",
            "CaseCategory", "GravityOffence", "CaseStatusMaster", "CasteMaster", "ReligionMaster",
            "OccupationMaster", "Court", "Act", "Section", "CrimeHead", "CrimeSubHead",
            "CrimeHeadActSection", "CaseMaster", "ComplainantDetails", "Victim", "Accused",
            "ActSectionAssociation", "ArrestSurrender", "ChargesheetDetails", "SocioEconomic"]}
        self.gt = []          # ground-truth rows for planted offenders
        self.serials = {}     # (unit, cat, year) -> serial
        self.ids = {"case": 100000, "acc": 300000, "vic": 400000, "comp": 500000,
                    "arr": 600000, "cs": 700000, "emp": 5000}
        self.stations = {}    # uid -> (name, dist_id, lat, lng)
        self.dist_stations = {}
        self.courts = {}
        self.emp_by_station = {}
        self.used_sections = set()
        self.crimenos = set()

    def nid(self, key):
        self.ids[key] += 1
        return self.ids[key]

    # ---------- lookups ----------
    def build_lookups(self):
        rng = self.rng
        self.rows["State"].append(["29", "Karnataka", "1", "1"])
        self.rows["UnitType"].append(["1", "State", "State", "1", "1"])
        self.rows["UnitType"].append(["2", "District", "District", "2", "1"])
        self.rows["UnitType"].append(["3", "Police Station", "City", "4", "1"])
        for r, (rid, name, h) in enumerate([(1, "DGP", 1), (2, "SP", 2), (3, "Inspector", 3),
                                            (4, "SI", 4), (5, "Constable", 5)]):
            self.rows["Rank"].append([str(rid), name, str(h), "1"])
        for did, name in [(1, "Superintendent"), (2, "Station House Officer"), (3, "Investigating Officer")]:
            self.rows["Designation"].append([str(did), name, "1", str(did)])
        for cid, name in [(1, "FIR"), (3, "UDR"), (4, "PAR"), (8, "ZeroFIR")]:
            self.rows["CaseCategory"].append([str(cid), name])
        self.rows["GravityOffence"].append(["1", "Heinous"])
        self.rows["GravityOffence"].append(["2", "Non-Heinous"])
        for sid, name in [(1, "Under Investigation"), (2, "Charge Sheeted"), (3, "Closed"), (4, "Pending Trial")]:
            self.rows["CaseStatusMaster"].append([str(sid), name])
        for i in range(1, 6):  # schema fidelity only; analytics must never read these
            self.rows["CasteMaster"].append([str(i), f"Caste Group {i}"])
            self.rows["ReligionMaster"].append([str(i), f"Religion {i}"])
        for oid, name in [(1, "Agriculture"), (2, "Business"), (3, "Salaried"), (4, "Student"), (5, "Homemaker")]:
            self.rows["OccupationMaster"].append([str(oid), name])
        for a, desc, short in ACTS:
            self.rows["Act"].append([a, desc, short, "1"])
        for hid, name in HEADS.items():
            self.rows["CrimeHead"].append([str(hid), name, "1"])
        for sub, (hid, name) in SUBHEADS.items():
            self.rows["CrimeSubHead"].append([str(sub), str(hid), name, str(sub % 100)])
        seen = set()
        for sub, pairs in SEC_PRE.items():
            hid = SUBHEADS[sub][0]
            for a, s in pairs + SEC_POST[sub]:
                if (hid, a, s) not in seen:
                    seen.add((hid, a, s))
                    self.rows["CrimeHeadActSection"].append([str(hid), a, s])

        uid = 1000
        for i, (dist, name, lat, lng, _w) in enumerate(DISTRICTS, start=1):
            self.rows["District"].append([dist, name, "29", "1"])
            hq = f"9{i:03d}"
            self.rows["Unit"].append([hq, f"{name} HQ", "2", "", "1", "29", dist, "1"])
            court_id = str(600 + i)
            self.courts[dist] = court_id
            self.rows["Court"].append([court_id, f"{name} District Court", dist, "29", "1"])
            self.dist_stations[dist] = []
            for j, sname in enumerate(STATION_NAMES[dist]):
                uid += 1
                suid = str(uid)
                if sname in STATION_COORD_OVERRIDE:
                    slat, slng = STATION_COORD_OVERRIDE[sname]
                else:
                    slat = lat + rng.uniform(-0.06, 0.06)
                    slng = lng + rng.uniform(-0.06, 0.06)
                self.rows["Unit"].append([suid, sname, "3", hq, "1", "29", dist, "1"])
                self.stations[suid] = (sname, dist, round(slat, 6), round(slng, 6))
                self.dist_stations[dist].append(suid)
                emps = []
                for k in range(3):
                    eid = str(self.nid("emp"))
                    fn = rng.choice(FIRST_M + FIRST_F)
                    self.rows["Employee"].append([
                        eid, dist, suid, str(rng.choice([3, 4, 4, 5])), "3", f"KGID{eid}", fn,
                        f"{rng.randint(1970, 1995)}-0{rng.randint(1, 9)}-15",
                        str(rng.choice([1, 1, 1, 2])), str(rng.randint(1, 8)), "0",
                        f"{rng.randint(2005, 2022)}-06-01"])
                    emps.append(eid)
                self.emp_by_station[suid] = emps

        socio = {
            "0101": (11000000, 100.0, 89.0, 11000, 1.45), "0103": (1200000, 95.0, 87.0, 4800, 1.20),
            "0105": (700000, 92.0, 94.0, 3500, 1.25), "0109": (800000, 85.0, 82.0, 2900, 1.05),
            "0111": (2600000, 33.0, 65.0, 220, 0.78), "0114": (2000000, 36.0, 76.0, 330, 0.90),
            "0116": (2800000, 28.0, 75.0, 260, 0.92), "0117": (1200000, 40.0, 92.0, 300, 1.15),
            "0123": (1600000, 32.0, 74.0, 380, 0.85), "0130": (2000000, 26.0, 60.0, 230, 0.70)}
        for dist, (pop, urb, lit, dens, inc) in socio.items():
            self.rows["SocioEconomic"].append([dist, str(pop), str(urb), str(lit), str(dens), str(inc)])

    # ---------- case factory ----------
    def brief(self, sub, vocab, vname, sname, hh):
        rng = self.rng
        w = vocab.get("weapon") or rng.choice(WEAPONS)
        veh = vocab.get("vehicle") or rng.choice(VEHICLES)
        entry = vocab.get("entry") or rng.choice(ENTRIES)
        appr = vocab.get("approach") or rng.choice(APPROACH)
        item = vocab.get("item") or rng.choice(ITEMS)
        t = f"at about {hh:02d}:00 hrs near {sname}"
        if sub in (303, 304):
            return (f"Complainant {vname} reported that unknown persons entered the premises {t} "
                    f"{entry} and committed house-breaking. The stolen property includes {item}. "
                    f"The culprits escaped on {veh}.")
        if sub == 307:
            return (f"{vname} reported that two persons on {veh} snatched {item} {t} and sped away "
                    f"towards the main road. One of them brandished {w}.")
        if sub in (301, 302):
            return (f"A group of persons armed with {w} waylaid {vname} {t} and robbed {item}. "
                    f"They escaped on {veh}.")
        if sub in (305, 306):
            return (f"{vname} reported theft of {item} {t}. Unknown persons decamped with the property "
                    f"using {veh}.")
        if sub in (501, 502, 503):
            return (f"{vname} was cheated {appr}; an amount was transferred through UPI in several "
                    f"transactions. The fraudster contacted the victim {t}.")
        if sub in (401, 402, 403):
            return (f"{vname} reported cheating by a known person {appr} involving {item} {t}.")
        if sub in (101, 102, 103):
            return (f"Following a quarrel {t}, the accused assaulted the victim {vname} with {w} "
                    f"causing injuries.")
        if sub in (201, 202, 203, 204):
            return (f"The victim reported an offence against her {t}; the matter was referred to the "
                    f"women protection cell for investigation.")
        if sub in (801, 802):
            return (f"An unnatural death / missing person report was registered {t} on the statement "
                    f"of {vname}. Inquiry under way.")
        return f"Case registered on the report of {vname} {t}. Investigation is in progress."

    def add_case(self, dist, suid, sub, when, lat, lng, accused_specs, vocab=None,
                 arrest_bias=0.55):
        rng = self.rng
        vocab = vocab or {}
        head = SUBHEADS[sub][0]
        cat = 3 if sub in UDR_SUBS else 1
        gravity = 1 if sub in HEINOUS else 2
        cid = self.nid("case")
        year = when.year
        key = (suid, cat, year)
        self.serials[key] = self.serials.get(key, 0) + 1
        serial = self.serials[key]
        crime_no = f"{cat}{dist}{suid}{year}{serial:05d}"
        assert len(crime_no) == 18 and crime_no not in self.crimenos
        self.crimenos.add(crime_no)
        case_no = crime_no[-9:]

        inc_from = when
        inc_to = inc_from + timedelta(hours=rng.randint(0, 4))
        reg = min(inc_from.date() + timedelta(days=rng.choice([0, 0, 0, 1, 1, 2, 3])),
                  date(2026, 7, 20))
        info = datetime(reg.year, reg.month, reg.day, rng.randint(8, 20), rng.choice([0, 15, 30, 45]))

        sname = self.stations[suid][0]
        vgender = 2 if head == 2 else rng.choice([1, 1, 2])
        vfirst = rng.choice(FIRST_F if vgender == 2 else FIRST_M)
        vname = f"{vfirst} {rng.choice(LAST)}"
        facts = self.brief(sub, vocab, vname, sname, inc_from.hour)

        # complainant (religion/caste populated for schema fidelity only)
        self.rows["ComplainantDetails"].append([
            str(self.nid("comp")), str(cid), vname, str(rng.randint(20, 65)),
            str(rng.randint(1, 5)), str(rng.randint(1, 5)), str(rng.randint(1, 5)), str(vgender)])
        # victims
        for _ in range(1 + (1 if rng.random() < 0.25 else 0)):
            self.rows["Victim"].append([
                str(self.nid("vic")), str(cid), vname, str(max(8, min(80, int(rng.gauss(35, 12))))),
                str(vgender), "0"])
            vgender = rng.choice([1, 2])
            vname = f"{rng.choice(FIRST_F if vgender == 2 else FIRST_M)} {rng.choice(LAST)}"

        acc_ids = []
        for n, (aname, aage, agender, true_id) in enumerate(accused_specs, start=1):
            aid = self.nid("acc")
            acc_ids.append(aid)
            self.rows["Accused"].append([str(aid), str(cid), aname, str(aage), str(agender), f"A{n}"])
            if true_id:
                self.gt.append([true_id, str(aid), str(cid), aname, str(agender), str(aage), dist])

        secs = (SEC_PRE if inc_from.date() < date(2024, 7, 1) else SEC_POST)[sub]
        for order, (a, s) in enumerate(secs, start=1):
            self.used_sections.add((a, s))
            self.rows["ActSectionAssociation"].append([str(cid), a, s, str(order), str(order)])

        io = rng.choice(self.emp_by_station[suid])
        arrested_within7 = False
        any_arrest = False
        if acc_ids and rng.random() < arrest_bias:
            for aid in acc_ids:
                if rng.random() < 0.8:
                    gap = rng.choice([1, 2, 3, 4, 5, 6, 9, 12, 15, 20])
                    adate = reg + timedelta(days=gap)
                    if adate <= date(2026, 7, 22):
                        any_arrest = True
                        if gap <= 7:
                            arrested_within7 = True
                        self.rows["ArrestSurrender"].append([
                            str(self.nid("arr")), str(cid), "1", adate.isoformat(), "29", dist,
                            suid, io, self.courts[dist], str(aid), "1", "0"])
        cstype = ""
        status = 1
        if any_arrest and rng.random() < 0.75:
            csdate = reg + timedelta(days=rng.randint(30, 120))
            if csdate <= date(2026, 7, 22):
                if rng.random() < 0.08:
                    cstype = "B"
                else:
                    p_a = 0.30 + (0.30 if arrested_within7 else 0.0) + (0.20 if gravity == 1 else 0.0) \
                          + (0.10 if len(acc_ids) >= 2 else 0.0)
                    cstype = "A" if rng.random() < p_a else "C"
                self.rows["ChargesheetDetails"].append(
                    [str(self.nid("cs")), str(cid), csdate.isoformat(), cstype, io])
                status = 3 if cstype == "C" else rng.choice([2, 2, 4])
        self.rows["CaseMaster"].append([
            str(cid), crime_no, case_no, reg.isoformat(), io, suid, str(cat), str(gravity),
            str(head), str(sub), str(status), self.courts[dist],
            inc_from.strftime("%Y-%m-%d %H:%M:%S"), inc_to.strftime("%Y-%m-%d %H:%M:%S"),
            info.strftime("%Y-%m-%d %H:%M:%S"), f"{lat:.6f}", f"{lng:.6f}", facts])
        return cid

    # ---------- helpers ----------
    def rand_point(self, suid, sigma=0.02):
        _, _, lat, lng = self.stations[suid]
        return lat + self.rng.gauss(0, sigma), lng + self.rng.gauss(0, sigma)

    def rand_when(self, sub, months=MONTHS):
        rng = self.rng
        weights = [(i, (1 + 0.012 * MONTHS.index(m)) * (1.15 if m[1] in (10, 11) else 1.0)
                    * (0.93 if m[1] in (6, 7) else 1.0)) for i, m in enumerate(months)]
        y, m = months[wchoice(rng, weights)]
        day = rng.randint(1, 18 if (y, m) == (2026, 7) else 28)
        return datetime(y, m, day, hour_for(rng, sub), rng.choice([0, 10, 20, 30, 40, 50]))

    def background_accused(self, dist, reserved):
        rng = self.rng
        n = wchoice(rng, [(0, 0.45), (1, 0.30), (2, 0.17), (3, 0.08)])
        specs = []
        for _ in range(n):
            g = rng.choice([1, 1, 1, 1, 2])
            for _try in range(4):
                first = rng.choice(FIRST_M if g == 1 else FIRST_F)
                last = rng.choice(LAST)
                if (dist, last) not in reserved:
                    break
            specs.append((f"{first} {last}", rng.randint(18, 60), g, None))
        return specs

    # ---------- planted signal ----------
    def build(self):
        rng = self.rng
        self.build_lookups()

        # planted repeat offenders: unique first names, surname round-robin; offenders that
        # share a surname get age bases >= 10 apart (keeps identity-resolution precision honest)
        rings = [
            {"sub": 301, "districts": ["0109", "0130", "0111"]},
            {"sub": 306, "districts": ["0101", "0116"]},
            {"sub": 501, "districts": ["0105"]},
            {"sub": 307, "districts": ["0103", "0101"]},
        ]
        offenders = []
        reserved = set()
        for i in range(24):
            ring = rings[i // 6]
            vocab = {301: {"weapon": "a machete", "vehicle": "a stolen motorcycle"},
                     306: {"vehicle": "a two-wheeler without a number plate", "item": "a mobile phone"},
                     501: {"approach": "through an OTP fraud call"},
                     307: {"vehicle": "a two-wheeler without a number plate", "item": "a gold mangalsutra"}}[ring["sub"]]
            off = {"tid": f"GT{i+1:02d}", "first": FIRST_M[i], "last": LAST[i % 18],
                   "age": 22 + (i * 2 % 26), "gender": 1, "ring": i // 6,
                   "districts": ring["districts"], "sub": ring["sub"], "vocab": vocab,
                   "seen_dists": set()}
            offenders.append(off)
            for d in ring["districts"]:
                reserved.add((d, off["last"]))

        def variant(off):
            # first record in a new district uses the exact canonical name (cross-district anchor)
            first, last = off["first"], off["last"]
            r = rng.random()
            if r < 0.40:
                return f"{first} {last}"
            if r < 0.60:
                return f"{first} {last} {rng.choice('BSKMN')}"
            if r < 0.80:
                return f"{first[0]} {last}"
            return f"{first} {last[0]}"

        def spec_for(off, dist):
            if dist not in off["seen_dists"]:
                off["seen_dists"].add(dist)
                name = f"{off['first']} {off['last']}"
            else:
                name = variant(off)
            return (name, off["age"] + rng.choice([-1, 0, 0, 1]), off["gender"], off["tid"])

        # 1) background cases
        dist_w = [(d[0], d[4]) for d in DISTRICTS]
        for _ in range(1218):
            dist = wchoice(rng, dist_w)
            suid = rng.choice(self.dist_stations[dist])
            head = wchoice(rng, HEAD_W)
            sub = wchoice(rng, SUB_W[head])
            when = self.rand_when(sub)
            lat, lng = self.rand_point(suid)
            self.add_case(dist, suid, sub, when, lat, lng, self.background_accused(dist, reserved))

        # 2) Peenya HB Night hotspot (trailing 6 months, 23:00-03:00, ~450 m radius)
        peenya = next(u for u, s in self.stations.items() if s[0] == "Peenya")
        for _ in range(70):
            m = rng.choice([(2026, 2), (2026, 3), (2026, 4), (2026, 5), (2026, 6), (2026, 7)])
            day = rng.randint(1, 18 if m == (2026, 7) else 28)
            hh = rng.choice([23, 0, 1, 2, 3])
            when = datetime(m[0], m[1], day, hh, rng.randint(0, 59))
            lat = 13.030 + rng.uniform(-0.004, 0.004)
            lng = 77.515 + rng.uniform(-0.004, 0.004)
            specs = [] if rng.random() < 0.8 else self.background_accused("0101", reserved)
            self.add_case("0101", peenya, 303, when, lat, lng, specs,
                          vocab={"entry": "using a gas-cutter on the shutter"})

        # 3) Whitefield chain-snatching corridor
        whitefield = next(u for u, s in self.stations.items() if s[0] == "Whitefield")
        for _ in range(40):
            m = rng.choice([(2026, 3), (2026, 4), (2026, 5), (2026, 6), (2026, 7)])
            day = rng.randint(1, 18 if m == (2026, 7) else 28)
            when = datetime(m[0], m[1], day, rng.choice([20, 21, 22, 23]), rng.randint(0, 59))
            lat = 12.970 + rng.uniform(-0.005, 0.005)
            lng = 77.750 + rng.uniform(-0.005, 0.005)
            self.add_case("0101", whitefield, 307, when, lat, lng, [],
                          vocab={"item": "a gold mangalsutra"})

        # 4) Mangaluru City online-fraud: steady baseline then a 3-week spike (anomaly signal)
        for wk in range(16):  # baseline 2/week from 2026-02-02
            monday = date(2026, 2, 2) + timedelta(weeks=wk)
            for _ in range(2):
                d = monday + timedelta(days=rng.randint(0, 6))
                when = datetime(d.year, d.month, d.day, rng.randint(9, 20), rng.randint(0, 59))
                suid = rng.choice(self.dist_stations["0105"])
                lat, lng = self.rand_point(suid)
                self.add_case("0105", suid, 501, when, lat, lng, [])
        for monday in (date(2026, 6, 29), date(2026, 7, 6), date(2026, 7, 13)):
            for _ in range(12):
                d = monday + timedelta(days=rng.randint(0, 5))
                when = datetime(d.year, d.month, d.day, rng.randint(9, 20), rng.randint(0, 59))
                suid = rng.choice(self.dist_stations["0105"])
                lat, lng = self.rand_point(suid)
                self.add_case("0105", suid, 501, when, lat, lng, [])

        # 5) ring cases: 8 per ring, 2-4 co-accused members each
        ring_months = [m for m in MONTHS if m >= (2025, 2)]
        for ri, ring in enumerate(rings):
            members = offenders[ri * 6:(ri + 1) * 6]
            for _ in range(8):
                dist = rng.choice(ring["districts"])
                suid = rng.choice(self.dist_stations[dist])
                when = self.rand_when(ring["sub"], ring_months)
                lat, lng = self.rand_point(suid)
                chosen = rng.sample(members, rng.choice([2, 3, 3, 4]))
                specs = [spec_for(o, dist) for o in chosen]
                self.add_case(dist, suid, ring["sub"], when, lat, lng, specs,
                              vocab=members[0]["vocab"], arrest_bias=0.45)

        # 6) solo repeat-offender cases
        for off in offenders:
            for _ in range(rng.choice([2, 3, 3, 4])):
                dist = rng.choice(off["districts"])
                suid = rng.choice(self.dist_stations[dist])
                when = self.rand_when(off["sub"])
                lat, lng = self.rand_point(suid)
                self.add_case(dist, suid, off["sub"], when, lat, lng, [spec_for(off, dist)],
                              vocab=off["vocab"], arrest_bias=0.6)

    # ---------- output ----------
    HEADERS = {
        "State": ["StateID", "StateName", "NationalityID", "Active"],
        "District": ["DistrictID", "DistrictName", "StateID", "Active"],
        "UnitType": ["UnitTypeID", "UnitTypeName", "CityDistState", "Hierarchy", "Active"],
        "Unit": ["UnitID", "UnitName", "TypeID", "ParentUnit", "NationalityID", "StateID", "DistrictID", "Active"],
        "Rank": ["RankID", "RankName", "Hierarchy", "Active"],
        "Designation": ["DesignationID", "DesignationName", "Active", "SortOrder"],
        "Employee": ["EmployeeID", "DistrictID", "UnitID", "RankID", "DesignationID", "KGID", "FirstName",
                     "EmployeeDOB", "GenderID", "BloodGroupID", "PhysicallyChallenged", "AppointmentDate"],
        "CaseCategory": ["CaseCategoryID", "LookupValue"],
        "GravityOffence": ["GravityOffenceID", "LookupValue"],
        "CaseStatusMaster": ["CaseStatusID", "CaseStatusName"],
        "CasteMaster": ["caste_master_id", "caste_master_name"],
        "ReligionMaster": ["ReligionID", "ReligionName"],
        "OccupationMaster": ["OccupationID", "OccupationName"],
        "Court": ["CourtID", "CourtName", "DistrictID", "StateID", "Active"],
        "Act": ["ActCode", "ActDescription", "ShortName", "Active"],
        "Section": ["ActCode", "SectionCode", "SectionDescription", "Active"],
        "CrimeHead": ["CrimeHeadID", "CrimeGroupName", "Active"],
        "CrimeSubHead": ["CrimeSubHeadID", "CrimeHeadID", "CrimeHeadName", "SeqID"],
        "CrimeHeadActSection": ["CrimeHeadID", "ActCode", "SectionCode"],
        "CaseMaster": ["CaseMasterID", "CrimeNo", "CaseNo", "CrimeRegisteredDate", "PolicePersonID",
                       "PoliceStationID", "CaseCategoryID", "GravityOffenceID", "CrimeMajorHeadID",
                       "CrimeMinorHeadID", "CaseStatusID", "CourtID", "IncidentFromDate", "IncidentToDate",
                       "InfoReceivedPSDate", "latitude", "longitude", "BriefFacts"],
        "ComplainantDetails": ["ComplainantID", "CaseMasterID", "ComplainantName", "AgeYear",
                               "OccupationID", "ReligionID", "CasteID", "GenderID"],
        "Victim": ["VictimMasterID", "CaseMasterID", "VictimName", "AgeYear", "GenderID", "VictimPolice"],
        "Accused": ["AccusedMasterID", "CaseMasterID", "AccusedName", "AgeYear", "GenderID", "PersonID"],
        "ActSectionAssociation": ["CaseMasterID", "ActID", "SectionID", "ActOrderID", "SectionOrderID"],
        "ArrestSurrender": ["ArrestSurrenderID", "CaseMasterID", "ArrestSurrenderTypeID",
                            "ArrestSurrenderDate", "ArrestSurrenderStateId", "ArrestSurrenderDistrictId",
                            "PoliceStationID", "IOID", "CourtID", "AccusedMasterID", "IsAccused",
                            "IsComplainantAccused"],
        "ChargesheetDetails": ["CSID", "CaseMasterID", "csdate", "cstype", "PolicePersonID"],
        "SocioEconomic": ["DistrictID", "Population", "UrbanPct", "LiteracyPct", "DensityPerKm2",
                          "PerCapitaIncomeIdx"],
    }

    def write(self):
        OUT.mkdir(parents=True, exist_ok=True)
        for a, s in sorted(self.used_sections):
            self.rows["Section"].append([a, s, f"Section {s} of {a}", "1"])
        for table, header in self.HEADERS.items():
            with open(OUT / f"{table}.csv", "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                w.writerow(header)
                w.writerows(self.rows[table])
        with open(OUT / "_ground_truth_offenders.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["TrueOffenderID", "AccusedMasterID", "CaseMasterID", "AccusedName",
                        "GenderID", "AgeYear", "DistrictID"])
            w.writerows(self.gt)

    def validate(self):
        assert len(self.crimenos) == len(self.rows["CaseMaster"])
        pat = re.compile(r"^[1348]\d{17}$")
        for r in self.rows["CaseMaster"]:
            assert pat.match(r[1]), r[1]
            assert 11.5 <= float(r[15]) <= 18.5 and 74.0 <= float(r[16]) <= 78.6
            assert r[12] <= r[13]  # IncidentFrom <= IncidentTo (ISO strings sort correctly)


def main():
    fx = Fixture()
    fx.build()
    fx.validate()
    fx.write()
    print(f"fixture written to {OUT}")
    for t in ["CaseMaster", "Accused", "Victim", "ArrestSurrender", "ChargesheetDetails",
              "ActSectionAssociation", "Unit", "Employee"]:
        print(f"  {t}: {len(fx.rows[t])} rows")
    n_off = len({g[0] for g in fx.gt})
    print(f"  _ground_truth_offenders: {len(fx.gt)} accused rows across {n_off} planted offenders")


if __name__ == "__main__":
    main()
