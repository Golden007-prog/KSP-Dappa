# SCHEMA_CHECKLIST — Catalyst Data Store tables (create + import in this exact order)

Every table and column of the official ER (docs/ER_TEXT_EXTRACT.txt) plus Appendix C
SocioEconomic and the derived analytics tables. Column names must be entered verbatim —
`pipeline/out/<TableName>.csv` headers match these 1:1 for console import
(Data Store → table → Import). CSVs are produced by `python3.12 pipeline/generate.py`
(ER tables) and `python3.12 pipeline/analytics.py` (derived tables).

Conventions
- **Boolean** columns are exported as `1/0` in the CSVs (map to true/false on import; if
  the importer rejects them, create the column as Int — values stay 1/0).
- `Date` = `YYYY-MM-DD`, `Datetime` = `YYYY-MM-DD HH:MM:SS`, `Ym` = `YYYY-MM`.
- ER declares `ActSectionAssociation.ActID/SectionID` as INT FKs to `Act.ActCode` /
  `Section.SectionCode`, which are VARCHAR PKs; we keep the FK real by storing the codes,
  so those two columns are Varchar here.
- `pipeline/out/_ground_truth_offenders.csv` is a private benchmarking file — **never import it**.

## 1. State
| Column | Type |
|---|---|
| StateID | Int |
| StateName | Varchar(100) |
| NationalityID | Int |
| Active | Boolean |

## 2. District
| Column | Type |
|---|---|
| DistrictID | Int |
| DistrictName | Varchar(100) |
| StateID | Int |
| Active | Boolean |

## 3. UnitType
| Column | Type |
|---|---|
| UnitTypeID | Int |
| UnitTypeName | Varchar(100) |
| CityDistState | Varchar(20) |
| Hierarchy | Int |
| Active | Boolean |

## 4. Unit
| Column | Type |
|---|---|
| UnitID | Int |
| UnitName | Varchar(150) |
| TypeID | Int |
| ParentUnit | Int |
| NationalityID | Int |
| StateID | Int |
| DistrictID | Int |
| Active | Boolean |

## 5. Rank
| Column | Type |
|---|---|
| RankID | Int |
| RankName | Varchar(100) |
| Hierarchy | Int |
| Active | Boolean |

## 6. Designation
| Column | Type |
|---|---|
| DesignationID | Int |
| DesignationName | Varchar(100) |
| Active | Boolean |
| SortOrder | Int |

## 7. Employee
| Column | Type |
|---|---|
| EmployeeID | Int |
| DistrictID | Int |
| UnitID | Int |
| RankID | Int |
| DesignationID | Int |
| KGID | Varchar(20) |
| FirstName | Varchar(60) |
| EmployeeDOB | Date |
| GenderID | Int |
| BloodGroupID | Int |
| PhysicallyChallenged | Boolean |
| AppointmentDate | Date |

## 8. CaseCategory
| Column | Type |
|---|---|
| CaseCategoryID | Int |
| LookupValue | Varchar(20) |

## 9. GravityOffence
| Column | Type |
|---|---|
| GravityOffenceID | Int |
| LookupValue | Varchar(20) |

## 10. CaseStatusMaster
| Column | Type |
|---|---|
| CaseStatusID | Int |
| CaseStatusName | Varchar(50) |

## 11. CasteMaster
| Column | Type |
|---|---|
| caste_master_id | Int |
| caste_master_name | Varchar(60) |

## 12. ReligionMaster
| Column | Type |
|---|---|
| ReligionID | Int |
| ReligionName | Varchar(40) |

## 13. OccupationMaster
| Column | Type |
|---|---|
| OccupationID | Int |
| OccupationName | Varchar(60) |

## 14. Act
| Column | Type |
|---|---|
| ActCode | Varchar(10) |
| ActDescription | Varchar(150) |
| ShortName | Varchar(30) |
| Active | Boolean |

## 15. Section
| Column | Type |
|---|---|
| ActCode | Varchar(10) |
| SectionCode | Varchar(10) |
| SectionDescription | Varchar(200) |
| Active | Boolean |

## 16. CrimeHead
| Column | Type |
|---|---|
| CrimeHeadID | Int |
| CrimeGroupName | Varchar(60) |
| Active | Boolean |

## 17. CrimeSubHead
| Column | Type |
|---|---|
| CrimeSubHeadID | Int |
| CrimeHeadID | Int |
| CrimeHeadName | Varchar(60) |
| SeqID | Int |

## 18. CrimeHeadActSection
| Column | Type |
|---|---|
| CrimeHeadID | Int |
| ActCode | Varchar(10) |
| SectionCode | Varchar(10) |

## 19. Court
| Column | Type |
|---|---|
| CourtID | Int |
| CourtName | Varchar(120) |
| DistrictID | Int |
| StateID | Int |
| Active | Boolean |

