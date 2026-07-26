// Catchment tab — allocates every incident in the active window to its nearest
// police station (straight-line), which is the load a station really absorbs
// regardless of where the jurisdiction boundary sits. Two operational readouts
// fall out of it: which stations carry a disproportionate share, and which
// incidents sit beyond a chosen response radius of any station at all
// (coverage gaps — the argument for a new outpost or a standing patrol).
import { fmtInt, fmtNum } from '../../lib/format.js';
import { unitInfo } from '../../lib/districtGeoMap.js';
import { GAP_KMS } from './stats.js';
import { risk01, riskColor } from './utils.js';
import { StatTile } from './AnalysisDock.jsx';
import { useI18n } from '../../lib/i18n.jsx';

export default function CatchmentPanel({
  catchment, gapKm, onGapKm, spider, onSpider, gapsOn, onGapsOn, onStationSelect, onFocusGap, onExport,
}) {
  const { t, tName } = useI18n();
  const rows = catchment?.rows || [];
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-pressed={spider}
          onClick={() => onSpider(!spider)}
          className={`chip gi-tap shrink-0 text-[11px] transition-colors ${
            spider ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
          }`}
          title={t('geointel.catch.spiderHint')}
        >
          ✳ {t('geointel.catch.spider')}
        </button>
        <button
          type="button"
          aria-pressed={gapsOn}
          onClick={() => onGapsOn(!gapsOn)}
          className={`chip gi-tap shrink-0 text-[11px] transition-colors ${
            gapsOn ? '!border-signal/60 !text-signal !bg-signal/10' : 'text-muted hover:text-ink'
          }`}
          title={t('geointel.catch.gapsHint')}
        >
          ✛ {t('geointel.catch.gaps')}
        </button>
      </div>

      <div role="group" aria-label={t('geointel.catch.thresholdAria')} className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted mr-0.5">{t('geointel.catch.threshold')}</span>
        {GAP_KMS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={gapKm === k}
            onClick={() => onGapKm(k)}
            className={`chip gi-tap shrink-0 num text-[10px] transition-colors ${
              gapKm === k ? '!border-primary/60 !text-primary !bg-primary/10' : 'text-muted hover:text-ink'
            }`}
          >
            {t('geointel.patrol.km', { km: k })}
          </button>
        ))}
      </div>

      {!rows.length ? (
        <p className="text-[11px] text-muted px-1 py-2">{t('geointel.catch.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <StatTile label={t('geointel.catch.allocated')} value={fmtInt(catchment.assigned)} hint={t('geointel.catch.allocatedHint', { n: fmtInt(rows.length) })} />
            <StatTile
              label={t('geointel.catch.meanDist')}
              value={catchment.meanKm === null ? '—' : t('geointel.patrol.km', { km: fmtNum(catchment.meanKm, 1) })}
              hint={t('geointel.catch.meanDistHint')}
            />
            <StatTile
              label={t('geointel.catch.gapCount')}
              value={fmtInt(catchment.gapTotal || 0)}
              hint={t('geointel.catch.gapCountHint', { km: gapKm })}
              tone={catchment.gapTotal ? 'signal' : 'ink'}
            />
            <StatTile
              label={t('geointel.catch.busiest')}
              value={fmtInt(rows[0].count)}
              hint={rows[0].unitName}
              tone="amber"
            />
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted mb-1">{t('geointel.catch.loadTitle')}</p>
            <ul className="space-y-1 list-none m-0 p-0">
              {rows.slice(0, 14).map((r, i) => {
                const risk = risk01(r.riskScore);
                const district = tName('districts', r.districtId, unitInfo(r.districtId)?.name || r.districtId);
                return (
                  <li key={r.unitId}>
                    <button
                      type="button"
                      onClick={() => onStationSelect(r)}
                      className="w-full text-left rounded-lg border border-grid/70 px-2 py-1.5 hover:border-amber/50 hover:bg-grid/20 transition-colors"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="num text-[10px] text-muted w-4 shrink-0">{i + 1}</span>
                        <span className="text-[11px] text-ink truncate flex-1">{r.unitName}</span>
                        {risk !== null && (
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ background: riskColor(risk) }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="num text-[11px] text-ink shrink-0">{fmtInt(r.count)}</span>
                      </span>
                      <span className="flex items-center gap-2 mt-0.5">
                        <span className="h-1 flex-1 rounded-full bg-grid overflow-hidden" aria-hidden="true">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${Math.round((r.count / maxCount) * 100)}%` }}
                          />
                        </span>
                        <span className="num text-[9px] text-muted shrink-0 whitespace-nowrap">
                          {fmtNum(r.share * 100, 1)}% · {t('geointel.catch.meanShort', { km: fmtNum(r.meanKm, 1) })}
                        </span>
                      </span>
                      {district && <span className="block text-[9px] text-muted truncate mt-0.5">{district}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {(catchment.gaps || []).length > 0 && (
            <div className="border-t border-grid/60 pt-2">
              <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                {t('geointel.catch.gapTitle', { km: gapKm })}
              </p>
              <ul className="space-y-1 list-none m-0 p-0">
                {catchment.gaps.slice(0, 6).map((g, i) => (
                  <li key={`${g.lat}-${g.lng}-${i}`}>
                    <button
                      type="button"
                      onClick={() => onFocusGap(g)}
                      className="w-full flex items-center gap-2 rounded-lg border border-signal/30 px-2 py-1.5 text-left hover:border-signal/60 hover:bg-signal/10 transition-colors"
                    >
                      <span className="num text-[11px] text-signal shrink-0">
                        {t('geointel.patrol.km', { km: fmtNum(g.km, 1) })}
                      </span>
                      <span className="num text-[10px] text-muted truncate flex-1">
                        {fmtNum(g.lat, 3)}, {fmtNum(g.lng, 3)}
                      </span>
                      <span className="text-[10px] text-muted truncate max-w-[7rem]">{g.unitName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" className="btn gi-tap w-full !py-1.5 text-[11px]" onClick={onExport}>
            {t('geointel.catch.export')}
          </button>
        </>
      )}
    </>
  );
}
