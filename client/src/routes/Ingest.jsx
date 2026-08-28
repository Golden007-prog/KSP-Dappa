// /ingest — CSV → official ER schema (Round 2, Phase 8). Five steps that
// change shape on a phone: pick the table, drop the file, map the columns,
// check every row (a dry run: nothing is written), load the accepted rows
// and read what changed. Every decision the pipeline makes is on screen —
// encoding, mapping confidence, the privacy guard, each row's reason codes,
// the Data Store budget, memory-vs-datastore storage and the audit row.
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import Tabs from '../components/Tabs.jsx';
import Badge from '../components/Badge.jsx';
import { useT } from '../lib/i18n.jsx';
import { fmtInt } from '../lib/format.js';
import { splitRows } from '../lib/csv.js';
import { useIngestTables, validateInParts, isStaticDemo } from './ingest/ingestApi.js';
import { autoMap } from './ingest/automap.js';
import TablePicker from './ingest/TablePicker.jsx';
import FileStep from './ingest/FileStep.jsx';
import MappingStep from './ingest/MappingStep.jsx';
import PreviewTable from './ingest/PreviewTable.jsx';
import ResultPanel from './ingest/ResultPanel.jsx';
import WhatChangedCard from './ingest/WhatChangedCard.jsx';
import LoadStep from './ingest/LoadStep.jsx';
import BatchHistory from './ingest/BatchHistory.jsx';

const STEPS = ['table', 'file', 'map', 'check', 'load'];

