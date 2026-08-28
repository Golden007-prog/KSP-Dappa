// Day-level registration heat grid over the scanned corpus — the temporal half
// of "statistical spatial and temporal hotspots". The monthly density chart
// answers "which month"; this answers "which day", which is what actually drives
// a shift roster: weekday columns make market days, weekend spikes and
// festival clusters visible at a glance, and a click drills the explorer to that
// single day.
//
// Rendered as plain elements rather than a chart: a 53×7 grid of 11px cells
// scrolls cleanly at 360px and prints without a canvas rasterisation step.
import { useId, useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { readJson, writeJson } from './explorerState.js';
import { rowDay } from './deepScan.js';

const STORAGE_KEY = 'dappa-cases-calendar';
const MAX_WEEKS = 53;
const DAY_KEYS = ['cases.insights.day.mon', 'cases.insights.day.tue', 'cases.insights.day.wed',
  'cases.insights.day.thu', 'cases.insights.day.fri', 'cases.insights.day.sat', 'cases.insights.day.sun'];
const MONTH_KEYS = ['cases.cal.m1', 'cases.cal.m2', 'cases.cal.m3', 'cases.cal.m4', 'cases.cal.m5', 'cases.cal.m6',
  'cases.cal.m7', 'cases.cal.m8', 'cases.cal.m9', 'cases.cal.m10', 'cases.cal.m11', 'cases.cal.m12'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Monday-first weekday index. */
const mondayIdx = (d) => (d.getDay() + 6) % 7;

export default function RegistrationCalendar({ rows, onDayClick, scopeLabel }) {
  const dayInputId = useId();
  const t = useT();
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, true) !== false);

  const model = useMemo(() => {
    const counts = new Map();
    for (const r of rows || []) {
      const day = rowDay(r);
      if (day) counts.set(day, (counts.get(day) || 0) + 1);
    }
    if (counts.size < 2) return null;
    const days = [...counts.keys()].sort();
    const last = new Date(`${days[days.length - 1]}T00:00:00`);
    const first = new Date(`${days[0]}T00:00:00`);
    // Grid starts on the Monday of the first week and ends on the Sunday of the
    // last, clipped to MAX_WEEKS so a multi-year filter stays readable.
    const end = new Date(last);
    end.setDate(end.getDate() + (6 - mondayIdx(end)));
    let start = new Date(first);
    start.setDate(start.getDate() - mondayIdx(start));
    const spanWeeks = Math.round((end - start) / (7 * 86400000)) + 1;
    let clipped = false;
    if (spanWeeks > MAX_WEEKS) {
      start = new Date(end);
      start.setDate(start.getDate() - (MAX_WEEKS * 7 - 1));
      clipped = true;
    }
    const weeks = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const col = [];
      for (let i = 0; i < 7; i += 1) {
        const key = iso(cursor);
        col.push({ key, count: counts.get(key) || 0, month: cursor.getMonth(), date: cursor.getDate() });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(col);
    }
    let max = 0;
    let busiest = null;
    for (const [k, v] of counts) {
      if (v > max) { max = v; busiest = k; }
    }
    const covered = counts.size;
    const gridDays = weeks.length * 7;
    return { weeks, max, busiest, busiestCount: max, covered, gridDays, clipped, first: days[0], last: days[days.length - 1] };
  }, [rows]);

  if (!model) return null;

  const toggle = () => setOpen((o) => { writeJson(STORAGE_KEY, !o); return !o; });

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate">{t('cases.cal.collapsed', { n: fmtInt(model.covered) })}</p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded={false}>
            {t('cases.profile.show')}
          </button>
        </div>
      </Card>
    );
  }

  const tone = (count) => {
    if (!count) return 'rgb(var(--t-grid) / 0.4)';
    const a = 0.18 + 0.72 * Math.min(1, count / (model.max || 1));
    return `rgb(var(--t-amber) / ${a.toFixed(2)})`;
  };

  // Month rulers above the grid — one label per week whose Monday starts a month.
  const monthMarks = model.weeks.map((w, i) => {
    const firstOfMonth = w.find((d) => d.date <= 7);
    return firstOfMonth && (i === 0 || model.weeks[i - 1].every((d) => d.month !== firstOfMonth.month))
      ? t(MONTH_KEYS[firstOfMonth.month])
      : '';
  });

  return (
    <Card
      title={t('cases.cal.title')}
      subtitle={t('cases.cal.subtitle', { scope: scopeLabel })}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {/* WCAG 2.5.8 "Equivalent": the 11-px heat cells are the whole point
              of a year-at-a-glance grid and cannot be 24 px, so the same
              function — filter the list to one day — is offered by this
              conforming control, and each cell points at it with
              data-a11y-equivalent. It is also simply the faster way in for
              anyone who already knows the date. */}
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            <span>{t('cases.cal.pickDay')}</span>
            <input
              id={dayInputId}
              type="date"
              className="input-dark !py-1 !px-2 text-xs min-h-[32px]"
              min={model.first}
              max={model.last}
              onChange={(e) => e.target.value && onDayClick?.(e.target.value)}
            />
          </label>
          <button type="button" className="btn !py-1 !px-2 text-xs" onClick={toggle} aria-expanded>{t('cases.profile.hide')}</button>
        </div>
      )}
    >
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="inline-flex gap-1.5 min-w-min">
          <div className="flex flex-col gap-[3px] pt-[15px] shrink-0">
            {DAY_KEYS.map((k, i) => (
              <span key={k} className="h-[11px] text-[9px] leading-[11px] text-muted pr-0.5 text-right w-6">
                {i % 2 === 0 ? t(k) : ''}
              </span>
            ))}
          </div>
          <div className="min-w-min">
            <div className="flex gap-[3px] h-[12px] mb-[3px]">
              {monthMarks.map((m, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <span key={i} className="w-[11px] text-[9px] leading-[12px] text-muted whitespace-nowrap overflow-visible">{m}</span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {model.weeks.map((week, wi) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell) => (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={!cell.count}
                      onClick={() => cell.count && onDayClick?.(cell.key)}
                      title={cell.count
                        ? t('cases.cal.cellTip', { date: dateLabel(cell.key), n: fmtInt(cell.count) })
                        : t('cases.cal.cellEmpty', { date: dateLabel(cell.key) })}
                      aria-label={cell.count
                        ? t('cases.cal.cellTip', { date: dateLabel(cell.key), n: fmtInt(cell.count) })
                        : undefined}
                      data-a11y-equivalent={dayInputId}
                      className={`h-[11px] w-[11px] rounded-[2px] transition-transform ${
                        cell.count ? 'cursor-pointer hover:scale-150 hover:ring-1 hover:ring-amber' : 'cursor-default'
                      }`}
                      style={{ backgroundColor: tone(cell.count) }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-2">
          <Tooltip label={t('cases.cal.busiestTip')}>
            <span className="chip !py-0.5 num cursor-help">
              {t('cases.cal.busiest', { date: dateLabel(model.busiest), n: fmtInt(model.busiestCount) })}
            </span>
          </Tooltip>
          <span className="num">{t('cases.cal.coverage', { d: fmtInt(model.covered), total: fmtInt(model.gridDays) })}</span>
          {model.clipped && <span className="text-amber">{t('cases.cal.clipped', { w: MAX_WEEKS })}</span>}
        </span>
        <span className="inline-flex items-center gap-1">
          {t('cases.cal.less')}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <span
              key={f}
              aria-hidden="true"
              className="h-[10px] w-[10px] rounded-[2px] inline-block"
              style={{ backgroundColor: f === 0 ? 'rgb(var(--t-grid) / 0.4)' : `rgb(var(--t-amber) / ${(0.18 + 0.72 * f).toFixed(2)})` }}
            />
          ))}
          {t('cases.cal.more')}
        </span>
      </div>
    </Card>
  );
}
