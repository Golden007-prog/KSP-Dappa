// Emerging-trend watch — which offence types are spiking inside the current
// filter, right now.
//
// Method: anchor on the newest registration in the scan, take the last 30 days
// as the observation window and the 90 days before it as the baseline, then
// rate-normalise the baseline to a 30-day expectation. The score is the Poisson
// deviate (obs − exp) / √exp, which is the right yardstick for counts: +8 on an
// expected 4 is a genuine spike, +8 on an expected 400 is noise. A subhead is
// flagged (and pulses red) only when the deviate clears 2 AND the raw count is
// large enough to act on.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import PulseDot from '../../components/PulseDot.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { dateLabel, fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { readJson, writeJson } from './explorerState.js';
import { rowDay } from './deepScan.js';

const STORAGE_KEY = 'dappa-cases-emerging';
const RECENT_DAYS = 30;
const BASELINE_DAYS = 90;
const MIN_OBSERVED = 4;
const SPIKE_Z = 2;
const MIN_COVERAGE_DAYS = 21;

const dayNum = (isoDay) => Math.round(new Date(`${isoDay}T00:00:00`).getTime() / 86400000);
const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/** → [{name, headName, observed, expected, z, growthPct, spike, cooling}] */
export function emergingSubHeads(rows) {
  const days = [];
  for (const r of rows || []) {
    const d = rowDay(r);
    if (d) days.push(dayNum(d));
  }
  if (days.length < 20) return null;
  const anchor = Math.max(...days);
  const coverage = anchor - Math.min(...days) + 1;
  // 30-vs-90 is the right comparison when the scan reaches back far enough. It
  // is NOT what a default scan gives you: verified live, the newest 600 FIRs
  // span 17 days, and a fixed 30-day window would swallow the whole corpus and
  // leave an empty baseline — every subhead would read "+100%". So the windows
  // adapt to what was actually scanned, keeping the 1:3 recent:baseline ratio.
  const full = coverage >= RECENT_DAYS + BASELINE_DAYS;
  // Below three weeks the observation window collapses to a handful of days and
  // every subhead sits at one or two cases, where a growth percentage is noise
  // dressed as signal. Say so and ask for a deeper scan instead.
  if (coverage < MIN_COVERAGE_DAYS) return { tooShort: true, coverage, items: [] };
  const recentDays = full ? RECENT_DAYS : Math.max(5, Math.floor(coverage / 3));
  const baselineDays = full ? BASELINE_DAYS : coverage - recentDays;
  if (baselineDays < 5) return { tooShort: true, coverage, items: [] };
  const recentFrom = anchor - (recentDays - 1);
  const baseFrom = recentFrom - baselineDays;
  const stats = new Map();
  for (const r of rows || []) {
    const d = rowDay(r);
    if (!d) continue;
    const n = dayNum(d);
    const name = String(r.subHeadName || '').trim();
    if (!name) continue;
    if (!stats.has(name)) stats.set(name, { name, headName: r.headName || '', observed: 0, base: 0 });
    const s = stats.get(name);
    if (n >= recentFrom) s.observed += 1;
    else if (n >= baseFrom) s.base += 1;
  }
  const items = [...stats.values()].map((s) => {
    const expected = (s.base * recentDays) / baselineDays;
    const denom = Math.sqrt(Math.max(expected, 1));
    const z = (s.observed - expected) / denom;
    const growthPct = expected > 0 ? ((s.observed - expected) / expected) * 100 : (s.observed > 0 ? 100 : 0);
    return {
      ...s,
      expected,
      z,
      growthPct,
      spike: z >= SPIKE_Z && s.observed >= MIN_OBSERVED,
      cooling: z <= -SPIKE_Z && s.base >= MIN_OBSERVED * 3,
    };
  }).filter((s) => s.observed + s.base > 0);
  items.sort((a, b) => b.z - a.z);
  return {
    items,
    anchor: isoOf(anchor),
    recentFrom: isoOf(recentFrom),
    baseFrom: isoOf(baseFrom),
    recentDays,
    baselineDays,
    // Narrowed windows are still a valid comparison, but the reader must know
    // the growth figures rest on days rather than months.
    shallow: !full,
    coverage,
  };
}

