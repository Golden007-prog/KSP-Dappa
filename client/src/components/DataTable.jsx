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
//   dense?       — tighter row padding (overrides the global DensityToggle)
//   stickyFirst? — default true; pins the first column while the table scrolls
//                 horizontally on narrow screens
//   exportable?  — default true; adds an "Export CSV" footer button that
//                 downloads the VISIBLE (filtered + sorted) rows client-side
//   exportFilename? — CSV basename (default 'dappa-export')
//   filterable?  — opt-in client-side quick-filter box that searches every
//                 column of the current rows (raw row values)
//   filterPlaceholder?
// Row padding follows the global density (--density-y via .td-pad) unless dense.
import { useEffect, useMemo, useRef, useState } from 'react';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import EmptyState from './EmptyState.jsx';
import { useToast } from './ToastProvider.jsx';
import { announce } from '../lib/a11y.js';
import { fmtInt } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

const csvCell = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function DataTable({
  columns = [], rows = [], rowKey, loading = false, emptyMessage,
  total, page = 1, perPage = 50, onPageChange,
  sort, onSortChange, onRowClick, dense = false, stickyFirst = true,
  exportable = true, exportFilename = 'dappa-export',
  filterable = false, filterPlaceholder, className = '',
}) {
  const [localSort, setLocalSort] = useState(null);
  const [quickFilter, setQuickFilter] = useState('');
  const toast = useToast();
  const t = useT();
  const activeSort = onSortChange ? sort : localSort;

  // WCAG 4.1.3: say how many rows arrived when a load finishes (server page
  // or client refetch) — the skeleton-to-rows swap is otherwise silent.
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (wasLoading.current && !loading) {
      const n = total !== undefined ? Number(total) : rows.length;
      announce(n > 0 ? t('a11y.live.rowsLoaded', { n: fmtInt(n) }) : t('a11y.live.noRows'));
    }
    wasLoading.current = loading;
  }, [loading, rows.length, total, t]);

  const filteredRows = useMemo(() => {
    const q = quickFilter.trim().toLowerCase();
    if (!filterable || !q) return rows;
    return rows.filter((row) => columns.some((col) => {
      const v = row?.[col.key];
      return v !== undefined && v !== null && String(v).toLowerCase().includes(q);
    }));
  }, [rows, columns, filterable, quickFilter]);

  const displayRows = useMemo(() => {
    if (onSortChange || !activeSort) return filteredRows;
    const { key, dir } = activeSort;
    const mul = dir === 'desc' ? -1 : 1;
    return [...filteredRows].sort((a, b) => {
      const av = a?.[key]; const bv = b?.[key];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const as = String(av); const bs = String(bv);
      // 16+-digit ID strings (18-digit CrimeNo) exceed Number precision — order by length, then lexically
      if (/^\d{16,}$/.test(as) && /^\d{16,}$/.test(bs)) {
        return (as.length !== bs.length ? as.length - bs.length : as.localeCompare(bs)) * mul;
      }
      const an = Number(av); const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul;
      return as.localeCompare(bs) * mul;
    });
  }, [filteredRows, activeSort, onSortChange]);

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

  const exportCsv = () => {
    const head = columns.map((c) => csvCell(c.label ?? c.key)).join(',');
    const lines = displayRows.map((row) => columns.map((c) => csvCell(row?.[c.key])).join(','));
    // BOM so Excel opens the en-IN text correctly
    const blob = new Blob(['\uFEFF' + [head, ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(displayRows.length === 1
      ? t('shell.table.exportedOne')
      : t('shell.table.exportedMany', { n: fmtInt(displayRows.length) }));
  };

  const cellPad = dense ? 'px-3 py-1.5' : 'px-3 td-pad';
  const stickyCls = (i) => (stickyFirst && i === 0 ? ' td-sticky' : '');
  const pages = total && perPage ? Math.max(1, Math.ceil(total / perPage)) : 1;
  const showFooter = total !== undefined && typeof onPageChange === 'function';
  const showExport = exportable && !loading && displayRows.length > 0;

  const exportBtn = showExport ? (
    <button
      type="button"
      onClick={exportCsv}
      className="btn-ghost !py-1.5 !px-2 !text-[11px] shrink-0"
      aria-label={t('shell.table.exportAria')}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4v11m-5-4 5 5 5-5" /><path d="M4.5 20h15" />
      </svg>
      CSV
    </button>
  ) : null;

  return (
    <div className={`overflow-hidden ${className}`}>
      {filterable && (
        <div className="px-3 py-2 border-b border-grid/60">
          <div className="relative sm:max-w-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" />
            </svg>
            <input
              type="search"
              className="input-dark !py-2 !pl-8 w-full min-h-[40px]"
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              placeholder={filterPlaceholder || t('shell.table.filterRows')}
              aria-label={filterPlaceholder || t('shell.table.filterRowsAria')}
            />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-grid">
              {columns.map((col, ci) => {
                const sorted = col.sortable && activeSort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={sorted ? (activeSort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`${ALIGN[col.align] || 'text-left'} text-[11px] font-semibold uppercase tracking-wide text-muted select-none ${col.className || ''}${stickyCls(ci)} ${col.sortable ? 'p-0' : cellPad}`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        aria-label={typeof col.label === 'string' ? t('shell.table.sortBy', { column: col.label }) : undefined}
                        className={`${cellPad} w-full inline-flex items-center gap-1 uppercase tracking-wide font-semibold hover:text-ink transition-colors ${
                          col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''
                        }`}
                      >
                        {col.label}
                        {sorted && (
                          <span aria-hidden="true" className="text-primary">{activeSort.dir === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-grid/40">
                  {columns.map((col, ci) => (
                    <td key={col.key} className={`${cellPad}${stickyCls(ci)}`}><div className="skeleton h-4" /></td>
                  ))}
                </tr>
              ))
            )}
            {!loading && displayRows.map((row, i) => (
              <tr
                key={keyOf(row, i)}
                className={`border-b border-grid/40 ${onRowClick ? 'row-click cursor-pointer hover:bg-grid/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary -outline-offset-2' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(row); }
                } : undefined}
              >
                {columns.map((col, ci) => (
                  <td key={col.key} className={`${cellPad} ${ALIGN[col.align] || 'text-left'} num ${col.className || ''}${stickyCls(ci)}`}>
                    {col.render ? col.render(row) : (row?.[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && displayRows.length === 0 && (
          <EmptyState
            compact
            title={t('shell.table.noRows')}
            message={filterable && quickFilter.trim()
              ? t('shell.table.noRowsMatch', { q: quickFilter.trim() })
              : (emptyMessage || t('common.state.emptyHint'))}
          />
        )}
      </div>
      {showFooter && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-grid text-xs text-muted">
          <div className="flex items-center gap-2 min-w-0">
            <span className="num truncate">
              {total === 0 ? t('shell.table.zeroRows') : t('shell.table.range', {
                from: fmtInt((page - 1) * perPage + 1),
                to: fmtInt(Math.min(page * perPage, total)),
                total: fmtInt(total),
              })}
            </span>
            {exportBtn}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn !py-1.5 !px-2.5" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)} aria-label={t('shell.table.prevAria')}>{t('shell.table.prev')}</button>
            <span className="num px-1" aria-live="polite">{fmtInt(page)} / {fmtInt(pages)}</span>
            <button type="button" className="btn !py-1.5 !px-2.5" disabled={page >= pages || loading} onClick={() => onPageChange(page + 1)} aria-label={t('shell.table.nextAria')}>{t('shell.table.next')}</button>
          </div>
        </div>
      )}
      {!showFooter && exportBtn && (
        <div className="flex items-center justify-end px-3 py-1.5 border-t border-grid/60">
          {exportBtn}
        </div>
      )}
    </div>
  );
}
