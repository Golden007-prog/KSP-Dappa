// About — project story, quick links (live demo / static demo / source, each
// with a copy-link button), sticky in-page anchor nav with scroll-spy
// highlighting, datathon challenge-coverage matrix (6 scored capabilities →
// in-app routes), architecture diagram (pure CSS/SVG), data-lineage strip
// (generate.py → Data Store → API → UI), AI degradation-design explainer,
// filterable Catalyst services matrix (live count computed from the data),
// synthetic-data + ethics statement, accessibility statement, embedded
// keyboard-shortcut reference, layered tech stack and team credits (degrades
// to a single "Team Rainfall" card until names are added).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { copyText } from './copilot/clipboard.js';

const LINKS = {
  live: 'https://project-rainfall-60079891305.development.catalystserverless.in/app/index.html',
  pages: 'https://golden007-prog.github.io/KSP-Dappa/',
  repo: 'https://github.com/Golden007-prog/KSP-Dappa',
};

const SERVICES = [
  { n: 1, name: 'Web Client Hosting / Slate', use: 'React SPA hosting (Slate bonus: Git auto-deploy)' },
  { n: 2, name: 'Serverless Functions — Advanced I/O', use: 'dappa_api Express REST API' },
  { n: 3, name: 'Functions — Cron/Job Scheduling', use: 'dappa_nightly Python analytics refresh' },
  { n: 4, name: 'Signals + Event Functions', use: 'New-FIR insert → incremental aggregates + anomaly check' },
  { n: 5, name: 'Data Store (+ ZCQL)', use: 'Official ER schema (24 tables) + 8 analytics tables' },
  { n: 6, name: 'NoSQL', use: 'Network graph snapshots; copilot RAG context docs' },
  { n: 7, name: 'Stratus', use: 'Raw datasets, Karnataka GeoJSON, generated PDF briefs' },
  { n: 8, name: 'Cache', use: 'KPI/choropleth aggregates (ms-level dashboard)' },
  { n: 9, name: 'QuickML (tabular)', use: 'Case-outcome / high-risk-beat classifier endpoint' },
  { n: 10, name: 'QuickML LLM Serving + RAG', use: '“Ask DAPPA” natural-language copilot' },
  { n: 11, name: 'Zia Text Analytics', use: 'NER/keywords/sentiment → MO tags from BriefFacts' },
  { n: 12, name: 'SmartBrowz', use: 'One-click Weekly Intelligence Brief PDF' },
  { n: 13, name: 'Catalyst Mail', use: 'Anomaly alert digest to SCRB inbox' },
  { n: 14, name: 'Authentication', use: 'Officer login + public read-only demo mode' },
  { n: 15, name: 'API Gateway', use: 'Routing/throttling in front of dappa_api' },
  { n: 16, name: 'Pipelines (CI/CD) + GitHub integration', use: 'Auto build-and-deploy from main' },
  { n: 17, name: 'Circuits', use: 'Orchestrated multi-step nightly workflow', stretch: true },
  { n: 18, name: 'ConvoKraft', use: 'Alternate copilot chip if LLM serving unavailable', stretch: true },
];

// Layered tech stack (replaces the old flat chip list; grouping only — no
// item was removed).
const STACK_GROUPS = [
  {
    label: 'Frontend',
    items: ['React 18', 'Vite 5', 'Tailwind CSS', 'React Router 6', 'TanStack Query 5', 'Zustand', 'ECharts', 'Leaflet + heat', 'Cytoscape (fcose)'],
  },
  {
    label: 'API & data',
    items: ['Node 20 + Express', 'Catalyst Data Store + ZCQL', 'Cache', 'NoSQL', 'Stratus'],
  },
  {
    label: 'Analytics & ML',
    items: ['Python', 'pandas', 'scikit-learn', 'networkx', 'statsmodels'],
  },
];

// Fill in before the demo: { name: 'A. Person', role: 'Data & pipeline' }.
// While empty, the card degrades to a single "Team Rainfall" line instead of
// showing placeholder slots.
const TEAM = [];

