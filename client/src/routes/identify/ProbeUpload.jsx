// Still-image probe: file picker, camera capture on a phone, or a sample
// capture drawn from the synthetic gallery. The preview draws the quality
// gate's detected-face box (Zia Face Analytics co-ordinates) when there is one.
import { useRef, useState } from 'react';
import { API_BASE } from '../../lib/api.js';
import { useT } from '../../lib/i18n.jsx';
import { fileToProbe, svgToProbe } from './imageUtil.js';

const SAMPLE_KEYS = ['P001', 'P002', 'P003', 'P004', 'P005'];

export default function ProbeUpload({ probe, onProbe, gate, disabled = false }) {
  const t = useT();
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sampleIdx, setSampleIdx] = useState(0);

  const take = async (file) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const p = await fileToProbe(file);
      onProbe({ ...p, samplePerson: null });
    } catch (e) {
      const m = String((e && e.message) || e);
      setError(m === 'still-images-only' ? t('identify.upload.errorVideo') : m === 'not-an-image' ? t('identify.upload.errorNotImage') : t('identify.upload.errorDecode'));
    } finally {
      setBusy(false);
    }
  };

  const sample = async () => {
    setError(null);
    setBusy(true);
    try {
      const key = SAMPLE_KEYS[sampleIdx % SAMPLE_KEYS.length];
      const res = await fetch(`${API_BASE}/identify/thumb/${encodeURIComponent(key)}.svg?size=256`);
      if (!res.ok) throw new Error('sample');
      const svg = await res.text();
      const p = await svgToProbe(svg, 256, sampleIdx + 1);
      // Pixels only — deliberately NO probeSeed. The seed path short-circuits
      // faces.js probeDescriptor() and compares the generator's parameters
      // with themselves, which returns 1.0 by construction; the sample capture
      // is genuinely re-drawn (turn, zoom, shift, re-light) so the pixel path
      // measures it the same way it measures a real upload (D-phase6-16).
      // samplePerson is provenance for the caption and the audit, not a key.
      onProbe({ ...p, samplePerson: key });
      setSampleIdx((i) => i + 1);
    } catch {
      setError(t('identify.upload.errorDecode'));
    } finally {
      setBusy(false);
    }
  };

  const box = gate && Array.isArray(gate.box) && gate.width && gate.height ? {
    left: `${(Math.min(gate.box[0], gate.box[2]) / gate.width) * 100}%`,
    top: `${(Math.min(gate.box[1], gate.box[3]) / gate.height) * 100}%`,
    width: `${(Math.abs(gate.box[2] - gate.box[0]) / gate.width) * 100}%`,
    height: `${(Math.abs(gate.box[3] - gate.box[1]) / gate.height) * 100}%`,
  } : null;

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-[280px] aspect-square rounded-xl border border-grid bg-canvas/60 overflow-hidden">
        {probe ? (
          <>
            <img src={probe.dataUrl} alt={t('identify.upload.preview')} className="h-full w-full object-contain" />
            {box && (
              <div
                role="img"
                aria-label={t('identify.upload.boxAria')}
                className="absolute border-2 border-amber rounded-sm pointer-events-none"
                style={box}
              />
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-muted mb-2">
              <circle cx="12" cy="9" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /><rect x="3" y="3" width="18" height="18" rx="3" />
            </svg>
            <p className="text-sm text-ink">{t('identify.upload.none')}</p>
            <p className="text-[11px] text-muted mt-1">{t('identify.upload.noneHint')}</p>
          </div>
        )}
      </div>
      {probe && (
        <p className="text-[11px] text-muted text-center num">
          {t('identify.upload.info', { w: probe.width, h: probe.height, kb: Math.max(1, Math.round(probe.bytes / 1024)) })}
          {probe.samplePerson ? ` · ${t('identify.upload.sampleOf', { key: probe.samplePerson })}` : ''}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button type="button" className="btn min-h-[44px] justify-center" disabled={disabled || busy} onClick={() => fileRef.current && fileRef.current.click()}>
          {t('identify.upload.choose')}
        </button>
        <button type="button" className="btn min-h-[44px] justify-center" disabled={disabled || busy} onClick={() => camRef.current && camRef.current.click()}>
          {t('identify.upload.camera')}
        </button>
        <button type="button" className="btn min-h-[44px] justify-center" disabled={disabled || busy} onClick={sample} title={t('identify.upload.sampleHint')}>
          {busy ? t('common.state.loading') : t('identify.upload.sample')}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t('identify.upload.choose')} onChange={(e) => take(e.target.files && e.target.files[0])} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" aria-label={t('identify.upload.camera')} onChange={(e) => take(e.target.files && e.target.files[0])} />
      <p className="text-[11px] text-muted">{t('identify.upload.stillOnly')}</p>
      {error && <p role="alert" className="text-xs text-signal">{error}</p>}
      {probe && (
        <button type="button" className="btn-ghost min-h-[44px] text-xs" disabled={disabled} onClick={() => onProbe(null)}>{t('identify.upload.clear')}</button>
      )}
    </div>
  );
}
