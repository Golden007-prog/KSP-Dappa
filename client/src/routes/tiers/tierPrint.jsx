// Per-tier print sheets reusing the app's print plumbing (index.css @media
// print forces a white page and hides the chrome; PrintHeader adds the crest,
// view name and timestamp above every routed view). Each tier sets its own
// page box: the Beat card fits an A5 sheet, the Station sheet an A4 portrait,
// the State matrix an A4 landscape. Black-and-white safe by construction —
// StatusPill prints glyph + word in black, the tint backgrounds drop.
const COMMON = `
  /* the app's CSS tooltip is nowrap; a glossary sentence behind a 44-px (i)
     would otherwise widen the page's scroll area on a 360-px phone */
  .tier-home .tt::after { white-space: normal; width: max-content; max-width: min(300px, 78vw); text-align: left; }
  @media print {
    .tier-print-only { display: block !important; }
    .tier-home { max-width: none !important; }
    .tier-home section { border-color: #d1d5db !important; }
    .tier-home [data-status] { border: 1px solid #111827 !important; color: #111827 !important; background: #fff !important; }
    .tier-home .tt::after { display: none !important; }
    .tier-home table { font-size: 10px; }
    .tier-home .leaflet-container { display: none !important; }
  }
  .tier-print-only { display: none; }
`;

const SIZES = {
  beat: '@media print { @page { size: A5 portrait; margin: 8mm; } .tier-home { font-size: 11px; } }',
  station: '@media print { @page { size: A4 portrait; margin: 12mm; } }',
  state: '@media print { @page { size: A4 landscape; margin: 10mm; } .tier-home table { font-size: 8.5px; } }',
};

export default function TierPrintStyles({ tier = 'station' }) {
  return <style>{COMMON + (SIZES[tier] || SIZES.station)}</style>;
}
