// /cases/:id — FIR detail: CrimeNo digit anatomy, parties, sections, arrest /
// chargesheet / IO / court panels, narrative insights (Zia or local fallback),
// anomaly badge with reason, and a mini-map of the incident location.
import { useParams, Link } from 'react-router-dom';
import { useCase } from '../lib/api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import DataTable from '../components/DataTable.jsx';
import PulseDot from '../components/PulseDot.jsx';
import { dateLabel } from '../lib/format.js';
import CrimeNoBreakdown from './cases/CrimeNoBreakdown.jsx';
import PartyList, { ARREST_FIELDS } from './cases/PartyList.jsx';
import KeyValuePanel from './cases/KeyValuePanel.jsx';
import NarrativePanel from './cases/NarrativePanel.jsx';
import IncidentMap from './cases/IncidentMap.jsx';

const CHARGESHEET_ROWS = [
  { label: 'Chargesheet no', keys: ['chargesheetNo', 'chargeSheetNo', 'csNo', 'number'] },
  { label: 'Filed on', keys: ['chargesheetDate', 'chargeSheetDate', 'csDate', 'filedDate', 'date'], fmt: 'date' },
  { label: 'Final report', keys: ['finalReportTypeName', 'finalReportType', 'reportType', 'type'] },
  { label: 'Court', keys: ['courtName'] },
  { label: 'Status', keys: ['statusName', 'status'] },
];

const IO_ROWS = [
  { label: 'Name', keys: ['name', 'ioName', 'officerName'] },
  { label: 'Rank', keys: ['rank', 'rankName', 'designation'] },
  { label: 'Badge / KGID', keys: ['badgeNo', 'kgid', 'kgidNo'] },
  { label: 'Unit', keys: ['unitName', 'station', 'stationName'] },
  { label: 'Assigned on', keys: ['assignedDate', 'assignedOn', 'fromDate'], fmt: 'date' },
];

const COURT_ROWS = [
  { label: 'Court', keys: ['courtName', 'name'] },
  { label: 'Type', keys: ['courtTypeName', 'courtType', 'type'] },
  { label: 'Court case no', keys: ['courtCaseNo', 'ccNo', 'scNo', 'caseNo'] },
  { label: 'Stage', keys: ['caseStage', 'stage', 'stageName'] },
  { label: 'Next hearing', keys: ['nextHearingDate', 'hearingDate', 'nextDate'], fmt: 'date' },
  { label: 'Verdict', keys: ['verdict', 'judgement', 'outcome'] },
];

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
  const c = useCase(id);
  const d = c.data || {};

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
                <Link to="/cases" className="btn">← Back to cases</Link>
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
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">FIR Detail</h1>
          <p className="page-subtitle num">{d.crimeNo || `case ${id}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.statusName && <Badge tone="amber">{d.statusName}</Badge>}
          {d.gravityName && <Badge tone={heinous ? 'red' : 'slate'}>{d.gravityName}</Badge>}
          {d.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null}
          <Link to="/cases" className="btn">← Back to cases</Link>
        </div>
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
            <Link to="/alerts" className="btn ml-auto shrink-0">View alerts →</Link>
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
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <InfoItem label="Registered" value={dateLabel(d.registeredDate)} />
          <InfoItem label="District" value={d.districtName} />
          <InfoItem label="Station" value={d.unitName} />
          <InfoItem label="Crime head" value={d.headName} />
          <InfoItem label="Subhead" value={d.subHeadName} />
          <InfoItem label="Incident window" value={incidentWindow} />
        </div>
      </Card>

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
        >
          <IncidentMap lat={d.latitude} lng={d.longitude} label={d.crimeNo} height={280} />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PartyList title="Complainants" people={d.complainants} tone="amber" />
        <PartyList title="Victims" people={d.victims} tone="teal" />
        <PartyList title="Accused" people={d.accused} tone="red" />
      </div>

      <Card title="Sections invoked" subtitle="Acts and sections attached to the FIR" padded={false}>
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
        />
      </div>
    </div>
  );
}
