// Sortable hotspot ranking table, two-way synced with the map: hovering a row
// pulses the matching cluster ring, clicking it flies + selects, and the row of
// the cluster selected on the map scrolls into view. Below the table, compound
// zones — pairs of clusters whose footprints touch, i.e. one patrol can cover
// both — are listed with their separation.
import { useEffect, useRef } from 'react';
import { unitInfo } from '../../lib/districtGeoMap.js';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { hotspotName, hourBand } from './utils.js';
import { useI18n } from '../../lib/i18n.jsx';

export const HOTSPOT_SORTS = [
  { key: 'cases', label: 'geointel.table.sortCases' },
  { key: 'intensity', label: 'geointel.table.sortIntensity' },
  { key: 'radius', label: 'geointel.table.sortRadius' },
  { key: 'distance', label: 'geointel.table.sortDistance' },
];

/** Sort rows (already carrying `nearestKm`) by the active key, descending
 *  except for distance where nearest-first is the useful order. */
export function sortHotspotRows(rows, key) {
  const out = [...(rows || [])];
  if (key === 'intensity') out.sort((a, b) => (Number(b.intensity) || 0) - (Number(a.intensity) || 0));
  else if (key === 'radius') out.sort((a, b) => (Number(b.radiusM) || 0) - (Number(a.radiusM) || 0));
  else if (key === 'distance') {
    out.sort((a, b) => (a.nearestKm ?? Infinity) - (b.nearestKm ?? Infinity));
  } else out.sort((a, b) => (Number(b.caseCount) || 0) - (Number(a.caseCount) || 0));
  return out;
}

