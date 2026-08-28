// Step 5 — load. Only accepted rows, in chunks of 200, with the resume token
// followed until done. Needs the District or State tier (the switcher is
// honoured — a Beat/Station tier is told what to do, not silently allowed)
// or the admin token, which is also what turns memory storage into a real
// Data Store write on the deployed API.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Badge from '../../components/Badge.jsx';
import Card from '../../components/Card.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { useT } from '../../lib/i18n.jsx';
import { useTier } from '../../lib/tier.js';
import { fmtInt } from '../../lib/format.js';
import { useToast } from '../../components/ToastProvider.jsx';
import WhatChangedCard from './WhatChangedCard.jsx';
import { loadBatch, rollbackBatch, writeHeaders, readAdminToken, saveAdminToken, isStaticDemo } from './ingestApi.js';
import { batchStatus } from './codes.js';

const ACTOR_KEY = 'dappa-ingest-actor';

export default function LoadStep({ batchId, result, onLoaded }) {
  const t = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const { tier, isAtLeast, setTier } = useTier();
  const [token, setToken] = useState(readAdminToken);
  const [actor, setActor] = useState(() => { try { return localStorage.getItem(ACTOR_KEY) || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const [rolled, setRolled] = useState(null);
  const [error, setError] = useState(null);

  const allowed = isAtLeast('district') || Boolean(token);
  const accepted = result ? result.counts.accepted : 0;
  const blocked = result && result.prerequisites && !result.prerequisites.ok;

  const run = async () => {
    setError(null);
    setBusy(true);
    setLoaded(null);
    setRolled(null);
    try {
      saveAdminToken(token);
      try { localStorage.setItem(ACTOR_KEY, actor); } catch { /* private mode */ }
      const r = await loadBatch({ batchId, headers: writeHeaders(tier, token, actor), onProgress: setProgress });
      setLoaded(r);
      onLoaded && onLoaded(r);
      toast.success(t('ingest.load.done', { n: fmtInt(r.data.inserted), storage: r.data.storage }));
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await rollbackBatch({ batchId, headers: writeHeaders(tier, token, actor) });
      setRolled(r.data);
      qc.invalidateQueries({ queryKey: ['ingest-batches'] });
      toast.info(t('ingest.load.rolledBack', { n: fmtInt(r.data.removed) }));
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pct = loaded ? 100 : progress ? progress.progressPct : 0;

  return (
    <div className="space-y-4">
      {isStaticDemo && <p role="status" className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">{t('ingest.load.staticDemo')}</p>}
      {!allowed && (
        <div className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber flex flex-wrap items-center gap-2">
          <span>{t('ingest.load.tierNeeded', { tier: t(`ingest.tier.${tier}`) })}</span>
          <button type="button" className="btn min-h-[44px] sm:min-h-[32px] !text-xs" onClick={() => setTier('district')}>{t('ingest.load.switchTier')}</button>
        </div>
      )}
      {blocked && <p role="alert" className="text-sm text-signal">{t('ingest.result.orderFirst', { list: result.prerequisites.missing.join(', '), table: result.table })}</p>}

      <Card title={t('ingest.load.title')} subtitle={t('ingest.load.sub', { n: fmtInt(accepted), rejected: fmtInt(result ? result.counts.rejected : 0) })}>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted">
            <span className="block mb-1">{t('ingest.load.actor')}</span>
            <input className="input-dark min-h-[44px] sm:min-h-[36px] w-full" value={actor} onChange={(e) => setActor(e.target.value)} placeholder={t('ingest.load.actorPlaceholder')} maxLength={80} />
          </label>
          <label className="text-xs text-muted">
            <span className="block mb-1">{t('ingest.load.token')}</span>
            <input className="input-dark min-h-[44px] sm:min-h-[36px] w-full" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t('ingest.load.tokenPlaceholder')} autoComplete="off" />
          </label>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{t('ingest.load.storageNote')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary min-h-[44px]" onClick={run} disabled={busy || !allowed || !accepted || blocked || isStaticDemo || Boolean(loaded && loaded.data.done)}>
            {busy ? t('ingest.load.loading') : t('ingest.load.button', { n: fmtInt(accepted) })}
          </button>
          {loaded && loaded.data.done && !rolled && (
            <button type="button" className="btn min-h-[44px] sm:min-h-[36px]" onClick={undo} disabled={busy}>{t('ingest.load.rollback')}</button>
          )}
        </div>
        {(busy || progress || loaded) && (
          <div className="mt-3" aria-live="polite">
            <div className="h-2 rounded bg-grid/60 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={t('ingest.load.progress')}>
              <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 num text-xs text-muted">
              {progress ? t('ingest.load.progressLine', { done: fmtInt(progress.inserted), total: fmtInt(progress.accepted), pct: Math.round(pct) }) : t('ingest.load.starting')}
              {progress && progress.resumeToken ? ` · ${t('ingest.load.resume')} ${progress.resumeToken}` : ''}
            </p>
          </div>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-signal">{error}</p>}
        {loaded && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={batchStatus(rolled ? 'rolled-back' : loaded.data.status)} label={t(`ingest.status.${rolled ? 'rolled-back' : loaded.data.status}`)} size="md" />
            <Badge tone={loaded.data.storage === 'datastore' ? 'teal' : 'amber'}>{t(`ingest.storage.${loaded.data.storage}`)}</Badge>
            {loaded.data.audit && <Badge tone="slate">{t('ingest.load.audit', { source: loaded.data.audit.source })}</Badge>}
            <span className="num text-xs text-muted">{t('ingest.load.counts', { inserted: fmtInt(loaded.data.inserted), rejected: fmtInt(loaded.data.rejected) })}</span>
            {loaded.data.error && <span className="text-xs text-signal">{loaded.data.error}</span>}
          </div>
        )}
        {rolled && <p className="mt-2 text-sm text-ink">{t('ingest.load.rolledBackLine', { n: fmtInt(rolled.removed), storage: t(`ingest.storage.${rolled.storage}`) })}{rolled.note ? ` ${rolled.note}` : ''}</p>}
      </Card>

      {loaded && loaded.data.whatChanged && !rolled && <WhatChangedCard changed={loaded.data.whatChanged} />}
    </div>
  );
}
