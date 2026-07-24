// Row quick-look — a peek sheet showing everything the list row knows about a
// case (decoded CrimeNo segments, all attributes, age, anomaly) without leaving
// the explorer, plus the same quick actions (star, compare, copy, open full
// detail). Opened from the eye button in the row's action cluster.
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { splitCrimeNo, CrimeNoInline } from './CrimeNoBreakdown.jsx';

const ROWS = [
  { key: 'registeredDate', label: 'Registered', fmt: (v) => dateLabel(v) },
  { key: 'ageDays', label: 'Age', fmt: (v) => (Number.isFinite(v) ? `${fmtInt(v)} days` : '—') },
  { key: 'caseNo', label: 'Case no' },
  { key: 'districtName', label: 'District' },
  { key: 'unitName', label: 'Station' },
  { key: 'headName', label: 'Crime head' },
  { key: 'subHeadName', label: 'Subhead' },
  { key: 'statusName', label: 'Status' },
  { key: 'gravityName', label: 'Gravity' },
];

export default function PeekSheet({ row, onClose, starred, onToggleStar, inCompare, onToggleCompare, onCopy, onOpen }) {
  const open = !!row;
  const r = row || {};
  const parts = splitCrimeNo(r.crimeNo);

  return (
    <Sheet open={open} onClose={onClose} title="Case quick-look">
      {open && (
        <div className="space-y-3 px-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm break-all"><CrimeNoInline crimeNo={r.crimeNo} /></span>
            {r.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null}
            {/hein/i.test(String(r.gravityName || '')) && <Badge tone="red">heinous</Badge>}
          </div>

          {parts && (
            <div className="flex flex-wrap gap-1.5" aria-label="CrimeNo segments">
              {parts.map((p) => (
                <span key={p.key} className="chip !py-1 num">
                  <span className="text-[10px] uppercase tracking-wide text-muted">{p.label}</span>
                  <span style={{ color: p.cssColor }}>{p.text}</span>
                </span>
              ))}
            </div>
          )}

          <dl className="space-y-1.5">
            {ROWS.map((a) => {
              const v = r[a.key];
              const text = a.fmt ? a.fmt(v) : (v === undefined || v === null || v === '' ? '—' : String(v));
              return (
                <div key={a.key} className="flex items-start justify-between gap-3 text-sm">
                  <dt className="text-muted shrink-0 text-xs pt-0.5">{a.label}</dt>
                  <dd className="text-ink text-right num break-words min-w-0">{text}</dd>
                </div>
              );
            })}
          </dl>

          <div className="flex flex-wrap items-center gap-2 border-t border-grid/60 pt-3">
            <button
              type="button"
              className={`btn !py-2 text-xs ${starred ? '!border-amber/60 !text-amber' : ''}`}
              onClick={onToggleStar}
              aria-pressed={starred}
            >
              {starred ? '★ Starred' : '☆ Star'}
            </button>
            <button
              type="button"
              className={`btn !py-2 text-xs ${inCompare ? '!border-amber/60 !text-amber' : ''}`}
              onClick={onToggleCompare}
              aria-pressed={inCompare}
            >
              {inCompare ? 'In compare ✓' : '+ Compare'}
            </button>
            <button type="button" className="btn !py-2 text-xs" onClick={onCopy}>Copy no</button>
            <span className="flex-1" />
            <button type="button" className="btn-primary !py-2 text-xs" onClick={onOpen}>Full detail →</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
