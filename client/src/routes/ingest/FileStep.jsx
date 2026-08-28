// Step 2 — the file. Drop zone + picker + "use the bundled sample" (the
// twenty-second demo). Decoding is reported, not hidden: encoding, BOM,
// delimiter, ragged rows, Kannada cells.
import { useRef, useState } from 'react';
import Badge from '../../components/Badge.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt } from '../../lib/format.js';
import { decodeBuffer, parseCsv, countKannadaCells } from '../../lib/csv.js';
import { SAMPLE_URL } from './ingestApi.js';

const MAX_BYTES = 12 * 1024 * 1024;

export async function readCsvFile(file) {
  const buf = await file.arrayBuffer();
  const { text, info } = decodeBuffer(buf);
  const parsed = parseCsv(text);
  const kannada = countKannadaCells(parsed.rows);
  return { name: file.name, size: file.size || buf.byteLength, header: parsed.header, rows: parsed.rows, delimiter: parsed.delimiter, stats: parsed.stats, encoding: info, kannada };
}

export default function FileStep({ file, onFile, maxRows }) {
  const t = useT();
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handle = async (f) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) { setError(t('ingest.file.tooBig', { mb: Math.round(MAX_BYTES / 1048576) })); return; }
    setBusy(true);
    try {
      const parsed = await readCsvFile(f);
      if (!parsed.header.length) { setError(t('ingest.file.noHeader')); return; }
      if (parsed.rows.length > maxRows) { setError(t('ingest.file.tooManyRows', { n: fmtInt(parsed.rows.length), max: fmtInt(maxRows) })); return; }
      onFile(parsed);
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const useSample = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error(t('ingest.file.sampleMissing'));
      const blob = await res.blob();
      await handle(new File([blob], 'CaseMaster_sample.csv', { type: 'text/csv' }));
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label={t('ingest.file.dropAria')}
        onClick={() => inputRef.current && inputRef.current.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current && inputRef.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files && e.dataTransfer.files[0]); }}
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer min-h-[112px] flex flex-col items-center justify-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${drag ? 'border-primary bg-primary/10' : 'border-control/60 bg-panel-raised/40 hover:border-primary'}`}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="text-muted">
          <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-ink">{busy ? t('ingest.file.reading') : t('ingest.file.drop')}</p>
        <p className="text-xs text-muted">{t('ingest.file.hint', { max: fmtInt(maxRows) })}</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => handle(e.target.files && e.target.files[0])} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary min-h-[44px] sm:min-h-[36px]" onClick={useSample} disabled={busy}>{t('ingest.file.useSample')}</button>
        <span className="text-xs text-muted">{t('ingest.file.sampleHint')}</span>
      </div>
      {error && <p role="alert" className="text-sm text-signal">{error}</p>}
      {file && (
        <div className="rounded-xl border border-grid bg-panel p-3 space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-ink break-all">{file.name}</span>
            <span className="num text-xs text-muted">{fmtInt(Math.round(file.size / 1024))} KB · {t('ingest.file.rowsCols', { rows: fmtInt(file.stats.rows), cols: file.stats.columns })}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={file.encoding.fallback ? 'amber' : 'teal'}>{t('ingest.file.encoding', { enc: file.encoding.encoding.toUpperCase() })}{file.encoding.bom ? ` · ${t('ingest.file.bom')}` : ''}</Badge>
            <Badge tone="neutral">{t('ingest.file.delimiter', { d: file.delimiter === '\t' ? 'TAB' : file.delimiter })}</Badge>
            {file.kannada.count > 0 && <Badge tone="teal">{t('ingest.file.kannada', { n: fmtInt(file.kannada.count) })}</Badge>}
            {file.stats.ragged > 0 && <Badge tone="amber">{t('ingest.file.ragged', { n: file.stats.ragged })}</Badge>}
            {file.stats.short > 0 && <Badge tone="amber">{t('ingest.file.short', { n: file.stats.short })}</Badge>}
            {file.stats.unterminatedQuote && <Badge tone="red">{t('ingest.file.unterminated')}</Badge>}
          </div>
          {file.encoding.fallback && <p className="text-xs text-amber">{t('ingest.file.fallbackNote')}</p>}
          <p className="text-xs text-muted break-words">{t('ingest.file.headerLabel')}: <span className="num">{file.header.join(' · ')}</span></p>
        </div>
      )}
    </div>
  );
}
