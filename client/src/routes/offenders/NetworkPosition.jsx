// Structural position of one offender inside the whole co-accusal network —
// the C5 read that a profile page cannot get from /offenders/:key alone,
// because it needs the other 23,832 links.
//
// Reports: true partner count and Σ shared FIRs (the API's `degree` field is a
// normalized 0–1 centrality, useless as a count), k-core depth, local cohesion,
// cross-community reach, rank among all linked persons, repeat-partner census,
// and the second-degree ring with the intermediaries who reach it.
//
// The graph is a large payload, so the body — which owns the query — only
// mounts once the analyst expands the card; the fetch is then shared with the
// Network Explorer through React Query.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNetworkGraph } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { communityColor } from '../network/graphUtils.js';
import {
  degreeIndex, corenessMap, clusteringOf, secondDegree,
} from '../network/analysis.js';
import { readPref, writePref } from '../network/hooks.js';

const OPEN_PREF = 'dappa-o360-network';
const SECOND_CAP = 10;

// `title` rather than the CSS Tooltip: these tiles are grid children, and
// wrapping them in the tooltip's inline-flex span breaks the stretch.
function Cell({ label, value, hint }) {
  return (
    <div className="bg-canvas/60 border border-grid rounded-lg px-2.5 py-1.5" title={hint}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-ink num">{value}</p>
    </div>
  );
}

