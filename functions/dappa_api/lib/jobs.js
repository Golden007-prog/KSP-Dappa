'use strict';
// Catalyst Job Scheduling — the nightly-refresh path that replaces Circuits
// in the IN data centre (docs/DECISIONS.md D-019).
//
// Real path : ctx.services.jobs.submit(meta) -> capp.jobScheduling().job()
//             .submitJob({ job_name, jobpool_name, target_type:'Function',
//             target_name:'dappa_nightly', params, job_config:{ number_of_retries,
//             retry_interval } }) (3.4.0 lib/job-scheduling/job.d.ts +
//             types.d.ts ICatalystFunctionJob); status via .get(jobId) ->
//             { job_id, job_status: Submitted|Pending|Running|Successful|Failure,
//               start_time, end_time, execution_time, retried_count }.
// Flag      : FEATURE_JOBS + JOB_POOL_NAME (a job pool is created in the
//             console; its name cannot be inferred from code).
// Fallback  : the identical aggregate -> detect-anomalies -> notify steps run
//             inline through lib/circuits.js runInline, so /admin/jobs/*
//             renders one shape whichever path ran.

const circuits = require('./circuits');
const { logJson } = require('./util');

const LAST_KEY = 'v1:jobs:last';
const JOB_TTL_SEC = 24 * 3600;
const MAX_TRACKED = 20;
const TARGET_FUNCTION = 'dappa_nightly';
// A Function job pool can only invoke a function whose deployment type is
// `job`, so the pool target is NOT the cron-typed dappa_nightly: submitting to
// that fails with "The given function is not a job function." and silently
// falls back inline. functions/dappa_job is the job-typed shim; it calls back
// into /admin/jobs/run-inline so the steps have one implementation.
const JOB_FUNCTION = String(process.env.JOB_TARGET_FUNCTION || 'dappa_job');
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_INTERVAL_SEC = 900;

const records = new Map();

function remember(rec) {
  records.set(rec.jobId, rec);
  while (records.size > MAX_TRACKED) records.delete(records.keys().next().value);
  return rec;
}

// Catalyst enforces two rules on job_name that the SDK only reports at submit
// time: "must contain only alphanumeric and underscore" and "within 1-20 char
// length". Both were violated in turn by a hyphenated 22-char name, and both
// failures are invisible in normal use — a rejected submit falls back inline
// with an honest note, so the feature reads as healthy while never once
// reaching the pool. Encoding the constraint here keeps it in one place.
const JOB_NAME_MAX = 20;
const JOB_NAME_RE = /^[A-Za-z0-9_]{1,20}$/;

function jobName(now) {
  const stamp = (now === undefined ? Date.now() : now).toString(36).replace(/[^A-Za-z0-9]/g, '');
  return `nightly_${stamp}`.slice(0, JOB_NAME_MAX);
}

function jobsConfigured(ctx) {
  return Boolean(ctx.flags.jobs && ctx.services.jobs && String(process.env.JOB_POOL_NAME || '').trim());
}

function mapJob(raw, fallback) {
  const j = (raw && (raw.data || raw)) || {};
  return {
    jobId: String(j.job_id || (fallback && fallback.jobId) || ''),
    status: String(j.job_status || (fallback && fallback.status) || 'Submitted').toLowerCase(),
    startedAt: j.start_time || (fallback && fallback.startedAt) || null,
    finishedAt: j.end_time || (fallback && fallback.finishedAt) || null,
    executionMs: j.execution_time !== undefined && j.execution_time !== null ? Number(j.execution_time) : (fallback && fallback.executionMs) || null,
    retriedCount: j.retried_count !== undefined ? Number(j.retried_count) : (fallback && fallback.retriedCount) || 0,
    responseCode: j.response_code === undefined ? null : j.response_code,
    jobpool: (j.job_meta_details && (j.job_meta_details.jobpool_name || j.job_meta_details.jobpool_id)) || (fallback && fallback.jobpool) || null
  };
}

/**
 * Submit the nightly refresh as a Catalyst job (retries + console dashboard),
 * or run it inline when the flag/pool is not configured.
 */