export default function Ingest() {
  const t = useT();
  const qc = useQueryClient();
  const tablesQ = useIngestTables();
  const [step, setStep] = useState('table');
  const [table, setTable] = useState('CaseMaster');
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState({});
  const [sources, setSources] = useState({});
  const [scores, setScores] = useState({});
  const [presetId, setPresetId] = useState(null);
  const [options, setOptions] = useState({ dropSensitive: true, strictGeo: false });
  const [validation, setValidation] = useState({ busy: false, progress: null, result: null, meta: null, error: null });
  const [loaded, setLoaded] = useState(null);

  const tables = (tablesQ.data && tablesQ.data.tables) || [];
  const maxRows = (tablesQ.data && tablesQ.data.maxRows) || 5000;
  const tableDef = useMemo(() => tables.find((x) => x.name === table) || null, [tables, table]);
  const presets = tableDef ? tableDef.presets || [] : [];

  useEffect(() => { document.title = t('ingest.page.docTitle'); }, [t]);

  // (Re)run the auto-map whenever the file, the table or the preset changes.
  useEffect(() => {
    if (!file || !tableDef) return;
    const preset = presets.find((p) => p.id === presetId) || null;
    const am = autoMap(tableDef, file.header, preset);
    setMapping(am.mapping);
    setSources(am.sources);
    setScores(am.scores);
    setValidation({ busy: false, progress: null, result: null, meta: null, error: null });
    setLoaded(null);
  }, [file, tableDef, presetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickTable = (name) => { setTable(name); setPresetId(null); setStep('file'); };
  const onFile = (f) => { setFile(f); setStep('map'); };
  const onMapping = (m, s) => { setMapping(m); setSources(s); setValidation((v) => ({ ...v, result: null, meta: null, error: null })); setLoaded(null); };

  const runValidate = async () => {
    if (!file || !tableDef) return;
    setValidation({ busy: true, progress: { part: 0, parts: 1, rows: 0 }, result: null, meta: null, error: null });
    setLoaded(null);
    try {
      const parts = splitRows(file.rows);
      const columns = file.header;
      const cleanMapping = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
      const r = await validateInParts({
        table, columns, parts, mapping: cleanMapping, options, tableDef,
        onProgress: (p) => setValidation((v) => ({ ...v, progress: p })),
      });
      setValidation({ busy: false, progress: null, result: r.data, meta: r.meta, error: null });
      qc.invalidateQueries({ queryKey: ['ingest-batches'] });
    } catch (e) {
      setValidation({ busy: false, progress: null, result: null, meta: null, error: e && e.message ? e.message : String(e) });
    }
  };

  const result = validation.result;
  const canCheck = Boolean(file && tableDef && tableDef.columns.filter((c) => c.required).every((c) => mapping[c.name]));
  const stepTabs = STEPS.map((s) => ({
    value: s,
    label: `${STEPS.indexOf(s) + 1}. ${t(`ingest.step.${s}`)}`,
    badge: s === 'check' && result ? result.counts.rejected : s === 'file' && file ? file.rows.length : undefined,
  }));
  const reachable = { table: true, file: Boolean(tableDef), map: Boolean(file), check: Boolean(file), load: Boolean(result) };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink">{t('ingest.page.title')}</h1>
          <p className="text-sm text-muted mt-0.5">{t('ingest.page.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="teal">{t('ingest.page.dryRunBadge')}</Badge>
          {isStaticDemo && <Badge tone="amber">{t('ingest.page.staticBadge')}</Badge>}
        </div>
      </header>

      {tablesQ.isLoading ? (
        <LoadingSkeleton height={220} />
      ) : tablesQ.isError ? (
        <EmptyState title={t('ingest.page.tablesError')} message={tablesQ.error && tablesQ.error.message} action={<button type="button" className="btn" onClick={() => tablesQ.refetch()}>{t('common.action.retry')}</button>} />
      ) : (
        <>
          <Tabs
            tabs={stepTabs}
            value={step}
            onChange={(v) => { if (reachable[v]) setStep(v); }}
            ariaLabel={t('ingest.page.stepsAria')}
          />

          {step === 'table' && (
            <Card title={t('ingest.step.table')} subtitle={t('ingest.table.sub', { n: tables.length })}>
              <TablePicker tables={tables} value={table} onChange={pickTable} />
              <div className="mt-4 flex justify-end">
                <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => setStep('file')} disabled={!tableDef}>{t('ingest.nav.next')}</button>
              </div>
            </Card>
          )}

          {step === 'file' && tableDef && (
            <Card title={t('ingest.step.file')} subtitle={t('ingest.file.sub', { table: tableDef.name })}>
              <FileStep file={file} onFile={onFile} maxRows={maxRows} />
              <div className="mt-4 flex flex-wrap justify-between gap-2">
                <button type="button" className="btn min-h-[44px]" onClick={() => setStep('table')}>{t('ingest.nav.back')}</button>
                <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => setStep('map')} disabled={!file}>{t('ingest.nav.next')}</button>
              </div>
            </Card>
          )}

          {step === 'map' && tableDef && file && (
            <Card title={t('ingest.step.map')} subtitle={t('ingest.map.sub', { mapped: Object.values(mapping).filter(Boolean).length, total: tableDef.columns.length })}>
              <MappingStep
                tableDef={tableDef} headers={file.header} mapping={mapping} sources={sources} scores={scores}
                onChange={onMapping} presets={presets} presetId={presetId} onPreset={setPresetId}
                options={options} onOptions={setOptions}
              />
              <div className="mt-4 flex flex-wrap justify-between gap-2">
                <button type="button" className="btn min-h-[44px]" onClick={() => setStep('file')}>{t('ingest.nav.back')}</button>
                <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => setStep('check')} disabled={!canCheck}>{t('ingest.nav.toCheck')}</button>
              </div>
            </Card>
          )}

          {step === 'check' && tableDef && file && (
            <div className="space-y-4">
              <Card title={t('ingest.step.check')} subtitle={t('ingest.check.sub', { n: fmtInt(file.rows.length) })}>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn btn-primary min-h-[44px]" onClick={runValidate} disabled={validation.busy || !canCheck}>
                    {validation.busy ? t('ingest.check.running') : result ? t('ingest.check.rerun') : t('ingest.check.run')}
                  </button>
                  <span className="text-xs text-muted">{t('ingest.check.hint')}</span>
                </div>
                {validation.busy && validation.progress && (
                  <p className="mt-2 num text-xs text-muted" aria-live="polite">{t('ingest.check.progress', { part: validation.progress.part, parts: validation.progress.parts, rows: fmtInt(validation.progress.rows) })}</p>
                )}
                {validation.error && <p role="alert" className="mt-2 text-sm text-signal">{validation.error}</p>}
              </Card>
              {result && <ResultPanel result={result} meta={validation.meta} batchId={result.batchId} browserOnly={validation.meta && validation.meta.source === 'browser'} />}
              <Card title={t('ingest.preview.title')} subtitle={t('ingest.preview.sub', { n: Math.min(50, file.rows.length) })} padded={false}>
                <div className="p-2">
                  <PreviewTable tableDef={tableDef} headers={file.header} rows={file.rows} mapping={mapping} verdicts={result ? result.rows : null} />
                </div>
              </Card>
              {result && result.whatChanged && <WhatChangedCard changed={result.whatChanged} projected />}
              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" className="btn min-h-[44px]" onClick={() => setStep('map')}>{t('ingest.nav.back')}</button>
                <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => setStep('load')} disabled={!result || !result.counts.accepted}>{t('ingest.nav.toLoad', { n: fmtInt(result ? result.counts.accepted : 0) })}</button>
              </div>
            </div>
          )}

          {step === 'load' && result && (
            <div className="space-y-4">
              <LoadStep batchId={result.batchId} result={result} onLoaded={(r) => { setLoaded(r); qc.invalidateQueries({ queryKey: ['ingest-batches'] }); }} />
              {!loaded && result.whatChanged && <WhatChangedCard changed={result.whatChanged} projected />}
              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" className="btn min-h-[44px]" onClick={() => setStep('check')}>{t('ingest.nav.back')}</button>
                <button type="button" className="btn min-h-[44px]" onClick={() => { setFile(null); setStep('file'); }}>{t('ingest.nav.another')}</button>
              </div>
            </div>
          )}

          <BatchHistory />
        </>
      )}
    </div>
  );
}
