// District multi-select summary bar for GeoIntel. In select mode, polygon
// clicks toggle membership instead of drilling; this bar shows the removable
// selection chips, aggregate cases + share-of-state, focus-selection fly-to,
// and a selection CSV export. The lasso-style spatial filter fallback.
// Polygon names come from the census GeoJSON (no lookup id), so they stay in
// the source spelling in every language.
import { fmtInt } from '../../lib/format.js';
import { useToast } from '../../components/ToastProvider.jsx';
import { downloadCsv } from './csv.js';
import { useT } from '../../lib/i18n.jsx';

const SELECTION_COLS = [
  { key: 'district', label: 'district' },
  { key: 'cases', label: 'cases' },
  { key: 'sharePct', label: 'sharePct' },
];

export default function SelectionBar({ selected, values, stateTotal, onRemove, onClear, onFocus, onExit }) {
  const toast = useToast();
  const t = useT();
  const total = selected.reduce((a, n) => a + (Number(values[n]) || 0), 0);
  const share = stateTotal > 0 ? (total / stateTotal) * 100 : null;

  const exportCsv = () => {
    const rows = selected.map((n) => {
      const c = Number(values[n]) || 0;
      return { district: n, cases: c, sharePct: stateTotal > 0 ? ((c / stateTotal) * 100).toFixed(2) : '' };
    });
    downloadCsv('geointel_selection', SELECTION_COLS, rows);
    toast.success(t('geointel.selection.exported', { n: fmtInt(rows.length) }));
  };

  return (
    <div className="pointer-events-auto bg-panel/95 border border-primary/40 rounded-xl px-2.5 py-1.5 shadow-lg max-w-full">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-primary shrink-0">{t('geointel.selection.label')}</span>
        {selected.length === 0 ? (
          <span className="text-[11px] text-muted">{t('geointel.selection.hint')}</span>
        ) : (
          selected.map((name) => (
            <span key={name} className="chip !border-primary/50">
              <span className="truncate max-w-[7rem]">{name}</span>
              <span className="num text-[10px] text-muted">{fmtInt(values[name] || 0)}</span>
              <button
                type="button"
                className="text-muted hover:text-ink transition-colors"
                aria-label={t('geointel.selection.remove', { name })}
                onClick={() => onRemove(name)}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </span>
          ))
        )}
        {selected.length > 0 && (
          <>
            <span className="text-[11px] text-ink shrink-0">
              <span className="num font-semibold">{t('geointel.selection.cases', { n: fmtInt(total) })}</span>
              {share !== null && (
                <span className="text-muted"> · {t('geointel.selection.share', { p: share.toFixed(1) })}</span>
              )}
            </span>
            <button type="button" className="chip gi-tap shrink-0 text-muted hover:text-ink transition-colors" onClick={onFocus} title={t('geointel.selection.focusHint')}>
              ⌖ {t('geointel.selection.focus')}
            </button>
            <button type="button" className="chip gi-tap shrink-0 text-muted hover:text-ink transition-colors" onClick={exportCsv} title={t('geointel.selection.csvHint')}>
              {t('geointel.export.csv')}
            </button>
            <button type="button" className="chip gi-tap shrink-0 text-muted hover:text-ink transition-colors" onClick={onClear}>
              {t('common.action.clear')}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn-ghost gi-tap gi-tap-w !px-1.5 !py-1 shrink-0"
          onClick={onExit}
          aria-label={t('geointel.selection.exitAria')}
          title={t('geointel.selection.exit')}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
