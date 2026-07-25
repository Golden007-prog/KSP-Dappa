// District roll-up chips — open alerts clustered by district with a severity
// breakdown (red dot = critical count, amber dot = high count). Tapping a chip
// narrows the whole app to that district through the shared districtId filter;
// tapping the active chip (or its ×) clears it again.
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';

const MAX_CHIPS = 8;

function Dot({ cls }) {
  return <span className={`h-1.5 w-1.5 rounded-full ${cls}`} aria-hidden="true" />;
}

export default function DistrictRollup({ openAlerts, activeDistrictId, onPick }) {
  const t = useT();
  const tName = useNames();
  const byDistrict = new Map();
  for (const a of openAlerts) {
    const id = String(a.districtId || '');
    if (!id) continue;
    if (!byDistrict.has(id)) {
      byDistrict.set(id, { id, name: tName('districts', id, a.districtName || id) || id, n: 0, crit: 0, high: 0 });
    }
    const g = byDistrict.get(id);
    g.n += 1;
    const sev = String(a.severity || '').toLowerCase();
    if (sev === 'critical') g.crit += 1;
    else if (sev === 'high') g.high += 1;
  }
  const groups = [...byDistrict.values()].sort((x, y) => y.n - x.n || x.name.localeCompare(y.name));
  if (!groups.length && !activeDistrictId) return null;
  if (groups.length < 2 && !activeDistrictId) return null;
  const shown = groups.slice(0, MAX_CHIPS);
  const more = groups.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('alerts.rollup.aria')}>
      <span className="text-xs text-muted mr-0.5">{t('alerts.rollup.label')}</span>
      {shown.map((g) => {
        const active = String(activeDistrictId) === g.id;
        return (
          <Tooltip
            key={g.id}
            label={active
              ? t('alerts.rollup.tipActive', { name: g.name })
              : t('alerts.rollup.tip', {
                name: g.name, n: fmtInt(g.n), crit: fmtInt(g.crit), high: fmtInt(g.high),
              })}
          >
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onPick(active ? '' : g.id)}
              className={`chip !py-1 min-h-[40px] sm:min-h-[26px] transition-colors ${
                active ? '!border-primary/60 !text-primary' : 'hover:border-primary/40'
              }`}
            >
              {g.name}
              <span className="num text-muted">×{fmtInt(g.n)}</span>
              {g.crit > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-signal num">
                  <Dot cls="bg-signal" />{g.crit}
                </span>
              )}
              {g.high > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber num">
                  <Dot cls="bg-amber" />{g.high}
                </span>
              )}
              {active && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              )}
            </button>
          </Tooltip>
        );
      })}
      {more > 0 && (
        <span className="text-[11px] text-muted">
          {t(more === 1 ? 'alerts.rollup.more.one' : 'alerts.rollup.more.other', { n: more })}
        </span>
      )}
    </div>
  );
}
