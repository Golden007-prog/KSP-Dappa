// /ocr — Zia OCR client surface (Round 2, phase 8, backlog row 158).
//
// Pick one of three synthetic FIR-style scans (or upload your own, or paste
// text) → the image passes the Zia Image Moderation intake guard
// (POST /zia/moderate) → POST /zia/ocr returns the recovered text, its
// confidence and the same entities / keywords / MO tags every narrative
// gets → "Attach to case" writes one ActionLog audit row. Every engine that
// answered is named; with the Zia flags off the sample's ground-truth text is
// analysed and labelled as such so the panel never goes blank.
import { useCallback, useMemo, useRef, useState } from 'react';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useT } from '../lib/i18n.jsx';
import { useOcrSamples, useModerate, useOcrScan, fileToBase64, sampleToBase64 } from './ocr/useOcr.js';
import OcrResult from './ocr/OcrResult.jsx';
import AttachCard from './ocr/AttachCard.jsx';

const MAX_UPLOAD = 900 * 1024;
const LANGS = ['eng', 'kan', 'auto'];

export default function Ocr() {
  const t = useT();
  const samples = useOcrSamples();
  const moderate = useModerate();
  const scan = useOcrScan();
  const fileRef = useRef(null);
  const [picked, setPicked] = useState(null);      // { sampleId, url, name }
  const [language, setLanguage] = useState('eng');
  const [pasted, setPasted] = useState('');
  const [stage, setStage] = useState('idle');      // idle | guarding | scanning
  const [blocked, setBlocked] = useState(null);
  const [fromTruth, setFromTruth] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const base = `${import.meta.env.BASE_URL}${(samples.data && samples.data.baseUrl) || 'samples/ocr/'}`;

  const runScan = useCallback(async (imageBase64, sample) => {
    setBlocked(null);
    setFromTruth(false);
    scan.reset();
    try {
      setStage('guarding');
      const guard = await moderate.mutateAsync(imageBase64);
      const verdict = guard && guard.data && guard.data.verdict;
      if (verdict === 'block') { setBlocked(guard.data); setStage('idle'); return; }
      setStage('scanning');
      const body = { imageBase64 };
      if (language !== 'auto') body.language = language;
      // With OCR off the API analyses whatever text it is given — hand it the
      // sample's ground truth so the panel shows an honest, labelled result.
      if (sample && sample.truthText) body.text = sample.truthText;
      const out = await scan.mutateAsync(body);
      setFromTruth(Boolean(sample && out && out.data && out.data.ocrAvailable === false));
    } catch {
      // the mutation object carries the error for the result card
    } finally {
      setStage('idle');
    }
  }, [language, moderate, scan]);

  const pickSample = useCallback(async (s) => {
    const url = `${base}${s.file}`;
    setPicked({ sampleId: s.sampleId, url, name: s.title, sample: s });
    setUploadError('');
    try {
      const b64 = await sampleToBase64(url);
      await runScan(b64, s);
    } catch (e) {
      setUploadError(e.message);
    }
  }, [base, runScan]);

  const onFile = useCallback(async (file) => {
    if (!file) return;
    setUploadError('');
    if (file.size > MAX_UPLOAD) { setUploadError(t('surfaces.ocr.uploadHint')); return; }
    const url = URL.createObjectURL(file);
    setPicked({ sampleId: null, url, name: file.name, sample: null });
    const b64 = await fileToBase64(file);
    await runScan(b64, null);
  }, [runScan, t]);

  const analyseText = useCallback(async () => {
    if (!pasted.trim()) return;
    setPicked(null);
    setBlocked(null);
    setFromTruth(false);
    setStage('scanning');
    try { await scan.mutateAsync({ text: pasted.trim() }); } catch { /* card shows it */ } finally { setStage('idle'); }
  }, [pasted, scan]);

  const result = scan.data ? scan.data.data : null;
  const meta = scan.data ? scan.data.meta : null;
  const moderation = moderate.data ? moderate.data.data : null;
  const busy = stage !== 'idle';
  const stageLabel = stage === 'guarding' ? t('surfaces.ocr.guarding') : stage === 'scanning' ? t('surfaces.ocr.scanning') : null;

  const sampleList = useMemo(() => (samples.data ? samples.data.samples : []), [samples.data]);

  return (
    <div className="space-y-4 max-w-[1300px] mx-auto">
      <div>
        <h1 className="page-title">{t('surfaces.ocr.title')}</h1>
        <p className="page-subtitle">{t('surfaces.ocr.subtitle')}</p>
        <p className="mt-1 text-sm text-ink">{t('surfaces.ocr.plain')}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="space-y-4">
          <Card title={t('surfaces.ocr.samples')} subtitle={t('surfaces.ocr.samplesSub')}>
            {samples.isLoading && <LoadingSkeleton height={120} />}
            {samples.error && <EmptyState compact title={t('surfaces.ocr.error')} message={samples.error.message} action={<button type="button" className="btn" onClick={() => samples.refetch()}>{t('surfaces.state.retry')}</button>} />}
            {sampleList.length > 0 && (
              <ul className="grid grid-cols-3 gap-2">
                {sampleList.map((s) => (
                  <li key={s.sampleId}>
                    <button
                      type="button"
                      onClick={() => pickSample(s)}
                      disabled={busy}
                      aria-pressed={picked && picked.sampleId === s.sampleId}
                      className={`w-full min-h-[44px] rounded-lg border p-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${picked && picked.sampleId === s.sampleId ? 'border-amber/70 bg-amber/10' : 'border-grid hover:border-primary/60'}`}
                    >
                      <img src={`${base}${s.file}`} alt={s.title} loading="lazy" className="w-full aspect-[3/4] object-cover rounded bg-base" />
                      <span className="mt-1 block text-[11px] leading-tight text-ink">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('surfaces.ocr.upload')} subtitle={t('surfaces.ocr.uploadHint')}>
            <div
              className="rounded-lg border border-dashed border-grid p-4 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
            >
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(e) => onFile(e.target.files && e.target.files[0])} />
              <button type="button" className="btn min-h-[44px]" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>{t('surfaces.ocr.chooseFile')}</button>
              <p className="mt-1 text-[11px] text-muted">{t('surfaces.ocr.dropHere')}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{t('surfaces.ocr.language')}</span>
              <div role="radiogroup" aria-label={t('surfaces.ocr.language')} className="flex gap-1">
                {LANGS.map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={language === l} onClick={() => setLanguage(l)} className={`chip min-h-[36px] ${language === l ? '!border-amber/60 !text-amber' : ''}`}>
                    {t(`surfaces.ocr.lang.${l}`)}
                  </button>
                ))}
              </div>
            </div>
            {uploadError && <p className="mt-2 text-xs text-signal" role="alert">{uploadError}</p>}
            <label className="mt-3 block text-xs text-muted">
              {t('surfaces.ocr.textOnly')}
              <textarea className="input-dark mt-1 w-full" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value.slice(0, 4000))} placeholder={t('surfaces.ocr.textPlaceholder')} />
            </label>
            <button type="button" className="btn mt-2 min-h-[44px]" onClick={analyseText} disabled={busy || !pasted.trim()}>{t('surfaces.ocr.analyse')}</button>
          </Card>
        </div>

        <div className="xl:col-span-2 space-y-4">
          {picked && (
            <Card title={t('surfaces.ocr.preview')} subtitle={picked.name} actions={stageLabel ? <Badge tone="amber" pulse>{stageLabel}</Badge> : null}>
              <img src={picked.url} alt={picked.name} className="max-h-80 w-auto max-w-full rounded border border-grid bg-base mx-auto" />
            </Card>
          )}
          {blocked ? (
            <Card title={t('surfaces.ocr.result')}>
              <EmptyState compact title={t('surfaces.ocr.blocked')} message={t('surfaces.ocr.moderation.sentence')} />
            </Card>
          ) : (
            <OcrResult result={result} meta={meta} moderation={moderation} fromTruth={fromTruth} isLoading={busy} error={scan.error} onRetry={picked && picked.sample ? () => pickSample(picked.sample) : null} />
          )}
          <p className="text-[11px] text-muted">{t('surfaces.ocr.moderation.sentence')}</p>
          <AttachCard result={result} meta={meta} moderation={moderation} sampleId={picked && picked.sampleId} language={language === 'auto' ? undefined : language} />
        </div>
      </div>
    </div>
  );
}
