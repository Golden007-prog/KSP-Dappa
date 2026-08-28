// Shared building blocks for the analytical-depth panels (Round-2 phase 8).
// Every panel: plain-language sentence first (PlainSentence over a glossary
// term), the method behind an (i), status = colour + glyph + word (StatusPill),
// loading / error / empty states, keyboard-reachable controls, print-safe.
import { useState } from 'react';
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import PlainSentence from '../../components/PlainSentence.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtNum } from '../../lib/format.js';

const INFO = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
  </svg>
);

/** (i) button revealing the method sentence; the longer API method text sits
 * in a print-only paragraph so a printed brief still carries the formula. */
export function MethodInfo({ text, detail }) {
  const t = useT();
  if (!text) return null;
  return (
    <>
      <Tooltip label={text} position="bottom">
        <button
          type="button"
          className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-full text-muted hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
          aria-label={`${t('depth.common.method')}: ${text}`}
        >
          {INFO}
        </button>
      </Tooltip>
      {detail && <p className="hidden print:block text-[10px] text-muted mt-1">{detail}</p>}
    </>
  );
}

/**
 * Card + plain sentence + states. Props: title, subtitle?, term (glossary key),
 * termVars?, method (short, translated), methodDetail? (API text, print only),
 * loading, error, onRetry, empty (bool), emptyTitle?, emptyMessage?, actions?, children.
 */
export function PanelFrame({
  title, subtitle, term, termVars, method, methodDetail, loading = false, error = null, onRetry,
  empty = false, emptyTitle, emptyMessage, actions, className = '', children,
}) {
  const t = useT();
  return (
    <Card
      title={title}
      subtitle={subtitle}
      className={className}
      actions={(
        <>
          {actions}
          <MethodInfo text={method} detail={methodDetail} />
        </>
      )}
    >
      {term && <PlainSentence term={term} vars={termVars} className="mb-3" />}
      {loading && <LoadingSkeleton lines={4} />}
      {!loading && error && (
        <EmptyState
          compact
          title={t('common.state.error')}
          message={error.message}
          action={onRetry && <button type="button" className="btn min-h-[44px]" onClick={onRetry}>{t('common.action.retry')}</button>}
        />
      )}
      {!loading && !error && empty && (
        <EmptyState compact title={emptyTitle || t('common.state.empty')} message={emptyMessage} />
      )}
      {!loading && !error && !empty && children}
    </Card>
  );
}

