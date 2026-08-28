// Selection drawers for the Network Explorer — offender panel on node tap
// (with bridge/cut-vertex context and a watchlist star), shared-case panel on
// edge tap (with tier badge and mutual-associate chips).
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useOffender } from '../../lib/api.js';
import Badge from '../../components/Badge.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { communityColor, edgeTier } from './graphUtils.js';
import { clusteringOf } from './analysis.js';
import { useCaseNames } from '../cases/names.js';
import { addToCompare, COMPARE_MAX } from '../offenders/compareStore.js';
import { useWatchlist, WATCH_MAX } from '../offenders/watchlistStore.js';

function DrawerShell({ title, subtitle, onClose, children }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted num truncate">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="flex h-10 w-10 -mt-2 -mr-2 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
          onClick={onClose}
          aria-label={t('network.drawer.close')}
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div className="bg-canvas/60 border border-grid rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-ink num">{children}</p>
    </div>
  );
}

/** Node tap → offender identity drawer (enriched via GET /offenders/:key). */
export function NodeDrawer({
  node, onClose, onIsolate, onSetPathEnd, onEgo, isEgo = false, broker = null, isCut = false,
  links = null, sharedFirs = null, coreness = null, viewEdges = null,
}) {
  const toast = useToast();
  const t = useT();
  const trName = useCaseNames();
  const detail = useOffender(node?.id || '');
  const d = detail.data || {};
  // Local closure: how tightly this person's co-accused know each other. Near 1
  // reads as a closed cell, near 0 as a hub introducing strangers.
  const cluster = useMemo(
    () => (viewEdges && node?.id ? clusteringOf(viewEdges, node.id) : null),
    [viewEdges, node?.id],
  );
  const hasCommunity = node?.communityId !== null && node?.communityId !== undefined && node?.communityId !== '';
  const { keys: watchKeys, toggle: toggleWatch } = useWatchlist();
  const watched = watchKeys.has(String(node?.id));

  const compare = () => {
    const r = addToCompare(node?.id);
    if (r.status === 'added') toast.success(t('network.toast.compareAdded', { name: node?.label || node?.id }));
    else if (r.status === 'exists') toast.info(t('network.toast.compareExists'));
    else toast.info(t('network.toast.compareFull', { n: fmtInt(COMPARE_MAX) }));
  };

  const watch = () => {
    const r = toggleWatch(node?.id, node?.label);
    if (r.status === 'added') toast.success(t('network.toast.watchAdded', { name: node?.label || node?.id }));
    else if (r.status === 'removed') toast.info(t('network.toast.watchRemoved'));
    else toast.info(t('network.toast.watchFull', { n: fmtInt(WATCH_MAX) }));
  };

  return (
    <DrawerShell
      title={(
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: communityColor(node?.communityId) }} />
          {node?.label || node?.id}
        </span>
      )}
      subtitle={node?.id}
      onClose={onClose}
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t('network.drawer.cases')}>{fmtInt(node?.caseCount)}</Stat>
        <Stat label={t('network.drawer.degree')}>{fmtInt(links ?? node?.links ?? node?.degree)}</Stat>
        <Stat label={t('network.drawer.risk')}>{detail.isLoading ? '…' : fmtNum(d.riskScore, 1)}</Stat>
      </div>

      {(coreness !== null || sharedFirs !== null || cluster) && (
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t('network.drawer.coreness')}>{fmtInt(coreness ?? node?.coreness ?? 0)}</Stat>
          <Stat label={t('network.drawer.sharedFirs')}>{fmtInt(sharedFirs ?? 0)}</Stat>
          <Stat label={t('network.drawer.cohesion')}>
            {cluster && cluster.degree >= 2 ? fmtPct(cluster.coeff * 100, { digits: 0 }) : '—'}
          </Stat>
        </div>
      )}

      {cluster && cluster.degree >= 4 && (
        <p className="text-[11px] text-muted">
          {t(cluster.coeff >= 0.4 ? 'network.drawer.cellRole' : 'network.drawer.hubRole', {
            n: fmtInt(cluster.triangles),
          })}
        </p>
      )}

      {(isCut || (broker && broker.crossLinks > 0)) && (
        <div className="flex flex-wrap gap-1.5">
          {isCut && (
            <Badge tone="red">{t('network.drawer.cutVertex')}</Badge>
          )}
          {broker && broker.crossLinks > 0 && (
            <Badge tone="amber">
              {t(broker.groups.size === 1 ? 'network.drawer.bridgeGroups.one' : 'network.drawer.bridgeGroups.other', { n: fmtInt(broker.groups.size) })}
              {' · '}
              {t(broker.crossLinks === 1 ? 'network.drawer.crossLinks.one' : 'network.drawer.crossLinks.other', { n: fmtInt(broker.crossLinks) })}
            </Badge>
          )}
        </div>
      )}

      {detail.isLoading && <LoadingSkeleton lines={3} />}
      {!detail.isLoading && !detail.error && (
        <>
          {(d.aliases || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('network.drawer.aliases')}</p>
              <div className="flex flex-wrap gap-1.5">
                {(d.aliases || []).slice(0, 5).map((a) => <span key={a} className="chip">{a}</span>)}
                {(d.aliases || []).length > 5 && <span className="chip text-muted">+{(d.aliases || []).length - 5}</span>}
              </div>
            </div>
          )}
          {(d.moTags || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('network.drawer.moTags')}</p>
              <div className="flex flex-wrap gap-1.5">
                {(d.moTags || []).slice(0, 6).map((tag) => <Badge key={tag} tone="amber">{tag}</Badge>)}
              </div>
            </div>
          )}
          {(d.districts || []).length > 0 && (
            <p className="text-[11px] text-muted">
              {t('network.drawer.activeIn')}{' '}
              <span className="text-ink">{(d.districts || []).map((n) => trName('districts', n)).join(', ')}</span>
            </p>
          )}
        </>
      )}
      {detail.error && (
        <p className="text-[11px] text-muted">{t('network.drawer.profileUnavailable', { msg: detail.error.message })}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Link to={`/offenders/${encodeURIComponent(node?.id || '')}`} className="btn-primary !py-1.5 !px-3 text-xs min-h-[40px]">
          {t('network.drawer.offender360')}
        </Link>
        {hasCommunity && (
          <button type="button" className="btn !py-1.5 !px-3 text-xs min-h-[40px]" onClick={() => onIsolate?.(node.communityId)}>
            {t('network.drawer.isolateGroup', { id: String(node.communityId) })}
          </button>
        )}
        {onEgo && (
          <button
            type="button"
            className={`btn !py-1.5 !px-3 text-xs min-h-[40px] ${isEgo ? '!border-teal/60 text-teal' : ''}`}
            onClick={() => onEgo(isEgo ? null : node?.id)}
          >
            {isEgo ? t('network.ego.exit') : t('network.ego.focus')}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn !py-1.5 !px-2.5 text-[11px] min-h-[40px]" onClick={() => onSetPathEnd?.('a', node?.id)}>
          {t('network.drawer.setPathA')}
        </button>
        <button type="button" className="btn !py-1.5 !px-2.5 text-[11px] min-h-[40px]" onClick={() => onSetPathEnd?.('b', node?.id)}>
          {t('network.drawer.setPathB')}
        </button>
        <button type="button" className="btn !py-1.5 !px-2.5 text-[11px] min-h-[40px]" onClick={compare}>
          {t('network.drawer.addCompare')}
        </button>
        <button
          type="button"
          className={`btn !py-1.5 !px-2.5 text-[11px] min-h-[40px] ${watched ? '!border-amber/60 text-amber' : ''}`}
          onClick={watch}
          aria-pressed={watched}
          title={watched ? t('network.drawer.unwatchHint') : t('network.drawer.watchHint')}
        >
          {watched ? t('network.drawer.watching') : t('network.drawer.watch')}
        </button>
      </div>
    </DrawerShell>
  );
}

const TIER_META = {
  single: { key: 'network.edge.tierSingle', tone: 'slate' },
  repeat: { key: 'network.edge.tierRepeat', tone: 'amber' },
  strong: { key: 'network.edge.tierStrong', tone: 'red' },
};

/** Edge tap → shared-case list between the two endpoints. */
export function EdgeDrawer({ edge, nodesById, onClose, onSelectNode, mutuals = [] }) {
  const t = useT();
  const a = nodesById.get(String(edge?.source));
  const b = nodesById.get(String(edge?.target));
  const caseIds = edge?.caseIds || [];
  const tier = TIER_META[edgeTier(edge?.weight)];

  const endpoint = (n, fallbackId) => (
    <button
      type="button"
      className="chip !py-1.5 min-h-[40px] hover:border-amber/50 transition-colors max-w-full"
      onClick={() => n && onSelectNode?.(n)}
      title={t('network.edge.openPerson')}
    >
      <span className="truncate">{n?.label || fallbackId}</span>
    </button>
  );

  return (
    <DrawerShell
      title={t('network.edge.title')}
      subtitle={t(Number(edge?.weight) === 1 ? 'network.edge.together.one' : 'network.edge.together.other', { n: fmtInt(edge?.weight) })}
      onClose={onClose}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {endpoint(a, edge?.source)}
        <span className="text-muted text-xs shrink-0">↔</span>
        {endpoint(b, edge?.target)}
      </div>
      <div>
        <Badge tone={tier.tone}>{t(tier.key)}</Badge>
      </div>
      {mutuals.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
            {t('network.edge.mutuals', { n: fmtInt(mutuals.length) })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {mutuals.slice(0, 8).map((m) => (
              <button
                key={String(m.id)}
                type="button"
                className="chip !py-1 min-h-[36px] hover:border-amber/50 transition-colors max-w-full"
                onClick={() => onSelectNode?.(m)}
                title={t('network.edge.mutualHint')}
              >
                <span className="truncate">{m.label || String(m.id)}</span>
              </button>
            ))}
            {mutuals.length > 8 && <span className="chip !py-1 min-h-[36px] text-muted">+{mutuals.length - 8}</span>}
          </div>
        </div>
      )}
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('network.edge.sharedCases')}</p>
        {caseIds.length === 0 ? (
          <p className="text-[11px] text-muted">{t('network.edge.noCaseIds')}</p>
        ) : (
          <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {caseIds.map((cid) => (
              <li key={cid}>
                <Link
                  to={`/cases/${encodeURIComponent(cid)}`}
                  className="inline-flex items-center min-h-[36px] text-xs text-amber hover:underline num break-all"
                >
                  {t('network.edge.caseLink', { id: String(cid) })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DrawerShell>
  );
}