async function submitNightly(ctx, opts) {
  const o = opts || {};
  const pool = String(process.env.JOB_POOL_NAME || '').trim();
  if (jobsConfigured(ctx)) {
    const meta = {
      job_name: jobName(),
      jobpool_name: pool,
      target_type: 'Function',
      target_name: JOB_FUNCTION,
      params: { trigger: String(o.trigger || 'api'), send: String(Boolean(o.send)) },
      job_config: {
        number_of_retries: Number(process.env.JOB_RETRIES || DEFAULT_RETRIES),
        retry_interval: Number(process.env.JOB_RETRY_INTERVAL_SEC || DEFAULT_RETRY_INTERVAL_SEC)
      }
    };
    try {
      const out = await ctx.services.jobs.submit(meta);
      const job = mapJob(out, { jobpool: pool });
      const rec = Object.assign({
        mode: 'job',
        target: JOB_FUNCTION,
        submittedAt: new Date().toISOString(),
        request: meta,
        steps: circuits.STEPS.map((name) => ({ name, status: 'delegated' })),
        source: 'catalyst-jobs'
      }, job);
      remember(rec);
      await ctx.cache.put(LAST_KEY, rec, JOB_TTL_SEC).catch(() => {});
      await ctx.cache.put(`v1:jobs:${rec.jobId}`, rec, JOB_TTL_SEC).catch(() => {});
      logJson('info', 'job_submitted', { jobId: rec.jobId, pool });
      return rec;
    } catch (e) {
      logJson('warn', 'job_submit_failed', { message: String((e && e.message) || e) });
      const inline = await runInlineAsJob(ctx, o);
      inline.note = `Job submission failed (${String((e && e.message) || e).slice(0, 160)}); ran the same steps inline.`;
      return inline;
    }
  }
  const inline = await runInlineAsJob(ctx, o);
  inline.note = ctx.flags.jobs && !pool
    ? 'FEATURE_JOBS is on but JOB_POOL_NAME is unset (the job pool is created in the console); ran inline.'
    : ctx.flags.jobs ? 'Job Scheduling handle unavailable in this runtime; ran inline.' : 'FEATURE_JOBS off; ran the same steps inline.';
  return inline;
}

async function runInlineAsJob(ctx, o) {
  const exec = await circuits.runInline(ctx, o);
  const rec = {
    jobId: exec.executionId,
    mode: 'inline',
    target: TARGET_FUNCTION,
    status: exec.status === 'success' ? 'successful' : 'failure',
    submittedAt: exec.startedAt,
    startedAt: exec.startedAt,
    finishedAt: exec.finishedAt,
    executionMs: Date.parse(exec.finishedAt) - Date.parse(exec.startedAt),
    retriedCount: 0,
    responseCode: null,
    jobpool: null,
    steps: exec.steps,
    source: 'fallback-local'
  };
  remember(rec);
  await ctx.cache.put(LAST_KEY, rec, JOB_TTL_SEC).catch(() => {});
  await ctx.cache.put(`v1:jobs:${rec.jobId}`, rec, JOB_TTL_SEC).catch(() => {});
  return rec;
}

/** Live job status when possible, else the stored record. */
async function getJob(ctx, jobId) {
  const id = String(jobId || '');
  const local = records.get(id) || (await ctx.cache.get(`v1:jobs:${id}`).catch(() => undefined) || {}).value || null;
  if (local && local.mode === 'job' && jobsConfigured(ctx) && ctx.services.jobs.get) {
    try {
      const live = await ctx.services.jobs.get(id);
      return Object.assign({}, local, mapJob(live, local), { source: 'catalyst-jobs', checkedAt: new Date().toISOString() });
    } catch (e) { /* stored record */ }
  }
  return local;
}

/** Most recent run in this container (or the cache), refreshed live if a job. */
async function lastRun(ctx) {
  const newest = [...records.values()].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)))[0]
    || (await ctx.cache.get(LAST_KEY).catch(() => undefined) || {}).value || null;
  if (!newest) return null;
  return getJob(ctx, newest.jobId) || newest;
}

/** Job pools visible to the SDK (console-created); [] with a note otherwise. */
async function listPools(ctx) {
  if (!ctx.flags.jobs || !ctx.services.jobs || !ctx.services.jobs.pools) {
    return { pools: [], source: 'fallback-local', note: ctx.flags.jobs ? 'Job Scheduling handle unavailable in this runtime' : 'FEATURE_JOBS off' };
  }
  try {
    const raw = await ctx.services.jobs.pools();
    const pools = (raw || []).map((p) => ({ id: String(p.id || ''), name: p.name || null, type: p.type || null, capacity: p.capacity || null }));
    return { pools, source: 'catalyst-jobs' };
  } catch (e) {
    return { pools: [], source: 'fallback-local', error: String((e && e.message) || e).slice(0, 200) };
  }
}

/** Test hook. */
function resetJobs() {
  records.clear();
}

module.exports = { submitNightly, runInlineAsJob, getJob, lastRun, listPools, jobsConfigured, mapJob, resetJobs, jobName, JOB_NAME_RE, TARGET_FUNCTION, JOB_FUNCTION, LAST_KEY };
