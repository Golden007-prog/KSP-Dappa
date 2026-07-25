// /cases/:id — FIR detail: CrimeNo digit anatomy, lifecycle timeline with lag
// analytics + completion %, parties (accused link into the offender registry),
// sections (copyable), arrest / chargesheet / IO / court panels, narrative
// insights (Zia or local fallback), anomaly badge with reason, a mini-map of
// the incident with a same-pattern-nearby overlay, pattern-engine similar
// cases (similarity % + why-matched), incident time-band context, and one-tap
// pivot chips back into the explorer. Prev/next walks the sibling list carried
// in nav state (←/→ keys too); header actions: star, copy CrimeNo / share
// link, JSON export, print.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useCase, useLookups } from '../lib/api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import DataTable from '../components/DataTable.jsx';
import PulseDot from '../components/PulseDot.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { dateLabel, fmtInt } from '../lib/format.js';
import { useT } from '../lib/i18n.jsx';
import { useCaseNames } from './cases/names.js';
import CrimeNoBreakdown, { splitCrimeNo } from './cases/CrimeNoBreakdown.jsx';
import PartyList, { ARREST_FIELDS, NAME_KEYS } from './cases/PartyList.jsx';
import KeyValuePanel from './cases/KeyValuePanel.jsx';
import NarrativePanel from './cases/NarrativePanel.jsx';
import IncidentMap from './cases/IncidentMap.jsx';
import CaseTimeline from './cases/CaseTimeline.jsx';
import CaseLagStrip from './cases/CaseLagStrip.jsx';
import SimilarCases from './cases/SimilarCases.jsx';
import { useSimilarCases, useNearbyIncidents } from './cases/similar.js';
import { CHARGESHEET_ROWS, IO_ROWS, COURT_ROWS, hearingCountdown } from './cases/detailPanels.js';
import { downloadCaseJson } from './cases/exportCaseJson.js';
import { copyText } from './cases/clipboard.js';
import { pickValue } from './cases/caseDates.js';
import { readStars, toggleStar } from './cases/stars.js';
import { pushRecent } from './cases/recent.js';
import './cases/case-detail-print.css';

const WEEKDAY_KEYS = ['cases.detail.wd.sun', 'cases.detail.wd.mon', 'cases.detail.wd.tue',
  'cases.detail.wd.wed', 'cases.detail.wd.thu', 'cases.detail.wd.fri', 'cases.detail.wd.sat'];
// `band` stays the canonical English key — it drives the amber/slate tone below.
const BAND_KEYS = {
  night: 'cases.detail.band.night',
  morning: 'cases.detail.band.morning',
  afternoon: 'cases.detail.band.afternoon',
  evening: 'cases.detail.band.evening',
  'late night': 'cases.detail.band.lateNight',
};

/** Weekday + clock + day-part band from the incident timestamp — the list
 * rows are date-only, so hour-of-day context lives here on the detail. */
