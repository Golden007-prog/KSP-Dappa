"""KSP DAPPA synthetic data engine - post-write validators.

Reads the CSVs actually written to pipeline/out/ (end-to-end check, not the
in-memory rows) and enforces:
  1. CrimeNo regex + uniqueness + embedded district/unit/year + CaseNo tail
  2. FK integrity across every table
  3. IncidentFrom <= IncidentTo <= Registered (and InfoReceived >= IncidentTo)
  4. lat/lng inside Karnataka bbox 11.5-18.5 N, 74-78.6 E
  5. category / status / chargesheet consistency + IPC-vs-BNS era + 1-4
     sections per case
Exits non-zero from generate.py when any check fails.
"""
import re
import pandas as pd

from dappa_seed import KA_BBOX, UDR_SUBHEADS, BNS_CUTOVER

CRIMENO_RE = re.compile(r"^[1348]\d{17}$")

TABLES = ["State", "District", "UnitType", "Unit", "Rank", "Designation",
          "Employee", "CaseCategory", "GravityOffence", "CaseStatusMaster",
          "CasteMaster", "ReligionMaster", "OccupationMaster", "Court", "Act",
          "Section", "CrimeHead", "CrimeSubHead", "CrimeHeadActSection",
          "CaseMaster", "ComplainantDetails", "Victim", "Accused",
          "ActSectionAssociation", "ArrestSurrender", "ChargesheetDetails",
          "SocioEconomic"]


def _load(out_dir, name):
    return pd.read_csv(f"{out_dir}/{name}.csv", dtype=str,
                       keep_default_na=False, na_values=[], encoding="utf-8")


