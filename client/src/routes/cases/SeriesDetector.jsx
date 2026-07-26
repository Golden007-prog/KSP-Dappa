// Crime-series detector — statistical pattern discovery over the scanned corpus.
//
// A "series" here is the classic crime-analysis definition: the same offence
// type recurring at the same police station with no gap larger than the chosen
// window. Chaining on the GAP (rather than binning by calendar month) is what
// makes it a series and not a monthly count — three burglaries on the 29th, 31st
// and 2nd are one run across two months, and a month histogram splits them.
//
// Every series is one tap from becoming an explorer filter, a clipboard list of
// CrimeNos for the case diary, or a loaded compare tray.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { useLookups } from '../../lib/api.js';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { readJson, writeJson } from './explorerState.js';
import { rowDay } from './deepScan.js';

const STORAGE_KEY = 'dappa-cases-series';
const WINDOW_KEY = 'dappa-cases-series-window';
const WINDOWS = [3, 7, 14, 30];
const MIN_SIZES = [3, 4, 5];
const MAX_CARDS = 12;

const dayNum = (isoDay) => Math.round(new Date(`${isoDay}T00:00:00`).getTime() / 86400000);

/**
 * Chain rows into runs: same (station, subhead) and consecutive registrations
 * never more than `windowDays` apart. Returns runs of at least `minSize`.
 * The group key is only a Map handle — station and subhead ride alongside it,
 * because station names contain spaces and would not survive a re-split.
 */
export function detectSeries(rows, windowDays, minSize) {
  const groups = new Map();
  for (const r of rows || []) {
    const day = rowDay(r);
    const station = String(r.unitName || '').trim();
    const sub = String(r.subHeadName || '').trim();
    if (!day || !station || !sub) continue;
    const key = `${station}||${sub}`;
    if (!groups.has(key)) groups.set(key, { station, sub, list: [] });
    groups.get(key).list.push({ ...r, _day: day, _n: dayNum(day) });
  }
  const out = [];
  for (const [key, group] of groups) {
    const { station, sub, list } = group;
    if (list.length < minSize) continue;
    list.sort((a, b) => a._n - b._n);
    let run = [list[0]];
    const flush = () => {
      if (run.length < minSize) return;
      const span = run[run.length - 1]._n - run[0]._n;
      out.push({
        id: `${key}|${run[0]._day}`,
        station,
        subHead: sub,
        headName: run[0].headName || '',
        districtName: run[0].districtName || '',
        from: run[0]._day,
        to: run[run.length - 1]._day,
        spanDays: span + 1,
        count: run.length,
        perWeek: (run.length / (span + 1)) * 7,
        anomalies: run.filter((r) => r.anomalyFlag).length,
        heinous: run.filter((r) => /hein/i.test(String(r.gravityName || ''))).length,
        rows: run,
      });
    };
    for (let i = 1; i < list.length; i += 1) {
      if (list[i]._n - run[run.length - 1]._n <= windowDays) run.push(list[i]);
      else { flush(); run = [list[i]]; }
    }
    flush();
  }
  out.sort((a, b) => b.count - a.count || b.perWeek - a.perWeek);
  return out;
}

