// Pair analysis for the two people currently loaded in the path tool: do they
// have a direct shared FIR, how much of their associate circle overlaps
// (Jaccard), which people sit in both circles, and how many associates each
// keeps to themselves. This is the question a link chart is actually asked —
// "are these two connected, and through whom" — answered numerically.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { pairOverlap } from './analysis.js';

const CHIP_CAP = 10;

export default function PairAnalyzer({ edges = [], nodesById = new Map(), a = '', b = '', onSelectNode }) {
  const t = useT();
  const stats = useMemo(() => (a && b && a !== b ? pairOverlap(edges, a, b) : null), [edges, a, b]);

  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);

  if (!a || !b || a === b) {
    return (
      <Card title={t('network.pair.title')} subtitle={t('network.pair.subtitle')}>
        <EmptyState compact title={t('network.pair.emptyTitle')} message={t('network.pair.emptyMsg')} />
      </Card>
    );
  }

  const cell = (label, value, hint) => (
    <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5" title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-ink num">{value}</p>
    </div>
  );

  return (
    <Card
      title={t('network.pair.title')}
      subtitle={t('network.pair.subtitle')}
      actions={stats.direct > 0
        ? <Badge tone="amber">{t('network.pair.direct', { n: fmtInt(stats.direct) })}</Badge>
        : <Badge tone="slate">{t('network.pair.noDirect')}</Badge>}
    >
      <p className="text-[11px] text-ink mb-2 truncate">
        <span className="text-muted">A</span> {nameOf(a)} <span className="text-amber">↔</span>{' '}
        <span className="text-muted">B</span> {nameOf(b)}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cell(t('network.pair.shared'), fmtInt(stats.common.length), t('network.pair.sharedHint'))}
        {cell(t('network.pair.overlap'), fmtPct(stats.jaccard * 100, { digits: 0 }), t('network.pair.overlapHint'))}
        {cell(t('network.pair.onlyA'), fmtInt(stats.onlyA))}
        {cell(t('network.pair.onlyB'), fmtInt(stats.onlyB))}
      </div>
      {stats.common.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('network.pair.commonList')}</p>
          <div className="flex flex-wrap gap-1.5">
            {stats.common.slice(0, CHIP_CAP).map((id) => (
              <button
                key={id}
                type="button"
                className="chip !py-1 min-h-[36px] max-w-full hover:border-amber/50 transition-colors"
                onClick={() => { const n = nodesById.get(String(id)); if (n) onSelectNode?.(n); }}
                title={t('network.pair.chipHint')}
              >
                <span className="truncate">{nameOf(id)}</span>
              </button>
            ))}
            {stats.common.length > CHIP_CAP && (
              <span className="chip !py-1 min-h-[36px] text-muted">+{fmtInt(stats.common.length - CHIP_CAP)}</span>
            )}
          </div>
        </div>
      )}
      {stats.common.length === 0 && stats.direct === 0 && (
        <p className="text-[11px] text-muted mt-2">{t('network.pair.nothing')}</p>
      )}
    </Card>
  );
}