def run_validators(out_dir):
    """Returns (failures:list[str], row_counts:dict[str,int])."""
    fails = []
    t = {name: _load(out_dir, name) for name in TABLES}
    gt = _load(out_dir, "_ground_truth_offenders")
    counts = {name: len(df) for name, df in t.items()}
    counts["_ground_truth_offenders"] = len(gt)

    cm = t["CaseMaster"]

    # ---- 1. CrimeNo format / uniqueness / embedded fields --------------------
    bad_fmt = cm[~cm["CrimeNo"].str.match(CRIMENO_RE)]
    if len(bad_fmt):
        fails.append(f"CrimeNo format: {len(bad_fmt)} rows fail regex "
                     f"(e.g. {bad_fmt['CrimeNo'].iloc[0]!r})")
    if cm["CrimeNo"].duplicated().any():
        fails.append(f"CrimeNo uniqueness: {int(cm['CrimeNo'].duplicated().sum())} duplicates")
    unit_dist = dict(zip(t["Unit"]["UnitID"], t["Unit"]["DistrictID"]))
    emb_dist = cm["CrimeNo"].str.slice(1, 5)
    emb_unit = cm["CrimeNo"].str.slice(5, 9)
    emb_year = cm["CrimeNo"].str.slice(9, 13)
    exp_dist = cm["PoliceStationID"].map(unit_dist).str.zfill(4)
    if (emb_dist != exp_dist).any():
        fails.append(f"CrimeNo district digits mismatch station district: "
                     f"{int((emb_dist != exp_dist).sum())} rows")
    if (emb_unit != cm["PoliceStationID"].str.zfill(4)).any():
        fails.append("CrimeNo unit digits mismatch PoliceStationID")
    reg_year = cm["CrimeRegisteredDate"].str.slice(0, 4)
    if (emb_year != reg_year).any():
        fails.append(f"CrimeNo year digits mismatch registered year: "
                     f"{int((emb_year != reg_year).sum())} rows")
    if (cm["CaseNo"] != cm["CrimeNo"].str.slice(9)).any():
        fails.append("CaseNo is not the last 9 digits of CrimeNo")
    cat_digit = {"1": "FIR", "3": "UDR", "4": "PAR", "8": "ZeroFIR"}
    cat_name = dict(zip(t["CaseCategory"]["CaseCategoryID"],
                        t["CaseCategory"]["LookupValue"]))
    mismatch = cm["CrimeNo"].str.slice(0, 1).map(cat_digit) != cm["CaseCategoryID"].map(cat_name)
    if mismatch.any():
        fails.append(f"CrimeNo category digit vs CaseCategoryID: {int(mismatch.sum())} rows")

    # ---- 2. FK integrity -----------------------------------------------------
    def fk(child, ccol, parent, pcol, allow_blank=False):
        cdf, pdf = t[child], t[parent]
        vals = cdf[ccol]
        if allow_blank:
            vals = vals[vals != ""]
        missing = ~vals.isin(set(pdf[pcol]))
        if missing.any():
            fails.append(f"FK {child}.{ccol} -> {parent}.{pcol}: "
                         f"{int(missing.sum())} orphan rows "
                         f"(e.g. {vals[missing].iloc[0]!r})")

    fk("District", "StateID", "State", "StateID")
    fk("Unit", "TypeID", "UnitType", "UnitTypeID")
    fk("Unit", "StateID", "State", "StateID")
    fk("Unit", "DistrictID", "District", "DistrictID")
    fk("Unit", "ParentUnit", "Unit", "UnitID", allow_blank=True)
    fk("Employee", "DistrictID", "District", "DistrictID")
    fk("Employee", "UnitID", "Unit", "UnitID")
    fk("Employee", "RankID", "Rank", "RankID")
    fk("Employee", "DesignationID", "Designation", "DesignationID")
    fk("Court", "DistrictID", "District", "DistrictID")
    fk("Court", "StateID", "State", "StateID")
    fk("Section", "ActCode", "Act", "ActCode")
    fk("CrimeSubHead", "CrimeHeadID", "CrimeHead", "CrimeHeadID")
    fk("CrimeHeadActSection", "CrimeHeadID", "CrimeHead", "CrimeHeadID")
    fk("CrimeHeadActSection", "ActCode", "Act", "ActCode")
    fk("CaseMaster", "PolicePersonID", "Employee", "EmployeeID")
    fk("CaseMaster", "PoliceStationID", "Unit", "UnitID")
    fk("CaseMaster", "CaseCategoryID", "CaseCategory", "CaseCategoryID")
    fk("CaseMaster", "GravityOffenceID", "GravityOffence", "GravityOffenceID")
    fk("CaseMaster", "CrimeMajorHeadID", "CrimeHead", "CrimeHeadID")
    fk("CaseMaster", "CrimeMinorHeadID", "CrimeSubHead", "CrimeSubHeadID")
    fk("CaseMaster", "CaseStatusID", "CaseStatusMaster", "CaseStatusID")
    fk("CaseMaster", "CourtID", "Court", "CourtID")
    for child in ["ComplainantDetails", "Victim", "Accused",
                  "ActSectionAssociation", "ArrestSurrender", "ChargesheetDetails"]:
        fk(child, "CaseMasterID", "CaseMaster", "CaseMasterID")
    fk("ComplainantDetails", "OccupationID", "OccupationMaster", "OccupationID")
    fk("ComplainantDetails", "ReligionID", "ReligionMaster", "ReligionID")
    fk("ComplainantDetails", "CasteID", "CasteMaster", "caste_master_id")
    fk("ActSectionAssociation", "ActID", "Act", "ActCode")
    fk("ArrestSurrender", "ArrestSurrenderStateId", "State", "StateID")
    fk("ArrestSurrender", "ArrestSurrenderDistrictId", "District", "DistrictID")
    fk("ArrestSurrender", "PoliceStationID", "Unit", "UnitID")
    fk("ArrestSurrender", "IOID", "Employee", "EmployeeID")
    fk("ArrestSurrender", "CourtID", "Court", "CourtID")
    fk("ArrestSurrender", "AccusedMasterID", "Accused", "AccusedMasterID")
    fk("ChargesheetDetails", "PolicePersonID", "Employee", "EmployeeID")
    fk("SocioEconomic", "DistrictID", "District", "DistrictID")

    # composite: (ActID, SectionID) must exist in Section; head-map pairs too
    sec_pairs = set(zip(t["Section"]["ActCode"], t["Section"]["SectionCode"]))
    asa = t["ActSectionAssociation"]
    bad = [p for p in zip(asa["ActID"], asa["SectionID"]) if p not in sec_pairs]
    if bad:
        fails.append(f"ActSectionAssociation (ActID,SectionID) not in Section: "
                     f"{len(bad)} rows (e.g. {bad[0]})")
    chas = t["CrimeHeadActSection"]
    bad = [p for p in zip(chas["ActCode"], chas["SectionCode"]) if p not in sec_pairs]
    if bad:
        fails.append(f"CrimeHeadActSection pair not in Section: {len(bad)} rows")
    # ground truth must reference real accused rows
    if not gt["AccusedMasterID"].isin(set(t["Accused"]["AccusedMasterID"])).all():
        fails.append("_ground_truth_offenders.AccusedMasterID has orphans")

    # ---- 3. date ordering ----------------------------------------------------
    inc_from = pd.to_datetime(cm["IncidentFromDate"])
    inc_to = pd.to_datetime(cm["IncidentToDate"])
    reg = pd.to_datetime(cm["CrimeRegisteredDate"])
    info = pd.to_datetime(cm["InfoReceivedPSDate"])
    if (inc_from > inc_to).any():
        fails.append(f"IncidentFromDate > IncidentToDate: {int((inc_from > inc_to).sum())} rows")
    if (inc_to.dt.normalize() > reg).any():
        fails.append(f"IncidentToDate after CrimeRegisteredDate: "
                     f"{int((inc_to.dt.normalize() > reg).sum())} rows")
    if (info < inc_to).any():
        fails.append(f"InfoReceivedPSDate before IncidentToDate: {int((info < inc_to).sum())} rows")

    # ---- 4. bbox -------------------------------------------------------------
    lat = pd.to_numeric(cm["latitude"])
    lng = pd.to_numeric(cm["longitude"])
    out_box = ((lat < KA_BBOX[0]) | (lat > KA_BBOX[1]) |
               (lng < KA_BBOX[2]) | (lng > KA_BBOX[3]))
    if out_box.any():
        fails.append(f"lat/lng outside Karnataka bbox: {int(out_box.sum())} rows")

    # ---- 5. category / status / chargesheet consistency ----------------------
    sub_udr = cm["CrimeMinorHeadID"].astype(int).isin(UDR_SUBHEADS)
    is_udr = cm["CaseCategoryID"].map(cat_name) == "UDR"
    if (sub_udr != is_udr).any():
        fails.append(f"UDR category <-> Missing Person/Accidental Death subhead "
                     f"mismatch: {int((sub_udr != is_udr).sum())} rows")

    cs = t["ChargesheetDetails"]
    if not cs["cstype"].isin({"A", "B", "C"}).all():
        fails.append("ChargesheetDetails.cstype outside {A,B,C}")
    if cs["CaseMasterID"].duplicated().any():
        fails.append("multiple chargesheets for one case")
    cs_type = dict(zip(cs["CaseMasterID"], cs["cstype"]))
    cs_date = dict(zip(cs["CaseMasterID"], pd.to_datetime(cs["csdate"])))
    status_name = dict(zip(t["CaseStatusMaster"]["CaseStatusID"],
                           t["CaseStatusMaster"]["CaseStatusName"]))
    n_acc = t["Accused"].groupby("CaseMasterID").size().to_dict()
    arr_by_case = t["ArrestSurrender"].groupby("CaseMasterID").size().to_dict()

    bad_status = bad_cs = bad_det = bad_arr = 0
    for cid, st_id, is_u, r in zip(cm["CaseMasterID"], cm["CaseStatusID"], is_udr, reg):
        st = status_name[st_id]
        ct = cs_type.get(cid)
        na = n_acc.get(cid, 0)
        if is_u:
            if ct is not None or na > 0:  # UDR: no chargesheet, no accused
                bad_cs += 1
            if st not in ("Under Investigation", "Closed"):
                bad_status += 1
            continue
        if ct is None:
            if st != "Under Investigation":
                bad_status += 1
        elif ct == "A":
            if st not in ("Charge Sheeted", "Pending Trial"):
                bad_status += 1
            if na == 0:
                bad_det += 1
            if cs_date[cid] < r:
                bad_cs += 1
        elif ct == "B":
            if st != "Closed" or na == 0:
                bad_status += 1
        elif ct == "C":
            if st != "Closed":
                bad_status += 1
            if na > 0:  # undetected final report must have no accused
                bad_det += 1
        if arr_by_case.get(cid, 0) > 0 and na == 0:
            bad_arr += 1
    for n, msg in [(bad_status, "CaseStatus inconsistent with chargesheet state"),
                   (bad_cs, "chargesheet/UDR date-or-presence violations"),
                   (bad_det, "cstype vs accused-count violations"),
                   (bad_arr, "arrests recorded on cases without accused")]:
        if n:
            fails.append(f"{msg}: {n} rows")

    # sections per case: 1-4, era consistency
    per_case = asa.groupby("CaseMasterID").size()
    if (per_case < 1).any() or (per_case > 4).any():
        fails.append("ActSectionAssociation rows per case outside 1-4")
    if len(set(cm["CaseMasterID"]) - set(asa["CaseMasterID"])):
        fails.append("cases with zero ActSectionAssociation rows")
    era_old = dict(zip(cm["CaseMasterID"],
                       inc_from < pd.Timestamp(BNS_CUTOVER)))
    bad_era = 0
    for cid, act in zip(asa["CaseMasterID"], asa["ActID"]):
        if era_old[cid] and act in ("BNS", "BNSS"):
            bad_era += 1
        elif not era_old[cid] and act in ("IPC", "CRPC"):
            bad_era += 1
    if bad_era:
        fails.append(f"IPC/BNS era violations: {bad_era} association rows")

    arr = t["ArrestSurrender"]
    if len(arr):
        arr_date = pd.to_datetime(arr["ArrestSurrenderDate"])
        arr_reg = arr["CaseMasterID"].map(dict(zip(cm["CaseMasterID"], reg)))
        if (arr_date < arr_reg).any():
            fails.append("arrest before registration")
        acsd = arr["CaseMasterID"].map(cs_date)
        late = acsd.notna() & (arr_date > acsd)
        if late.any():
            fails.append(f"arrest after chargesheet date: {int(late.sum())} rows")

    return fails, counts
