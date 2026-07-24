// /print/brief — bare print route (renders OUTSIDE Layout): the SmartBrowz PDF
// target. White page, print CSS from index.css (.print-page / .no-print).
// ?window=last-7-days|last-30-days picks the period; ?sections=kpis,alerts,…
// (set by the /reports builder) trims sections; ?autoprint=1 (set by the
// Reports fallback path) fires window.print() once all data has settled. The
// document title switches while mounted so the browser's "Save as PDF"
// suggests a sensible filename.
import { useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import BriefContent from './reports/BriefContent.jsx';
import { useBriefData, WINDOWS, DEFAULT_WINDOW } from './reports/useBriefData.js';
import { sectionsFromParam, sectionsToParam } from './reports/briefSections.js';

const toolbarBtn = {
  background: '#ffffff',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  padding: '5px 12px',
  fontSize: 13,
  color: '#111827',
  cursor: 'pointer',
};

export default function PrintBrief() {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('window') || DEFAULT_WINDOW;
  const windowKey = WINDOWS.some((w) => w.value === raw) ? raw : DEFAULT_WINDOW;
  const autoprint = searchParams.get('autoprint') === '1';
  const sections = useMemo(
    () => sectionsFromParam(searchParams.get('sections')),
    [searchParams],
  );
  const sectionsQS = sectionsToParam(sections);
  const brief = useBriefData(windowKey);
  const printedRef = useRef(false);

  useEffect(() => {
    if (!autoprint || !brief.ready || printedRef.current) return;
    printedRef.current = true;
    // Small delay lets fonts/layout settle before the print dialog snapshots.
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [autoprint, brief.ready]);

  // "Save as PDF" filename comes from the document title.
  useEffect(() => {
    const prev = document.title;
    document.title = `DAPPA Weekly Brief — ${brief.win.label}`;
    return () => { document.title = prev; };
  }, [brief.win.label]);

  const sectionCount = ['kpis', 'alerts', 'hotspots', 'network', 'forecast']
    .filter((k) => sections[k] !== false).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
      <div
        className="no-print"
        style={{
          maxWidth: '210mm', margin: '0 auto', padding: '10px 14mm',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          color: '#374151', fontSize: 12,
        }}
      >
        <span>
          Print view — SmartBrowz PDF target · {brief.ready ? 'data loaded' : 'loading data…'}
          {sectionCount < 5 ? ` · ${sectionCount}/5 sections` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {WINDOWS.map((w) => (
          <Link
            key={w.value}
            to={`/print/brief?window=${w.value}${sectionsQS ? `&sections=${sectionsQS}` : ''}`}
            style={{
              ...toolbarBtn,
              textDecoration: 'none',
              display: 'inline-block',
              fontWeight: w.value === windowKey ? 700 : 400,
              borderColor: w.value === windowKey ? '#111827' : '#d1d5db',
            }}
            aria-current={w.value === windowKey ? 'page' : undefined}
          >
            {w.label}
          </Link>
        ))}
        <button type="button" style={toolbarBtn} onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <Link to="/reports" style={{ ...toolbarBtn, textDecoration: 'none', display: 'inline-block' }}>
          ← Back to Reports
        </Link>
      </div>
      <BriefContent data={brief} sections={sections} />
    </div>
  );
}
