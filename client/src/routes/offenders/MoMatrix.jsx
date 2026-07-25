// MO co-occurrence matrix — how often the top modus-operandi tags appear on
// the SAME offender across the rows currently passing every filter except the
// MO chips themselves (so the matrix stays stable while picking pairs).
// Cell click applies/clears both tags as an AND filter; header click toggles a
// single tag. Diagonal = tag total. Collapsible, state persisted.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { readPref, writePref } from '../network/hooks.js';

const OPEN_PREF = 'dappa-off-mo-matrix';
const TAG_CAP = 8;

export default function MoMatrix({ rows = [], selected = [], onPickPair }) {
  const t = useT();
  const [open, setOpen] = useState(() => readPref(OPEN_PREF, '1') !== '0');
  const toggleOpen = () => setOpen((v) => { writePref(OPEN_PREF, v ? '0' : '1'); return !v; });

  const grid = useMemo(() => {
    const freq = new Map();
    for (const r of rows) for (const tag of r.moTags || []) freq.set(tag, (freq.get(tag) || 0) + 1);
    const tags = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TAG_CAP)
      .map(([tag]) => tag);
    const idx = new Map(tags.map((tag, i) => [tag, i]));
    const m = tags.map(() => tags.map(() => 0));
    for (const r of rows) {
      const list = [...new Set(r.moTags || [])].filter((tag) => idx.has(tag));
      for (const a of list) for (const b of list) m[idx.get(a)][idx.get(b)] += 1;
    }
    let max = 0;
    for (let i = 0; i < tags.length; i += 1) {
      for (let j = 0; j < tags.length; j += 1) if (i !== j) max = Math.max(max, m[i][j]);
    }
    return { tags, m, max: Math.max(1, max) };
  }, [rows]);

  if (grid.tags.length < 2) return null;

  const isPairActive = (a, b) => selected.includes(a) && selected.includes(b);

  return (
    <Card
      title={t('network.mo.title')}
      subtitle={t('network.mo.subtitle')}
      padded={open}
      actions={(
        <button type="button" className="btn-ghost !py-1.5 !px-2.5 text-[11px] min-h-[40px]" onClick={toggleOpen} aria-expanded={open}>
          {t(open ? 'network.legend.hide' : 'network.legend.show')}
        </button>
      )}
    >
      {open && (
        <div className="overflow-x-auto no-scrollbar">
          <table className="border-separate" style={{ borderSpacing: 3 }}>
            <thead>
              <tr>
                <th aria-hidden="true" />
                {grid.tags.map((tag) => (
                  <th key={tag} scope="col" className="align-bottom pb-0.5">
                    <button
                      type="button"
                      className={`w-full max-w-[4.5rem] text-[9px] leading-tight text-muted hover:text-amber transition-colors break-words ${selected.includes(tag) ? '!text-amber' : ''}`}
                      onClick={() => onPickPair?.(tag)}
                      title={t('network.mo.toggleTag', { tag })}
                    >
                      {tag}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.tags.map((rowTag, i) => (
                <tr key={rowTag}>
                  <th scope="row" className="text-right pr-1.5">
                    <button
                      type="button"
                      className={`text-[10px] font-normal text-muted hover:text-amber transition-colors whitespace-nowrap ${selected.includes(rowTag) ? '!text-amber' : ''}`}
                      onClick={() => onPickPair?.(rowTag)}
                      title={t('network.mo.toggleTag', { tag: rowTag })}
                    >
                      {rowTag}
                    </button>
                  </th>
                  {grid.tags.map((colTag, j) => {
                    const v = grid.m[i][j];
                    const diag = i === j;
                    const active = !diag && isPairActive(rowTag, colTag);
                    return (
                      <td key={colTag} className="p-0">
                        <button
                          type="button"
                          className={`h-8 w-9 sm:h-9 sm:w-10 rounded flex items-center justify-center text-[10px] num transition-colors border ${
                            active ? 'border-amber text-amber' : 'border-transparent hover:border-amber/60'
                          } ${diag ? 'bg-grid/40 text-muted' : v ? 'text-ink' : 'text-muted/60'}`}
                          style={diag || !v ? undefined : { background: `rgb(var(--t-amber) / ${(0.07 + 0.45 * (v / grid.max)).toFixed(2)})` }}
                          onClick={() => onPickPair?.(rowTag, diag ? undefined : colTag)}
                          title={diag
                            ? t(v === 1 ? 'network.mo.diagTitle.one' : 'network.mo.diagTitle.other',
                              { tag: rowTag, n: fmtInt(v) })
                            : t(v === 1 ? 'network.mo.pairTitle.one' : 'network.mo.pairTitle.other',
                              { a: rowTag, b: colTag, n: fmtInt(v) })}
                          aria-pressed={active}
                        >
                          {v || '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-muted mt-1.5">{t('network.mo.footnote')}</p>
        </div>
      )}
    </Card>
  );
}
