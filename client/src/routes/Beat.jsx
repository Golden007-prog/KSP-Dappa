// /beat — My Beat (Constable / Head Constable). One card answers the three
// questions — What changed? What needs attention? What do I do next? — in
// plain sentences with the statistic behind a 44-px (i). On a 360×640 phone
// the FIRST question and everything under it fits above the fold (measured
// 304→628 px at scroll 0, static-demo build); the second starts at 628 and the
// third at 966, one thumb-scroll away. Three full questions in 640 px is not
// achievable at this content density and the earlier comment claiming it was
// wrong. Then nearby hotspots, my assigned cases and a tile-free beat
// map. The one primary action and the dismiss-with-reason control record to
// the Phase-7 action log when an alert exists, otherwise to this phone, and
// say which. The last good answer is kept in localStorage so the card renders
// offline with a "saved copy from <time> · offline" status pill.
// Data: GET /tiers/beat (lib/tierApi.js useBeatHome). Backlog rows 3, 8, 28,
// 29, 34, 35, 42, 43, 47, 55.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card.jsx';
import StatusPill from '../components/StatusPill.jsx';
import ProvenanceStamp from '../components/ProvenanceStamp.jsx';
import PlainSentence from '../components/PlainSentence.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useBeatHome } from '../lib/tierApi.js';
import { useTierStore } from '../lib/tier.js';
import { usePlain } from '../lib/plainlanguage.js';
import { statusFromPendency, statusFromRiskWord } from '../lib/status.js';
import { useI18n } from '../lib/i18n.jsx';
import { fmtInt, fmtNum, dateLabel } from '../lib/format.js';
import {
  Question, InfoButton, TierHeader, UnitPicker, PanelState, todayLabel, dominantBand, hourRangeLabel, bandKeyOfHour, useTierRoute,
} from './tiers/bits.jsx';
import BeatMap from './tiers/BeatMap.jsx';
import DismissSheet from './tiers/DismissSheet.jsx';
import TierPrintStyles from './tiers/tierPrint.jsx';
import { recordDecision, lastDecision } from './tiers/actionLog.js';

const SAVED_KEY = (unitId) => `dappa-beat-last:${unitId || 'default'}`;

function readSaved(unitId) {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY(unitId)));
    return v && v.data ? v : null;
  } catch {
    return null;
  }
}

function placeOf(h) {
  const label = String(h?.label || '');
  const after = label.includes('—') ? label.split('—')[1] : '';
  const place = after ? after.split(',')[0].trim() : '';
  return place || h?.subHeadName || h?.headName || '';
}

