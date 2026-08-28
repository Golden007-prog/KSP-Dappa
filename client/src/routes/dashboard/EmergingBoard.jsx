// Emerging & cooling crime patterns (C4) — /insight/emerging compares each
// sub-head's last-3-month average against its prior-9-month baseline over the
// same 12 months, so a category that quietly doubled inside a flat statewide
// total still surfaces. Rows the server flags emerging (growth ≥ 15 %) carry a
// pulsing red badge; that same set feeds the choropleth's red-zone pulse.
//
// Props: query (useEmerging result), linkSearch, onPickHead?(crimeHeadId),
//        activeHeadId
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtNum, fmtPct, monthLabel } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { useLocalPref } from './lib.js';
import { volatilityPct } from './analytics.js';

const SHOW = 5;

/** 12-point trend spark, drawn inline so a row costs no chart instance. */
function Spark({ values = [], tone = 'amber' }) {
  const pts = (values || []).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
  if (pts.length < 2) return null;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = max - min || 1;
  const w = 64;
  const h = 18;
  const d = pts
    .map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / span) * (h - 3) - 1.5}`)
    .join(' ');
  // currentColor + a Tailwind text class keeps the spark theme-aware in both
  // light and dark without duplicating the palette here.
  const cls = tone === 'red' ? 'text-signal' : tone === 'teal' ? 'text-teal' : 'text-amber';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`shrink-0 ${cls}`} aria-hidden="true" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

export default function EmergingBoard({ query, linkSearch = '', onPickHead, activeHeadId }) {
  const t = useT();
  const tName = useNames();
  const [dir, setDir] = useLocalPref('dappa-dash-emerging-dir', 'rising');

  const data = query.data;
  const list = useMemo(() => {
    const src = dir === 'falling' ? data?.falling : data?.rising;
    return (src || []).slice(0, SHOW);
  }, [data, dir]);

  const emergingCount = useMemo(
    () => (data?.rising || []).filter((m) => m.emerging).length,
    [data],
  );

  const dirOptions = useMemo(() => ([
    { value: 'rising', label: t('dashboard.emerging.rising') },
    { value: 'falling', label: t('dashboard.emerging.falling') },
  ]), [t]);

  if (query.isLoading) return <LoadingSkeleton lines={6} />;
  if (query.error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.emerging.error')}
        message={query.error.message}
        action={<button type="button" className="btn" onClick={() => query.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }
  if (!data || (!data.rising?.length && !data.falling?.length)) {
    return <EmptyState compact title={t('dashboard.emerging.empty')} message={t('dashboard.emerging.emptyHint')} />;
  }

  const maxGrowth = Math.max(1e-9, ...list.map((m) => Math.abs(Number(m.growthPct) || 0)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          ariaLabel={t('dashboard.emerging.dirAria')}
          value={dir === 'falling' ? 'falling' : 'rising'}
          onChange={setDir}
          options={dirOptions}
          className="shrink-0"
        />
        {emergingCount > 0 && (
          <Badge tone="red" pulse className="shrink-0">
            {t('dashboard.emerging.flagged', { n: emergingCount })}
          </Badge>
        )}
      </div>

      {data.fromYm && data.anchorYm && (
        <p className="text-[11px] text-muted">
          {t('dashboard.emerging.window', {
            from: monthLabel(data.fromYm),
            to: monthLabel(data.anchorYm),
          })}
        </p>
      )}

      {!list.length ? (
        <EmptyState
          compact
          title={t(dir === 'falling' ? 'dashboard.emerging.noFalling' : 'dashboard.emerging.noRising')}
          message={t('dashboard.emerging.emptyHint')}
        />
      ) : (
        <ol className="divide-y divide-grid/50">
          {list.map((m, i) => {
            const growth = Number(m.growthPct) || 0;
            const up = growth >= 0;
            const label = tName('crimeSubHeads', m.subHeadId, m.subHeadName) || m.subHeadName;
            const head = tName('crimeHeads', m.headId, m.headName) || m.headName || '';
            const vol = volatilityPct(m.spark);
            const active = activeHeadId != null && String(activeHeadId) === String(m.headId);
            return (
              <li key={m.subHeadId ?? i}>
                <div className={`flex min-h-[52px] items-center gap-2 rounded-lg px-1.5 py-2 transition-colors hover:bg-grid/30 ${active ? 'bg-amber/5' : ''}`}>
                  <span className="num w-4 shrink-0 text-center text-[11px] text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPickHead?.(m.headId)}
                        title={t('dashboard.emerging.rowTitle', { name: label })}
                        className="min-w-0 truncate text-left text-xs text-ink hover:text-amber"
                      >
                        {label}
                      </button>
                      {m.emerging && (
                        <Badge tone="red" pulse className="shrink-0">{t('dashboard.emerging.badge')}</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {head && <span className="truncate text-[10px] text-muted">{head}</span>}
                      <span className="num shrink-0 text-[10px] text-muted">
                        {t('dashboard.emerging.avgs', {
                          recent: fmtNum(m.recentAvg, 1),
                          base: fmtNum(m.baselineAvg, 1),
                        })}
                      </span>
                      {vol !== null && (
                        <span className="num shrink-0 rounded-full border border-grid bg-canvas/50 px-1.5 text-[9px] text-muted">
                          {t('dashboard.emerging.vol', { pct: fmtNum(vol, 0) })}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-grid/50" aria-hidden="true">
                      <span
                        className={`block h-full rounded-full ${up ? 'bg-signal/80' : 'bg-teal/80'}`}
                        style={{ width: `${Math.max(6, Math.round((Math.abs(growth) / maxGrowth) * 100))}%` }}
                      />
                    </span>
                  </span>
                  <Spark values={m.spark} tone={m.emerging ? 'red' : up ? 'amber' : 'teal'} />
                  <Link
                    to={`/trends${linkSearch}`}
                    title={t('dashboard.emerging.openTrends')}
                    className={`num shrink-0 text-xs font-semibold ${up ? 'text-signal' : 'text-teal'}`}
                  >
                    {fmtPct(growth, { sign: true, digits: 1 })}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-[10px] text-muted">{t('dashboard.emerging.footnote')}</p>
    </div>
  );
}
