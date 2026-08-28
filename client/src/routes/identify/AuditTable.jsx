// Face-search history — what the officer knows is logged: when, which case,
// which legal basis, who, the filters, how many candidates, the top figure and
// the decision. Above the list: outcome statistics (confirm rate, "no reliable
// match" rate, median top confidence) and a floor-sensitivity board computed
// from the logged confidences. No probe image is stored or shown.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import KpiTile from '../../components/KpiTile.jsx';
import { useFaceAudit } from '../../lib/faceApi.js';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const DECISION_STATUS = { candidates: 'rising', 'no-reliable-match': 'nodata', 'rejected-by-quality-gate': 'falling' };
const DECISION_KEY = { candidates: 'candidates', 'no-reliable-match': 'noReliable', 'rejected-by-quality-gate': 'rejected' };
const FLOORS = [0.7, 0.8, 0.9];

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function filtersLine(f, t) {
  const parts = [];
  if (!f) return '—';
  if (f.districtId) parts.push(`${t('identify.filters.district')} ${f.districtId}`);
  if (f.moTag) parts.push(f.moTag);
  if (f.riskBand) parts.push(t(`identify.filters.risk.${f.riskBand}`));
  if (f.ageBand) parts.push(f.ageBand);
  if (f.gender) parts.push(t(f.gender === 'male' ? 'identify.filters.genderMale' : 'identify.filters.genderFemale'));
  if (f.yearFrom || f.yearTo) parts.push(`${f.yearFrom || '…'}–${f.yearTo || '…'}`);
  return parts.join(' · ') || '—';
}

