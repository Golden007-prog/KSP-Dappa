'use strict';
// Cached lookup loader (districts, units, crime heads/subheads, categories,
// statuses, gravity, socio-economic). One Data Store round-trip per hour.

const constants = require('./constants');
const { toNum } = require('./util');

const TTL_SEC = 3600;

// Lookups must be COMPLETE: Karnataka has 359 units, past the 300-row ZCQL
// page. A truncated Unit table would leave ~60 stations rendering as raw ids
// everywhere, so every lookup pages.
async function fetchTable(ds, table, columns, orderBy) {
  if (typeof ds.queryAll === 'function') {
    return ds.queryAll({ table, columns, orderBy: orderBy ? { col: orderBy } : undefined }, { maxRows: 3000 });
  }
  return ds.query({ table, columns });
}

async function loadRaw(ds) {
  const [districts, units, heads, subHeads, categories, statuses, gravities, socio] = await Promise.all([
    fetchTable(ds, 'District', ['DistrictID', 'DistrictName'], 'DistrictID'),
    fetchTable(ds, 'Unit', ['UnitID', 'UnitName', 'TypeID', 'ParentUnit', 'DistrictID'], 'UnitID'),
    fetchTable(ds, 'CrimeHead', ['CrimeHeadID', 'CrimeGroupName'], 'CrimeHeadID'),
    fetchTable(ds, 'CrimeSubHead', ['CrimeSubHeadID', 'CrimeHeadID', 'CrimeHeadName'], 'CrimeSubHeadID'),
    fetchTable(ds, 'CaseCategory', ['CaseCategoryID', 'LookupValue'], 'CaseCategoryID'),
    fetchTable(ds, 'CaseStatusMaster', ['CaseStatusID', 'CaseStatusName'], 'CaseStatusID'),
    fetchTable(ds, 'GravityOffence', ['GravityOffenceID', 'LookupValue'], 'GravityOffenceID'),
    fetchTable(ds, 'SocioEconomic', ['DistrictID', 'Population', 'UrbanPct', 'LiteracyPct', 'DensityPerKm2', 'PerCapitaIncomeIdx'], 'DistrictID')
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
    // District ids are zero-padded in the fact tables (AggMonthly.DistrictID
    // '0101') but not in the District master ('101'), so an exact match drops
    // the name and the UI falls back to showing the raw code. Compare on the
    // unpadded form in both directions.
    districtName: (id) => {
      const raw = String(id);
      const bare = raw.replace(/^0+(?=\d)/, '');
      const hit = lk.districts.find((d) => {
        const dv = String(d.districtId);
        return dv === raw || dv.replace(/^0+(?=\d)/, '') === bare;
      });
      return hit ? hit.districtName : raw;
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
