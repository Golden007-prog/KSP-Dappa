// Festival uplift estimator — % uplift per crime head inside the festival
// window against the surrounding baseline, averaged across the festivals in the
// data with a 95 % t-interval. Data: GET /depth/festival-uplift.
import { useMemo, useState } from 'react';
import StatusPill from '../../components/StatusPill.jsx';
import { useDepthFestival } from '../../lib/depthApi.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';
import { PanelFrame, Bars, statusOf } from './DepthBits.jsx';

export default function FestivalUpliftPanel({ districtId }) {
  const t = useT();
  const tName = useNames();
  const q = useDepthFestival({ districtId: districtId || undefined });
  const d = q.data;
  const heads = d?.heads || [];
  const [sel, setSel] = useState(null);
  const active = heads.find((h) => h.headId === sel) || heads[0] || null;
  const domain = useMemo(() => {
    const vals = heads.flatMap((h) => [h.ciLow, h.ciHigh, h.meanUpliftPct]).filter(Number.isFinite);
    const lo = Math.min(-20, ...vals); const hi = Math.max(40, ...vals);
    return { min: Math.floor(lo / 10) * 10, max: Math.ceil(hi / 10) * 10 };
  }, [heads]);
  const total = d?.total;
  return (
    <PanelFrame
      title={t('depth.fest.title')}
      subtitle={d ? t('depth.fest.subtitle', { n: fmtInt(d.festivals.length), w: fmtInt(d.windowDays), b: fmtInt(d.baselineDays) }) : undefined}
      term="uplift"
      termVars={{ pct: total ? fmtNum(total.meanUpliftPct, 0) : '—', lo: total && total.ciLow !== null ? fmtNum(total.ciLow, 0) : '—', hi: total && total.ciHigh !== null ? fmtNum(total.ciHigh, 0) : '—' }}
      method={t('depth.fest.method')}
      methodDetail={d?.method}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && heads.length === 0}
      emptyMessage={t('depth.fest.empty')}
    >
      {d && heads.length > 0 && (
        <div className="space-y-3">
          {total && (
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={statusOf(total.verdict)} label={t(`depth.fest.verdict.${total.verdict}`)} />
              <span className="text-[12px] text-ink">{t('depth.fest.totalLine', { pct: fmtNum(total.meanUpliftPct, 1), lo: total.ciLow === null ? '—' : fmtNum(total.ciLow, 1), hi: total.ciHigh === null ? '—' : fmtNum(total.ciHigh, 1), n: fmtInt(total.festivals) })}</span>
            </div>
          )}
          <Bars
            rows={heads.map((h) => ({ label: tName('crimeHeads', h.headId, h.headName), value: h.meanUpliftPct, lo: h.ciLow, hi: h.ciHigh, tone: h.verdict === 'uplift' ? 'bg-signal/70' : h.verdict === 'dip' ? 'bg-teal/70' : 'bg-amber/60', hint: t(`depth.fest.verdict.${h.verdict}`) }))}
            min={domain.min}
            max={domain.max}
            unit="%"
          />
          <p className="text-[10px] text-muted">{t('depth.fest.legend')}</p>
          <div>
            <label className="text-[11px] text-muted inline-flex items-center gap-2">
              {t('depth.fest.pickHead')}
              <select className="input-dark !py-1 text-xs min-h-[44px] sm:min-h-0" value={active ? active.headId : ''} onChange={(e) => setSel(Number(e.target.value))} aria-label={t('depth.fest.pickHead')}>
                {heads.map((h) => <option key={h.headId} value={h.headId}>{tName('crimeHeads', h.headId, h.headName)}</option>)}
              </select>
            </label>
            {active && (
              <div className="overflow-x-auto mt-1">
                <table className="w-full text-[11px]">
                  <caption className="sr-only">{t('depth.fest.tableCaption')}</caption>
                  <thead><tr><th scope="col" className="text-left text-muted font-normal px-1">{t('depth.fest.colFestival')}</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.fest.colWindow')}</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.fest.colBaseline')}</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.fest.colUplift')}</th></tr></thead>
                  <tbody>
                    {active.perFestival.map((f) => (
                      <tr key={f.date} className="border-t border-grid/40">
                        <th scope="row" className="text-left font-normal text-ink px-1 whitespace-nowrap">{f.name} · <span className="num">{dateLabel(f.date)}</span></th>
                        <td className="text-right num px-1">{fmtNum(f.winRate, 1)}</td>
                        <td className="text-right num px-1">{fmtNum(f.baseRate, 1)}</td>
                        <td className={`text-right num px-1 ${f.upliftPct > 0 ? 'text-signal' : f.upliftPct < 0 ? 'text-teal' : ''}`}>{f.upliftPct > 0 ? '+' : ''}{fmtNum(f.upliftPct, 0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
