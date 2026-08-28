// Repeat co-offending pairs for the Offenders registry — the crews that keep
// turning up on the SAME FIR. On the live graph 1,033 of the 23,833 links carry
// two shared cases and 68 carry three or more, so this is the short list of
// people who demonstrably operate together rather than people who once shared a
// charge sheet.
//
// The co-accused graph is a large payload, so the card is collapsed by default
// and the body — which owns the query hook — only mounts when the analyst opens
// it. React Query then shares that fetch with the Network Explorer.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNetworkGraph } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { communityColor } from '../network/graphUtils.js';
import { degreeIndex, repeatPairs } from '../network/analysis.js';
import { readPref, writePref } from '../network/hooks.js';
import { RiskBadge } from './common.jsx';

const OPEN_PREF = 'dappa-off-pairs';
const ROW_CAP = 15;

function PairsBody({ rowsByKey, minWeight, onMinWeight }) {
  const t = useT();
  const graph = useNetworkGraph({});

  const stats = useMemo(() => {
    const edges = graph.data?.edges || [];
    const deg = degreeIndex(edges);
    let repeat = 0; let strong = 0;
    for (const e of edges) {
      const w = Number(e.weight) || 0;
      if (w >= 2) repeat += 1;
      if (w >= 3) strong += 1;
    }
    return { linked: deg.size, links: edges.length, repeat, strong, deg };
  }, [graph.data]);

  const pairs = useMemo(
    () => repeatPairs(graph.data?.edges || [], { minWeight, limit: ROW_CAP }),
    [graph.data, minWeight],
  );

  if (graph.isLoading) return <LoadingSkeleton lines={6} />;
  if (graph.error) {
    return (
      <EmptyState
        compact
        title={t('network.pairs.errorTitle')}
        message={graph.error.message}
        action={<button type="button" className="btn" onClick={() => graph.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }

  const nameOf = (k) => rowsByKey.get(String(k))?.canonicalName || String(k);
  const rowOf = (k) => rowsByKey.get(String(k));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['network.pairs.kpiLinked', stats.linked],
          ['network.pairs.kpiLinks', stats.links],
          ['network.pairs.kpiRepeat', stats.repeat],
          ['network.pairs.kpiStrong', stats.strong],
        ].map(([key, value]) => (
          <div key={key} className="bg-canvas/60 border border-grid rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted">{t(key)}</p>
            <p className="text-sm text-ink num">{fmtInt(value)}</p>
          </div>
        ))}
      </div>

      <SegmentedControl
        ariaLabel={t('network.pairs.minAria')}
        value={String(minWeight)}
        onChange={(v) => onMinWeight(Number(v))}
        options={[
          { value: '2', label: t('network.pairs.min2') },
          { value: '3', label: t('network.pairs.min3') },
          { value: '4', label: t('network.pairs.min4') },
        ]}
      />

      {pairs.length === 0 ? (
        <EmptyState compact title={t('network.pairs.emptyTitle')} message={t('network.pairs.emptyMsg')} />
      ) : (
        <ol className="divide-y divide-grid/50">
          {pairs.map((p) => {
            const ra = rowOf(p.a); const rb = rowOf(p.b);
            return (
              <li key={`${p.a}~${p.b}`} className="py-1.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(ra?.communityId) }} aria-hidden="true" />
                  <Link to={`/offenders/${encodeURIComponent(p.a)}`} className="text-xs text-ink hover:text-amber transition-colors truncate max-w-[9rem]">
                    {nameOf(p.a)}
                  </Link>
                  {ra && <RiskBadge score={ra.riskScore} />}
                  <span className="text-amber text-[11px]">↔</span>
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(rb?.communityId) }} aria-hidden="true" />
                  <Link to={`/offenders/${encodeURIComponent(p.b)}`} className="text-xs text-ink hover:text-amber transition-colors truncate max-w-[9rem]">
                    {nameOf(p.b)}
                  </Link>
                  {rb && <RiskBadge score={rb.riskScore} />}
                  <span className="ml-auto flex items-center gap-1.5 shrink-0">
                    <Badge tone={p.weight >= 3 ? 'red' : 'amber'}>
                      {t(p.weight === 1 ? 'network.edge.together.one' : 'network.edge.together.other', { n: fmtInt(p.weight) })}
                    </Badge>
                    <Link
                      to={`/network?focus=${encodeURIComponent(p.a)}${ra?.communityId != null ? `&communityId=${encodeURIComponent(ra.communityId)}` : ''}`}
                      className="chip !py-0 text-[10px] hover:border-amber/50 transition-colors"
                      title={t('network.pairs.openNetwork')}
                    >
                      {t('network.pairs.graph')}
                    </Link>
                  </span>
                </div>
                {p.caseIds.length > 0 && (
                  <p className="text-[10px] text-muted num mt-0.5 truncate">
                    {t('network.pairs.caseIds', { list: p.caseIds.slice(0, 6).join(', ') })}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-[10px] text-muted">{t('network.pairs.footnote')}</p>
    </div>
  );
}

export default function CoOffendingPairs({ rowsByKey = new Map() }) {
  const t = useT();
  const [open, setOpen] = useState(() => readPref(OPEN_PREF, '0') === '1');
  const [minWeight, setMinWeight] = useState(2);
  const toggle = () => setOpen((v) => { writePref(OPEN_PREF, v ? '0' : '1'); return !v; });

  return (
    <Card
      title={t('network.pairs.title')}
      subtitle={t('network.pairs.subtitle')}
      actions={(
        <button type="button" className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]" onClick={toggle} aria-expanded={open}>
          {open ? t('network.legend.hide') : t('network.pairs.load')}
        </button>
      )}
      padded={open}
    >
      {open && <PairsBody rowsByKey={rowsByKey} minWeight={minWeight} onMinWeight={setMinWeight} />}
    </Card>
  );
}
