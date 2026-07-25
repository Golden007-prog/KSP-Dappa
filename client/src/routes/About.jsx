// About — project story, quick links (live demo / static demo / source, each
// with a copy-link button), sticky in-page anchor nav with scroll-spy
// highlighting, datathon challenge-coverage matrix (6 scored capabilities →
// in-app routes), architecture diagram (pure CSS/SVG), data-lineage strip
// (generate.py → Data Store → API → UI), AI degradation-design explainer,
// filterable Catalyst services matrix (live count computed from the data),
// synthetic-data + ethics statement, accessibility statement, trilingual
// (English · ಕನ್ನಡ · हिन्दी) support statement, embedded keyboard-shortcut
// reference, layered tech stack and team credits (degrades to a single
// "Team Rainfall" card until names are added).
//
// Every user-visible string lives in the `copilot` namespace under `about.*`.
// Product names (Catalyst services, libraries), file paths, table names and
// key glyphs stay verbatim in all three languages — translating them would
// make the page unusable to a judge checking the submission against Catalyst.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useT } from '../lib/i18n.jsx';
import { copyText } from './copilot/clipboard.js';

const LINKS = {
  live: 'https://project-rainfall-60079891305.development.catalystserverless.in/app/index.html',
  pages: 'https://golden007-prog.github.io/KSP-Dappa/',
  repo: 'https://github.com/Golden007-prog/KSP-Dappa',
};

// Service names are Catalyst product names — untranslated by design; the
// "use" column is t('copilot.about.services.s<n>').
const SERVICES = [
  { n: 1, name: 'Web Client Hosting / Slate' },
  { n: 2, name: 'Serverless Functions — Advanced I/O' },
  { n: 3, name: 'Functions — Cron/Job Scheduling' },
  { n: 4, name: 'Signals + Event Functions' },
  { n: 5, name: 'Data Store (+ ZCQL)' },
  { n: 6, name: 'NoSQL' },
  { n: 7, name: 'Stratus' },
  { n: 8, name: 'Cache' },
  { n: 9, name: 'QuickML (tabular)' },
  { n: 10, name: 'QuickML LLM Serving + RAG' },
  { n: 11, name: 'Zia Text Analytics' },
  { n: 12, name: 'SmartBrowz' },
  { n: 13, name: 'Catalyst Mail' },
  { n: 14, name: 'Authentication' },
  { n: 15, name: 'API Gateway' },
  { n: 16, name: 'Pipelines (CI/CD) + GitHub integration' },
  { n: 17, name: 'Circuits', stretch: true },
  { n: 18, name: 'ConvoKraft', stretch: true },
];

// Layered tech stack (grouping only — no item was removed). Library names
// stay as-is; only the group label is translated.
const STACK_GROUPS = [
  {
    key: 'frontend',
    items: ['React 18', 'Vite 5', 'Tailwind CSS', 'React Router 6', 'TanStack Query 5', 'Zustand', 'ECharts', 'Leaflet + heat', 'Cytoscape (fcose)'],
  },
  {
    key: 'api',
    items: ['Node 20 + Express', 'Catalyst Data Store + ZCQL', 'Cache', 'NoSQL', 'Stratus'],
  },
  {
    key: 'analytics',
    items: ['Python', 'pandas', 'scikit-learn', 'networkx', 'statsmodels'],
  },
];

// Fill in before the demo: { name: 'A. Person', role: 'Data & pipeline' }.
// While empty, the card degrades to a single "Team Rainfall" line instead of
// showing placeholder slots.
const TEAM = [];

const FLOW = ['generate', 'precompute', 'serve', 'decide'];

// The 6 scored capability areas of the KSP Datathon challenge, mapped to the
// app routes where each one is demonstrated. `areas` holds common-namespace
// nav keys so a route chip reads the same here as in the sidebar.
const CHALLENGE = [
  { n: 1, areas: [['dashboard', '/'], ['geointel', '/map'], ['trends', '/trends'], ['alerts', '/alerts']] },
  { n: 2, areas: [['network', '/network'], ['offenders', '/offenders'], ['cases', '/cases']] },
  { n: 3, areas: [['predict', '/predict'], ['geointel', '/map'], ['alerts', '/alerts']] },
  { n: 4, areas: [['trends', '/trends'], ['geointel', '/map'], ['reports', '/reports']] },
  { n: 5, areas: [['network', '/network'], ['offenders', '/offenders']] },
  { n: 6, areas: [['copilot', '/copilot'], ['predict', '/predict'], ['alerts', '/alerts']] },
];

