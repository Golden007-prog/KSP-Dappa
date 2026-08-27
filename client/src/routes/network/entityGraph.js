// Victim and location entity model for the Network Explorer.
//
// The challenge asks for relationship mapping between suspects, victims AND
// recurring locations. Suspects come from NetworkEdge; the other two entity
// classes are reconstructed here from the sampled FIRs (see entityData.js).
//
// The suspect↔FIR join is EXACT, not name-matched: a NetworkEdge row carries
// the case ids on which its two persons were co-accused, so for any sampled FIR
// the set of known suspects is the union of the endpoints of every edge citing
// it. Victim rows and the registering police unit then come off the FIR detail.
// (Accused NAMES on a FIR carry only a per-case ordinal — 'A1', 'A2' — so name
// matching would be the weaker join and is used nowhere in this file.)
//
// Everything is pure: no React, no fetching, so the joins stay testable.
import { ageBand, genderKey, victimProfileKey } from './entityData.js';
import { markHubs } from './graphUtils.js';

export const VICTIM_PREFIX = 'V:';
export const LOCATION_PREFIX = 'U:';

export const isVictimId = (id) => String(id || '').startsWith(VICTIM_PREFIX);
export const isLocationId = (id) => String(id || '').startsWith(LOCATION_PREFIX);

const inc = (map, key, by = 1) => { map.set(key, (map.get(key) || 0) + by); };

/**
 * Join the sampled FIRs to the co-accusal edge set.
 *
 * @param cases  sampled FIR details (GET /cases/:id shape)
 * @param suspectsByCase Map(caseId → {suspects:Set}) from rankCaseIds()
 * @returns a fully indexed entity model — see the shape comments below.
 */
