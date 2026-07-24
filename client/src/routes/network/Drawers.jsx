// Selection drawers for the Network Explorer — offender panel on node tap,
// shared-case panel on edge tap.
import { Link } from 'react-router-dom';
import { useOffender } from '../../lib/api.js';
import Badge from '../../components/Badge.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { communityColor } from './graphUtils.js';

function DrawerShell({ title, subtitle, onClose, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted num truncate">{subtitle}</p>}
        </div>
        <button type="button" className="text-muted hover:text-ink text-sm leading-none px-1" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-ink num">{children}</p>
    </div>
  );
}

/** Node tap → offender identity drawer (enriched via GET /offenders/:key). */
export function NodeDrawer({ node, onClose, onIsolate, onSetPathEnd, onEgo, isEgo = false }) {
  const detail = useOffender(node?.id || '');
  const d = detail.data || {};
  const hasCommunity = node?.communityId !== null && node?.communityId !== undefined && node?.communityId !== '';

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
        <Stat label="Cases">{fmtInt(node?.caseCount)}</Stat>
        <Stat label="Degree">{fmtInt(node?.degree)}</Stat>
        <Stat label="Risk">{detail.isLoading ? '…' : fmtNum(d.riskScore, 1)}</Stat>
      </div>

      {detail.isLoading && <LoadingSkeleton lines={3} />}
      {!detail.isLoading && !detail.error && (
        <>
          {(d.aliases || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Aliases</p>
              <div className="flex flex-wrap gap-1.5">
                {(d.aliases || []).slice(0, 5).map((a) => <span key={a} className="chip">{a}</span>)}
                {(d.aliases || []).length > 5 && <span className="chip text-muted">+{(d.aliases || []).length - 5}</span>}
              </div>
            </div>
          )}
          {(d.moTags || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">MO tags</p>
              <div className="flex flex-wrap gap-1.5">
                {(d.moTags || []).slice(0, 6).map((t) => <Badge key={t} tone="amber">{t}</Badge>)}
              </div>
            </div>
          )}
          {(d.districts || []).length > 0 && (
            <p className="text-[11px] text-muted">
              Active in <span className="text-ink">{(d.districts || []).join(', ')}</span>
            </p>
          )}
        </>
      )}
      {detail.error && <p className="text-[11px] text-muted">Profile detail unavailable — {detail.error.message}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <Link to={`/offenders/${encodeURIComponent(node?.id || '')}`} className="btn-primary !py-1.5 !px-3 text-xs">
          Offender 360 →
        </Link>
        {hasCommunity && (
          <button type="button" className="btn !py-1.5 !px-3 text-xs" onClick={() => onIsolate?.(node.communityId)}>
            Isolate group #{String(node.communityId)}
          </button>
        )}
        {onEgo && (
          <button
            type="button"
            className={`btn !py-1.5 !px-3 text-xs ${isEgo ? '!border-teal/60 text-teal' : ''}`}
            onClick={() => onEgo(isEgo ? null : node?.id)}
          >
            {isEgo ? 'Exit ego focus' : 'Focus ego network'}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn !py-1 !px-2 text-[11px]" onClick={() => onSetPathEnd?.('a', node?.id)}>
          Set as path A
        </button>
        <button type="button" className="btn !py-1 !px-2 text-[11px]" onClick={() => onSetPathEnd?.('b', node?.id)}>
          Set as path B
        </button>
      </div>
    </DrawerShell>
  );
}

/** Edge tap → shared-case list between the two endpoints. */
export function EdgeDrawer({ edge, nodesById, onClose, onSelectNode }) {
  const a = nodesById.get(String(edge?.source));
  const b = nodesById.get(String(edge?.target));
  const caseIds = edge?.caseIds || [];

  const endpoint = (n, fallbackId) => (
    <button
      type="button"
      className="chip hover:border-amber/50 transition-colors max-w-full"
      onClick={() => n && onSelectNode?.(n)}
      title="Open person panel"
    >
      <span className="truncate">{n?.label || fallbackId}</span>
    </button>
  );

  return (
    <DrawerShell title="Shared-case link" subtitle={`${fmtInt(edge?.weight)} case${Number(edge?.weight) === 1 ? '' : 's'} together`} onClose={onClose}>
      <div className="flex items-center gap-2 flex-wrap">
        {endpoint(a, edge?.source)}
        <span className="text-muted text-xs shrink-0">↔</span>
        {endpoint(b, edge?.target)}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1">Shared cases</p>
        {caseIds.length === 0 ? (
          <p className="text-[11px] text-muted">No case ids recorded on this link.</p>
        ) : (
          <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {caseIds.map((cid) => (
              <li key={cid}>
                <Link to={`/cases/${encodeURIComponent(cid)}`} className="text-xs text-amber hover:underline num break-all">
                  Case {String(cid)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DrawerShell>
  );
}
