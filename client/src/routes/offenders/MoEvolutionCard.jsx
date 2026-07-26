// MO evolution — how one person's repertoire shifts across FirstSeen..LastSeen:
// the year-by-year offence mix, what entered and left the repertoire, and
// whether the trend reads as diversification or specialisation.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { moEvolution } from './behaviour.js';
import { useRefNames } from './common.jsx';

const DIR_TONE = { diversifying: 'amber', specialising: 'teal', stable: 'slate' };

/** Stacked year bars — one column per year, segments per offence label. */
function MixBars({ evolution, labelOf, palette }) {
  const t = useT();
  const max = Math.max(1, ...evolution.byYear.map((y) => y.total));
  return (
    <div className="flex items-end gap-2 h-32" role="img" aria-label={t('offenders.evo.mixAria')}>
      {evolution.byYear.map((y) => (
        <div key={y.year} className="flex-1 min-w-0 flex flex-col items-center gap-1">
          <div
            className="w-full flex flex-col-reverse rounded-t-md overflow-hidden bg-grid/30"
            style={{ height: `${Math.max(6, (y.total / max) * 100)}%` }}
            title={t('offenders.evo.yearHint', {
              year: y.year,
              n: fmtInt(y.total),
              g: fmtNum(y.avgGravity, 1),
              h: fmtInt(y.heinous),
            })}
          >
            {[...y.counts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([label, n]) => (
                <div
                  key={label}
                  style={{ height: `${(n / y.total) * 100}%`, background: palette(label) }}
                  title={`${labelOf(label)} · ${fmtInt(n)}`}
                />
              ))}
          </div>
          <span className="num text-[10px] text-muted">{y.year}</span>
        </div>
      ))}
    </div>
  );
}

export default function MoEvolutionCard({ timeline = [] }) {
  const t = useT();
  const refNames = useRefNames();
  const [mode, setMode] = useState('subHeadName');

  const evolution = useMemo(() => moEvolution(timeline, { key: mode }), [timeline, mode]);

  const palette = useMemo(() => {
    const colors = ['#F5A623', '#2DD4BF', '#E5484D', '#7C9BFF', '#C084FC', '#F97316', '#38BDF8', '#A3E635'];
    const order = evolution ? evolution.labels : [];
    const map = new Map(order.map((l, i) => [l, colors[i % colors.length]]));
    return (label) => map.get(label) || '#8A94A8';
  }, [evolution]);

  const labelOf = (l) => (mode === 'headName' ? refNames.head(l) : refNames.subHead(l));

  if (!evolution || evolution.byYear.length < 2) {
    return (
      <Card title={t('offenders.evo.title')} subtitle={t('offenders.evo.subtitle')}>
        <EmptyState compact title={t('offenders.evo.thinTitle')} message={t('offenders.evo.thinMsg')} />
      </Card>
    );
  }

  return (
    <Card
      title={t('offenders.evo.title')}
      subtitle={t('offenders.evo.span', { from: evolution.firstYear, to: evolution.lastYear })}
      actions={(
        <SegmentedControl
          ariaLabel={t('offenders.evo.modeAria')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'subHeadName', label: t('offenders.evo.modeSub') },
            { value: 'headName', label: t('offenders.evo.modeHead') },
          ]}
        />
      )}
    >
      <MixBars evolution={evolution} labelOf={labelOf} palette={palette} />

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {evolution.labels.slice(0, 10).map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5 text-[10px] text-muted">
            <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: palette(l) }} />
            <span className="truncate max-w-[10rem]">{labelOf(l)}</span>
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Tooltip label={t('offenders.evo.directionHint')}>
          <Badge tone={DIR_TONE[evolution.direction]}>
            {t(`offenders.evo.dir.${evolution.direction}`)}
          </Badge>
        </Tooltip>
        <span className="text-[11px] text-muted num">
          {t('offenders.evo.entropyDelta', { d: fmtPct(evolution.entropyDelta * 100, { digits: 0, sign: true }) })}
        </span>
        <span className="text-[11px] text-muted">
          {t('offenders.evo.breadth', {
            early: fmtInt(evolution.breadthEarly),
            late: fmtInt(evolution.breadthLate),
          })}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <div className="bg-base/60 border border-grid rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
            {t('offenders.evo.entering', { n: fmtInt(evolution.entering.length) })}
          </p>
          {evolution.entering.length ? (
            <div className="flex flex-wrap gap-1">
              {evolution.entering.map((l) => (
                <span key={l} className="chip !py-0 text-[10px] !border-signal/40 text-signal">{labelOf(l)}</span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted">{t('offenders.evo.none')}</p>
          )}
        </div>
        <div className="bg-base/60 border border-grid rounded-lg px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
            {t('offenders.evo.leaving', { n: fmtInt(evolution.leaving.length) })}
          </p>
          {evolution.leaving.length ? (
            <div className="flex flex-wrap gap-1">
              {evolution.leaving.map((l) => (
                <span key={l} className="chip !py-0 text-[10px] !border-teal/40 text-teal">{labelOf(l)}</span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted">{t('offenders.evo.none')}</p>
          )}
        </div>
      </div>

      {evolution.retained.length > 0 && (
        <p className="text-[11px] text-muted mt-2 leading-5">
          <span className="uppercase tracking-wide text-[10px] mr-1">{t('offenders.evo.retained')}</span>
          {evolution.retained.slice(0, 8).map(labelOf).join(' · ')}
        </p>
      )}

      <p className="text-[11px] text-muted mt-2 leading-5">{t('offenders.evo.method')}</p>
    </Card>
  );
}
