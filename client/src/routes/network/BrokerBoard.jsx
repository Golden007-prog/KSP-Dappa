// Broker board — who actually holds this network together. Ranked by sampled
// Brandes betweenness over the visible view (the share of shortest association
// paths that run THROUGH a person), cross-referenced with k-core depth and
// cross-community reach. High betweenness + low core depth is the classic
// courier/fixer signature: structurally indispensable, socially peripheral.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { communityColor } from './graphUtils.js';
import { betweenness } from './analysis.js';

const ROW_CAP = 10;

export default function BrokerBoard({
  nodes = [], edges = [], degrees = new Map(), core = new Map(),
  brokers = new Map(), cutSet = new Set(), onPick,
}) {
  const t = useT();
  const [mode, setMode] = useState('between');

  const bc = useMemo(() => betweenness(nodes, edges, { sampleSize: 64 }), [nodes, edges]);

  const rows = useMemo(() => {
    const scored = nodes.map((n) => {
      const id = String(n.id);
      const b = brokers.get(id);
      return {
        node: n,
        id,
        between: bc.score.get(id) || 0,
        core: core.get(id) || 0,
        links: degrees.get(id)?.links || 0,
        groups: b ? b.groups.size : 0,
        cross: b ? b.crossLinks : 0,
        cut: cutSet.has(id),
      };
    });
    const key = mode === 'between' ? 'between' : mode === 'core' ? 'core' : 'groups';
    return scored
      .filter((r) => r[key] > 0)
      .sort((a, b) => b[key] - a[key] || b.links - a.links)
      .slice(0, ROW_CAP);
  }, [nodes, bc, brokers, core, degrees, cutSet, mode]);

  return (
    <Card
      title={t('network.broker.title')}
      subtitle={t('network.broker.subtitle')}
      padded={false}
      actions={(
        <SegmentedControl
          ariaLabel={t('network.broker.modeAria')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'between', label: t('network.broker.modeBetween') },
            { value: 'core', label: t('network.broker.modeCore') },
            { value: 'groups', label: t('network.broker.modeGroups') },
          ]}
        />
      )}
    >
      {rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.broker.emptyTitle')} message={t('network.broker.emptyMsg')} />
        </div>
      ) : (
        <ol className="divide-y divide-grid/50">
          {rows.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full min-h-[48px] flex items-center gap-2 px-4 py-1.5 text-left hover:bg-grid/30 transition-colors"
                onClick={() => onPick?.(r.node)}
                title={t('network.broker.pickHint')}
              >
                <span className="num text-[10px] text-muted w-4 shrink-0">{i + 1}</span>
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(r.node.communityId) }} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-ink truncate">{r.node.label || r.id}</span>
                  <span className="block text-[10px] text-muted num truncate">
                    {t('network.broker.rowStats', {
                      links: fmtInt(r.links),
                      core: fmtInt(r.core),
                      groups: fmtInt(r.groups),
                    })}
                  </span>
                </span>
                {r.cut && <Badge tone="red">{t('network.broker.cut')}</Badge>}
                <span className="num text-[11px] text-amber shrink-0">{fmtPct(r.between * 100, { digits: 0 })}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="px-4 py-2 border-t border-grid/60 flex flex-wrap items-center gap-2">
        <Tooltip label={t('network.broker.sampleHint')}>
          <span className="text-[10px] text-muted num">
            {t('network.broker.sample', { n: fmtInt(bc.sources), total: fmtInt(nodes.length) })}
          </span>
        </Tooltip>
        {bc.approx && <Badge tone="slate">{t('network.broker.approx')}</Badge>}
      </div>
    </Card>
  );
}
