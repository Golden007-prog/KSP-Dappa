// /about — live case-search demo over GET /search/cases.
//
// This exists so a judge can type a word and watch the real 45,000-row
// CaseMaster answer, rather than take a claim on trust. Three things are shown
// that a demo normally hides:
//   · which backend answered (meta.source: 'catalyst-search' when the Data
//     Store full-text index serves, 'fallback-zcql-like' when the ZCQL LIKE
//     fallback does), rendered verbatim;
//   · the wall-clock round trip measured in the browser, including network;
//   · that `matched` is bounded — the search path fetches at most limit×2 rows
//     per column, so it is "rows this query returned", not a store-wide total.
//
// Results link straight into the app: a case hit opens /cases/:id, an offender
// hit opens /offenders/:personKey.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';
import { Highlight, CodeChip } from './bits.jsx';

// English query strings on purpose: BriefFacts in the Data Store are English,
// so a translated example would return nothing and read as a broken demo.
const EXAMPLES = ['theft', 'gold chain', 'Bengaluru', 'two-wheeler', 'chain snatching'];

const SOURCE_TONE = { 'catalyst-search': 'teal', 'fallback-zcql-like': 'amber' };

/**
 * An offender hit's snippet is the raw AliasesJson / MOTagsJson column, so it
 * arrives as a JSON literal like `["Gopal Gowda B"]`. Render the parsed list,
 * never the literal. The backend's snippet helper truncates long values with
 * an ellipsis, which makes the JSON unparseable — in that case show nothing
 * rather than a broken fragment.
 */
function offenderSnippet(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '[]' || s === '{}') return '';
  if (!s.startsWith('[') && !s.startsWith('{')) return s;
  try {
    const parsed = JSON.parse(s);
    const items = Array.isArray(parsed) ? parsed : Object.values(parsed);
    return items.map((x) => String(x).trim()).filter(Boolean).join(' · ');
  } catch {
    return '';
  }
}

function ResultRow({ hit, term }) {
  const t = useT();
  const to = hit.type === 'offender'
    ? `/offenders/${encodeURIComponent(hit.personKey || hit.id)}`
    : `/cases/${encodeURIComponent(hit.caseMasterId || hit.id)}`;
  const facts = hit.type === 'offender'
    ? [
      hit.caseCount === null ? '' : t('about.search.offCases', { n: fmtInt(hit.caseCount) }),
      hit.riskScore === null ? '' : t('about.search.offRisk', { n: fmtNum(hit.riskScore, 1) }),
    ].filter(Boolean)
    : [hit.districtName, hit.unitName, hit.subHeadName || hit.headName, hit.registeredDate ? dateLabel(hit.registeredDate) : '']
      .filter(Boolean);
  const snippet = hit.type === 'offender' ? offenderSnippet(hit.snippet) : hit.snippet;
  return (
    <li>
      <Link
        to={to}
        className="block rounded-lg border border-grid bg-base/40 p-3 transition-colors hover:border-primary/60"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={hit.type === 'offender' ? 'amber' : 'neutral'}>
            {t(hit.type === 'offender' ? 'about.search.typeOffender' : 'about.search.typeCase')}
          </Badge>
          <span className="text-xs font-semibold text-ink break-all">
            <Highlight text={hit.title} term={term} />
          </span>
        </div>
        {facts.length > 0 && (
          <p className="mt-1 text-[11px] text-muted">{facts.join(' · ')}</p>
        )}
        {snippet && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink/80">
            {hit.type === 'offender' && (
              <span className="mr-1 text-[10px] uppercase tracking-wider text-muted">{t('about.search.aliasLabel')}</span>
            )}
            <Highlight text={snippet} term={term} />
          </p>
        )}
      </Link>
    </li>
  );
}

