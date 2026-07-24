"""KSP DAPPA synthetic data engine - static seed data.

All constants here mirror docs/02_CLAUDE_CODE_MASTER_PROMPT.md section 2/3 and
Appendix C. DistrictIDs are the Appendix C police-unit codes (0101..0138) held
as ints 101..138 and zero-padded to 4 digits inside CrimeNo.
"""
from datetime import date

STATE_ID = 29  # Karnataka census code
NATIONALITY_ID = 1
WINDOW_START = date(2023, 8, 1)
WINDOW_END = date(2026, 7, 31)
BNS_CUTOVER = date(2024, 7, 1)   # incidents on/after this date use BNS/BNSS
KA_BBOX = (11.5, 18.5, 74.0, 78.6)  # latmin, latmax, lngmin, lngmax

# code, name, lat, lng, is_city_commissionerate, base share weight,
# population (millions, indicative), urban %
DISTRICTS = [
    (101, "Bengaluru City",         12.972, 77.594, True,  0.300, 11.00, 100),
    (102, "Bengaluru District",     13.100, 77.400, False, 0.022,  1.10,  38),
    (103, "Mysuru City",            12.296, 76.639, True,  0.045,  1.30,  94),
    (104, "Mysuru District",        12.400, 76.500, False, 0.020,  1.80,  28),
    (105, "Mangaluru City",         12.870, 74.843, True,  0.032,  0.90,  92),
    (106, "Dakshina Kannada",       12.840, 75.250, False, 0.018,  1.20,  35),
    (107, "Hubballi-Dharwad City",  15.365, 75.124, True,  0.030,  1.10,  90),
    (108, "Dharwad District",       15.460, 75.010, False, 0.014,  0.90,  30),
    (109, "Belagavi City",          15.850, 74.500, True,  0.026,  0.80,  88),
    (110, "Belagavi District",      16.100, 74.800, False, 0.024,  3.20,  26),
    (111, "Kalaburagi",             17.329, 76.834, False, 0.023,  2.60,  33),
    (112, "Ballari",                15.139, 76.921, False, 0.021,  1.40,  37),
    (113, "Vijayapura",             16.830, 75.710, False, 0.019,  2.20,  24),
    (114, "Davanagere",             14.464, 75.921, False, 0.019,  1.60,  32),
    (115, "Shivamogga",             13.930, 75.560, False, 0.020,  1.80,  36),
    (116, "Tumakuru",               13.340, 77.101, False, 0.024,  2.70,  25),
    (117, "Udupi",                  13.340, 74.747, False, 0.014,  1.20,  29),
    (118, "Hassan",                 13.005, 76.103, False, 0.018,  1.80,  22),
    (119, "Chikkamagaluru",         13.316, 75.775, False, 0.014,  1.10,  21),
    (120, "Kodagu",                 12.420, 75.740, False, 0.008,  0.60,  15),
    (121, "Chamarajanagar",         11.926, 76.940, False, 0.013,  1.00,  18),
    (122, "Mandya",                 12.523, 76.897, False, 0.018,  1.80,  17),
    (123, "Kolar",                  13.137, 78.130, False, 0.016,  1.50,  31),
    (124, "Chikkaballapur",         13.435, 77.728, False, 0.014,  1.30,  23),
    (125, "Ramanagara",             12.720, 77.280, False, 0.014,  1.10,  25),
    (126, "Bagalkot",               16.180, 75.700, False, 0.017,  1.90,  32),
    (127, "Gadag",                  15.430, 75.630, False, 0.012,  1.10,  36),
    (128, "Haveri",                 14.795, 75.400, False, 0.014,  1.60,  22),
    (129, "Uttara Kannada",         14.800, 74.130, False, 0.014,  1.40,  29),
    (130, "Raichur",                16.207, 77.356, False, 0.018,  1.90,  25),
    (131, "Koppal",                 15.350, 76.150, False, 0.014,  1.40,  17),
    (132, "Yadgir",                 16.770, 77.140, False, 0.013,  1.20,  19),
    (133, "Bidar",                  17.913, 77.530, False, 0.017,  1.70,  26),
    (134, "Chitradurga",            14.230, 76.400, False, 0.017,  1.70,  20),
    (135, "Kodagu-Virajpet",        12.200, 75.800, False, 0.006,  0.50,  14),
    (136, "KGF",                    12.965, 78.270, False, 0.008,  0.70,  55),
    (137, "Vijayanagara",           15.270, 76.390, False, 0.014,  1.30,  28),
    (138, "Bengaluru Rural South",  12.700, 77.500, False, 0.010,  1.00,  30),
]

