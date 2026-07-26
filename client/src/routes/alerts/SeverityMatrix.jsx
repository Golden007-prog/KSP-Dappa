// /alerts — district × severity roll-up matrix.
//
// The chip roll-up answers "which districts have alerts". This answers the
// question a range DIG actually asks: where is the WEIGHT of the problem. Each
// row is a district, each column a severity band, cells are shaded by share of
// that district's load, and a weighted score (critical ×4 … low ×1 — the same
// weighting the nightly job uses for district anomaly pressure) sorts the
// table. Every cell is a filter: tap it to pin the feed to that district and
// band.
import { useMemo, useState } from 'react';
import { fmtInt } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { SEV_KEYS, sevKey, sevRank } from './severity.js';

const SORTS = ['weight', 'count', 'name'];

/** Cell tint scales with the district's own maximum — relative, not absolute. */
function cellClass(n, peak, key) {
  if (!n) return 'text-muted/40';
  const share = peak > 0 ? n / peak : 0;
  const strong = share > 0.66;
  const mid = share > 0.33;
  if (key === 'critical' || key === 'high') {
    return strong ? 'bg-signal/25 text-signal font-semibold'
      : mid ? 'bg-signal/15 text-signal' : 'bg-signal/[0.07] text-signal/80';
  }
  if (key === 'medium') {
    return strong ? 'bg-amber/25 text-amber font-semibold'
      : mid ? 'bg-amber/15 text-amber' : 'bg-amber/[0.07] text-amber/80';
  }
  return strong ? 'bg-grid/70 text-ink' : 'bg-grid/40 text-muted';
}

export default function SeverityMatrix({ alerts, activeDistrictId, activeSev, onPick }) {
  const t = useT();
  const tName = useNames();
  const [sort, setSort] = useState('weight');

  const rows = useMemo(() => {
    const byDistrict = new Map();
    for (const a of alerts) {
      const id = String(a.districtId || '');
      if (!id) continue;
      if (!byDistrict.has(id)) {
        byDistrict.set(id, {
          id,
          name: tName('districts', id, a.districtName || id) || id,
          counts: { critical: 0, high: 0, medium: 0, low: 0, unrated: 0 },
          total: 0,
          weight: 0,
        });
      }
      const g = byDistrict.get(id);
      const key = sevKey(a.severity) || 'unrated';
      g.counts[key] = (g.counts[key] || 0) + 1;
      g.total += 1;
      g.weight += sevRank(a.severity);
    }
    const list = [...byDistrict.values()];
    for (const g of list) g.peak = Math.max(...SEV_KEYS.map((k) => g.counts[k] || 0), 1);
    const cmp = {
      weight: (x, y) => y.weight - x.weight || y.total - x.total,
      count: (x, y) => y.total - x.total || y.weight - x.weight,
      name: (x, y) => x.name.localeCompare(y.name),
    }[sort];
    return list.sort(cmp);
  }, [alerts, tName, sort]);

  if (!rows.length) return <p className="text-xs text-muted">{t('alerts.intel.noMatrix')}</p>;

  const shown = rows.slice(0, 14);
  const maxWeight = Math.max(...rows.map((r) => r.weight), 1);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted">{t('alerts.intel.sortBy')}</span>
        {SORTS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={sort === s}
            onClick={() => setSort(s)}
            className={`chip !py-0.5 min-h-[40px] sm:min-h-[24px] transition-colors ${
              sort === s ? '!border-primary/60 !text-primary' : 'hover:border-primary/40'
            }`}
          >
            {t(`alerts.intel.sort.${s}`)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-xs">
          <caption className="sr-only">{t('alerts.intel.matrixAria')}</caption>
          <thead>
            <tr>
              <th scope="col" className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                {t('alerts.intel.col.district')}
              </th>
              {SEV_KEYS.map((k) => (
                <th key={k} scope="col" className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {t(`alerts.sev.${k}`)}
                </th>
              ))}
              <th scope="col" className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted">
                {t('alerts.intel.col.pressure')}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const activeRow = String(activeDistrictId) === r.id;
              return (
                <tr key={r.id} className={activeRow ? 'bg-primary/5' : ''}>
                  <th scope="row" className="max-w-[9rem] truncate px-2 py-1 text-left font-medium text-ink">
                    <button
                      type="button"
                      onClick={() => onPick?.(activeRow ? '' : r.id, '')}
                      className="min-h-[36px] truncate text-left transition-colors hover:text-primary"
                      title={r.name}
                    >
                      {r.name}
                    </button>
                  </th>
                  {SEV_KEYS.map((k) => {
                    const n = r.counts[k] || 0;
                    const on = activeRow && activeSev === k;
                    return (
                      <td key={k} className="px-0.5 py-0.5 text-right">
                        <button
                          type="button"
                          disabled={!n}
                          onClick={() => onPick?.(r.id, on ? '' : k)}
                          aria-label={t('alerts.intel.cellAria', { n: fmtInt(n), sev: t(`alerts.sev.${k}`), district: r.name })}
                          className={`num block w-full rounded px-1.5 py-1 text-right tabular-nums transition-colors ${
                            cellClass(n, r.peak, k)
                          } ${on ? 'ring-1 ring-primary/70' : ''} ${n ? 'hover:brightness-125' : 'cursor-default'}`}
                        >
                          {n || '·'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-grid/50" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-signal/70"
                          style={{ width: `${Math.max(4, (r.weight / maxWeight) * 100)}%` }}
                        />
                      </span>
                      <span className="num text-muted">{fmtInt(r.weight)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <p className="text-[11px] text-muted">{t('alerts.intel.matrixMore', { n: fmtInt(rows.length - shown.length) })}</p>
      )}
      <p className="text-[10px] leading-tight text-muted">{t('alerts.intel.matrixNote')}</p>
    </div>
  );
}
