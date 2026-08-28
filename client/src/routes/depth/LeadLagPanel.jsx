// Lead–lag cross-correlation between crime heads for the selected district
// (state-wide without one): does a rise in one head tend to be followed by a
// rise in another a month or two later? Data: GET /depth/lead-lag.
import { useMemo } from 'react';
import StatusPill from '../../components/StatusPill.jsx';
import { useDepthLeadLag } from '../../lib/depthApi.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { PanelFrame, HeatMatrix } from './DepthBits.jsx';

export default function LeadLagPanel({ districtId }) {
  const t = useT();
  const tName = useNames();
  const q = useDepthLeadLag({ districtId: districtId || undefined });
  const d = q.data;
  const heads = useMemo(() => (d?.heads || []).map((h) => ({ key: String(h.headId), label: tName('crimeHeads', h.headId, h.name) })), [d, tName]);
  const pairIndex = useMemo(() => new Map((d?.pairs || []).map((p) => [`${p.leader}>${p.follower}`, p])), [d]);
  // The significance screen itself — how many ordered pairs clear the 2/√n
  // noise line. The matrix draws every r; this says which of them survive it.
  const sig = useMemo(() => {
    const pairs = (d?.pairs || []).filter((p) => p.bestR !== null);
    return { tested: pairs.length, clear: pairs.filter((p) => p.significant).length };
  }, [d]);
  return (
    <PanelFrame
      title={t('depth.ll.title')}
      subtitle={d ? t('depth.ll.subtitle', { n: fmtInt(d.n), lag: fmtInt(d.maxLag) }) : undefined}
      term="leadlag"
      termVars={{ n: fmtInt((d?.leads || []).length), r: d ? fmtNum(d.threshold, 2) : '—' }}
      method={t('depth.ll.method')}
      methodDetail={d?.method}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && heads.length < 2}
      emptyMessage={t('depth.ll.empty')}
    >
      {d && heads.length >= 2 && (
        <div className="space-y-3">
          <HeatMatrix
            rows={heads}
            cols={heads}
            corner={t('depth.ll.corner')}
            caption={t('depth.ll.matrixCaption')}
            max={1}
            value={(r, c) => {
              if (r.key === c.key) return { v: 0, label: '·' };
              const p = pairIndex.get(`${r.key}>${c.key}`);
              if (!p || p.bestR === null) return { v: 0, label: '—' };
              return { v: Math.abs(p.bestR), label: fmtNum(p.bestR, 2), sub: t('depth.ll.lagN', { n: p.bestLag }), title: `${r.label} → ${c.label}: r ${fmtNum(p.bestR, 2)} @ +${p.bestLag}` };
            }}
          />
          <div>
            <h3 className="text-xs font-semibold text-ink mb-1">{t('depth.ll.leadsTitle')}</h3>
            <p className="text-[11px] text-muted mb-1">{t('depth.ll.screenLine', { k: fmtInt(sig.clear), total: fmtInt(sig.tested), r: fmtNum(d.threshold, 2), n: fmtInt(d.n) })}</p>
            {d.leads.length === 0 ? (
              <p className="text-[12px] text-muted">{t('depth.ll.noLeads', { r: fmtNum(d.threshold, 2) })}</p>
            ) : (
              <ul className="space-y-1">
                {d.leads.slice(0, 6).map((p) => (
                  <li key={`${p.leader}-${p.follower}`} className="flex flex-wrap items-center gap-2 text-[12px]">
                    <StatusPill status="watch" label={t('depth.ll.leadWord')} />
                    <span className="text-ink">{t('depth.ll.leadLine', { a: tName('crimeHeads', p.leader, p.leaderName), b: tName('crimeHeads', p.follower, p.followerName), k: p.bestLag, r: fmtNum(p.bestR, 2) })}</span>
                    {/* The matrix shows only the best-lag r; the same-month r says
                        whether the pair simply moves together or genuinely leads. */}
                    <span className="text-[11px] text-muted num">{t(p.r0 === null ? 'depth.ll.sameMonthNone' : Math.abs(p.r0) >= Math.abs(p.bestR) ? 'depth.ll.sameMonthStronger' : 'depth.ll.sameMonth', { r0: fmtNum(p.r0, 2) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