# Bengaluru City locality pool for realistic station names; other districts use
# compass/market/rural patterns.
BLR_LOCALITIES = ["Peenya", "Whitefield", "Upparpet", "Jayanagar", "Koramangala",
                  "Yeshwanthpur", "Banaswadi", "HSR Layout", "Indiranagar",
                  "Vijayanagar", "Basavanagudi", "Hebbal", "KR Puram",
                  "Electronic City"]
CITY_LOCALITY_SUFFIX = ["North", "South", "East", "West", "Town", "Market",
                        "Extension", "Rural", "Camp", "Gandhinagar"]
DIST_STATION_SUFFIX = ["Town", "Rural", "East", "West", "North", "South",
                       "Extension", "Market", "Taluk"]

# CrimeHead taxonomy (Appendix C ids; subheads numbered 101.. under each head)
CRIME_HEADS = [(1, "Crimes Against Body"), (2, "Crimes Against Women"),
               (3, "Property Crimes"), (4, "Economic Offences"),
               (5, "Cyber Crimes"), (6, "Public Order"),
               (7, "Narcotics"), (8, "Others")]

# id: (name, head, weight, hour_profile, monsoon_dip, festival, weekend, growth, heinous)
SUBHEADS = {
    101: ("Murder",                 1, 2.6, "evening", False, False, False, False, True),
    102: ("Attempt to Murder",      1, 1.5, "evening", False, False, False, False, True),
    103: ("Grievous Hurt",          1, 4.0, "evening", False, False, True,  False, False),
    104: ("Kidnapping",             1, 1.5, "day",     False, False, False, False, True),
    201: ("Rape",                   2, 1.5, "evening", False, False, False, False, True),
    202: ("Cruelty by Husband",     2, 2.5, "day",     False, False, False, False, False),
    203: ("Molestation",            2, 2.4, "evening", False, False, False, False, False),
    204: ("Dowry",                  2, 0.8, "day",     False, False, False, False, True),
    301: ("Dacoity",                3, 0.4, "night",   True,  True,  False, False, True),
    302: ("Robbery",                3, 1.8, "evening", True,  True,  False, False, True),
    303: ("HB Night",               3, 4.5, "night",   True,  True,  False, False, False),
    304: ("HB Day",                 3, 1.5, "business",True,  True,  False, False, False),
    305: ("Theft",                  3, 14.0,"day",     True,  True,  False, False, False),
    306: ("Vehicle Theft",          3, 12.0,"night",   True,  True,  False, False, False),
    307: ("Chain Snatching",        3, 2.2, "night",   True,  True,  False, False, False),
    401: ("Cheating",               4, 8.0, "business",False, False, False, False, False),
    402: ("Criminal Breach of Trust",4, 1.5,"business",False, False, False, False, False),
    403: ("Counterfeiting",         4, 0.4, "business",False, False, False, False, False),
    501: ("Online Fraud",           5, 8.0, "business",False, False, False, True,  False),
    502: ("Identity Theft",         5, 2.0, "business",False, False, False, True,  False),
    503: ("Social-Media Offence",   5, 1.5, "business",False, False, False, True,  False),
    601: ("Riot",                   6, 1.5, "evening", False, True,  True,  False, False),
    602: ("Unlawful Assembly",      6, 1.2, "day",     False, True,  False, False, False),
    701: ("NDPS Possession",        7, 3.5, "evening", False, False, False, False, False),
    702: ("NDPS Trafficking",       7, 1.0, "night",   False, False, False, False, True),
    801: ("Missing Person",         8, 5.0, "day",     False, False, False, False, False),
    802: ("Accidental Death",       8, 4.0, "day",     False, False, False, False, False),
}
UDR_SUBHEADS = {801, 802}

