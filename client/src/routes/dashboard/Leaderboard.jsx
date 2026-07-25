// District leaderboard — top risers / top fallers by month-over-month change.
// Rows come from the district-unfiltered geo query so the ranking always shows
// the whole state; clicking a row toggles that district into the global filter.
// Props: rows ([{districtId, districtName, caseCount, momDeltaPct, alert}]),
// loading, activeDistrictId, onPick(districtId, districtName).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import PulseDot from '../../components/PulseDot.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';

const SHOW = 6;

export default function Leaderboard({ rows = [], loading = false, activeDistrictId = '', onPick, linkSearch = '' }) {
  const t = useT();
  const tName = useNames();
  const [mode, setMode] = useState('risers');

  const ranked = useMemo(() => {
    if (mode === 'busiest') {
      return [...rows].sort((a, b) => (b.caseCount || 0) - (a.caseCount || 0)).slice(0, SHOW);
    }
    const movers = rows.filter((r) => Number.isFinite(Number(r.momDeltaPct)));
    const sorted = [...movers].sort((a, b) => (mode === 'risers'
      ? Number(b.momDeltaPct) - Number(a.momDeltaPct)
      : Number(a.momDeltaPct) - Number(b.momDeltaPct)));
    return sorted.slice(0, SHOW);
  }, [rows, mode]);

  if (loading) return <LoadingSkeleton lines={6} />;
  if (!ranked.length) {
    return (
      <EmptyState
        compact
        title={t('dashboard.leaderboard.empty')}
        message={t('dashboard.leaderboard.emptyHint')}
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SegmentedControl
          ariaLabel={t('dashboard.leaderboard.dirAria')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'risers', label: t('dashboard.leaderboard.risers') },
            { value: 'fallers', label: t('dashboard.leaderboard.fallers') },
            { value: 'busiest', label: t('dashboard.leaderboard.busiest') },
          ]}
        />
        <Link to={`/map${linkSearch}`} className="inline-flex min-h-[40px] items-center px-1 text-xs text-amber hover:underline shrink-0">{t('dashboard.link.map')}</Link>
      </div>
      <ol className="divide-y divide-grid/50">
        {ranked.map((r, i) => {
          const active = String(r.districtId) === String(activeDistrictId);
          const name = tName('districts', r.districtId, r.districtName || r.districtId) || String(r.districtId);
          return (
            <li key={r.districtId}>
              <button
                type="button"
                onClick={() => onPick?.(active ? '' : r.districtId, r.districtName)}
                aria-pressed={active}
                title={active
                  ? t('dashboard.leaderboard.clearTitle')
                  : t('dashboard.leaderboard.filterTitle', { name })}
                className={`flex w-full min-h-[44px] items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors ${
                  active ? 'bg-amber/10' : 'hover:bg-grid/30'
                }`}
              >
                <span className="num w-5 shrink-0 text-center text-[11px] text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{name}</span>
                {r.alert && <PulseDot />}
                <span className="num shrink-0 text-xs text-muted">{fmtInt(r.caseCount)}</span>
                <StatDelta value={Number(r.momDeltaPct)} positiveIsGood={false} className="w-16 justify-end" />
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-[10px] text-muted">{t('dashboard.leaderboard.footnote')}</p>
    </div>
  );
}
