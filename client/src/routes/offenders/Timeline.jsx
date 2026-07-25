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
import { useI18n } from '../../lib/i18n.jsx';
import { OutcomeBadge, useRefNames } from './common.jsx';

/** CrimeNo = [cat 1][district 4][unit 4][year 4][serial 5] → district unit code. */
function districtCodeFromCrimeNo(crimeNo) {
  const cn = String(crimeNo || '');
  const code = cn.slice(1, 5);
  return cn.length >= 10 && /^\d{4}$/.test(code) ? code : null;
}

function districtCodeOf(row) {
  return districtCodeFromCrimeNo(row?.crimeNo);
}

function districtNameOf(row) {
  const code = districtCodeOf(row);
  return code ? (unitInfo(code)?.name || code) : '';
}

/** `labelOf` translates the chip text; the raw id stays the filter value. */
function FilterChips({ label, options, value, onChange, labelOf }) {
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
            {labelOf ? labelOf(id) : id}
            <span className="num text-muted">{fmtInt(count)}</span>
          </button>
        );
      })}
    </div>
  );
}

const DORMANT_MONTHS = 12;

export default function OffenderTimeline({ timeline = [] }) {
  const { t, tName } = useI18n();
  const ref = useRefNames();
  const [status, setStatus] = useState('');
  const [district, setDistrict] = useState('');
  const [head, setHead] = useState('');

  const sorted = useMemo(
    () => [...timeline].sort((a, b) => String(b?.registeredDate || '').localeCompare(String(a?.registeredDate || ''))),
    [timeline],
  );

  const countBy = (rows, of) => {
    const m = new Map();
    for (const row of rows) {
      const k = of(row);
      if (k) m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  };

  const statusOptions = useMemo(() => countBy(sorted, (row) => String(row?.statusName || '')), [sorted]);
  const districtOptions = useMemo(() => countBy(sorted, districtNameOf), [sorted]);
  const headOptions = useMemo(() => countBy(sorted, (row) => String(row?.headName || '')), [sorted]);

  // District chips filter on the raw unit name, so keep a name → code index for
  // the display label.
  const districtCodeByName = useMemo(() => {
    const m = new Map();
    for (const row of sorted) {
      const name = districtNameOf(row);
      if (name && !m.has(name)) m.set(name, districtCodeOf(row));
    }
    return m;
  }, [sorted]);

  const visible = useMemo(
    () => sorted.filter((row) => (!status || String(row?.statusName || '') === status)
      && (!district || districtNameOf(row) === district)
      && (!head || String(row?.headName || '') === head)),
    [sorted, status, district, head],
  );

  // Gap (in months) between each visible case and the NEXT OLDER one — 12+
  // month gaps render as dormancy dividers under the entry.
  const withGaps = useMemo(() => visible.map((row, i) => {
    const next = visible[i + 1];
    if (!next) return { row, gapMonths: 0 };
    const a = Date.parse(String(row?.registeredDate || '').slice(0, 10));
    const b = Date.parse(String(next?.registeredDate || '').slice(0, 10));
    const gapMonths = Number.isFinite(a) && Number.isFinite(b)
      ? Math.round((a - b) / (30.44 * 86400000))
      : 0;
    return { row, gapMonths };
  }), [visible]);

  // Year groups over the (already descending) visible rows. An empty year is
  // the undated bucket — labelled at render so it translates.
  const groups = useMemo(() => {
    const out = [];
    for (const entry of withGaps) {
      const y = String(entry.row?.registeredDate || '').slice(0, 4);
      if (!out.length || out[out.length - 1].year !== y) out.push({ year: y, items: [] });
      out[out.length - 1].items.push(entry);
    }
    return out;
  }, [withGaps]);

  if (!timeline.length) {
    return (
      <EmptyState
        compact
        title={t('network.timeline.noCasesTitle')}
        message={t('network.timeline.noCasesMsg')}
      />
    );
  }

  const filtering = status || district || head;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 no-print">
        <FilterChips
          label={t('network.timeline.status')}
          options={statusOptions}
          value={status}
          onChange={setStatus}
          labelOf={ref.status}
        />
        <FilterChips
          label={t('network.timeline.district')}
          options={districtOptions}
          value={district}
          onChange={setDistrict}
          labelOf={(id) => tName('districts', districtCodeByName.get(id) || '', id)}
        />
        <FilterChips
          label={t('network.timeline.head')}
          options={headOptions}
          value={head}
          onChange={setHead}
          labelOf={ref.head}
        />
        {filtering && (
          <p className="text-[11px] text-muted">
            {t('network.timeline.showing', { shown: fmtInt(visible.length), total: fmtInt(sorted.length) })}
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 text-[11px] min-h-[32px] ml-1.5"
              onClick={() => { setStatus(''); setDistrict(''); setHead(''); }}
            >
              {t('network.timeline.clearFilters')}
            </button>
          </p>
        )}
      </div>

      {!visible.length ? (
        <EmptyState compact title={t('network.timeline.noMatchTitle')} message={t('network.timeline.noMatchMsg')} />
      ) : (
        <ol className="relative border-l border-grid ml-2 space-y-4">
          {groups.map((g) => (
            <li key={g.year} className="ml-4 relative">
              <p className="text-[10px] uppercase tracking-wide text-muted num mb-3">
                {t(g.items.length === 1 ? 'network.timeline.yearGroup.one' : 'network.timeline.yearGroup.other', {
                  year: g.year || t('network.timeline.undated'),
                  n: fmtInt(g.items.length),
                })}
              </p>
              <ol className="space-y-4">
                {g.items.map(({ row, gapMonths }) => (
                  <li key={row.caseMasterId || row.crimeNo} className="relative">
                    <span className="absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rounded-full bg-amber border-2 border-panel" aria-hidden="true" />
                    <div className="flex flex-wrap items-center gap-2">
                      {row.caseMasterId ? (
                        <Link
                          to={`/cases/${encodeURIComponent(row.caseMasterId)}`}
                          className="text-sm font-medium text-ink num hover:text-amber transition-colors"
                        >
                          {row.crimeNo}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-ink num" title={t('network.timeline.noCaseRecord')}>
                          {row.crimeNo || '—'}
                        </span>
                      )}
                      <OutcomeBadge status={row.statusName} label={ref.status(row.statusName)} />
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {row.subHeadName
                        ? ref.subHead(row.subHeadName)
                        : row.headName
                          ? ref.head(row.headName)
                          : t('network.timeline.caseFallback')}
                      {' · '}
                      {row.unitName || t('network.timeline.unknownStation')}
                      {' · '}
                      {dateLabel(row.registeredDate)}
                    </p>
                    {gapMonths >= DORMANT_MONTHS && (
                      <p
                        className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted mt-3"
                        title={t('network.timeline.dormantHint')}
                      >
                        <span className="h-px flex-1 bg-grid/70" aria-hidden="true" />
                        {t('network.timeline.dormant', { n: fmtInt(gapMonths) })}
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