HOUR_PROFILES = {
    "night":    [3, 3, 2.5, 2, 1.5, .6, .4, .3, .3, .3, .3, .3, .3, .3, .3, .3, .4, .5, .7, 1, 1.4, 2, 3, 3],
    "business": [.1, .1, .1, .1, .1, .2, .4, .8, 1.5, 2.5, 3, 3, 2.8, 2.6, 2.8, 3, 3, 2.5, 1.8, 1, .6, .4, .2, .1],
    "evening":  [.8, .5, .4, .3, .3, .3, .4, .5, .7, .9, 1, 1, 1.1, 1.1, 1.2, 1.4, 1.8, 2.4, 2.8, 3, 3, 2.8, 2.2, 1.4],
    "day":      [.3, .2, .2, .2, .3, .5, 1, 1.6, 2, 2.2, 2.3, 2.3, 2.2, 2.1, 2.1, 2.2, 2.2, 2.1, 1.9, 1.5, 1.1, .8, .5, .4],
    "flat":     [1] * 24,
}

# Festival windows (Ugadi, Dasara, Deepavali +/- 5 days) inside Aug-2023..Jul-2026
FESTIVALS = [date(2023, 10, 24), date(2023, 11, 12),
             date(2024, 4, 9),  date(2024, 10, 12), date(2024, 11, 1),
             date(2025, 3, 30), date(2025, 10, 2),  date(2025, 10, 20),
             date(2026, 3, 19)]

MONSOON_MONTHS = {6, 7, 8, 9}
MONSOON_FACTOR = 0.78
FESTIVAL_FACTOR = 1.35
WEEKEND_FACTOR = 1.30
CYBER_YOY = 1.25
GLOBAL_YOY = 1.04

ACTS = [
    ("IPC",   "Indian Penal Code, 1860",                                    "IPC"),
    ("BNS",   "Bharatiya Nyaya Sanhita, 2023",                              "BNS"),
    ("CRPC",  "Code of Criminal Procedure, 1973",                           "CrPC"),
    ("BNSS",  "Bharatiya Nagarik Suraksha Sanhita, 2023",                   "BNSS"),
    ("ITACT", "Information Technology Act, 2000",                           "IT Act"),
    ("NDPS",  "Narcotic Drugs and Psychotropic Substances Act, 1985",       "NDPS Act"),
    ("ARMS",  "Arms Act, 1959",                                             "Arms Act"),
    ("POCSO", "Protection of Children from Sexual Offences Act, 2012",      "POCSO Act"),
]

