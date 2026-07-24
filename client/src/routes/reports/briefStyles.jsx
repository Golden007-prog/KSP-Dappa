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
//   .brief-print-footer — repeating confidentiality footer: hidden on screen,
//                    position:fixed in print so every printed page carries the
//                    classification + synthetic-data stamp.
//   .brief-watermark — diagonal CONFIDENTIAL watermark, print only.
//   The trailing @page margin-box rule adds "Page N of M" where the print
//   engine supports margin boxes (paged-media engines); browsers that don't
//   simply ignore it.
export default function BriefPrintStyles() {
  return (
    <style>{`
      .brief-a4 { min-width: 210mm; }
      .brief-scroll { overflow-x: auto; }
      .brief-print-footer { display: none; }
      .brief-watermark { display: none; }
      @media print {
        .brief-a4 { min-width: 0; }
        .brief-scroll { overflow: visible !important; }
        .brief-print-footer {
          display: flex; position: fixed; left: 0; right: 0; bottom: 0;
          justify-content: space-between; gap: 12px;
          font-size: 8.5px; color: #6b7280; background: #ffffff;
          border-top: 1px solid #e5e7eb; padding: 3px 2px 0;
        }
        .print-page { padding-bottom: 30px !important; }
        .brief-watermark {
          display: flex; position: fixed; inset: 0; z-index: 0;
          align-items: center; justify-content: center; pointer-events: none;
          font-size: 84px; font-weight: 800; letter-spacing: 0.18em;
          color: rgba(185, 28, 28, 0.07); transform: rotate(-28deg);
        }
      }
      .print-page.brief-compact td,
      .print-page.brief-compact th { padding: 3px 6px !important; }
      .print-page.brief-compact td { font-size: 11px !important; }
      .print-page.brief-compact li { font-size: 11px !important; margin: 2px 0 !important; }
      .print-page.brief-compact section { margin-top: 12px !important; }
      @page { @bottom-right { content: "Page " counter(page) " of " counter(pages); } }
    `}</style>
  );
}
