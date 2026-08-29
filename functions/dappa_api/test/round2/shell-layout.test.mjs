// Round 2 — app-shell / design-token contract suite.
//
// These are static source contracts, not HTTP contracts: the defects they lock
// down are layout and colour-token regressions that only a browser would show,
// and the browser gates (client/test/a11y/axe.mjs, the Playwright sweeps) are
// too slow to run per commit. Each check below corresponds to a defect that
// actually shipped and was measured:
//
//   p5-2   a Tailwind colour key named `base` made Tailwind emit `.text-base`
//          TWICE — the font-size utility AND the colour utility — and the
//          colour copy is ordered after `.text-amber`, so every
//          `text-base text-amber` tile painted its number in the page
//          background. Measured on the dashboard EVENING shift tile.
//   int-2  `.tt::after` kept a full nowrap layout box at rest, so the
//          rightmost topbar tooltip pushed #main-scroll's scrollWidth 30 px
//          past a 360-px viewport on every route.
//   int-3  a nowrap ChartTable inside a card widened the Station grid track
//          past the viewport (392 vs 360).
//   int-1  the topbar held more controls than a 56-px non-wrapping row fits;
//          the theme toggle (the `t` shortcut, the demo script) fell off at
//          1280 and 1440.
//   int-4  the freshness label and the segmented-control labels wrapped
//          inside an h-14 bar (50 px / 36 px tall text).
//   int-5  FontSizeControl was mounted ONLY in the md:hidden More sheet, so
//          >=768 px had no visible text-size affordance.
//   tiers-5 the More sheet's tier switcher sat ~9 rows below the fold.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Tailwind's default font-size scale. A colour key sharing one of these names
// makes `text-<name>` ambiguous: Tailwind emits both utilities under the same
// selector and the later one (colour) wins wherever it is combined.
const FONT_SIZE_KEYS = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
]);

// Files that legitimately contain the literal token name `--t-base`.
const TOKEN_RE = /--t-base\b/;

