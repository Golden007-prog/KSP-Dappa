// Recovered text + confidence + entities/keywords/MO tags from POST /zia/ocr,
// with the moderation verdict from the intake guard. Plain sentence first,
// the statistic behind it; meta.source names the engine that answered.
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useT } from '../../lib/i18n.jsx';

const str = (v) => (v === undefined || v === null ? '' : String(v));

function engineKey(source, ocrAvailable, fromTruth) {
  if (fromTruth) return 'surfaces.ocr.engine.fixture';
  if (source === 'zia-ocr' || ocrAvailable) return 'surfaces.ocr.engine.zia';
  return 'surfaces.ocr.engine.local';
}

const VERDICT_STATUS = { allow: 'stable', review: 'watch', block: 'rising', unscreened: 'nodata' };

export function ModerationLine({ moderation }) {
  const t = useT();
  if (!moderation) return null;
  const verdict = str(moderation.verdict) || 'unscreened';
  const hits = Array.isArray(moderation.hits) ? moderation.hits : [];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted" aria-label={t('surfaces.ocr.moderation')}>
      <span className="eyebrow">{t('surfaces.ocr.moderation')}</span>
      <StatusPill status={VERDICT_STATUS[verdict] || 'nodata'} label={t(`surfaces.ocr.moderation.${verdict}`)} />
      {hits.map((h) => (
        <Badge key={h.category} tone={verdict === 'block' ? 'red' : 'amber'}>
          {h.category} {Math.round(Number(h.probability) * 100)}/100
        </Badge>
      ))}
      <span className="font-mono text-[10px]">{str(moderation.source)}</span>
    </div>
  );
}

export default function OcrResult({ result, meta, moderation, fromTruth, isLoading, error, onRetry }) {
  const t = useT();
  if (isLoading) return <Card title={t('surfaces.ocr.result')}><LoadingSkeleton height={220} /></Card>;
  if (error) {
    return (
      <Card title={t('surfaces.ocr.result')}>
        <EmptyState compact title={t('surfaces.ocr.error')} message={error.message} action={onRetry ? <button type="button" className="btn" onClick={onRetry}>{t('surfaces.state.retry')}</button> : null} />
      </Card>
    );
  }
  if (!result) {
    return (
      <Card title={t('surfaces.ocr.result')} subtitle={t('surfaces.ocr.resultSub')}>
        <EmptyState compact title={t('surfaces.ocr.empty')} />
      </Card>
    );
  }
  const text = str(result.text);
  const conf = Number(result.confidence);
  const pct = Number.isFinite(conf) ? Math.round(conf <= 1 ? conf * 100 : conf) : null;
  const entities = Array.isArray(result.entities) ? result.entities : [];
  const keywords = Array.isArray(result.keywords) ? result.keywords : [];
  const moTags = Array.isArray(result.moTags) ? result.moTags : [];
  const source = str(meta && meta.source);
  return (
    <Card
      title={t('surfaces.ocr.result')}
      subtitle={t('surfaces.ocr.resultSub')}
      actions={<Badge tone={source === 'zia-ocr' ? 'teal' : 'slate'}>{t(engineKey(source, result.ocrAvailable, fromTruth))}</Badge>}
    >
      <div className="space-y-3">
        {fromTruth && <p className="text-[11px] text-muted">{t('surfaces.ocr.truthNote')}</p>}
        <ModerationLine moderation={moderation} />
        <div>
          <p className="text-sm text-ink">
            {pct === null ? t('surfaces.ocr.noConfidence') : t('surfaces.ocr.confidenceSentence', { pct })}
          </p>
          {pct !== null && (
            <div className="mt-1 h-2 w-full max-w-xs rounded-full bg-grid/60" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('surfaces.ocr.confidence')}>
              <div className="h-2 rounded-full bg-teal" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-grid bg-canvas/40 p-3 text-xs leading-relaxed text-ink font-mono" aria-label={t('surfaces.ocr.result')}>
          {text || '—'}
        </pre>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <p className="eyebrow mb-1">{t('surfaces.ocr.entities')}</p>
            {entities.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {entities.slice(0, 20).map((e, i) => (
                  <li key={`${e.text}-${i}`}><Badge tone="amber">{str(e.text)}{e.type ? <span className="ml-1 font-mono text-[9px] opacity-70">{str(e.type)}</span> : null}</Badge></li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted">{t('surfaces.ocr.nothingFound')}</p>}
          </div>
          <div>
            <p className="eyebrow mb-1">{t('surfaces.ocr.keywords')}</p>
            <ul className="flex flex-wrap gap-1.5">
              {keywords.slice(0, 12).map((k) => <li key={str(k)}><span className="chip">{str(k)}</span></li>)}
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-1">{t('surfaces.ocr.moTags')}</p>
            <ul className="flex flex-wrap gap-1.5">
              {moTags.map((m) => <li key={str(m)}><Badge tone="teal"><span className="font-mono">{str(m)}</span></Badge></li>)}
            </ul>
          </div>
        </div>
        <p className="text-[10px] text-muted">{t('surfaces.source.label')}: <span className="font-mono">{source || '—'}</span></p>
      </div>
    </Card>
  );
}
