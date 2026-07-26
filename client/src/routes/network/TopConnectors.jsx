// Top connectors — the 10 highest-degree people in the current view. Every row
// is a real button (keyboard path to node selection, unlike the canvas) that
// selects the person and flies the camera to them.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { communityColor } from './graphUtils.js';

export default function TopConnectors({ nodes = [], degrees = new Map(), onPick }) {
  const t = useT();
  // `degrees` carries the TRUE partner count read off the edges — the node's
  // own `degree` field is a normalized 0–1 centrality on live data, which used
  // to render every connector as "0 links".
  const linksOf = (n) => degrees.get(String(n.id))?.links ?? (Number(n.degree) || 0);
  const top = useMemo(
    () => [...nodes]
      .sort((a, b) => (degrees.get(String(b.id))?.links ?? (Number(b.degree) || 0))
        - (degrees.get(String(a.id))?.links ?? (Number(a.degree) || 0))
        || (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0))
      .slice(0, 10),
    [nodes, degrees],
  );

  if (!top.length) return null;

  return (
    <Card title={t('network.connectors.title')} subtitle={t('network.connectors.subtitle')} padded={false}>
      <ol className="divide-y divide-grid/50">
        {top.map((n, i) => (
          <li key={String(n.id)}>
            <button
              type="button"
              className="w-full min-h-[44px] flex items-center gap-2 px-4 py-1.5 text-left hover:bg-grid/30 transition-colors"
              onClick={() => onPick?.(n)}
              title={t('network.connectors.pickHint')}
            >
              <span className="num text-[10px] text-muted w-4 shrink-0">{i + 1}</span>
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(n.communityId) }} aria-hidden="true" />
              <span className="text-xs text-ink truncate flex-1 min-w-0">{n.label || String(n.id)}</span>
              <span className="num text-[11px] text-muted shrink-0">{t('network.stat.links', { n: fmtInt(linksOf(n)) })}</span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