export function buildEntityIndex(cases = [], suspectsByCase = new Map()) {
  /** caseId → enriched FIR row used by every panel below. */
  const caseById = new Map();
  /** 'V:<victimId>' → victim entity */
  const victims = new Map();
  /** 'U:<unitName>' → location entity */
  const locations = new Map();
  /** '<personKey>|V:<victimId>' → suspect↔victim link */
  const victimLinks = new Map();
  /** '<personKey>|U:<unitName>' → suspect↔location link */
  const locationLinks = new Map();
  /** profileKey → repeat-victimisation candidate */
  const profiles = new Map();
  /** personKey → {cases:Set, units:Map, victims:Set} */
  const suspectRollup = new Map();

  const rollup = (pk) => {
    let r = suspectRollup.get(pk);
    if (!r) { r = { personKey: pk, cases: new Set(), units: new Map(), victims: new Set(), heads: new Map() }; suspectRollup.set(pk, r); }
    return r;
  };

  for (const c of cases) {
    const caseId = String(c.caseMasterId);
    if (!caseId || caseById.has(caseId)) continue;
    const suspects = [...(suspectsByCase.get(caseId)?.suspects || [])];
    const unitName = String(c.unitName || '').trim();
    const locId = unitName ? LOCATION_PREFIX + unitName : '';
    const row = {
      caseId,
      crimeNo: c.crimeNo || '',
      registeredDate: c.registeredDate || '',
      unitName,
      districtName: String(c.districtName || '').trim(),
      headName: c.headName || '',
      subHeadName: c.subHeadName || '',
      gravityName: c.gravityName || '',
      statusName: c.statusName || '',
      latitude: Number.isFinite(Number(c.latitude)) ? Number(c.latitude) : null,
      longitude: Number.isFinite(Number(c.longitude)) ? Number(c.longitude) : null,
      suspects,
      victimIds: [],
      victimCount: (c.victims || []).length,
      accusedCount: (c.accused || []).length,
    };
    caseById.set(caseId, row);

    // --- location entity ----------------------------------------------------
    if (locId) {
      let loc = locations.get(locId);
      if (!loc) {
        loc = {
          id: locId,
          unitName,
          districtName: row.districtName,
          caseIds: new Set(),
          suspects: new Set(),
          communities: new Set(),
          heads: new Map(),
          victims: 0,
          firstSeen: '',
          lastSeen: '',
          lat: null,
          lng: null,
        };
        locations.set(locId, loc);
      }
      loc.caseIds.add(caseId);
      loc.victims += row.victimCount;
      if (row.headName) inc(loc.heads, row.headName);
      if (row.registeredDate) {
        if (!loc.firstSeen || row.registeredDate < loc.firstSeen) loc.firstSeen = row.registeredDate;
        if (!loc.lastSeen || row.registeredDate > loc.lastSeen) loc.lastSeen = row.registeredDate;
      }
      if (loc.lat === null && row.latitude !== null) { loc.lat = row.latitude; loc.lng = row.longitude; }
      for (const pk of suspects) {
        loc.suspects.add(pk);
        const key = `${pk}|${locId}`;
        let link = locationLinks.get(key);
        if (!link) { link = { personKey: pk, locationId: locId, unitName, districtName: row.districtName, caseIds: [], weight: 0 }; locationLinks.set(key, link); }
        link.caseIds.push(caseId);
        link.weight += 1;
        const r = rollup(pk);
        r.cases.add(caseId);
        inc(r.units, unitName);
        if (row.headName) inc(r.heads, row.headName);
      }
    } else {
      for (const pk of suspects) rollup(pk).cases.add(caseId);
    }

    // --- victim entities ----------------------------------------------------
    for (const v of c.victims || []) {
      const vid = String(v.victimId ?? '');
      if (!vid) continue;
      const id = VICTIM_PREFIX + vid;
      const age = Number.isFinite(Number(v.age)) && Number(v.age) > 0 ? Number(v.age) : null;
      const entity = {
        id,
        victimId: vid,
        name: String(v.name || '').trim(),
        age,
        ageBand: ageBand(age),
        genderId: v.genderId === undefined || v.genderId === null ? null : Number(v.genderId),
        gender: genderKey(v.genderId),
        isPolice: String(v.victimPolice ?? '0') === '1',
        caseId,
        unitName,
        districtName: row.districtName,
        headName: row.headName,
        subHeadName: row.subHeadName,
        registeredDate: row.registeredDate,
        suspects,
        profileKey: victimProfileKey(v.name, v.genderId),
      };
      victims.set(id, entity);
      row.victimIds.push(id);

      // repeat-victimisation candidate bucket
      if (entity.profileKey) {
        let p = profiles.get(entity.profileKey);
        if (!p) {
          p = {
            profileKey: entity.profileKey,
            name: entity.name,
            gender: entity.gender,
            genderId: entity.genderId,
            victimIds: [],
            caseIds: [],
            ages: [],
            dates: [],
            units: new Set(),
            districts: new Set(),
            heads: new Set(),
            suspects: new Set(),
          };
          profiles.set(entity.profileKey, p);
        }
        p.victimIds.push(id);
        if (!p.caseIds.includes(caseId)) p.caseIds.push(caseId);
        if (age !== null) p.ages.push(age);
        if (row.registeredDate) p.dates.push(row.registeredDate);
        if (unitName) p.units.add(unitName);
        if (row.districtName) p.districts.add(row.districtName);
        if (row.headName) p.heads.add(row.headName);
        for (const pk of suspects) p.suspects.add(pk);
      }

      for (const pk of suspects) {
        const key = `${pk}|${id}`;
        let link = victimLinks.get(key);
        if (!link) { link = { personKey: pk, victimId: id, caseIds: [], weight: 0 }; victimLinks.set(key, link); }
        link.caseIds.push(caseId);
        link.weight += 1;
        const r = rollup(pk);
        r.victims.add(id);
      }
    }
  }

  return {
    caseById,
    victims,
    locations,
    victimLinks,
    locationLinks,
    profiles,
    suspectRollup,
    sampledCases: caseById.size,
    victimCount: victims.size,
    locationCount: locations.size,
  };
}

/**
 * Repeat victimisation — the same recorded name + gender appearing on two or
 * more sampled FIRs. Identity resolution is NOT applied to victim records in
 * this dataset, so these are review candidates: the ages are reported with the
 * FIR gap so an analyst can judge whether one person is plausible.
 * `ageOk` is true when the age drift matches the elapsed years within ±2.
 */
