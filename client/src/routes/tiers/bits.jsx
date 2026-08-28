// Shared building blocks of the officer-tier homes (Beat / Station / State):
// the 44-px (i) affordance, the three-question card, the tier page header,
// the station picker, and small pure helpers (weekday from the real date,
// hour bands, pendency ages, alert SLA clocks). Everything here is used by at
// least two of the tier routes; route-specific markup stays in the route.
import { useEffect, useMemo } from 'react';
import Tooltip from '../../components/Tooltip.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import ReadPageButton from '../../components/ReadPageButton.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useStations } from '../../lib/api.js';
import { useTierStore } from '../../lib/tier.js';
import { useI18n } from '../../lib/i18n.jsx';
import { slaFor } from '../alerts/sla.js';

const INFO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
  </svg>
);
const PRINT = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9V3h12v6" /><rect x="6" y="14" width="12" height="7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
  </svg>
);

/** A tier home IS its tier. The sidebar / More-sheet / palette entries are
 * plain routes ({ to: '/beat' }), so before this hook opening My Beat from the
 * app's own navigation left the store on whatever tier was last set — usually
 * 'district' — and the plain-language layer stayed off: the KPI tile rendered
 * "seasonal baseline" instead of "Usual level". Only the ?tier=beat deep link
 * flipped it. Setting the tier from the route makes both paths agree, and
 * matches what the switcher already does when it navigates here. */
export function useTierRoute(tier) {
  const current = useTierStore((s) => s.tier);
  const setTier = useTierStore((s) => s.setTier);
  useEffect(() => {
    if (current !== tier) setTier(tier);
  }, [tier, current, setTier]);
}

/** 44 × 44 (i) button — the technical term behind a plain label on the
 * Beat / Station tiers (design correction 1). `label` is what the tooltip and
 * the accessible name carry; keep it a sentence. */
export function InfoButton({ label, className = '' }) {
  if (!label) return null;
  return (
    <Tooltip label={label} position="bottom" className={className}>
      <button
        type="button"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-primary hover:bg-grid/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
        aria-label={label}
      >
        {INFO}
      </button>
    </Tooltip>
  );
}

/** One of the three question sections: eyebrow question, optional status
 * pill, the plain sentence, then whatever evidence the caller passes. */
export function Question({ question, status, statusLabel, sentence, children, accent = false, className = '', id }) {
  const { t } = useI18n();
  return (
    <section id={id} className={`flex flex-col gap-2.5 px-4 py-3.5 ${accent ? 'border-l-2 border-l-signal' : ''} ${className}`} aria-labelledby={id ? `${id}-q` : undefined}>
      <h2 id={id ? `${id}-q` : undefined} className="eyebrow">{question}</h2>
      {(status || sentence) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {status && <StatusPill status={status} size="md" label={statusLabel} pulse={status === 'rising'} />}
          {sentence && <p className="text-[15px] leading-relaxed text-ink basis-full" data-readable="">{sentence}</p>}
        </div>
      )}
      {children}
      {!status && !sentence && !children && <p className="text-xs text-muted">{t('tier.empty')}</p>}
    </section>
  );
}

/** Tier page header: eyebrow (role) · title · date line · read-aloud + print. */
export function TierHeader({ eyebrow, title, sub, readTarget, onPrint, printLabel, children }) {
  const { t } = useI18n();
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title mt-0.5 truncate">{title}</h1>
        {sub && <p className="page-subtitle mt-0.5">{sub}</p>}
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        {children}
        {readTarget && <ReadPageButton targetId={readTarget} size="md" className="!h-11 !min-w-[44px]" />}
        {onPrint && (
          <button type="button" onClick={onPrint} className="btn min-h-[44px] text-xs">
            {PRINT}
            <span>{printLabel || t('common.action.print')}</span>
          </button>
        )}
      </div>
    </header>
  );
}

/** Station picker (44 px select) over GET /geo/stations; the API defaults to
 * the busiest scored station when nothing is chosen.
 *
 * `compact` drops the stacked label and renders the select alone so it can sit
 * in the tier header row — worth ~120 px of a 360-px fold. The helper line that
 * used to sit under the select is gone in both forms: it repeated the
 * placeholder option ('tier.unit.defaulted') word for word, and the
 * placeholder is what is on screen whenever no station has been chosen. */
