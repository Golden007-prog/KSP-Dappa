// Offender 360 case timeline — sorted most-recent-first client-side (the
// subtitle promises it, so we enforce it rather than trusting API order), with
// client-side status + district + crime-head chip filters, year group headers,
// and dormancy markers flagging gaps of 12+ months between consecutive cases.
// CrimeNo rows without a caseMasterId render as plain text (no dead links).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../../components/EmptyState.jsx';
import { unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt, dateLabel } from '../../lib/format.js';
import { OutcomeBadge } from './common.jsx';

/** CrimeNo = [cat 1][district 4][unit 4][year 4][serial 5] → district unit code. */
function districtCodeFromCrimeNo(crimeNo) {
  const cn = String(crimeNo || '');
  const code = cn.slice(1, 5);
  return cn.length >= 10 && /^\d{4}$/.test(code) ? code : null;
}

function districtNameOf(t) {
  const code = districtCodeFromCrimeNo(t?.crimeNo);
  return code ? (unitInfo(code)?.name || code) : '';
}

function FilterChips({ label, options, value, onChange }) {
  if (options.length < 2) return null;
  return (
    <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible py-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">{label}</span>
      {options.map(({ id, count }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            className={`chip !py-1 min-h-[36px] shrink-0 transition-colors hover:border-amber/50 ${active ? '!border-amber text-amber' : ''}`}
            onClick={() => onChange(active ? '' : id)}
            aria-pressed={active}
          >
            {id}
            <span className="num text-muted">{fmtInt(count)}</span>
          </button>
        );
      })}
    </div>
  );
}

const DORMANT_MONTHS = 12;

export default function OffenderTimeline({ timeline = [] }) {
  const [status, setStatus] = useState('');
  const [district, setDistrict] = useState('');
  const [head, setHead] = useState('');

  const sorted = useMemo(
    () => [...timeline].sort((a, b) => String(b?.registeredDate || '').localeCompare(String(a?.registeredDate || ''))),
    [timeline],
  );

  const countBy = (rows, of) => {
    const m = new Map();
    for (const t of rows) {
      const k = of(t);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  };

  const statusOptions = useMemo(() => countBy(sorted, (t) => String(t?.statusName || '')), [sorted]);
  const districtOptions = useMemo(() => countBy(sorted, districtNameOf), [sorted]);
  const headOptions = useMemo(() => countBy(sorted, (t) => String(t?.headName || '')), [sorted]);

  const visible = useMemo(
    () => sorted.filter((t) => (!status || String(t?.statusName || '') === status)
      && (!district || districtNameOf(t) === district)
      && (!head || String(t?.headName || '') === head)),
    [sorted, status, district, head],
  );

  // Gap (in months) between each visible case and the NEXT OLDER one — 12+
  // month gaps render as dormancy dividers under the entry.
  const withGaps = useMemo(() => visible.map((t, i) => {
    const next = visible[i + 1];
    if (!next) return { t, gapMonths: 0 };
    const a = Date.parse(String(t?.registeredDate || '').slice(0, 10));
    const b = Date.parse(String(next?.registeredDate || '').slice(0, 10));
    const gapMonths = Number.isFinite(a) && Number.isFinite(b)
      ? Math.round((a - b) / (30.44 * 86400000))
      : 0;
    return { t, gapMonths };
  }), [visible]);

  // Year groups over the (already descending) visible rows.
  const groups = useMemo(() => {
    const out = [];
    for (const entry of withGaps) {
      const y = String(entry.t?.registeredDate || '').slice(0, 4) || 'Undated';
      if (!out.length || out[out.length - 1].year !== y) out.push({ year: y, items: [] });
      out[out.length - 1].items.push(entry);
    }
    return out;
  }, [withGaps]);

  if (!timeline.length) {
    return (
      <EmptyState
        compact
        title="No linked cases"
        message="The network snapshot has no shared cases recorded for this person."
      />
    );
  }

  const filtering = status || district || head;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 no-print">
        <FilterChips label="Status" options={statusOptions} value={status} onChange={setStatus} />
        <FilterChips label="District" options={districtOptions} value={district} onChange={setDistrict} />
        <FilterChips label="Head" options={headOptions} value={head} onChange={setHead} />
        {filtering && (
          <p className="text-[11px] text-muted">
            Showing <span className="num text-ink">{fmtInt(visible.length)}</span> of {fmtInt(sorted.length)} cases
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-[11px] min-h-[32px] ml-1.5"
              onClick={() => { setStatus(''); setDistrict(''); setHead(''); }}
            >
              Clear filters
            </button>
          </p>
        )}
      </div>

      {!visible.length ? (
        <EmptyState compact title="No cases match" message="No timeline entry matches the selected status / district chips." />
      ) : (
        <ol className="relative border-l border-grid ml-2 space-y-4">
          {groups.map((g) => (
            <li key={g.year} className="ml-4 relative">
              <p className="text-[10px] uppercase tracking-wide text-muted num mb-3">
                {g.year} · {fmtInt(g.items.length)} case{g.items.length === 1 ? '' : 's'}
              </p>
              <ol className="space-y-4">
                {g.items.map(({ t, gapMonths }) => (
                  <li key={t.caseMasterId || t.crimeNo} className="relative">
                    <span className="absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full bg-amber border-2 border-panel" aria-hidden="true" />
                    <div className="flex flex-wrap items-center gap-2">
                      {t.caseMasterId ? (
                        <Link
                          to={`/cases/${encodeURIComponent(t.caseMasterId)}`}
                          className="text-sm font-medium text-ink num hover:text-amber transition-colors"
                        >
                          {t.crimeNo}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-ink num" title="No case record linked in this snapshot">
                          {t.crimeNo || '—'}
                        </span>
                      )}
                      <OutcomeBadge status={t.statusName} />
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {t.subHeadName || t.headName || 'Case'} · {t.unitName || 'Unknown station'} · {dateLabel(t.registeredDate)}
                    </p>
                    {gapMonths >= DORMANT_MONTHS && (
                      <p
                        className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted mt-3"
                        title="No linked case registered during this stretch"
                      >
                        <span className="h-px flex-1 bg-grid/70" aria-hidden="true" />
                        dormant ≈ {fmtInt(gapMonths)} months
                        <span className="h-px flex-1 bg-grid/70" aria-hidden="true" />
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
