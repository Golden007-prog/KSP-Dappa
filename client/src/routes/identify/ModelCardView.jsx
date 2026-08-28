// Model card — the measured numbers (scripts/faces_calibrate.mjs on the
// synthetic set), the floor, the error rates at the floor, the shortlist rank
// test, and the plain statements every officer should read before trusting a
// number: a face match is a lead, not evidence of identity.
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import Badge from '../../components/Badge.jsx';
import PlainTerm from '../../components/PlainTerm.jsx';
import { useFaceModelCard } from '../../lib/faceApi.js';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { ConfidenceBar } from './CandidateCard.jsx';

const pct = (v) => (typeof v === 'number' ? fmtPct(v, { fraction: true, digits: 1 }) : '—');
const n100 = (v) => (typeof v === 'number' ? Math.round(v * 100) : '—');

export default function ModelCardView() {
  const t = useT();
  const q = useFaceModelCard();
  if (q.isLoading) return <Card title={t('identify.card.title')}><LoadingSkeleton lines={8} /></Card>;
  if (q.error) return <Card title={t('identify.card.title')}><EmptyState compact title={t('common.state.error')} message={q.error.message} action={<button type="button" className="btn min-h-[44px]" onClick={() => q.refetch()}>{t('common.action.retry')}</button>} /></Card>;
  const card = q.data;
  const cal = card.calibration || {};
  const paths = Array.isArray(cal.paths) ? cal.paths : [];
  const rank = (cal.rankTest && cal.rankTest['pixel/pixel']) || null;
  const floor = Number(card.floor) || 0.7;
  // What the live Zia calls actually returned on 28 Aug — the failed detection
  // and the two comparison pairs the floor was drawn from.
  const zia = card.ziaObserved || null;

  return (
    <div className="space-y-4">
      <Card title={t('identify.card.title')} subtitle={t('identify.card.subtitle', { version: card.version || '—' })}>
        <ul className="space-y-1.5">
          {(card.statements || []).map((s) => <li key={s} className="text-sm text-ink leading-snug flex gap-2"><span aria-hidden="true" className="text-amber">■</span><span>{s}</span></li>)}
        </ul>
      </Card>

      <Card title={t('identify.card.engines')}>
        <ul className="divide-y divide-grid/50">
          {(card.engines || []).map((e) => (
            <li key={e.key} className="py-2 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink font-medium">{e.name}</span>
                {e.flag ? <Badge tone="amber">{e.flag}</Badge> : <Badge tone="teal">{t('identify.card.alwaysOn')}</Badge>}
              </div>
              <p className="text-xs text-muted mt-0.5">{e.role}</p>
              {e.threshold && <p className="text-[11px] text-muted num">{e.threshold}</p>}
            </li>
          ))}
        </ul>
      </Card>

      {zia && (
        <Card title={t('identify.card.zia.title')} subtitle={t('identify.card.zia.subtitle', { n: fmtInt(zia.calls || 0), date: zia.measuredAt || '—' })}>
          <div className="space-y-3">
            {zia.analyseFace && (
              <div className="rounded-lg border border-signal/40 bg-signal/5 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-ink">{t('identify.card.zia.detection')}</span>
                  <Badge tone="amber">{t('identify.card.zia.failed')}</Badge>
                  <span className="num text-[11px] text-signal">{t('identify.card.zia.http', { status: zia.analyseFace.status, error: zia.analyseFace.error })}</span>
                </div>
                <p className="text-[11px] text-muted mt-1">{zia.analyseFace.reading}</p>
              </div>
            )}
            {Array.isArray(zia.compareFace) && zia.compareFace.length > 0 && (
              <div>
                <p className="text-xs font-medium text-ink mb-1.5">{t('identify.card.zia.compare')}</p>
                <ul className="space-y-2.5">
                  {zia.compareFace.map((c) => (
                    <li key={c.pair} className="rounded-lg border border-grid bg-canvas/50 px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="text-xs text-ink">{c.pair}</span>
                        <span className="num text-sm font-semibold text-ink">{n100(c.confidence)}<span className="text-[10px] text-muted">/100</span></span>
                      </div>
                      <div className="mt-1.5">
                        <ConfidenceBar confidence={c.confidence} floor={floor} deadBand={Number(card.deadBand) || 0.1} label={`${c.pair}: ${n100(c.confidence)}`} />
                      </div>
                      <p className="text-[11px] text-muted mt-1">{c.verdict}{c.matched !== undefined && c.matched !== null ? ` · Zia matched:"${c.matched}"` : ''}</p>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted mt-1.5 num">{t('identify.card.zia.floorLine', { floor: n100(floor) })}</p>
              </div>
            )}
            {zia.reading && <p className="text-xs text-ink leading-snug">{zia.reading}</p>}
            {zia.availability && (
              <p className="text-[11px] text-muted">
                <span className="font-medium text-ink">{t('identify.card.zia.availability')}: </span>{zia.availability}
              </p>
            )}
          </div>
        </Card>
      )}

      <Card
        title={t('identify.card.calibrationTitle')}
        subtitle={cal.faces ? t('identify.card.calibration', { n: fmtInt(cal.faces), pairs: fmtInt((cal.pairs && (cal.pairs.samePerson + cal.pairs.differentPerson)) || 0), floor: n100(floor) }) : t('identify.card.missing')}
      >
        {paths.length === 0 ? (
          <EmptyState compact title={t('identify.card.missing')} message={cal.note || ''} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">{t('identify.card.calibrationTitle')}</caption>
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1.5 pr-2">{t('identify.card.colPath')}</th>
                    <th className="py-1.5 pr-2 num">{t('identify.card.colDims')}</th>
                    <th className="py-1.5 pr-2 num">{t('identify.card.colSame')}</th>
                    <th className="py-1.5 pr-2 num">{t('identify.card.colDiff')}</th>
                    <th className="py-1.5 pr-2 num">{t('identify.card.colFar')}</th>
                    <th className="py-1.5 pr-2 num">{t('identify.card.colFrr')}</th>
                    <th className="py-1.5 num">{t('identify.card.colEer')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-grid/50">
                  {paths.map((p) => (
                    <tr key={p.path}>
                      <td className="py-2 pr-2 text-ink">
                        <span className="font-medium">{p.path}</span>
                        <span className="block text-[10px] text-muted max-w-[22rem]">{p.note}</span>
                      </td>
                      <td className="py-2 pr-2 num text-ink">{p.dims}</td>
                      <td className="py-2 pr-2 num text-ink">{n100(p.samePerson && p.samePerson.median)} <span className="text-muted">(p10 {n100(p.samePerson && p.samePerson.p10)})</span></td>
                      <td className="py-2 pr-2 num text-ink">{n100(p.differentPerson && p.differentPerson.median)} <span className="text-muted">(p90 {n100(p.differentPerson && p.differentPerson.p90)})</span></td>
                      <td className="py-2 pr-2 num text-ink">{pct(p.atFloor && p.atFloor.falseAccept)}</td>
                      <td className="py-2 pr-2 num text-ink">{pct(p.atFloor && p.atFloor.falseReject)}</td>
                      <td className="py-2 num text-ink">{p.equalError ? `${n100(p.equalError.floor)} (${pct(p.equalError.falseAccept)})` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted mt-2">
              <PlainTerm term="faceFloor" vars={{ floor: n100(floor) }} className="mr-1" size="lg" />
              {cal.method}
            </p>
          </>
        )}
      </Card>

      {rank && (
        <Card title={t('identify.card.rank.title')} subtitle={t('identify.card.rank.subtitle', { n: fmtInt(rank.probes), size: rank.shortlistSize })}>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              ['top1', rank.top1], ['top3', rank.top3], ['noReliable', rank.noReliableMatchRate], ['wrongFirst', rank.wrongPersonRankedFirstAboveFloor],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-grid bg-canvas/60 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wide text-muted">{t(`identify.card.rank.${k}`)}</dt>
                <dd className="text-sm text-ink num">{pct(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Card title={t('identify.card.limitations')}>
        <ul className="space-y-1.5">
          {(card.limitations || []).map((s) => <li key={s} className="text-xs text-ink leading-snug flex gap-2"><span aria-hidden="true" className="text-muted">–</span><span>{s}</span></li>)}
          {(cal.caveats || []).map((s) => <li key={s} className="text-xs text-muted leading-snug flex gap-2"><span aria-hidden="true">–</span><span>{s}</span></li>)}
        </ul>
      </Card>
    </div>
  );
}
