#!/usr/bin/env node
// axe.mjs — WCAG 2.2 AA gate for the DAPPA client (Round-2 Phase 5).
//
// Serves the static-demo build (client/dist built with VITE_STATIC_DEMO=1, so
// every API call is answered from the baked snapshot and no backend is
// needed), opens every route in a headless Chromium (Playwright) in BOTH
// themes AND at BOTH viewports — 1280x900 desktop and 360x640 phone with
// isMobile/hasTouch, because the phone layout is a different tree (bottom tab
// bar, More sheet, narrower scrollers) and a desktop-only pass leaves it
// unmeasured. Runs axe-core with the WCAG 2.x A/AA tags plus the 2.2
// target-size rule, and exits non-zero when any SERIOUS or CRITICAL violation
// survives the allow-list below. Minor/moderate findings are printed for the
// record.
//
// A second, non-failing pass injects the WCAG 1.4.12 text-spacing overrides
// under the Kannada UI and reports any route whose document then scrolls
// horizontally (the "nowrap pill at 200 %" check) — counts only, no gate.
//
//   cd client && VITE_STATIC_DEMO=1 npm run build && node test/a11y/axe.mjs
//   options: --port 4174  --routes /,/map  --theme dark|light|both
//            --viewport desktop|mobile|both  --dist <dir>
//            --out <file.json>  --no-spacing  --headed
//
// Playwright resolves from client/node_modules (devDependency); browsers come
// from `npx playwright install chromium`. No network access is needed.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(HERE, '..', '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const flag = (name) => process.argv.includes(name);

// The CI job builds into client/dist; --dist lets a local run point at a
// second build (e.g. .dist-static) without disturbing it.
const DIST = path.resolve(CLIENT, arg('--dist', 'dist'));

const PORT = Number(arg('--port', 4174));
const OUT = arg('--out', '');
const THEMES = arg('--theme', 'both') === 'both' ? ['dark', 'light'] : [arg('--theme', 'dark')];
const SPACING = !flag('--no-spacing');

// Both viewports are audited: the phone layout is a different tree (bottom tab
// bar, More sheet, stacked cards, narrower scrollers), so a desktop-only pass
// leaves the whole mobile surface unmeasured. 360x640 is the narrowest phone
// the design targets; isMobile/hasTouch make Chromium report a coarse pointer,
// which is what WCAG 2.5.8 target-size is written for.
const ALL_VIEWPORTS = [
  { key: 'desktop', width: 1280, height: 900 },
  { key: 'mobile', width: 360, height: 640, isMobile: true, hasTouch: true },
];
const VP_ARG = arg('--viewport', 'both');
const VIEWPORTS = VP_ARG === 'both' ? ALL_VIEWPORTS : ALL_VIEWPORTS.filter((v) => v.key === VP_ARG);
if (!VIEWPORTS.length) { console.error(`unknown --viewport ${VP_ARG} (desktop|mobile|both)`); process.exit(2); }

// Routes that exist in App.jsx today plus the Round-2 tier / face / ingest
// routes; a route that 404s in this build is reported as skipped, not failed.
const DEFAULT_ROUTES = [
  '/', '/map', '/trends', '/alerts', '/network', '/offenders', '/predict', '/copilot',
  '/cases', '/reports', '/about',
  '/beat', '/station', '/state', '/identify', '/ingest', '/alerts/digest',
];
const ROUTES = arg('--routes', '') ? arg('--routes', '').split(',') : DEFAULT_ROUTES;

// axe tags: WCAG 2.0/2.1/2.2 level A + AA. 'best-practice' is deliberately
// NOT included — it is advisory, not a conformance level.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Allow-list — every entry needs a reason. Nothing here hides a real defect:
// each is either a third-party canvas we cannot relabel or a rule whose
// failure is a known false positive on this markup. Keep it short.
const ALLOW = [
  // Leaflet's tile-less map pane and the Cytoscape canvas are declared
  // graphics with a text equivalent elsewhere on the page (table views);
  // axe cannot see that relationship and flags the scrollable pane.
  { id: 'scrollable-region-focusable', selector: /leaflet|cyto|__________cy/, reason: 'map / graph canvases carry a declared table equivalent (backlog row 134 is the keyboard-map item, phase 9)' },
];

const IMPACT_RANK = { minor: 0, moderate: 1, serious: 2, critical: 3 };

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function waitFor(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function startPreview() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error(`No build at ${DIST} — run: VITE_STATIC_DEMO=1 npm run build`);
    process.exit(2);
  }
  if (!(await portFree(PORT))) {
    console.log(`port ${PORT} already serving — reusing it`);
    return null;
  }
  const bin = path.join(CLIENT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [bin, 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: CLIENT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => process.stderr.write(String(d)));
  const ok = await waitFor(`http://127.0.0.1:${PORT}/`);
  if (!ok) { child.kill(); console.error('vite preview did not come up'); process.exit(2); }
  return child;
}