const FLOW = [
  ['Generate', 'A seeded synthetic engine writes 24 ER-schema tables of Kannada-region FIRs — deterministic, reproducible, fictional.'],
  ['Precompute', 'The nightly Python pipeline distills them into 8 analytics tables: aggregates, DBSCAN hotspots, forecasts, anomaly z-scores, identity-resolved co-offender graph.'],
  ['Serve', 'dappa_api answers every screen from indexed reads + Cache; live AI calls (QuickML, Zia, the copilot) are flagged and degrade to deterministic fallbacks.'],
  ['Decide', 'An officer sees maps, trends, alerts, forecasts and briefs — with provenance badges on every AI-touched number, and stays in the loop.'],
];

// The 6 scored capability areas of the KSP Datathon challenge, mapped to the
// app routes where each one is demonstrated.
const CHALLENGE = [
  {
    n: 1,
    name: 'Advanced Visualization',
    desc: 'Interactive dashboards and geospatial maps; district → police-station drill-down; spatiotemporal clusters layering time-of-day with location; red-zone pulsing when a category spikes vs its historical average.',
    areas: [['Dashboard', '/'], ['GeoIntel', '/map'], ['Trends', '/trends'], ['Alerts', '/alerts']],
  },
  {
    n: 2,
    name: 'Criminological Network & Link Analysis',
    desc: 'Relationship mapping across suspects, victims and recurring locations; repeat-offender tracking with modus operandi across jurisdictions; hidden-association detection.',
    areas: [['Network', '/network'], ['Offenders', '/offenders'], ['Cases', '/cases']],
  },
  {
    n: 3,
    name: 'Sociological & AI-Driven Predictive Dashboards',
    desc: 'Socio-economic correlation overlays — the “why” behind the “where”; predictive risk scoring for high-risk areas; anomaly call-outs linking complex cases.',
    areas: [['Predict', '/predict'], ['GeoIntel', '/map'], ['Alerts', '/alerts']],
  },
  {
    n: 4,
    name: 'Pattern & Trend Discovery',
    desc: 'Statistical spatial and temporal hotspots — seasonality, day × hour heatmaps and DBSCAN clusters — aimed at resource deployment.',
    areas: [['Trends', '/trends'], ['GeoIntel', '/map'], ['Reports', '/reports']],
  },
  {
    n: 5,
    name: 'Network & Behavioral Analysis',
    desc: 'Co-offender communities and organized-crime clusters from the identity-resolved graph; recurring MO signatures per offender.',
    areas: [['Network', '/network'], ['Offenders', '/offenders']],
  },
  {
    n: 6,
    name: 'AI/ML-Driven Intelligence',
    desc: 'ML for hidden correlations, anomaly detection and emerging-risk prediction — plus a natural-language copilot whose every answer shows its query, sources and confidence.',
    areas: [['Ask DAPPA', '/copilot'], ['Predict', '/predict'], ['Alerts', '/alerts']],
  },
];

// generate.py → Data Store → API → UI provenance pipeline (pure CSS).
const LINEAGE = [
  ['pipeline/generate.py', 'Seeded synthetic engine writes the 24-table official ER schema — 45k FIRs, deterministic and fully fictional.'],
  ['scripts/bulk_load.js', 'Bulk-loads the generated CSVs into console-created Catalyst Data Store tables.'],
  ['pipeline/analytics.py', 'Nightly distillation into 8 analytics tables: aggregates, hotspots, forecasts, anomaly z-scores, offender network.'],
  ['functions/dappa_api', 'Express REST over ZCQL with a fixture fallback — every endpoint stays alive even with the Data Store unreachable.'],
  ['client (React SPA)', 'Dashboards, maps, networks and the copilot — provenance badges on every AI-touched number.'],
];

// "Demo never dies": each AI feature's live path and its deterministic fallback.
const AI_DESIGN = [
  {
    feature: 'Ask DAPPA copilot',
    live: 'QuickML LLM Serving + RAG grounded on Data Store context',
    fallback: 'Deterministic intent grammar → ZCQL → templated answer; the suggested questions always answer',
  },
  {
    feature: 'Outcome prediction',
    live: 'QuickML tabular classifier scoring case features',
    fallback: 'Calibrated scorecard from historical outcome rates',
  },
  {
    feature: 'Case narrative & MO tags',
    live: 'Zia Text Analytics NER/keywords over BriefFacts',
    fallback: 'Keyword/regex extraction with the same output shape',
  },
  {
    feature: 'Weekly intelligence brief',
    live: 'SmartBrowz renders the PDF server-side',
    fallback: 'Print-optimised in-app brief route (Ctrl+P to PDF)',
  },
  {
    feature: 'Forecasts & anomaly alerts',
    live: 'Precomputed nightly (Holt-Winters + z-scores) — served as indexed reads',
    fallback: 'Same tables from the bundled fixture snapshot',
  },
];

