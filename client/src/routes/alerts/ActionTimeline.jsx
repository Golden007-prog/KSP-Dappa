// /alerts — the decisions recorded on one alert, oldest first, from
// GET /alerts/:key/actions. Every row names the engine that holds it
// (Data Store · demo fixture · this session) and seeded demo rows say so.
// Status = colour + glyph + word through StatusPill; nothing is colour-only.
import StatusPill from '../../components/StatusPill.jsx';
import { useT } from '../../lib/i18n.jsx';

/** action type → StatusPill status (the glyph carries the meaning on a mono printer). */
export const ACTION_STATUS = {
  acknowledge: 'stable',
  assign: 'watch',
  escalate: 'rising',
  dismiss: 'nodata',
  note: 'stable',
  outcome: 'stable',
};

/** Per-row engine word. Anything the server does not name is 'this session' —
 * a row with no known engine is never presented as the Data Store's. */
export const ROW_SOURCE = { datastore: 'datastore', fixture: 'fixture', memory: 'memory' };

/** ms epoch / ISO → '24 Jul, 14:05' in the active locale, never a raw number. */
export function stamp(ts, lang) {
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(String(ts || '')));
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(lang === 'kn' ? 'kn-IN' : 'en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** One-line description of a recorded action in the active language. */
export function describeAction(x, t) {
  const type = String(x.actionType || '').toLowerCase();
  const word = t(ACTION_STATUS[type] ? `actions.done.${type}` : 'actions.done.other');
  if (type === 'escalate' && x.toTier) return `${word} ${t('actions.escalate.to', { tier: t(`actions.tier.${x.toTier}`) })}`;
  if (type === 'assign' && x.assignTo) return `${word} → ${x.assignTo}`;
  if (type === 'dismiss' && x.reason) return `${word} — ${t(`actions.reason.short.${x.reason}`)}`;
  if (type === 'outcome' && x.outcomeLabel) return `${word}: ${t(`actions.outcome.${x.outcomeLabel}`)}`;
  return word;
}

export default function ActionTimeline({ query, lang = 'en', compact = false }) {
  const t = useT();
  if (!query) return null;
  if (query.isLoading) return <p className="text-xs text-muted" aria-busy="true">{t('actions.timeline.loading')}</p>;
  if (query.error) return <p className="text-xs text-signal" role="alert">{t('actions.timeline.error')}</p>;
  const rows = query.data?.timeline || [];
  const source = query.data?.meta?.storage || 'memory';
  return (
    <div className="space-y-1.5" data-readable="true">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('actions.timeline.title')}</span>
        <span className="num text-[11px] text-muted">{t('actions.timeline.count', { n: rows.length })}</span>
        <span className="text-[10px] text-muted/80">· {t('actions.timeline.readFrom', { engine: t(`actions.timeline.source.${source}`) })}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{t('actions.timeline.empty')}</p>
      ) : (
        <ol className="space-y-1">
          {(compact ? rows.slice(-6) : rows).map((x) => (
            <li key={x.actionId} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 rounded-lg border border-grid/60 px-2 py-1.5 text-xs">
              <StatusPill status={ACTION_STATUS[String(x.actionType).toLowerCase()] || 'nodata'} label={t(ACTION_STATUS[String(x.actionType).toLowerCase()] ? `actions.type.${String(x.actionType).toLowerCase()}` : 'actions.done.other')} />
              <span className="min-w-0 flex-1 text-ink">
                {describeAction(x, t)}
                {x.note && x.note !== x.reason && <span className="text-muted"> — {x.note}</span>}
              </span>
              <span className="num shrink-0 text-[11px] text-muted">
                {stamp(x.ts ?? x.clientTs, lang)} · {t('actions.timeline.by', { who: x.actor || '—' })}
                {x.actorRole ? ` (${x.actorRole})` : ''}
                {x.seeded && <span className="ml-1 rounded bg-grid/40 px-1 text-[10px] uppercase tracking-wide">{t('actions.timeline.seeded')}</span>}
                {/* Each row names the engine that holds IT. The header label is
                    the list's read source; a memory-only row under a Data Store
                    header used to read as if the Data Store held it. */}
                <span
                  className="ml-1 rounded bg-grid/30 px-1 text-[10px] tracking-wide"
                  data-row-source={ROW_SOURCE[x.source] || 'memory'}
                  title={t('actions.timeline.heldBy', { engine: t(`actions.timeline.source.${ROW_SOURCE[x.source] || 'memory'}`) })}
                >
                  {t(`actions.timeline.source.${ROW_SOURCE[x.source] || 'memory'}`)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
