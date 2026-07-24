// Investigation-lag KPI strip — three client-computed intervals from the FIR
// joins: incident → registration, registration → first arrest, registration →
// chargesheet. Amber accent past each threshold (7d report lag; 30d arrest;
// 90d chargesheet — the statutory filing window), teal when inside it.
import { differenceInCalendarDays } from 'date-fns';
import KpiTile from '../../components/KpiTile.jsx';
import { toDate, pickDate, firstArrest, CS_DATE_KEYS } from './caseDates.js';

const gap = (fromDate, toDateVal) => {
  if (!fromDate || !toDateVal) return null;
  const days = differenceInCalendarDays(toDateVal, fromDate);
  return Number.isFinite(days) && days >= 0 ? days : null;
};

export default function CaseLagStrip({ caseData }) {
  const d = caseData || {};
  const registered = toDate(d.registeredDate);
  if (!registered) return null;

  const incident = toDate(d.incidentFrom);
  const arrest = firstArrest(d.arrests);
  const cs = pickDate(d.chargesheet, CS_DATE_KEYS);

  const reportLag = gap(incident, registered);
  const arrestLag = gap(registered, arrest?.date);
  const csLag = gap(registered, cs?.date);

  const tiles = [
    {
      label: 'Report lag',
      days: reportLag,
      warn: 7,
      hint: reportLag === null ? 'incident date not recorded' : 'incident → FIR registration',
    },
    {
      label: 'Arrest lag',
      days: arrestLag,
      warn: 30,
      hint: arrestLag === null ? 'no arrest recorded yet' : 'FIR → first arrest',
    },
    {
      label: 'Chargesheet lag',
      days: csLag,
      warn: 90,
      hint: csLag === null ? 'no chargesheet filed yet' : 'FIR → chargesheet (90d statutory window)',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Investigation lag indicators">
      {tiles.map((t) => (
        <KpiTile
          key={t.label}
          label={t.label}
          value={t.days === null ? '—' : `${t.days}d`}
          accent={t.days !== null && t.days > t.warn ? 'amber' : 'teal'}
          hint={t.days !== null && t.days > t.warn ? `${t.hint} · over ${t.warn}d` : t.hint}
        />
      ))}
    </div>
  );
}
