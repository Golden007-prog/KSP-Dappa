// Behavioural change detection — escalation and de-escalation surfaced as
// reviewable call-outs. Every card states the numbers it was drawn from, so an
// investigator can disagree with a flag instead of taking it on faith.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt, fmtNum, fmtPct, dateLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { behaviourFlags, gravitySeries } from './behaviour.js';

const TONE_BORDER = {
  red: 'border-l-signal',
  amber: 'border-l-amber',
  teal: 'border-l-teal',
  slate: 'border-l-grid',
};

const ARROW = { up: '▲', down: '▼' };

/** Per-year mean-gravity trajectory, drawn as a plain SVG line + points. */
function GravityTrack({ series }) {
  const t = useT();
  if (series.length < 2) return null;
  const w = 100;
  const h = 34;
  const max = Math.max(10, ...series.map((s) => s.max));
  const pts = series.map((s, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - (s.avg / max) * h;
    return { x, y, ...s };
  });
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-11 text-amber"
        role="img"
        aria-label={t('offenders.change.trackAria')}
      >
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p) => (
          <circle key={p.year} cx={p.x} cy={p.y} r="1.6" fill="currentColor" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-0.5">
        {series.map((s) => (
          <span
            key={s.year}
            className="num text-[10px] text-muted"
            title={t('offenders.change.trackHint', { year: s.year, g: fmtNum(s.avg, 1), n: fmtInt(s.n) })}
          >
            {s.year}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Format the numbers a flag was derived from into its explanatory line. */
function flagDetail(t, flag) {
  const v = flag.vars || {};
  switch (flag.id) {
    case 'gravityUp':
    case 'gravityDown':
      return t('offenders.change.gravityDetail', {
        early: fmtNum(v.early, 1),
        late: fmtNum(v.late, 1),
        delta: fmtNum(v.delta, 1),
      });
    case 'heinousUp':
      return t('offenders.change.heinousDetail', {
        early: fmtPct(v.early, { digits: 0 }),
        late: fmtPct(v.late, { digits: 0 }),
      });
    case 'tempoUp':
    case 'tempoDown':
      return t('offenders.change.tempoDetail', {
        pct: fmtPct(v.pct, { digits: 0 }),
        recent: fmtNum(v.recent, 1),
        base: fmtNum(v.base, 1),
      });
    case 'spreadUp':
      return t('offenders.change.spreadUpDetail', {
        n: fmtInt(v.n),
        early: fmtInt(v.early),
        late: fmtInt(v.late),
      });
    case 'spreadDown':
      return t('offenders.change.spreadDownDetail', {
        early: fmtInt(v.early),
        late: fmtInt(v.late),
      });
    case 'reactivated':
      return t('offenders.change.reactivatedDetail', {
        days: fmtInt(v.days),
        since: dateLabel(v.since),
        n: fmtInt(v.n),
      });
    case 'dormant':
      return t('offenders.change.dormantDetail', {
        days: fmtInt(v.days),
        last: dateLabel(v.last),
      });
    default:
      return '';
  }
}

export default function BehaviourChangeCard({ timeline = [] }) {
  const t = useT();
  const analysis = useMemo(() => behaviourFlags(timeline), [timeline]);
  const series = useMemo(() => gravitySeries(timeline), [timeline]);

  if (!analysis.enough) {
    return (
      <Card title={t('offenders.change.title')} subtitle={t('offenders.change.subtitle')}>
        <EmptyState compact title={t('offenders.change.thinTitle')} message={t('offenders.change.thinMsg')} />
      </Card>
    );
  }

  const escalating = analysis.flags.filter((f) => f.direction === 'up').length;

  return (
    <Card
      title={t('offenders.change.title')}
      subtitle={t('offenders.change.subtitle')}
      actions={escalating > 0
        ? <Badge tone="red" pulse>{t('offenders.change.escalatingBadge', { n: fmtInt(escalating) })}</Badge>
        : <Badge tone="teal">{t('offenders.change.steadyBadge')}</Badge>}
    >
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5" title={t('offenders.change.gravityHint')}>
          <p className="text-[10px] uppercase tracking-wide text-muted">{t('offenders.change.gravityNow')}</p>
          <p className="text-sm text-ink num">{fmtNum(analysis.gravityLate, 1)}</p>
        </div>
        <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5" title={t('offenders.change.tempoHint')}>
          <p className="text-[10px] uppercase tracking-wide text-muted">{t('offenders.change.tempoNow')}</p>
          <p className="text-sm text-ink num">{fmtNum(analysis.recentRate, 1)}</p>
        </div>
        <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5" title={t('offenders.change.gapHint')}>
          <p className="text-[10px] uppercase tracking-wide text-muted">{t('offenders.change.longestGap')}</p>
          <p className="text-sm text-ink num">{fmtInt(analysis.longestGapDays)}</p>
        </div>
      </div>

      {series.length >= 2 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('offenders.change.trackTitle')}</p>
          <GravityTrack series={series} />
        </div>
      )}

      <div className="mt-3 space-y-2">
        {analysis.flags.length ? (
          analysis.flags.map((f) => (
            <div
              key={f.id}
              className={`bg-base/60 border border-grid border-l-2 ${TONE_BORDER[f.tone] || TONE_BORDER.slate} rounded-lg px-3 py-2`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`text-[11px] shrink-0 mt-0.5 ${f.direction === 'up' ? 'text-signal' : 'text-teal'}`}
                  aria-hidden="true"
                >
                  {ARROW[f.direction] || '•'}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink">{t(`offenders.change.flag.${f.id}`)}</p>
                  <p className="text-[11px] text-muted mt-0.5 leading-4">{flagDetail(t, f)}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-base/60 border border-grid border-l-2 border-l-teal rounded-lg px-3 py-2">
            <p className="text-xs font-medium text-ink">{t('offenders.change.noFlags')}</p>
            <p className="text-[11px] text-muted mt-0.5 leading-4">{t('offenders.change.noFlagsMsg')}</p>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted mt-2.5 leading-5">
        <Tooltip label={t('offenders.change.methodHint')}>
          <Badge tone="slate" className="mr-1.5">{t('offenders.change.methodBadge')}</Badge>
        </Tooltip>
        {t('offenders.change.method', { n: fmtInt(analysis.activeMonths) })}
      </p>
    </Card>
  );
}
