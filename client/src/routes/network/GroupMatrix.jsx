// Inter-group contact matrix — how many co-accused links run between each pair
// of detected communities. The diagonal is internal cohesion; every off-
// diagonal cell is an organised-crime contact surface between two crews.
// Clicking a diagonal cell isolates that group; clicking an off-diagonal cell
// highlights exactly the links that cross between the two.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { communityColor } from './graphUtils.js';
import { communityMatrix } from './analysis.js';
import { readPref, writePref } from './hooks.js';

const OPEN_PREF = 'dappa-net-group-matrix';
const CAP = 10;

export default function GroupMatrix({ nodes = [], edges = [], activePair = null, onIsolate, onPickPair }) {
  const t = useT();
  const [open, setOpen] = useState(() => readPref(OPEN_PREF, '1') !== '0');
  const toggle = () => setOpen((v) => { writePref(OPEN_PREF, v ? '0' : '1'); return !v; });

  const grid = useMemo(() => {
    const m = communityMatrix(nodes, edges);
    if (m.ids.length <= CAP) return m;
    // Keep the busiest groups — total contact volume, diagonal included.
    const vol = m.ids.map((id, i) => [i, m.matrix[i].reduce((s, v) => s + v, 0)]);
    const keep = vol.sort((a, b) => b[1] - a[1]).slice(0, CAP).map(([i]) => i).sort((a, b) => a - b);
    return {
      ids: keep.map((i) => m.ids[i]),
      matrix: keep.map((i) => keep.map((j) => m.matrix[i][j])),
      maxCross: m.maxCross,
      totalCross: m.totalCross,
      capped: m.ids.length,
    };
  }, [nodes, edges]);

  if (grid.ids.length < 2) return null;

  const cellTone = (v, i, j) => {
    if (!v) return 'bg-grid/20';
    if (i === j) return 'bg-teal/25';
    const ratio = Math.min(1, v / grid.maxCross);
    if (ratio > 0.66) return 'bg-amber/70';
    if (ratio > 0.33) return 'bg-amber/45';
    return 'bg-amber/20';
  };

  return (
    <Card
      title={t('network.matrix.title')}
      subtitle={t('network.matrix.subtitle')}
      actions={(
        <div className="flex items-center gap-2">
          <Badge tone="amber">{t('network.matrix.crossCount', { n: fmtInt(grid.totalCross) })}</Badge>
          <button type="button" className="btn-ghost !py-1.5 !px-2.5 text-[11px] min-h-[40px]" onClick={toggle} aria-expanded={open}>
            {open ? t('network.legend.hide') : t('network.legend.show')}
          </button>
        </div>
      )}
    >
      {!open ? null : grid.totalCross === 0 && grid.ids.length < 2 ? (
        <EmptyState compact title={t('network.matrix.emptyTitle')} message={t('network.matrix.emptyMsg')} />
      ) : (
        <div className="overflow-x-auto -mx-1 px-1" tabIndex={0} role="region" aria-label={t('network.matrix.caption')}>
          <table className="border-separate border-spacing-0.5 text-[10px]">
            <caption className="sr-only">{t('network.matrix.caption')}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-10" />
                {grid.ids.map((c) => (
                  <th key={c} scope="col" className="px-1 py-0.5 font-normal text-muted whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: communityColor(c) }} aria-hidden="true" />
                      {String(c)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.ids.map((rowId, i) => (
                <tr key={rowId}>
                  <th scope="row" className="pr-1 font-normal text-muted whitespace-nowrap text-right">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: communityColor(rowId) }} aria-hidden="true" />
                      {String(rowId)}
                    </span>
                  </th>
                  {grid.ids.map((colId, j) => {
                    const v = grid.matrix[i][j];
                    const isActive = activePair
                      && ((activePair[0] === String(rowId) && activePair[1] === String(colId))
                        || (activePair[0] === String(colId) && activePair[1] === String(rowId)));
                    return (
                      <td key={colId} className="p-0">
                        <button
                          type="button"
                          disabled={!v}
                          className={`h-8 w-8 sm:h-9 sm:w-9 rounded-sm num text-[10px] transition-colors ${cellTone(v, i, j)} ${
                            v ? 'text-ink hover:ring-1 hover:ring-amber/70' : 'text-muted cursor-default'
                          } ${isActive ? 'ring-2 ring-amber' : ''}`}
                          onClick={() => {
                            if (!v) return;
                            if (i === j) onIsolate?.(String(rowId));
                            else onPickPair?.(String(rowId), String(colId));
                          }}
                          title={t(i === j ? 'network.matrix.diagTitle' : 'network.matrix.pairTitle', {
                            a: String(rowId), b: String(colId), n: fmtInt(v),
                          })}
                        >
                          {v || ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted mt-2">
            {t('network.matrix.footnote')}
            {grid.capped ? ` · ${t('network.matrix.capped', { n: fmtInt(CAP), total: fmtInt(grid.capped) })}` : ''}
          </p>
        </div>
      )}
    </Card>
  );
}
