// Community detail panel — shown while a community is isolated. Aggregates the
// FILTERED view (so edge-tier / degree filters are respected): member count,
// distinct cases, districts, graph density, top MO tags (from the offender
// registry), key connector (most cross-community links, from brokerStats over
// the FULL graph), plus a fly-to member list.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { communityColor } from './graphUtils.js';

const MEMBER_CAP = 12;
const MO_CAP = 5;

export default function CommunitySummary({
  communityId, community, nodes = [], edges = [], onPick, onClear,
  profilesByKey = new Map(), brokers = new Map(),
}) {
  const stats = useMemo(() => {
    const n = nodes.length;
    const e = edges.length;
    const density = n > 1 ? (2 * e) / (n * (n - 1)) : 0;
    const members = [...nodes].sort(
      (a, b) => (Number(b.degree) || 0) - (Number(a.degree) || 0) || (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0),
    );
    return { n, e, density, members };
  }, [nodes, edges]);

  const topMo = useMemo(() => {
    const freq = new Map();
    for (const n of nodes) {
      for (const t of profilesByKey.get(String(n.id))?.moTags || []) freq.set(t, (freq.get(t) || 0) + 1);
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MO_CAP);
  }, [nodes, profilesByKey]);

  const keyConnector = useMemo(() => {
    let best = null;
    for (const n of nodes) {
      const s = brokers.get(String(n.id));
      if (s && s.crossLinks > 0 && (!best || s.score > best.stat.score)) best = { node: n, stat: s };
    }
    return best;
  }, [nodes, brokers]);

  const cell = (label, value) => (
    <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-ink num">{value}</p>
    </div>
  );

  return (
    <Card
      title={(
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: communityColor(communityId) }} aria-hidden="true" />
          Group #{String(communityId)}
        </span>
      )}
      subtitle="Isolated community — numbers respect the current link filters"
      actions={(
        <button type="button" className="btn-ghost !py-1.5 !px-2.5 text-[11px] min-h-[40px]" onClick={onClear}>
          Show all
        </button>
      )}
    >
      <div className="grid grid-cols-2 gap-2 mb-3">
        {cell('Members', fmtInt(stats.n))}
        {cell('Cases', fmtInt(community?.cases))}
        {cell('Districts', fmtInt(community?.districts))}
        {cell('Density', stats.n > 1 ? fmtPct(stats.density * 100, { digits: 0, fraction: false }) : '—')}
      </div>
      {topMo.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Top MO tags</p>
          <div className="flex flex-wrap gap-1.5">
            {topMo.map(([tag, count]) => (
              <span key={tag} className="chip !py-0.5 text-[10px]">
                {tag}
                <span className="num text-muted">{fmtInt(count)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {keyConnector && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Key connector</p>
          <button
            type="button"
            className="w-full min-h-[40px] flex items-center gap-2 text-left hover:text-amber transition-colors"
            onClick={() => onPick?.(keyConnector.node)}
            title="Select and fly to this member"
          >
            <span className="text-xs text-ink truncate flex-1 min-w-0">{keyConnector.node.label || String(keyConnector.node.id)}</span>
            <span className="num text-[11px] text-amber shrink-0">
              bridges {fmtInt(keyConnector.stat.groups.size)} group{keyConnector.stat.groups.size === 1 ? '' : 's'}
            </span>
          </button>
        </div>
      )}
      {stats.members.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Members (by degree)</p>
          <ul className="divide-y divide-grid/40">
            {stats.members.slice(0, MEMBER_CAP).map((m) => (
              <li key={String(m.id)}>
                <button
                  type="button"
                  className="w-full min-h-[40px] flex items-center gap-2 py-1 text-left hover:text-amber transition-colors"
                  onClick={() => onPick?.(m)}
                  title="Select and fly to this member"
                >
                  <span className="text-xs text-ink truncate flex-1 min-w-0">{m.label || String(m.id)}</span>
                  <span className="num text-[11px] text-muted shrink-0">{fmtInt(m.degree)} links · {fmtInt(m.caseCount)} cases</span>
                </button>
              </li>
            ))}
          </ul>
          {stats.members.length > MEMBER_CAP && (
            <p className="text-[11px] text-muted mt-1.5">+{fmtInt(stats.members.length - MEMBER_CAP)} more members in the graph</p>
          )}
        </div>
      )}
    </Card>
  );
}
