'use strict';
// Action-loop digest — the daily/weekly "what happened" a SHO or SP reads.
//
// Extends lib/mail.js buildDigest (open alerts + highest-risk stations) with
// the action-loop record: decisions recorded in the window, outcome precision,
// the alerts nobody touched, and the labels-for-learning count. The object
// keeps the {subject, lines, text, html} keys that mail.sendDigest() and the
// dappa_nightly notify.py digest already use, so one shape serves the JSON
// endpoint, the printable /alerts/digest page and Catalyst Mail.

const mail = require('./mail');
const { getLookups } = require('./lookups');
const actionlog = require('./actionlog');
const { toNum, round } = require('./util');

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pct(v) {
  return v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`;
}

function scopeMatch(unit, a) {
  if (!unit) return true;
  return String(a.unitId || '') === unit || String(a.districtId || '') === unit;
}

/**
 * @param {object} ctx request context
 * @param {object} opts {unit?: string, days?: number}
 */
async function buildActionDigest(ctx, opts) {
  const o = opts || {};
  const days = Math.max(1, Math.min(365, toNum(o.days, 7)));
  const unit = o.unit ? String(o.unit).trim() : '';
  const now = Date.now();
  const sinceMs = now - days * 86400000;
  const lk = await getLookups(ctx);
  const [base, alertsAll, listed] = await Promise.all([
    mail.buildDigest(ctx, { limit: 10 }),
    actionlog.readAlerts(ctx, lk),
    actionlog.listActions(ctx, { sinceDs: actionlog.toDsDatetime(new Date(sinceMs)) })
  ]);
  const alerts = alertsAll.filter((a) => scopeMatch(unit, a));
  const alertIds = new Set(alerts.map((a) => a.alertId));
  const actions = listed.actions.filter((x) => (unit ? (x.unit === unit || alertIds.has(x.alertKey)) : true));
  // Precision needs every label ever recorded on these alerts, not just the
  // window's — a 7-day digest with a 90-day-old label would otherwise say
  // "no labels" while the panel says 12.
  const allActions = (await actionlog.listActions(ctx, {})).actions.filter((x) => !unit || alertIds.has(x.alertKey) || x.unit === unit);
  const outcomes = actionlog.computeOutcomes(alerts, allActions, { now, windowDays: null, untouchedLimit: 8 });

  // Decisions are alert-subject actions other than notes; the audit rows the
  // OCR / face / ingest modules write to the same table are counted apart.
  const byType = Object.fromEntries(actionlog.ACTION_TYPES.map((k) => [k, 0]));
  const bySubject = {};
  const alertActions = actions.filter((x) => x.subjectType === 'alert');
  for (const x of alertActions) byType[x.actionType] = (byType[x.actionType] || 0) + 1;
  for (const x of actions) bySubject[x.subjectType] = (bySubject[x.subjectType] || 0) + 1;
  const decisions = alertActions.filter((x) => x.actionType !== 'note').length;
  const openAlerts = alerts
    .filter((a) => String(a.status || '').toUpperCase() === 'OPEN')
    .sort((x, y) => toNum(y.severity) - toNum(x.severity) || Math.abs(y.zScore) - Math.abs(x.zScore))
    .slice(0, 10)
    .map((a) => ({
      alertId: a.alertId, severity: a.severity, headName: a.headName, districtName: a.districtName,
      unitId: a.unitId, zScore: a.zScore, narrative: a.narrative, createdAt: a.createdMs === null ? null : new Date(a.createdMs).toISOString()
    }));
  const scopeName = unit ? (lk.unitById.get(unit) ? lk.unitById.get(unit).unitName : lk.districtName(unit) || unit) : 'Karnataka (all units)';

  const subject = `KSP DAPPA digest — ${scopeName}: ${openAlerts.length} open alert${openAlerts.length === 1 ? '' : 's'}, ${decisions} decision${decisions === 1 ? '' : 's'} recorded in ${days} day${days === 1 ? '' : 's'}`;
  const lines = openAlerts.map((a) => `[S${a.severity}] ${a.narrative || `${a.headName} — ${a.districtName}`}`);
  const actionLines = [
    `Decisions recorded (${days}d): ${decisions} — acknowledged ${byType.acknowledge}, assigned ${byType.assign}, escalated ${byType.escalate}, dismissed ${byType.dismiss}, outcomes ${byType.outcome}, notes ${byType.note}`,
    outcomes.overall.labelled
      ? `Alert precision so far: ${pct(outcomes.overall.precision)} of ${outcomes.overall.labelled} labelled alerts were real (95% range ${pct(outcomes.overall.precisionInterval.lo)}–${pct(outcomes.overall.precisionInterval.hi)})`
      : 'Alert precision: no outcome labels recorded yet',
    outcomes.overall.medianTimeToAckHours === null
      ? 'Median time to acknowledge: no acknowledgements yet'
      : `Median time to acknowledge: ${outcomes.overall.medianTimeToAckHours} h`,
    `Open alerts nobody has touched: ${outcomes.untouchedTotal} (${outcomes.staleTotal} past their triage window)`
  ];
  const appUrl = process.env.APP_BASE_URL || '';
  const textParts = [subject, '', ...lines, '', 'Action loop:'].concat(actionLines.map((l) => `  ${l}`));
  if (outcomes.untouched.length) {
    textParts.push('', 'Untouched (oldest first within severity):');
    for (const u of outcomes.untouched) textParts.push(`  ${u.alertId} S${u.severity} ${u.headName || ''} — ${u.districtName || u.districtId || ''} (${round(u.ageHours / 24, 1)} d old)`);
  }
  if (base.topRisk.length) {
    textParts.push('', 'Highest-risk stations (30-day horizon):');
    for (const r of base.topRisk) textParts.push(`  ${r.unitName} — risk ${r.riskScore}`);
  }
  textParts.push('', 'DAPPA never tells an officer what to do; it shows what it found and how sure it is — the decision and its record are the officer\'s.');
  if (appUrl) textParts.push('', `Open the dashboard: ${appUrl}`);

  const html = [
    `<h2>${esc(subject)}</h2>`,
    openAlerts.length
      ? `<ul>${openAlerts.map((a) => `<li><strong>S${a.severity}</strong> ${esc(a.districtName)} · ${esc(a.headName)} — ${esc(a.narrative || '')} (z=${a.zScore})</li>`).join('')}</ul>`
      : '<p>No open alerts in scope.</p>',
    `<h3>Action loop</h3><ul>${actionLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`,
    outcomes.untouched.length
      ? `<h3>Untouched</h3><ul>${outcomes.untouched.map((u) => `<li>${esc(u.alertId)} S${u.severity} ${esc(u.headName || '')} — ${esc(u.districtName || u.districtId || '')}</li>`).join('')}</ul>`
      : '',
    base.topRisk.length
      ? `<h3>Highest-risk stations</h3><ul>${base.topRisk.map((r) => `<li>${esc(r.unitName)} — risk ${r.riskScore}</li>`).join('')}</ul>`
      : '',
    '<p><em>DAPPA never tells an officer what to do; it shows what it found and how sure it is — the decision and its record are the officer\'s.</em></p>',
    appUrl ? `<p><a href="${esc(appUrl)}">Open the dashboard</a></p>` : ''
  ].join('\n');

  return {
    subject,
    lines,
    text: textParts.join('\n'),
    html,
    scope: { unit: unit || null, scopeName, days, from: new Date(sinceMs).toISOString(), to: new Date(now).toISOString() },
    alerts: openAlerts,
    topRisk: base.topRisk,
    actions: { total: actions.length, alertActions: alertActions.length, decisions, byType, bySubject, recent: actions.slice(0, 20) },
    outcomes: {
      labelled: outcomes.overall.labelled,
      truePositive: outcomes.overall.truePositive,
      precision: outcomes.overall.precision,
      precisionInterval: outcomes.overall.precisionInterval,
      medianTimeToAckHours: outcomes.overall.medianTimeToAckHours,
      outcomeMix: outcomes.overall.outcomes,
      bySeverity: outcomes.bySeverity
    },
    untouched: outcomes.untouched,
    untouchedTotal: outcomes.untouchedTotal,
    staleTotal: outcomes.staleTotal,
    labels: outcomes.labels,
    storage: listed.storage,
    generatedAt: new Date(now).toISOString()
  };
}

module.exports = { buildActionDigest };
