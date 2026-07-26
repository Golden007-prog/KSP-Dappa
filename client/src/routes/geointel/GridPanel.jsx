// Grid & statistics tab — the statistical (rather than visual) hotspot view.
// Incidents in the active window are binned into an equal-area square lattice;
// each cell gets a Getis-Ord Gi* z-score against its 3x3 neighbourhood, so a
// cell is called "hot" only when its local sum is significantly above what the
// state-wide mean would predict. Concentration measures (top-10-cell share,
// Gini) answer "is this crime clustered or spread thin" in one number.
import { fmtInt, fmtNum } from '../../lib/format.js';
import { GI_COLORS, GRID_SIZES } from './stats.js';
import { rampColor } from './utils.js';
import { StatTile } from './AnalysisDock.jsx';
import { useT } from '../../lib/i18n.jsx';

const BAND_KEYS = ['hot99', 'hot95', 'cold95', 'cold99'];

export default function GridPanel({
  grid, cellKm, onCellKm, gridOn, onGridOn, giMode, onGiMode, onFocusCell, onExport, light, loading,
}) {
  const t = useT();
  const cells = grid?.cells || [];
  const pct = (v) => (v === null || v === undefined ? '—' : `${fmtNum(v * 100, 1)}%`);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-pressed={gridOn}
          onClick={() => onGridOn(!gridOn)}
          className={`chip gi-tap shrink-0 text-[11px] transition-colors ${
            gridOn ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
          }`}
          title={t('geointel.grid.toggleHint')}
        >
          ▦ {t('geointel.grid.toggle')}
        </button>
        <button
          type="button"
          aria-pressed={giMode}
          onClick={() => onGiMode(!giMode)}
          disabled={!!grid?.giSkipped}
          className={`chip gi-tap shrink-0 text-[11px] transition-colors disabled:opacity-45 ${
            giMode ? '!border-signal/60 !text-signal !bg-signal/10' : 'text-muted hover:text-ink'
          }`}
          title={t('geointel.grid.giHint')}
        >
          {t('geointel.grid.gi')}
        </button>
      </div>

      <div role="group" aria-label={t('geointel.grid.sizeAria')} className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted mr-0.5">{t('geointel.grid.size')}</span>
        {GRID_SIZES.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={cellKm === k}
            onClick={() => onCellKm(k)}
            className={`chip gi-tap shrink-0 num text-[10px] transition-colors ${
              cellKm === k ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
            }`}
          >
            {t('geointel.patrol.km', { km: k })}
          </button>
        ))}
      </div>

      {loading && <p className="text-[11px] text-muted px-1">{t('geointel.grid.loading')}</p>}

      {!loading && !cells.length ? (
        <p className="text-[11px] text-muted px-1 py-2">{t('geointel.grid.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <StatTile label={t('geointel.grid.binned')} value={fmtInt(grid.total)} hint={t('geointel.grid.binnedHint', { n: fmtInt(grid.occupied) })} />
            <StatTile label={t('geointel.grid.busiest')} value={fmtInt(grid.max)} hint={t('geointel.grid.busiestHint', { km: grid.cellKm })} />
            <StatTile label={t('geointel.grid.top10')} value={pct(grid.top10Share)} hint={t('geointel.grid.top10Hint')} tone="amber" />
            <StatTile label={t('geointel.grid.gini')} value={grid.gini === null ? '—' : fmtNum(grid.gini, 2)} hint={t('geointel.grid.giniHint')} />
          </div>

          {grid.giSkipped ? (
            <p className="text-[10px] text-muted px-1">{t('geointel.grid.giSkipped')}</p>
          ) : (
            <div className="rounded-lg border border-grid/70 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{t('geointel.grid.significance')}</p>
              <p className="text-[11px] text-ink">
                {t('geointel.grid.significanceValue', { n99: fmtInt(grid.hot99), n95: fmtInt(grid.hot95) })}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                {BAND_KEYS.map((b) => (
                  <span key={b} className="flex items-center gap-1 text-[10px] text-muted">
                    <span className="h-2 w-3 rounded-sm" style={{ background: GI_COLORS[b] }} aria-hidden="true" />
                    {t(`geointel.grid.band.${b}`)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{t('geointel.grid.topCells')}</p>
            <ul className="space-y-1 list-none m-0 p-0">
              {cells.slice(0, 10).map((c, i) => (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => onFocusCell(c)}
                    className="w-full flex items-center gap-2 rounded-lg border border-grid/70 px-2 py-1.5 text-left hover:border-amber/50 hover:bg-grid/20 transition-colors"
                  >
                    <span className="num text-[10px] text-muted w-4 shrink-0">{i + 1}</span>
                    <span
                      className="h-3 w-3 rounded-sm shrink-0 border border-grid"
                      style={{ background: c.band ? GI_COLORS[c.band] : rampColor(c.count / Math.max(1, grid.max), light) }}
                      aria-hidden="true"
                    />
                    <span className="num text-[11px] text-ink shrink-0">{fmtInt(c.count)}</span>
                    <span className="num text-[10px] text-muted truncate flex-1">
                      {fmtNum(c.lat, 3)}, {fmtNum(c.lng, 3)}
                    </span>
                    {Number.isFinite(c.z) && (
                      <span className={`num text-[10px] shrink-0 ${c.band ? 'text-signal' : 'text-muted'}`}>
                        {t('geointel.grid.z', { z: fmtNum(c.z, 2) })}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <button type="button" className="btn gi-tap w-full !py-1.5 text-[11px]" onClick={onExport}>
            {t('geointel.grid.export')}
          </button>
        </>
      )}
    </>
  );
}
