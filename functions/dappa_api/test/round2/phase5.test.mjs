// Round-2 Phase 5 — accessibility invariants that live in the client tree.
//
// The a11y layer is browser-side, so there is no endpoint to pin; what CAN be
// pinned from here is the source shape the axe gate depends on. Every check
// below is one that would have failed while a defect from the phase-5 audit
// was still present:
//   • a horizontally scrolling box with no way to scroll it from the keyboard
//     (axe scrollable-region-focusable, WCAG 2.1.1) — /state's unit matrix,
//     the Reports A4 preview, the dashboard seasonality grid, the two Predict
//     tables;
//   • the gate auditing only 1280x900, which left the whole phone layout
//     unmeasured (and the 20x24 month buttons in the heat calendar unseen);
//   • useDocumentTitle sitting in lib/a11y.js with no caller while the two
//     detail routes assigned document.title directly, which ShellA11y's own
//     effect overwrites on the next render;
//   • announce() sharing one requestAnimationFrame handle across the polite
//     and assertive regions, so the second call in a frame silently dropped
//     the first message after clearing its region.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const KANNADA = /[ಀ-೿]/;

// A scrollable wrapper is keyboard-operable when it takes tabindex=0, and a
// tabbable box is a landmark, so it also needs a role and an accessible name.
// The three attributes are asserted inside the same JSX element by looking at
// the slice that starts at the anchor and ends at the tag's closing '>'.
function elementAt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return null;
  const j = src.indexOf('>', i);
  return j < 0 ? null : src.slice(i, j + 1);
}

function scrollRegionOk(el) {
  return !!el && /tabIndex=\{0\}/.test(el) && /role="region"/.test(el) && /aria-label=\{/.test(el);
}

export async function run(h) {
  const { check } = h;

  // --- WCAG 2.1.1: every horizontally scrolling box is keyboard-reachable ----
  const scrollers = [
    ['StateHome unit × head matrix', 'client/src/routes/StateHome.jsx', 'className="overflow-x-auto"'],
    ['Reports A4 brief preview', 'client/src/routes/Reports.jsx', 'className="brief-scroll'],
    ['Dashboard seasonality grid', 'client/src/routes/dashboard/SeasonalityPanel.jsx', 'className="overflow-x-auto no-scrollbar'],
    ['Predict horizon table', 'client/src/routes/predict/HorizonPanel.jsx', 'className="mt-3 overflow-x-auto"'],
    ['Predict backtest table', 'client/src/routes/predict/BacktestPanel.jsx', 'className="mt-3 overflow-x-auto"'],
  ];
  for (const [name, file, anchor] of scrollers) {
    const el = elementAt(read(file), anchor);
    check(`${name} scroller takes tabindex=0 + role=region + a label`, scrollRegionOk(el), String(el || 'element not found').slice(0, 140));
  }

  // --- WCAG 2.5.8: the heat-calendar month buttons clear 24 px on a phone ----
  // 12 month cells + the 32 px year column + the 40 px total column +
  // 15 × 2 px border-spacing = 390 px minimum for a 24 px cell.
  const heat = read('client/src/routes/dashboard/HeatCalendar.jsx');
  const minW = heat.match(/min-w-\[(\d+(?:\.\d+)?)rem\]/);
  check('HeatCalendar month grid declares a min-width', !!minW, heat.slice(heat.indexOf('<table'), heat.indexOf('<table') + 90));
  check('HeatCalendar min-width leaves the month buttons ≥ 24 px wide',
    !!minW && Number(minW[1]) * 16 >= 390, minW ? `${minW[1]}rem = ${Number(minW[1]) * 16}px` : 'no min-w');
  check('HeatCalendar month cells are still 24 px tall', /className=\{`block h-6 w-full/.test(heat));

  // --- the axe gate measures the phone, not only the laptop ------------------
  const axe = read('client/test/a11y/axe.mjs');
  check('axe gate audits the 1280×900 desktop viewport', /width: 1280, height: 900/.test(axe));
  check('axe gate audits the 360×640 phone viewport', /width: 360, height: 640/.test(axe));
  check('axe gate drives the phone pass with isMobile + hasTouch', /isMobile: true, hasTouch: true/.test(axe));
  check('axe gate loops both viewports per route', /for \(const vp of VIEWPORTS\)/.test(axe) && /VIEWPORTS\s*=\s*VP_ARG === 'both'/.test(axe));
  check('axe gate serves the build it was pointed at', /'--outDir', DIST/.test(axe));
  check('axe gate keeps target-size enabled and disables no rule',
    /'target-size': \{ enabled: true \}/.test(axe) && !/enabled: false/.test(axe));
  const allowEntries = axe.match(/\{ id: '[^']+',[^}]*reason:/g) || [];
  const allowIds = axe.match(/\{ id: '[^']+',/g) || [];
  check('every axe allow-list entry carries a reason', allowIds.length > 0 && allowEntries.length === allowIds.length,
    `${allowEntries.length}/${allowIds.length}`);

  // --- WCAG 2.4.2: the two detail routes register a real document title ------
  const a11y = read('client/src/lib/a11y.js');
  check('lib/a11y.js still exports useDocumentTitle', /export function useDocumentTitle\(/.test(a11y));
  for (const [name, file, call] of [
    ['CaseDetail', 'client/src/routes/CaseDetail.jsx', "useDocumentTitle(t('a11y.title.case'"],
    ['Offender360', 'client/src/routes/Offender360.jsx', "useDocumentTitle(t('a11y.title.offender'"],
  ]) {
    const src = read(file);
    check(`${name} registers its title through useDocumentTitle`, src.includes(call));
    check(`${name} imports useDocumentTitle from lib/a11y.js`, /import \{ useDocumentTitle \} from '\.\.\/lib\/a11y\.js';/.test(src));
    // A direct assignment races ShellA11y's dependency-free title effect.
    check(`${name} never assigns document.title directly`, !/document\.title\s*=/.test(src),
      (src.match(/.*document\.title\s*=.*/) || [''])[0].trim().slice(0, 100));
  }
  check('useDocumentTitle has at least the two route callers it documents',
    (read('client/src/routes/CaseDetail.jsx') + read('client/src/routes/Offender360.jsx')).split('useDocumentTitle(').length - 1 === 2);

  // --- WCAG 4.1.3: the live region clears, then writes on the next frame -----
  check('announce clears the region before re-writing it', /el\.textContent = '';/.test(a11y));
  check('announce writes the message on the next frame', /pending\[id\] = requestAnimationFrame\(/.test(a11y));
  check('announce keeps one pending frame per region, not one shared handle',
    /const pending = \{ \[REGION_ID\]: 0, \[ASSERTIVE_ID\]: 0 \}/.test(a11y) && !/^let pending = null;$/m.test(a11y));

  // --- i18n: every label this phase added exists in both languages -----------
  const enA11y = read('client/src/locales/en/a11y.js');
  const knA11y = read('client/src/locales/kn/a11y.js');
  for (const key of ['scroll.table', 'scroll.panel', 'title.case', 'title.offender']) {
    check(`a11y.${key} exists in English`, enA11y.includes(`'${key}':`));
    const kn = knA11y.match(new RegExp(`'${key.replace('.', '\\.')}': '([^']*)'`));
    check(`a11y.${key} exists in Kannada with Kannada text`, !!kn && KANNADA.test(kn[1]), kn ? kn[1] : 'missing');
  }
  check('the scroll labels interpolate the region name', /'scroll\.table': '[^']*\{name\}/.test(enA11y) && /'scroll\.panel': '[^']*\{name\}/.test(enA11y));
}
