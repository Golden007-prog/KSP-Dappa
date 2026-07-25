// Watchlist panel for the Network sidebar — starred people from any route
// (Offenders registry, Offender 360, node drawer). Members present in the
// current view fly-to on click; the rest stay listed muted so the analyst can
// unstar them or adjust filters to bring them back.
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useWatchlist } from '../offenders/watchlistStore.js';

export default function WatchlistPanel({ nodesById = new Map(), onPick }) {
  const t = useT();
  const { list, toggle } = useWatchlist();
  if (!list.length) return null;

  return (
    <Card
      title={t('network.watch.title')}
      subtitle={t('network.watch.subtitle')}
      padded={false}
      actions={<Badge tone="amber">{fmtInt(list.length)}</Badge>}
    >
      <ul className="divide-y divide-grid/50">
        {list.map((w) => {
          const n = nodesById.get(String(w.key));
          return (
            <li key={w.key} className="flex items-center gap-1 px-4">
              <button
                type="button"
                disabled={!n}
                onClick={() => n && onPick?.(n)}
                className={`flex-1 min-w-0 min-h-[44px] flex items-center gap-2 text-left transition-colors ${n ? 'hover:text-amber' : 'cursor-default'}`}
                title={n ? t('network.watch.pickHint') : t('network.watch.notInView')}
              >
                <span className="text-amber shrink-0" aria-hidden="true">★</span>
                <span className={`text-xs truncate flex-1 min-w-0 ${n ? 'text-ink' : 'text-muted'}`}>{w.name || w.key}</span>
                {!n && <span className="text-[10px] text-muted shrink-0">{t('network.watch.notInViewShort')}</span>}
              </button>
              <button
                type="button"
                className="flex h-9 w-8 shrink-0 items-center justify-center text-muted hover:text-signal transition-colors"
                onClick={() => toggle(w.key, w.name)}
                aria-label={t('network.watch.removeAria', { name: w.name || w.key })}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