function incidentTimeContext(iso, t) {
  if (!iso) return null;
  const dt = new Date(String(iso).replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return null;
  const h = dt.getHours();
  const band = h < 6 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'late night';
  const hm = `${String(h).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  return { label: `${t(WEEKDAY_KEYS[dt.getDay()])} ${hm} · ${t(BAND_KEYS[band])}`, band };
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Icon = ({ children, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true" className="shrink-0">{children}</svg>
);
const ICONS = {
  copy: <Icon><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Icon>,
  link: <Icon><path d="M10 14a4 4 0 0 0 6 .5l2.5-2.5a4 4 0 1 0-5.7-5.7L11.5 7.6" /><path d="M14 10a4 4 0 0 0-6-.5L5.5 12a4 4 0 1 0 5.7 5.7l1.3-1.3" /></Icon>,
  json: <Icon><path d="M12 3v11m0 0 4.5-4.5M12 14 7.5 9.5M4 17.5V20h16v-2.5" /></Icon>,
  print: <Icon><path d="M7 8V3.5h10V8M7 17H4.5a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H17m-10-3.5h10V21H7v-7.5Z" /></Icon>,
};

const StarIcon = ({ filled = false }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8Z" />
  </svg>
);

function InfoItem({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-ink num truncate mt-0.5" title={value ? String(value) : undefined}>{value || '—'}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <LoadingSkeleton height={64} />
      <LoadingSkeleton height={140} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2"><LoadingSkeleton height={280} /></div>
        <LoadingSkeleton height={280} />
      </div>
      <LoadingSkeleton height={160} />
    </div>
  );
}

export default function CaseDetail() {
  const t = useT();
  const trName = useCaseNames();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const c = useCase(id);
  const d = c.data || {};

  // Sibling walk — Cases/SimilarCases pass the ordered id list via nav state.
  const siblings = useMemo(() => {
    const list = location.state?.siblings;
    return Array.isArray(list) && list.length ? list.map(String) : null;
  }, [location.state]);
  const sibIndex = siblings ? siblings.indexOf(String(id)) : -1;
  const goSibling = useCallback((delta) => {
    if (!siblings || sibIndex < 0) return;
    const nextId = siblings[sibIndex + delta];
    if (!nextId) return;
    navigate({ pathname: `/cases/${nextId}`, search: location.search }, { state: { siblings } });
  }, [siblings, sibIndex, navigate, location.search]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowLeft') goSibling(-1);
      else if (e.key === 'ArrowRight') goSibling(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goSibling]);

  // Tab title mirrors the case; restored on unmount.
  useEffect(() => {
    const prev = document.title;
    return () => { document.title = prev; };
  }, []);
  useEffect(() => {
    document.title = t('cases.detail.docTitle', { no: d.crimeNo || id });
  }, [d.crimeNo, id, t]);

  // Recently-viewed trail for the explorer's Recent row.
  const loaded = !c.isLoading && !c.error && !!c.data;
  useEffect(() => {
    if (loaded) pushRecent({ id: String(d.caseMasterId ?? id), crimeNo: d.crimeNo || '' });
  }, [loaded, id, d.caseMasterId, d.crimeNo]);

  // Star state shared with the explorer via localStorage.
  const [stars, setStars] = useState(readStars);
  const starKey = String(d.caseMasterId ?? id);
  const starred = !!stars[starKey];
  const handleStar = () => {
    setStars((prev) => toggleStar(prev, starKey, { crimeNo: d.crimeNo }));
    toast.success(t(starred ? 'cases.detail.toast.starRemoved' : 'cases.detail.toast.starAdded'));
  };

  const copyNo = async () => {
    const ok = await copyText(d.crimeNo || id);
    if (ok) toast.success(t('cases.toast.copied', { no: d.crimeNo || id }));
    else toast.error(t('cases.toast.copyBlocked'));
  };
  const copyLink = async () => {
    const ok = await copyText(window.location.href);
    if (ok) toast.success(t('cases.detail.toast.linkCopied'));
    else toast.error(t('cases.toast.copyBlocked'));
  };
  const exportJson = () => {
    downloadCaseJson(d);
    toast.success(t('cases.detail.toast.jsonDownloaded'));
  };

  const countdown = useMemo(() => hearingCountdown(d.court, new Date(), t), [d.court, t]);

  // Lookup-resolved ids for pivots + the nearby-incident overlay.
  const lookups = useLookups();
  const lk = lookups.data;
  const headId = d.headName ? (lk?.crimeHeads || []).find((h) => h.headName === d.headName)?.crimeHeadId || '' : '';
  const subId = d.subHeadName ? (lk?.crimeSubHeads || []).find((s) => s.subHeadName === d.subHeadName)?.crimeSubHeadId || '' : '';
  const crimeNoParts = useMemo(() => splitCrimeNo(d.crimeNo), [d.crimeNo]);

  // Pattern-engine similar cases (GET /cases/:id/similar with client fallback).
  const similar = useSimilarCases(loaded ? d : null);
  const similarIds = useMemo(
    () => new Set((similar.data?.rows || []).map((r) => String(r.caseMasterId))),
    [similar.data],
  );

  // Same-pattern incidents within ~5 km, overlaid on the mini-map.
  const [showNearby, setShowNearby] = useState(true);
  const nearby = useNearbyIncidents({
    caseId: loaded ? String(d.caseMasterId ?? id) : '',
    lat: d.latitude,
    lng: d.longitude,
    crimeSubHeadId: subId,
    enabled: showNearby && !!subId,
  });
  const mapOthers = useMemo(() => {
    if (!showNearby) return [];
    return (nearby.data || [])
      .filter((p) => String(p.caseMasterId) !== String(d.caseMasterId ?? id))
      .slice(0, 80)
      .map((p) => ({
        id: p.caseMasterId,
        lat: p.lat,
        lng: p.lng,
        highlight: similarIds.has(String(p.caseMasterId)),
        label: t(similarIds.has(String(p.caseMasterId))
          ? 'cases.detail.nearbyMarkerSimilar'
          : 'cases.detail.nearbyMarker', { id: p.caseMasterId }),
      }));
  }, [nearby.data, showNearby, similarIds, d.caseMasterId, id, t]);
  const openOther = useCallback((o) => {
    if (o?.id) navigate({ pathname: `/cases/${o.id}`, search: location.search });
  }, [navigate, location.search]);

  const timeCtx = useMemo(() => incidentTimeContext(d.incidentFrom, t), [d.incidentFrom, t]);

  const copySections = async () => {
    const list = Array.isArray(d.sections) ? d.sections : [];
    const text = list
      .map((s) => `${s.actCode ?? ''} §${s.sectionCode ?? ''}${s.description ? ` — ${s.description}` : ''}`.trim())
      .join('\n');
    const ok = await copyText(text);
    if (ok) {
      toast.success(t(list.length > 1
        ? 'cases.detail.toast.sectionsCopied'
        : 'cases.detail.toast.sectionsCopiedOne', { n: list.length }));
    } else toast.error(t('cases.toast.copyBlocked'));
  };

  if (c.isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">{t('cases.detail.title')}</h1>
          <p className="page-subtitle num">{t('cases.detail.loading', { id })}</p>
        </div>
        <DetailSkeleton />
      </div>
    );
  }

  if (c.error) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">{t('cases.detail.title')}</h1>
        <Card>
          <EmptyState
            title={t('cases.detail.error')}
            message={c.error.message}
            action={
              <div className="flex items-center gap-2">
                <button type="button" className="btn" onClick={() => c.refetch()}>{t('common.action.retry')}</button>
                <Link to={{ pathname: '/cases', search: location.search }} className="btn">{t('cases.detail.backToCases')}</Link>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  const heinous = /hein/i.test(String(d.gravityName || ''));
  const anomalyReason = d.anomalyReason || d.anomaly_reason || d.anomalyNarrative || '';
  const incidentWindow = d.incidentFrom
    ? `${dateLabel(d.incidentFrom)}${d.incidentTo && d.incidentTo !== d.incidentFrom ? ` → ${dateLabel(d.incidentTo)}` : ''}`
    : '—';

  return (
    <div className="case-print-root space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{t('cases.detail.title')}</h1>
          <p className="page-subtitle num break-all">{d.crimeNo || t('cases.detail.caseFallback', { id })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.statusName && <Badge tone="amber">{trName('statuses', d.statusName)}</Badge>}
          {d.gravityName && <Badge tone={heinous ? 'red' : 'slate'}>{trName('gravities', d.gravityName)}</Badge>}
          {d.anomalyFlag ? <Badge tone="red" pulse>{t('cases.badge.anomaly')}</Badge> : null}
        </div>
      </div>

      {/* action bar — sibling walk on the left, tools on the right */}
      <div className="no-print flex flex-wrap items-center gap-2" role="group" aria-label={t('cases.detail.actionsAria')}>
        {siblings && siblings.length > 1 && sibIndex >= 0 && (
          <span className="inline-flex items-center gap-1.5" role="group" aria-label={t('cases.detail.walkAria')}>
            <button
              type="button"
              className="btn !py-2 sm:!py-1.5"
              disabled={sibIndex <= 0}
              onClick={() => goSibling(-1)}
              aria-label={t('cases.detail.prevAria')}
            >
              {t('cases.detail.prev')}
            </button>
            <span className="num text-xs text-muted whitespace-nowrap px-0.5" aria-live="polite">
              {t('cases.detail.position', { i: fmtInt(sibIndex + 1), n: fmtInt(siblings.length) })}
            </span>
            <button
              type="button"
              className="btn !py-2 sm:!py-1.5"
              disabled={sibIndex >= siblings.length - 1}
              onClick={() => goSibling(1)}
              aria-label={t('cases.detail.nextAria')}
            >
              {t('cases.detail.next')}
            </button>
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className={`btn !py-2 sm:!py-1.5 ${starred ? '!border-amber/60 !text-amber' : ''}`}
          onClick={handleStar}
          aria-pressed={starred}
        >
          <StarIcon filled={starred} />
          {t(starred ? 'cases.detail.starred' : 'cases.detail.star')}
        </button>
        <button type="button" className="btn !py-2 sm:!py-1.5" onClick={copyNo} aria-label={t('cases.detail.copyNoAria')}>
          {ICONS.copy}
          {t('cases.detail.copyNo')}
        </button>
        <button type="button" className="btn !py-2 sm:!py-1.5" onClick={copyLink} aria-label={t('cases.detail.linkAria')}>
          {ICONS.link}
          {t('cases.detail.link')}
        </button>
        <button type="button" className="btn !py-2 sm:!py-1.5" onClick={exportJson} aria-label={t('cases.detail.jsonAria')}>
          {ICONS.json}
          {t('cases.detail.json')}
        </button>
        <button type="button" className="btn !py-2 sm:!py-1.5" onClick={() => window.print()} aria-label={t('cases.detail.printAria')}>
          {ICONS.print}
          {t('cases.detail.print')}
        </button>
        <Link to={{ pathname: '/cases', search: location.search }} className="btn !py-2 sm:!py-1.5">{t('cases.detail.backShort')}</Link>
      </div>

      {d.anomalyFlag ? (
        <Card className="!border-signal/50">
          <div className="flex items-start gap-3">
            <PulseDot className="mt-1.5" />
            <div>
              <p className="text-sm font-medium text-signal">{t('cases.detail.anomalyTitle')}</p>
              <p className="text-xs text-muted mt-0.5">
                {anomalyReason || t('cases.detail.anomalyDefault')}
              </p>
            </div>
            <Link to="/alerts" className="btn ml-auto shrink-0 no-print">{t('cases.detail.viewAlerts')}</Link>
          </div>
        </Card>
      ) : null}

      <CrimeNoBreakdown
        crimeNo={d.crimeNo}
        caseNo={d.caseNo}
        districtName={d.districtName}
        unitName={d.unitName}
        districtLabel={trName('districts', d.districtName)}
      />

      <Card title={t('cases.detail.registration')} subtitle={t('cases.detail.registrationSub')}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <InfoItem label={t('cases.detail.registered')} value={dateLabel(d.registeredDate)} />
          <InfoItem label={t('cases.detail.category')} value={trName('categories', d.categoryName)} />
          <InfoItem label={t('cases.detail.district')} value={trName('districts', d.districtName)} />
          <InfoItem label={t('cases.detail.station')} value={d.unitName} />
          <InfoItem label={t('cases.detail.head')} value={trName('crimeHeads', d.headName)} />
          <InfoItem label={t('cases.detail.subHead')} value={trName('crimeSubHeads', d.subHeadName)} />
          <InfoItem label={t('cases.detail.infoReceived')} value={dateLabel(d.infoReceivedDate)} />
          <InfoItem label={t('cases.detail.incidentWindow')} value={incidentWindow} />
        </div>
        {timeCtx && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted" aria-label={t('cases.detail.incidentTimeAria')}>
            <span className="eyebrow">{t('cases.detail.incidentTime')}</span>
            <Badge tone={timeCtx.band === 'night' || timeCtx.band === 'late night' ? 'amber' : 'slate'}>
              {timeCtx.label}
            </Badge>
            <span className="text-[11px]">{t('cases.detail.hourBandNote')}</span>
          </p>
        )}
        {(crimeNoParts || headId) && (
          <div className="no-print mt-3 pt-3 border-t border-grid/60 flex flex-wrap items-center gap-1.5" aria-label={t('cases.detail.pivotAria')}>
            <span className="eyebrow">{t('cases.detail.pivot')}</span>
            {crimeNoParts && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?districtId=${crimeNoParts[1].text}&unitId=${crimeNoParts[2].text}`}>
                {t('cases.detail.pivotStation')}
              </Link>
            )}
            {crimeNoParts && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?districtId=${crimeNoParts[1].text}`}>
                {t('cases.detail.pivotDistrict')}
              </Link>
            )}
            {headId && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?crimeHeadId=${headId}`}>
                {t('cases.detail.pivotHead')}
              </Link>
            )}
            {headId && subId && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?crimeHeadId=${headId}&crimeSubHeadId=${subId}`}>
                {t('cases.detail.pivotSubHead')}
              </Link>
            )}
            {crimeNoParts && /^\d{4}$/.test(crimeNoParts[3].text) && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?from=${crimeNoParts[3].text}-01-01&to=${crimeNoParts[3].text}-12-31`}>
                {t('cases.detail.pivotYear', { year: crimeNoParts[3].text })}
              </Link>
            )}
          </div>
        )}
      </Card>

      <CaseLagStrip caseData={d} />

      <CaseTimeline caseData={d} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <NarrativePanel caseId={id} briefFacts={d.briefFacts} />
        </div>
        <Card
          title={t('cases.detail.location')}
          subtitle={
            Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude)) && (Number(d.latitude) !== 0 || Number(d.longitude) !== 0)
              ? `${Number(d.latitude).toFixed(4)}, ${Number(d.longitude).toFixed(4)}`
              : t('cases.detail.noCoords')
          }
          actions={subId ? (
            <label className="no-print flex min-h-[32px] cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[var(--c-amber)]"
                checked={showNearby}
                onChange={(e) => setShowNearby(e.target.checked)}
              />
              {t('cases.detail.nearbyToggle')}
              {showNearby && !nearby.isLoading && Array.isArray(nearby.data)
                ? <span className="num">({fmtInt(mapOthers.length)})</span>
                : null}
            </label>
          ) : null}
        >
          <IncidentMap
            lat={d.latitude}
            lng={d.longitude}
            label={d.crimeNo}
            height={280}
            others={mapOthers}
            onOtherClick={openOther}
            othersLabel={t('cases.detail.nearbyLegend')}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PartyList title={t('cases.detail.complainants')} people={d.complainants} tone="amber" />
        <PartyList title={t('cases.detail.victims')} people={d.victims} tone="teal" />
        <PartyList
          title={t('cases.detail.accused')}
          people={d.accused}
          tone="red"
          personAction={(p) => {
            const name = p && typeof p === 'object' ? pickValue(p, NAME_KEYS) : p;
            if (!name) return null;
            // Duplicate-suspect lens: name/alias search across the clustered
            // offender registry (cross-jurisdiction repeat-offender tracking).
            return (
              <Link
                to={`/offenders?q=${encodeURIComponent(String(name))}`}
                className="no-print inline-flex items-center gap-1 text-[11px] text-amber hover:underline"
              >
                {t('cases.detail.searchOffender')}
              </Link>
            );
          }}
        />
      </div>

      <Card
        title={t('cases.detail.sections')}
        subtitle={t('cases.detail.sectionsSub')}
        padded={false}
        actions={Array.isArray(d.sections) && d.sections.length ? (
          <button
            type="button"
            className="btn !py-1 !px-2 text-xs no-print"
            onClick={copySections}
            aria-label={t('cases.detail.copyListAria')}
          >
            {t('cases.detail.copyList')}
          </button>
        ) : null}
      >
        {Array.isArray(d.sections) && d.sections.length ? (
          <DataTable
            dense
            columns={[
              { key: 'actCode', label: t('cases.detail.act'), width: 140, className: 'font-medium' },
              { key: 'sectionCode', label: t('cases.detail.section'), width: 110 },
              { key: 'description', label: t('cases.detail.description') },
            ]}
            rows={d.sections}
            rowKey={(r, i) => `${r.actCode}-${r.sectionCode}-${i}`}
          />
        ) : (
          <EmptyState compact title={t('cases.detail.noSections')} message={t('cases.detail.noSectionsMsg')} />
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <PartyList
          title={t('cases.detail.arrests')}
          people={d.arrests}
          tone="amber"
          fields={ARREST_FIELDS}
          emptyMessage={t('cases.detail.noArrests')}
        />
        <KeyValuePanel
          title={t('cases.detail.chargesheet')}
          data={d.chargesheet}
          rows={CHARGESHEET_ROWS}
          emptyMessage={t('cases.detail.noChargesheet')}
        />
        <KeyValuePanel
          title={t('cases.detail.io')}
          data={d.io}
          rows={IO_ROWS}
          emptyMessage={t('cases.detail.noIo')}
        />
        <KeyValuePanel
          title={t('cases.detail.court')}
          data={d.court}
          rows={COURT_ROWS}
          emptyMessage={t('cases.detail.noCourt')}
          actions={countdown ? <Badge tone={countdown.tone}>{t('cases.detail.hearing', { when: countdown.label })}</Badge> : null}
        />
      </div>

      <SimilarCases caseData={d} similar={similar} />
    </div>
  );
}
