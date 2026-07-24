// About — project story, quick links (live demo / static demo / source),
// architecture diagram (pure CSS/SVG), Catalyst services matrix (blueprint §6),
// synthetic-data + ethics statement, tech stack and team credits.
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';

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

const STACK = [
  'React 18', 'Vite 5', 'Tailwind CSS', 'React Router 6', 'TanStack Query 5', 'Zustand',
  'ECharts', 'Leaflet + heat', 'Cytoscape (fcose)', 'Node 20 + Express', 'Python (pandas · scikit-learn · networkx · statsmodels)',
];

const FLOW = [
  ['Generate', 'A seeded synthetic engine writes 24 ER-schema tables of Kannada-region FIRs — deterministic, reproducible, fictional.'],
  ['Precompute', 'The nightly Python pipeline distills them into 8 analytics tables: aggregates, DBSCAN hotspots, forecasts, anomaly z-scores, identity-resolved co-offender graph.'],
  ['Serve', 'dappa_api answers every screen from indexed reads + Cache; live AI calls (QuickML, Zia, the copilot) are flagged and degrade to deterministic fallbacks.'],
  ['Decide', 'An officer sees maps, trends, alerts, forecasts and briefs — with provenance badges on every AI-touched number, and stays in the loop.'],
];

function Stat({ value, label }) {
  return (
    <div className="rounded-lg border border-grid bg-base/40 px-3 py-2.5 text-center">
      <div className="num text-lg font-semibold text-ink">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted mt-0.5">{label}</div>
    </div>
  );
}

function ExtLink({ href, title, sub, accent = false }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors group ${
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

export default function About() {
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

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="The story" subtitle="From 30 lakh scattered FIR rows to one decision surface" className="xl:col-span-2">
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
              <Stat value="16" label="Catalyst services live" />
              <Stat value="0" label="external services" />
            </div>
          </div>
        </Card>

        <Card title="See it running" subtitle="Live deployment, static mirror, source">
          <div className="space-y-2">
            <ExtLink
              accent
              href={LINKS.live}
              title="Live demo — Zoho Catalyst"
              sub="project-rainfall · full API, flags & fallbacks"
            />
            <ExtLink
              href={LINKS.pages}
              title="Static demo — GitHub Pages"
              sub="no backend needed · snapshotted fixture API"
            />
            <ExtLink
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

      <Card title="Catalyst services used" subtitle="Core services 1–16 power the prototype; 17–18 are documented roadmap items">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {SERVICES.map((s) => (
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Data ethics" subtitle="Synthetic by design, fair by constraint">
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

        <Card title="Team & credits" subtitle="KSP Datathon 2026 · project “Rainfall”">
          <div className="space-y-3">
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-dashed border-grid p-3">
                  <div className="w-9 h-9 rounded-full bg-grid/60 flex items-center justify-center text-muted text-xs">?</div>
                  <div>
                    <p className="text-xs text-ink">Team member {i} — add name before the demo</p>
                    <p className="text-[11px] text-muted">role / affiliation</p>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <p className="eyebrow mb-1.5">Built with</p>
              <div className="flex flex-wrap gap-1.5">
                {STACK.map((t) => (
                  <span key={t} className="chip !py-0.5 !text-[11px] text-muted">{t}</span>
                ))}
              </div>
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
  );
}
