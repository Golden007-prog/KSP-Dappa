// Investigation-lag KPI strip — three client-computed intervals from the FIR
// joins: incident → registration, registration → first arrest, registration →
// chargesheet. Amber accent past each threshold (7d report lag; 30d arrest;
// 90d chargesheet — the statutory filing window), teal when inside it.
import { differenceInCalendarDays } from 'date-fns';
import KpiTile from '../../components/KpiTile.jsx';
import { useT } from '../../lib/i18n.jsx';
import { toDate, pickDate, firstArrest, CS_DATE_KEYS } from './caseDates.js';

const gap = (fromDate, toDateVal) => {
  if (!fromDate || !toDateVal) return null;
  const days = differenceInCalendarDays(toDateVal, fromDate);
  return Number.isFinite(days) && days >= 0 ? days : null;
};

export default function CaseLagStrip({ caseData }) {
  const t = useT();
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
      key: 'report',
      label: t('cases.lag.report'),
      days: reportLag,
      warn: 7,
      hint: reportLag === null ? t('cases.lag.reportNone') : t('cases.lag.reportHint'),
    },
    {
      key: 'arrest',
      label: t('cases.lag.arrest'),
      days: arrestLag,
      warn: 30,
      hint: arrestLag === null ? t('cases.lag.arrestNone') : t('cases.lag.arrestHint'),
    },
    {
      key: 'chargesheet',
      label: t('cases.lag.chargesheet'),
      days: csLag,
      warn: 90,
      hint: csLag === null ? t('cases.lag.chargesheetNone') : t('cases.lag.chargesheetHint'),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label={t('cases.lag.aria')}>
      {tiles.map((tile) => (
        <KpiTile
          key={tile.key}
          label={tile.label}
          value={tile.days === null ? '—' : `${tile.days}d`}
          accent={tile.days !== null && tile.days > tile.warn ? 'amber' : 'teal'}
          hint={tile.days !== null && tile.days > tile.warn
            ? t('cases.lag.over', { hint: tile.hint, d: tile.warn })
            : tile.hint}
        />
      ))}
    </div>
  );
}
