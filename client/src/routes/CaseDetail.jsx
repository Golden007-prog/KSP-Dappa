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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday + clock + day-part band from the incident timestamp — the list
 * rows are date-only, so hour-of-day context lives here on the detail. */
function incidentTimeContext(iso) {
  if (!iso) return null;
  const dt = new Date(String(iso).replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return null;
  const h = dt.getHours();
  const band = h < 6 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'late night';
  const hm = `${String(h).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  return { label: `${WEEKDAYS[dt.getDay()]} ${hm} · ${band}`, band };
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
    document.title = `Case ${d.crimeNo || id} · DAPPA`;
  }, [d.crimeNo, id]);

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
    toast.success(starred ? 'Removed from starred cases' : 'Added to starred cases');
  };

  const copyNo = async () => {
    const ok = await copyText(d.crimeNo || id);
    if (ok) toast.success(`CrimeNo ${d.crimeNo || id} copied`);
    else toast.error('Could not copy — clipboard is blocked in this browser.');
  };
  const copyLink = async () => {
    const ok = await copyText(window.location.href);
    if (ok) toast.success('Shareable link copied');
    else toast.error('Could not copy — clipboard is blocked in this browser.');
  };
  const exportJson = () => {
    downloadCaseJson(d);
    toast.success('Case JSON downloaded (whitelisted fields only)');
  };

  const countdown = useMemo(() => hearingCountdown(d.court), [d.court]);

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
        label: `case ${p.caseMasterId}${similarIds.has(String(p.caseMasterId)) ? ' · similar match' : ''} — tap to open`,
      }));
  }, [nearby.data, showNearby, similarIds, d.caseMasterId, id]);
  const openOther = useCallback((o) => {
    if (o?.id) navigate({ pathname: `/cases/${o.id}`, search: location.search });
  }, [navigate, location.search]);

  const timeCtx = useMemo(() => incidentTimeContext(d.incidentFrom), [d.incidentFrom]);

  const copySections = async () => {
    const list = Array.isArray(d.sections) ? d.sections : [];
    const text = list
      .map((s) => `${s.actCode ?? ''} §${s.sectionCode ?? ''}${s.description ? ` — ${s.description}` : ''}`.trim())
      .join('\n');
    const ok = await copyText(text);
    if (ok) toast.success(`Copied ${list.length} section${list.length > 1 ? 's' : ''} (chargesheet-ready)`);
    else toast.error('Could not copy — clipboard is blocked in this browser.');
  };

  if (c.isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="page-title">FIR Detail</h1>
          <p className="page-subtitle num">loading case {id}…</p>
        </div>
        <DetailSkeleton />
      </div>
    );
  }

  if (c.error) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">FIR Detail</h1>
        <Card>
          <EmptyState
            title="Couldn't load this case"
            message={c.error.message}
            action={
              <div className="flex items-center gap-2">
                <button type="button" className="btn" onClick={() => c.refetch()}>Retry</button>
                <Link to={{ pathname: '/cases', search: location.search }} className="btn">← Back to cases</Link>
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
          <h1 className="page-title">FIR Detail</h1>
          <p className="page-subtitle num break-all">{d.crimeNo || `case ${id}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.statusName && <Badge tone="amber">{d.statusName}</Badge>}
          {d.gravityName && <Badge tone={heinous ? 'red' : 'slate'}>{d.gravityName}</Badge>}
          {d.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null}
        </div>
      </div>

      {/* action bar — sibling walk on the left, tools on the right */}
      <div className="no-print flex flex-wrap items-center gap-2" role="group" aria-label="Case actions">
        {siblings && siblings.length > 1 && sibIndex >= 0 && (
          <span className="inline-flex items-center gap-1.5" role="group" aria-label="Filtered-list navigation">
            <button
              type="button"
              className="btn !py-2 sm:!py-1.5"
              disabled={sibIndex <= 0}
              onClick={() => goSibling(-1)}
              aria-label="Previous case in the filtered list (left arrow key)"
            >
              ‹ Prev
            </button>
            <span className="num text-xs text-muted whitespace-nowrap px-0.5" aria-live="polite">
              {fmtInt(sibIndex + 1)} of {fmtInt(siblings.length)}
            </span>
            <button
              type="button"
              className="btn !py-2 sm:!py-1.5"
              disabled={sibIndex >= siblings.length - 1}
              onClick={() => goSibling(1)}
              aria-label="Next case in the filtered list (right arrow key)"
            >
              Next ›
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
          {starred ? 'Starred' : 'Star'}
        </button>
        <button type="button" className="btn !py-2 sm:!py-1.5" onClick={copyNo} aria-label="Copy the CrimeNo">
          {ICONS.copy}
          Copy no
        </button>
        <button type="button" className="btn !py-2 sm:!py-1.5" onClick={copyLink} aria-label="Copy a shareable link to this case">
          {ICONS.link}
          Link
        </button>
        <button type="button" className="btn !py-2 sm:!py-1.5" onClick={exportJson} aria-label="Download this case as JSON (whitelisted fields)">
          {ICONS.json}
          JSON
        </button>
        <button type="button" className="btn !py-2 sm:!py-1.5" onClick={() => window.print()} aria-label="Print this FIR">
          {ICONS.print}
          Print
        </button>
        <Link to={{ pathname: '/cases', search: location.search }} className="btn !py-2 sm:!py-1.5">← Cases</Link>
      </div>

      {d.anomalyFlag ? (
        <Card className="!border-signal/50">
          <div className="flex items-start gap-3">
            <PulseDot className="mt-1.5" />
            <div>
              <p className="text-sm font-medium text-signal">Flagged as an anomaly</p>
              <p className="text-xs text-muted mt-0.5">
                {anomalyReason || 'Statistical outlier for its station-month baseline (nightly z-score pass). Review the alert feed for the matching district spike.'}
              </p>
            </div>
            <Link to="/alerts" className="btn ml-auto shrink-0 no-print">View alerts →</Link>
          </div>
        </Card>
      ) : null}

      <CrimeNoBreakdown
        crimeNo={d.crimeNo}
        caseNo={d.caseNo}
        districtName={d.districtName}
        unitName={d.unitName}
      />

      <Card title="Registration" subtitle="Core FIR attributes">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          <InfoItem label="Registered" value={dateLabel(d.registeredDate)} />
          <InfoItem label="Category" value={d.categoryName} />
          <InfoItem label="District" value={d.districtName} />
          <InfoItem label="Station" value={d.unitName} />
          <InfoItem label="Crime head" value={d.headName} />
          <InfoItem label="Subhead" value={d.subHeadName} />
          <InfoItem label="Info received" value={dateLabel(d.infoReceivedDate)} />
          <InfoItem label="Incident window" value={incidentWindow} />
        </div>
        {timeCtx && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Incident time context">
            <span className="eyebrow">Incident time</span>
            <Badge tone={timeCtx.band === 'night' || timeCtx.band === 'late night' ? 'amber' : 'slate'}>
              {timeCtx.label}
            </Badge>
            <span className="text-[11px]">hour band feeds the hotspot clustering &amp; similar-case scoring</span>
          </p>
        )}
        {(crimeNoParts || headId) && (
          <div className="no-print mt-3 pt-3 border-t border-grid/60 flex flex-wrap items-center gap-1.5" aria-label="Pivot to explorer">
            <span className="eyebrow">Pivot</span>
            {crimeNoParts && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?districtId=${crimeNoParts[1].text}&unitId=${crimeNoParts[2].text}`}>
                This station's cases
              </Link>
            )}
            {crimeNoParts && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?districtId=${crimeNoParts[1].text}`}>
                This district's cases
              </Link>
            )}
            {headId && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?crimeHeadId=${headId}`}>
                Same crime head
              </Link>
            )}
            {headId && subId && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?crimeHeadId=${headId}&crimeSubHeadId=${subId}`}>
                Same subhead
              </Link>
            )}
            {crimeNoParts && /^\d{4}$/.test(crimeNoParts[3].text) && (
              <Link className="chip !py-1 hover:border-amber/60 hover:text-amber transition-colors" to={`/cases?from=${crimeNoParts[3].text}-01-01&to=${crimeNoParts[3].text}-12-31`}>
                Year {crimeNoParts[3].text}
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
          title="Incident location"
          subtitle={
            Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude)) && (Number(d.latitude) !== 0 || Number(d.longitude) !== 0)
              ? `${Number(d.latitude).toFixed(4)}, ${Number(d.longitude).toFixed(4)}`
              : 'No coordinates recorded'
          }
          actions={subId ? (
            <label className="no-print flex min-h-[32px] cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[var(--c-amber)]"
                checked={showNearby}
                onChange={(e) => setShowNearby(e.target.checked)}
              />
              same-pattern nearby
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
            othersLabel="same-pattern nearby (~5 km)"
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PartyList title="Complainants" people={d.complainants} tone="amber" />
        <PartyList title="Victims" people={d.victims} tone="teal" />
        <PartyList
          title="Accused"
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
                Search offender registry →
              </Link>
            );
          }}
        />
      </div>

      <Card
        title="Sections invoked"
        subtitle="Acts and sections attached to the FIR"
        padded={false}
        actions={Array.isArray(d.sections) && d.sections.length ? (
          <button
            type="button"
            className="btn !py-1 !px-2 text-xs no-print"
            onClick={copySections}
            aria-label="Copy the sections list as text"
          >
            Copy list
          </button>
        ) : null}
      >
        {Array.isArray(d.sections) && d.sections.length ? (
          <DataTable
            dense
            columns={[
              { key: 'actCode', label: 'Act', width: 140, className: 'font-medium' },
              { key: 'sectionCode', label: 'Section', width: 110 },
              { key: 'description', label: 'Description' },
            ]}
            rows={d.sections}
            rowKey={(r, i) => `${r.actCode}-${r.sectionCode}-${i}`}
          />
        ) : (
          <EmptyState compact title="No sections" message="No act/section rows joined for this case." />
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <PartyList
          title="Arrests"
          people={d.arrests}
          tone="amber"
          fields={ARREST_FIELDS}
          emptyMessage="No arrests recorded yet."
        />
        <KeyValuePanel
          title="Chargesheet"
          data={d.chargesheet}
          rows={CHARGESHEET_ROWS}
          emptyMessage="No chargesheet filed yet."
        />
        <KeyValuePanel
          title="Investigating officer"
          data={d.io}
          rows={IO_ROWS}
          emptyMessage="No IO assignment on file."
        />
        <KeyValuePanel
          title="Court"
          data={d.court}
          rows={COURT_ROWS}
          emptyMessage="Not yet before a court."
          actions={countdown ? <Badge tone={countdown.tone}>hearing {countdown.label}</Badge> : null}
        />
      </div>

      <SimilarCases caseData={d} similar={similar} />
    </div>
  );
}
