// Behavioral analytics cards for Offender 360, computed client-side from the
// case timeline:
//   TempoCard   — recency, median inter-case gap, active span, and a last-12-mo
//                 vs prior-12-mo escalation delta (anchored at the offender's
//                 own latest case so historical profiles stay meaningful).
//   CaseMixCard — crime-head distribution with proportional bars.
// Both render nothing without enough timeline data.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import StatDelta from '../../components/StatDelta.jsx';
import { fmtInt } from '../../lib/format.js';

const DAY = 86400000;

function parseDay(s) {
  const t = Date.parse(String(s || '').slice(0, 10));
  return Number.isFinite(t) ? t : null;
}

function Tile({ label, children }) {
  return (
    <div className="bg-base/60 border border-grid rounded-lg px-3 py-2 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <div className="text-sm text-ink num mt-0.5 flex items-baseline gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

export function TempoCard({ timeline = [], lastSeen }) {
  const stats = useMemo(() => {
    const days = timeline
      .map((t) => parseDay(t?.registeredDate))
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    if (days.length < 2) return null;
    const gaps = [];
    for (let i = 1; i < days.length; i += 1) gaps.push((days[i] - days[i - 1]) / DAY);
    gaps.sort((a, b) => a - b);
    const median = gaps.length % 2
      ? gaps[(gaps.length - 1) / 2]
      : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
    const anchor = Math.max(days[days.length - 1], parseDay(lastSeen) ?? 0);
    const last12 = days.filter((d) => anchor - d < 365 * DAY).length;
    const prior12 = days.filter((d) => anchor - d >= 365 * DAY && anchor - d < 730 * DAY).length;
    const delta = prior12 > 0 ? ((last12 - prior12) / prior12) * 100 : null;
    return {
      median: Math.round(median),
      last12,
      prior12,
      delta,
      spanYears: (days[days.length - 1] - days[0]) / (365 * DAY),
      sinceLast: Math.max(0, Math.round((Date.now() - days[days.length - 1]) / DAY)),
    };
  }, [timeline, lastSeen]);

  if (!stats) return null;
  return (
    <Card title="Behavioral tempo" subtitle="Cadence and escalation from the case timeline">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Days since last case">{fmtInt(stats.sinceLast)}</Tile>
        <Tile label="Median gap">{fmtInt(stats.median)} d</Tile>
        <Tile label="Active span">{stats.spanYears.toFixed(1)} yr</Tile>
        <Tile label="Cases, last 12 mo">
          {fmtInt(stats.last12)}
          {stats.delta !== null && <StatDelta value={stats.delta} positiveIsGood={false} label="vs prior yr" />}
        </Tile>
      </div>
      <p className="text-[11px] text-muted mt-2">
        12-month windows are anchored at this person&apos;s latest case, so dormant profiles read historically.
      </p>
    </Card>
  );
}

const MIX_CAP = 6;

export function CaseMixCard({ timeline = [] }) {
  const mix = useMemo(() => {
    const freq = new Map();
    for (const t of timeline) {
      const k = String(t?.headName || '').trim();
      if (k) freq.set(k, (freq.get(k) || 0) + 1);
    }
    if (!freq.size) return null;
    const total = [...freq.values()].reduce((a, b) => a + b, 0);
    const rows = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MIX_CAP);
    return { rows, total, more: freq.size - rows.length };
  }, [timeline]);

  if (!mix) return null;
  return (
    <Card title="Case mix" subtitle="Crime heads across this person's linked FIRs">
      <ul className="space-y-2">
        {mix.rows.map(([name, n]) => {
          const pct = (n / mix.total) * 100;
          return (
            <li key={name} className="text-xs">
              <div className="flex items-center justify-between gap-2 mb-0.5 min-w-0">
                <span className="text-ink truncate">{name}</span>
                <span className="num text-muted shrink-0">{fmtInt(n)} · {pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-grid/40 overflow-hidden" aria-hidden="true">
                <div className="h-full bg-amber/80 rounded-full" style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {mix.more > 0 && <p className="text-[11px] text-muted mt-2">+{fmtInt(mix.more)} more crime head{mix.more === 1 ? '' : 's'}</p>}
    </Card>
  );
}
