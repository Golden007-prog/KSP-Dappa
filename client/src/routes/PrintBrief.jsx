// /print/brief — bare print route (renders OUTSIDE Layout): the SmartBrowz PDF
// target. White page, print CSS from index.css (.print-page / .no-print).
// Query params (all set by the /reports builder):
//   ?window=last-7-days|last-30-days|custom  — period preset
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD           — custom range (with window=custom)
//   ?sections=kpis,alerts,…                  — trims sections
//   ?order=alerts,kpis,…                     — section order
//   ?by=Name                                 — "Prepared by" header stamp
//   ?density=compact                         — compact print density (persisted)
//   ?class=internal|confidential             — classification stamp (banner,
//                                              per-page footer, watermark);
//                                              absent → builder's saved level
//   ?exec=…                                  — officer-edited executive summary
//                                              (absent → saved override → auto)
//   ?autoprint=1                             — fires window.print() once all
//                                              data has settled — unless every
//                                              query failed (guarded, retryable).
// The document title switches while mounted so "Save as PDF" suggests a
// sensible filename.
import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BriefContent from './reports/BriefContent.jsx';
import BriefPrintStyles from './reports/briefStyles.jsx';
import { useBriefData, WINDOWS, DEFAULT_WINDOW, CUSTOM_WINDOW, isValidCustomRange } from './reports/useBriefData.js';
import { sectionsFromParam, sectionsToParam, orderFromParam, orderToParam, DEFAULT_ORDER } from './reports/briefSections.js';
import { CLASS_LEVELS, CLASS_META, normalizeClass, loadClassification, saveClassification } from './reports/classification.js';
import { loadExecOverride } from './reports/exec.js';

const toolbarBtn = {
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '9px 14px',
  minHeight: 40,
  fontSize: 13,
  color: '#111827',
  cursor: 'pointer',
};

