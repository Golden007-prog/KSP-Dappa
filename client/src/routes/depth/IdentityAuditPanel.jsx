// Identity-resolution validation card + threshold sweep: precision / recall /
// F1 of the pipeline's alias matcher against the planted ground truth, the
// scoring formula, and the precision–recall curve for three scorer variants.
// Data: GET /depth/benchmarks (identityMetrics + identitySweep).
import { useMemo, useState } from 'react';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { useDepthBenchmarks } from '../../lib/depthApi.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { seriesColors } from '../trends/palettes.js';
import { PanelFrame, StatTile } from './DepthBits.jsx';

function PrCurve({ variants, colors, point, ariaLabel }) {
  const W = 320; const H = 200; const padL = 30; const padB = 20; const padT = 8; const padR = 8;
  const xs = (r) => padL + r * (W - padL - padR);
  const ys = (p) => padT + (1 - p) * (H - padT - padB);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={padL} x2={W - padR} y1={ys(v)} y2={ys(v)} stroke="currentColor" className="text-grid" strokeWidth="0.5" />
          <text x={padL - 3} y={ys(v) + 3} fontSize="7" textAnchor="end" fill="currentColor" className="text-muted">{Math.round(v * 100)}%</text>
          <text x={xs(v)} y={H - 6} fontSize="7" textAnchor="middle" fill="currentColor" className="text-muted">{Math.round(v * 100)}%</text>
        </g>
      ))}
      {variants.map((v, i) => (
        <g key={v.key}>
          <polyline fill="none" stroke={colors[i % colors.length]} strokeWidth="1.6" vectorEffect="non-scaling-stroke" points={v.points.map((p) => `${xs(p.recall).toFixed(1)},${ys(p.precision).toFixed(1)}`).join(' ')} />
          {v.points.map((p) => <circle key={p.threshold} cx={xs(p.recall)} cy={ys(p.precision)} r="1.8" fill={colors[i % colors.length]} />)}
        </g>
      ))}
      {point && <circle cx={xs(point.recall)} cy={ys(point.precision)} r="4" fill="none" stroke="currentColor" className="text-ink" strokeWidth="1.2" />}
    </svg>
  );
}

export default function IdentityAuditPanel() {
  const t = useT();
  const { theme } = useTheme();
  const colors = seriesColors('standard', theme);
  const q = useDepthBenchmarks();
  const d = q.data;
  const m = d?.identityMetrics || null;
  const sweep = d?.identitySweep || null;
  const [pick, setPick] = useState(0.92);
  const variants = useMemo(() => (sweep ? ['v1', 'v2', 'v3'].filter((k) => sweep[k]).map((k) => ({ key: k, label: t(`depth.identity.${k}`), points: sweep[k].points, best: sweep[k].bestF1 })) : []), [sweep, t]);
  const thresholds = sweep?.thresholds || [];
  const atPick = variants.map((v) => ({ key: v.key, label: v.label, p: v.points.find((x) => x.threshold === pick) }));
  const status = !m ? 'nodata' : m.precision >= 0.5 ? 'stable' : m.precision >= 0.2 ? 'watch' : 'rising';

  return (
    <PanelFrame
      title={t('depth.identity.title')}
      subtitle={m ? t('depth.identity.subtitle', { rows: fmtInt(m.groundTruthRows), pairs: fmtInt(m.truePairs) }) : undefined}
      term="precisionrecall"
      termVars={{ p: m ? Math.round(m.precision * 100) : '—', r: m ? Math.round(m.recall * 100) : '—' }}
      method={t('depth.identity.method')}
      methodDetail={sweep?.method || m?.scoring}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && !m}
      emptyMessage={t('depth.identity.empty')}
    >
      {m && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={status} label={t(`depth.identity.status.${status}`)} />
            <span className="text-[11px] text-muted">{t('depth.identity.operating', { th: fmtNum(m.threshold, 2) })}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label={t('depth.identity.kpiPrecision')} value={fmtPct(m.precision * 100, { digits: 1 })} hint={t('depth.identity.kpiPrecisionHint', { n: fmtInt(m.falsePairs) })} />
            <StatTile label={t('depth.identity.kpiRecall')} value={fmtPct(m.recall * 100, { digits: 1 })} hint={t('depth.identity.kpiRecallHint', { n: fmtInt(m.correctPairs), of: fmtInt(m.truePairs) })} />
            <StatTile label={t('depth.identity.kpiF1')} value={fmtNum(m.f1, 3)} />
            <StatTile label={t('depth.identity.kpiThreshold')} value={fmtNum(m.threshold, 2)} />
          </div>
          <p className="text-[11px] text-muted num">{t('depth.identity.formula')}: {m.scoring}</p>
          {sweep && variants.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-ink">{t('depth.identity.sweepTitle')}</h3>
                <label className="text-[11px] text-muted inline-flex items-center gap-2">
                  {t('depth.identity.pickThreshold')}
                  <select className="input-dark !py-1 text-xs min-h-[44px] sm:min-h-0" value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label={t('depth.identity.pickThreshold')}>
                    {thresholds.map((th) => <option key={th} value={th}>{fmtNum(th, 2)}</option>)}
                  </select>
                </label>
              </div>
              <PrCurve variants={variants} colors={colors} point={{ recall: m.recall, precision: m.precision }} ariaLabel={t('depth.identity.curveAria')} />
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {variants.map((v, i) => (
                  <li key={v.key} className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-0.5" style={{ backgroundColor: colors[i % colors.length] }} aria-hidden="true" /><span className="text-ink">{v.label}</span></li>
                ))}
              </ul>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <caption className="sr-only">{t('depth.identity.tableCaption', { th: fmtNum(pick, 2) })}</caption>
                  <thead><tr><th scope="col" className="text-left text-muted font-normal px-1">{t('depth.identity.colVariant')}</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.identity.kpiPrecision')}</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.identity.kpiRecall')}</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.identity.kpiF1')}</th><th scope="col" className="text-right text-muted font-normal px-1">{t('depth.identity.colLargest')}</th></tr></thead>
                  <tbody>
                    {atPick.map((v) => v.p && (
                      <tr key={v.key} className="border-t border-grid/40">
                        <th scope="row" className="text-left font-normal text-ink px-1">{v.label}</th>
                        <td className="text-right num px-1">{fmtPct(v.p.precision * 100, { digits: 1 })}</td>
                        <td className="text-right num px-1">{fmtPct(v.p.recall * 100, { digits: 1 })}</td>
                        <td className="text-right num px-1">{fmtNum(v.p.f1, 3)}</td>
                        <td className="text-right num px-1">{fmtInt(v.p.largestCluster)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted">{t('depth.identity.sweepNote', { anchors: fmtInt(sweep.exactAnchors), same: fmtInt(sweep.exactAnchorsSameDistrict || 0), best: fmtNum(variants[variants.length - 1].best.f1, 3), th: fmtNum(variants[variants.length - 1].best.threshold, 2) })}</p>
            </div>
          )}
        </div>
      )}
    </PanelFrame>
  );
}
