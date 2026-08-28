// The accountability rules as the API returns them (GET /identify/rules) —
// wording in the officer's language, the enforcement point in English because
// it names code, plus the fixed list of legal bases with their citations.
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import Badge from '../../components/Badge.jsx';
import { useFaceRules } from '../../lib/faceApi.js';
import { useT } from '../../lib/i18n.jsx';

export default function RulesList() {
  const t = useT();
  const q = useFaceRules();
  if (q.isLoading) return <Card title={t('identify.rules.title')}><LoadingSkeleton lines={8} /></Card>;
  if (q.error) return <Card title={t('identify.rules.title')}><EmptyState compact title={t('common.state.error')} message={q.error.message} action={<button type="button" className="btn min-h-[44px]" onClick={() => q.refetch()}>{t('common.action.retry')}</button>} /></Card>;
  const d = q.data;
  return (
    <div className="space-y-4">
      <Card
        title={t('identify.rules.title')}
        subtitle={t('identify.rules.subtitle')}
        actions={(
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={d.engines.on ? 'teal' : 'slate'}>{d.engines.flag} {d.engines.on ? 'on' : 'off'}</Badge>
            <Badge tone="slate" className="num">{t('identify.result.floor', { floor: Math.round((d.floor || 0.7) * 100) })}</Badge>
            <Badge tone="slate" className="num">{t('identify.rules.maxShortlist', { n: d.limits.maxShortlist || 25 })}</Badge>
          </div>
        )}
      >
        <ol className="space-y-3">
          {d.rules.map((r) => (
            <li key={r.id} className="rounded-lg border border-grid bg-canvas/50 px-3 py-2.5">
              <p className="text-sm font-semibold text-ink"><span className="num text-muted mr-2">{r.id}</span>{t(`identify.rules.${r.id}.title`)}</p>
              <p className="text-xs text-ink mt-1 leading-snug">{t(`identify.rules.${r.id}.statement`)}</p>
              <p className="text-[11px] text-muted mt-1"><span className="uppercase tracking-wide text-[10px]">{t('identify.rules.enforced')}:</span> {r.enforcedBy}</p>
            </li>
          ))}
        </ol>
      </Card>
      <Card title={t('identify.rules.legal')} subtitle={t('identify.rules.legalSub')}>
        <ul className="divide-y divide-grid/50">
          {d.legalBases.map((b) => (
            <li key={b.id} className="py-2 first:pt-0 last:pb-0">
              <p className="text-sm text-ink">{t(`identify.basis.${b.id}`)}</p>
              <p className="text-[11px] text-muted">{b.cite}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