// generate.py → Data Store → API → UI provenance pipeline (pure CSS). The
// stage is a repo path and stays verbatim.
const LINEAGE = [
  ['pipeline/generate.py', 'd1'],
  ['scripts/bulk_load.js', 'd2'],
  ['pipeline/analytics.py', 'd3'],
  ['functions/dappa_api', 'd4'],
  ['client (React SPA)', 'd5'],
];

// "Demo never dies": each AI feature's live path and its deterministic fallback.
const AI_DESIGN = ['r1', 'r2', 'r3', 'r4', 'r5'];

const A11Y = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];

const LANGUAGES = ['l1', 'l2', 'l3', 'l4', 'l5'];

// Mirrors the global shortcut layer registered in Layout.jsx and the
// copilot-local keys — keep in sync when either changes. Key glyphs stay
// literal; only the "g then d" row needs a translated connector word.
const SHORTCUTS = [
  {
    group: 'anywhere',
    rows: [
      { keys: 'Ctrl/⌘ K', d: 'k1' },
      { keysKey: 'goKeys', d: 'k2' },
      { keys: 't', d: 'k3' },
      { keys: 'f', d: 'k4' },
      { keys: '?', d: 'k5' },
      { keys: 'Esc', d: 'k6' },
    ],
  },
  {
    group: 'copilot',
    rows: [
      { keys: '/', d: 'c1' },
      { keys: '↑ ↓', d: 'c2' },
      { keys: 'Esc', d: 'c3' },
    ],
  },
];

const SECTIONS = [
  'story', 'links', 'challenge', 'architecture', 'lineage', 'ai',
  'services', 'ethics', 'access', 'languages', 'shortcuts', 'team',
];

