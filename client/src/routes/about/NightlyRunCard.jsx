// /about — nightly-run observability (backlog row 150) and the function-health
// card (row 163).
//
//   GET /meta/nightly       → { nightly:{refreshedAt, details}, ageHours, lastJob|null,
//                               scheduler:{cron, jobsEnabled, pool, retries, retryIntervalSec, mode}, dataMode }
//   GET /meta/observability → { window, requests, errors5xx, errorRatePct, p50Ms, p95Ms, maxMs,
//                               routes[{route,count,avgMs,maxMs,errors}], uptimeSec, apm, logs }
//   POST /admin/jobs/nightly-refresh (admin) → the job record (mode 'job' | 'inline')
//
// Catalyst APM / Logs have no SDK read path, so the health card is the
// function measuring itself and says so on the card.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import ChartTable from '../../components/ChartTable.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { apiGet, API_BASE } from '../../lib/api.js';
import { useT } from '../../lib/i18n.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { PanelState } from './bits.jsx';

const str = (v) => (v === undefined || v === null ? '' : String(v));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

export function useNightly() {
  return useQuery({ queryKey: ['meta-nightly'], queryFn: ({ signal }) => apiGet('/meta/nightly', {}, { signal }).then((r) => ({ ...(r.data || {}), meta: r.meta || {} })), retry: 0, staleTime: 60 * 1000 });
}
export function useObservability() {
  return useQuery({ queryKey: ['meta-observability'], queryFn: ({ signal }) => apiGet('/meta/observability', {}, { signal }).then((r) => r.data || {}), retry: 0, staleTime: 30 * 1000 });
}

function ageStatus(h) {
  if (h === null) return 'nodata';
  if (h <= 1) return 'stable';
  if (h <= 36) return 'stable';
  if (h <= 96) return 'watch';
  return 'rising';
}

function readToken() {
  try { return sessionStorage.getItem('dappa-demo-token') || ''; } catch { return ''; }
}

function fmtDuration(ms, t) {
  const n = num(ms);
  if (n === null) return '—';
  if (n < 1000) return t('surfaces.ms', { n: fmtInt(n) });
  if (n < 120000) return t('surfaces.seconds', { n: Math.round(n / 1000) });
  return t('surfaces.minutes', { n: Math.round(n / 60000) });
}

