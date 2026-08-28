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
import { useI18n } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { makeTierOf, percentileOf } from './riskTiers.js';

const ordinal = (n) => {
  const v = Math.round(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const mod = v % 100;
  return `${v}${s[(mod - 20) % 10] || s[mod] || s[0]}`;
};

export default function RiskDrawer({ open, row, rows, onClose, onOpenMap }) {
  const { t, lang } = useI18n();
  const toast = useToast();

  // English ordinal suffixes ("88th") have no counterpart in Kannada, where
  // the percentile reads as a plain number.
  const percentile = (n) => (lang === 'en' ? ordinal(n) : fmtInt(Math.round(n)));

  const ctx = useMemo(() => {
    if (!row) return null;
    const tierOf = makeTierOf(rows, t);
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
  }, [row, rows, t]);

  const copyBrief = async () => {
    if (!row || !ctx) return;
    const lines = [
      t('trends.predict.drawer.briefHeader', {
        station: row.unitName,
        district: row.districtName || row.districtId || '—',
      }),
      t('trends.predict.drawer.briefRisk', {
        score: fmtNum(row.riskScore, 1),
        tier: ctx.tier.label,
        pct: percentile(ctx.pct ?? 0),
        n: fmtInt(rows.length),
        rank: row.rank,
      }),
      ...(ctx.distRank ? [t('trends.predict.drawer.briefDistrict', {
        rank: ctx.distRank,
        n: fmtInt(ctx.distCount),
        mean: fmtNum(ctx.distMean, 1),
      })] : []),
      ...((row.drivers || []).length
        ? [t('trends.predict.drawer.briefDrivers', { drivers: row.drivers.join('; ') })]
        : []),
      t('trends.predict.drawer.briefSource'),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success(t('trends.predict.toast.stationBrief'));
    } catch {
      toast.error(t('trends.clipboard.unavailable'));
    }
  };

  if (!row || !ctx) return null;

  return (
    <Sheet open={open} onClose={onClose} title={t('trends.predict.drawer.title')}>
      <div className="space-y-4 px-1 pb-1">
        <div>
          <p className="text-base font-semibold text-ink leading-tight">{row.unitName}</p>
          <p className="text-xs text-muted mt-0.5">{row.districtName || row.districtId || '—'}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge tone={ctx.tier.tone}>{t('trends.predict.drawer.tierBadge', { tier: ctx.tier.label })}</Badge>
            <Badge tone="slate">{t('trends.predict.drawer.rankBadge', { rank: row.rank })}</Badge>
            {ctx.pct !== null && (
              <Tooltip label={t('trends.predict.drawer.percentileTip')}>
                <span><Badge tone="neutral">{t('trends.predict.drawer.percentile', { n: percentile(ctx.pct) })}</Badge></span>
              </Tooltip>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted">{t('trends.predict.drawer.riskScore')}</span>
            <span className="num text-2xl font-semibold text-ink">{fmtNum(row.riskScore, 1)}</span>
          </div>
          <div className="h-2 rounded-full bg-grid overflow-hidden mt-1.5" aria-hidden="true">
            <div
              className="h-full rounded-full bg-amber"
              style={{ width: `${Math.max(4, ((Number(row.riskScore) || 0) / ctx.maxRisk) * 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-muted mt-1">
            {t('trends.predict.drawer.vsMax', { value: fmtNum(ctx.maxRisk, 1) })}
          </p>
        </div>

        {ctx.spark && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted">{t('trends.predict.drawer.caseTrend')}</span>
              <StatDelta value={ctx.sparkDelta} positiveIsGood={false} label={t('trends.compare.delta3m')} />
            </div>
            <Sparkline values={ctx.spark} color="currentColor" height={44} className="mt-1.5 text-amber" />
          </div>
        )}

        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">{t('trends.predict.drawer.why')}</p>
          {ctx.driverBars.length === 0 ? (
            <p className="text-xs text-muted">{t('trends.predict.drawer.noDrivers')}</p>
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
            {t('trends.predict.drawer.weightNote')}
          </p>
        </div>

        {ctx.distRank !== null && ctx.distCount > 1 && (
          <div className="rounded-lg border border-grid bg-canvas/40 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted">{t('trends.predict.drawer.districtContext')}</p>
            <p className="text-xs text-ink mt-1">
              {t('trends.predict.drawer.districtRank', {
                rank: ctx.distRank,
                n: fmtInt(ctx.distCount),
                district: row.districtName || t('trends.predict.drawer.thisDistrict'),
              })} ·{' '}
              {t('trends.predict.drawer.districtMean')} <span className="num font-semibold">{fmtNum(ctx.distMean, 1)}</span> ·{' '}
              {t('trends.predict.drawer.runs')} <span className="num font-semibold">{fmtNum((Number(row.riskScore) || 0) - ctx.distMean, 1)}</span>{' '}
              {Number(row.riskScore) >= ctx.distMean
                ? t('trends.predict.drawer.aboveIt')
                : t('trends.predict.drawer.belowIt')}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className="btn-primary min-h-[44px]" onClick={() => onOpenMap?.(row)}>
            {t('trends.predict.drawer.openMap')}
          </button>
          <button type="button" className="btn min-h-[44px]" onClick={copyBrief}>
            {t('trends.predict.drawer.copyBrief')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
