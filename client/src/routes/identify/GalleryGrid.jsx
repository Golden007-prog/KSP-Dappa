// The synthetic gallery, paged, under the persistent "generated faces only"
// disclaimer. Thumbnails are SVG stand-ins drawn from the stored Seed; the
// image of record lives in Stratus and is what Zia compares.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import Badge from '../../components/Badge.jsx';
import { API_BASE } from '../../lib/api.js';
import { useFaceGallery } from '../../lib/faceApi.js';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const PER_PAGE = 24;

export default function GalleryGrid() {
  const t = useT();
  const [page, setPage] = useState(1);
  const q = useFaceGallery({ page, perPage: PER_PAGE });
  const items = q.data ? q.data.items : [];
  const total = q.data ? q.data.total : 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <Card
      title={t('identify.gallery.title')}
      subtitle={t('identify.gallery.subtitle', { n: fmtInt(total) })}
      actions={<Badge tone="amber">{t('identify.gallery.synthetic')}</Badge>}
    >
      {q.isLoading ? <LoadingSkeleton lines={6} /> : q.error ? (
        <EmptyState compact title={t('common.state.error')} message={q.error.message} action={<button type="button" className="btn min-h-[44px]" onClick={() => q.refetch()}>{t('common.action.retry')}</button>} />
      ) : items.length === 0 ? (
        <EmptyState compact title={t('identify.gallery.empty')} message={t('identify.gallery.emptyHint')} />
      ) : (
        <>
          <p className="text-[11px] text-muted mb-3">{q.data.disclaimer}</p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {items.map((it) => (
              <li key={it.personKey} className="rounded-xl border border-grid bg-canvas/50 p-2">
                <img
                  src={`${API_BASE}${it.thumbUrl}?size=160`}
                  alt={t('identify.cand.thumbAlt', { name: it.name || it.personKey })}
                  width="160"
                  height="160"
                  loading="lazy"
                  className={`w-full aspect-square rounded-lg border border-grid bg-canvas object-cover ${it.active ? '' : 'opacity-50 grayscale'}`}
                />
                <Link to={`/offenders/${encodeURIComponent(it.personKey)}`} className="mt-1.5 block text-xs font-medium text-ink hover:text-amber truncate min-h-[24px]">{it.name || it.personKey}</Link>
                <p className="num text-[10px] text-muted">{it.personKey}{typeof it.riskScore === 'number' ? ` · ${t('identify.cand.risk', { n: Math.round(it.riskScore) })}` : ''}</p>
                <p className="text-[10px] text-muted truncate" title={(it.traits || []).join(', ')}>{(it.traits || []).join(', ')}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={it.active ? 'teal' : 'slate'}>{t(it.active ? 'identify.gallery.active' : 'identify.gallery.inactive')}</Badge>
                  <Badge tone="slate">{t('identify.gallery.gate', { gate: (it.quality && it.quality.gate) || '—' })}</Badge>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted num">{t('identify.gallery.page', { page, pages })} · {t('identify.gallery.source', { s: q.data.meta.source || '—' })}</p>
            <div className="flex gap-2">
              <button type="button" className="btn min-h-[44px]" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('identify.gallery.prev')}</button>
              <button type="button" className="btn min-h-[44px]" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>{t('identify.gallery.next')}</button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
