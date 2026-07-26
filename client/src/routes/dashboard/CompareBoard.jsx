// Multi-district compare board (C1/C4) — up to four districts on one axis,
// each fetched independently from /trends/monthly so adding a fourth district
// costs exactly one request and the other three stay warm in cache.
//
// Two modes matter operationally. ABSOLUTE answers "who carries the load";
// INDEXED rebases every district to 100 at the window's first month, which is
// the only way to see that a 400-case district is growing twice as fast as a
// 3,000-case one. The metric switch reads heinousCount straight off the raw
// rows — a column the shared trends normalizer discards.
//
// Props: districts ([{districtId, districtName}] from /meta/lookups),
//        defaultIds, baseParams, loading, onPickDistrict?, activeDistrictId
import { useEffect, useMemo, useState } from 'react';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import DashChart from './DashChart.jsx';
import { fmtInt, fmtNum, fmtPct, monthLabel } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { useLocalPref, useMedia } from './lib.js';
import { useDistrictMonthlySeries } from './dataExtra.js';
import { indexTo100, seriesStats } from './analytics.js';
import { downloadCsv, stamp } from './exports.js';

const MAX = 4;

export default function CompareBoard({
  districts = [], defaultIds = [], baseParams = {}, loading = false,
  onPickDistrict, activeDistrictId,
}) {
  const t = useT();
  const tName = useNames();
  const narrow = useMedia('(max-width: 640px)');
  const [mode, setMode] = useLocalPref('dappa-dash-cmpboard-mode', 'absolute');
  const [metric, setMetric] = useLocalPref('dappa-dash-cmpboard-metric', 'cases');
  const [picked, setPicked] = useLocalPref('dappa-dash-cmpboard-ids', []);
  const [adding, setAdding] = useState('');

  // Seed from the busiest districts the first time the panel is used; once the
  // officer edits the set their choice wins and the seed never runs again.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded) return;
    if (Array.isArray(picked) && picked.length) { setSeeded(true); return; }
    const seed = (defaultIds || []).filter(Boolean).slice(0, 3).map(String);
    if (seed.length) { setPicked(seed); setSeeded(true); }
  }, [seeded, picked, defaultIds, setPicked]);

  const ids = useMemo(
    () => (Array.isArray(picked) ? picked : []).filter(Boolean).map(String).slice(0, MAX),
    [picked],
  );
  const metricKey = metric === 'heinous' ? 'heinousCount' : 'caseCount';
  const series = useDistrictMonthlySeries(ids, baseParams);

  const nameOf = (id) => {
    const row = (districts || []).find((d) => String(d.districtId) === String(id));
    const raw = row?.districtName || String(id);
    return tName('districts', id, raw) || raw;
  };

  const months = useMemo(() => {
    const set = new Set();
    for (const s of series) for (const r of s.rows) if (r?.ym) set.add(String(r.ym));
    return [...set].sort();
  }, [series]);

  const tracks = useMemo(() => series.map((s) => {
    const byYm = new Map(s.rows.map((r) => [String(r.ym), Number(r[metricKey]) || 0]));
    const values = months.map((m) => byYm.get(m) || 0);
    return {
      districtId: s.districtId,
      name: nameOf(s.districtId),
      isLoading: s.isLoading,
      error: s.error,
      values,
      plot: mode === 'indexed' ? indexTo100(values) : values,
      stats: seriesStats(months, values),
    };
  }), [series, months, metricKey, mode, districts, tName]);

  const anyLoading = loading || tracks.some((tr) => tr.isLoading);

  const option = useMemo(() => {
    if (!months.length || !tracks.length) return null;
    const indexed = mode === 'indexed';
    return {
      tooltip: {
        trigger: 'axis',
        confine: true,
        valueFormatter: (v) => (indexed ? fmtNum(v, 1) : fmtInt(v)),
      },
      legend: { bottom: 0, type: 'scroll' },
      grid: { left: narrow ? 44 : 52, right: 12, top: 12, bottom: narrow ? 46 : 34 },
      xAxis: {
        type: 'category',
        data: months.map(monthLabel),
        axisLabel: narrow ? { rotate: 45, fontSize: 10 } : { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        scale: indexed,
        axisLabel: indexed ? { formatter: '{value}' } : {},
      },
      series: tracks.map((tr) => ({
        name: tr.name,
        type: 'line',
        smooth: true,
        showSymbol: false,
        emphasis: { focus: 'series' },
        data: tr.plot,
      })),
    };
  }, [months, tracks, mode, narrow]);

  const available = useMemo(
    () => (districts || [])
      .filter((d) => !ids.includes(String(d.districtId)))
      .map((d) => ({ id: String(d.districtId), label: nameOf(d.districtId) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [districts, ids, tName],
  );

  const add = (id) => {
    if (!id || ids.includes(String(id)) || ids.length >= MAX) return;
    setPicked([...ids, String(id)]);
    setAdding('');
  };
  const remove = (id) => setPicked(ids.filter((x) => x !== String(id)));

  const exportCsv = () => downloadCsv(
    `district-compare-${stamp()}.csv`,
    [t('dashboard.csv.month'), ...tracks.map((tr) => tr.name)],
    months.map((m, i) => [monthLabel(m), ...tracks.map((tr) => tr.values[i] ?? '')]),
  );

  const modeOptions = useMemo(() => ([
    { value: 'absolute', label: t('dashboard.cmpboard.modeAbsolute') },
    { value: 'indexed', label: t('dashboard.cmpboard.modeIndexed') },
  ]), [t]);
  const metricOptions = useMemo(() => ([
    { value: 'cases', label: t('dashboard.cmpboard.metricCases') },
    { value: 'heinous', label: t('dashboard.cmpboard.metricHeinous') },
  ]), [t]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        <SegmentedControl
          ariaLabel={t('dashboard.cmpboard.modeAria')}
          value={mode === 'indexed' ? 'indexed' : 'absolute'}
          onChange={setMode}
          options={modeOptions}
          className="shrink-0"
        />
        <SegmentedControl
          ariaLabel={t('dashboard.cmpboard.metricAria')}
          value={metric === 'heinous' ? 'heinous' : 'cases'}
          onChange={setMetric}
          options={metricOptions}
          className="shrink-0"
        />
        {months.length > 0 && tracks.length > 0 && (
          <button type="button" onClick={exportCsv} className="chip min-h-[36px] shrink-0 px-2.5 hover:border-amber/40">
            {t('dashboard.cmpboard.csv')}
          </button>
        )}
      </div>

      {/* selected district chips + the add control */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ids.map((id) => (
          <span
            key={id}
            className={`chip min-h-[36px] gap-1 pl-2.5 pr-1 ${String(activeDistrictId) === String(id) ? '!border-amber/60 !text-amber bg-amber/5' : ''}`}
          >
            <button
              type="button"
              onClick={() => onPickDistrict?.(id)}
              title={t('dashboard.cmpboard.filterTo', { name: nameOf(id) })}
              className="max-w-[9rem] truncate"
            >
              {nameOf(id)}
            </button>
            <button
              type="button"
              onClick={() => remove(id)}
              aria-label={t('dashboard.cmpboard.removeAria', { name: nameOf(id) })}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-grid/50 hover:text-signal"
            >
              ✕
            </button>
          </span>
        ))}
        {ids.length < MAX && available.length > 0 && (
          <select
            value={adding}
            aria-label={t('dashboard.cmpboard.addAria')}
            onChange={(e) => add(e.target.value)}
            className="min-h-[36px] rounded-lg border border-dashed border-grid bg-panel px-2 text-xs text-muted transition-colors hover:border-amber/50 focus:border-amber focus:outline-none"
          >
            <option value="">{t('dashboard.cmpboard.addDistrict')}</option>
            {available.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        )}
      </div>

      {!ids.length ? (
        <EmptyState compact title={t('dashboard.cmpboard.empty')} message={t('dashboard.cmpboard.emptyHint')} />
      ) : anyLoading && !months.length ? (
        <LoadingSkeleton height={narrow ? 210 : 250} />
      ) : !option ? (
        <EmptyState compact title={t('dashboard.cmpboard.noData')} message={t('dashboard.cmpboard.noDataHint')} />
      ) : (
        <>
          <DashChart option={option} height={narrow ? 210 : 250} />
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {tracks.filter((tr) => tr.stats).map((tr) => (
              <li key={tr.districtId} className="flex min-h-[40px] items-center gap-2 rounded-lg border border-grid/60 bg-base/30 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{tr.name}</span>
                <span className="num shrink-0 text-[10px] text-muted">
                  {t('dashboard.cmpboard.stat', {
                    total: fmtInt(tr.stats.total),
                    avg: fmtNum(tr.stats.avg, 0),
                    peak: monthLabel(tr.stats.peakYm),
                  })}
                </span>
                {tr.stats.deltaPct !== null && (
                  <span className={`num shrink-0 text-[11px] font-semibold ${tr.stats.deltaPct >= 0 ? 'text-signal' : 'text-teal'}`}>
                    {fmtPct(tr.stats.deltaPct, { sign: true, digits: 1 })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-[10px] text-muted">
        {t(mode === 'indexed' ? 'dashboard.cmpboard.footnoteIndexed' : 'dashboard.cmpboard.footnote', { max: MAX })}
      </p>
    </div>
  );
}
