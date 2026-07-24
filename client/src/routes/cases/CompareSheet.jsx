// Side-by-side comparison of 2–3 selected cases. An attribute matrix where any
// row whose values differ across the selection is amber-highlighted, headed by
// a plain-language verdict line ("Same district · different crime heads ·
// registered within 12 days"). Each column links straight into the detail with
// the compare set carried as prev/next siblings. Horizontal scroll inside the
// sheet keeps 360px phones honest.
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { CrimeNoInline } from './CrimeNoBreakdown.jsx';
import { toDate } from './caseDates.js';

const ATTRS = [
  { key: 'registeredDate', label: 'Registered', fmt: (v) => dateLabel(v) },
  { key: 'ageDays', label: 'Age', fmt: (v) => (Number.isFinite(v) ? `${fmtInt(v)}d` : '—') },
  { key: 'districtName', label: 'District' },
  { key: 'unitName', label: 'Station' },
  { key: 'headName', label: 'Crime head' },
  { key: 'subHeadName', label: 'Subhead' },
  { key: 'statusName', label: 'Status' },
  { key: 'gravityName', label: 'Gravity' },
  { key: 'anomalyFlag', label: 'Anomaly', fmt: (v) => (v ? 'flagged' : 'no') },
];

function verdict(items) {
  if (items.length < 2) return '';
  const same = (key) => new Set(items.map((it) => String(it[key] ?? ''))).size === 1;
  const parts = [];
  parts.push(same('unitName') ? 'Same station' : same('districtName') ? 'Same district' : 'Different districts');
  parts.push(same('subHeadName') ? 'same crime pattern' : same('headName') ? 'same crime head' : 'different crime heads');
  const dates = items.map((it) => toDate(it.registeredDate)).filter(Boolean);
  if (dates.length === items.length) {
    const span = Math.round(Math.abs(Math.max(...dates) - Math.min(...dates)) / 86400000);
    parts.push(span === 0 ? 'registered the same day' : `registered within ${fmtInt(span)} day${span > 1 ? 's' : ''}`);
  }
  const anomalies = items.filter((it) => it.anomalyFlag).length;
  if (anomalies) parts.push(`${anomalies} anomaly-flagged`);
  return parts.join(' · ');
}

export default function CompareSheet({ open, onClose, items, onOpenCase }) {
  const diffKeys = new Set(
    ATTRS.filter((a) => new Set(items.map((it) => String(it[a.key] ?? ''))).size > 1).map((a) => a.key),
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Compare ${items.length} cases`} className="md:w-[34rem]">
      <div className="space-y-3 px-1 pb-1">
        {items.length >= 2 && (
          <p className="text-xs text-muted">{verdict(items)}</p>
        )}
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[24rem] text-sm border-collapse">
            <thead>
              <tr className="border-b border-grid">
                <th scope="col" className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted px-2 py-2 w-24">Field</th>
                {items.map((it) => (
                  <th key={it.caseMasterId} scope="col" className="text-left px-2 py-2 align-top">
                    <div className="text-xs break-all"><CrimeNoInline crimeNo={it.crimeNo} /></div>
                    <button
                      type="button"
                      className="btn !py-1 !px-2 text-[11px] mt-1.5"
                      onClick={() => onOpenCase(it)}
                    >
                      Open →
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
                        {a.label}
                      </span>
                    </th>
                    {items.map((it) => {
                      const v = it[a.key];
                      const text = a.fmt ? a.fmt(v) : (v === undefined || v === null || v === '' ? '—' : String(v));
                      return (
                        <td key={it.caseMasterId} className={`px-2 py-2 num break-words ${differs ? 'text-ink' : 'text-muted'}`}>
                          {a.key === 'anomalyFlag' && v
                            ? <Badge tone="red" pulse>anomaly</Badge>
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
        <p className="text-[10px] text-muted">Amber-dotted rows differ across the selection. The compare set rides as prev/next siblings when you open a case.</p>
      </div>
    </Sheet>
  );
}