const A11Y = [
  ['Keyboard-first', 'Every control is reachable by Tab; tab lists and radio groups use roving arrow-key focus; press ? anywhere for the shortcut sheet.'],
  ['Touch & small screens', 'Interactive targets are at least 40px and layouts are verified down to 360px-wide phones.'],
  ['Screen readers', 'ARIA landmarks and labels throughout; the copilot chat is a polite live region; loading and status changes are announced via visually hidden text.'],
  ['Charts have equals', 'Every chart offers an accessible data-table view and CSV export — no information is locked inside pixels.'],
  ['Theme & contrast', 'Dark and light themes come from one contrast-checked token set; charts re-theme with the app.'],
  ['Motion', 'prefers-reduced-motion is respected, with an additional manual motion toggle in the top bar; dialogs trap focus and restore it on close.'],
];

// Mirrors the global shortcut layer registered in Layout.jsx and the
// copilot-local keys — keep in sync when either changes.
const SHORTCUTS = [
  {
    group: 'Anywhere', keys: [
      ['Ctrl/⌘ K', 'Command palette — jump to any screen or action'],
      ['g then d · m · t · a · c · n · o · p · r', 'Go to Dashboard, Map, Trends, Alerts, Cases, Network, Offenders, Predict, Reports'],
      ['t', 'Toggle dark / light theme'],
      ['f', 'Zen mode (on GeoIntel: map fullscreen)'],
      ['?', 'Open the shortcut sheet'],
      ['Esc', 'Close a dialog or sheet'],
    ],
  },
  {
    group: 'Ask DAPPA', keys: [
      ['/', 'Focus the question input'],
      ['↑ ↓', 'Recall question history (shell-style)'],
      ['Esc', 'Stop voice capture / blur the input'],
    ],
  },
];

const SECTIONS = [
  { id: 'story', label: 'Story' },
  { id: 'links', label: 'Links' },
  { id: 'challenge', label: 'Challenge' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'lineage', label: 'Lineage' },
  { id: 'ai', label: 'AI design' },
  { id: 'services', label: 'Services' },
  { id: 'ethics', label: 'Ethics' },
  { id: 'access', label: 'Accessibility' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'team', label: 'Team' },
];

function Stat({ value, label }) {
  return (
    <div className="rounded-lg border border-grid bg-base/40 px-3 py-2.5 text-center">
      <div className="num text-lg font-semibold text-ink">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted mt-0.5">{label}</div>
    </div>
  );
}