export default function HotspotTable({
  rows, sort, onSort, selectedId, onSelect, onHover, coLocated, onSelectPair, totalCases,
  coLocateOn, onCoLocate,
}) {
  const { t, tName } = useI18n();
  const bodyRef = useRef(null);

  // Selecting a cluster on the map should reveal its row here too.
  useEffect(() => {
    if (selectedId == null || !bodyRef.current) return;
    const el = bodyRef.current.querySelector(`[data-cluster="${CSS.escape(String(selectedId))}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  if (!rows.length) {
    return <p className="text-[11px] text-muted px-1 py-3">{t('geointel.table.empty')}</p>;
  }
  const maxCases = Math.max(1, ...rows.map((h) => Number(h.caseCount) || 0));

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted mr-0.5">{t('geointel.table.sortBy')}</span>
        {HOTSPOT_SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={sort === s.key}
            onClick={() => onSort(s.key)}
            className={`chip gi-tap shrink-0 text-[10px] transition-colors ${
              sort === s.key ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
            }`}
          >
            {t(s.label)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto -mx-0.5">
        <table className="w-full min-w-[30rem] text-[11px] border-collapse">
          <caption className="sr-only">{t('geointel.table.caption')}</caption>
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-muted">
              <th scope="col" className="text-left font-normal py-1 pl-1">#</th>
              <th scope="col" className="text-left font-normal py-1">{t('geointel.table.cluster')}</th>
              <th scope="col" className="text-left font-normal py-1">{t('geointel.table.district')}</th>
              <th scope="col" className="text-right font-normal py-1">{t('geointel.table.cases')}</th>
              <th scope="col" className="text-right font-normal py-1">{t('geointel.table.intensity')}</th>
              <th scope="col" className="text-right font-normal py-1">{t('geointel.table.radius')}</th>
              <th scope="col" className="text-left font-normal py-1">{t('geointel.table.band')}</th>
              <th scope="col" className="text-right font-normal py-1 pr-1">{t('geointel.table.nearest')}</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {rows.map((h, i) => {
              const selected = selectedId != null && String(h.clusterId) === String(selectedId);
              const band = hourBand(h.hourBandStart, h.hourBandEnd);
              const district = tName('districts', h.districtId, unitInfo(h.districtId)?.name || h.districtId);
              const cases = Number(h.caseCount) || 0;
              return (
                <tr
                  key={h.clusterId ?? i}
                  data-cluster={String(h.clusterId ?? '')}
                  onMouseEnter={() => onHover?.(h.clusterId ?? null)}
                  onMouseLeave={() => onHover?.(null)}
                  className={`border-t border-grid/60 cursor-pointer transition-colors ${
                    selected ? 'bg-amber/10' : 'hover:bg-grid/25'
                  }`}
                  onClick={() => onSelect(h)}
                >
                  <td className="num text-muted py-1.5 pl-1">{i + 1}</td>
                  <th scope="row" className="text-left font-medium text-ink py-1.5 pr-2">
                    <span className="block truncate max-w-[9rem]">
                      {hotspotName(h, tName, t('geointel.hotspot.cluster', { id: h.clusterId }))}
                    </span>
                    <span className="block h-0.5 mt-0.5 rounded-full bg-grid overflow-hidden" aria-hidden="true">
                      <span
                        className="block h-full rounded-full bg-amber"
                        style={{ width: `${Math.round((cases / maxCases) * 100)}%` }}
                      />
                    </span>
                  </th>
                  <td className="text-muted py-1.5 pr-2 truncate max-w-[7rem]">{district || '—'}</td>
                  <td className="num text-ink text-right py-1.5 pr-2">{fmtInt(cases)}</td>
                  <td className="num text-muted text-right py-1.5 pr-2">{fmtNum(Number(h.intensity) || 0, 1)}</td>
                  <td className="num text-muted text-right py-1.5 pr-2">
                    {fmtNum(Math.max(0, Number(h.radiusM) || 0) / 1000, 1)}
                  </td>
                  <td className="num text-amber/90 py-1.5 pr-2 whitespace-nowrap">{band || '—'}</td>
                  <td className="num text-muted text-right py-1.5 pr-1 whitespace-nowrap">
                    {Number.isFinite(h.nearestKm) ? t('geointel.patrol.km', { km: fmtNum(h.nearestKm, 1) }) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {Number.isFinite(totalCases) && (
        <p className="text-[10px] text-muted px-1">
          {t('geointel.table.footer', { n: fmtInt(rows.length), cases: fmtInt(totalCases) })}
        </p>
      )}

      <div className="border-t border-grid/60 pt-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[10px] uppercase tracking-wider text-muted">{t('geointel.colocate.title')}</p>
          {onCoLocate && (
            <button
              type="button"
              aria-pressed={coLocateOn}
              onClick={() => onCoLocate(!coLocateOn)}
              title={t('geointel.colocate.chordsHint')}
              className={`chip gi-tap shrink-0 text-[10px] transition-colors ${
                coLocateOn ? '!border-amber/60 !text-amber' : 'text-muted hover:text-ink'
              }`}
            >
              {t('geointel.colocate.chords')}
            </button>
          )}
        </div>
        {!coLocated.length ? (
          <p className="text-[11px] text-muted">{t('geointel.colocate.none')}</p>
        ) : (
          <ul className="space-y-1 list-none m-0 p-0">
            {coLocated.slice(0, 8).map((p, i) => (
              <li key={`${p.a.clusterId}-${p.b.clusterId}-${i}`}>
                <button
                  type="button"
                  onClick={() => onSelectPair?.(p)}
                  className="w-full text-left rounded-lg border border-grid/70 px-2 py-1.5 hover:border-amber/50 hover:bg-grid/20 transition-colors"
                >
                  <span className="block text-[11px] text-ink truncate">
                    {hotspotName(p.a, tName, t('geointel.hotspot.cluster', { id: p.a.clusterId }))}
                    {' ↔ '}
                    {hotspotName(p.b, tName, t('geointel.hotspot.cluster', { id: p.b.clusterId }))}
                  </span>
                  <span className="block text-[10px] text-muted num">
                    {t('geointel.colocate.gap', { km: fmtNum(p.km, 1) })}
                    {p.overlap && <span className="text-signal"> · {t('geointel.colocate.overlap')}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