const TEXT_SPACING_CSS = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

function allowed(v, node) {
  return ALLOW.some((a) => a.id === v.id && (!a.selector || a.selector.test(String(node.target || ''))));
}

async function auditRoute(browser, route, theme, vp, { settle = 2500 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(vp.isMobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}),
    reducedMotion: 'reduce',
    locale: 'en-IN',
  });
  await ctx.addInitScript((th) => {
    try {
      localStorage.setItem('dappa-theme', th);
      localStorage.setItem('dappa-lang', 'en');
      localStorage.setItem('dappa-install-hint', '1');
    } catch { /* ignore */ }
  }, theme);
  const page = await ctx.newPage();
  const url = `http://127.0.0.1:${PORT}/#${route}`;
  await page.goto(url, { waitUntil: 'load' });
  // lazy route chunk + first data paint; the demo snapshot answers instantly
  await page.waitForSelector('#main-content', { timeout: 20000 });
  await page.waitForTimeout(settle);
  const notFound = await page.evaluate(() => /Route not found/.test(document.querySelector('#main-content')?.textContent || ''));
  if (notFound) { await ctx.close(); return { route, theme, viewport: vp.key, skipped: true }; }
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    .options({ rules: { 'target-size': { enabled: true } } })
    .exclude('.leaflet-tile-pane')
    .analyze();
  const violations = [];
  for (const v of results.violations) {
    let nodes = v.nodes.filter((n) => !allowed(v, n));
    if (v.id === 'target-size' && nodes.length) {
      // WCAG 2.5.8 "Equivalent" exception: a small target whose function is
      // also offered by a conforming control on the same page. The markup
      // declares it (data-a11y-equivalent="<id of the big control>") and the
      // gate verifies that control exists and is ≥24×24 before excusing it.
      const sels = nodes.map((n) => String(n.target[0]));
      const excused = await page.evaluate((selectors) => selectors.map((sel) => {
        let el = null;
        try { el = document.querySelector(sel); } catch { return false; }
        const id = el && el.getAttribute('data-a11y-equivalent');
        if (!id) return false;
        const big = document.getElementById(id);
        if (!big) return false;
        const r = big.getBoundingClientRect();
        return r.width >= 24 && r.height >= 24;
      }), sels);
      nodes = nodes.filter((_, i) => !excused[i]);
    }
    if (!nodes.length) continue;
    violations.push({ id: v.id, impact: v.impact, help: v.help, count: nodes.length, targets: nodes.slice(0, 3).map((n) => String(n.target[0]).slice(0, 120)) });
  }
  await ctx.close();
  return { route, theme, viewport: vp.key, violations, passes: results.passes.length, incomplete: results.incomplete.length };
}

