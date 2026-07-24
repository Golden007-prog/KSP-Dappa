// Route-local CSS for the brief preview / print view (shared components and
// index.css are off-limits to route fillers, so these rules live here):
//   .brief-a4      — keeps the on-screen brief at A4 width inside an
//                    overflow-x scroll wrapper (mobile scrolls the page
//                    horizontally inside the wrapper, never the body); the
//                    min-width is dropped for print so @page stays in charge.
//   .brief-scroll  — the wrapper; overflow reverts to visible for print.
//   .brief-compact — compact print density (BriefContent adds it next to
//                    .print-page). !important because the brief's own styles
//                    are inline (print-exact by design).
export default function BriefPrintStyles() {
  return (
    <style>{`
      .brief-a4 { min-width: 210mm; }
      .brief-scroll { overflow-x: auto; }
      @media print {
        .brief-a4 { min-width: 0; }
        .brief-scroll { overflow: visible !important; }
      }
      .print-page.brief-compact td,
      .print-page.brief-compact th { padding: 3px 6px !important; }
      .print-page.brief-compact td { font-size: 11px !important; }
      .print-page.brief-compact li { font-size: 11px !important; margin: 2px 0 !important; }
      .print-page.brief-compact section { margin-top: 12px !important; }
    `}</style>
  );
}
