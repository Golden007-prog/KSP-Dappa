// Station pattern context for one FIR — "is this case typical for this station?"
//
// The detail page shows a case in isolation; an investigator reads it against
// the station's recent pattern. One deep scan of the station (paged GET /cases,
// newest first) drives three readings: the 12-month registration profile, where
// this case's offence type sits in the station's mix, and the registration
// neighbourhood — the FIRs numbered immediately before and after it, plus
// anything else registered the same day, which is how connected incidents
// (a riot, a multi-victim assault) surface as separate CrimeNos.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import ChartPanel from '../../components/ChartPanel.jsx';
import Badge from '../../components/Badge.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { dateLabel, fmtInt, fmtPct, monthLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { useDeepScan, crimeNoParts, median, rowDay } from './deepScan.js';

const MONTHS_SHOWN = 12;
const MAX_SAME_DAY = 8;

/** Newest→oldest list of ym keys ending at the newest row, ascending order. */
function monthlyProfile(rows) {
  const counts = new Map();
  for (const r of rows) {
    const ym = String(r.registeredDate || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) counts.set(ym, (counts.get(ym) || 0) + 1);
  }
  const keys = [...counts.keys()].sort();
  return keys.slice(-MONTHS_SHOWN).map((ym) => ({ ym, count: counts.get(ym) || 0 }));
}