SECTION_DESC = {
    ("IPC", "302"): "Punishment for murder",
    ("IPC", "307"): "Attempt to murder",
    ("IPC", "326"): "Voluntarily causing grievous hurt by dangerous weapons",
    ("IPC", "323"): "Punishment for voluntarily causing hurt",
    ("IPC", "363"): "Punishment for kidnapping",
    ("IPC", "376"): "Punishment for rape",
    ("IPC", "498A"): "Husband or relative of husband subjecting woman to cruelty",
    ("IPC", "354"): "Assault or criminal force to woman with intent to outrage modesty",
    ("IPC", "304B"): "Dowry death",
    ("IPC", "395"): "Punishment for dacoity",
    ("IPC", "392"): "Punishment for robbery",
    ("IPC", "397"): "Robbery or dacoity with attempt to cause death or grievous hurt",
    ("IPC", "457"): "Lurking house-trespass or house-breaking by night",
    ("IPC", "454"): "Lurking house-trespass or house-breaking to commit offence",
    ("IPC", "380"): "Theft in dwelling house",
    ("IPC", "379"): "Punishment for theft",
    ("IPC", "356"): "Assault or criminal force in attempt to commit theft",
    ("IPC", "411"): "Dishonestly receiving stolen property",
    ("IPC", "420"): "Cheating and dishonestly inducing delivery of property",
    ("IPC", "419"): "Punishment for cheating by personation",
    ("IPC", "406"): "Punishment for criminal breach of trust",
    ("IPC", "489A"): "Counterfeiting currency notes or bank notes",
    ("IPC", "507"): "Criminal intimidation by anonymous communication",
    ("IPC", "147"): "Punishment for rioting",
    ("IPC", "148"): "Rioting armed with deadly weapon",
    ("IPC", "143"): "Punishment for unlawful assembly",
    ("IPC", "34"):  "Acts done by several persons in furtherance of common intention",
    ("BNS", "103"): "Punishment for murder",
    ("BNS", "109"): "Attempt to murder",
    ("BNS", "118"): "Voluntarily causing hurt or grievous hurt by dangerous weapons",
    ("BNS", "115"): "Voluntarily causing hurt",
    ("BNS", "137"): "Kidnapping",
    ("BNS", "64"):  "Punishment for rape",
    ("BNS", "85"):  "Husband or relative of husband subjecting woman to cruelty",
    ("BNS", "74"):  "Assault or criminal force to woman with intent to outrage modesty",
    ("BNS", "80"):  "Dowry death",
    ("BNS", "310"): "Dacoity",
    ("BNS", "309"): "Robbery",
    ("BNS", "311"): "Robbery or dacoity with attempt to cause death or grievous hurt",
    ("BNS", "331"): "House-trespass or house-breaking",
    ("BNS", "305"): "Theft in a dwelling house, means of transportation or place of worship",
    ("BNS", "303"): "Theft",
    ("BNS", "304"): "Snatching",
    ("BNS", "317"): "Stolen property",
    ("BNS", "318"): "Cheating",
    ("BNS", "319"): "Cheating by personation",
    ("BNS", "316"): "Criminal breach of trust",
    ("BNS", "178"): "Counterfeiting coin, Government stamps, currency notes or bank notes",
    ("BNS", "351"): "Criminal intimidation",
    ("BNS", "191"): "Rioting",
    ("BNS", "189"): "Unlawful assembly",
    ("BNS", "190"): "Every member of unlawful assembly guilty of offence",
    ("BNS", "3(5)"): "Act done by several persons in furtherance of common intention",
    ("CRPC", "174"): "Police to enquire and report on suicide or unnatural death",
    ("BNSS", "194"): "Police to enquire and report on suicide or unnatural death",
    ("ITACT", "66C"): "Punishment for identity theft",
    ("ITACT", "66D"): "Punishment for cheating by personation using computer resource",
    ("ITACT", "67"): "Punishment for publishing or transmitting obscene material in electronic form",
    ("NDPS", "20"): "Punishment for contravention in relation to cannabis plant and cannabis",
    ("NDPS", "21"): "Punishment for contravention in relation to manufactured drugs and preparations",
    ("NDPS", "22"): "Punishment for contravention in relation to psychotropic substances",
    ("NDPS", "29"): "Punishment for abetment and criminal conspiracy",
    ("ARMS", "25"): "Punishment for possession of unlicensed arms",
    ("POCSO", "4"): "Punishment for penetrative sexual assault",
    ("POCSO", "6"): "Punishment for aggravated penetrative sexual assault",
}

