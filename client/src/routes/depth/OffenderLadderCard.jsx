// Per-offender escalation ladder — the person's dated cases placed on the
// four-rung gravity ladder (same scale as the corpus matrix), the rung
// sequence drawn as a staircase, and their own transition tally.
// Runs off the /offenders/:personKey timeline the page already holds.
import { useMemo } from 'react';
import StatusPill from '../../components/StatusPill.jsx';
import PlainSentence from '../../components/PlainSentence.jsx';
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { GRAVITY } from '../offenders/behaviour.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';
import { MethodInfo, HeatMatrix, statusOf } from './DepthBits.jsx';

const BANDS = ['petty', 'moderate', 'serious', 'heinous'];
const HEAD_FALLBACK = { 'Crimes Against Body': 8, 'Crimes Against Women': 8, Narcotics: 5, 'Property Crimes': 4, 'Public Order': 3, 'Economic Offences': 3, 'Cyber Crimes': 3, Others: 1 };
const gravityOf = (row) => GRAVITY[row.subHeadName] || HEAD_FALLBACK[row.headName] || 1;
const bandOf = (g) => (g >= 9 ? 3 : g >= 6 ? 2 : g >= 4 ? 1 : 0);

export function ladderOf(timeline) {
  const rows = (timeline || []).filter((r) => r.registeredDate).map((r) => ({ ...r, g: gravityOf(r), band: bandOf(gravityOf(r)) }))
    .sort((a, b) => String(a.registeredDate).localeCompare(String(b.registeredDate)));
  const counts = BANDS.map(() => BANDS.map(() => 0));
  for (let i = 1; i < rows.length; i += 1) counts[rows[i - 1].band][rows[i].band] += 1;
  const mid = Math.floor(rows.length / 2);
  const mean = (xs) => (xs.length ? xs.reduce((s, r) => s + r.g, 0) / xs.length : null);
  const early = mean(rows.slice(0, mid));
  const late = mean(rows.slice(mid));
  const delta = early === null || late === null ? null : late - early;
  const net = rows.length ? rows[rows.length - 1].band - rows[0].band : 0;
  let verdict = 'insufficient';
  if (rows.length >= 3) verdict = delta >= 1 || (net > 0 && delta > 0) ? 'escalating' : delta <= -1 || net < 0 ? 'de-escalating' : 'stable';
  return { rows, counts, early, late, delta, net, verdict, peak: rows.length ? Math.max(...rows.map((r) => r.band)) : null };
}

export default function OffenderLadderCard({ timeline }) {
  const t = useT();
  const L = useMemo(() => ladderOf(timeline), [timeline]);
  const axis = BANDS.map((b) => ({ key: b, label: t(`depth.band.${b}`) }));
  const W = 300; const H = 70; const padL = 8; const padR = 8;
  const n = L.rows.length;
  const x = (i) => padL + (n > 1 ? (i / (n - 1)) * (W - padL - padR) : (W - padL - padR) / 2);
  const y = (b) => 58 - b * 16;
  const path = L.rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.band)}`).join(' ');
  return (
    <Card
      title={t('depth.o360.ladderTitle')}
      subtitle={t('depth.o360.ladderSub', { n: fmtInt(n) })}
      actions={<MethodInfo text={t('depth.o360.ladderMethod')} />}
    >
      <PlainSentence term="ladder" vars={{ up: L.counts.reduce((s, row, i) => s + row.slice(i + 1).reduce((a, b) => a + b, 0), 0), down: L.counts.reduce((s, row, i) => s + row.slice(0, i).reduce((a, b) => a + b, 0), 0) }} className="mb-3" />
      {n < 2 ? (
        <EmptyState compact title={t('depth.o360.ladderEmpty')} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={statusOf(L.verdict)} label={t(`depth.verdict.${L.verdict}`)} />
            <span className="text-[11px] text-muted num">{t('depth.o360.ladderDelta', { early: fmtNum(L.early, 1), late: fmtNum(L.late, 1) })}</span>
            <span className="text-[11px] text-muted">{t('depth.o360.ladderPeak', { band: t(`depth.band.${BANDS[L.peak]}`) })}</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('depth.o360.ladderAria', { n: fmtInt(n) })}>
            {BANDS.map((b, i) => (
              <g key={b}>
                <line x1={padL} x2={W - padR} y1={y(i)} y2={y(i)} stroke="currentColor" className="text-grid" strokeWidth="0.5" />
                <text x={W - padR} y={y(i) - 2} fontSize="6" textAnchor="end" fill="currentColor" className="text-muted">{t(`depth.band.${b}`)}</text>
              </g>
            ))}
            <path d={path} fill="none" stroke="currentColor" className="text-amber" strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {L.rows.map((r, i) => (
              <circle key={r.caseMasterId || i} cx={x(i)} cy={y(r.band)} r="2.2" fill="currentColor" className="text-amber">
                <title>{`${dateLabel(r.registeredDate)} · ${r.subHeadName} · ${t(`depth.band.${BANDS[r.band]}`)}`}</title>
              </circle>
            ))}
          </svg>
          <HeatMatrix
            rows={axis}
            cols={axis}
            corner={t('depth.ladder.corner')}
            caption={t('depth.o360.ladderMatrixCaption')}
            max={Math.max(1, ...L.counts.flat())}
            value={(r, c) => {
              const v = L.counts[BANDS.indexOf(r.key)][BANDS.indexOf(c.key)];
              return { v, label: v ? fmtInt(v) : '·' };
            }}
          />
        </div>
      )}
    </Card>
  );
}
