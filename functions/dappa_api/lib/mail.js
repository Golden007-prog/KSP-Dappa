'use strict';
// Catalyst Mail — alert digest.
//
// Real path : ctx.services.mailer.send() -> capp.email().sendMail({from_email,
//             to_email, subject, content, html_mode}) (Catalyst Mail service).
// Flag      : FEATURE_MAIL (off by default — sending mail is a side effect and
//             needs a verified sender address in the console).
// Fallback  : the fully rendered digest is still returned as `preview`, so the
//             admin UI shows exactly what WOULD have been sent. A live demo can
//             therefore never fail on a mail misconfiguration.
//
// Modes reported back: sent | disabled (flag off) | not-configured (no
// from/to address) | error-fallback (the send threw).

const { toNum, round, parseJsonSafe } = require('./util');
const { getLookups } = require('./lookups');

const MAX_ALERTS = 10;
const MAX_RISK = 5;

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Recipient list: explicit override -> DIGEST_TO env (comma separated). */
function recipients(override) {
  const raw = override === undefined || override === null || override === ''
    ? (process.env.DIGEST_TO || '')
    : override;
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  return list.map((s) => String(s).trim()).filter(Boolean);
}

/**
 * Build the digest payload from live data. Pure read — never sends.
 * Returns the same object whether or not mail is enabled, so the preview and
 * the sent mail can never drift apart.
 */
async function buildDigest(ctx, opts) {
  const o = opts || {};
  const limit = Math.max(1, Math.min(MAX_ALERTS, toNum(o.limit, MAX_ALERTS)));
  const lk = await getLookups(ctx);
  const [alerts, risk] = await Promise.all([
    ctx.ds.query({
      table: 'AnomalyAlert',
      columns: ['AlertID', 'DistrictID', 'CrimeHeadID', 'Observed', 'Expected', 'ZScore', 'Severity', 'Narrative'],
      where: [{ col: 'Status', op: '=', val: 'OPEN' }],
      orderBy: { col: 'Severity', desc: true }, limit: { count: limit }
    }).catch(() => []),
    ctx.ds.query({
      table: 'StationRisk', columns: ['UnitID', 'RiskScore', 'DriversJson'],
      orderBy: { col: 'RiskScore', desc: true }, limit: { count: MAX_RISK }
    }).catch(() => [])
  ]);

  const alertRows = alerts.map((a) => ({
    alertId: a.AlertID,
    severity: toNum(a.Severity),
    districtName: lk.districtName(a.DistrictID),
    headName: lk.headName(a.CrimeHeadID),
    observed: toNum(a.Observed),
    expected: round(toNum(a.Expected), 1),
    zScore: round(toNum(a.ZScore), 2),
    narrative: a.Narrative
  }));
  const riskRows = risk.map((r) => {
    const unit = lk.unitById.get(String(r.UnitID));
    return {
      unitId: String(r.UnitID),
      unitName: unit ? unit.unitName : `Unit ${r.UnitID}`,
      riskScore: round(toNum(r.RiskScore), 1),
      drivers: parseJsonSafe(r.DriversJson, [])
    };
  });

  // Kept byte-identical to the pre-existing /notify/test-digest preview so the
  // admin UI that already renders `lines` keeps working unchanged.
  const subject = `KSP DAPPA digest — ${alertRows.length} active alert${alertRows.length === 1 ? '' : 's'}`;
  const lines = alertRows.map((a) => `[S${a.severity}] ${a.narrative}`);
  const appUrl = process.env.APP_BASE_URL || '';
  const textParts = [subject, ''].concat(lines);
  if (riskRows.length) {
    textParts.push('', 'Highest-risk stations (30-day horizon):');
    for (const r of riskRows) textParts.push(`  ${r.unitName} — risk ${r.riskScore}`);
  }
  if (appUrl) textParts.push('', `Open the dashboard: ${appUrl}`);

  const html = [
    `<h2>${esc(subject)}</h2>`,
    alertRows.length
      ? `<ul>${alertRows.map((a) => `<li><strong>S${a.severity}</strong> ${esc(a.districtName)} · ${esc(a.headName)} — ${esc(a.narrative)} (observed ${a.observed} vs ~${a.expected}, z=${a.zScore})</li>`).join('')}</ul>`
      : '<p>No open alerts.</p>',
    riskRows.length
      ? `<h3>Highest-risk stations</h3><ul>${riskRows.map((r) => `<li>${esc(r.unitName)} — risk ${r.riskScore}</li>`).join('')}</ul>`
      : '',
    appUrl ? `<p><a href="${esc(appUrl)}">Open the dashboard</a></p>` : ''
  ].join('\n');

  return {
    subject,
    lines,
    text: textParts.join('\n'),
    html,
    alerts: alertRows,
    topRisk: riskRows,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Send the digest through Catalyst Mail when enabled; always return the
 * preview. `opts.to` overrides DIGEST_TO, `opts.htmlMode` picks the HTML body.
 */
async function sendDigest(ctx, opts) {
  const o = opts || {};
  const preview = o.preview || await buildDigest(ctx, o);
  const to = recipients(o.to);
  const from = String(o.from || process.env.MAIL_FROM || '').trim();
  const htmlMode = o.htmlMode === undefined ? false : Boolean(o.htmlMode);
  const base = { to, from: from || null, preview, subject: preview.subject };

  if (!ctx.flags.mail || !ctx.services.mailer) {
    return Object.assign({ sent: false, mode: 'disabled' }, base, { source: 'fallback-local' });
  }
  if (!from || !to.length) {
    return Object.assign({ sent: false, mode: 'not-configured' }, base, {
      source: 'fallback-local',
      note: 'Set MAIL_FROM (a console-verified sender) and DIGEST_TO to enable delivery.'
    });
  }
  try {
    await ctx.services.mailer.send({
      from,
      to,
      subject: preview.subject,
      content: htmlMode ? preview.html : preview.text,
      htmlMode
    });
    return Object.assign({ sent: true, mode: 'sent' }, base, { source: 'catalyst-mail' });
  } catch (e) {
    return Object.assign({ sent: false, mode: 'error-fallback' }, base, {
      source: 'fallback-local',
      error: String((e && e.message) || e)
    });
  }
}

module.exports = { buildDigest, sendDigest, recipients };
