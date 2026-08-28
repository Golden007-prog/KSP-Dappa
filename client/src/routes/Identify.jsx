// /identify — face identification, Catalyst-native and accountable by design
// (Round 2, Phase 6). One still image, a bounded shortlist narrowed by the
// officer's filters, a case number and a legal basis before the button
// enables, ranked candidates that always carry their confidence, a human
// confirm / reject recorded with the officer's identity, the audit on screen,
// the synthetic gallery, the model card and the rules. Persistent banner:
// generated faces only.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../components/Card.jsx';
import Tabs from '../components/Tabs.jsx';
import Badge from '../components/Badge.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { announce } from '../lib/a11y.js';
import { useT } from '../lib/i18n.jsx';
import { useFaceCost, useFaceDecision, useFaceIdentify, useFaceRules } from '../lib/faceApi.js';
import ProbeUpload from './identify/ProbeUpload.jsx';
import FilterForm, { anyFilter } from './identify/FilterForm.jsx';
import ResultsPanel from './identify/ResultsPanel.jsx';
import AuditTable from './identify/AuditTable.jsx';
import GalleryGrid from './identify/GalleryGrid.jsx';
import ModelCardView from './identify/ModelCardView.jsx';
import RulesList from './identify/RulesList.jsx';

const TABS = ['search', 'history', 'gallery', 'modelcard', 'rules'];
const EMPTY_FILTERS = { districtId: '', moTag: '', riskBand: '', ageBand: '', gender: '', yearFrom: '', yearTo: '', limit: '25' };

export default function Identify() {
  const t = useT();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'search';
  const setTab = (v) => { const next = new URLSearchParams(params); next.set('tab', v); setParams(next, { replace: true }); };

  const [probe, setProbe] = useState(null);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, districtId: params.get('districtId') || '' }));
  const [purpose, setPurpose] = useState({ caseNo: params.get('caseNo') || '', legalBasis: '' });
  const [result, setResult] = useState(null);
  const [resultMeta, setResultMeta] = useState(null);
  const [decisions, setDecisions] = useState([]);

  const rules = useFaceRules();
  const cost = useFaceCost(Number(filters.limit) || 25);
  const identify = useFaceIdentify();
  const decide = useFaceDecision();

  const ready = Boolean(probe && purpose.caseNo.trim().length >= 4 && purpose.legalBasis && anyFilter(filters));
  const floor = Number(rules.data && rules.data.floor) || 0.7;

  const body = useMemo(() => {
    if (!probe) return null;
    const f = {};
    for (const k of ['districtId', 'moTag', 'riskBand', 'ageBand', 'gender']) if (filters[k]) f[k] = filters[k];
    if (filters.yearFrom) f.yearFrom = Number(filters.yearFrom);
    if (filters.yearTo) f.yearTo = Number(filters.yearTo);
    return {
      image: probe.dataUrl,
      // Provenance, not a shortcut: the sample capture is scored from its
      // pixels like any upload (no probeSeed — D-phase6-16). The key names the
      // built-in stand-in in the audit and keys the static-demo snapshot.
      samplePerson: probe.samplePerson || undefined,
      filters: f,
      limit: Math.max(1, Math.min(25, Number(filters.limit) || 25)),
      caseNo: purpose.caseNo.trim(),
      legalBasis: purpose.legalBasis,
    };
  }, [probe, filters, purpose]);

  const run = async () => {
    if (!ready || !body) return;
    try {
      const r = await identify.mutateAsync(body);
      setResult(r.data);
      setResultMeta(r.meta);
      setDecisions([]);
      const d = r.data || {};
      announce(d.decision === 'candidates'
        ? t('identify.result.candidates', { n: (d.candidates || []).length, pct: d.candidates && d.candidates[0] ? Math.round(d.candidates[0].confidence * 100) : 0 })
        : t(d.decision === 'no-reliable-match' ? 'identify.result.noReliable' : 'identify.result.rejected'));
    } catch (e) {
      toast.error(e.message || t('identify.result.error'));
    }
  };

  const onDecide = async (payload) => {
    try {
      const r = await decide.mutateAsync(payload);
      setDecisions((prev) => prev.concat([r.data.decision]));
      toast.success(t('identify.decision.saved'));
    } catch (e) {
      toast.error(e.message || t('identify.decision.failed'));
    }
  };

  useEffect(() => { document.title = `${t('identify.title')} · DAPPA`; }, [t]);

  const tabs = [
    { value: 'search', label: t('identify.tabs.search') },
    { value: 'history', label: t('identify.tabs.history') },
    { value: 'gallery', label: t('identify.tabs.gallery') },
    { value: 'modelcard', label: t('identify.tabs.modelCard') },
    { value: 'rules', label: t('identify.tabs.rules') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t('identify.title')}</h1>
          <p className="page-subtitle">{t('identify.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={rules.data && rules.data.engines.on ? 'teal' : 'slate'}>
            {rules.data && rules.data.engines.on ? t('identify.engine.zia') : t('identify.engine.local')}
          </Badge>
          <Badge tone="slate" className="num">{t('identify.result.floor', { floor: Math.round(floor * 100) })}</Badge>
        </div>
      </div>

      <div role="note" className="flex items-start gap-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 mt-0.5">
          <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        <span>{t('identify.banner.synthetic')}</span>
      </div>

      {/* Five tabs overflow a 360 px tablist at the default padding and
          `no-scrollbar` hides the only clue, so the Rules tab was unreachable
          without a swipe. Tighter padding below `sm` fits all five. */}
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel={t('identify.tabs.aria')} className="[&>button]:px-2 sm:[&>button]:px-3.5" />

      {tab === 'search' && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
          <div className="space-y-4">
            <Card title={t('identify.upload.title')} subtitle={t('identify.upload.subtitle')}>
              <ProbeUpload probe={probe} onProbe={(p) => { setProbe(p); setResult(null); }} gate={result && result.gate} disabled={identify.isPending} />
            </Card>
            <Card>
              <FilterForm filters={filters} onFilters={setFilters} purpose={purpose} onPurpose={setPurpose} legalBases={(rules.data && rules.data.legalBases) || []} disabled={identify.isPending} />
              <div className="mt-4 space-y-2">
                <button type="button" className="btn-primary w-full min-h-[48px] justify-center text-base" disabled={!ready || identify.isPending} onClick={run} aria-disabled={!ready}>
                  {identify.isPending ? t('identify.run.running') : t('identify.run.button')}
                </button>
                {!ready && <p className="text-[11px] text-muted text-center">{t('identify.run.disabledHint')}</p>}
                <p className="text-[11px] text-muted text-center num">
                  {cost.data && cost.data.ziaCalls > 0
                    ? t('identify.run.cost', { n: cost.data.ziaCalls, local: cost.data.localCompares })
                    : t('identify.run.costNone')}
                </p>
              </div>
            </Card>
          </div>
          <ResultsPanel
            result={result}
            meta={resultMeta}
            loading={identify.isPending}
            error={identify.error}
            floorFallback={floor}
            decisions={decisions}
            onDecide={onDecide}
            deciding={decide.isPending}
            onRetry={run}
          />
        </div>
      )}
      {tab === 'history' && <AuditTable />}
      {tab === 'gallery' && <GalleryGrid />}
      {tab === 'modelcard' && <ModelCardView />}
      {tab === 'rules' && <RulesList />}
    </div>
  );
}