function when(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts || '—');
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function AuditTable({ personKey }) {
  const t = useT();
  const q = useFaceAudit(personKey ? { personKey, limit: 50 } : { limit: 50 });
  const items = q.data ? q.data.items : [];
  const floor = Number(q.data && q.data.meta && q.data.meta.floor) || 0.7;

  const stats = useMemo(() => {
    const scored = items.filter((it) => typeof it.topConfidence === 'number');
    const confirmed = items.filter((it) => (it.decisions || []).some((d) => d.decision === 'confirm')).length;
    const noReliable = items.filter((it) => it.decision === 'no-reliable-match').length;
    const searches = items.length;
    return {
      searches,
      confirmRate: searches ? confirmed / searches : null,
      noReliableRate: searches ? noReliable / searches : null,
      medianTop: median(scored.map((it) => it.topConfidence)),
      board: FLOORS.map((f) => ({ floor: f, flips: scored.filter((it) => it.topConfidence >= floor && it.topConfidence < f).length, total: scored.length })),
    };
  }, [items, floor]);

  if (q.isLoading) return <Card title={t('identify.audit.title')}><LoadingSkeleton lines={6} /></Card>;
  if (q.error) {
    return (
      <Card title={t('identify.audit.title')}>
        <EmptyState compact title={t('common.state.error')} message={q.error.message} action={<button type="button" className="btn min-h-[44px]" onClick={() => q.refetch()}>{t('common.action.retry')}</button>} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!personKey && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiTile label={t('identify.audit.stats.searches')} value={fmtInt(stats.searches)} hint={t('identify.audit.stats.searchesHint')} />
          <KpiTile label={t('identify.audit.stats.confirmRate')} value={stats.confirmRate === null ? '—' : fmtPct(stats.confirmRate, { fraction: true, digits: 0 })} hint={t('identify.audit.stats.confirmRateHint')} />
          <KpiTile label={t('identify.audit.stats.noReliableRate')} value={stats.noReliableRate === null ? '—' : fmtPct(stats.noReliableRate, { fraction: true, digits: 0 })} hint={t('identify.audit.stats.noReliableRateHint')} />
          <KpiTile label={t('identify.audit.stats.medianTop')} value={stats.medianTop === null ? '—' : t('identify.cand.confidenceOf', { n: Math.round(stats.medianTop * 100) })} hint={t('identify.audit.stats.medianTopHint')} />
        </div>
      )}

      {!personKey && stats.board[0].total > 0 && (
        <Card title={t('identify.audit.floorBoard.title')} subtitle={t('identify.audit.floorBoard.subtitle', { floor: Math.round(floor * 100) })}>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {stats.board.map((b) => (
              <li key={b.floor} className="rounded-lg border border-grid bg-canvas/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted num">{t('identify.audit.floorBoard.at', { floor: Math.round(b.floor * 100) })}</p>
                <p className="text-sm text-ink num">{t('identify.audit.floorBoard.flip', { n: fmtInt(b.flips), total: fmtInt(b.total) })}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={personKey ? t('identify.panel.searches') : t('identify.audit.title')} subtitle={t('identify.audit.subtitle')}>
        {items.length === 0 ? (
          <EmptyState compact title={personKey ? t('identify.panel.noSearches') : t('identify.audit.empty')} message={t('identify.audit.noProbe')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-2">{t('identify.audit.colWhen')}</th>
                  <th className="py-1.5 pr-2">{t('identify.audit.colCase')}</th>
                  <th className="py-1.5 pr-2">{t('identify.audit.colOfficer')}</th>
                  <th className="py-1.5 pr-2">{t('identify.audit.colFilters')}</th>
                  <th className="py-1.5 pr-2 num">{t('identify.audit.colCandidates')}</th>
                  <th className="py-1.5 pr-2 num">{t('identify.audit.colTop')}</th>
                  <th className="py-1.5 pr-2">{t('identify.audit.colDecision')}</th>
                  <th className="py-1.5">{t('identify.audit.colOutcome')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-grid/50">
                {items.map((it) => (
                  <tr key={it.searchId} className="align-top">
                    <td className="py-2 pr-2 num whitespace-nowrap text-ink">{when(it.ts)}</td>
                    <td className="py-2 pr-2">
                      <span className="num text-ink">{it.caseNo || '—'}</span>
                      <span className="block text-[10px] text-muted">{it.legalBasis ? t(`identify.basis.${it.legalBasis}`) : '—'}</span>
                      {it.probeSource === 'sample-capture' && (
                        <span className="block text-[10px] text-amber">{t('identify.audit.sampleProbe', { key: it.samplePerson || '—' })}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-ink">{(it.officer && it.officer.actor) || '—'}<span className="block text-[10px] text-muted">{(it.officer && it.officer.role) || ''}</span></td>
                    <td className="py-2 pr-2 text-muted">{filtersLine(it.filters, t)}<span className="block text-[10px]">{it.shortlist && it.shortlist.description}</span></td>
                    <td className="py-2 pr-2 num text-ink">{fmtInt(it.candidates || 0)}</td>
                    <td className="py-2 pr-2 num text-ink">{typeof it.topConfidence === 'number' ? `${Math.round(it.topConfidence * 100)}` : '—'}{it.topPersonKey && <Link to={`/offenders/${encodeURIComponent(it.topPersonKey)}`} className="inline-flex min-h-[24px] min-w-[24px] items-center text-[10px] text-muted hover:text-amber">{it.topPersonKey}</Link>}</td>
                    <td className="py-2 pr-2"><StatusPill status={DECISION_STATUS[it.decision] || 'nodata'} label={t(`identify.audit.decision.${DECISION_KEY[it.decision] || 'noReliable'}`)} /></td>
                    <td className="py-2">
                      {(it.decisions || []).length === 0 ? <span className="text-muted">—</span> : (it.decisions || []).map((d, i) => (
                        <span key={`${d.personKey}-${i}`} className="block">
                          <StatusPill status={d.decision === 'confirm' ? 'stable' : 'falling'} label={t(`identify.decision.${d.decision}`)} className="mr-1" />
                          <span className="num text-muted">{d.personKey}</span>
                        </span>
                      ))}
                      <span className="block text-[10px] text-muted mt-0.5">{t('identify.audit.source', { s: it.source || '—' })}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
