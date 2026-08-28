// About — the page a judge reads to decide whether the rest of the app is real.
//
// Half of it is written copy (story, links, architecture, lineage, AI
// degradation design, ethics, accessibility, languages, shortcuts, team). The
// other half is runtime introspection: four live endpoints are called on load
// and rendered as-is, so no claim on this page can outlive the deployment that
// backs it.
//
//   GET /meta/services  → the 28-service Catalyst coverage matrix, grouped by
//                         status. flag-gated is NOT presented as live: it means
//                         the code path is wired and exercised but the service
//                         needs a console step or an env var first.
//   GET /ml/models      → the model registry and the resolution chain behind
//                         each ML endpoint.
//   GET /search/cases   → a working search box over the real CaseMaster store,
//                         showing which backend answered (meta.source).
//   GET /healthz        → per-table completeness, including the tables that are
//                         short and why the KPIs that depend on them read "—".
//   GET /meta/challenge → the six scored capability areas with the endpoints
//                         and services behind each, layered onto the existing
//                         translated coverage matrix.
//
// The honesty ledger at the end is derived from those same payloads, so it
// cannot drift: flip a flag on and its line disappears by itself.
//
// Every user-visible string of the written half lives in the `copilot`
// namespace under `about.*`; everything added for the introspection panels
// lives in the `about` namespace. Product names (Catalyst services,
// libraries), file paths, table names, endpoint paths, env vars and key glyphs
// stay verbatim in both languages — translating them would make the page
// unusable to a judge checking the submission against Catalyst. Text that the
// API itself returns (service reasons, model names, capability highlights) is
// English wherever it appears, and the page says so.
import { useCallback, useEffect, useState } from 'react';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useT } from '../lib/i18n.jsx';
import { copyText } from './copilot/clipboard.js';
import {
  useServiceMatrix, useModelRegistry, useProvenance, useChallengeCoverage, useCaseSearch,
} from './about/useAboutIntrospection.js';
import EvidenceStrip from './about/EvidenceStrip.jsx';
import ServiceMatrix from './about/ServiceMatrix.jsx';
import ModelRegistry from './about/ModelRegistry.jsx';
import CaseSearchDemo from './about/CaseSearchDemo.jsx';
import ProvenancePanel from './about/ProvenancePanel.jsx';
import ChallengeCoverage from './about/ChallengeCoverage.jsx';
import HonestyLedger from './about/HonestyLedger.jsx';
import NightlyRunCard from './about/NightlyRunCard.jsx';

const LINKS = {
  live: 'https://project-rainfall-60079891305.development.catalystserverless.in/app/index.html',
  pages: 'https://golden007-prog.github.io/KSP-Dappa/',
  repo: 'https://github.com/Golden007-prog/KSP-Dappa',
};

// The Catalyst service matrix used to be a hand-maintained list here. It now
// comes from GET /meta/services (routes/about/ServiceMatrix.jsx) — a static
// list would eventually contradict the deployment, and one inflated claim on
// this page discounts every other one. The old `copilot.about.services.*`
// strings stay in the locale files; nothing else references them.

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

// The four evidence sections sit directly after the coverage matrix: a judge
// scrolling top-to-bottom hits the live proof before the written narrative.
const SECTIONS = [
  'story', 'links', 'challenge', 'services', 'models', 'search', 'provenance',
  'honesty', 'architecture', 'lineage', 'ai', 'ethics', 'access', 'languages',
  'shortcuts', 'team',
];

// Sections added with the introspection panels label themselves from the new
// `about` namespace; the pre-existing ones keep their `copilot.about.sec.*`
// keys so no translated string is orphaned.
const NEW_SECTIONS = new Set(['models', 'search', 'provenance', 'honesty']);

// 20 rows is the /search/cases default. It is also the limit the "68 matches
// for theft" figure was measured at — the search path fetches at most limit×2
// rows per column, so raising it raises `matched` too. Keeping the demo on the
// default means the number on screen is the number a judge gets from curl.
const SEARCH_LIMIT = 20;

const sectionKey = (id) => (NEW_SECTIONS.has(id) ? `about.sec.${id}` : `copilot.about.sec.${id}`);

