// Narrative insights — POST /ai/narrative on mount (Zia Text Analytics when the
// flag is on, local regex/TF-IDF fallback otherwise; identical response shape).
// Entities are highlighted inline inside BriefFacts; keywords render as chips;
// sentiment + engine source render as badges. Response fields are normalized
// defensively because the exact shape is not pinned in docs/CONTRACTS.md.
import { useEffect, useMemo } from 'react';
import { useNarrative } from '../../lib/api.js';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { fmtNum } from '../../lib/format.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));

function normEntities(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((e) => {
      if (typeof e === 'string') return { text: e, type: '' };
      if (e && typeof e === 'object') {
        return {
          text: str(e.text ?? e.value ?? e.entity ?? e.name ?? e.token),
          type: str(e.type ?? e.label ?? e.category),
        };
      }
      return { text: '', type: '' };
    })
    .filter((e) => e.text.trim().length >= 2);
}

function normKeywords(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((k) => (typeof k === 'string' ? k : str(k?.word ?? k?.text ?? k?.keyword ?? k?.name)))
    .filter((k) => k.trim().length >= 2);
}

function normSentiment(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') {
    const label = raw > 0.2 ? 'positive' : raw < -0.2 ? 'negative' : 'neutral';
    return { label, score: raw };
  }
  if (typeof raw === 'string') return { label: raw.toLowerCase(), score: null };
  const label = str(raw.label ?? raw.sentiment ?? raw.polarity).toLowerCase() || 'neutral';
  const score = Number(raw.score ?? raw.confidence);
  return { label, score: Number.isFinite(score) ? score : null };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Split briefFacts into plain/highlighted segments (case-insensitive,
 * longest-entity-first so nested names don't fragment). */
function buildSegments(text, entities) {
  const src = str(text);
  if (!src) return [];
  const terms = [...new Set(entities.map((e) => e.text.trim()).filter((t) => t.length >= 2))]
    .sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ text: src }];
  const typeByLower = new Map();
  for (const e of entities) {
    const key = e.text.trim().toLowerCase();
    if (!typeByLower.has(key)) typeByLower.set(key, e.type);
  }
  let re;
  try {
    re = new RegExp(terms.map(escapeRe).join('|'), 'gi');
  } catch {
    return [{ text: src }];
  }
  const out = [];
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    out.push({ text: m[0], hit: true, type: typeByLower.get(m[0].toLowerCase()) || '' });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out;
}

const SENTIMENT_TONE = { positive: 'teal', negative: 'red' };

export default function NarrativePanel({ caseId, briefFacts }) {
  const narrative = useNarrative();
  const { mutate } = narrative;

  useEffect(() => {
    if (caseId) mutate({ caseId });
  }, [caseId, mutate]);

  const d = narrative.data?.data || {};
  const meta = narrative.data?.meta || {};
  const entities = useMemo(() => normEntities(d.entities), [d.entities]);
  const keywords = useMemo(() => normKeywords(d.keywords), [d.keywords]);
  const sentiment = useMemo(() => normSentiment(d.sentiment), [d.sentiment]);
  const segments = useMemo(() => buildSegments(briefFacts, entities), [briefFacts, entities]);

  const sourceBadge = narrative.data ? (
    meta.source === 'fallback-local'
      ? <Badge tone="slate">local fallback</Badge>
      : <Badge tone="teal">Zia Text Analytics</Badge>
  ) : null;

  let body;
  // isIdle covers the first paint before the mount effect fires the mutation —
  // without it the panel flashes an empty state for one frame.
  if (narrative.isPending || (narrative.isIdle && !!caseId)) {
    body = <LoadingSkeleton lines={6} />;
  } else if (narrative.error) {
    body = (
      <EmptyState
        compact
        title="Couldn't analyse the narrative"
        message={narrative.error.message}
        action={<button type="button" className="btn" onClick={() => mutate({ caseId })}>Retry</button>}
      />
    );
  } else if (!narrative.data) {
    body = <EmptyState compact title="No analysis yet" message="Narrative insights run automatically once the case loads." />;
  } else {
    body = (
      <div className="space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Brief facts · entities highlighted</p>
          {segments.length ? (
            <p className="text-sm leading-6 text-ink whitespace-pre-wrap">
              {segments.map((s, i) =>
                s.hit ? (
                  <mark key={i} className="bg-amber/20 text-amber rounded px-0.5" title={s.type || 'entity'}>
                    {s.text}
                  </mark>
                ) : (
                  <span key={i}>{s.text}</span>
                ),
              )}
            </p>
          ) : (
            <p className="text-sm text-muted">No brief facts recorded for this case.</p>
          )}
        </div>

        {entities.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Entities</p>
            <div className="flex flex-wrap gap-1.5">
              {entities.slice(0, 14).map((e, i) => (
                <span key={`${e.text}-${i}`} className="chip">
                  <span className="truncate max-w-[12rem]">{e.text}</span>
                  {e.type && <span className="text-muted uppercase text-[10px]">{e.type}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {keywords.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted mb-1.5">Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {keywords.slice(0, 16).map((k, i) => (
                <span key={`${k}-${i}`} className="chip !border-amber/40 !text-amber">{k}</span>
              ))}
            </div>
          </div>
        )}

        {sentiment && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted">Sentiment</span>
            <Badge tone={SENTIMENT_TONE[sentiment.label] || 'slate'}>
              {sentiment.label}{sentiment.score !== null ? ` · ${fmtNum(sentiment.score, 2)}` : ''}
            </Badge>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card
      title="Narrative insights"
      subtitle="NER · keywords · sentiment on the FIR brief facts"
      actions={
        <div className="flex items-center gap-2">
          {sourceBadge}
          <button
            type="button"
            className="btn !py-1 !px-2 text-xs no-print"
            disabled={narrative.isPending || !caseId}
            onClick={() => mutate({ caseId })}
          >
            Re-run
          </button>
        </div>
      }
    >
      {body}
    </Card>
  );
}
