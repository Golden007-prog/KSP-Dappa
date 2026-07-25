// Row quick-look — a peek sheet showing everything the list row knows about a
// case (decoded CrimeNo segments, all attributes, age, anomaly) without leaving
// the explorer, plus the same quick actions (star, compare, copy, open full
// detail). Opened from the eye button in the row's action cluster.
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { splitCrimeNo, CrimeNoInline } from './CrimeNoBreakdown.jsx';

// `nameKind` marks the rows whose API value has a translation table.
const ROWS = [
  { key: 'registeredDate', labelKey: 'cases.col.registered', fmt: (v) => dateLabel(v) },
  { key: 'ageDays', labelKey: 'cases.col.age', age: true },
  { key: 'caseNo', labelKey: 'cases.col.caseNo' },
  { key: 'districtName', labelKey: 'cases.col.district', nameKind: 'districts' },
  { key: 'unitName', labelKey: 'cases.col.station' },
  { key: 'headName', labelKey: 'cases.col.head', nameKind: 'crimeHeads' },
  { key: 'subHeadName', labelKey: 'cases.col.subHead', nameKind: 'crimeSubHeads' },
  { key: 'statusName', labelKey: 'cases.col.status', nameKind: 'statuses' },
  { key: 'gravityName', labelKey: 'cases.col.gravity', nameKind: 'gravities' },
];

export default function PeekSheet({ row, onClose, starred, onToggleStar, inCompare, onToggleCompare, onCopy, onOpen }) {
  const t = useT();
  const trName = useCaseNames();
  const open = !!row;
  const r = row || {};
  const parts = splitCrimeNo(r.crimeNo);

  return (
    <Sheet open={open} onClose={onClose} title={t('cases.peek.title')}>
      {open && (
        <div className="space-y-3 px-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm break-all"><CrimeNoInline crimeNo={r.crimeNo} /></span>
            {r.anomalyFlag ? <Badge tone="red" pulse>{t('cases.badge.anomaly')}</Badge> : null}
            {/hein/i.test(String(r.gravityName || '')) && <Badge tone="red">{t('cases.badge.heinous')}</Badge>}
          </div>

          {parts && (
            <div className="flex flex-wrap gap-1.5" aria-label={t('cases.peek.segmentsAria')}>
              {parts.map((p) => (
                <span key={p.key} className="chip !py-1 num">
                  <span className="text-[10px] uppercase tracking-wide text-muted">{t(p.labelKey)}</span>
                  <span style={{ color: p.cssColor }}>{p.text}</span>
                </span>
              ))}
            </div>
          )}

          <dl className="space-y-1.5">
            {ROWS.map((a) => {
              const v = r[a.key];
              let text;
              if (a.age) text = Number.isFinite(v) ? t('cases.peek.ageDays', { n: fmtInt(v) }) : '—';
              else if (a.fmt) text = a.fmt(v);
              else if (v === undefined || v === null || v === '') text = '—';
              else text = a.nameKind ? trName(a.nameKind, v) : String(v);
              return (
                <div key={a.key} className="flex items-start justify-between gap-3 text-sm">
                  <dt className="text-muted shrink-0 text-xs pt-0.5">{t(a.labelKey)}</dt>
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
              {starred ? t('cases.peek.starred') : t('cases.peek.star')}
            </button>
            <button
              type="button"
              className={`btn !py-2 text-xs ${inCompare ? '!border-amber/60 !text-amber' : ''}`}
              onClick={onToggleCompare}
              aria-pressed={inCompare}
            >
              {inCompare ? t('cases.peek.inCompare') : t('cases.peek.addCompare')}
            </button>
            <button type="button" className="btn !py-2 text-xs" onClick={onCopy}>{t('cases.peek.copyNo')}</button>
            <span className="flex-1" />
            <button type="button" className="btn-primary !py-2 text-xs" onClick={onOpen}>{t('cases.peek.fullDetail')}</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