/** Scroll a section into view, honouring prefers-reduced-motion. */
function scrollToSection(id) {
  const el = document.getElementById(`about-${id}`);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

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
    scrollToSection(id);
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
              {t(sectionKey(id))}
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
  const toast = useToast();

  // Runtime introspection — five read-only endpoints, all retry:0 so an
  // unreachable backend renders an honest panel instead of a hanging spinner.
  const servicesQ = useServiceMatrix();
  const modelsQ = useModelRegistry();
  const healthQ = useProvenance();
  const challengeQ = useChallengeCoverage();

  // The search demo runs only on an explicit submit; 'theft' is pre-armed so
  // the panel has something real on screen the moment the section is reached.
  const [search, setSearch] = useState({ term: 'theft', scope: 'all' });
  const searchQ = useCaseSearch({ q: search.term, scope: search.scope, limit: SEARCH_LIMIT });

  const runSearch = useCallback((term, scope) => {
    setSearch({ term: String(term || '').trim(), scope: scope || 'all' });
  }, []);

  const refreshAll = useCallback(() => {
    servicesQ.refetch();
    modelsQ.refetch();
    healthQ.refetch();
    challengeQ.refetch();
    if (search.term) searchQ.refetch();
    toast.info(t('about.live.refreshing'));
  }, [servicesQ, modelsQ, healthQ, challengeQ, searchQ, search.term, toast, t]);

  const anyIntrospectionFailed = Boolean(servicesQ.error || modelsQ.error || healthQ.error);
  const liveServices = servicesQ.data;

  // Keep `generate.py` in a mono span wherever the translation places it.
  const lineageNote = t('copilot.about.lineage.note').split('generate.py');

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="page-title">{t('copilot.about.page.title')}</h1>
          <p className="page-subtitle">{t('copilot.about.page.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          <Badge tone="amber">{t('copilot.about.badge.prototype')}</Badge>
          <Badge tone="teal">{t('copilot.about.badge.synthetic')}</Badge>
          <Badge tone={anyIntrospectionFailed ? 'slate' : 'teal'} pulse={!anyIntrospectionFailed}>
            {t(anyIntrospectionFailed ? 'about.live.offline' : 'about.live.online')}
          </Badge>
        </div>
      </div>

      <AnchorNav />

      <Card
        title={t('about.live.title')}
        subtitle={t('about.live.subtitle')}
        actions={(
          <button
            type="button"
            onClick={refreshAll}
            className="inline-flex items-center gap-1.5 min-h-[36px] rounded-lg border border-grid bg-base/50 px-2.5 text-[11px] text-muted hover:text-ink hover:border-primary/60 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
            </svg>
            {t('about.live.refresh')}
          </button>
        )}
      >
        <EvidenceStrip
          services={liveServices}
          models={modelsQ.data}
          health={healthQ.data}
          onJump={scrollToSection}
        />
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
          {anyIntrospectionFailed ? t('about.live.offlineNote') : t('about.live.note')}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{t('about.live.englishNote')}</p>
      </Card>

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
                <Stat
                  value={liveServices ? `${liveServices.byStatus.live} / ${liveServices.total}` : '—'}
                  label={t('copilot.about.stat.services')}
                />
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
        <ChallengeCoverage items={CHALLENGE} query={challengeQ} />
      </div>

      <div id="about-services" className="scroll-mt-32">
        <ServiceMatrix query={servicesQ} searchSource={searchQ.data ? searchQ.data.source : ''} />
      </div>

      <div id="about-models" className="scroll-mt-32">
        <ModelRegistry query={modelsQ} />
      </div>

      <div id="about-search" className="scroll-mt-32">
        <CaseSearchDemo
          term={search.term}
          scope={search.scope}
          limit={SEARCH_LIMIT}
          onSearch={runSearch}
          query={searchQ}
        />
      </div>

      <div id="about-provenance" className="scroll-mt-32">
        <ProvenancePanel query={healthQ} />
      </div>

      <div id="about-honesty" className="scroll-mt-32">
        <HonestyLedger
          services={servicesQ.data}
          models={modelsQ.data}
          health={healthQ.data}
          search={searchQ.data}
        />
      </div>

      <NightlyRunCard />

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