const DENSITY_KEY = 'dappa-print-density';
const loadDensity = () => {
  try { return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
};
const saveDensity = (v) => {
  try { localStorage.setItem(DENSITY_KEY, v); } catch { /* private mode */ }
};

export default function PrintBrief() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('window') || DEFAULT_WINDOW;
  const custom = { from: searchParams.get('from') || '', to: searchParams.get('to') || '' };
  const hasCustom = isValidCustomRange(custom);
  const windowKey = hasCustom && (raw === CUSTOM_WINDOW || !WINDOWS.some((w) => w.value === raw))
    ? CUSTOM_WINDOW
    : (WINDOWS.some((w) => w.value === raw) ? raw : DEFAULT_WINDOW);
  const autoprint = searchParams.get('autoprint') === '1';
  const preparedBy = (searchParams.get('by') || '').trim().slice(0, 80);
  const urlDensity = searchParams.get('density');
  const density = urlDensity === 'compact' ? 'compact'
    : urlDensity === 'comfortable' ? 'comfortable' : loadDensity();
  const sections = useMemo(
    () => sectionsFromParam(searchParams.get('sections')),
    [searchParams],
  );
  const order = useMemo(
    () => orderFromParam(searchParams.get('order')),
    [searchParams],
  );
  const sectionsQS = sectionsToParam(sections);
  const orderQS = orderToParam(order);
  // Classification: ?class= wins; otherwise the builder's saved level.
  const classParam = searchParams.get('class');
  const classification = classParam !== null ? normalizeClass(classParam) : loadClassification();
  // Executive summary: ?exec= wins; else the saved override; else auto-compose.
  const execParam = (searchParams.get('exec') || '').trim().slice(0, 1600);
  const execText = execParam || loadExecOverride() || undefined;
  const brief = useBriefData(windowKey, windowKey === CUSTOM_WINDOW ? custom : undefined);
  const printedRef = useRef(false);

  useEffect(() => {
    // Guard: when every brief query failed there is nothing worth printing —
    // hold the dialog and surface the retry notice in the toolbar instead.
    if (!autoprint || !brief.ready || brief.allError || printedRef.current) return undefined;
    printedRef.current = true;
    // Small delay lets fonts/layout settle before the print dialog snapshots.
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoprint, brief.ready, brief.allError]);

  // "Save as PDF" filename comes from the document title.
  useEffect(() => {
    const prev = document.title;
    document.title = `DAPPA Weekly Brief — ${brief.win.label}`;
    return () => { document.title = prev; };
  }, [brief.win.label]);

  const setDensity = (v) => {
    saveDensity(v);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v === 'compact') next.set('density', 'compact'); else next.delete('density');
      return next;
    }, { replace: true });
  };

  /** Search string for the window-switch links, carrying every other param. */
  const qsFor = (winValue) => {
    const p = new URLSearchParams();
    p.set('window', winValue);
    if (winValue === CUSTOM_WINDOW && hasCustom) { p.set('from', custom.from); p.set('to', custom.to); }
    if (sectionsQS) p.set('sections', sectionsQS);
    if (orderQS) p.set('order', orderQS);
    if (preparedBy) p.set('by', preparedBy);
    if (density === 'compact') p.set('density', 'compact');
    if (classification !== 'unclassified') p.set('class', classification);
    if (execParam) p.set('exec', execParam);
    return `?${p.toString()}`;
  };

  /** Cycle Unclassified → Internal → Confidential (URL + persisted). */
  const cycleClass = () => {
    const next = CLASS_LEVELS[(CLASS_LEVELS.indexOf(classification) + 1) % CLASS_LEVELS.length];
    saveClassification(next);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'unclassified') p.delete('class'); else p.set('class', next);
      return p;
    }, { replace: true });
  };

  const sectionCount = DEFAULT_ORDER.filter((k) => sections[k] !== false).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <BriefPrintStyles />
      <div
        className="no-print"
        style={{
          maxWidth: '210mm', margin: '0 auto', padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          color: '#374151', fontSize: 12,
        }}
      >
        <span>
          Print view — SmartBrowz PDF target · {brief.ready ? 'data loaded' : 'loading data…'}
          {sectionCount < DEFAULT_ORDER.length ? ` · ${sectionCount}/${DEFAULT_ORDER.length} sections` : ''}
          {windowKey === CUSTOM_WINDOW ? ' · custom window' : ''}
        </span>
        {brief.allError && (
          <span role="alert" style={{ color: '#b91c1c', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Data unavailable — retry before printing.
            <button type="button" style={{ ...toolbarBtn, borderColor: '#b91c1c', color: '#b91c1c' }} onClick={brief.refetchAll}>
              Retry
            </button>
          </span>
        )}
        <span style={{ flex: 1 }} />
        {WINDOWS.map((w) => (
          <Link
            key={w.value}
            to={`/print/brief${qsFor(w.value)}`}
            style={{
              ...toolbarBtn,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              fontWeight: w.value === windowKey ? 700 : 400,
              borderColor: w.value === windowKey ? '#111827' : '#d1d5db',
            }}
            aria-current={w.value === windowKey ? 'page' : undefined}
          >
            {w.label}
          </Link>
        ))}
        <button
          type="button"
          style={{
            ...toolbarBtn,
            fontWeight: classification !== 'unclassified' ? 700 : 400,
            color: classification === 'confidential' ? '#b91c1c' : toolbarBtn.color,
            borderColor: classification === 'confidential' ? '#b91c1c' : '#d1d5db',
          }}
          onClick={cycleClass}
          title="Cycle the classification stamp (header banner, per-page footer, watermark)"
        >
          Class: {CLASS_META[classification].label}
        </button>
        <button
          type="button"
          style={{ ...toolbarBtn, fontWeight: density === 'compact' ? 700 : 400 }}
          onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
          aria-pressed={density === 'compact'}
          title="Compact shrinks table padding and type so long briefs fit fewer pages"
        >
          Density: {density === 'compact' ? 'Compact' : 'Comfortable'}
        </button>
        <button type="button" style={toolbarBtn} onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <Link to="/reports" style={{ ...toolbarBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          ← Back to Reports
        </Link>
      </div>
      <div className="brief-scroll">
        <div className="brief-a4">
          <BriefContent
            data={brief}
            sections={sections}
            order={order}
            density={density}
            preparedBy={preparedBy}
            execText={execText}
            classification={classification}
          />
        </div>
      </div>
    </div>
  );
}
