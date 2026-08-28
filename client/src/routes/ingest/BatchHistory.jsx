// Batch history — what this API container remembers (2-hour TTL, said so on
// screen). Each row: id, table, status pill, counts, storage, resume token.
import Badge from '../../components/Badge.jsx';
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, dateLabel } from '../../lib/format.js';
import { useIngestBatches, rejectionsUrl, isStaticDemo } from './ingestApi.js';
import { batchStatus } from './codes.js';

export default function BatchHistory({ className = '' }) {
  const t = useT();
  const q = useIngestBatches(!isStaticDemo);
  const list = q.data || [];
  return (
    <Card title={t('ingest.history.title')} subtitle={t('ingest.history.sub')} className={className} actions={
      <button type="button" className="btn !px-2.5 !text-xs min-h-[44px] sm:min-h-[30px]" onClick={() => q.refetch()} disabled={q.isFetching || isStaticDemo}>{t('ingest.history.refresh')}</button>
    }>
      {isStaticDemo ? (
        <EmptyState compact title={t('ingest.history.staticTitle')} message={t('ingest.history.staticMessage')} />
      ) : q.isLoading ? (
        <LoadingSkeleton lines={3} />
      ) : q.isError ? (
        <EmptyState compact title={t('ingest.history.errorTitle')} message={q.error && q.error.message} action={<button type="button" className="btn" onClick={() => q.refetch()}>{t('common.action.retry')}</button>} />
      ) : !list.length ? (
        <EmptyState compact title={t('ingest.history.emptyTitle')} message={t('ingest.history.emptyMessage')} />
      ) : (
        <ul className="divide-y divide-grid/60" role="list">
          {list.map((b) => (
            <li key={b.batchId} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <StatusPill status={batchStatus(b.status)} label={t(`ingest.status.${b.status}`)} />
              <span className="num text-xs text-muted">{b.batchId}</span>
              <span className="font-medium text-ink">{b.table}</span>
              {b.counts && <span className="num text-xs text-muted">{t('ingest.history.counts', { a: fmtInt(b.counts.accepted), r: fmtInt(b.counts.rejected), n: fmtInt(b.counts.rows) })}</span>}
              {b.storage && <Badge tone={b.storage === 'datastore' ? 'teal' : 'amber'}>{t(`ingest.storage.${b.storage}`)}</Badge>}
              {b.updatedAt && <span className="num text-xs text-muted">{dateLabel(b.updatedAt)}</span>}
              {b.resumeToken && <span className="num text-[11px] text-muted">{t('ingest.load.resume')} {b.resumeToken}</span>}
              {b.counts && b.counts.rejected > 0 && b.status !== 'receiving' && (
                <a className="text-xs text-primary underline underline-offset-2 min-h-[24px]" href={rejectionsUrl(b.batchId)} download={`${b.batchId}_rejections.csv`}>{t('ingest.history.rejections')}</a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