export default function StationContext({ caseData, onOpenCase }) {
  const t = useT();
  const trName = useCaseNames();
  const { theme } = useTheme();
  const d = caseData || {};
  const parts = useMemo(() => crimeNoParts(d.crimeNo), [d.crimeNo]);
  const unitId = parts?.unitId ? String(Number(parts.unitId)) : '';

  const scan = useDeepScan({ unitId }, 500, !!unitId);
  const rows = scan.data?.rows || [];

  const model = useMemo(() => {
    if (!rows.length) return null;
    const ages = rows.filter((r) => Number.isFinite(r.ageDays)).map((r) => r.ageDays);
    const subs = new Map();
    for (const r of rows) {
      const s = String(r.subHeadName || '').trim();
      if (s) subs.set(s, (subs.get(s) || 0) + 1);
    }
    const mix = [...subs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const thisDay = rowDay(d);
    const sameDay = rows.filter((r) => rowDay(r) === thisDay && String(r.caseMasterId) !== String(d.caseMasterId));
    // Serial neighbourhood: same station, year and category, adjacent numbers.
    let prev = null;
    let next = null;
    if (parts) {
      for (const r of rows) {
        const p = crimeNoParts(r.crimeNo);
        if (!p || p.unitId !== parts.unitId || p.year !== parts.year || p.categoryId !== parts.categoryId) continue;
        if (p.serial === parts.serial - 1) prev = r;
        if (p.serial === parts.serial + 1) next = r;
      }
    }
    return {
      total: rows.length,
      medianAge: median(ages),
      heinous: rows.filter((r) => /hein/i.test(String(r.gravityName || ''))).length,
      anomalies: rows.filter((r) => r.anomalyFlag).length,
      months: monthlyProfile(rows),
      mix,
      sameDay: sameDay.slice(0, MAX_SAME_DAY),
      sameDayTotal: sameDay.length,
      prev,
      next,
      truncated: !!scan.data?.truncated,
      serverTotal: scan.data?.total ?? rows.length,
    };
  }, [rows, d, parts, scan.data]);

  if (!unitId) return null;

  if (scan.isLoading) {
    return (
      <Card title={t('cases.stationctx.title')} subtitle={t('cases.stationctx.loading')}>
        <LoadingSkeleton height={160} />
      </Card>
    );
  }
  if (scan.error || !model) {
    return (
      <Card title={t('cases.stationctx.title')}>
        <p className="text-xs text-muted">
          {scan.error ? scan.error.message : t('cases.stationctx.empty')}
          {scan.error && (
            <button type="button" className="btn-ghost !py-0.5 !px-1.5 text-xs ml-2" onClick={() => scan.refetch()}>
              {t('common.action.retry')}
            </button>
          )}
        </p>
      </Card>
    );
  }

  const labelInk = theme === 'light' ? '#5C6B84' : '#8A94A8';
  const thisSub = String(d.subHeadName || '').trim();
  const mixTotal = model.mix.reduce((n, [, c]) => n + c, 0);

  const monthOption = model.months.length >= 2 ? {
    grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: model.months.map((m) => monthLabel(m.ym)), axisLabel: { fontSize: 9, interval: 0, rotate: 40 } },
    yAxis: { type: 'value', minInterval: 1 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [{
      type: 'bar',
      data: model.months.map((m) => m.count),
      barMaxWidth: 22,
      itemStyle: { borderRadius: [3, 3, 0, 0] },
      label: { show: true, position: 'top', fontSize: 9, color: labelInk },
    }],
  } : null;

  const caseChip = (r, label) => (
    <button
      type="button"
      className="chip num !py-1 hover:border-amber/60 hover:text-amber transition-colors max-w-full"
      onClick={() => onOpenCase?.(r)}
      title={t('cases.neighbour.open', { no: r.crimeNo })}
    >
      <span className="truncate">{label}{String(r.crimeNo || '').slice(-9)}</span>
    </button>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-2">
        <ChartPanel
          title={t('cases.stationctx.title')}
          subtitle={t('cases.stationctx.subtitle', {
            station: d.unitName || unitId,
            n: fmtInt(model.total),
            total: fmtInt(model.serverTotal),
          })}
          option={monthOption}
          empty={!monthOption}
          emptyMessage={t('cases.stationctx.empty')}
          height={200}
        />
      </div>
      <Card title={t('cases.stationctx.mixTitle')} subtitle={t('cases.stationctx.mixSub')}>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">{t('cases.stationctx.medianAge')}</p>
            <p className="num text-sm text-ink mt-0.5">{model.medianAge === null ? '—' : `${fmtInt(model.medianAge)}d`}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">{t('cases.stationctx.heinous')}</p>
            <p className="num text-sm text-ink mt-0.5">{fmtPct(model.total ? (model.heinous / model.total) * 100 : 0)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted">{t('cases.stationctx.anomalies')}</p>
            <p className={`num text-sm mt-0.5 ${model.anomalies > 0 ? 'text-signal' : 'text-ink'}`}>{fmtInt(model.anomalies)}</p>
          </div>
        </div>
        <div className="space-y-1">
          {model.mix.map(([name, count]) => {
            const mine = name === thisSub;
            const pct = mixTotal ? (count / mixTotal) * 100 : 0;
            return (
              <div key={name} className="relative overflow-hidden rounded-md border border-grid/60 px-2 py-1">
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 ${mine ? 'bg-amber/25' : 'bg-grid/50'}`}
                  style={{ width: `${Math.max(2, Math.round(pct))}%` }}
                />
                <span className={`relative flex items-center justify-between gap-2 text-[11px] ${mine ? 'text-amber font-medium' : 'text-ink'}`}>
                  <span className="truncate">{trName('crimeSubHeads', name)}{mine ? ` · ${t('cases.stationctx.thisCase')}` : ''}</span>
                  <span className="num shrink-0">{fmtInt(count)}</span>
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="xl:col-span-3">
        <Card title={t('cases.neighbour.title')} subtitle={t('cases.neighbour.subtitle')}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{t('cases.neighbour.serial')}</span>
            {model.prev ? caseChip(model.prev, '← ') : <span className="text-[11px] text-muted">{t('cases.neighbour.noPrev')}</span>}
            <Badge tone="amber">{t('cases.neighbour.thisSerial', { n: String(parts?.serial ?? '').padStart(5, '0') })}</Badge>
            {model.next ? caseChip(model.next, '→ ') : <span className="text-[11px] text-muted">{t('cases.neighbour.noNext')}</span>}
          </div>
          <div className="mt-3 pt-3 border-t border-grid/60">
            <p className="eyebrow mb-1.5">
              {t('cases.neighbour.sameDay', { date: dateLabel(d.registeredDate), n: fmtInt(model.sameDayTotal) })}
            </p>
            {model.sameDay.length ? (
              <div className="flex flex-wrap gap-1.5">
                {model.sameDay.map((r) => (
                  <button
                    key={r.caseMasterId}
                    type="button"
                    className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors max-w-full"
                    onClick={() => onOpenCase?.(r)}
                    title={t('cases.neighbour.open', { no: r.crimeNo })}
                  >
                    <span className="truncate">
                      {trName('crimeSubHeads', r.subHeadName)} <span className="num text-muted">…{String(r.crimeNo || '').slice(-5)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted">{t('cases.neighbour.noSameDay')}</p>
            )}
          </div>
          {model.truncated && (
            <p className="text-[10px] text-muted mt-2">{t('cases.stationctx.truncated', { n: fmtInt(model.total), total: fmtInt(model.serverTotal) })}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
