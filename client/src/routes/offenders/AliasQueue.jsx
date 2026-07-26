// Alias-resolution review queue. Identity resolution is the step that turns
// 36,093 Accused rows into 2,048 persons, and it is also the step most likely
// to be wrong — so every alias that scores poorly against its canonical
// spelling is surfaced here, weakest first, for a human to confirm or reject.
//
// The score is the same deterministic name-similarity heuristic the profile
// page shows (the pipeline's true match scores are not exposed by the API), and
// it is labelled as such. Decisions are held client-side: this is a triage
// worklist, not a write path into the Data Store.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { aliasConfidence, confidenceBand } from './identity.js';
import { readPref, writePref } from '../network/hooks.js';

const OPEN_PREF = 'dappa-off-alias-queue';
const REVIEW_PREF = 'dappa-off-alias-reviewed';
const ROW_CAP = 20;

function readReviewed() {
  try {
    const v = JSON.parse(readPref(REVIEW_PREF, '{}'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export default function AliasQueue({ rows = [] }) {
  const t = useT();
  const [open, setOpen] = useState(() => readPref(OPEN_PREF, '1') !== '0');
  const [band, setBand] = useState('low');
  const [reviewed, setReviewed] = useState(readReviewed);

  const toggleOpen = () => setOpen((v) => { writePref(OPEN_PREF, v ? '0' : '1'); return !v; });

  const mark = (id, verdict) => {
    setReviewed((prev) => {
      const next = { ...prev };
      if (next[id] === verdict) delete next[id]; else next[id] = verdict;
      writePref(REVIEW_PREF, JSON.stringify(next));
      return next;
    });
  };

  const queue = useMemo(() => {
    const out = [];
    for (const r of rows) {
      for (const a of r.aliases || []) {
        const conf = aliasConfidence(a, r.canonicalName);
        out.push({
          id: `${r.personKey}::${a}`,
          personKey: String(r.personKey),
          name: r.canonicalName || String(r.personKey),
          alias: a,
          conf,
          band: confidenceBand(conf),
          caseCount: Number(r.caseCount) || 0,
          districts: (r.districts || []).length,
        });
      }
    }
    return out.sort((x, y) => x.conf - y.conf);
  }, [rows]);

  const counts = useMemo(() => {
    const c = { high: 0, med: 0, low: 0 };
    for (const q of queue) c[q.band.id] += 1;
    return c;
  }, [queue]);

  const shown = useMemo(
    () => (band === 'all' ? queue : queue.filter((q) => q.band.id === band)).slice(0, ROW_CAP),
    [queue, band],
  );

  const pending = queue.filter((q) => !reviewed[q.id]).length;

  if (!queue.length) return null;

  return (
    <Card
      title={t('network.alias.title')}
      subtitle={t('network.alias.subtitle')}
      actions={(
        <div className="flex items-center gap-2">
          <Badge tone={counts.low > 0 ? 'red' : 'slate'}>{t('network.alias.pending', { n: fmtInt(pending) })}</Badge>
          <button type="button" className="btn-ghost !py-1.5 !px-2.5 text-[11px] min-h-[40px]" onClick={toggleOpen} aria-expanded={open}>
            {open ? t('network.legend.hide') : t('network.legend.show')}
          </button>
        </div>
      )}
    >
      {open && (
        <div className="space-y-2.5">
          <SegmentedControl
            ariaLabel={t('network.alias.bandAria')}
            value={band}
            onChange={setBand}
            options={[
              { value: 'low', label: `${t('network.confidence.low')} ${fmtInt(counts.low)}` },
              { value: 'med', label: `${t('network.confidence.med')} ${fmtInt(counts.med)}` },
              { value: 'high', label: `${t('network.confidence.high')} ${fmtInt(counts.high)}` },
              { value: 'all', label: t('network.off.bandAll') },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState compact title={t('network.alias.emptyTitle')} message={t('network.alias.emptyMsg')} />
          ) : (
            <ul className="divide-y divide-grid/50">
              {shown.map((q) => {
                const verdict = reviewed[q.id];
                return (
                  <li key={q.id} className="py-1.5 first:pt-0 last:pb-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 flex-1">
                      <Link
                        to={`/offenders/${encodeURIComponent(q.personKey)}`}
                        className="text-xs text-ink hover:text-amber transition-colors truncate block"
                      >
                        {q.name}
                      </Link>
                      <span className="text-[10px] text-muted truncate block">
                        {t('network.alias.aliasLine', { alias: q.alias, cases: fmtInt(q.caseCount), d: fmtInt(q.districts) })}
                      </span>
                    </span>
                    <span className={`num text-[11px] shrink-0 ${q.band.text}`}>
                      {fmtPct(q.conf, { fraction: true, digits: 0 })}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className={`chip !py-1 min-h-[36px] transition-colors hover:border-teal/60 ${verdict === 'ok' ? '!border-teal text-teal' : ''}`}
                        onClick={() => mark(q.id, 'ok')}
                        aria-pressed={verdict === 'ok'}
                        title={t('network.alias.confirmHint')}
                      >
                        {t('network.alias.confirm')}
                      </button>
                      <button
                        type="button"
                        className={`chip !py-1 min-h-[36px] transition-colors hover:border-signal/60 ${verdict === 'no' ? '!border-signal text-signal' : ''}`}
                        onClick={() => mark(q.id, 'no')}
                        aria-pressed={verdict === 'no'}
                        title={t('network.alias.rejectHint')}
                      >
                        {t('network.alias.reject')}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[10px] text-muted">{t('network.alias.footnote')}</p>
        </div>
      )}
    </Card>
  );
}