export default function NightlyRunCard() {
  const t = useT();
  const toast = useToast();
  const q = useNightly();
  const o = useObservability();
  const [running, setRunning] = useState(false);
  const d = q.data || {};
  const nightly = d.nightly || null;
  const job = d.lastJob || null;
  const sched = d.scheduler || {};
  const age = num(d.ageHours);

  const runNow = async () => {
    const token = readToken();
    if (!token) { toast.info(t('surfaces.nightly.runNeedsAuth')); return; }
    setRunning(true);
    try {
      const res = await fetch(`${API_BASE}/admin/jobs/nightly-refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ trigger: 'about-card' }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error((json && json.error && json.error.message) || `HTTP ${res.status}`);
      toast.success(t('surfaces.nightly.runDone', { mode: t(`surfaces.nightly.job.mode.${json.data.mode}`), status: str(json.data.status) }));
      q.refetch();
    } catch (e) {
      toast.error(`${t('surfaces.nightly.error')}: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  const obs = o.data || {};
  const routeRows = (obs.routes || []).map((r) => [r.route, fmtInt(r.count), fmtInt(r.avgMs), fmtInt(r.maxMs), fmtInt(r.errors)]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <Card
        title={t('surfaces.nightly.title')}
        subtitle={t('surfaces.nightly.sub')}
        actions={(
          <button type="button" className="btn min-h-[40px] no-print" onClick={runNow} disabled={running || q.isLoading}>
            {running ? t('surfaces.nightly.running') : t('surfaces.nightly.run')}
          </button>
        )}
      >
        <PanelState isLoading={q.isLoading} error={q.error} retry={() => q.refetch()} skeletonHeight={200}>
          <p className="text-sm text-ink mb-3">{t('surfaces.nightly.plain')}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted">{t('surfaces.nightly.lastRefresh')}</dt>
            <dd className="num text-ink">{nightly && nightly.refreshedAt ? dateLabel(nightly.refreshedAt) : t('surfaces.nightly.noRefresh')}</dd>
            <dt className="text-muted">{t('surfaces.nightly.age')}</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <StatusPill status={ageStatus(age)} label={age === null ? undefined : age <= 1 ? t('surfaces.nightly.ageFresh') : t('surfaces.nightly.ageHours', { h: fmtInt(Math.round(age)) })} />
              <Badge tone={d.dataMode === 'live' ? 'teal' : 'slate'}>{t(`surfaces.nightly.dataMode.${d.dataMode || 'live'}`)}</Badge>
            </dd>
            <dt className="text-muted">{t('surfaces.nightly.scheduler')}</dt>
            <dd className="text-ink">
              {t(`surfaces.nightly.mode.${sched.mode || 'cron-only'}`)}
              <span className="block text-[10px] text-muted font-mono">{str(sched.cron)}{sched.pool ? ` · pool ${sched.pool}` : ''}</span>
            </dd>
            <dt className="text-muted">{t('surfaces.nightly.retries')}</dt>
            <dd className="num text-ink">{fmtInt(sched.retries || 0)} · {t('surfaces.nightly.retryInterval')} {fmtDuration((sched.retryIntervalSec || 0) * 1000, t)}</dd>
            <dt className="text-muted">{t('surfaces.nightly.lastJob')}</dt>
            <dd className="text-ink">
              {job ? (
                <span className="space-y-1 block">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={job.mode === 'job' ? 'teal' : 'slate'}>{t(`surfaces.nightly.job.mode.${job.mode}`)}</Badge>
                    <StatusPill status={/success/i.test(str(job.status)) ? 'stable' : /fail/i.test(str(job.status)) ? 'rising' : 'watch'} label={str(job.status)} />
                  </span>
                  <span className="block text-[10px] text-muted num">
                    {t('surfaces.nightly.job.duration')} {fmtDuration(job.executionMs, t)} · {t('surfaces.nightly.job.retried')} {fmtInt(job.retriedCount || 0)} · {t('surfaces.nightly.job.steps')} {(job.steps || []).map((s) => `${s.name}:${s.status}`).join(' ')}
                  </span>
                </span>
              ) : t('surfaces.nightly.noJob')}
            </dd>
          </dl>
          {nightly && nightly.details && (
            <details className="mt-3 text-[11px] text-muted">
              <summary className="cursor-pointer min-h-[32px] flex items-center">{t('surfaces.nightly.details')}</summary>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px]">{JSON.stringify(nightly.details, null, 1)}</pre>
            </details>
          )}
          <p className="mt-2 text-[10px] text-muted">{t('surfaces.source.label')}: <span className="font-mono">{str(d.meta && d.meta.source) || '—'}</span></p>
        </PanelState>
      </Card>

      <Card title={t('surfaces.obs.title')} subtitle={t('surfaces.obs.sub', { n: fmtInt((obs.window && obs.window.size) || 500) })}>
        <PanelState isLoading={o.isLoading} error={o.error} retry={() => o.refetch()} skeletonHeight={200}>
          <p className="text-sm text-ink mb-3">{t('surfaces.obs.plain')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              ['requests', fmtInt(obs.requests || 0)],
              ['p50', fmtDuration(obs.p50Ms, t)],
              ['p95', fmtDuration(obs.p95Ms, t)],
              ['errorRate', `${num(obs.errorRatePct) === null ? '—' : obs.errorRatePct}%`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-grid bg-base/40 px-3 py-2">
                <div className="num text-base font-semibold text-ink">{v}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted">{t(`surfaces.obs.${k}`)}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-2 text-[11px] text-muted">
            <Badge tone={obs.apm && obs.apm.available ? 'teal' : 'slate'}>{t(obs.apm && obs.apm.available ? 'surfaces.obs.apmOn' : 'surfaces.obs.apmPending')}</Badge>
            <span>{t('surfaces.obs.uptime')}: <span className="num">{fmtDuration((obs.uptimeSec || 0) * 1000, t)}</span></span>
          </div>
          {routeRows.length > 0 && (
            <ChartTable
              caption={t('surfaces.obs.routes')}
              table={{ columns: [t('surfaces.obs.col.route'), t('surfaces.obs.col.count'), t('surfaces.obs.col.avg'), t('surfaces.obs.col.max'), t('surfaces.obs.col.errors')], rows: routeRows }}
              visible
            />
          )}
          <p className="mt-2 text-[10px] text-muted">{t('surfaces.obs.apmNote')}</p>
        </PanelState>
      </Card>
    </div>
  );
}
