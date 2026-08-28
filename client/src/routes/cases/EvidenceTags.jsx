// FIR detail — evidence-object tags (backlog rows 169 / 151).
//
// Each case is paired with one of the three synthetic scenes
// (client/public/samples/scenes, drawn by pipeline/scenes_generate.py) by a
// stable hash of its id, and POST /zia/objects returns the objects Zia
// recognised (flag on) or the shapes the generator drew (flag off / Zia
// returned nothing), with meta.source naming which. The object tags join the
// narrative's MO tags as object:<class> / weapon:<class> tokens. Bounding
// boxes are drawn over the image in scene pixels, so either engine's boxes
// render the same way. Zia's answer for the raw drawings is recorded in
// docs/round2/decisions-phase8-catalyst.md: one scene gave nothing, one gave
// "scissors" at 0.50 — the panel therefore always says what produced a tag.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import ChartTable from '../../components/ChartTable.jsx';
import { apiGet, apiPost } from '../../lib/api.js';
import { useT } from '../../lib/i18n.jsx';

const str = (v) => (v === undefined || v === null ? '' : String(v));

function hashId(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function useScenes() {
  return useQuery({
    queryKey: ['zia-object-scenes'],
    queryFn: ({ signal }) => apiGet('/zia/objects/samples', {}, { signal }).then((r) => ({
      scenes: Array.isArray(r.data && r.data.scenes) ? r.data.scenes : [],
      baseUrl: (r.data && r.data.baseUrl) || 'samples/scenes/',
    })),
    staleTime: 60 * 60 * 1000,
    retry: 0,
  });
}

function useEvidence(caseId, sceneId) {
  return useQuery({
    queryKey: ['zia-objects', String(caseId), str(sceneId)],
    queryFn: () => apiPost('/zia/objects', { sceneId, caseId: String(caseId) }),
    enabled: Boolean(sceneId && caseId),
    staleTime: 15 * 60 * 1000,
    retry: 0,
  });
}

function engineKey(source) {
  if (source === 'zia-objects') return 'surfaces.evidence.engine.zia';
  if (source === 'fixture') return 'surfaces.evidence.engine.fixture';
  return 'surfaces.evidence.engine.local';
}

export default function EvidenceTags({ caseId }) {
  const t = useT();
  const scenes = useScenes();
  const scene = useMemo(() => {
    const list = scenes.data ? scenes.data.scenes : [];
    if (!list.length || !caseId) return null;
    return list[hashId(caseId) % list.length];
  }, [scenes.data, caseId]);
  const ev = useEvidence(caseId, scene && scene.sceneId);
  const d = ev.data ? ev.data.data || {} : {};
  const source = str(ev.data && ev.data.meta && ev.data.meta.source);
  const objects = Array.isArray(d.objects) ? d.objects : [];
  const base = `${import.meta.env.BASE_URL}${(scenes.data && scenes.data.baseUrl) || 'samples/scenes/'}`;

  const rows = objects.map((o) => [
    str(o.label),
    o.confidence === null || o.confidence === undefined ? t('surfaces.evidence.noConfidence') : t('surfaces.evidence.confidence', { pct: Math.round(Number(o.confidence) * 100) }),
    (o.moTokens || []).join(' '),
    Array.isArray(o.box) ? o.box.join(', ') : '—',
  ]);

  return (
    <Card
      title={t('surfaces.evidence.title')}
      subtitle={t('surfaces.evidence.sub')}
      actions={ev.data ? <Badge tone={source === 'zia-objects' ? 'teal' : 'slate'}>{t(engineKey(source))}</Badge> : null}
    >
      {(scenes.isLoading || ev.isLoading) && <LoadingSkeleton height={220} />}
      {(scenes.error || ev.error) && !ev.isLoading && (
        <EmptyState compact title={t('surfaces.evidence.error')} message={(scenes.error || ev.error).message} action={<button type="button" className="btn" onClick={() => (scenes.error ? scenes.refetch() : ev.refetch())}>{t('surfaces.evidence.retry')}</button>} />
      )}
      {scene && ev.data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <figure className="min-w-0">
            <div className="relative w-full overflow-hidden rounded-lg border border-grid bg-base" style={{ aspectRatio: `${scene.width} / ${scene.height}` }}>
              <img src={`${base}${scene.file}`} alt={scene.title} className="absolute inset-0 h-full w-full object-contain" />
              <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${scene.width} ${scene.height}`} aria-label={t('surfaces.evidence.boxes')} role="img">
                {objects.filter((o) => Array.isArray(o.box) && o.box.length === 4).map((o, i) => (
                  <g key={`${o.label}-${i}`}>
                    <rect x={o.box[0]} y={o.box[1]} width={Math.max(1, o.box[2] - o.box[0])} height={Math.max(1, o.box[3] - o.box[1])} fill="none" stroke={source === 'zia-objects' ? '#2dd4bf' : '#f59e0b'} strokeWidth="6" strokeDasharray={source === 'zia-objects' ? '0' : '18 10'} />
                    <text x={o.box[0] + 10} y={Math.max(30, o.box[1] - 12)} fontSize="30" fontWeight="700" fill={source === 'zia-objects' ? '#2dd4bf' : '#f59e0b'} stroke="#0b1220" strokeWidth="6" paintOrder="stroke">{o.label}</text>
                  </g>
                ))}
              </svg>
            </div>
            <figcaption className="mt-1 text-[11px] text-muted">
              {t('surfaces.evidence.scene')}: {scene.title} · {t('surfaces.evidence.synthetic')}
            </figcaption>
          </figure>
          <div className="min-w-0 space-y-3">
            <p className="text-sm text-ink">{t('surfaces.evidence.plain')}</p>
            {source !== 'zia-objects' && <p className="text-[11px] text-muted">{t('surfaces.evidence.fixtureNote')}</p>}
            {d.note && source === 'zia-objects' && <p className="text-[11px] text-muted">{str(d.note)}</p>}
            {objects.length ? (
              <ChartTable
                caption={t('surfaces.evidence.tableCaption')}
                table={{ columns: [t('surfaces.evidence.col.object'), t('surfaces.evidence.col.confidence'), t('surfaces.evidence.col.tags'), t('surfaces.evidence.col.box')], rows }}
                visible
              />
            ) : <p className="text-xs text-muted">{t('surfaces.evidence.none')}</p>}
            <div>
              <p className="eyebrow mb-1">{t('surfaces.evidence.moTags')}</p>
              <ul className="flex flex-wrap gap-1.5">{(d.moTags || []).map((m) => <li key={m}><Badge tone="teal"><span className="font-mono">{m}</span></Badge></li>)}</ul>
            </div>
            <div>
              <p className="eyebrow mb-1">{t('surfaces.evidence.narrativeTags')}</p>
              <ul className="flex flex-wrap gap-1.5">{(d.narrativeTags || []).map((m) => <li key={m}><Badge tone="amber"><span className="font-mono">{m}</span></Badge></li>)}</ul>
            </div>
            <div>
              <p className="eyebrow mb-1">{t('surfaces.evidence.merged')}</p>
              <ul className="flex flex-wrap gap-1.5">{(d.mergedMoTags || []).map((m) => <li key={m}><span className="chip font-mono">{m}</span></li>)}</ul>
            </div>
            <p className="text-[10px] text-muted">{t('surfaces.source.label')}: <span className="font-mono">{source || '—'}</span></p>
          </div>
        </div>
      )}
    </Card>
  );
}