const ARCH_BOXES = {
  api: ['gateway', 'api'],
  data: ['datastore', 'cache', 'nosql', 'stratus', 'nightly', 'signals'],
  ai: ['quickml', 'llm', 'zia', 'smartbrowz', 'mail', 'auth'],
};

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
  const t = useT();
  const [active, setActive] = useState(SECTIONS[0]);

  useEffect(() => {
    const els = SECTIONS
      .map((s) => document.getElementById(`about-${s}`))
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
    <nav aria-label={t('copilot.about.nav.aria')} className="no-print sticky top-14 z-30 -mx-4 px-4 md:-mx-6 md:px-6 bg-base/85 backdrop-blur-md">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-2">
        {SECTIONS.map((id) => {
          const on = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={on ? 'true' : undefined}
              className={`shrink-0 min-h-[40px] rounded-full border px-3.5 text-xs transition-colors ${
                on
                  ? 'border-amber/60 bg-amber/10 text-amber'
                  : 'border-grid bg-panel text-muted hover:text-ink hover:border-primary/60'
              }`}
            >
              {t(`copilot.about.sec.${id}`)}
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
  const t = useT();
  const copy = async () => {
    const ok = await copyText(href);
    if (ok) toast.success(t('copilot.about.links.copied'));
    else toast.error(t('copilot.about.links.copyFailed'));
  };
  return (
    <div className="flex items-stretch gap-1.5">
      <ExtLink href={href} title={title} sub={sub} accent={accent} />
      <Tooltip label={t('copilot.about.links.copyTip')}>
        <button
          type="button"
          onClick={copy}
          aria-label={t('copilot.about.links.copyAria', { title })}
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

// Bullet list shared by the ethics / accessibility / languages cards.
const PointList = ({ items, dot = 'text-teal' }) => (
  <ul className="space-y-2 text-xs text-muted leading-relaxed">
    {items.map(([key, head, body]) => (
      <li key={key} className="flex gap-2">
        <span className={`${dot} shrink-0`}>•</span>
        <span><strong className="text-ink">{head}</strong> {body}</span>
      </li>
    ))}
  </ul>
);

const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export default function About() {
  const t = useT();
  const [svcFilter, setSvcFilter] = useState('all');
  const liveCount = SERVICES.filter((s) => !s.stretch).length;
  const roadmapCount = SERVICES.length - liveCount;
  const visibleServices = SERVICES.filter((s) => (
    svcFilter === 'all' ? true : svcFilter === 'live' ? !s.stretch : !!s.stretch
  ));
  const filterChips = [
    { key: 'all', label: t('copilot.about.services.all', { n: SERVICES.length }) },
    { key: 'live', label: t('copilot.about.services.live', { n: liveCount }) },
    { key: 'roadmap', label: t('copilot.about.services.roadmap', { n: roadmapCount }) },
  ];

  // Keep `generate.py` in a mono span wherever the translation places it.
  const lineageNote = t('copilot.about.lineage.note').split('generate.py');

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="page-title">{t('copilot.about.page.title')}</h1>
          <p className="page-subtitle">{t('copilot.about.page.subtitle')}</p>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Badge tone="amber">{t('copilot.about.badge.prototype')}</Badge>
          <Badge tone="teal">{t('copilot.about.badge.synthetic')}</Badge>
        </div>
      </div>

      <AnchorNav />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div id="about-story" className="scroll-mt-32 xl:col-span-2">
          <Card title={t('copilot.about.story.title')} subtitle={t('copilot.about.story.subtitle')} className="h-full">
            <div className="space-y-3 text-xs text-muted leading-relaxed">
              <p>
                {t('copilot.about.story.p1a')}
                <strong className="text-ink"> {t('copilot.about.story.p1b')}</strong>
                {t('copilot.about.story.p1c')}
              </p>
              <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none">
                {FLOW.map((step, i) => (
                  <li key={step} className="flex gap-2.5 rounded-lg border border-grid bg-base/40 p-2.5">
                    <span className="num shrink-0 grid place-items-center h-6 w-6 rounded-full border border-amber/40 text-amber text-[11px] font-bold">{i + 1}</span>
                    <span>
                      <strong className="text-ink">{t(`copilot.about.flow.${step}`)}.</strong>{' '}
                      {t(`copilot.about.flow.${step}Desc`)}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <Stat value="14" label={t('copilot.about.stat.routes')} />
                <Stat value="24 + 8" label={t('copilot.about.stat.tables')} />
                <Stat value={String(liveCount)} label={t('copilot.about.stat.services')} />
                <Stat value="0" label={t('copilot.about.stat.external')} />
              </div>
            </div>
          </Card>
        </div>

        <div id="about-links" className="scroll-mt-32">
          <Card title={t('copilot.about.links.title')} subtitle={t('copilot.about.links.subtitle')} className="h-full">
            <div className="space-y-2">
              <LinkRow
                accent
                href={LINKS.live}
                title={t('copilot.about.links.liveTitle')}
                sub={t('copilot.about.links.liveSub')}
              />
              <LinkRow
                href={LINKS.pages}
                title={t('copilot.about.links.pagesTitle')}
                sub={t('copilot.about.links.pagesSub')}
              />
              <LinkRow
                href={LINKS.repo}
                title={t('copilot.about.links.repoTitle')}
                sub={t('copilot.about.links.repoSub')}
              />
              <p className="text-[11px] text-muted leading-relaxed pt-1">
                {t('copilot.about.links.note')}
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div id="about-challenge" className="scroll-mt-32">
        <Card
          title={t('copilot.about.challenge.title')}
          subtitle={t('copilot.about.challenge.subtitle')}
          actions={<Badge tone="teal">{t('copilot.about.challenge.badge')}</Badge>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {CHALLENGE.map((c) => (
              <div key={c.n} className="rounded-lg border border-grid bg-base/40 p-3">
                <div className="flex items-start gap-2.5">
                  <span className="num shrink-0 grid place-items-center h-6 w-6 rounded-full border border-amber/40 text-amber text-[11px] font-bold">{c.n}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-semibold text-ink">{t(`copilot.about.challenge.c${c.n}.name`)}</p>
                      <Badge tone="teal" className="!text-[10px]">{t('copilot.about.challenge.live')}</Badge>
                    </div>
                    <p className="text-[11px] text-muted mt-1 leading-relaxed">{t(`copilot.about.challenge.c${c.n}.desc`)}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {c.areas.map(([navKey, to]) => (
                        <Link
                          key={`${c.n}-${to}-${navKey}`}
                          to={to}
                          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 min-h-[32px] text-[11px] text-primary hover:border-primary hover:bg-primary/10 transition-colors"
                        >
                          {t(`common.nav.${navKey}`)}
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
            {t('copilot.about.challenge.note')}
          </p>
        </Card>
      </div>

      <div id="about-architecture" className="scroll-mt-32">
        <Card title={t('copilot.about.arch.title')} subtitle={t('copilot.about.arch.subtitle')}>
          <div className="space-y-1">
            <Tier label={t('copilot.about.arch.tier.browser')}>
              <Box accent>{t('copilot.about.arch.box.spa')}</Box>
            </Tier>
            <Arrow label={t('copilot.about.arch.arrow.api')} />
            <Tier label={t('copilot.about.arch.tier.api')}>
              {ARCH_BOXES.api.map((b) => (
                <Box key={b} accent={b === 'api'}>{t(`copilot.about.arch.box.${b}`)}</Box>
              ))}
            </Tier>
            <Arrow label={t('copilot.about.arch.arrow.data')} />
            <Tier label={t('copilot.about.arch.tier.data')}>
              {ARCH_BOXES.data.map((b) => <Box key={b}>{t(`copilot.about.arch.box.${b}`)}</Box>)}
            </Tier>
            <Arrow label={t('copilot.about.arch.arrow.ai')} />
            <Tier label={t('copilot.about.arch.tier.ai')}>
              {ARCH_BOXES.ai.map((b) => <Box key={b}>{t(`copilot.about.arch.box.${b}`)}</Box>)}
            </Tier>
          </div>
          <p className="text-xs text-muted mt-3 leading-relaxed">
            {t('copilot.about.arch.note')}
          </p>
        </Card>
      </div>

      <div id="about-lineage" className="scroll-mt-32">
        <Card title={t('copilot.about.lineage.title')} subtitle={t('copilot.about.lineage.subtitle')}>
          <ol className="flex flex-col md:flex-row md:items-stretch gap-1 list-none">
            {LINEAGE.map(([stage, descKey], i) => (
              <li key={stage} className="flex flex-col md:flex-row md:items-stretch md:flex-1 min-w-0 gap-1">
                <div className="flex-1 min-w-0 rounded-lg border border-grid bg-base/40 p-2.5">
                  <p className="text-[11px] font-mono font-semibold text-teal break-words">{stage}</p>
                  <p className="text-[10px] text-muted mt-1 leading-relaxed">{t(`copilot.about.lineage.${descKey}`)}</p>
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
            {lineageNote.map((part, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={i}>
                {i > 0 && <span className="font-mono">generate.py</span>}
                {part}
              </span>
            ))}
          </p>
        </Card>
      </div>

      <div id="about-ai" className="scroll-mt-32">
        <Card
          title={t('copilot.about.ai.title')}
          subtitle={t('copilot.about.ai.subtitle')}
        >
          <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[1.1fr_1.4fr_1.4fr] gap-2 px-3">
              <p className="eyebrow">{t('copilot.about.ai.colFeature')}</p>
              <p className="eyebrow">{t('copilot.about.ai.colLive')}</p>
              <p className="eyebrow">{t('copilot.about.ai.colFallback')}</p>
            </div>
            {AI_DESIGN.map((row) => (
              <div key={row} className="grid grid-cols-1 md:grid-cols-[1.1fr_1.4fr_1.4fr] gap-1.5 md:gap-2 rounded-lg border border-grid bg-base/40 p-3">
                <p className="text-xs font-semibold text-ink">{t(`copilot.about.ai.${row}.feature`)}</p>
                <p className="text-[11px] text-muted leading-relaxed">
                  <span className="md:hidden text-[9px] uppercase tracking-wider text-amber mr-1.5">{t('copilot.about.ai.tagLive')}</span>
                  {t(`copilot.about.ai.${row}.live`)}
                </p>
                <p className="text-[11px] text-muted leading-relaxed">
                  <span className="md:hidden text-[9px] uppercase tracking-wider text-teal mr-1.5">{t('copilot.about.ai.tagFallback')}</span>
                  {t(`copilot.about.ai.${row}.fallback`)}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            {t('copilot.about.ai.note')}
          </p>
        </Card>
      </div>

      <div id="about-services" className="scroll-mt-32">
        <Card
          title={t('copilot.about.services.title')}
          subtitle={t('copilot.about.services.subtitle', { live: liveCount, total: SERVICES.length, roadmap: roadmapCount })}
        >
          <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label={t('copilot.about.services.filterAria')}>
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
                  {s.stretch && <Badge tone="slate" className="ml-auto">{t('copilot.about.services.roadmapTag')}</Badge>}
                </div>
                <p className="text-[11px] text-muted mt-1 ml-7">{t(`copilot.about.services.s${s.n}`)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div id="about-ethics" className="scroll-mt-32">
          <Card title={t('copilot.about.ethics.title')} subtitle={t('copilot.about.ethics.subtitle')} className="h-full">
            <PointList
              dot="text-amber"
              items={['e1', 'e2', 'e3', 'e4'].map((k) => [
                k,
                t(`copilot.about.ethics.${k}.strong`),
                t(`copilot.about.ethics.${k}.text`),
              ])}
            />
          </Card>
        </div>

        <div id="about-access" className="scroll-mt-32">
          <Card title={t('copilot.about.access.title')} subtitle={t('copilot.about.access.subtitle')} className="h-full">
            <PointList
              items={A11Y.map((k) => [
                k,
                `${t(`copilot.about.access.${k}.t`)}.`,
                t(`copilot.about.access.${k}.d`),
              ])}
            />
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              {t('copilot.about.access.note')}
            </p>
          </Card>
        </div>
      </div>

      <div id="about-languages" className="scroll-mt-32">
        <Card title={t('copilot.about.lang.title')} subtitle={t('copilot.about.lang.subtitle')}>
          <p className="text-xs text-muted leading-relaxed mb-3">{t('copilot.about.lang.intro')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-0">
            <PointList
              items={LANGUAGES.slice(0, 3).map((k) => [
                k,
                `${t(`copilot.about.lang.${k}.t`)}.`,
                t(`copilot.about.lang.${k}.d`),
              ])}
            />
            <PointList
              items={LANGUAGES.slice(3).map((k) => [
                k,
                `${t(`copilot.about.lang.${k}.t`)}.`,
                t(`copilot.about.lang.${k}.d`),
              ])}
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div id="about-shortcuts" className="scroll-mt-32">
          <Card title={t('copilot.about.shortcuts.title')} subtitle={t('copilot.about.shortcuts.subtitle')} className="h-full">
            <div className="space-y-3">
              {SHORTCUTS.map((sec) => (
                <section key={sec.group}>
                  <p className="eyebrow mb-1">{t(`copilot.about.shortcuts.group.${sec.group}`)}</p>
                  <ul className="divide-y divide-grid/40">
                    {sec.rows.map((row) => {
                      const keys = row.keysKey ? t(`copilot.about.shortcuts.${row.keysKey}`) : row.keys;
                      return (
                        <li key={`${sec.group}-${row.d}`} className="flex items-start justify-between gap-3 py-1.5">
                          <span className="text-xs text-muted leading-relaxed">{t(`copilot.about.shortcuts.${row.d}`)}</span>
                          <span className="shrink-0 flex flex-wrap justify-end gap-1">
                            {keys.split(' · ').map((k) => (
                              <kbd key={k} className="num rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[10px] text-ink whitespace-nowrap">{k}</kbd>
                            ))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              <p className="text-[11px] text-muted leading-relaxed">
                {t('copilot.about.shortcuts.note')}
              </p>
            </div>
          </Card>
        </div>

        <div id="about-team" className="scroll-mt-32">
          <Card title={t('copilot.about.team.title')} subtitle={t('copilot.about.team.subtitle')} className="h-full">
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
                    <p className="text-xs text-ink font-semibold">{t('copilot.about.team.name')}</p>
                    <p className="text-[11px] text-muted">{t('copilot.about.team.blurb')}</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {STACK_GROUPS.map((g) => (
                  <div key={g.key}>
                    <p className="eyebrow mb-1.5">{t(`copilot.about.stack.${g.key}`)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((item) => (
                        <span key={item} className="chip !py-0.5 !text-[11px] text-muted">{item}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                {t('copilot.about.team.note')}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