export function repeatVictims(index, { minCases = 2, limit = 40 } = {}) {
  const rows = [];
  for (const p of index.profiles.values()) {
    if (p.caseIds.length < minCases) continue;
    const dates = [...p.dates].sort();
    const first = dates[0] || '';
    const last = dates[dates.length - 1] || '';
    const yearsApart = first && last
      ? Math.abs(new Date(last).getFullYear() - new Date(first).getFullYear())
      : 0;
    const ages = [...p.ages].sort((a, b) => a - b);
    const ageSpread = ages.length > 1 ? ages[ages.length - 1] - ages[0] : 0;
    rows.push({
      profileKey: p.profileKey,
      name: p.name,
      gender: p.gender,
      cases: p.caseIds.length,
      caseIds: p.caseIds,
      victimIds: p.victimIds,
      ages,
      ageSpread,
      yearsApart,
      ageOk: ages.length < 2 || Math.abs(ageSpread - yearsApart) <= 2,
      units: [...p.units],
      districts: [...p.districts],
      heads: [...p.heads],
      suspects: [...p.suspects],
      first,
      last,
    });
  }
  return rows
    .sort((a, b) => b.cases - a.cases
      || Number(b.ageOk) - Number(a.ageOk)
      || b.suspects.length - a.suspects.length
      || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Victim demographics per crime head — AGE BAND and GENDER only. Caste and
 * religion are never read from the API and never appear here; that is an
 * organiser rule, not a display preference.
 * Returns {heads:[{headName, total, bands:{}, genders:{}, medianAge, minors}], bands, genders}.
 */
export function victimDemographics(index) {
  const byHead = new Map();
  const bands = new Map();
  const genders = new Map();
  for (const v of index.victims.values()) {
    const head = v.headName || '';
    if (!byHead.has(head)) byHead.set(head, { headName: head, total: 0, bands: new Map(), genders: new Map(), ages: [], minors: 0, police: 0 });
    const h = byHead.get(head);
    h.total += 1;
    if (v.ageBand) { inc(h.bands, v.ageBand); inc(bands, v.ageBand); }
    inc(h.genders, v.gender); inc(genders, v.gender);
    if (v.age !== null) h.ages.push(v.age);
    if (v.ageBand === 'minor') h.minors += 1;
    if (v.isPolice) h.police += 1;
  }
  const heads = [...byHead.values()].map((h) => {
    const sorted = [...h.ages].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
      headName: h.headName,
      total: h.total,
      bands: Object.fromEntries(h.bands),
      genders: Object.fromEntries(h.genders),
      medianAge: sorted.length ? (sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)) : null,
      minors: h.minors,
      police: h.police,
    };
  }).sort((a, b) => b.total - a.total || a.headName.localeCompare(b.headName));
  return { heads, bands: Object.fromEntries(bands), genders: Object.fromEntries(genders) };
}

/**
 * Suspect→victim contact rows, ranked by how many sampled FIRs bind the pair.
 * Weight > 1 is the sharp signal: the same suspect appearing against the same
 * victim on more than one FIR.
 */
export function suspectVictimRows(index, { limit = 60 } = {}) {
  // At live volumes almost every pair weighs 1, so the tiebreak decides what an
  // analyst actually sees. Alphabetical order would be noise: rank instead by
  // repeat-victim status, then by how many victims that suspect touches, then
  // by recency — the three things that make a row worth opening.
  const repeat = new Set();
  for (const p of index.profiles.values()) {
    if (p.caseIds.length > 1) for (const id of p.victimIds) repeat.add(id);
  }
  const rows = [];
  for (const link of index.victimLinks.values()) {
    const v = index.victims.get(link.victimId);
    if (!v) continue;
    rows.push({
      personKey: link.personKey,
      victimId: link.victimId,
      victimName: v.name,
      victimAge: v.age,
      victimGender: v.gender,
      headName: v.headName,
      unitName: v.unitName,
      districtName: v.districtName,
      registeredDate: v.registeredDate,
      weight: link.weight,
      caseIds: link.caseIds,
      profileKey: v.profileKey,
      repeatVictim: repeat.has(link.victimId),
      suspectVictims: index.suspectRollup.get(String(link.personKey))?.victims.size || 0,
    });
  }
  return rows
    .sort((a, b) => b.weight - a.weight
      || Number(b.repeatVictim) - Number(a.repeatVictim)
      || b.suspectVictims - a.suspectVictims
      || String(b.registeredDate).localeCompare(String(a.registeredDate))
      || String(a.personKey).localeCompare(String(b.personKey)))
    .slice(0, limit);
}

