'use strict';
// dappa_job — Catalyst Job Function: the target a Function job pool invokes.
//
// Why this function exists at all. Job Scheduling replaces Circuits in the IN
// data centre (docs/DECISIONS.md D-019), and lib/jobs.js submits the nightly
// refresh with `target_type: 'Function'`. A Function job pool can only invoke a
// function whose deployment type is `job`; pointing it at the `cron`-typed
// dappa_nightly makes every submit fail with "The given function is not a job
// function.". Because a failed submit deliberately falls back to running the
// same steps inline with an honest note, that failure is invisible in normal
// use — the feature reads as healthy while never once reaching the pool.
//
// What it does. It calls dappa_api's inline runner, so the aggregate ->
// detect-anomalies -> notify steps have exactly ONE implementation
// (functions/dappa_api/lib/circuits.js runInline) whether they are reached by
// a pool job, by the cron function, or by the inline fallback.
//
// It deliberately calls /admin/jobs/run-inline and never /admin/jobs/
// nightly-refresh: the latter submits a job, so a job calling it would recurse.
//
// Handler contract (docs.catalyst.zoho.com/en/serverless/help/functions/
// job-functions/): module.exports = (jobRequest, context), jobRequest.
// getJobParam(key), context.closeWithSuccess() / closeWithFailure(); the
// maximum execution time is a constant 15 minutes.

const DEFAULT_ADMIN_TOKEN = 'demo-admin'; // matches lib/envelope.js; guards synthetic data only
const REQUEST_TIMEOUT_MS = 13 * 60 * 1000; // inside the 15-minute job ceiling

/**
 * The API root, derived from the client URL the project already configures.
 * APP_BASE_URL points at the hosted client (…/app); the function lives beside
 * it under …/server/dappa_api/api/v1.
 */
function apiBase() {
  const raw = String(process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  if (!raw) return '';
  return `${raw.replace(/\/app$/, '')}/server/dappa_api/api/v1`;
}

module.exports = async (jobRequest, context) => {
  const started = Date.now();
  const log = (level, evt, extra) =>
    console.log(JSON.stringify(Object.assign({ ts: new Date().toISOString(), level, evt, fn: 'dappa_job' }, extra || {})));

  let param = () => null;
  try {
    param = (k) => {
      const v = jobRequest && typeof jobRequest.getJobParam === 'function' ? jobRequest.getJobParam(k) : null;
      return v === undefined ? null : v;
    };
  } catch (e) { /* keep the null-returning default */ }

  const base = apiBase();
  if (!base) {
    log('error', 'job_no_base_url', { message: 'APP_BASE_URL is unset; cannot reach dappa_api' });
    context.closeWithFailure();
    return;
  }

  // Job params arrive as strings (lib/jobs.js stringifies them on submit).
  const trigger = String(param('trigger') || 'job');
  const send = String(param('send') || 'false') === 'true';

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/admin/jobs/run-inline`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': process.env.ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN,
      },
      body: JSON.stringify({ trigger, send }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true) {
      log('error', 'job_run_failed', {
        status: res.status,
        error: body && body.error ? body.error.code : null,
        ms: Date.now() - started,
      });
      context.closeWithFailure();
      return;
    }
    const d = body.data || {};
    log('info', 'job_run_ok', {
      executionId: d.jobId || null,
      status: d.status || null,
      steps: Array.isArray(d.steps) ? d.steps.length : 0,
      trigger,
      send,
      ms: Date.now() - started,
    });
    context.closeWithSuccess();
  } catch (e) {
    // Aborts land here too; a failure lets the pool apply its retry policy.
    log('error', 'job_threw', { message: String((e && e.message) || e).slice(0, 200), ms: Date.now() - started });
    context.closeWithFailure();
  } finally {
    clearTimeout(timer);
  }
};
