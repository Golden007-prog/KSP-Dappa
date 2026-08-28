// /alerts — corpus truth strip.
//
// Everything else on this page describes the rows the browser managed to page
// in. This strip describes the WHOLE AnomalyAlert table, because it comes from
// GET /alerts/summary, which aggregates server-side (COUNT / GROUP BY on
// Status and Severity plus the busiest districts and the newest CreatedAt).
// So when the corpus is larger than the client cap, the header still states
// the real numbers instead of quietly under-reporting them.
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { sevKey, SEV_TONE, sevRank } from './severity.js';

const STATUS_TONE = { open: 'red', reviewed: 'slate', ack: 'teal', dismissed: 'slate' };

function Stat({ label, value, tone = 'text-ink' }) {
  return (
    <div className="flex min-w-[5.5rem] flex-col rounded-lg border border-grid/70 bg-canvas/30 px-2.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className={`num text-base font-semibold leading-tight ${tone}`}>{value}</span>
    </div>
  );
}

export default function CorpusSummary({
  summary, loaded, total, capped, partial, onSev, onStatus, activeSev, activeStatus,
}) {
  const t = useT();
  const tName = useNames();
  const d = summary || {};
  const byStatus = d.byStatus || {};
  const bySeverity = d.bySeverity || {};
  const topDistricts = Array.isArray(d.topDistricts) ? d.topDistricts.slice(0, 6) : [];

  // bySeverity is keyed by the RAW stored band ("1"/"2"/"3"); fold it into the
  // console's words so one critical band never shows up twice.
  const sevCounts = {};
  for (const [raw, n] of Object.entries(bySeverity)) {
    const key = sevKey(raw);
    if (!key) continue;
    sevCounts[key] = (sevCounts[key] || 0) + (Number(n) || 0);
  }
  const sevEntries = Object.entries(sevCounts).sort((a, b) => sevRank(b[0]) - sevRank(a[0]));
  const statusEntries = ['open', 'reviewed', 'ack', 'dismissed']
    .map((k) => [k, Number(byStatus[k.toUpperCase()]) || 0])
    .filter(([, n]) => n > 0);

  const corpusTotal = Number(d.total);
  const hasCorpus = Number.isFinite(corpusTotal) && corpusTotal > 0;

  return (
    <Card padded={false} className="!py-0">
      <div className="space-y-2.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t('alerts.corpus.title')}
          </h2>
          <Tooltip label={t('alerts.corpus.loadedTip')}>
            <span tabIndex={0} className="num cursor-default rounded-full text-[11px] text-muted outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
              {t('alerts.corpus.loaded', { n: fmtInt(loaded), total: fmtInt(hasCorpus ? corpusTotal : total) })}
            </span>
          </Tooltip>
          {capped && <Badge tone="amber">{t('alerts.corpus.capped')}</Badge>}
          {partial && <Badge tone="amber">{t('alerts.corpus.partial')}</Badge>}
          {d.latestCreatedAt && (
            <span className="num ml-auto text-[11px] text-muted">
              {t('alerts.corpus.latest', { when: String(d.latestCreatedAt).slice(0, 16) })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-stretch gap-2">
          {hasCorpus && <Stat label={t('alerts.corpus.total')} value={fmtInt(corpusTotal)} />}
          {statusEntries.map(([k, n]) => {
            const on = activeStatus === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => onStatus?.(on ? '' : k)}
                className={`flex min-w-[5.5rem] min-h-[44px] flex-col items-start rounded-lg border px-2.5 py-1.5 transition-colors ${
                  on ? 'border-primary/70 bg-primary/5' : 'border-grid/70 hover:border-primary/40'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {t(`alerts.status.${k}`)}
                </span>
                <span className={`num text-base font-semibold leading-tight ${k === 'open' ? 'text-signal' : 'text-ink'}`}>
                  {fmtInt(n)}
                </span>
              </button>
            );
          })}
        </div>

        {sevEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted">{t('alerts.corpus.severitySplit')}</span>
            {sevEntries.map(([k, n]) => {
              const on = activeSev === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSev?.(on ? '' : k)}
                  className={`chip !py-1 min-h-[40px] sm:min-h-[26px] transition-colors ${
                    on ? '!border-primary/60 !text-primary' : 'hover:border-primary/40'
                  }`}
                >
                  <Badge tone={SEV_TONE[k] || 'neutral'}>{t(`alerts.sev.${k}`)}</Badge>
                  <span className="num text-muted">{fmtInt(n)}</span>
                </button>
              );
            })}
          </div>
        )}

        {topDistricts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted">{t('alerts.corpus.topDistricts')}</span>
            {topDistricts.map((x) => (
              <span key={String(x.districtId)} className="chip !py-0.5 !text-[11px]">
                {tName('districts', x.districtId, x.districtName || x.districtId) || x.districtId}
                <span className="num text-muted">{fmtInt(x.openCount)}</span>
              </span>
            ))}
          </div>
        )}

        <p className="text-[10px] leading-tight text-muted">{t('alerts.corpus.note')}</p>
      </div>
    </Card>
  );
}
