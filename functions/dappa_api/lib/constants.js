'use strict';
// Shared vocabulary pinned by master spec Appendix C + §3.
// SubHead IDs follow the "head*100 + seq" rule (101,102,... under each head).

const DISTRICTS = [
  { id: '0101', name: 'Bengaluru City', lat: 12.972, lng: 77.594 },
  { id: '0102', name: 'Bengaluru District', lat: 13.1, lng: 77.4 },
  { id: '0103', name: 'Mysuru City', lat: 12.296, lng: 76.639 },
  { id: '0104', name: 'Mysuru District', lat: 12.4, lng: 76.5 },
  { id: '0105', name: 'Mangaluru City', lat: 12.87, lng: 74.843 },
  { id: '0106', name: 'Dakshina Kannada', lat: 12.84, lng: 75.25 },
  { id: '0107', name: 'Hubballi-Dharwad City', lat: 15.365, lng: 75.124 },
  { id: '0108', name: 'Dharwad District', lat: 15.46, lng: 75.01 },
  { id: '0109', name: 'Belagavi City', lat: 15.85, lng: 74.5 },
  { id: '0110', name: 'Belagavi District', lat: 16.1, lng: 74.8 },
  { id: '0111', name: 'Kalaburagi', lat: 17.329, lng: 76.834 },
  { id: '0112', name: 'Ballari', lat: 15.139, lng: 76.921 },
  { id: '0113', name: 'Vijayapura', lat: 16.83, lng: 75.71 },
  { id: '0114', name: 'Davanagere', lat: 14.464, lng: 75.921 },
  { id: '0115', name: 'Shivamogga', lat: 13.93, lng: 75.56 },
  { id: '0116', name: 'Tumakuru', lat: 13.34, lng: 77.101 },
  { id: '0117', name: 'Udupi', lat: 13.34, lng: 74.747 },
  { id: '0118', name: 'Hassan', lat: 13.005, lng: 76.103 },
  { id: '0119', name: 'Chikkamagaluru', lat: 13.316, lng: 75.775 },
  { id: '0120', name: 'Kodagu', lat: 12.42, lng: 75.74 },
  { id: '0121', name: 'Chamarajanagar', lat: 11.926, lng: 76.94 },
  { id: '0122', name: 'Mandya', lat: 12.523, lng: 76.897 },
  { id: '0123', name: 'Kolar', lat: 13.137, lng: 78.13 },
  { id: '0124', name: 'Chikkaballapur', lat: 13.435, lng: 77.728 },
  { id: '0125', name: 'Ramanagara', lat: 12.72, lng: 77.28 },
  { id: '0126', name: 'Bagalkot', lat: 16.18, lng: 75.7 },
  { id: '0127', name: 'Gadag', lat: 15.43, lng: 75.63 },
  { id: '0128', name: 'Haveri', lat: 14.795, lng: 75.4 },
  { id: '0129', name: 'Uttara Kannada', lat: 14.8, lng: 74.13 },
  { id: '0130', name: 'Raichur', lat: 16.207, lng: 77.356 },
  { id: '0131', name: 'Koppal', lat: 15.35, lng: 76.15 },
  { id: '0132', name: 'Yadgir', lat: 16.77, lng: 77.14 },
  { id: '0133', name: 'Bidar', lat: 17.913, lng: 77.53 },
  { id: '0134', name: 'Chitradurga', lat: 14.23, lng: 76.4 },
  { id: '0135', name: 'Kodagu-Virajpet', lat: 12.2, lng: 75.8 },
  { id: '0136', name: 'KGF', lat: 12.965, lng: 78.27 },
  { id: '0137', name: 'Vijayanagara', lat: 15.27, lng: 76.39 },
  { id: '0138', name: 'Bengaluru Rural South', lat: 12.7, lng: 77.5 }
];

const CRIME_HEADS = [
  { id: 1, name: 'Crimes Against Body' },
  { id: 2, name: 'Crimes Against Women' },
  { id: 3, name: 'Property Crimes' },
  { id: 4, name: 'Economic Offences' },
  { id: 5, name: 'Cyber Crimes' },
  { id: 6, name: 'Public Order' },
  { id: 7, name: 'Narcotics' },
  { id: 8, name: 'Others' }
];

const CRIME_SUBHEADS = [
  { id: 101, headId: 1, name: 'Murder' },
  { id: 102, headId: 1, name: 'Attempt to Murder' },
  { id: 103, headId: 1, name: 'Grievous Hurt' },
  { id: 104, headId: 1, name: 'Kidnapping' },
  { id: 201, headId: 2, name: 'Rape' },
  { id: 202, headId: 2, name: 'Cruelty by Husband' },
  { id: 203, headId: 2, name: 'Molestation' },
  { id: 204, headId: 2, name: 'Dowry' },
  { id: 301, headId: 3, name: 'Dacoity' },
  { id: 302, headId: 3, name: 'Robbery' },
  { id: 303, headId: 3, name: 'HB Night' },
  { id: 304, headId: 3, name: 'HB Day' },
  { id: 305, headId: 3, name: 'Theft' },
  { id: 306, headId: 3, name: 'Vehicle Theft' },
  { id: 307, headId: 3, name: 'Chain Snatching' },
  { id: 401, headId: 4, name: 'Cheating' },
  { id: 402, headId: 4, name: 'Criminal Breach of Trust' },
  { id: 403, headId: 4, name: 'Counterfeiting' },
  { id: 501, headId: 5, name: 'Online Fraud' },
  { id: 502, headId: 5, name: 'Identity Theft' },
  { id: 503, headId: 5, name: 'Social-Media Offence' },
  { id: 601, headId: 6, name: 'Riot' },
  { id: 602, headId: 6, name: 'Unlawful Assembly' },
  { id: 701, headId: 7, name: 'NDPS Possession' },
  { id: 702, headId: 7, name: 'NDPS Trafficking' },
  { id: 801, headId: 8, name: 'Missing Person' },
  { id: 802, headId: 8, name: 'Accidental Death' }
];

const CASE_CATEGORIES = [
  { id: 1, name: 'FIR' },
  { id: 2, name: 'UDR' },
  { id: 3, name: 'PAR' },
  { id: 4, name: 'ZeroFIR' }
];

const CASE_STATUSES = [
  { id: 1, name: 'Under Investigation' },
  { id: 2, name: 'Charge Sheeted' },
  { id: 3, name: 'Closed' },
  { id: 4, name: 'Pending Trial' }
];

const GRAVITIES = [
  { id: 1, name: 'Heinous' },
  { id: 2, name: 'Non-Heinous' }
];

const districtById = new Map(DISTRICTS.map((d) => [d.id, d]));
const headById = new Map(CRIME_HEADS.map((h) => [h.id, h]));
const subHeadById = new Map(CRIME_SUBHEADS.map((s) => [s.id, s]));

// Expected full-load row counts per Data Store table (pipeline output sizes).
// healthz reports actual/expected as dataCompleteness so a partially-loaded
// table is visible as a percentage instead of silently under-reporting.
const EXPECTED_ROW_COUNTS = {
  CaseMaster: 45000,
  AggMonthly: 34021,
  Victim: 53836,
  Accused: 36093,
  NetworkEdge: 23833,
  ForecastMonthly: 8892,
  OffenderProfile: 2048,
  District: 38
};

module.exports = {
  DISTRICTS,
  CRIME_HEADS,
  CRIME_SUBHEADS,
  CASE_CATEGORIES,
  CASE_STATUSES,
  GRAVITIES,
  EXPECTED_ROW_COUNTS,
  districtById,
  headById,
  subHeadById
};
