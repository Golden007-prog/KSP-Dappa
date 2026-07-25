// Side-by-side comparison of 2–3 selected cases. An attribute matrix where any
// row whose values differ across the selection is amber-highlighted, headed by
// a plain-language verdict line ("Same district · different crime heads ·
// registered within 12 days"). Each column links straight into the detail with
// the compare set carried as prev/next siblings. Horizontal scroll inside the
// sheet keeps 360px phones honest.
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { CrimeNoInline } from './CrimeNoBreakdown.jsx';
import { toDate } from './caseDates.js';

// `nameKind` marks the columns whose API value has a translation table.
const ATTRS = [
  { key: 'registeredDate', labelKey: 'cases.col.registered', fmt: (v) => dateLabel(v) },
  { key: 'ageDays', labelKey: 'cases.col.age', fmt: (v) => (Number.isFinite(v) ? `${fmtInt(v)}d` : '—') },
  { key: 'districtName', labelKey: 'cases.col.district', nameKind: 'districts' },
  { key: 'unitName', labelKey: 'cases.col.station' },
  { key: 'headName', labelKey: 'cases.col.head', nameKind: 'crimeHeads' },
  { key: 'subHeadName', labelKey: 'cases.col.subHead', nameKind: 'crimeSubHeads' },
  { key: 'statusName', labelKey: 'cases.col.status', nameKind: 'statuses' },
  { key: 'gravityName', labelKey: 'cases.col.gravity', nameKind: 'gravities' },
  { key: 'anomalyFlag', labelKey: 'cases.col.anomaly', flag: true },
];

function verdict(items, t) {
  if (items.length < 2) return '';
  const same = (key) => new Set(items.map((it) => String(it[key] ?? ''))).size === 1;
  const parts = [];
  parts.push(t(same('unitName') ? 'cases.compare.sameStation'
    : same('districtName') ? 'cases.compare.sameDistrict' : 'cases.compare.diffDistricts'));
  parts.push(t(same('subHeadName') ? 'cases.compare.samePattern'
    : same('headName') ? 'cases.compare.sameHead' : 'cases.compare.diffHeads'));
  const dates = items.map((it) => toDate(it.registeredDate)).filter(Boolean);
  if (dates.length === items.length) {
    const span = Math.round(Math.abs(Math.max(...dates) - Math.min(...dates)) / 86400000);
    parts.push(span === 0
      ? t('cases.compare.sameDay')
      : t(span > 1 ? 'cases.compare.withinDays' : 'cases.compare.withinDayOne', { n: fmtInt(span) }));
  }
  const anomalies = items.filter((it) => it.anomalyFlag).length;
  if (anomalies) parts.push(t('cases.compare.anomalyCount', { n: anomalies }));
  return parts.join(' · ');
}

export default function CompareSheet({ open, onClose, items, onOpenCase }) {
  const t = useT();
  const trName = useCaseNames();
  const diffKeys = new Set(
    ATTRS.filter((a) => new Set(items.map((it) => String(it[a.key] ?? ''))).size > 1).map((a) => a.key),
  );

  return (
    <Sheet open={open} onClose={onClose} title={t('cases.compare.title', { n: items.length })} className="md:w-[34rem]">
      <div className="space-y-3 px-1 pb-1">
        {items.length >= 2 && (
          <p className="text-xs text-muted">{verdict(items, t)}</p>
        )}
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[24rem] text-sm border-collapse">
            <thead>
              <tr className="border-b border-grid">
                <th scope="col" className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted px-2 py-2 w-24">{t('cases.col.field')}</th>
                {items.map((it) => (
                  <th key={it.caseMasterId} scope="col" className="text-left px-2 py-2 align-top">
                    <div className="text-xs break-all"><CrimeNoInline crimeNo={it.crimeNo} /></div>
                    <button
                      type="button"
                      className="btn !py-1 !px-2 text-[11px] mt-1.5"
                      onClick={() => onOpenCase(it)}
                    >
                      {t('cases.compare.openCase')}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ATTRS.map((a) => {
                const differs = diffKeys.has(a.key);
                return (
                  <tr key={a.key} className={`border-b border-grid/40 ${differs ? 'bg-amber/5' : ''}`}>
                    <th scope="row" className="text-left text-[11px] font-medium text-muted px-2 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        {differs && <span className="h-1.5 w-1.5 rounded-full bg-amber shrink-0" aria-hidden="true" />}
                        {t(a.labelKey)}
                      </span>
                    </th>
                    {items.map((it) => {
                      const v = it[a.key];
                      let text;
                      if (a.flag) text = v ? t('cases.compare.flagged') : t('cases.compare.notFlagged');
                      else if (a.fmt) text = a.fmt(v);
                      else if (v === undefined || v === null || v === '') text = '—';
                      else text = a.nameKind ? trName(a.nameKind, v) : String(v);
                      return (
                        <td key={it.caseMasterId} className={`px-2 py-2 num break-words ${differs ? 'text-ink' : 'text-muted'}`}>
                          {a.flag && v
                            ? <Badge tone="red" pulse>{t('cases.badge.anomaly')}</Badge>
                            : text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted">{t('cases.compare.footnote')}</p>
      </div>
    </Sheet>
  );
}
