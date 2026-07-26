// Peer-cohort pendency — how this FIR compares with comparable cases.
//
// "240 days open" means nothing on its own: for a cyber-fraud cohort it may be
// unremarkable, for a chain-snatching cohort in the same district it is an
// outlier. The cohort is same subhead + same district (the two dimensions the
// API can filter server-side), scanned newest-first, and the case is placed on
// the cohort's age distribution with its percentile spelled out.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useLookups } from '../../lib/api.js';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { caseAgeDays } from './explorerState.js';
import { useDeepScan, crimeNoParts, median, percentile, unpad } from './deepScan.js';

const MIN_COHORT = 8;

export default function PeerCohortPanel({ caseData }) {
  const t = useT();
  const trName = useCaseNames();
  const lookups = useLookups();
  const lk = lookups.data;
  const d = caseData || {};

  const parts = useMemo(() => crimeNoParts(d.crimeNo), [d.crimeNo]);
  const districtId = parts ? unpad(parts.districtId) : '';
  const subId = d.subHeadName
    ? (lk?.crimeSubHeads || []).find((s) => s.subHeadName === d.subHeadName)?.crimeSubHeadId || ''
    : '';

  const enabled = !!subId && !!districtId;
  const scan = useDeepScan({ crimeSubHeadId: subId, districtId }, 500, enabled);

  const model = useMemo(() => {
    const rows = scan.data?.rows || [];
    const mine = caseAgeDays(d.registeredDate);
    const ages = rows
      .filter((r) => String(r.caseMasterId) !== String(d.caseMasterId) && Number.isFinite(r.ageDays))
      .map((r) => r.ageDays);
    if (ages.length < MIN_COHORT || !Number.isFinite(mine)) return null;
    const sorted = [...ages].sort((a, b) => a - b);
    const younger = sorted.filter((a) => a < mine).length;
    const pctile = Math.round((younger / sorted.length) * 100);
    const openLike = rows.filter((r) => /investigat|pending/i.test(String(r.statusName || ''))).length;
    return {
      n: sorted.length,
      mine,
      pctile,
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      med: median(sorted),
      max: sorted[sorted.length - 1],
      openPct: rows.length ? (openLike / rows.length) * 100 : 0,
      truncated: !!scan.data?.truncated,
      serverTotal: scan.data?.total ?? rows.length,
    };
  }, [scan.data, d.registeredDate, d.caseMasterId]);

  if (!enabled) return null;

  if (scan.isLoading) {
    return (
      <Card title={t('cases.cohort.title')} subtitle={t('cases.cohort.loading')}>
        <LoadingSkeleton height={90} />
      </Card>
    );
  }
  if (scan.error || !model) {
    return (
      <Card title={t('cases.cohort.title')}>
        <p className="text-xs text-muted">
          {scan.error ? scan.error.message : t('cases.cohort.tooSmall', { n: MIN_COHORT })}
          {scan.error && (
            <button type="button" className="btn-ghost !py-0.5 !px-1.5 text-xs ml-2" onClick={() => scan.refetch()}>
              {t('common.action.retry')}
            </button>
          )}
        </p>
      </Card>
    );
  }

  const tone = model.pctile >= 90 ? 'red' : model.pctile >= 75 ? 'amber' : 'teal';
  const span = Math.max(model.max, model.mine, 1);
  const pos = Math.min(100, Math.max(0, (model.mine / span) * 100));
  const medPos = Math.min(100, Math.max(0, (model.med / span) * 100));

  return (
    <Card
      title={t('cases.cohort.title')}
      subtitle={t('cases.cohort.subtitle', {
        sub: trName('crimeSubHeads', d.subHeadName),
        district: trName('districts', d.districtName),
        n: fmtInt(model.n),
      })}
      actions={<Badge tone={tone}>{t('cases.cohort.percentile', { p: model.pctile })}</Badge>}
    >
      <p className="text-xs text-muted">
        {t('cases.cohort.verdict', { age: fmtInt(model.mine), p: model.pctile, med: fmtInt(model.med) })}
      </p>
      <div className="relative mt-3 h-3 rounded-full bg-grid/60">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${tone === 'red' ? 'bg-signal/50' : tone === 'amber' ? 'bg-amber/50' : 'bg-teal/50'}`}
          style={{ width: `${Math.max(2, pos)}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-[-3px] h-[18px] w-[2px] bg-ink/70"
          style={{ left: `${medPos}%` }}
          title={t('cases.cohort.medianMark')}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div>
          <p className="uppercase tracking-wide text-muted">{t('cases.cohort.thisCase')}</p>
          <p className="num text-ink mt-0.5">{fmtInt(model.mine)}d</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-muted">{t('cases.cohort.cohortMedian')}</p>
          <p className="num text-ink mt-0.5">{fmtInt(model.p50)}d</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-muted">{t('cases.cohort.cohortP90')}</p>
          <p className="num text-ink mt-0.5">{fmtInt(model.p90)}d</p>
        </div>
        <div>
          <p className="uppercase tracking-wide text-muted">{t('cases.cohort.stillOpen')}</p>
          <p className="num text-ink mt-0.5">{fmtPct(model.openPct)}</p>
        </div>
      </div>
      {model.truncated && (
        <p className="text-[10px] text-muted mt-2">{t('cases.cohort.truncated', { n: fmtInt(model.n), total: fmtInt(model.serverTotal) })}</p>
      )}
    </Card>
  );
}