function PositionBody({ personKey, communityId, nameByKey }) {
  const t = useT();
  const graph = useNetworkGraph({});

  const analysis = useMemo(() => {
    const edges = graph.data?.edges || [];
    const nodes = graph.data?.nodes || [];
    if (!edges.length) return null;
    const key = String(personKey);
    const deg = degreeIndex(edges);
    const mine = deg.get(key);
    if (!mine) return { linked: false, population: deg.size };
    const { core } = corenessMap(nodes.length ? nodes : [...deg.keys()].map((id) => ({ id })), edges);
    const cluster = clusteringOf(edges, key);
    const commOf = new Map();
    for (const n of nodes) {
      const cid = n?.communityId;
      commOf.set(String(n.id), cid === null || cid === undefined || cid === '' ? '' : String(cid));
    }
    const own = commOf.get(key) || '';
    const partners = [];
    const reachedGroups = new Set();
    let repeat = 0; let strongest = null;
    for (const e of edges) {
      const s = String(e.source); const tg = String(e.target);
      if (s !== key && tg !== key) continue;
      const other = s === key ? tg : s;
      const w = Number(e.weight) || 1;
      partners.push({ personKey: other, weight: w });
      if (w >= 2) repeat += 1;
      if (!strongest || w > strongest.weight) strongest = { personKey: other, weight: w };
      const oc = commOf.get(other) || '';
      if (own && oc && oc !== own) reachedGroups.add(oc);
    }
    let better = 0;
    for (const s of deg.values()) if (s.links > mine.links) better += 1;
    return {
      linked: true,
      population: deg.size,
      links: mine.links,
      sharedFirs: mine.weight,
      cases: mine.cases,
      coreness: core.get(key) || 0,
      cohesion: cluster.coeff,
      triangles: cluster.triangles,
      repeat,
      strongest,
      reachedGroups: reachedGroups.size,
      rank: better + 1,
      percentile: deg.size > 1 ? 1 - better / deg.size : 1,
      second: secondDegree(edges, key, { limit: SECOND_CAP }),
      own,
    };
  }, [graph.data, personKey]);

  if (graph.isLoading) return <LoadingSkeleton lines={6} />;
  if (graph.error) {
    return (
      <EmptyState
        compact
        title={t('network.pos.errorTitle')}
        message={graph.error.message}
        action={<button type="button" className="btn" onClick={() => graph.refetch()}>{t('common.action.retry')}</button>}
      />
    );
  }
  if (!analysis) return <EmptyState compact title={t('network.pos.noGraphTitle')} message={t('network.pos.noGraphMsg')} />;
  if (!analysis.linked) {
    return <EmptyState compact title={t('network.pos.isolatedTitle')} message={t('network.pos.isolatedMsg', { n: fmtInt(analysis.population) })} />;
  }

  const nameOf = (k) => nameByKey.get(String(k)) || String(k);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Cell label={t('network.pos.partners')} value={fmtInt(analysis.links)} hint={t('network.pos.partnersHint')} />
        <Cell label={t('network.pos.sharedFirs')} value={fmtInt(analysis.sharedFirs)} hint={t('network.pos.sharedFirsHint')} />
        <Cell label={t('network.pos.coreness')} value={fmtInt(analysis.coreness)} hint={t('network.pos.corenessHint')} />
        <Cell
          label={t('network.pos.cohesion')}
          value={analysis.links >= 2 ? fmtPct(analysis.cohesion * 100, { digits: 0 }) : '—'}
          hint={t('network.pos.cohesionHint')}
        />
        <Cell label={t('network.pos.repeatPartners')} value={fmtInt(analysis.repeat)} hint={t('network.pos.repeatPartnersHint')} />
        <Cell label={t('network.pos.reach')} value={fmtInt(analysis.reachedGroups)} hint={t('network.pos.reachHint')} />
      </div>

      <p className="text-[11px] text-muted">
        {t('network.pos.rankLine', {
          rank: fmtInt(analysis.rank),
          total: fmtInt(analysis.population),
          // One decimal: rank 3 of 2,002 is 99.9%, and rounding that to a flat
          // "100%" would claim the person outranks everyone, including
          // themselves and the two people actually above them.
          pct: fmtPct(analysis.percentile * 100, { digits: 1 }),
        })}
      </p>

      {analysis.links >= 4 && (
        <p className="text-[11px] text-muted">
          {t(analysis.cohesion >= 0.4 ? 'network.pos.roleCell' : 'network.pos.roleHub', {
            n: fmtInt(analysis.triangles),
          })}
        </p>
      )}

      {analysis.strongest && (
        <p className="text-[11px] text-muted">
          {t('network.pos.strongest')}{' '}
          <Link to={`/offenders/${encodeURIComponent(analysis.strongest.personKey)}`} className="text-ink hover:text-amber transition-colors">
            {nameOf(analysis.strongest.personKey)}
          </Link>{' '}
          <Badge tone="amber">
            {t(analysis.strongest.weight === 1 ? 'network.edge.together.one' : 'network.edge.together.other',
              { n: fmtInt(analysis.strongest.weight) })}
          </Badge>
        </p>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('network.pos.secondTitle')}</p>
        {analysis.second.length === 0 ? (
          <p className="text-[11px] text-muted">{t('network.pos.secondEmpty')}</p>
        ) : (
          <ul className="divide-y divide-grid/40">
            {analysis.second.map((s) => (
              <li key={s.personKey} className="py-1 first:pt-0 last:pb-0">
                <Link
                  to={`/offenders/${encodeURIComponent(s.personKey)}`}
                  className="flex items-center gap-2 min-h-[36px] group"
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(communityId) }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-ink truncate group-hover:text-amber transition-colors">{nameOf(s.personKey)}</span>
                    <span className="block text-[10px] text-muted truncate">
                      {t('network.pos.via', { list: s.via.map(nameOf).join(', ') })}
                    </span>
                  </span>
                  <Badge tone="slate">{t('network.pos.paths', { n: fmtInt(s.paths) })}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[10px] text-muted">{t('network.pos.footnote')}</p>
    </div>
  );
}

export default function NetworkPosition({ personKey, communityId, nameByKey = new Map() }) {
  const t = useT();
  const [open, setOpen] = useState(() => readPref(OPEN_PREF, '0') === '1');
  const toggle = () => setOpen((v) => { writePref(OPEN_PREF, v ? '0' : '1'); return !v; });

  return (
    <Card
      title={t('network.pos.title')}
      subtitle={t('network.pos.subtitle')}
      actions={(
        <button type="button" className="btn !py-1.5 !px-2.5 text-xs min-h-[40px] no-print" onClick={toggle} aria-expanded={open}>
          {open ? t('network.legend.hide') : t('network.pos.load')}
        </button>
      )}
    >
      {open
        ? <PositionBody personKey={personKey} communityId={communityId} nameByKey={nameByKey} />
        : <p className="text-[11px] text-muted">{t('network.pos.collapsed')}</p>}
    </Card>
  );
}