export function UnitPicker({ value, onChange, className = '', compact = false }) {
  const { t, tName } = useI18n();
  const stations = useStations();
  const options = useMemo(() => {
    const rows = Array.isArray(stations.data) ? stations.data : [];
    return rows
      .map((s) => ({ unitId: String(s.unitId), name: s.unitName || String(s.unitId), district: tName('districts', s.districtId, s.districtName || '') }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stations.data, tName]);
  const select = (
    <select
      id="tier-unit"
      aria-label={t('tier.unit.aria')}
      value={value || ''}
      onChange={(e) => onChange(e.target.value || '')}
      className={compact ? 'input-dark min-h-[44px] max-w-[11rem] text-xs' : 'input-dark min-h-[44px] w-full text-sm'}
    >
      <option value="">{stations.isLoading ? t('tier.unit.loading') : t('tier.unit.defaulted')}</option>
      {options.map((o) => (
        <option key={o.unitId} value={o.unitId}>{o.name}{o.district ? ` · ${o.district}` : ''}</option>
      ))}
    </select>
  );
  if (compact) return <span className={`no-print inline-flex ${className}`}>{select}</span>;
  return (
    <div className={`no-print flex flex-col gap-1 ${className}`}>
      <label htmlFor="tier-unit" className="text-[11px] font-medium text-muted">{t('tier.unit.label')}</label>
      {select}
    </div>
  );
}

/** Loading / error / empty wrapper for a tier panel. */
export function PanelState({ query, height = 120, children, emptyWhen = false }) {
  const { t } = useI18n();
  if (query.isLoading) return <LoadingSkeleton height={height} />;
  if (query.isError) {
    return (
      <EmptyState
        compact
        title={t('tier.error', { message: query.error?.message || '—' })}
        action={<button type="button" className="btn min-h-[44px]" onClick={() => query.refetch()}>{t('tier.retry')}</button>}
      />
    );
  }
  if (emptyWhen) return <EmptyState compact title={t('tier.empty')} />;
  return children;
}

// --- pure helpers -----------------------------------------------------------

/** "Fri 28 Aug" in the UI language, from the real clock (design correction 3). */
export function todayLabel(lang, date = new Date()) {
  try {
    return new Intl.DateTimeFormat(lang === 'kn' ? 'kn-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(date);
  } catch {
    return date.toDateString().slice(0, 10);
  }
}

/** Hour-of-day (0–23) → band key shared with the API (night 21–05 …). */
export function bandKeyOfHour(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return null;
  if (n >= 21 || n < 5) return 'night';
  if (n < 12) return 'morning';
  if (n < 17) return 'afternoon';
  return 'evening';
}

/** Most common band among case rows ({band}) — null below 60 % agreement. */
export function dominantBand(rows) {
  const count = new Map();
  let total = 0;
  for (const r of rows || []) {
    const k = r.band || bandKeyOfHour(r.hour);
    if (!k) continue;
    total += 1;
    count.set(k, (count.get(k) || 0) + 1);
  }
  let best = null;
  for (const [k, n] of count) if (n / total >= 0.6 && (!best || n > count.get(best))) best = k;
  return best;
}

/** "23:00–03:00" for a hotspot's HourBandStart/End. */
export function hourRangeLabel(start, end) {
  const f = (h) => `${String(Number(h) || 0).padStart(2, '0')}:00`;
  return `${f(start)}–${f(end)}`;
}

/** Open-alert SLA clock reusing the /alerts policy (critical 4h · high 12h ·
 * medium 24h · low 48h) with the alert's own CreatedAt as the start. */
export function alertSla(alert, now = Date.now()) {
  const created = Date.parse(String(alert.createdAt || alert.periodEnd || '').replace(' ', 'T'));
  return slaFor(alert, Number.isFinite(created) ? created : now, now);
}

/** Hours → "36 h" / "3 d 2 h" style label via the tier namespace. */
export function ageLabel(hours, t) {
  const h = Math.max(0, Math.round(Number(hours) || 0));
  if (h < 48) return t('tier.hours', { n: h });
  return t('tier.days', { n: Math.round(h / 24) });
}
