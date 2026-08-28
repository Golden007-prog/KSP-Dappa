// Per-alias "why linked" — the three components behind each alias score
// (token-sort ratio, age closeness, district overlap) as a stacked bar, the
// exact-name anchor rule, and the verdict against the pipeline threshold.
// Data: GET /depth/identity/:personKey.
import StatusPill from '../../components/StatusPill.jsx';
import PlainTerm from '../../components/PlainTerm.jsx';
import { useDepthIdentity } from '../../lib/depthApi.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { PanelFrame, statusOf } from './DepthBits.jsx';

export default function WhyLinkedCard({ personKey }) {
  const t = useT();
  const q = useDepthIdentity(personKey);
  const d = q.data;
  const rows = d?.aliases || [];
  return (
    <PanelFrame
      title={t('depth.o360.whyTitle')}
      subtitle={d ? t('depth.o360.whySub', { n: fmtInt(rows.length), th: fmtNum(d.threshold, 2) }) : undefined}
      term="whylinked"
      termVars={{ n: fmtInt(rows.filter((r) => r.aboveThreshold).length), total: fmtInt(rows.length) }}
      method={t('depth.o360.whyMethod')}
      methodDetail={d?.formula}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && rows.length === 0}
      emptyMessage={t('depth.o360.whyEmpty')}
    >
      {d && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted">
            {t('depth.o360.whyAnchor', { name: d.canonical, age: d.canonicalMedianAge === null ? '—' : fmtInt(d.canonicalMedianAge), n: fmtInt(d.canonicalRecords) })}
          </p>
          <ul className="space-y-2">
            {rows.slice(0, 8).map((r) => (
              <li key={r.alias} className="bg-base/60 border border-grid rounded-lg px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-ink font-medium">{r.alias}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="num text-xs text-ink">{fmtNum(r.score, 2)}</span>
                    <StatusPill status={statusOf(r.verdict)} label={t(`depth.o360.whyVerdict.${r.verdict}`)} />
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 w-full rounded bg-grid/40 overflow-hidden flex" role="img" aria-label={t('depth.o360.whyBarAria', { ts: fmtNum(r.contributions.tokenSort, 2), age: fmtNum(r.contributions.age, 2), dist: fmtNum(r.contributions.district, 2) })}>
                  <span className="bg-amber/80 h-full" style={{ width: `${r.contributions.tokenSort * 100}%` }} />
                  <span className="bg-teal/80 h-full" style={{ width: `${r.contributions.age * 100}%` }} />
                  <span className="bg-primary/80 h-full" style={{ width: `${r.contributions.district * 100}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-muted num">
                  {t('depth.o360.whyParts', {
                    ts: fmtPct(r.components.tokenSortRatio * 100, { digits: 0 }),
                    age: r.components.ageDelta === null ? '—' : t('depth.common.yearsN', { n: fmtNum(r.components.ageDelta, 0) }),
                    dist: r.components.districtOverlap ? t('depth.common.yes') : t('depth.common.no'),
                    n: fmtInt(r.records),
                  })}
                  {r.anchorPass && <span> · {t('depth.o360.whyAnchorPass')}</span>}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 bg-amber/80" aria-hidden="true" />{t('depth.o360.legendTs')}</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 bg-teal/80" aria-hidden="true" />{t('depth.o360.legendAge')}</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-2 bg-primary/80" aria-hidden="true" />{t('depth.o360.legendDist')}</span>
            <PlainTerm term="precisionrecall" />
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