export default function SeriesDetector({ rows, scopeLabel, onApply, onCompare, onCopy, onOpenCase }) {
  const t = useT();
  const trName = useCaseNames();
  const lookups = useLookups();
  const lk = lookups.data;
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, true) !== false);
  const [cfg, setCfg] = useState(() => {
    const v = readJson(WINDOW_KEY, null);
    return {
      // 7 days by default: a default scan reaches back about a fortnight, so a
      // 14-day gap would call almost any three cases at one station a series.
      windowDays: WINDOWS.includes(v?.windowDays) ? v.windowDays : 7,
      minSize: MIN_SIZES.includes(v?.minSize) ? v.minSize : 3,
    };
  });
  const setConfig = (patch) => setCfg((prev) => {
    const next = { ...prev, ...patch };
    writeJson(WINDOW_KEY, next);
    return next;
  });

  const series = useMemo(
    () => detectSeries(rows, cfg.windowDays, cfg.minSize),
    [rows, cfg.windowDays, cfg.minSize],
  );

  const covered = series.reduce((n, s) => n + s.count, 0);
  const scanned = (rows || []).length;

  const toggle = () => setOpen((o) => { writeJson(STORAGE_KEY, !o); return !o; });

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate">{t('cases.series.collapsed', { n: fmtInt(series.length) })}</p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded={false}>
            {t('cases.profile.show')}
          </button>
        </div>
      </Card>
    );
  }

  // Series → explorer filter. The API returns names without ids, so the lookup
  // tables give us the ids GET /cases actually filters on.
  const applySeries = (s) => {
    const unit = (lk?.units || []).find((u) => u.unitName === s.station);
    const sub = (lk?.crimeSubHeads || []).find((x) => x.subHeadName === s.subHead);
    const patch = { from: s.from, to: s.to };
    if (unit) {
      patch.districtId = unit.districtId || '';
      patch.unitId = unit.unitId;
    }
    if (sub) {
      patch.crimeHeadId = String(Math.floor(Number(sub.crimeSubHeadId) / 100));
      patch.crimeSubHeadId = sub.crimeSubHeadId;
    }
    onApply?.(patch);
  };

  return (
    <Card
      title={t('cases.series.title')}
      subtitle={t('cases.series.subtitle', { scope: scopeLabel, w: cfg.windowDays, m: cfg.minSize })}
      actions={<button type="button" className="btn !py-1 !px-2 text-xs" onClick={toggle} aria-expanded>{t('cases.profile.hide')}</button>}
    >
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="inline-flex items-center gap-2 text-[11px] text-muted">
          {t('cases.series.window')}
          <SegmentedControl
            ariaLabel={t('cases.series.windowAria')}
            value={cfg.windowDays}
            onChange={(v) => setConfig({ windowDays: Number(v) })}
            options={WINDOWS.map((w) => ({ value: w, label: t('cases.series.windowOpt', { d: w }) }))}
          />
        </label>
        <label className="inline-flex items-center gap-2 text-[11px] text-muted">
          {t('cases.series.minSize')}
          <SegmentedControl
            ariaLabel={t('cases.series.minSizeAria')}
            value={cfg.minSize}
            onChange={(v) => setConfig({ minSize: Number(v) })}
            options={MIN_SIZES.map((m) => ({ value: m, label: String(m) }))}
          />
        </label>
        <span className="num text-[11px] text-muted">
          {t('cases.series.summary', {
            s: fmtInt(series.length),
            n: fmtInt(covered),
            pct: scanned ? Math.round((covered / scanned) * 100) : 0,
          })}
        </span>
      </div>

      {series.length === 0 ? (
        <p className="text-xs text-muted">{t('cases.series.none', { w: cfg.windowDays, m: cfg.minSize })}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {series.slice(0, MAX_CARDS).map((s) => (
            <div key={s.id} className="rounded-lg border border-grid/70 p-2.5 min-w-0 hover:border-amber/40 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate" title={s.station}>{s.station}</p>
                  <p className="text-[11px] text-muted truncate">{trName('crimeSubHeads', s.subHead)}</p>
                </div>
                <Badge tone={s.count >= 6 ? 'red' : 'amber'} pulse={s.count >= 6}>
                  {t('cases.series.count', { n: s.count })}
                </Badge>
              </div>
              <p className="num text-[11px] text-muted mt-1.5">
                {dateLabel(s.from)} → {dateLabel(s.to)} · {t('cases.series.span', { d: fmtInt(s.spanDays) })}
              </p>
              <p className="num text-[11px] text-muted">
                {t('cases.series.rate', { r: s.perWeek.toFixed(1) })}
                {s.heinous > 0 ? ` · ${t('cases.series.heinous', { n: s.heinous })}` : ''}
                {s.anomalies > 0 ? ` · ${t('cases.series.anomalies', { n: s.anomalies })}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button type="button" className="btn !py-1 !px-2 text-[11px]" onClick={() => applySeries(s)}>
                  {t('cases.series.filter')}
                </button>
                <button type="button" className="btn !py-1 !px-2 text-[11px]" onClick={() => onCompare?.(s.rows)}>
                  {t('cases.series.compare')}
                </button>
                <button type="button" className="btn-ghost !py-1 !px-2 text-[11px]" onClick={() => onCopy?.(s)}>
                  {t('cases.series.copy')}
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.rows.slice(0, 6).map((r) => (
                  <button
                    key={r.caseMasterId}
                    type="button"
                    className="chip num !py-0.5 !px-1.5 !text-[10px] hover:border-amber/60 hover:text-amber transition-colors"
                    onClick={() => onOpenCase?.(r)}
                    title={t('cases.series.openCase', { no: r.crimeNo })}
                  >
                    {String(r.crimeNo || '').slice(-5) || r.caseMasterId}
                  </button>
                ))}
                {s.rows.length > 6 && <span className="text-[10px] text-muted self-center">+{s.rows.length - 6}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {series.length > MAX_CARDS && (
        <p className="text-[11px] text-muted mt-2">{t('cases.series.more', { n: fmtInt(series.length - MAX_CARDS) })}</p>
      )}
    </Card>
  );
}
