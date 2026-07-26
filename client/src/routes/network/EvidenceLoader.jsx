// FIR evidence-sample control — the honest gate in front of every victim and
// location panel in this route.
//
// Victims and registering police units live on the FIR, and the API serves FIRs
// one at a time. Rather than pretend a full join exists, the analyst picks a
// sample size, presses Load, and every number downstream is stamped with the
// coverage this card reports.
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { SAMPLE_SIZES } from './entityData.js';

export default function EvidenceLoader({
  sampleSize, onSampleSize, enabled, onLoad, onClear,
  requested = 0, loaded = 0, failed = 0, isFetching = false, progress = 0,
  totalCases = 0, victimCount = 0, locationCount = 0,
}) {
  const t = useT();
  const coverage = totalCases ? loaded / totalCases : 0;
  const pct = Math.round(Math.min(1, progress) * 100);

  return (
    <Card
      title={t('network.sample.title')}
      subtitle={t('network.sample.subtitle')}
      actions={(
        <SegmentedControl
          ariaLabel={t('network.sample.sizeAria')}
          value={String(sampleSize)}
          onChange={(v) => onSampleSize(Number(v))}
          options={SAMPLE_SIZES.map((n) => ({ value: String(n), label: fmtInt(n) }))}
        />
      )}
    >
      <div className="space-y-3">
        <p className="text-[11px] text-muted leading-5">
          {t('network.sample.explain', { total: fmtInt(totalCases) })}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {!enabled ? (
            <button
              type="button"
              className="btn btn-primary !py-2 !px-3 text-xs min-h-[40px]"
              onClick={onLoad}
              disabled={!totalCases}
            >
              {t('network.sample.load', { n: fmtInt(Math.min(sampleSize, totalCases)) })}
            </button>
          ) : (
            <button type="button" className="btn !py-2 !px-3 text-xs min-h-[40px]" onClick={onClear}>
              {t('network.sample.clear')}
            </button>
          )}
          {enabled && isFetching && (
            <Badge tone="amber" pulse>{t('network.sample.loading', { pct: fmtInt(pct) })}</Badge>
          )}
          {enabled && !isFetching && (
            <Tooltip label={t('network.sample.coverageHint')}>
              <Badge tone="teal">
                {t('network.sample.coverage', {
                  n: fmtInt(loaded),
                  total: fmtInt(totalCases),
                  pct: fmtPct(coverage * 100, { digits: 1 }),
                })}
              </Badge>
            </Tooltip>
          )}
          {enabled && failed > 0 && (
            <Badge tone="red">{t('network.sample.failed', { n: fmtInt(failed) })}</Badge>
          )}
        </div>

        {enabled && isFetching && (
          <div className="h-1.5 w-full rounded-full bg-grid/60 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('network.sample.progressAria')}>
            <div className="h-full bg-amber transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        )}

        {enabled && !isFetching && loaded > 0 && (
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-grid/60 bg-base/40 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted">{t('network.sample.firs')}</dt>
              <dd className="num text-sm text-ink">{fmtInt(loaded)}</dd>
            </div>
            <div className="rounded-lg border border-grid/60 bg-base/40 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted">{t('network.sample.victims')}</dt>
              <dd className="num text-sm text-teal">{fmtInt(victimCount)}</dd>
            </div>
            <div className="rounded-lg border border-grid/60 bg-base/40 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-muted">{t('network.sample.locations')}</dt>
              <dd className="num text-sm text-amber">{fmtInt(locationCount)}</dd>
            </div>
          </dl>
        )}

        <p className="text-[10px] text-muted leading-4">{t('network.sample.footnote')}</p>
      </div>
    </Card>
  );
}
