// "This month vs last month" comparison strip — total plus per-crime-head
// chips (count + MoM delta, biggest risers first), horizontally scrollable,
// with a direction filter (All / Risers / Fallers).
// Data is computed once in Dashboard.jsx (buildCompareView) so the CSV export
// and this render share the exact same numbers.
// Props: view (null while empty), loading, linkSearch (carries URL filters).
// Items may carry a `label` (the crime head in the active language, added by
// Dashboard); `name` stays the English key the CSV export and lookups use.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import { fmtInt, monthLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

export default function CompareStrip({ view, loading = false, linkSearch = '' }) {
  const t = useT();
  const [dir, setDir] = useState('all');
  if (loading) return <LoadingSkeleton height={54} />;
  if (!view) {
    return (
      <EmptyState
        compact
        title={t('dashboard.compare.notEnough')}
        message={t('dashboard.compare.notEnoughHint')}
      />
    );
  }
  const items = view.items.filter((it) => (
    dir === 'up' ? it.delta > 0 : dir === 'down' ? it.delta < 0 : true
  ));
  return (
    <div className="space-y-2">
      <SegmentedControl
        ariaLabel={t('dashboard.compare.dirAria')}
        value={dir}
        onChange={setDir}
        options={[
          { value: 'all', label: t('dashboard.compare.all') },
          { value: 'up', label: t('dashboard.compare.risers') },
          { value: 'down', label: t('dashboard.compare.fallers') },
        ]}
      />
      <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-0.5">
      <div className="shrink-0 rounded-lg border border-amber/40 bg-amber/5 px-3 py-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted">
          {t('dashboard.compare.allHeads', { cur: monthLabel(view.curYm), prev: monthLabel(view.prevYm) })}
        </p>
        <p className="flex items-baseline gap-2">
          <span className="num text-base font-semibold text-ink">{fmtInt(view.total.cur)}</span>
          <StatDelta value={view.total.delta} positiveIsGood={false} />
        </p>
      </div>
      {items.map((it) => (
        <Link
          key={it.name}
          to={`/trends${linkSearch}`}
          title={t('dashboard.compare.itemTitle', {
            name: it.label || it.name, cur: fmtInt(it.cur), prev: fmtInt(it.prev),
          })}
          className="shrink-0 rounded-lg border border-grid bg-panel px-3 py-1.5 transition-colors hover:border-amber/50"
        >
          <p className="text-[10px] uppercase tracking-wide text-muted truncate max-w-[10rem]">{it.label || it.name}</p>
          <p className="flex items-baseline gap-2">
            <span className="num text-base font-semibold text-ink">{fmtInt(it.cur)}</span>
            <StatDelta value={it.delta} positiveIsGood={false} />
          </p>
        </Link>
      ))}
      {!items.length && (
        <p className="py-2 text-xs text-muted">
          {t(dir === 'up' ? 'dashboard.compare.noRising' : 'dashboard.compare.noFalling')}
        </p>
      )}
      </div>
    </div>
  );
}
