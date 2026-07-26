// Hidden-association suggestions — pairs with NO recorded shared FIR that
// nonetheless share several co-accused. Scored with Adamic–Adar so a pair
// bridged by four low-profile associates outranks one bridged by a single hub.
// Selecting a row loads it into the pair tools (path + overlap) and highlights
// the two people and their common associates on the canvas.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { communityColor } from './graphUtils.js';
import { predictLinks } from './analysis.js';

const LIMITS = [8, 16, 30];

export default function LinkSuggestions({ edges = [], nodesById = new Map(), activeKey = '', onInspect }) {
  const t = useT();
  const [limit, setLimit] = useState(LIMITS[0]);

  const result = useMemo(() => predictLinks(edges, { limit: LIMITS[LIMITS.length - 1] }), [edges]);
  const rows = result.rows.slice(0, limit);
  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);

  return (
    <Card
      title={t('network.predict.title')}
      subtitle={t('network.predict.subtitle')}
      actions={result.truncated ? <Badge tone="slate">{t('network.predict.bounded')}</Badge> : null}
      padded={false}
    >
      {rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.predict.emptyTitle')} message={t('network.predict.emptyMsg')} />
        </div>
      ) : (
        <>
          <ol className="divide-y divide-grid/50">
            {rows.map((r) => {
              const key = `${r.a}~~${r.b}`;
              const active = activeKey === key;
              const na = nodesById.get(String(r.a));
              const nb = nodesById.get(String(r.b));
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`w-full px-4 py-2 min-h-[52px] text-left transition-colors ${active ? 'bg-grid/40' : 'hover:bg-grid/30'}`}
                    onClick={() => onInspect?.(r)}
                    aria-pressed={active}
                    title={t('network.predict.rowHint')}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(na?.communityId) }} aria-hidden="true" />
                      <span className="text-xs text-ink truncate min-w-0">{nameOf(r.a)}</span>
                      <span className="text-muted text-[11px] shrink-0">⋯</span>
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(nb?.communityId) }} aria-hidden="true" />
                      <span className="text-xs text-ink truncate min-w-0">{nameOf(r.b)}</span>
                      <span className="num text-[11px] text-amber ml-auto shrink-0">{fmtNum(r.score, 2)}</span>
                    </div>
                    <p className="text-[10px] text-muted mt-0.5 truncate">
                      {t(r.common === 1 ? 'network.predict.common.one' : 'network.predict.common.other', { n: fmtInt(r.common) })}
                      {r.via.length > 0 && <> · {r.via.slice(0, 3).map(nameOf).join(', ')}</>}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-t border-grid/60">
            <span className="text-[10px] text-muted">{t('network.predict.footnote')}</span>
            {limit < result.rows.length && (
              <button
                type="button"
                className="btn-ghost !py-1 !px-2 text-[11px] min-h-[36px] ml-auto"
                onClick={() => setLimit((v) => LIMITS.find((x) => x > v) || result.rows.length)}
              >
                {t('network.predict.more')}
              </button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