# subhead -> {"ipc": [(act, sec)..], "bns": [(act, sec)..],
#             "extra": [(prob, ipc_ref, bns_ref)..]}   (era chosen by incident date)
SECTION_MAP = {
    101: {"ipc": [("IPC", "302")], "bns": [("BNS", "103")],
          "extra": [(0.35, ("IPC", "34"), ("BNS", "3(5)")),
                    (0.15, ("ARMS", "25"), ("ARMS", "25"))]},
    102: {"ipc": [("IPC", "307")], "bns": [("BNS", "109")],
          "extra": [(0.20, ("IPC", "34"), ("BNS", "3(5)")),
                    (0.15, ("ARMS", "25"), ("ARMS", "25"))]},
    103: {"ipc": [("IPC", "326")], "bns": [("BNS", "118")],
          "extra": [(0.30, ("IPC", "323"), ("BNS", "115"))]},
    104: {"ipc": [("IPC", "363")], "bns": [("BNS", "137")], "extra": []},
    201: {"ipc": [("IPC", "376")], "bns": [("BNS", "64")], "extra": []},
    202: {"ipc": [("IPC", "498A")], "bns": [("BNS", "85")],
          "extra": [(0.25, ("IPC", "323"), ("BNS", "115"))]},
    203: {"ipc": [("IPC", "354")], "bns": [("BNS", "74")], "extra": []},
    204: {"ipc": [("IPC", "304B")], "bns": [("BNS", "80")],
          "extra": [(0.50, ("IPC", "498A"), ("BNS", "85"))]},
    301: {"ipc": [("IPC", "395")], "bns": [("BNS", "310")],
          "extra": [(0.40, ("ARMS", "25"), ("ARMS", "25"))]},
    302: {"ipc": [("IPC", "392")], "bns": [("BNS", "309")],
          "extra": [(0.20, ("ARMS", "25"), ("ARMS", "25")),
                    (0.15, ("IPC", "397"), ("BNS", "311"))]},
    303: {"ipc": [("IPC", "457"), ("IPC", "380")],
          "bns": [("BNS", "331"), ("BNS", "305")], "extra": []},
    304: {"ipc": [("IPC", "454"), ("IPC", "380")],
          "bns": [("BNS", "331"), ("BNS", "305")], "extra": []},
    305: {"ipc": [("IPC", "379")], "bns": [("BNS", "303")],
          "extra": [(0.10, ("IPC", "411"), ("BNS", "317"))]},
    306: {"ipc": [("IPC", "379")], "bns": [("BNS", "303")],
          "extra": [(0.20, ("IPC", "411"), ("BNS", "317"))]},
    307: {"ipc": [("IPC", "379"), ("IPC", "356")],
          "bns": [("BNS", "304")], "extra": []},
    401: {"ipc": [("IPC", "420")], "bns": [("BNS", "318")],
          "extra": [(0.20, ("IPC", "406"), ("BNS", "316"))]},
    402: {"ipc": [("IPC", "406")], "bns": [("BNS", "316")], "extra": []},
    403: {"ipc": [("IPC", "489A")], "bns": [("BNS", "178")], "extra": []},
    501: {"ipc": [("ITACT", "66D"), ("IPC", "420")],
          "bns": [("ITACT", "66D"), ("BNS", "318")], "extra": []},
    502: {"ipc": [("ITACT", "66C"), ("IPC", "419")],
          "bns": [("ITACT", "66C"), ("BNS", "319")], "extra": []},
    503: {"ipc": [("ITACT", "67"), ("IPC", "507")],
          "bns": [("ITACT", "67"), ("BNS", "351")], "extra": []},
    601: {"ipc": [("IPC", "147"), ("IPC", "148")],
          "bns": [("BNS", "191")], "extra": []},
    602: {"ipc": [("IPC", "143")], "bns": [("BNS", "189"), ("BNS", "190")], "extra": []},
    701: {"ipc": [("NDPS", "20")], "bns": [("NDPS", "20")],
          "extra": [(0.30, ("NDPS", "22"), ("NDPS", "22"))]},
    702: {"ipc": [("NDPS", "21"), ("NDPS", "29")],
          "bns": [("NDPS", "21"), ("NDPS", "29")], "extra": []},
    801: {"ipc": [("CRPC", "174")], "bns": [("BNSS", "194")], "extra": []},
    802: {"ipc": [("CRPC", "174")], "bns": [("BNSS", "194")], "extra": []},
}
# POCSO sections swapped in for rape cases with minor victims (handled in generator)
POCSO_SECTIONS = [("POCSO", "4"), ("POCSO", "6")]