## 20. CaseMaster
| Column | Type |
|---|---|
| CaseMasterID | Int |
| CrimeNo | Varchar(18) |
| CaseNo | Varchar(9) |
| CrimeRegisteredDate | Date |
| PolicePersonID | Int |
| PoliceStationID | Int |
| CaseCategoryID | Int |
| GravityOffenceID | Int |
| CrimeMajorHeadID | Int |
| CrimeMinorHeadID | Int |
| CaseStatusID | Int |
| CourtID | Int |
| IncidentFromDate | Datetime |
| IncidentToDate | Datetime |
| InfoReceivedPSDate | Datetime |
| latitude | Double |
| longitude | Double |
| BriefFacts | Text |

## 21. ComplainantDetails
| Column | Type |
|---|---|
| ComplainantID | Int |
| CaseMasterID | Int |
| ComplainantName | Varchar(100) |
| AgeYear | Int |
| OccupationID | Int |
| ReligionID | Int |
| CasteID | Int |
| GenderID | Int |

## 22. Victim
| Column | Type |
|---|---|
| VictimMasterID | Int |
| CaseMasterID | Int |
| VictimName | Varchar(100) |
| AgeYear | Int |
| GenderID | Int |
| VictimPolice | Varchar(1) |

## 23. Accused
| Column | Type |
|---|---|
| AccusedMasterID | Int |
| CaseMasterID | Int |
| AccusedName | Varchar(100) |
| AgeYear | Int |
| GenderID | Int |
| PersonID | Varchar(5) |

## 24. ActSectionAssociation
| Column | Type |
|---|---|
| CaseMasterID | Int |
| ActID | Varchar(10) |
| SectionID | Varchar(10) |
| ActOrderID | Int |
| SectionOrderID | Int |

## 25. ArrestSurrender
| Column | Type |
|---|---|
| ArrestSurrenderID | Int |
| CaseMasterID | Int |
| ArrestSurrenderTypeID | Int |
| ArrestSurrenderDate | Date |
| ArrestSurrenderStateId | Int |
| ArrestSurrenderDistrictId | Int |
| PoliceStationID | Int |
| IOID | Int |
| CourtID | Int |
| AccusedMasterID | Int |
| IsAccused | Boolean |
| IsComplainantAccused | Boolean |

## 26. ChargesheetDetails
| Column | Type |
|---|---|
| CSID | Int |
| CaseMasterID | Int |
| csdate | Datetime |
| cstype | Varchar(1) |
| PolicePersonID | Int |

## 27. SocioEconomic (Appendix C; derived-side but static)
| Column | Type |
|---|---|
| DistrictID | Int |
| Population | Int |
| UrbanPct | Double |
| LiteracyPct | Double |
| DensityPerKm2 | Int |
| PerCapitaIncomeIdx | Double |

## 28. AggMonthly (derived — from analytics.py)
| Column | Type |
|---|---|
| Ym | Varchar(7) |
| DistrictID | Int |
| UnitID | Int |
| CrimeHeadID | Int |
| CrimeSubHeadID | Int |
| CaseCount | Int |
| HeinousCount | Int |

## 29. HotspotCluster (derived)
| Column | Type |
|---|---|
| ClusterID | Varchar(10) |  <!-- pipeline emits 'H001' -->
| CrimeHeadID | Int |
| CentroidLat | Double |
| CentroidLng | Double |
| RadiusM | Double |
| CaseCount | Int |
| HourBandStart | Int |
| HourBandEnd | Int |
| WindowStart | Date |
| WindowEnd | Date |
| Intensity | Double |
| Label | Varchar(150) |
| DistrictID | Int |

## 30. ForecastMonthly (derived)
| Column | Type |
|---|---|
| DistrictID | Int |
| CrimeHeadID | Int |
| Ym | Varchar(7) |
| Actual | Int |
| Predicted | Double |
| Lo | Double |
| Hi | Double |
| Model | Varchar(30) |

## 31. AnomalyAlert (derived)
| Column | Type |
|---|---|
| AlertID | Varchar(10) |   <!-- pipeline emits 'A0001' -->
| DistrictID | Int |
| UnitID | Int |
| CrimeHeadID | Int |
| PeriodStart | Date |
| PeriodEnd | Date |
| Observed | Int |
| Expected | Double |
| ZScore | Double |
| Severity | Int |
| Status | Varchar(20) |
| Narrative | Text |
| CreatedAt | Datetime |

## 32. NetworkEdge (derived)
| Column | Type |
|---|---|
| PersonKeyA | Varchar(30) |
| PersonKeyB | Varchar(30) |
| Weight | Int |
| CaseIDsJson | Text |
| CommunityID | Varchar(20) |

## 33. OffenderProfile (derived)
| Column | Type |
|---|---|
| PersonKey | Varchar(30) |
| CanonicalName | Varchar(100) |
| AliasesJson | Text |
| CaseCount | Int |
| DistrictsJson | Text |
| FirstSeen | Date |
| LastSeen | Date |
| MOTagsJson | Text |
| CommunityID | Varchar(20) |
| DegreeCentrality | Double |
| RiskScore | Double |

## 34. StationRisk (derived)
| Column | Type |
|---|---|
| UnitID | Int |
| Horizon | Int |
| RiskScore | Double |
| DriversJson | Text |
| ComputedAt | Datetime |