function timeLabel(iso, lang) {
  try {
    return new Intl.DateTimeFormat(lang === 'kn' ? 'kn-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 16);
  }
}

export default function Beat() {
  const { t, lang, tName } = useI18n();
  const { fmt, term, plain } = usePlain();
  const toast = useToast();
  const tier = useTierStore((s) => s.tier);
  useTierRoute('beat'); // arriving from the sidebar must switch the app into beat wording
  const [searchParams, setSearchParams] = useSearchParams();
  const unitId = searchParams.get('unitId') || '';
  const q = useBeatHome(unitId ? { unitId } : {});
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [dismissOpen, setDismissOpen] = useState(false);
  const [decision, setDecision] = useState(() => lastDecision(unitId));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Keep the last good answer so the card renders offline (row 47 / PWA).
  useEffect(() => {
    if (!q.data) return;
    try { localStorage.setItem(SAVED_KEY(unitId), JSON.stringify({ savedAt: new Date().toISOString(), data: q.data })); } catch { /* private mode */ }
  }, [q.data, unitId]);

  const saved = useMemo(() => ((q.isError || !online) && !q.data ? readSaved(unitId) : null), [q.isError, q.data, online, unitId]);
  const d = q.data || saved?.data || null;
  const offlineCopy = Boolean(saved) || (!online && Boolean(d));

  const unitName = d ? tName('units', d.unit?.unitId, d.unit?.unitName) || d.unit?.unitName || '' : '';
  const recent = d?.recent || { count: 0, byHead: [], cases: [] };
  const band = dominantBand(recent.cases);
  const topHotspot = useMemo(() => {
    const rows = (d?.hotspots || []).slice();
    rows.sort((a, b) => (b.thisWeekInside - a.thisWeekInside) || ((a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)));
    return rows[0] || null;
  }, [d]);
  const topAlert = (d?.alerts || [])[0] || null;
  const riskStatus = statusFromRiskWord(d?.risk?.word);
  const whenLabel = topHotspot ? hourRangeLabel(topHotspot.hourBandStart, topHotspot.hourBandEnd) : '';

  const one = recent.count === 1 ? '.one' : '';
  const weekSentence = !d ? '' : recent.count === 0
    ? t('tier.beat.week.none', { unit: unitName })
    : recent.usualPerWeek === null || recent.usualPerWeek === undefined
      ? t(`tier.beat.week.noUsual${one}`, { n: fmtInt(recent.count), unit: unitName })
      : `${t(`tier.beat.week.sentence${one}`, { n: fmtInt(recent.count), unit: unitName, usual: fmtNum(recent.usualPerWeek, 0) })}${band ? ` ${t('tier.beat.week.mostly', { band: t(`tier.band.${band}`) })}` : ''}`;

  const riskSentence = !d?.risk ? t('tier.beat.risk.nodata')
    : `${t(`tier.beat.risk.${['high', 'elevated', 'normal'].includes(d.risk.word) ? d.risk.word : 'nodata'}`)}${d.risk.drivers?.[0] ? ` ${t('tier.beat.risk.driver', { driver: d.risk.drivers[0] })}` : ''}`;

  const record = async (actionType, note) => {
    const rec = await recordDecision({ alertKey: topAlert?.alertId || null, actionType, note, unit: d?.unit?.unitId, tier });
    setDecision(rec);
    toast[rec.source === 'api' ? 'success' : 'info'](rec.source === 'api'
      ? (actionType === 'dismiss' ? t('tier.beat.dismiss.saved', { when: timeLabel(rec.ts, lang), reason: rec.note }) : t('tier.beat.action.recorded', { when: timeLabel(rec.ts, lang) }))
      : t('tier.beat.dismiss.local'));
    return rec;
  };

  const chooseUnit = (v) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set('unitId', v); else next.delete('unitId');
      return next;
    });
  };

  return (
    <div id="beat-home" className="tier-home mx-auto max-w-xl space-y-4" data-tier-home="beat">
      <TierPrintStyles tier="beat" />
      <TierHeader
        eyebrow={t('tier.eyebrow.beat')}
        title={t('tier.beat.title')}
        sub={`${t('tier.today', { day: todayLabel(lang) })}${unitName ? ` · ${unitName}` : ''}`}
        readTarget="beat-home"
        onPrint={() => window.print()}
        printLabel={t('tier.beat.print')}
      >
        <UnitPicker value={unitId} onChange={chooseUnit} compact />
        {offlineCopy && (
          <StatusPill
            status="nodata"
            size="md"
            label={t('tier.beat.offline.saved', { time: saved ? timeLabel(saved.savedAt, lang) : timeLabel(new Date().toISOString(), lang) })}
            className="!normal-case !tracking-normal"
          />
        )}
      </TierHeader>
      <p className="tier-print-only text-[11px]">{t('tier.print.preparedFor', { role: t('tier.role.beat'), unit: unitName })}</p>

      {!d && q.isLoading && <PanelState query={q} height={320} />}
      {!d && q.isError && !q.isLoading && (
        <EmptyState
          title={!online ? t('tier.beat.offline.none') : t('tier.error', { message: q.error?.message || '—' })}
          action={<button type="button" className="btn min-h-[44px]" onClick={() => q.refetch()}>{t('tier.retry')}</button>}
        />
      )}

      {d && (
        <>
          <Card padded={false} className="overflow-hidden divide-y divide-grid/60">
            <Question id="beat-what" question={t('tier.q.what')} status={recent.statusWord} sentence={weekSentence} accent={recent.statusWord === 'rising'}>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-grid border-l-2 border-l-signal bg-panel-raised px-3 py-1.5">
                  <span className="block text-[11px] leading-tight text-muted">{t('tier.thisWeek')}</span>
                  <span className="num block text-2xl font-semibold leading-tight tracking-tight text-ink">{fmtInt(recent.count)}</span>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-grid border-l-2 border-l-teal bg-panel-raised py-1.5 pl-3 pr-0.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] leading-tight text-muted">{term('baseline').label}</span>
                    <span className="num block text-2xl font-semibold leading-tight tracking-tight text-ink">{recent.usualPerWeek === null || recent.usualPerWeek === undefined ? '—' : fmtNum(recent.usualPerWeek, 0)}</span>
                  </span>
                  <InfoButton label={`${term('baseline').label}: ${term('baseline').sentence} · ${term('baseline').technical}`} />
                </div>
              </div>
              {recent.swings !== null && recent.swings !== undefined && (
                // The "unusual rise" gloss explains what an anomaly IS, so it
                // only belongs on a week that is one. Appended unconditionally
                // it told a constable "within the normal range … well outside
                // this station's normal range" in the same breath.
                <PlainSentence
                  term="zscore"
                  size="lg"
                  lead={`${fmt('zscore', recent.swings)} (z ${fmtNum(recent.swings, 1)}).${Math.abs(Number(recent.swings)) >= 2 ? ` ${term('anomaly').sentence}` : ''}`}
                  className="text-muted"
                />
              )}
              {recent.byHead.length > 0 && (
                <p className="text-xs text-muted" data-readable="">
                  {t('tier.beat.week.byHead', { list: recent.byHead.map((h) => `${tName('crimeHeads', h.crimeHeadId, h.headName)} ${fmtInt(h.count)}`).join(' · ') })}
                </p>
              )}
            </Question>

            <Question id="beat-attention" question={t('tier.q.attention')} status={riskStatus} statusLabel={undefined} sentence={riskSentence} accent={riskStatus === 'rising'}>
              {d.risk && d.risk.percentile !== null && (
                <PlainSentence term="percentile" size="lg" lead={t('tier.beat.risk.compare', { phrase: fmt('percentile', d.risk.percentile) })} className="text-muted" />
              )}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted">{t('tier.beat.alerts.title')}</p>
                {(d.alerts || []).length === 0 && <p className="text-xs text-muted">{t('tier.beat.alerts.none')}</p>}
                {(d.alerts || []).slice(0, 2).map((a) => (
                  <div key={a.alertId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-grid bg-panel-raised px-3 py-2 min-h-[52px]">
                    <StatusPill status={a.statusWord} size="md" />
                    <span className="text-sm font-medium text-ink">{tName('crimeHeads', a.crimeHeadId, a.headName)}</span>
                    {/* The server narrative ends in the raw statistic — "(robust z
                        -2.7). Severity 1." — and this is the one tier where plain
                        language is ON by default (lib/tier.js). Appending it here
                        undid the plain phrase immediately to its left, on the screen
                        built for the least data-literate reader. Nothing is lost by
                        dropping it in plain mode: the line already carries the plain
                        phrase and the observed-vs-expected comparison. */}
                    <span className="basis-full text-xs text-muted" data-readable="">{fmt('zscore', a.zScore)} · {fmtInt(a.observed)} vs {fmtInt(a.expected)}{!plain && a.narrative ? ` · ${a.narrative}` : ''}</span>
                  </div>
                ))}
              </div>
            </Question>

            <Question id="beat-next" question={t('tier.q.next')}>
              <button
                type="button"
                onClick={() => record('note', topHotspot ? t('tier.beat.action.patrol', { place: placeOf(topHotspot), when: whenLabel }) : t('tier.beat.action.patrolPlain'))}
                className="btn-primary min-h-[48px] w-full justify-center text-[15px]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                <span>{topHotspot ? t('tier.beat.action.patrol', { place: placeOf(topHotspot), when: whenLabel }) : t('tier.beat.action.patrolPlain')}</span>
              </button>
              <button type="button" onClick={() => setDismissOpen(true)} className="btn min-h-[44px] w-full justify-center text-sm">
                {t('tier.beat.dismiss.button')}
              </button>
              {decision && decision.unit === String(d.unit?.unitId) && (
                <p className="text-xs text-muted" role="status" data-readable="">
                  {decision.actionType === 'dismiss'
                    ? t('tier.beat.dismiss.saved', { when: timeLabel(decision.ts, lang), reason: decision.note })
                    : t('tier.beat.action.recorded', { when: timeLabel(decision.ts, lang) })}
                  {decision.source === 'local' && <span> · {t('tier.beat.dismiss.local')}</span>}
                </p>
              )}
              <p className="text-[11px] text-muted">{t('tier.beat.action.note')}</p>
              <ProvenanceStamp provenance={d.provenance} size="lg" />
            </Question>
          </Card>

          <Card title={t('tier.beat.hotspots.title')} subtitle={t('tier.beat.hotspots.sub')} padded={false}>
            {(d.hotspots || []).length === 0 ? <EmptyState compact title={t('tier.beat.hotspots.none')} /> : (
              <ul className="divide-y divide-grid/60">
                {d.hotspots.map((h) => {
                  const bk = bandKeyOfHour(h.hourBandStart);
                  return (
                    <li key={h.clusterId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 min-h-[52px]">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate">{h.subHeadName || tName('crimeHeads', h.crimeHeadId, h.headName)} · {placeOf(h)}</p>
                        <p className="text-xs text-muted" data-readable="">
                          {t('tier.beat.hotspots.row', { n: fmtInt(h.caseCount), radius: fmtInt(h.radiusM), band: hourRangeLabel(h.hourBandStart, h.hourBandEnd) })}
                          {bk ? ` · ${t('tier.beat.hotspots.when', { band: t(`tier.bandShort.${bk}`) })}` : ''}
                          {h.thisWeekInside > 0 ? ` · ${t('tier.beat.hotspots.inside', { n: fmtInt(h.thisWeekInside) })}` : ''}
                        </p>
                      </div>
                      <span className="num text-xs text-muted whitespace-nowrap">{h.distanceKm === null ? '—' : t('tier.km', { n: fmtNum(h.distanceKm, 1) })}</span>
                      <StatusPill status={h.thisWeekInside > 0 ? 'watch' : 'stable'} size="md" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card
            title={t('tier.beat.cases.title')}
            subtitle={`${t('tier.beat.cases.open', { n: fmtInt(d.openCases?.total || 0) })}${d.openCases?.over30 ? ` · ${t('tier.beat.cases.over30', { n: fmtInt(d.openCases.over30) })}` : ''}`}
            padded={false}
          >
            {!(d.openCases?.rows || []).length ? <EmptyState compact title={t('tier.beat.cases.none')} /> : (
              <ul className="divide-y divide-grid/60">
                {d.openCases.rows.map((c) => (
                  <li key={c.caseMasterId}>
                    <Link to={`/cases/${encodeURIComponent(c.caseMasterId)}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 min-h-[52px] hover:bg-grid/20">
                      <div className="min-w-0 flex-1">
                        <p className="num text-[13px] font-medium text-ink truncate">FIR {c.crimeNo} · {c.subHeadName || c.headName}</p>
                        <p className="text-xs text-muted" data-readable="">
                          {t('tier.beat.cases.pending', { n: fmtInt(c.pendingDays ?? 0) })}{c.officer ? ` · ${t('tier.beat.cases.officer', { name: c.officer })}` : ''} · {dateLabel(c.registeredDate)}
                        </p>
                      </div>
                      <StatusPill status={statusFromPendency(c.pendingDays)} size="md" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('tier.beat.map.title')} subtitle={t('tier.beat.map.sub')}>
            <BeatMap center={{ lat: d.unit?.lat, lng: d.unit?.lng }} hotspots={d.hotspots || []} cases={recent.cases || []} height={220} />
          </Card>

          <p className="text-[11px] text-muted">{t('tier.purpose')}</p>
          <p className="tier-print-only text-[10px]">{t('tier.print.legend')}</p>
        </>
      )}

      <DismissSheet open={dismissOpen} onClose={() => setDismissOpen(false)} onSave={(reason) => record('dismiss', reason)} />
    </div>
  );
}
