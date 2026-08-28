// Resource-deployment planner (C4 — hotspots turned into a duty roster).
// Every other panel tells an officer WHERE the crime is; this one converts the
// same live numbers into how many patrol beats to put there and in which hour
// band. Sixty percent of the declared patrol budget is allocated in proportion
// to spatiotemporal cluster intensity (/geo/hotspots) and forty percent in
// proportion to predicted 30-day station risk (/risk/stations). The split is
// stated in the footnote rather than hidden, because it is a planning
// assumption a DySP should be able to argue with.
//
// Props: hotspots (useHotspots result), riskRows, linkSearch
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { useLocalPref } from './lib.js';
import { deploymentPlan } from './analytics.js';
import { hourBandLabel } from './insights.js';
import { downloadCsv, stamp } from './exports.js';

const BUDGETS = [12, 24, 36, 48];

export default function DeploymentPanel({ hotspots, riskRows = [], linkSearch = '' }) {
  const t = useT();
  const tName = useNames();
  const [budget, setBudget] = useLocalPref('dappa-dash-deploy-budget', 24);
  const b = BUDGETS.includes(Number(budget)) ? Number(budget) : 24;

  const plan = useMemo(
    () => deploymentPlan(hotspots.data, riskRows, { budget: b }),
    [hotspots.data, riskRows, b],
  );

  const clusterLabel = (a) => tName('crimeHeads', a.crimeHeadId, a.label) || a.label || t('dashboard.deploy.cluster');
  const districtLabel = (id) => tName('districts', id, unitInfo(id)?.name || String(id ?? ''))
    || unitInfo(id)?.name || String(id ?? '');

  const exportCsv = () => {
    if (!plan) return;
    downloadCsv(
      `deployment-plan-${stamp()}.csv`,
      [t('dashboard.csv.assignment'), t('dashboard.csv.district'), t('dashboard.csv.hourStart'),
        t('dashboard.csv.hourEnd'), t('dashboard.csv.beats'), t('dashboard.csv.intensity'), t('dashboard.csv.cases')],
      [
        ...plan.assignments.map((a) => [
          clusterLabel(a), districtLabel(a.districtId), a.hourBandStart, a.hourBandEnd,
          a.beats, a.intensity, a.caseCount,
        ]),
        ...plan.stations.map((s) => [
          s.unitName, districtLabel(s.districtId), '', '', s.beats, fmtNum(s.riskScore, 1), '',
        ]),
      ],
    );
  };

  const linkTo = (districtId) => {
    const qs = new URLSearchParams(linkSearch ? linkSearch.slice(1) : '');
    if (districtId) qs.set('districtId', districtId);
    const s = qs.toString();
    return `/map${s ? `?${s}` : ''}`;
  };

  if (hotspots.isLoading) return <LoadingSkeleton lines={6} />;
  if (hotspots.error) {
    return (
      <EmptyState
        compact
        title={t('dashboard.deploy.error')}
        message={hotspots.error.message}
        action={<button type="button" className="btn" onClick={() => hotspots.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }
  if (!plan) {
    return <EmptyState compact title={t('dashboard.deploy.empty')} message={t('dashboard.deploy.emptyHint')} />;
  }

  const maxBeats = Math.max(1, ...plan.assignments.map((a) => a.beats), ...plan.stations.map((s) => s.beats));

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted">{t('dashboard.deploy.budgetLabel')}</span>
        {BUDGETS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={b === n}
            onClick={() => setBudget(n)}
            className={`chip num min-h-[36px] px-2.5 transition-colors ${
              b === n ? '!border-amber/60 !text-amber bg-amber/5' : 'hover:border-amber/40'
            }`}
          >
            {n}
          </button>
        ))}
        <button type="button" onClick={exportCsv} className="chip min-h-[36px] px-2.5 hover:border-amber/40">
          {t('dashboard.deploy.csv')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border border-grid/60 bg-canvas/30 p-2">
          <p className="truncate text-[10px] uppercase tracking-wide text-muted">{t('dashboard.deploy.assigned')}</p>
          <p className="num text-base font-bold leading-tight text-ink">{fmtInt(plan.usedBeats)}<span className="text-[11px] font-normal text-muted">/{fmtInt(plan.budget)}</span></p>
        </div>
        <div className="rounded-lg border border-grid/60 bg-canvas/30 p-2">
          <p className="truncate text-[10px] uppercase tracking-wide text-muted">{t('dashboard.deploy.nightShare')}</p>
          <p className="num text-base font-bold leading-tight text-signal">{fmtNum(plan.nightSharePct, 0)}%</p>
        </div>
        <div className="rounded-lg border border-grid/60 bg-canvas/30 p-2">
          <p className="truncate text-[10px] uppercase tracking-wide text-muted">{t('dashboard.deploy.coverage')}</p>
          <p className="num text-base font-bold leading-tight text-teal">{fmtNum(plan.coveragePct, 0)}%</p>
        </div>
      </div>

      {plan.assignments.length > 0 && (
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {t('dashboard.deploy.clusterHeading')}
          </p>
          <ol className="divide-y divide-grid/50">
            {plan.assignments.slice(0, 6).map((a) => {
              const band = hourBandLabel(a.hourBandStart, a.hourBandEnd);
              return (
                <li key={a.id}>
                  <Link
                    to={linkTo(a.districtId)}
                    title={t('dashboard.deploy.rowTitle', { name: clusterLabel(a) })}
                    className="flex min-h-[44px] items-center gap-2 rounded-lg px-1.5 py-2 transition-colors hover:bg-grid/30"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-ink">{clusterLabel(a)}</span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className="truncate text-[10px] text-muted">{districtLabel(a.districtId)}</span>
                        {a.radiusM > 0 && (
                          <span className="num shrink-0 text-[10px] text-muted">
                            {t('dashboard.deploy.radius', { m: fmtInt(a.radiusM) })}
                          </span>
                        )}
                      </span>
                    </span>
                    {band && <Badge tone={a.night ? 'red' : 'amber'} className="shrink-0">{band}</Badge>}
                    <span className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-grid/50 sm:w-12" aria-hidden="true">
                      <span className="block h-full rounded-full bg-amber/80" style={{ width: `${Math.round((a.beats / maxBeats) * 100)}%` }} />
                    </span>
                    <span className="num shrink-0 text-xs font-semibold text-ink">
                      {t('dashboard.deploy.beats', { n: a.beats })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {plan.stations.length > 0 && (
        <div>
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {t('dashboard.deploy.stationHeading')}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {plan.stations.slice(0, 6).map((s) => (
              <li key={s.unitId}>
                <Link
                  to={`/predict${linkSearch}`}
                  title={t('dashboard.deploy.stationTitle', { name: s.unitName, score: fmtNum(s.riskScore, 1) })}
                  className="chip num min-h-[36px] gap-1.5 px-2.5 hover:border-amber/40"
                >
                  <span className="max-w-[8rem] truncate">{s.unitName}</span>
                  <span className="font-semibold text-amber">+{s.beats}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-muted">{t('dashboard.deploy.footnote')}</p>
    </div>
  );
}
