// /predict — station risk dossier drawer. Opens from a league row and unpacks
// one station: score vs the league (percentile + tier), the 6-month case
// trend, the model's rank-ordered risk drivers rendered as importance bars
// (weights derive from driver ORDER in DriversJson — the model emits them
// ranked; no per-driver coefficients exist, and the label says so), and
// district context (mean risk, rank among the district's stations).
import { useMemo } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import Sparkline from '../trends/Sparkline.jsx';
import { recentDeltaPct } from '../trends/analysis.js';
import StatDelta from '../../components/StatDelta.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { makeTierOf, percentileOf } from './riskTiers.js';

const ordinal = (n) => {
  const v = Math.round(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const mod = v % 100;
  return `${v}${s[(mod - 20) % 10] || s[mod] || s[0]}`;
};

export default function RiskDrawer({ open, row, rows, onClose, onOpenMap }) {
  const toast = useToast();

  const ctx = useMemo(() => {
    if (!row) return null;
    const tierOf = makeTierOf(rows);
    const score = Number(row.riskScore) || 0;
    const pct = percentileOf(rows, score);
    const maxRisk = Math.max(1, ...rows.map((r) => Number(r.riskScore) || 0));
    const inDistrict = rows.filter((r) => String(r.districtId) === String(row.districtId));
    const distMean = inDistrict.length
      ? inDistrict.reduce((a, r) => a + (Number(r.riskScore) || 0), 0) / inDistrict.length
      : null;
    const distRank = inDistrict.length
      ? [...inDistrict].sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))
        .findIndex((r) => r.unitId === row.unitId) + 1
      : null;
    const drivers = row.drivers || [];
    const denom = drivers.reduce((a, _, i) => a + (drivers.length - i), 0) || 1;
    return {
      tier: tierOf(score),
      pct,
      maxRisk,
      distMean,
      distRank,
      distCount: inDistrict.length,
      spark: Array.isArray(row.spark) && row.spark.some((v) => Number(v) > 0) ? row.spark : null,
      sparkDelta: Array.isArray(row.spark) ? recentDeltaPct(row.spark, 3) : null,
      driverBars: drivers.map((d, i) => ({
        label: d,
        weight: ((drivers.length - i) / denom) * 100,
      })),
    };
  }, [row, rows]);

  const copyBrief = async () => {
    if (!row || !ctx) return;
    const lines = [
      `Station dossier — ${row.unitName} (${row.districtName || row.districtId || '—'})`,
      `30-day risk ${fmtNum(row.riskScore, 1)} — ${ctx.tier.label} tier, ${ordinal(ctx.pct ?? 0)} percentile of ${fmtInt(rows.length)} stations (league rank #${row.rank})`,
      ...(ctx.distRank ? [`District context: #${ctx.distRank} of ${ctx.distCount} stations, district mean risk ${fmtNum(ctx.distMean, 1)}`] : []),
      ...((row.drivers || []).length ? [`Drivers (rank-ordered): ${row.drivers.join('; ')}`] : []),
      'Source: DAPPA nightly risk model, synthetic data.',
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('Station brief copied');
    } catch {
      toast.error('Clipboard unavailable in this browser');
    }
  };

  if (!row || !ctx) return null;

  return (
    <Sheet open={open} onClose={onClose} title="Station dossier">
      <div className="space-y-4 px-1 pb-1">
        <div>
          <p className="text-base font-semibold text-ink leading-tight">{row.unitName}</p>
          <p className="text-xs text-muted mt-0.5">{row.districtName || row.districtId || '—'}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge tone={ctx.tier.tone}>{ctx.tier.label} tier</Badge>
            <Badge tone="slate">league rank #{row.rank}</Badge>
            {ctx.pct !== null && (
              <Tooltip label="Share of stations with a lower 30-day risk score">
                <span><Badge tone="neutral">{ordinal(ctx.pct)} percentile</Badge></span>
              </Tooltip>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted">Risk score (30d)</span>
            <span className="num text-2xl font-semibold text-ink">{fmtNum(row.riskScore, 1)}</span>
          </div>
          <div className="h-2 rounded-full bg-grid overflow-hidden mt-1.5" aria-hidden="true">
            <div
              className="h-full rounded-full bg-amber"
              style={{ width: `${Math.max(4, ((Number(row.riskScore) || 0) / ctx.maxRisk) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted mt-1">vs the current league maximum ({fmtNum(ctx.maxRisk, 1)})</p>
        </div>

        {ctx.spark && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted">Case trend — last 6 months</span>
              <StatDelta value={ctx.sparkDelta} positiveIsGood={false} label="3m" />
            </div>
            <Sparkline values={ctx.spark} color="currentColor" height={44} className="mt-1.5 text-amber" />
          </div>
        )}

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Why the model flags it</p>
          {ctx.driverBars.length === 0 ? (
            <p className="text-xs text-muted">The model recorded no named drivers for this station.</p>
          ) : (
            <ul className="space-y-1.5">
              {ctx.driverBars.map((d) => (
                <li key={d.label} className="flex items-center gap-2">
                  <span className="text-xs text-ink flex-1 min-w-0 truncate" title={d.label}>{d.label}</span>
                  <span className="h-1.5 w-24 shrink-0 rounded-full bg-grid overflow-hidden" aria-hidden="true">
                    <span className="block h-full rounded-full bg-amber" style={{ width: `${Math.max(6, d.weight)}%` }} />
                  </span>
                  <span className="num text-[11px] text-muted w-8 text-right shrink-0">{fmtNum(d.weight, 0)}%</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-muted mt-1.5">
            Weights reflect the model's driver ranking, not fitted coefficients.
          </p>
        </div>

        {ctx.distRank !== null && ctx.distCount > 1 && (
          <div className="rounded-lg border border-grid bg-base/40 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted">District context</p>
            <p className="text-xs text-ink mt-1">
              #{ctx.distRank} of {fmtInt(ctx.distCount)} stations in {row.districtName || 'this district'} ·
              district mean risk <span className="num font-semibold">{fmtNum(ctx.distMean, 1)}</span> ·
              this station runs <span className="num font-semibold">{fmtNum((Number(row.riskScore) || 0) - ctx.distMean, 1)}</span> {Number(row.riskScore) >= ctx.distMean ? 'above' : 'below'} it
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className="btn-primary min-h-[44px]" onClick={() => onOpenMap?.(row)}>
            Open on map
          </button>
          <button type="button" className="btn min-h-[44px]" onClick={copyBrief}>
            Copy brief
          </button>
        </div>
      </div>
    </Sheet>
  );
}
