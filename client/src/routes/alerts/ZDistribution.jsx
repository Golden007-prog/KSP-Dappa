// /alerts — deviation profile of the loaded corpus.
//
// A single alert says "z = 4.2". A histogram of every alert's z says what the
// week actually looks like: whether the tail is thick, whether the district is
// full of marginal 2σ noise, and — the part the console used to hide entirely —
// how many alerts are COLLAPSES in reporting (negative z) rather than spikes.
// Bins are half-σ wide over the signed z so surge and drop stay on opposite
// sides of zero; clicking a bin filters the feed to that band.
import { useMemo } from 'react';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { direction } from './severity.js';

const BIN = 0.5;
const CLAMP = 6; // |z| beyond this piles into the end bins

export default function ZDistribution({ alerts, minAbsZ, onPick }) {
  const t = useT();

  const model = useMemo(() => {
    const bins = new Map();
    let up = 0;
    let down = 0;
    let maxAbs = 0;
    let sum = 0;
    let counted = 0;
    for (const a of alerts) {
      const z = Number(a.zScore);
      if (!Number.isFinite(z)) continue;
      const clamped = Math.max(-CLAMP, Math.min(CLAMP, z));
      const idx = Math.floor(clamped / BIN);
      bins.set(idx, (bins.get(idx) || 0) + 1);
      if (direction(a) === 'down') down += 1; else up += 1;
      maxAbs = Math.max(maxAbs, Math.abs(z));
      sum += Math.abs(z);
      counted += 1;
    }
    if (!counted) return null;
    const idxs = [...bins.keys()].sort((a, b) => a - b);
    const lo = idxs[0];
    const hi = idxs[idxs.length - 1];
    const cells = [];
    for (let i = lo; i <= hi; i += 1) {
      const from = i * BIN;
      cells.push({ i, from, to: from + BIN, n: bins.get(i) || 0 });
    }
    const peak = Math.max(...cells.map((c) => c.n), 1);
    return { cells, peak, up, down, maxAbs, meanAbs: sum / counted, counted };
  }, [alerts]);

  if (!model) {
    return <p className="text-xs text-muted">{t('alerts.intel.noZ')}</p>;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Badge tone="red">{t('alerts.intel.surges', { n: fmtInt(model.up) })}</Badge>
        <Badge tone="teal">{t('alerts.intel.drops', { n: fmtInt(model.down) })}</Badge>
        <span className="num text-muted">{t('alerts.intel.meanAbsZ', { v: fmtNum(model.meanAbs, 2) })}</span>
        <span className="num text-muted">{t('alerts.intel.maxAbsZ', { v: fmtNum(model.maxAbs, 2) })}</span>
      </div>

      <div
        className="flex items-end gap-[2px] overflow-x-auto no-scrollbar"
        role="group"
        aria-label={t('alerts.intel.zAria')}
      >
        {model.cells.map((c) => {
          const h = Math.max(3, Math.round((c.n / model.peak) * 76));
          const drop = c.to <= 0;
          const hot = Math.abs(c.from) >= 4 || Math.abs(c.to) >= 4;
          const label = t('alerts.intel.zBin', {
            from: fmtNum(c.from, 1), to: fmtNum(c.to, 1), n: fmtInt(c.n),
          });
          return (
            <Tooltip key={c.i} label={label}>
              <button
                type="button"
                onClick={() => onPick?.(Math.abs(c.from) >= Math.abs(c.to) ? Math.abs(c.to) : Math.abs(c.from))}
                aria-label={label}
                className="group flex w-[14px] shrink-0 flex-col justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                style={{ height: 84 }}
              >
                <span
                  className={`block w-full rounded-t-sm transition-colors ${
                    drop ? 'bg-teal/60 group-hover:bg-teal' : hot ? 'bg-signal/80 group-hover:bg-signal' : 'bg-amber/70 group-hover:bg-amber'
                  }`}
                  style={{ height: h }}
                />
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-muted">{t('alerts.intel.zThreshold')}</span>
        {[0, 2, 3, 4].map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={Number(minAbsZ) === v}
            onClick={() => onPick?.(v)}
            className={`chip !py-0.5 min-h-[40px] sm:min-h-[24px] transition-colors ${
              Number(minAbsZ) === v ? '!border-primary/60 !text-primary' : 'hover:border-primary/40'
            }`}
          >
            {v === 0 ? t('alerts.intel.zAny') : `|z| ≥ ${v}`}
          </button>
        ))}
      </div>
      <p className="text-[10px] leading-tight text-muted">{t('alerts.intel.zNote')}</p>
    </div>
  );
}