async function spacingRoute(browser, route) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('dappa-lang', 'kn'); localStorage.setItem('dappa-fontsize', 'large'); localStorage.setItem('dappa-install-hint', '1'); } catch { /* ignore */ }
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/#${route}`, { waitUntil: 'load' });
  await page.waitForSelector('#main-content', { timeout: 15000 });
  await page.waitForTimeout(1200);
  // Visible elements whose box runs past the viewport edge — scrollWidth is
  // not used because invisible absolutely-positioned tooltips (.tt::after,
  // opacity 0) legitimately extend it. Measured before and after the spacing
  // overrides so a pre-existing layout overflow is not blamed on 1.4.12.
  const probe = () => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    let clipped = 0;
    // An element inside a box that scrolls on purpose (a wide table, the A4
    // brief preview, a Leaflet pane) is not a page overflow. Matched on the
    // COMPUTED overflow rather than on a class name: .chart-table and the
    // tier tables get their scrolling from a component class, so a
    // class-name test counted every one of their rows as an overflow.
    const insideScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        // Stop at the two roots the probe collects from — #main-content and the
        // app topbar (a direct child of body). NOT at any <header>: the brief
        // preview has its own document <header>, and stopping there hid the
        // fact that the whole A4 page sits inside .brief-scroll.
        if (p.id === 'main-content' || p.parentElement === document.body) return false;
        if (p.classList.contains('leaflet-container')) return true;
        const pcs = getComputedStyle(p);
        if (/auto|scroll/.test(pcs.overflowX) || /auto|scroll/.test(pcs.overflowY)) return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('#main-content *, header *')) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 2 && !insideScroller(el)) {
        out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`);
      }
      if (cs.whiteSpace === 'nowrap' && el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible' && /rounded-full|chip/.test(String(el.className))) clipped += 1;
    }
    return { overflow: out.length, samples: [...new Set(out)].slice(0, 4), clipped };
  });
  const before = await probe();
  await page.addStyleTag({ content: TEXT_SPACING_CSS });
  await page.waitForTimeout(300);
  const after = await probe();
  await ctx.close();
  return { route, before, after };
}

const preview = await startPreview();
const browser = await chromium.launch({ headless: !flag('--headed') });
const report = { generatedAt: new Date().toISOString(), tags: TAGS, routes: [], spacing: [] };
let seriousOrCritical = 0;
try {
  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        let r;
        try {
          r = await auditRoute(browser, route, theme, vp);
        } catch (e) {
          r = { route, theme, viewport: vp.key, error: String(e && e.message || e).slice(0, 200) };
        }
        // A cold lazy chunk can miss the first settle window, and a panel caught
        // mid-skeleton can report a transient contrast pair. Any error or
        // serious finding earns one re-audit with a longer settle; only findings
        // present in BOTH runs count (a real defect is stable, a race is not).
        if (r.error || (r.violations && r.violations.some((v) => IMPACT_RANK[v.impact] >= 2))) {
          let again;
          try { again = await auditRoute(browser, route, theme, vp, { settle: 4000 }); } catch (e) { again = { route, theme, viewport: vp.key, error: String(e && e.message || e).slice(0, 200) }; }
          if (!again.error && !again.skipped) {
            if (r.error) r = again;
            else {
              const key = (v) => `${v.id}|${v.targets.join('|')}`;
              const keep = new Set(again.violations.map(key));
              r = { ...again, violations: r.violations.filter((v) => keep.has(key(v))), reaudited: true };
            }
          }
        }
        report.routes.push(r);
        const where = `${theme.padEnd(5)} ${vp.key.padEnd(7)}`;
        if (r.skipped) { console.log(`skip  ${route.padEnd(15)} ${where} (route not in this build)`); continue; }
        if (r.error) { console.log(`ERR   ${route.padEnd(15)} ${where} ${r.error}`); seriousOrCritical += 1; continue; }
        const bad = r.violations.filter((v) => IMPACT_RANK[v.impact] >= 2);
        seriousOrCritical += bad.reduce((n, v) => n + v.count, 0);
        const summary = r.violations.map((v) => `${v.id}(${v.impact}×${v.count})`).join(' ') || 'clean';
        console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${route.padEnd(15)} ${where} ${summary}`);
        for (const v of bad) for (const tgt of v.targets) console.log(`        ${v.id}: ${tgt}`);
      }
    }
  }
  if (SPACING) {
    console.log('\ntext-spacing / large-text / Kannada @360px (WCAG 1.4.12 sanity — informational):');
    for (const route of ROUTES) {
      if (report.routes.find((r) => r.route === route && r.skipped)) continue;
      try {
        const s = await spacingRoute(browser, route);
        report.spacing.push(s);
        const delta = s.after.overflow - s.before.overflow;
        console.log(`  ${route.padEnd(15)} overflowing-elements before=${s.before.overflow} after-spacing=${s.after.overflow} (${delta >= 0 ? '+' : ''}${delta}) clipped-pills=${s.after.clipped}${s.after.samples.length ? '  e.g. ' + s.after.samples.join(', ') : ''}`);
      } catch (e) {
        console.log(`  ${route.padEnd(15)} error ${String(e && e.message || e).slice(0, 120)}`);
      }
    }
  }
} finally {
  await browser.close();
  if (preview) preview.kill();
}

const audited = report.routes.filter((r) => !r.skipped && !r.error);
const totals = { minor: 0, moderate: 0, serious: 0, critical: 0 };
for (const r of audited) for (const v of r.violations) totals[v.impact] = (totals[v.impact] || 0) + v.count;
report.totals = totals;
report.seriousOrCritical = seriousOrCritical;
console.log(`\naxe: ${audited.length} route×theme×viewport audits (${VIEWPORTS.map((v) => `${v.width}×${v.height}`).join(' + ')}) · violations minor=${totals.minor} moderate=${totals.moderate} serious=${totals.serious} critical=${totals.critical}`);
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); console.log(`report → ${OUT}`); }
if (seriousOrCritical > 0) {
  console.error(`a11y FAILED — ${seriousOrCritical} serious/critical violation node(s) (or audit errors).`);
  process.exit(1);
}
console.log('a11y OK — no serious or critical WCAG 2.2 AA violations.');