CASE_CATEGORIES = [(1, "FIR"), (3, "UDR"), (4, "PAR"), (8, "ZeroFIR")]
GRAVITY = [(1, "Heinous"), (2, "Non-Heinous")]
CASE_STATUSES = [(1, "Under Investigation"), (2, "Charge Sheeted"),
                 (3, "Closed"), (4, "Pending Trial")]
RELIGIONS = [(1, "Hindu"), (2, "Muslim"), (3, "Christian"), (4, "Jain"),
             (5, "Sikh"), (6, "Buddhist"), (7, "Others")]
CASTES = [(1, "General"), (2, "OBC"), (3, "SC"), (4, "ST"), (5, "Others")]
OCCUPATIONS = [(1, "Farmer"), (2, "Government Employee"), (3, "Private Employee"),
               (4, "Business"), (5, "Student"), (6, "Homemaker"), (7, "Driver"),
               (8, "Daily Wage Worker"), (9, "Retired"), (10, "Software Engineer"),
               (11, "Shop Owner"), (12, "Teacher"), (13, "Advocate"),
               (14, "Unemployed"), (15, "Others")]

RANKS = [(1, "Director General of Police", 1),
         (2, "Additional Director General of Police", 2),
         (3, "Inspector General of Police", 3),
         (4, "Deputy Inspector General of Police", 4),
         (5, "Superintendent of Police", 5),
         (6, "Additional Superintendent of Police", 6),
         (7, "Deputy Superintendent of Police", 7),
         (8, "Police Inspector", 8),
         (9, "Police Sub-Inspector", 9),
         (10, "Assistant Sub-Inspector", 10),
         (11, "Head Constable", 11),
         (12, "Police Constable", 12)]

DESIGNATIONS = [(1, "Director General & Inspector General of Police", 1, 1),
                (2, "Commissioner of Police", 1, 2),
                (3, "Superintendent of Police", 1, 3),
                (4, "Deputy Commissioner of Police", 1, 4),
                (5, "Circle Police Inspector", 1, 5),
                (6, "Station House Officer", 1, 6),
                (7, "Investigating Officer", 1, 7),
                (8, "Beat Constable", 1, 8),
                (9, "Station Writer", 1, 9)]

UNIT_TYPES = [(1, "State Police Headquarters", "State", 1),
              (2, "Commissionerate", "City", 2),
              (3, "District Police Office", "District", 2),
              (4, "Circle Office", "District", 3),
              (5, "Police Station", "District", 4)]

# 6 injected spatial-hour hotspots: (district, label, lat, lng, subhead, h_start, h_end)
HOTSPOTS = [
    (101, "Peenya night-burglary belt",          13.028, 77.519, 303, 22, 4),
    (101, "Whitefield chain-snatching corridor", 12.970, 77.750, 307, 21, 1),
    (101, "Majestic pickpocket zone",            12.977, 77.572, 305, 10, 20),
    (103, "Devaraja Market chain-snatching",     12.307, 76.653, 307, 20, 0),
    (107, "Old Hubballi vehicle-theft cluster",  15.350, 75.138, 306, 21, 2),
    (109, "APMC yard robbery pocket",            15.868, 74.512, 302, 20, 1),
]

# 4 emerging-trend anomalies in the final 8 weeks: (district, subhead, +pct, label)
ANOMALIES = [
    (105, 501, 180, "cyber fraud surge in Mangaluru City"),
    (103, 307, 220, "chain snatching resurgence in Mysuru City"),
    (107, 303, 160, "night burglary spike in Hubballi-Dharwad City"),
    (116, 306, 150, "vehicle theft spike in Tumakuru"),
]
FINAL8_START = date(2026, 6, 6)  # final 8 weeks of the window