/**
 * Multi-victim FIRs — the sampled cases with the largest victim counts, which
 * is where a single incident touches a whole household or a group.
 */
export function multiVictimCases(index, { limit = 20 } = {}) {
  return [...index.caseById.values()]
    .filter((c) => c.victimCount > 1)
    .sort((a, b) => b.victimCount - a.victimCount
      || b.suspects.length - a.suspects.length
      || String(b.registeredDate).localeCompare(String(a.registeredDate)))
    .slice(0, limit);
}

/**
 * Location affiliation: for each suspect, how concentrated their sampled
 * offending is on one police unit. `share` is that unit's cases over all the
 * person's sampled cases — 1.0 means every sampled FIR was registered there.
 * Returns rows sorted by anchor strength (share × cases).
 */
export function locationAffiliation(index, { limit = 60, minCases = 2 } = {}) {
  const rows = [];
  for (const r of index.suspectRollup.values()) {
    const total = r.cases.size;
    // One sampled FIR gives a trivial 100% share and says nothing about where
    // a person operates; affiliation needs at least two observations to mean
    // anything, so single-FIR people are excluded rather than mislabelled.
    if (total < minCases || !r.units.size) continue;
    const units = [...r.units.entries()].sort((a, b) => b[1] - a[1]);
    const [topUnit, topCount] = units[0];
    rows.push({
      personKey: r.personKey,
      cases: total,
      units: units.length,
      topUnit,
      topCount,
      share: topCount / total,
      strength: (topCount / total) * topCount,
      spread: units.length / total,
      unitList: units.map(([unitName, n]) => ({ unitName, cases: n })),
    });
  }
  return rows
    .sort((a, b) => b.strength - a.strength || b.cases - a.cases)
    .slice(0, limit);
}

/** Recurring locations ranked by how many distinct suspects and FIRs they carry. */
export function locationRows(index, { limit = 60 } = {}) {
  return [...index.locations.values()]
    .map((l) => {
      const heads = [...l.heads.entries()].sort((a, b) => b[1] - a[1]);
      return {
        id: l.id,
        unitName: l.unitName,
        districtName: l.districtName,
        cases: l.caseIds.size,
        caseIds: [...l.caseIds],
        suspects: l.suspects.size,
        suspectList: [...l.suspects],
        victims: l.victims,
        topHead: heads.length ? heads[0][0] : '',
        heads: heads.length,
        firstSeen: l.firstSeen,
        lastSeen: l.lastSeen,
        lat: l.lat,
        lng: l.lng,
      };
    })
    .sort((a, b) => b.suspects - a.suspects || b.cases - a.cases || a.unitName.localeCompare(b.unitName))
    .slice(0, limit);
}

/**
 * Co-location of different communities: police units where suspects from two
 * or more detected groups both operate. This is the "shared turf" read — a
 * contested or jointly-worked location is a different intelligence object from
 * one crew's home ground.
 */
