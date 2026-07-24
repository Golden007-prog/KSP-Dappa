'use strict';
// Catalyst Event function bound (via Signals) to CaseMaster inserts.
// Flow: incremental AggMonthly upsert -> fast robust z-check on the district x
// crime-head monthly series -> insert an AnomalyAlert row when it trips.
// Demo storyline: "register FIR -> alert appears".

const catalyst = require('zcatalyst-sdk-node');

function log(level, evt, extra) {
  console.log(JSON.stringify(Object.assign({ ts: new Date().toISOString(), level, evt }, extra || {})));
}

function esc(v) {
  return String(v).replace(/'/g, "''");
}

function num(row, expr) {
  if (!row) return 0;
  const n = Number(row[expr]);
  return Number.isFinite(n) ? n : 0;
}

/** ZCQL rows come back keyed by table name — flatten to one object. */
function flat(rows) {
  return (rows || []).map((r) => {
    const keys = Object.keys(r || {});
    if (keys.length && keys.every((k) => r[k] && typeof r[k] === 'object')) {
      const out = {};
      for (const k of keys) Object.assign(out, r[k]);
      return out;
    }
    return r;
  });
}

function ymAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function severityOf(z) {
  if (z >= 4) return 3;
  if (z >= 3) return 2;
  return 1;
}

async function handleInsert(app, row) {
  const zcql = app.zcql();
  const crimeNo = String(row.CrimeNo || '');
  const districtId = crimeNo.length >= 9 ? crimeNo.slice(1, 5) : String(row.DistrictID || '');
  const unitId = String(row.PoliceStationID || (crimeNo.length >= 13 ? crimeNo.slice(5, 9) : ''));
  const ym = String(row.CrimeRegisteredDate || '').slice(0, 7);
  const headId = Number(row.CrimeMajorHeadID);
  const subHeadId = Number(row.CrimeMinorHeadID);
  if (!ym || !districtId || !Number.isFinite(headId)) {
    log('warn', 'skip_row', { reason: 'missing keys', crimeNo });
    return;
  }

  // Heinous? (lookup once per invocation; default id 1 = Heinous)
  let heinousId = 1;
  try {
    const g = flat(await zcql.executeZCQLQuery("SELECT GravityOffenceID FROM GravityOffence WHERE LookupValue = 'Heinous'"));
    if (g.length) heinousId = Number(g[0].GravityOffenceID);
  } catch (e) { /* keep default */ }
  const heinousInc = Number(row.GravityOffenceID) === heinousId ? 1 : 0;

  // --- incremental AggMonthly upsert -------------------------------------
  const keyWhere = `Ym='${esc(ym)}' AND DistrictID='${esc(districtId)}' AND UnitID='${esc(unitId)}' AND CrimeHeadID=${headId} AND CrimeSubHeadID=${subHeadId}`;
  const existing = flat(await zcql.executeZCQLQuery(`SELECT ROWID, CaseCount, HeinousCount FROM AggMonthly WHERE ${keyWhere}`));
  const table = app.datastore().table('AggMonthly');
  if (existing.length) {
    await table.updateRow({
      ROWID: existing[0].ROWID,
      CaseCount: num(existing[0], 'CaseCount') + 1,
      HeinousCount: num(existing[0], 'HeinousCount') + heinousInc
    });
  } else {
    await table.insertRow({
      Ym: ym, DistrictID: districtId, UnitID: unitId,
      CrimeHeadID: headId, CrimeSubHeadID: subHeadId,
      CaseCount: 1, HeinousCount: heinousInc
    });
  }
  log('info', 'agg_upserted', { ym, districtId, unitId, headId, subHeadId });

  // --- fast z-check on district x head monthly series --------------------
  const fromYm = ymAdd(ym, -8);
  const series = flat(await zcql.executeZCQLQuery(
    `SELECT Ym, SUM(CaseCount) FROM AggMonthly WHERE DistrictID='${esc(districtId)}' AND CrimeHeadID=${headId} AND Ym >= '${esc(fromYm)}' AND Ym <= '${esc(ym)}' GROUP BY Ym`
  ));
  const current = series.filter((r) => r.Ym === ym).reduce((s, r) => s + num(r, 'SUM(CaseCount)'), 0);
  const baseline = series.filter((r) => r.Ym !== ym).map((r) => num(r, 'SUM(CaseCount)'));
  if (baseline.length < 3) return; // not enough history for a stable check
  const mean = baseline.reduce((s, n) => s + n, 0) / baseline.length;
  const variance = baseline.reduce((s, n) => s + (n - mean) * (n - mean), 0) / baseline.length;
  const std = Math.max(Math.sqrt(variance), 1e-9);
  const z = (current - mean) / std;
  if (z < 2) return;

  // Deduplicate: one open alert per district x head x month.
  const open = flat(await zcql.executeZCQLQuery(
    `SELECT AlertID FROM AnomalyAlert WHERE DistrictID='${esc(districtId)}' AND CrimeHeadID=${headId} AND PeriodStart='${esc(ym)}-01' AND Status='OPEN'`
  ));
  if (open.length) {
    log('info', 'alert_exists', { districtId, headId, ym });
    return;
  }
  const zR = Math.round(z * 100) / 100;
  const narrative = `Live z-check: ${current} cases this month vs ~${Math.round(mean * 10) / 10} expected for this district/head (z=${zR}).`;
  await app.datastore().table('AnomalyAlert').insertRow({
    AlertID: `EVT-${Date.now()}`,
    DistrictID: districtId,
    UnitID: unitId,
    CrimeHeadID: headId,
    PeriodStart: `${ym}-01`,
    PeriodEnd: `${ym}-28`,
    Observed: current,
    Expected: Math.round(mean * 10) / 10,
    ZScore: zR,
    Severity: severityOf(z),
    Status: 'OPEN',
    Narrative: narrative,
    CreatedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
  });
  log('info', 'alert_inserted', { districtId, headId, ym, z: zR });
}

module.exports = async (event, context) => {
  try {
    const app = catalyst.initialize(context);
    const details = event.getSourceDetails ? event.getSourceDetails() : {};
    const data = event.data || {};
    // Signals payloads may nest the row under the table name.
    const row = data.CaseMaster || data.row || data;
    log('info', 'event_received', { source: details && details.type, action: details && details.action });
    await handleInsert(app, row);
    context.closeWithSuccess();
  } catch (err) {
    log('error', 'event_failed', { message: err && err.message });
    context.closeWithFailure();
  }
};
