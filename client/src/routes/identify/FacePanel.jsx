// Offender-360 face panel: the person's synthetic gallery image (SVG
// stand-in of the Stratus image of record), its quality-gate state and
// drawing traits, the recent searches that shortlisted this person, and a
// link into /identify. Mounted with one line in routes/Offender360.jsx.
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import Badge from '../../components/Badge.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { API_BASE } from '../../lib/api.js';
import { useFaceAudit, useFaceGallery } from '../../lib/faceApi.js';
import { useT } from '../../lib/i18n.jsx';

function when(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts || '') : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function FacePanel({ personKey }) {
  const t = useT();
  const gal = useFaceGallery({ personKey, perPage: 1 });
  const audit = useFaceAudit({ personKey, limit: 5 });
  const row = gal.data && gal.data.items[0];
  return (
    <Card title={t('identify.panel.title')} subtitle={t('identify.panel.subtitle')} actions={<Badge tone="amber">{t('identify.gallery.synthetic')}</Badge>}>
      {gal.isLoading ? <LoadingSkeleton height={120} /> : gal.error ? (
        <EmptyState compact title={t('common.state.error')} message={gal.error.message} action={<button type="button" className="btn min-h-[44px]" onClick={() => gal.refetch()}>{t('common.action.retry')}</button>} />
      ) : !row ? (
        <EmptyState compact title={t('identify.panel.none')} message={t('identify.panel.noneHint')} action={<Link to="/identify" className="btn min-h-[44px]">{t('identify.panel.compare')}</Link>} />
      ) : (
        <div className="flex gap-3">
          <img
            src={`${API_BASE}${row.thumbUrl}?size=160`}
            alt={t('identify.cand.thumbAlt', { name: row.name || row.personKey })}
            width="96"
            height="96"
            className={`h-24 w-24 shrink-0 rounded-lg border border-grid bg-canvas object-cover ${row.active ? '' : 'opacity-50 grayscale'}`}
          />
          <div className="min-w-0 flex-1 space-y-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill status={row.active ? 'stable' : 'nodata'} label={t(row.active ? 'identify.gallery.active' : 'identify.gallery.inactive')} />
              <Badge tone="slate">{t('identify.gallery.gate', { gate: (row.quality && row.quality.gate) || '—' })}</Badge>
              <Badge tone="slate">{row.source || '—'}</Badge>
            </div>
            <p className="text-muted">{t('identify.panel.traits')}: <span className="text-ink">{(row.traits || []).join(', ') || '—'}</span></p>
            <p className="text-[11px] text-muted num truncate" title={row.objectKey}>{t('identify.panel.record', { key: row.objectKey || '—' })}</p>
            <div className="pt-1">
              <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('identify.panel.searches')}</p>
              {audit.isLoading ? <LoadingSkeleton lines={2} /> : (audit.data && audit.data.items.length) ? (
                <ul className="space-y-1">
                  {audit.data.items.map((it) => {
                    const mine = (it.decisions || []).filter((d) => d.personKey === personKey);
                    const last = mine[mine.length - 1];
                    return (
                      <li key={it.searchId} className="flex flex-wrap items-center gap-1.5">
                        <span className="num text-ink">{when(it.ts)}</span>
                        <span className="num text-muted">{it.caseNo || '—'}</span>
                        {it.topPersonKey === personKey && typeof it.topConfidence === 'number' && <span className="num text-ink">{t('identify.cand.confidenceOf', { n: Math.round(it.topConfidence * 100) })}</span>}
                        {last ? <StatusPill status={last.decision === 'confirm' ? 'stable' : 'falling'} label={t(`identify.decision.${last.decision}`)} /> : <StatusPill status="nodata" label={t('identify.panel.undecided')} />}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-muted">{t('identify.panel.noSearches')}</p>}
            </div>
            <Link to="/identify" className="btn min-h-[44px] mt-1 inline-flex">{t('identify.panel.compare')}</Link>
          </div>
        </div>
      )}
    </Card>
  );
}
