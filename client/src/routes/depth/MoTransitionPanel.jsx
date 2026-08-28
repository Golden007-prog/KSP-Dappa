// Corpus MO transition matrix — which offence type tends to follow which
// across careers, with lift over the base rate. Data: GET /depth/mo-transitions.
import { useMemo } from 'react';
import { useDepthMoTransitions } from '../../lib/depthApi.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { PanelFrame, HeatMatrix, StatTile } from './DepthBits.jsx';

export default function MoTransitionPanel() {
  const t = useT();
  const tName = useNames();
  const q = useDepthMoTransitions();
  const d = q.data;
  const axis = useMemo(() => (d?.subHeads || []).map((s) => ({ key: String(s.id), label: tName('crimeSubHeads', s.id, s.name) })), [d, tName]);
  const summary = d?.summary || {};
  const maxP = useMemo(() => Math.max(0.05, ...(d?.matrix || []).flatMap((r) => r.to.map((c) => c.p || 0))), [d]);

  return (
    <PanelFrame
      title={t('depth.mo.title')}
      subtitle={d ? t('depth.mo.subtitle', { n: fmtInt(summary.transitions || 0), k: fmtInt((d.subHeads || []).length) }) : undefined}
      term="transition"
      termVars={{ stay: summary.stayShare === null || summary.stayShare === undefined ? '—' : Math.round(summary.stayShare * 100) }}
      method={t('depth.mo.method')}
      methodDetail={d?.method}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && !(summary.transitions > 0)}
      emptyMessage={t('depth.mo.empty')}
    >
      {d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <StatTile label={t('depth.mo.kpiTransitions')} value={fmtInt(summary.transitions)} />
            <StatTile label={t('depth.mo.kpiStay')} value={fmtPct((summary.stayShare || 0) * 100, { digits: 0 })} hint={t('depth.mo.kpiStayHint')} />
            <StatTile label={t('depth.mo.kpiTypes')} value={fmtInt(summary.distinctSubHeads)} />
          </div>
          <HeatMatrix
            rows={axis}
            cols={axis}
            corner={t('depth.mo.corner')}
            caption={t('depth.mo.matrixCaption')}
            max={maxP}
            value={(r, c) => {
              const row = d.matrix.find((m) => String(m.fromId) === r.key);
              const cell = row && row.to.find((x) => String(x.toId) === c.key);
              if (!cell || cell.p === null) return { v: 0, label: '—' };
              return { v: cell.p, label: fmtPct(cell.p * 100, { digits: 0 }), sub: fmtInt(cell.count), title: `${r.label} → ${c.label}` };
            }}
          />
          {d.topSwitches.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-ink mb-1">{t('depth.mo.switchesTitle')}</h3>
              <ul className="space-y-1 text-[12px]">
                {d.topSwitches.slice(0, 6).map((p) => (
                  <li key={`${p.fromId}-${p.toId}`} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-ink">{tName('crimeSubHeads', p.fromId, p.from)} → {tName('crimeSubHeads', p.toId, p.to)}</span>
                    <span className="num text-muted">{t('depth.mo.switchMeta', { n: fmtInt(p.count), p: fmtPct(p.pNext * 100, { digits: 0 }), lift: fmtNum(p.lift, 1) })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </PanelFrame>
  );
}
