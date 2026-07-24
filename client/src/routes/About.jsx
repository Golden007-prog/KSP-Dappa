// About — architecture summary, Catalyst services grid (blueprint §6),
// data-ethics note, team placeholder.
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';

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
      <div>
        <h1 className="page-title">About DAPPA</h1>
        <p className="page-subtitle">Data Analytics &amp; Predictive Policing Assistant — KSP Datathon 2026 prototype, built entirely on Zoho Catalyst</p>
      </div>

      <Card title="Architecture" subtitle="Everything runs inside one Catalyst project (Project-Rainfall) — no external AI, hosting, database, or auth services">
        <div className="space-y-1">
          <Tier label="Browser">
            <Box accent>React 18 SPA — 11 routes · dark command-center UI · Leaflet · ECharts · Cytoscape</Box>
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

        <Card title="Team" subtitle="KSP Datathon 2026 · project “Rainfall”">
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
            <p className="text-[11px] text-muted pt-1">
              Built with the official KSP FIR ER schema (Data Store), a seeded synthetic data engine, and Catalyst-native
              analytics. Source: <span className="text-ink">ksp-dappa</span> repository.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