export function communityColocation(index, commOf = new Map(), { limit = 30, edges = [] } = {}) {
  // Community labels can be degenerate — the live pipeline currently assigns
  // almost every linked person to one Louvain group — so shared turf is read
  // two ways. The group count is the organised-crime reading when labels are
  // informative; the UNCONNECTED-PAIR count works regardless, and is the
  // sharper operational signal anyway: two people working the same station
  // area with no shared FIR between them are exactly the pair a station officer
  // would recognise and the graph would not.
  const linked = new Set();
  for (const e of edges) {
    const s = String(e.source); const t = String(e.target);
    linked.add(s < t ? `${s}~~${t}` : `${t}~~${s}`);
  }
  const rows = [];
  for (const l of index.locations.values()) {
    const groups = new Map();
    for (const pk of l.suspects) {
      const cid = commOf.get(String(pk));
      if (cid === undefined || cid === null || cid === '') continue;
      inc(groups, String(cid));
    }
    const people = [...l.suspects].map(String).sort();
    let unlinked = 0;
    for (let i = 0; i < people.length; i += 1) {
      for (let k = i + 1; k < people.length; k += 1) {
        if (!linked.has(`${people[i]}~~${people[k]}`)) unlinked += 1;
      }
    }
    if (groups.size < 2 && unlinked === 0) continue;
    const list = [...groups.entries()].sort((a, b) => b[1] - a[1]);
    rows.push({
      id: l.id,
      unitName: l.unitName,
      districtName: l.districtName,
      groups: list.length,
      unlinked,
      cases: l.caseIds.size,
      suspects: l.suspects.size,
      groupList: list.map(([communityId, n]) => ({ communityId, members: n })),
    });
  }
  return rows
    .sort((a, b) => b.groups - a.groups || b.unlinked - a.unlinked || b.suspects - a.suspects)
    .slice(0, limit);
}

/**
 * District-level community footprint — computed off the offender registry
 * (DistrictsJson per person), so unlike everything above it covers every loaded
 * profile rather than the FIR sample. Returns {districts, rows, max}.
 */
export function communityDistrictMatrix(nodes = [], districtsByPerson = new Map(), { topDistricts = 12 } = {}) {
  const byGroup = new Map();
  const districtTotals = new Map();
  for (const n of nodes) {
    const cid = n?.communityId;
    if (cid === null || cid === undefined || cid === '') continue;
    const key = String(cid);
    if (!byGroup.has(key)) byGroup.set(key, new Map());
    const g = byGroup.get(key);
    for (const d of districtsByPerson.get(String(n.id)) || []) {
      inc(g, String(d));
      inc(districtTotals, String(d));
    }
  }
  const districts = [...districtTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topDistricts)
    .map(([name]) => name);
  let max = 0;
  const rows = [...byGroup.entries()]
    .map(([communityId, g]) => {
      const cells = districts.map((d) => {
        const v = g.get(d) || 0;
        if (v > max) max = v;
        return v;
      });
      return { communityId, cells, total: [...g.values()].reduce((a, b) => a + b, 0), districts: g.size };
    })
    .sort((a, b) => b.total - a.total
      || String(a.communityId).localeCompare(String(b.communityId), undefined, { numeric: true }));
  return { districts, rows, max: Math.max(1, max) };
}

// --- Cytoscape element builders ---------------------------------------------

const VICTIM_COLOR = '#2DD4BF';
const VICTIM_REPEAT_COLOR = '#E5484D';
const LOCATION_COLOR = '#F5A623';

/**
 * Suspect↔victim bipartite elements. `cap` bounds the drawn victim count (the
 * caller shows the real total beside it) — a 160-FIR sample can carry 200+
 * victim nodes and the canvas has to stay readable.
 */
