// Sortable, server-paginated table. Props:
//   columns      — [{key, label, sortable?, render?(row), align?('left'|'right'|'center'), width?, className?}]
//   rows         — array of row objects
//   rowKey       — string key or (row, i) => key   (default: index)
//   loading?     — skeleton rows
//   emptyMessage?
//   total?, page?, perPage?, onPageChange?(page)   — server pagination footer
//                 (footer renders only when total+onPageChange are given)
//   sort?        — {key, dir:'asc'|'desc'}; onSortChange?({key,dir}) → server sort.
//                 Without onSortChange the table sorts the CURRENT page client-side.
//   onRowClick?(row)
//   dense?       — tighter row padding
import { useMemo, useState } from 'react';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import EmptyState from './EmptyState.jsx';
import { fmtInt } from '../lib/format.js';

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

export default function DataTable({
  columns = [], rows = [], rowKey, loading = false, emptyMessage,
  total, page = 1, perPage = 50, onPageChange,
  sort, onSortChange, onRowClick, dense = false, className = '',
}) {
  const [localSort, setLocalSort] = useState(null);
  const activeSort = onSortChange ? sort : localSort;

  const displayRows = useMemo(() => {
    if (onSortChange || !activeSort) return rows;
    const { key, dir } = activeSort;
    const mul = dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = a?.[key]; const bv = b?.[key];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const an = Number(av); const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  }, [rows, activeSort, onSortChange]);

  const toggleSort = (col) => {
    if (!col.sortable) return;
    const cur = activeSort;
    const next = cur && cur.key === col.key
      ? { key: col.key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: 'desc' };
    if (onSortChange) onSortChange(next); else setLocalSort(next);
  };

  const keyOf = (row, i) => {
    if (typeof rowKey === 'function') return rowKey(row, i);
    if (typeof rowKey === 'string') return row?.[rowKey] ?? i;
    return i;
  };

  const cellPad = dense ? 'px-3 py-1.5' : 'px-3 py-2.5';
  const pages = total && perPage ? Math.max(1, Math.ceil(total / perPage)) : 1;
  const showFooter = total !== undefined && typeof onPageChange === 'function';

  return (
    <div className={`overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-grid">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={`${cellPad} ${ALIGN[col.align] || 'text-left'} text-[11px] font-semibold uppercase tracking-wide text-muted select-none ${col.sortable ? 'cursor-pointer hover:text-ink' : ''} ${col.className || ''}`}
                  onClick={() => toggleSort(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && activeSort?.key === col.key && (
                      <span aria-hidden="true" className="text-amber">{activeSort.dir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-grid/40">
                  {columns.map((col) => (
                    <td key={col.key} className={cellPad}><div className="skeleton h-4" /></td>
                  ))}
                </tr>
              ))
            )}
            {!loading && displayRows.map((row, i) => (
              <tr
                key={keyOf(row, i)}
                className={`border-b border-grid/40 ${onRowClick ? 'cursor-pointer hover:bg-grid/30 transition-colors' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`${cellPad} ${ALIGN[col.align] || 'text-left'} num ${col.className || ''}`}>
                    {col.render ? col.render(row) : (row?.[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && displayRows.length === 0 && (
          <EmptyState compact title="No rows" message={emptyMessage || 'No records match the current filters.'} />
        )}
      </div>
      {showFooter && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-grid text-xs text-muted">
          <span className="num">
            {total === 0 ? '0 rows' : `${fmtInt((page - 1) * perPage + 1)}–${fmtInt(Math.min(page * perPage, total))} of ${fmtInt(total)}`}
          </span>
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn !py-1 !px-2" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>‹ Prev</button>
            <span className="num px-1">{fmtInt(page)} / {fmtInt(pages)}</span>
            <button type="button" className="btn !py-1 !px-2" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)}>Next ›</button>
          </div>
        </div>
      )}
    </div>
  );
}