/** Small labelled figure. */
export function StatTile({ label, value, hint, tone = '' }) {
  return (
    <div className="bg-base/60 border border-grid rounded-lg px-3 py-2 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted truncate">{label}</p>
      <p className={`text-base font-semibold num text-ink ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted leading-snug">{hint}</p>}
    </div>
  );
}

/** Amber-intensity heat table. rows/cols = [{key,label}], value(r,c) → {v, label, sub?}. */
export function HeatMatrix({ rows, cols, value, caption, max = 1, corner = '', className = '' }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-[11px] border-separate border-spacing-0.5">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left text-muted font-normal px-1 py-0.5">{corner}</th>
            {cols.map((c) => <th key={c.key} scope="col" className="text-muted font-normal px-1 py-0.5 text-center whitespace-nowrap">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="text-left text-ink font-medium px-1 py-0.5 whitespace-nowrap">{r.label}</th>
              {cols.map((c) => {
                const cell = value(r, c) || {};
                const v = Number(cell.v);
                const a = Number.isFinite(v) && max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
                return (
                  <td
                    key={c.key}
                    className="text-center px-1 py-1 rounded num text-ink border border-grid/40 print:border-black"
                    style={{ backgroundColor: `rgba(245, 166, 35, ${(0.08 + a * 0.6).toFixed(2)})` }}
                    title={cell.title || ''}
                  >
                    <span>{cell.label ?? (Number.isFinite(v) ? fmtNum(v, 2) : '—')}</span>
                    {cell.sub !== undefined && <span className="block text-[9px] text-muted">{cell.sub}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal bars with optional CI whiskers. rows = [{label, value, lo?, hi?, tone?, hint?}]; domain [min,max]. */
export function Bars({ rows, min = 0, max = 100, unit = '', height = 22, zero = true }) {
  const span = max - min || 1;
  const x = (v) => `${Math.max(0, Math.min(100, ((v - min) / span) * 100))}%`;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-[11px]">
          <span className="truncate text-ink" title={r.label}>{r.label}</span>
          <div className="relative bg-grid/40 rounded h-4 overflow-hidden" style={{ height }}>
            {zero && min < 0 && <span className="absolute top-0 bottom-0 w-px bg-muted/60" style={{ left: x(0) }} aria-hidden="true" />}
            <span
              className={`absolute top-0 bottom-0 ${r.tone || 'bg-amber/70'}`}
              style={r.value >= 0 ? { left: x(Math.max(min, 0)), width: `calc(${x(r.value)} - ${x(Math.max(min, 0))})` } : { left: x(r.value), width: `calc(${x(0)} - ${x(r.value)})` }}
              aria-hidden="true"
            />
            {Number.isFinite(r.lo) && Number.isFinite(r.hi) && (
              <span className="absolute top-1/2 h-px bg-ink/80" style={{ left: x(r.lo), width: `calc(${x(r.hi)} - ${x(r.lo)})` }} aria-hidden="true" />
            )}
          </div>
          <span className="num text-ink whitespace-nowrap" title={r.hint || ''}>{fmtNum(r.value, 1)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Step-curve chart (Kaplan–Meier style). series = [{label, color, steps:[{t,s}]}],
 * x in days up to maxT, y 0..1. Renders an SVG plus a "Table" toggle with the
 * grid values so the figure has a text equivalent (WCAG 1.1.1).
 */
export function StepCurve({ series, maxT, grid, height = 160, ariaLabel }) {
  const t = useT();
  const [table, setTable] = useState(false);
  const W = 320; const H = height; const padL = 28; const padB = 18; const padT = 6; const padR = 6;
  const xs = (v) => padL + (Math.min(v, maxT) / maxT) * (W - padL - padR);
  const ys = (v) => padT + (1 - v) * (H - padT - padB);
  const path = (steps) => {
    let d = `M${xs(0).toFixed(1)},${ys(1).toFixed(1)}`;
    let cur = 1;
    for (const st of steps) {
      if (st.t > maxT) break;
      d += ` H${xs(st.t).toFixed(1)} V${ys(st.s).toFixed(1)}`;
      cur = st.s;
    }
    d += ` H${xs(maxT).toFixed(1)}`;
    return { d, end: cur };
  };
  const ticks = grid.filter((g) => g <= maxT);
  return (
    <div>
      <div className="flex justify-end">
        <button type="button" className="text-[11px] text-muted hover:text-ink underline-offset-2 hover:underline min-h-[44px] sm:min-h-0 px-1" onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {table ? t('depth.common.chart') : t('depth.common.table')}
        </button>
      </div>
      {!table && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={ys(v)} y2={ys(v)} stroke="currentColor" className="text-grid" strokeWidth="0.5" />
              <text x={padL - 3} y={ys(v) + 3} fontSize="7" textAnchor="end" fill="currentColor" className="text-muted">{Math.round(v * 100)}%</text>
            </g>
          ))}
          {ticks.map((g) => (
            <text key={g} x={xs(g)} y={H - 4} fontSize="7" textAnchor="middle" fill="currentColor" className="text-muted">{g}d</text>
          ))}
          {series.map((s) => {
            const p = path(s.steps || []);
            return <path key={s.label} d={p.d} fill="none" stroke={s.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />;
          })}
        </svg>
      )}
      {!table && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px]">
          {series.map((s) => (
            <li key={s.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="text-ink">{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      {table && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr>
                <th scope="col" className="text-left text-muted font-normal px-1">{t('depth.common.days')}</th>
                {series.map((s) => <th key={s.label} scope="col" className="text-right text-muted font-normal px-1">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ticks.map((g) => (
                <tr key={g} className="border-t border-grid/40">
                  <th scope="row" className="text-left font-normal text-ink px-1 num">{g}</th>
                  {series.map((s) => {
                    const pt = (s.grid || []).find((x) => x.t === g);
                    return <td key={s.label} className="text-right num px-1">{pt ? `${Math.round(pt.s * 100)}%` : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Tiny inline count sparkline (bars) for a short monthly series. */
export function MiniBars({ values, className = '' }) {
  const nums = (values || []).map((v) => Number(v) || 0);
  const max = Math.max(1, ...nums);
  return (
    <span className={`inline-flex items-end gap-px h-4 ${className}`} aria-hidden="true">
      {nums.map((v, i) => <span key={i} className="inline-block w-1 bg-amber/70" style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />)}
    </span>
  );
}

/** Status key for a domain word (StatusPill wants rising/watch/stable/falling/nodata). */
export function statusOf(word) {
  switch (word) {
    case 'escalating': case 'uplift': case 'new': case 'intensifying': case 'consecutive': case 'newHot': case 'reactivated': case 'exact-anchor': case 'linked':
      return 'rising';
    case 'persistent': case 'sporadic': case 'oscillating': case 'candidate': case 'watch': case 'persistentHot': case 'within-noise':
      return 'watch';
    case 'stable': case 'unchanged': case 'ok':
      return 'stable';
    case 'de-escalating': case 'dip': case 'diminishing': case 'historical': case 'cooled': case 'weak':
      return 'falling';
    default:
      return 'nodata';
  }
}