export default function EmergingWatch({ rows, scopeLabel, onApply }) {
  const t = useT();
  const trName = useCaseNames();
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, true) !== false);
  const model = useMemo(() => emergingSubHeads(rows), [rows]);

  if (!model) return null;
  if (model.tooShort) {
    return (
      <Card title={t('cases.emerging.title')} subtitle={t('cases.emerging.needDepthSub')}>
        <p className="text-xs text-muted">{t('cases.emerging.needDepth', { d: fmtInt(model.coverage), min: MIN_COVERAGE_DAYS })}</p>
      </Card>
    );
  }
  if (model.items.length < 2) return null;

  const toggle = () => setOpen((o) => { writeJson(STORAGE_KEY, !o); return !o; });
  const spikes = model.items.filter((s) => s.spike);

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate inline-flex items-center gap-1.5">
            {spikes.length > 0 && <PulseDot />}
            {t('cases.emerging.collapsed', { n: fmtInt(spikes.length) })}
          </p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded={false}>
            {t('cases.profile.show')}
          </button>
        </div>
      </Card>
    );
  }

  const apply = (name) => {
    onApply?.(name);
  };

  const top = model.items.slice(0, 10);

  return (
    <Card
      title={t('cases.emerging.title')}
      subtitle={t('cases.emerging.subtitle', {
        scope: scopeLabel,
        rd: model.recentDays,
        bd: model.baselineDays,
        recent: dateLabel(model.recentFrom),
        anchor: dateLabel(model.anchor),
      })}
      className={spikes.length > 0 ? '!border-signal/50' : ''}
      actions={(
        <div className="flex items-center gap-2">
          {spikes.length > 0 && <Badge tone="red" pulse>{t('cases.emerging.spikes', { n: spikes.length })}</Badge>}
          <button type="button" className="btn !py-1 !px-2 text-xs" onClick={toggle} aria-expanded>{t('cases.profile.hide')}</button>
        </div>
      )}
    >
      {model.shallow && (
        <p className="text-[11px] text-amber mb-2">
          {t('cases.emerging.shallow', { d: fmtInt(model.coverage), rd: model.recentDays, bd: model.baselineDays })}
        </p>
      )}
      <div className="space-y-1.5">
        {top.map((s) => {
          const label = trName('crimeSubHeads', s.name);
          const pctLabel = `${s.growthPct >= 0 ? '+' : ''}${Math.round(s.growthPct)}%`;
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => apply(s.name)}
              title={t('cases.emerging.rowTip', { name: label })}
              className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors min-h-[40px] ${
                s.spike
                  ? 'border-signal/50 bg-signal/10 hover:border-signal'
                  : s.cooling
                    ? 'border-teal/40 hover:border-teal/70'
                    : 'border-grid/60 hover:border-amber/40'
              }`}
            >
              {s.spike && <PulseDot />}
              <span className="min-w-0 flex-1 truncate text-xs text-ink">{label}</span>
              <span className="num text-[11px] text-muted shrink-0">
                {t('cases.emerging.obsExp', { obs: fmtInt(s.observed), exp: s.expected.toFixed(1) })}
              </span>
              <span className={`num text-[11px] font-medium shrink-0 w-14 text-right ${
                s.spike ? 'text-signal' : s.cooling ? 'text-teal' : 'text-muted'
              }`}
              >
                {pctLabel}
              </span>
              <span className="num text-[10px] text-muted shrink-0 w-12 text-right">
                z {s.z >= 0 ? '+' : ''}{s.z.toFixed(1)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted mt-2">
        <Tooltip label={t('cases.emerging.methodTip')}>
          <span className="cursor-help underline decoration-dotted underline-offset-2">{t('cases.emerging.method')}</span>
        </Tooltip>
        {' · '}
        {t('cases.emerging.baseline', { from: dateLabel(model.baseFrom), to: dateLabel(model.recentFrom) })}
      </p>
    </Card>
  );
}