// Buttons (not <a href="#…">): in-page hash anchors would collide with
// HashRouter's route fragment, so we scroll programmatically instead. A
// viewport IntersectionObserver highlights the section currently in view.
function AnchorNav() {
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    const els = SECTIONS
      .map((s) => document.getElementById(`about-${s.id}`))
      .filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id.replace('about-', ''));
    }, { rootMargin: '-15% 0px -65% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const go = (id) => {
    const el = document.getElementById(`about-${id}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setActive(id);
  };

  return (
    <nav aria-label="On this page" className="no-print sticky top-14 z-30 -mx-4 px-4 md:-mx-6 md:px-6 bg-base/85 backdrop-blur-md">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-2">
        {SECTIONS.map((s) => {
          const on = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              aria-current={on ? 'true' : undefined}
              className={`shrink-0 min-h-[40px] rounded-full border px-3.5 text-xs transition-colors ${
                on
                  ? 'border-amber/60 bg-amber/10 text-amber'
                  : 'border-grid bg-panel text-muted hover:text-ink hover:border-primary/60'
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ExtLink({ href, title, sub, accent = false }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`flex flex-1 min-w-0 items-center gap-3 rounded-lg border p-3 transition-colors group ${
        accent ? 'border-amber/50 bg-amber/5 hover:border-amber' : 'border-grid bg-base/40 hover:border-primary/60'
      }`}
    >
      <div className={`grid place-items-center h-8 w-8 shrink-0 rounded-lg border ${accent ? 'border-amber/40 text-amber' : 'border-grid text-muted group-hover:text-primary'}`}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 4h6v6M20 4 10 14" />
          <path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className={`text-xs font-semibold truncate ${accent ? 'text-amber' : 'text-ink'}`}>{title}</p>
        <p className="text-[11px] text-muted truncate">{sub}</p>
      </div>
    </a>
  );
}

// ExtLink + a copy-URL button, for judging machines where opening tabs is awkward.
function LinkRow({ href, title, sub, accent = false }) {
  const toast = useToast();
  const copy = async () => {
    const ok = await copyText(href);
    if (ok) toast.success('Link copied to clipboard');
    else toast.error('Copy failed — long-press the link and copy its address instead.');
  };
  return (
    <div className="flex items-stretch gap-1.5">
      <ExtLink href={href} title={title} sub={sub} accent={accent} />
      <Tooltip label="Copy this link">
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy link: ${title}`}
          className="grid place-items-center w-11 min-h-[44px] shrink-0 rounded-lg border border-grid bg-base/40 text-muted hover:text-primary hover:border-primary/60 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}

function Tier({ label, children, tint = 'border-grid' }) {
  return (
    <div className={`rounded-xl border ${tint} bg-base/60 p-3`}>
      <p className="text-[10px] uppercase tracking-widest text-muted mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const Box = ({ children, accent }) => (
  <span className={`rounded-lg border px-2.5 py-1.5 text-xs ${accent ? 'border-amber/50 text-amber bg-amber/5' : 'border-grid text-ink bg-panel'}`}>
    {children}
  </span>
);

const Arrow = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-1 text-muted">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 4v14m0 0 5-5m-5 5-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    {label && <span className="text-[10px]">{label}</span>}
  </div>
);

const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export default function About() {
  const [svcFilter, setSvcFilter] = useState('all');
  const liveCount = SERVICES.filter((s) => !s.stretch).length;
  const roadmapCount = SERVICES.length - liveCount;
  const visibleServices = SERVICES.filter((s) => (
    svcFilter === 'all' ? true : svcFilter === 'live' ? !s.stretch : !!s.stretch
  ));
  const filterChips = [
    { key: 'all', label: `All ${SERVICES.length}` },
    { key: 'live', label: `Live ${liveCount}` },
    { key: 'roadmap', label: `Roadmap ${roadmapCount}` },
  ];

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="page-title">About DAPPA</h1>
          <p className="page-subtitle">Data Analytics &amp; Predictive Policing Assistant — KSP Datathon 2026 prototype, built entirely on Zoho Catalyst</p>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Badge tone="amber">prototype</Badge>
          <Badge tone="teal">100% synthetic data</Badge>
        </div>
      </div>

      <AnchorNav />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div id="about-story" className="scroll-mt-32 xl:col-span-2">
          <Card title="The story" subtitle="From 30 lakh scattered FIR rows to one decision surface" className="h-full">
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <p>
                District officers drown in registers: which beat is heating up, which burglary series is the same gang,
                what next month looks like — the answers exist in FIR data but not at the speed of a morning briefing.
                <strong className="text-ink"> DAPPA turns the official KSP FIR schema into a command center</strong>:
                hotspot maps, seasonality, anomaly alerts, co-offending networks, station-risk forecasts, a
                natural-language copilot and a one-click weekly brief — every screen answerable in milliseconds because
                the heavy analytics run nightly, not per click.
              </p>
              <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none">
                {FLOW.map(([t, d], i) => (
                  <li key={t} className="flex gap-2.5 rounded-lg border border-grid bg-base/40 p-2.5">
                    <span className="num shrink-0 grid place-items-center h-6 w-6 rounded-full border border-amber/40 text-amber text-[11px] font-bold">{i + 1}</span>
                    <span><strong className="text-ink">{t}.</strong> {d}</span>
                  </li>
                ))}
              </ol>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <Stat value="14" label="app routes" />
                <Stat value="24 + 8" label="ER + analytics tables" />
                <Stat value={String(liveCount)} label="Catalyst services live" />
                <Stat value="0" label="external services" />
              </div>
            </div>
          </Card>
        </div>

        <div id="about-links" className="scroll-mt-32">
          <Card title="See it running" subtitle="Live deployment, static mirror, source" className="h-full">
            <div className="space-y-2">
              <LinkRow
                accent
                href={LINKS.live}
                title="Live demo — Zoho Catalyst"
                sub="project-rainfall · full API, flags & fallbacks"
              />
              <LinkRow
                href={LINKS.pages}
                title="Static demo — GitHub Pages"
                sub="no backend needed · snapshotted fixture API"
              />
              <LinkRow
                href={LINKS.repo}
                title="Source — github.com/Golden007-prog/KSP-Dappa"
                sub="client + functions + pipeline + scripts"
              />
              <p className="text-[11px] text-muted leading-relaxed pt-1">
                The Catalyst deployment is the official submission; the Pages mirror serves the same synthetic
                dataset from pre-generated JSON so the UI can be judged even offline.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div id="about-challenge" className="scroll-mt-32">
        <Card
          title="Datathon challenge coverage"
          subtitle="The 6 scored capability areas, and where each one lives in the app"
          actions={<Badge tone="teal">6 / 6 covered</Badge>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {CHALLENGE.map((c) => (
              <div key={c.n} className="rounded-lg border border-grid bg-base/40 p-3">
                <div className="flex items-start gap-2.5">
                  <span className="num shrink-0 grid place-items-center h-6 w-6 rounded-full border border-amber/40 text-amber text-[11px] font-bold">{c.n}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-semibold text-ink">{c.name}</p>
                      <Badge tone="teal" className="!text-[10px]">live</Badge>
                    </div>
                    <p className="text-[11px] text-muted mt-1 leading-relaxed">{c.desc}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {c.areas.map(([label, to]) => (
                        <Link
                          key={`${c.n}-${to}-${label}`}
                          to={to}
                          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 min-h-[32px] text-[11px] text-primary hover:border-primary hover:bg-primary/10 transition-colors"
                        >
                          {label}
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m0 0-5-5m5 5-5 5" /></svg>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            Every capability is reachable in at most two clicks from the dashboard — the chips above deep-link
            straight into the relevant screen.
          </p>
        </Card>
      </div>

      <div id="about-architecture" className="scroll-mt-32">
        <Card title="Architecture" subtitle="Everything runs inside one Catalyst project (Project-Rainfall) — no external AI, hosting, database, or auth services">
          <div className="space-y-1">
            <Tier label="Browser">
              <Box accent>React 18 SPA — dark command-center UI · Leaflet · ECharts · Cytoscape</Box>
            </Tier>
            <Arrow label="same-origin /server/dappa_api/api/v1" />
            <Tier label="API layer">
              <Box>API Gateway — routing &amp; throttling</Box>
              <Box accent>dappa_api — Advanced I/O function (Node 20 + Express)</Box>
            </Tier>
            <Arrow label="ZCQL reads · cached aggregates" />
            <Tier label="Data & jobs">
              <Box>Data Store — 24 ER tables + 8 analytics tables</Box>
              <Box>Cache — hot aggregates</Box>
              <Box>NoSQL — graph snapshots, RAG context</Box>
              <Box>Stratus — CSVs, GeoJSON, PDF briefs</Box>
              <Box>dappa_nightly — Cron job (Python): aggregates → hotspots → forecasts → anomalies → network</Box>
              <Box>Signals + Event function — new FIR → live anomaly check</Box>
            </Tier>
            <Arrow label="on-demand, every feature flag has a local fallback" />
            <Tier label="Catalyst AI services">
              <Box>QuickML — outcome classifier</Box>
              <Box>QuickML LLM Serving + RAG — copilot</Box>
              <Box>Zia Text Analytics — NER on BriefFacts</Box>
              <Box>SmartBrowz — weekly brief PDF</Box>
              <Box>Catalyst Mail — digests</Box>
              <Box>Authentication — public demo mode</Box>
            </Tier>
          </div>
          <p className="text-xs text-muted mt-3 leading-relaxed">
            The nightly Python pipeline precomputes hotspots (DBSCAN), forecasts with confidence intervals, anomaly
            z-scores, offender identity resolution and co-accused network communities into Data Store tables, so every
            click in the demo is a fast indexed read. Live AI calls (QuickML scoring, Zia NER, the copilot) are
            on-demand and degrade gracefully to deterministic local fallbacks with a visible source badge.
          </p>
        </Card>
      </div>

      <div id="about-lineage" className="scroll-mt-32">
        <Card title="Data lineage" subtitle="From seed to screen — the provenance of every number on every page">
          <ol className="flex flex-col md:flex-row md:items-stretch gap-1 list-none">
            {LINEAGE.map(([stage, desc], i) => (
              <li key={stage} className="flex flex-col md:flex-row md:items-stretch md:flex-1 min-w-0 gap-1">
                <div className="flex-1 min-w-0 rounded-lg border border-grid bg-base/40 p-2.5">
                  <p className="text-[11px] font-mono font-semibold text-teal break-words">{stage}</p>
                  <p className="text-[10px] text-muted mt-1 leading-relaxed">{desc}</p>
                </div>
                {i < LINEAGE.length - 1 && (
                  <span className="self-center shrink-0 text-muted px-0.5 rotate-90 md:rotate-0" aria-hidden="true">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m0 0-5-5m5 5-5 5" /></svg>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            The whole chain is reproducible from one seed: re-running <span className="font-mono">generate.py</span> and
            the analytics pass rebuilds byte-identical tables, which is why every copilot answer can cite the exact
            ZCQL and source table it came from.
          </p>
        </Card>
      </div>

      <div id="about-ai" className="scroll-mt-32">
        <Card
          title="AI degradation design"
          subtitle="“The demo never dies” — every AI feature is flagged, falls back deterministically, and badges its source"
        >
          <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[1.1fr_1.4fr_1.4fr] gap-2 px-3">
              <p className="eyebrow">Feature</p>
              <p className="eyebrow">Live path (flag on)</p>
              <p className="eyebrow">Fallback (flag off / service down)</p>
            </div>
            {AI_DESIGN.map((row) => (
              <div key={row.feature} className="grid grid-cols-1 md:grid-cols-[1.1fr_1.4fr_1.4fr] gap-1.5 md:gap-2 rounded-lg border border-grid bg-base/40 p-3">
                <p className="text-xs font-semibold text-ink">{row.feature}</p>
                <p className="text-[11px] text-muted leading-relaxed">
                  <span className="md:hidden text-[9px] uppercase tracking-wider text-amber mr-1.5">Live</span>
                  {row.live}
                </p>
                <p className="text-[11px] text-muted leading-relaxed">
                  <span className="md:hidden text-[9px] uppercase tracking-wider text-teal mr-1.5">Fallback</span>
                  {row.fallback}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            The UI always tells you which path answered: engine and source badges on copilot answers, provenance chips
            on predictions, and a fixture banner when the API is serving from its bundled snapshot. Ask DAPPA goes one
            step further — each answer carries a confidence label, the parsed intent, and citation chips for the exact
            Data Store tables its ZCQL read.
          </p>
        </Card>
      </div>

      <div id="about-services" className="scroll-mt-32">
        <Card
          title="Catalyst services used"
          subtitle={`${liveCount} of ${SERVICES.length} live in the prototype · ${roadmapCount} documented roadmap items`}
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Filter services">
            {filterChips.map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={svcFilter === c.key}
                onClick={() => setSvcFilter(c.key)}
                className={`min-h-[40px] rounded-full border px-3.5 text-[11px] transition-colors ${
                  svcFilter === c.key
                    ? 'border-amber/60 bg-amber/10 text-amber'
                    : 'border-grid text-muted hover:text-ink hover:border-primary/50'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {visibleServices.map((s) => (
              <div key={s.n} className={`rounded-lg border p-3 ${s.stretch ? 'border-grid/60 opacity-70' : 'border-grid'} bg-base/40`}>
                <div className="flex items-center gap-2">
                  <span className="num text-[10px] text-muted w-5 shrink-0">{String(s.n).padStart(2, '0')}</span>
                  <span className="text-xs font-semibold text-ink">{s.name}</span>
                  {s.stretch && <Badge tone="slate" className="ml-auto">roadmap</Badge>}
                </div>
                <p className="text-[11px] text-muted mt-1 ml-7">{s.use}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div id="about-ethics" className="scroll-mt-32">
          <Card title="Data ethics" subtitle="Synthetic by design, fair by constraint" className="h-full">
            <ul className="space-y-2 text-xs text-muted leading-relaxed">
              <li className="flex gap-2">
                <span className="text-amber shrink-0">•</span>
                <span><strong className="text-ink">100% synthetic data.</strong> Every person, case and narrative is generated
                (Kannada-region name pools, seeded and deterministic). Nothing here describes a real individual or a real FIR,
                and the banner above every screen says so.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber shrink-0">•</span>
                <span><strong className="text-ink">Caste and religion are never model inputs.</strong> The official ER schema
                carries these columns for fidelity, but they are excluded from every ML feature set, every analytics output and
                every screen of this application.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber shrink-0">•</span>
                <span><strong className="text-ink">Decision support, not automated decisions.</strong> Forecasts, risk scores and
                identity-resolution links are advisory signals with visible model provenance (source badge, backtest MAPE,
                precision estimates) — an officer stays in the loop.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-amber shrink-0">•</span>
                <span><strong className="text-ink">Public demo is read-only.</strong> Administrative actions (acknowledging
                alerts, sending digests) sit behind Catalyst Authentication when demo mode is off.</span>
              </li>
            </ul>
          </Card>
        </div>

        <div id="about-access" className="scroll-mt-32">
          <Card title="Accessibility" subtitle="Built to be operable by every officer, on every device" className="h-full">
            <ul className="space-y-2 text-xs text-muted leading-relaxed">
              {A11Y.map(([t, d]) => (
                <li key={t} className="flex gap-2">
                  <span className="text-teal shrink-0">•</span>
                  <span><strong className="text-ink">{t}.</strong> {d}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              Accessibility is a moving target — issues found during judging are welcome on the GitHub repository.
            </p>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div id="about-shortcuts" className="scroll-mt-32">
          <Card title="Keyboard shortcuts" subtitle="Also available anywhere by pressing ?" className="h-full">
            <div className="space-y-3">
              {SHORTCUTS.map((sec) => (
                <section key={sec.group}>
                  <p className="eyebrow mb-1">{sec.group}</p>
                  <ul className="divide-y divide-grid/40">
                    {sec.keys.map(([keys, desc]) => (
                      <li key={`${sec.group}-${keys}`} className="flex items-start justify-between gap-3 py-1.5">
                        <span className="text-xs text-muted leading-relaxed">{desc}</span>
                        <span className="shrink-0 flex flex-wrap justify-end gap-1">
                          {keys.split(' · ').map((k) => (
                            <kbd key={k} className="num rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[10px] text-ink whitespace-nowrap">{k}</kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <p className="text-[11px] text-muted leading-relaxed">
                Shortcuts pause while you type in any input, and never hijack a key inside an open dialog.
              </p>
            </div>
          </Card>
        </div>

        <div id="about-team" className="scroll-mt-32">
          <Card title="Team & credits" subtitle="KSP Datathon 2026 · project “Rainfall”" className="h-full">
            <div className="space-y-3">
              {TEAM.length > 0 ? (
                <div className="space-y-2">
                  {TEAM.map((m) => (
                    <div key={m.name} className="flex items-center gap-3 rounded-lg border border-grid bg-base/40 p-3">
                      <div className="w-9 h-9 shrink-0 rounded-full bg-amber/15 border border-amber/30 text-amber grid place-items-center text-xs font-bold">
                        {initials(m.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-ink font-semibold truncate">{m.name}</p>
                        {m.role && <p className="text-[11px] text-muted truncate">{m.role}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-grid bg-base/40 p-3">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-amber/15 border border-amber/30 text-amber grid place-items-center text-xs font-bold">R</div>
                  <div className="min-w-0">
                    <p className="text-xs text-ink font-semibold">Team Rainfall</p>
                    <p className="text-[11px] text-muted">KSP Datathon 2026 — design, data engineering &amp; analytics by the Rainfall crew</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {STACK_GROUPS.map((g) => (
                  <div key={g.label}>
                    <p className="eyebrow mb-1.5">{g.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((t) => (
                        <span key={t} className="chip !py-0.5 !text-[11px] text-muted">{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Built on the official KSP FIR ER schema (Data Store), a seeded synthetic data engine, and
                Catalyst-native analytics. Karnataka district boundaries served from Stratus as GeoJSON; Inter
                typeface bundled — nothing loads from a CDN.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