export default function CaseSearchDemo({ term, scope, limit, onSearch, query }) {
  const t = useT();
  const [draft, setDraft] = useState(term || '');
  const d = query.data;

  const submit = (e) => {
    e.preventDefault();
    const next = draft.trim();
    if (next) onSearch(next, scope);
  };

  const runExample = (ex) => {
    setDraft(ex);
    onSearch(ex, scope);
  };

  const sourceTone = d ? (SOURCE_TONE[d.source] || 'slate') : 'slate';
  const sourceLabelKey = d && d.source === 'catalyst-search' ? 'about.search.srcCatalyst' : 'about.search.srcFallback';

  return (
    <Card
      title={t('about.search.title')}
      subtitle={t('about.search.subtitle')}
      actions={<Badge tone="teal">{t('about.search.corpus')}</Badge>}
    >
      <div className="space-y-3">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <label className="flex-1 min-w-[9rem]">
            <span className="sr-only">{t('about.search.inputLabel')}</span>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('about.search.placeholder')}
              maxLength={200}
              className="w-full min-h-[44px] rounded-lg border border-grid bg-base/50 px-3 text-sm text-ink placeholder:text-muted focus:border-primary/60 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="min-h-[44px] shrink-0 rounded-lg border border-amber/50 bg-amber/10 px-4 text-xs font-semibold text-amber transition-colors hover:bg-amber/20 disabled:opacity-50"
          >
            {t('about.search.submit')}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel={t('about.search.scopeAria')}
            value={scope}
            onChange={(v) => onSearch(term || draft.trim(), v)}
            options={[
              { value: 'all', label: t('about.search.scopeAll') },
              { value: 'cases', label: t('about.search.scopeCases') },
              { value: 'offenders', label: t('about.search.scopeOffenders') },
            ]}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => runExample(ex)}
                className={`min-h-[32px] rounded-full border px-2.5 text-[11px] transition-colors ${
                  term === ex ? 'border-primary/60 bg-primary/10 text-primary' : 'border-grid text-muted hover:text-ink hover:border-primary/50'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {scope === 'offenders' && (
          <p className="text-[11px] leading-relaxed text-muted">{t('about.search.scopeHint')}</p>
        )}

        {query.isFetching && <LoadingSkeleton height={160} />}

        {!query.isFetching && query.error && (
          <EmptyState
            compact
            title={t('about.search.errorTitle')}
            message={`${t('about.search.errorBody')}${query.error.message ? ` — ${query.error.message}` : ''}`}
          />
        )}

        {!query.isFetching && !query.error && d && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-grid bg-base/40 p-2.5">
              <Tooltip label={t('about.search.srcTip')}>
                <Badge tone={sourceTone}>{t(sourceLabelKey)}</Badge>
              </Tooltip>
              <CodeChip tone={sourceTone === 'teal' ? 'teal' : 'amber'}>{d.source || '—'}</CodeChip>
              <span className="num text-[11px] text-muted">
                {t('about.search.stats', {
                  matched: fmtInt(d.matched),
                  cases: fmtInt(d.counts.cases),
                  offenders: fmtInt(d.counts.offenders),
                  shown: fmtInt(d.results.length),
                })}
              </span>
              <span className="num ml-auto text-[11px] text-muted">
                {/* Seconds past a second — "46,552 ms" is technically right and
                    practically unreadable. */}
                {d.elapsedMs >= 1000
                  ? t('about.search.timingSec', { s: fmtNum(d.elapsedMs / 1000, 1) })
                  : t('about.search.timing', { ms: fmtInt(d.elapsedMs) })}
                {d.cached ? ` · ${t('about.search.cached', { ttl: d.ttlSec === null ? '—' : d.ttlSec })}` : ` · ${t('about.search.uncached')}`}
              </span>
            </div>

            {d.results.length === 0 ? (
              <EmptyState compact title={t('about.search.noneTitle')} message={t('about.search.noneBody', { q: d.query })} />
            ) : (
              <ul className="grid grid-cols-1 lg:grid-cols-2 items-start gap-2 list-none">
                {d.results.map((hit) => (
                  <ResultRow key={`${hit.type}-${hit.id}`} hit={hit} term={d.query} />
                ))}
              </ul>
            )}

            <p className="text-[11px] leading-relaxed text-muted">
              {t('about.search.capNote', { limit, matched: fmtInt(d.matched) })}
            </p>
          </div>
        )}

        {!query.isFetching && !query.error && !d && (
          <EmptyState compact title={t('about.search.idleTitle')} message={t('about.search.idleBody')} />
        )}
      </div>
    </Card>
  );
}
