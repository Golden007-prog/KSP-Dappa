// Travelling-offender corridors — district-hop sequences across careers drawn
// as arcs between district centroids, with the busiest corridors and the most
// mobile persons. Data: GET /depth/corridors.
import { Link } from 'react-router-dom';
import { useDepthCorridors } from '../../lib/depthApi.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import ArcMap from './ArcMap.jsx';
import { PanelFrame, SampleLine, StatTile } from './DepthBits.jsx';

export default function CorridorPanel() {
  const t = useT();
  const tName = useNames();
  const q = useDepthCorridors();
  const d = q.data;
  const s = d?.summary || {};
  const dn = (id, name) => tName('districts', id, name);
  return (
    <PanelFrame
      title={t('depth.corridor.title')}
      subtitle={d ? t('depth.corridor.subtitle', { n: fmtInt(s.corridors || 0), hops: fmtInt(s.hops || 0) }) : undefined}
      term="corridor"
      termVars={{ pct: s.shareTravelling === null || s.shareTravelling === undefined ? '—' : Math.round(s.shareTravelling * 100), n: fmtInt(s.travellers || 0) }}
      method={t('depth.corridor.method')}
      methodDetail={d?.method}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && !(s.hops > 0)}
      emptyMessage={t('depth.corridor.empty')}
    >
      {d && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <StatTile label={t('depth.corridor.kpiTravellers')} value={fmtInt(s.travellers)} hint={fmtPct((s.shareTravelling || 0) * 100, { digits: 0 })} />
              <StatTile label={t('depth.corridor.kpiHops')} value={fmtInt(s.hops)} />
              <StatTile label={t('depth.corridor.kpiCorridors')} value={fmtInt(s.corridors)} />
            </div>
            <ArcMap
              height={280}
              fit="karnataka"
              ariaLabel={t('depth.corridor.mapAria', { n: fmtInt(d.arcs.length) })}
              arcs={d.arcs.map((a) => ({ fromLat: a.fromLat, fromLng: a.fromLng, toLat: a.toLat, toLng: a.toLng, weight: a.hops, label: `${dn(a.from, a.fromName)} ⇄ ${dn(a.to, a.toName)} · ${a.hops}` }))}
            />
          </div>
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-ink mb-1">{t('depth.corridor.topTitle')}</h3>
              <ol className="space-y-1 text-[12px]">
                {d.arcs.slice(0, 8).map((a) => (
                  <li key={`${a.from}~${a.to}`} className="flex items-baseline justify-between gap-2">
                    <span className="text-ink truncate">{dn(a.from, a.fromName)} ⇄ {dn(a.to, a.toName)}</span>
                    <span className="num text-muted whitespace-nowrap">{t('depth.corridor.arcMeta', { hops: fmtInt(a.hops), persons: fmtInt(a.persons) })}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-ink mb-1">{t('depth.corridor.travellersTitle')}</h3>
              <ol className="space-y-1 text-[12px]">
                {d.travellers.slice(0, 6).map((p) => (
                  <li key={p.personKey} className="flex items-baseline justify-between gap-2">
                    {/* py keeps the row link ≥ 24 px tall — at the bare 18 px
                        line box the stacked links failed WCAG 2.5.8 spacing. */}
                    <Link to={`/offenders/${encodeURIComponent(p.personKey)}`} className="text-primary hover:underline truncate py-[3px]">{p.name}</Link>
                    <span className="num text-muted whitespace-nowrap">{t('depth.corridor.travellerMeta', { hops: fmtInt(p.hops), d: fmtInt(p.districts) })}</span>
                  </li>
                ))}
              </ol>
            </div>
            <SampleLine scan={d.scan} />
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