export async function run(h) {
  const { check } = h;

  // ---- p5-2: no colour key may collide with a font-size utility -------------
  {
    const cfg = await import(pathToFileURL(path.join(ROOT, 'client', 'tailwind.config.js')).href);
    const colors = (cfg.default && cfg.default.theme && cfg.default.theme.extend && cfg.default.theme.extend.colors) || {};
    const keys = Object.keys(colors);
    const clash = keys.filter((k) => FONT_SIZE_KEYS.has(k));
    check(
      'tailwind: no colour key collides with a font-size utility (p5-2)',
      clash.length === 0,
      `colliding colour keys: ${clash.join(', ')} — text-<key> would resolve to the colour, not the size`,
    );
    check('tailwind: page background is the `canvas` colour key', keys.includes('canvas'), keys.join(','));
    check(
      'tailwind: canvas still points at the --t-base token',
      TOKEN_RE.test(String(colors.canvas || '')),
      String(colors.canvas),
    );

    // No source file may still ask for the removed utility — a dead class
    // silently paints nothing.
    const dead = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(jsx?|css)$/.test(e.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/\b(bg|border|ring-offset|from|via|to|divide|outline|fill|stroke|accent|caret|decoration)-base\b/g)) {
          dead.push(`${path.relative(ROOT, p)}: ${m[0]}`);
        }
      }
    };
    walk(path.join(ROOT, 'client', 'src'));
    check('client: no source still uses a `-base` colour utility (p5-2)', dead.length === 0, dead.slice(0, 5).join(' | '));
  }

  // ---- int-2 / int-3: index.css layout contracts ----------------------------
  {
    const css = read('client/src/index.css');
    const tt = css.slice(css.indexOf('.tt::after {'), css.indexOf('.tt-bottom::after'));
    check('index.css: the .tt::after block is present', tt.length > 100, `len=${tt.length}`);
    check(
      'index.css: a resting tooltip is out of layout (content: none) (int-2)',
      /content:\s*none/.test(tt),
      tt.slice(0, 120),
    );
    check(
      'index.css: the tooltip bubble is width-bounded (int-2)',
      /max-width:\s*min\(/.test(tt) && /white-space:\s*normal/.test(tt),
      tt.slice(0, 200),
    );
    check(
      'index.css: no unbounded white-space:nowrap on the tooltip (int-2)',
      !/white-space:\s*nowrap/.test(tt),
      tt.slice(0, 200),
    );
    check(
      'index.css: Escape (data-tt-off) still removes the tip (WCAG 1.4.13)',
      /\.tt\[data-tt-off\]::after\s*\{[^}]*content:\s*none/.test(css),
      'data-tt-off escape hatch',
    );
    const scroller = css.slice(css.indexOf('#main-scroll {'));
    check(
      'index.css: #main-scroll never scrolls sideways (int-2)',
      /overflow-x:\s*hidden/.test(scroller.slice(0, 400)),
      scroller.slice(0, 200),
    );
    check(
      'index.css: .chart-table cannot widen its grid track (int-3)',
      /\.chart-table\s*\{[^}]*min-w-0/.test(css),
      'chart-table min-w-0',
    );
  }

  // ---- int-3: a Card is never allowed to widen its own track ----------------
  {
    // react-query caches by key, so two hooks that share a key with different
    // queryFns do not share a probe — they race, and the winner defines the
    // cached SHAPE for both. DataStateBanner once reused ['about-healthz'] and
    // its raw /healthz payload landed in the slot useProvenance expects to hold
    // {tables, incomplete, unknown, ...}; ProvenancePanel read `unknown` and
    // HonestyLedger read `incomplete` off an object with neither, and /about —
    // the page written to prove the app is real — died in its error boundary on
    // BOTH deployments. The static-demo build hid it, because there the probe
    // fails and never writes the cache, so the a11y sweep passed too.
    {
      const banner = read('client/src/components/DataStateBanner.jsx');
      const about = read('client/src/routes/about/useAboutIntrospection.js');
      const keyOf = (src) => (src.match(/queryKey:\s*\[\s*'([^']+)'/) || [])[1] || null;
      const bannerKey = keyOf(banner);
      const aboutKeys = [...about.matchAll(/queryKey:\s*\[\s*'([^']+)'/g)].map((m) => m[1]);
      check('DataStateBanner does not share a react-query key with /about introspection',
        Boolean(bannerKey) && !aboutKeys.includes(bannerKey), `banner=${bannerKey} about=${aboutKeys.join(',')}`);
    }

    const card = read('client/src/components/Card.jsx');
    check('Card: the section carries min-w-0 (int-3)', /<section className=\{`min-w-0 bg-panel/.test(card), card.slice(0, 400));
    check(
      'Card: the header action group is width-capped (int-2/int-3)',
      /actions && <div className="flex max-w-full shrink-0 flex-wrap/.test(card),
      'actions max-w-full',
    );
  }

  // ---- reflow (WCAG 1.4.10): the same `shrink-0 + no cap` pattern found on
  //      three more routes while verifying int-2/int-3 at 360 px. Each was
  //      measured: /alerts 468 (en) / 535 (kn, Beat tier) and /about 387 (kn).
  {
    const alert = read('client/src/routes/alerts/AlertCard.jsx');
    const rows = (alert.match(/<div className="flex flex-wrap items-center gap-2">/g) || []).length;
    check(
      'AlertCard: both action rows in the w-60 side column wrap (1.4.10)',
      rows >= 2 && !/<div className="flex items-center gap-2">\s*\n\s*\{(onCopy|a\.districtId)/.test(alert),
      `wrapping rows=${rows}`,
    );
    const about = read('client/src/routes/About.jsx');
    check(
      'About: the keyboard-shortcut key group cannot run off the screen (1.4.10)',
      /className="flex flex-wrap items-start justify-between gap-3 py-1\.5"/.test(about)
        && /<span className="max-w-full grow shrink-0 flex flex-wrap justify-end gap-1">/.test(about),
      'shortcut row',
    );
  }

  // ---- int-4: nothing in the 56-px topbar may wrap --------------------------
  {
    const layout = read('client/src/components/Layout.jsx');
    const seg = read('client/src/components/SegmentedControl.jsx');
    const freshSpans = [...layout.matchAll(/<span className="num hidden [^"]*text-\[11px\][^"]*">\{freshness/g)];
    check('Layout: both freshness spans exist (int-4)', freshSpans.length === 2, `found ${freshSpans.length}`);
    check(
      'Layout: the freshness label never wraps (int-4)',
      freshSpans.every((m) => /whitespace-nowrap/.test(m[0])),
      freshSpans.map((m) => m[0]).join(' | '),
    );
    check(
      'SegmentedControl: labels never wrap (int-4)',
      /inline-flex items-center gap-1\.5 whitespace-nowrap rounded-md/.test(seg),
      'segment button class',
    );
    check(
      'SegmentedControl: the group is width-capped and folds (int-4)',
      /inline-flex max-w-full flex-wrap items-center rounded-lg/.test(seg),
      'radiogroup class',
    );
  }

  // ---- int-1 / int-5: the overflow menu owns the low-frequency chrome -------
  {
    const layout = read('client/src/components/Layout.jsx');
    const menuStart = layout.indexOf('function DisplayMenu(');
    check('Layout: a DisplayMenu overflow menu exists (int-1)', menuStart > 0, `index=${menuStart}`);
    const menu = layout.slice(menuStart, layout.indexOf('const isTyping', menuStart));
    for (const ctrl of ['LanguageToggle', 'DensityToggle', 'FontSizeControl']) {
      check(`Layout: DisplayMenu carries <${ctrl}> (int-1/int-5)`, menu.includes(`<${ctrl} size="md" />`), ctrl);
    }
    check(
      'Layout: the DisplayMenu trigger is labelled and marked as a dialog opener (int-1)',
      /aria-haspopup="dialog"/.test(menu) && /aria-expanded=\{open\}/.test(menu) && /aria-label=\{t\('shell\.display\.aria'\)\}/.test(menu),
      'trigger a11y attributes',
    );
    check(
      'Layout: the DisplayMenu trigger is a desktop affordance, not md:hidden (int-5)',
      /className="hidden md:inline-flex"/.test(menu) && !/md:hidden/.test(menu),
      'trigger breakpoint',
    );

    // The header itself must no longer mount those three inline.
    const header = layout.slice(layout.indexOf('<header className="no-print sticky'), layout.indexOf('</header>'));
    for (const ctrl of ['LanguageToggle', 'DensityToggle', 'FontSizeControl']) {
      check(`Layout: <${ctrl}> is not inline in the topbar row (int-1)`, !header.includes(`<${ctrl}`), ctrl);
    }
    check('Layout: the topbar mounts the DisplayMenu (int-1)', header.includes('<DisplayMenu'), 'DisplayMenu in header');
    // The theme toggle is what fell off the row — it stays inline, and last.
    check(
      'Layout: the theme toggle is still the last inline topbar control (int-1)',
      header.lastIndexOf('shell.theme.toLight') > header.lastIndexOf('<DisplayMenu'),
      'theme after DisplayMenu',
    );
  }

  // ---- tiers-5: the More sheet leads with the tier switcher -----------------
  {
    const layout = read('client/src/components/Layout.jsx');
    check(
      'Layout: the More sheet lists the Officer-tier routes first (tiers-5)',
      /const MORE_SHEET_ROUTES = \[\s*\.\.\.MORE_ROUTES\.filter\(\(n\) => n\.sectionKey === TIER_GROUP\),/.test(layout),
      'MORE_SHEET_ROUTES ordering',
    );
    const sheet = layout.slice(layout.indexOf('<Sheet open={moreOpen}'), layout.indexOf('<GlobalShortcutsSheet'));
    check('Layout: the More sheet renders MORE_SHEET_ROUTES (tiers-5)', sheet.includes('MORE_SHEET_ROUTES.map'), 'sheet route source');
    const tierAt = sheet.indexOf('<TierSwitcher size="md" />');
    const navAt = sheet.indexOf("<nav aria-label={t('shell.more.aria')}");
    check('Layout: the tier switcher sits above the sheet nav list (tiers-5)', tierAt > -1 && navAt > -1 && tierAt < navAt, `tier=${tierAt} nav=${navAt}`);
    // and it is mounted exactly once in the sheet (it used to sit in the
    // settings block at the bottom as well)
    check(
      'Layout: the tier switcher is mounted once in the More sheet (tiers-5)',
      sheet.split('<TierSwitcher').length - 1 === 1,
      `count=${sheet.split('<TierSwitcher').length - 1}`,
    );
  }

  // ---- int-4: the short freshness strings exist in both languages and are
  //      substrings of the long ones (visible label ⊂ accessible name, 2.5.3)
  {
    const en = await import(pathToFileURL(path.join(ROOT, 'client', 'src', 'locales', 'en', 'shell.js')).href);
    const kn = await import(pathToFileURL(path.join(ROOT, 'client', 'src', 'locales', 'kn', 'shell.js')).href);
    const enc = await import(pathToFileURL(path.join(ROOT, 'client', 'src', 'locales', 'en', 'common.js')).href);
    const knc = await import(pathToFileURL(path.join(ROOT, 'client', 'src', 'locales', 'kn', 'common.js')).href);
    for (const [lang, shell, common] of [['en', en.default, enc.default], ['kn', kn.default, knc.default]]) {
      check(`${lang}/shell: refresh.agoMinsShort exists (int-4)`, typeof shell['refresh.agoMinsShort'] === 'string' && shell['refresh.agoMinsShort'].length > 0, String(shell['refresh.agoMinsShort']));
      check(`${lang}/shell: refresh.justNowShort exists (int-4)`, typeof shell['refresh.justNowShort'] === 'string' && shell['refresh.justNowShort'].length > 0, String(shell['refresh.justNowShort']));
      check(
        `${lang}: the short "m ago" label is contained in the long one (WCAG 2.5.3)`,
        shell['refresh.agoMins'].includes(shell['refresh.agoMinsShort']),
        `${shell['refresh.agoMins']} ⊅ ${shell['refresh.agoMinsShort']}`,
      );
      check(
        `${lang}: the short "just now" label is contained in the long one (WCAG 2.5.3)`,
        common['shell.updatedJustNow'].includes(shell['refresh.justNowShort']),
        `${common['shell.updatedJustNow']} ⊅ ${shell['refresh.justNowShort']}`,
      );
      check(`${lang}/shell: display.title exists (int-1)`, typeof shell['display.title'] === 'string' && shell['display.title'].length > 0, String(shell['display.title']));
      check(`${lang}/shell: display.aria exists (int-1)`, typeof shell['display.aria'] === 'string' && shell['display.aria'].length > 0, String(shell['display.aria']));
    }
    check(
      'kn/shell: the display menu strings are really translated',
      kn.default['display.title'] !== en.default['display.title'] && /[\u0C80-\u0CFF]/.test(kn.default['display.title']),
      String(kn.default['display.title']),
    );
  }
}