export function victimElements(index, {
  nodesById = new Map(), colorOf = () => '#64748B', cap = 220, watchKeys = new Set(),
} = {}) {
  const linkCount = new Map();
  for (const l of index.victimLinks.values()) inc(linkCount, l.victimId, l.weight);
  const repeat = new Set();
  for (const p of index.profiles.values()) {
    if (p.caseIds.length > 1) for (const id of p.victimIds) repeat.add(id);
  }
  const ranked = [...index.victims.values()].sort((a, b) => {
    const ra = repeat.has(a.id) ? 1 : 0;
    const rb = repeat.has(b.id) ? 1 : 0;
    return rb - ra || (linkCount.get(b.id) || 0) - (linkCount.get(a.id) || 0);
  });
  const shown = ranked.slice(0, cap);
  const shownIds = new Set(shown.map((v) => v.id));

  const persons = new Set();
  const edges = [];
  for (const l of index.victimLinks.values()) {
    if (!shownIds.has(l.victimId)) continue;
    persons.add(l.personKey);
    edges.push({
      data: {
        id: `${l.personKey}~~${l.victimId}`,
        source: l.personKey,
        target: l.victimId,
        weight: l.weight,
        kind: 'victimLink',
        width: 1 + Math.min(3, l.weight - 1) * 1.2,
      },
    });
  }

  const nodes = [];
  for (const pk of persons) {
    const n = nodesById.get(String(pk));
    const rolled = index.suspectRollup.get(String(pk));
    nodes.push({
      data: {
        id: String(pk),
        label: n?.label || String(pk),
        color: colorOf(n?.communityId),
        size: Math.round(18 + Math.min(20, (rolled?.victims.size || 0) * 2)),
        kind: 'person',
        communityId: n?.communityId,
        caseCount: n?.caseCount,
        victims: rolled?.victims.size || 0,
        watch: watchKeys.has(String(pk)) ? 1 : 0,
      },
    });
  }
  for (const v of shown) {
    const isRepeat = repeat.has(v.id);
    nodes.push({
      data: {
        id: v.id,
        label: v.name || v.victimId,
        color: isRepeat ? VICTIM_REPEAT_COLOR : VICTIM_COLOR,
        size: isRepeat ? 22 : 16,
        kind: 'victim',
        victimId: v.victimId,
        age: v.age,
        gender: v.gender,
        headName: v.headName,
        unitName: v.unitName,
        districtName: v.districtName,
        registeredDate: v.registeredDate,
        caseId: v.caseId,
        isPolice: v.isPolice ? 1 : 0,
        repeat: isRepeat ? 1 : 0,
      },
    });
  }
  markHubs(nodes);
  return {
    elements: [...nodes, ...edges],
    shownVictims: shown.length,
    totalVictims: index.victims.size,
    persons: persons.size,
    links: edges.length,
    repeatVictims: repeat.size,
  };
}

/** Suspect↔location elements — police units as first-class recurring places. */
export function locationElements(index, {
  nodesById = new Map(), colorOf = () => '#64748B', cap = 80, watchKeys = new Set(), riskByUnit = new Map(),
} = {}) {
  const ranked = [...index.locations.values()]
    .sort((a, b) => b.suspects.size - a.suspects.size || b.caseIds.size - a.caseIds.size);
  const shown = ranked.slice(0, cap);
  const shownIds = new Set(shown.map((l) => l.id));

  const persons = new Set();
  const edges = [];
  for (const l of index.locationLinks.values()) {
    if (!shownIds.has(l.locationId)) continue;
    persons.add(l.personKey);
    edges.push({
      data: {
        id: `${l.personKey}~~${l.locationId}`,
        source: l.personKey,
        target: l.locationId,
        weight: l.weight,
        kind: 'locationLink',
        width: 1 + Math.min(4, l.weight - 1) * 1.1,
      },
    });
  }

  const maxSuspects = Math.max(1, ...shown.map((l) => l.suspects.size));
  const nodes = [];
  for (const pk of persons) {
    const n = nodesById.get(String(pk));
    const rolled = index.suspectRollup.get(String(pk));
    nodes.push({
      data: {
        id: String(pk),
        label: n?.label || String(pk),
        color: colorOf(n?.communityId),
        size: Math.round(18 + Math.min(18, (rolled?.units.size || 0) * 3)),
        kind: 'person',
        communityId: n?.communityId,
        caseCount: n?.caseCount,
        units: rolled?.units.size || 0,
        watch: watchKeys.has(String(pk)) ? 1 : 0,
      },
    });
  }
  for (const l of shown) {
    nodes.push({
      data: {
        id: l.id,
        label: l.unitName,
        color: LOCATION_COLOR,
        size: Math.round(20 + 24 * Math.sqrt(l.suspects.size / maxSuspects)),
        kind: 'location',
        unitName: l.unitName,
        districtName: l.districtName,
        cases: l.caseIds.size,
        suspects: l.suspects.size,
        victims: l.victims,
        firstSeen: l.firstSeen,
        lastSeen: l.lastSeen,
        riskScore: riskByUnit.get(l.unitName) ?? null,
      },
    });
  }
  markHubs(nodes);
  return {
    elements: [...nodes, ...edges],
    shownLocations: shown.length,
    totalLocations: index.locations.size,
    persons: persons.size,
    links: edges.length,
  };
}
