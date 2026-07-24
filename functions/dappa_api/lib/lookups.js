'use strict';
// Cached lookup loader (districts, units, crime heads/subheads, categories,
// statuses, gravity, socio-economic). One Data Store round-trip per hour.

const constants = require('./constants');
const { toNum } = require('./util');

const TTL_SEC = 3600;

async function fetchTable(ds, table, columns) {
  return ds.query({ table, columns });
}

async function loadRaw(ds) {
  const [districts, units, heads, subHeads, categories, statuses, gravities, socio] = await Promise.all([
    fetchTable(ds, 'District', ['DistrictID', 'DistrictName']),
    fetchTable(ds, 'Unit', ['UnitID', 'UnitName', 'TypeID', 'ParentUnit', 'DistrictID']),
    fetchTable(ds, 'CrimeHead', ['CrimeHeadID', 'CrimeGroupName']),
    fetchTable(ds, 'CrimeSubHead', ['CrimeSubHeadID', 'CrimeHeadID', 'CrimeHeadName']),
    fetchTable(ds, 'CaseCategory', ['CaseCategoryID', 'LookupValue']),
    fetchTable(ds, 'CaseStatusMaster', ['CaseStatusID', 'CaseStatusName']),
    fetchTable(ds, 'GravityOffence', ['GravityOffenceID', 'LookupValue']),
    fetchTable(ds, 'SocioEconomic', ['DistrictID', 'Population', 'UrbanPct', 'LiteracyPct', 'DensityPerKm2', 'PerCapitaIncomeIdx'])
  ]);
  return {
    source: 'datastore',
    districts: districts.map((r) => ({ districtId: String(r.DistrictID), districtName: r.DistrictName })),
    units: units.map((r) => ({
      unitId: String(r.UnitID),
      unitName: r.UnitName,
      typeId: toNum(r.TypeID, null),
      parentUnit: r.ParentUnit === undefined || r.ParentUnit === null ? null : String(r.ParentUnit),
      districtId: String(r.DistrictID)
    })),
    heads: heads.map((r) => ({ id: toNum(r.CrimeHeadID), name: r.CrimeGroupName })),
    subHeads: subHeads.map((r) => ({ id: toNum(r.CrimeSubHeadID), headId: toNum(r.CrimeHeadID), name: r.CrimeHeadName })),
    categories: categories.map((r) => ({ id: toNum(r.CaseCategoryID), name: r.LookupValue })),
    statuses: statuses.map((r) => ({ id: toNum(r.CaseStatusID), name: r.CaseStatusName })),
    gravities: gravities.map((r) => ({ id: toNum(r.GravityOffenceID), name: r.LookupValue })),
    socio: socio.map((r) => ({
      districtId: String(r.DistrictID),
      population: toNum(r.Population, null),
      urbanPct: toNum(r.UrbanPct, null),
      literacyPct: toNum(r.LiteracyPct, null),
      densityPerKm2: toNum(r.DensityPerKm2, null),
      perCapitaIncomeIdx: toNum(r.PerCapitaIncomeIdx, null)
    }))
  };
}

function fromConstants() {
  return {
    source: 'fallback-constants',
    districts: constants.DISTRICTS.map((d) => ({ districtId: d.id, districtName: d.name })),
    units: [],
    heads: constants.CRIME_HEADS.map((h) => ({ id: h.id, name: h.name })),
    subHeads: constants.CRIME_SUBHEADS.map((s) => ({ id: s.id, headId: s.headId, name: s.name })),
    categories: constants.CASE_CATEGORIES.map((c) => ({ id: c.id, name: c.name })),
    statuses: constants.CASE_STATUSES.map((s) => ({ id: s.id, name: s.name })),
    gravities: constants.GRAVITIES.map((g) => ({ id: g.id, name: g.name })),
    socio: []
  };
}

function withMaps(lk) {
  return Object.assign({}, lk, {
    districtName: (id) => {
      const hit = lk.districts.find((d) => d.districtId === String(id));
      return hit ? hit.districtName : String(id);
    },
    unitById: new Map(lk.units.map((u) => [u.unitId, u])),
    headName: (id) => {
      const hit = lk.heads.find((h) => h.id === toNum(id));
      return hit ? hit.name : String(id);
    },
    subHeadName: (id) => {
      const hit = lk.subHeads.find((s) => s.id === toNum(id));
      return hit ? hit.name : String(id);
    },
    statusName: (id) => {
      const hit = lk.statuses.find((s) => s.id === toNum(id));
      return hit ? hit.name : String(id);
    },
    gravityName: (id) => {
      const hit = lk.gravities.find((g) => g.id === toNum(id));
      return hit ? hit.name : String(id);
    },
    categoryName: (id) => {
      const hit = lk.categories.find((c) => c.id === toNum(id));
      return hit ? hit.name : String(id);
    },
    population: (districtId) => {
      const hit = lk.socio.find((s) => s.districtId === String(districtId));
      return hit && hit.population ? hit.population : null;
    },
    unitsOfDistrict: (districtId) => lk.units.filter((u) => u.districtId === String(districtId))
  });
}

/** Cached lookups (1h). Falls back to compiled constants if Data Store is unreachable. */
async function getLookups(ctx, bypass) {
  const { value } = await ctx.cache.wrap('v1:lookups', TTL_SEC, bypass, async () => {
    try {
      return await loadRaw(ctx.ds);
    } catch (e) {
      return fromConstants();
    }
  });
  return withMaps(value);
}

module.exports = { getLookups, TTL_SEC };
