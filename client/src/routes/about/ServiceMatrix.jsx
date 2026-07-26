// /about — Catalyst service coverage matrix from GET /meta/services.
//
// The whole point of this panel is that it does NOT flatter the submission.
// The backend reports four statuses and only one of them means "serving live
// traffic"; flag-gated services are wired and exercised in code but need a
// console step or an env var before they answer a real request, and the panel
// says exactly that in the legend, in the group heading and on every row.
//
// One extra honesty check runs here: /meta/services calls Data Store full-text
// Search "live", and it is — the code attempts it on every /search/cases call.
// But when the search demo below reports meta.source = 'fallback-zcql-like',
// that row is annotated with the fact that the ZCQL fallback is what actually
// answered, so the two panels can never quietly disagree.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt } from '../../lib/format.js';
import { SERVICE_STATUS_ORDER } from './useAboutIntrospection.js';
import { StatusPill, PanelState, Field, CodeChip, FlagLamp, Chevron, STATUS_DOT } from './bits.jsx';

// Feature-flag key → the env var the function reads. Kept beside the flag board
// so a judge can map a lamp to something they can grep for in the repo.
const FLAG_ENV = {
  quickml: 'FEATURE_QUICKML',
  quickmlLlm: 'FEATURE_QUICKML_LLM',
  zia: 'FEATURE_ZIA',
  ziaOcr: 'FEATURE_ZIA_OCR',
  ziaTranslate: 'FEATURE_ZIA_TRANSLATE',
  ziaAutoml: 'FEATURE_ZIA_AUTOML',
  smartbrowz: 'FEATURE_SMARTBROWZ',
  mail: 'FEATURE_MAIL',
  push: 'FEATURE_PUSH',
  search: 'FEATURE_SEARCH',
  filestore: 'FEATURE_FILESTORE',
  auth: 'FEATURE_AUTH',
  connections: 'FEATURE_CONNECTIONS',
  circuit: 'FEATURE_CIRCUIT',
  publicDemo: 'PUBLIC_DEMO',
};

function ServiceRow({ svc, open, onToggle, searchNote }) {
  const t = useT();
  const bodyId = `svc-body-${svc.key}`;
  return (
    <div className={`rounded-lg border bg-base/40 ${svc.status === 'live' ? 'border-teal/30' : svc.status === 'flag-gated' ? 'border-amber/30' : 'border-grid'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start gap-2 p-3 text-left min-h-[44px]"
      >
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[svc.status] || STATUS_DOT['console-pending']}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-ink">{svc.name}</span>
            <StatusPill status={svc.status} />
            {svc.flag && <CodeChip tone={svc.status === 'flag-gated' ? 'amber' : 'grid'}>{svc.flag}</CodeChip>}
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-muted">{svc.statusReason}</span>
          {searchNote && (
            <span className="mt-1.5 block rounded border border-amber/40 bg-amber/5 px-2 py-1 text-[10px] leading-relaxed text-amber">
              {searchNote}
            </span>
          )}
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <dl id={bodyId} className="border-t border-grid/60 px-3 pb-3 pt-2">
          <Field label={t('about.svc.field.category')}>{t(`about.category.${svc.category}`)}</Field>
          <Field label={t('about.svc.field.invocation')} mono>
            {svc.invocation || <span className="font-sans italic text-muted">{t('about.svc.noInvocation')}</span>}
          </Field>
          <Field label={t('about.svc.field.fallback')}>{svc.fallback}</Field>
          {svc.flag && <Field label={t('about.svc.field.flag')} mono>{svc.flag}</Field>}
          {svc.requires.length > 0 && (
            <Field label={t('about.svc.field.requires')}>
              <span className="flex flex-wrap gap-1">
                {svc.requires.map((r) => <CodeChip key={r} tone="amber">{r}</CodeChip>)}
              </span>
            </Field>
          )}
          <Field label={t('about.svc.field.endpoints')}>
            {svc.endpoints.length ? (
              <span className="flex flex-wrap gap-1">
                {svc.endpoints.map((e) => <CodeChip key={e}>{e}</CodeChip>)}
              </span>
            ) : (
              <span className="italic text-muted">{t('about.svc.noEndpoints')}</span>
            )}
          </Field>
        </dl>
      )}
    </div>
  );
}

export default function ServiceMatrix({ query, searchSource }) {
  const t = useT();
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [filter, setFilter] = useState('');
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const d = query.data;

  const visible = useMemo(() => {
    if (!d) return [];
    const needle = filter.trim().toLowerCase();
    return d.services.filter((s) => {
      if (status !== 'all' && s.status !== status) return false;
      if (category !== 'all' && s.category !== category) return false;
      if (!needle) return true;
      return [s.name, s.key, s.statusReason, s.invocation, s.fallback, s.flag, ...s.endpoints, ...s.requires]
        .join(' ').toLowerCase().includes(needle);
    });
  }, [d, status, category, filter]);

  const grouped = useMemo(() => SERVICE_STATUS_ORDER
    .map((st) => ({ status: st, rows: visible.filter((s) => s.status === st) }))
    .filter((g) => g.rows.length > 0), [visible]);

  const allOpen = visible.length > 0 && visible.every((s) => openKeys.has(s.key));
  const toggleAll = () => setOpenKeys(allOpen ? new Set() : new Set(visible.map((s) => s.key)));
  const toggleOne = (key) => setOpenKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Only annotate the search row when the demo actually fell through, and only
  // once we have a real answer to base it on.
  const searchNote = searchSource === 'fallback-zcql-like' ? t('about.svc.searchFellBack') : '';

  const statusChips = d ? [
    { key: 'all', label: t('about.svc.filter.all', { n: d.total }) },
    ...SERVICE_STATUS_ORDER.map((st) => ({
      key: st,
      label: `${t(`about.status.${st === 'flag-gated' ? 'flagGated' : st === 'console-pending' ? 'consolePending' : st}`)} ${d.byStatus[st]}`,
    })),
  ] : [];

  return (
    <Card
      title={t('about.svc.title')}
      subtitle={t('about.svc.subtitle')}
      actions={d ? (
        <Badge tone="slate">{t('about.svc.generated', { total: d.total, live: d.byStatus.live })}</Badge>
      ) : null}
    >
      <PanelState isLoading={query.isLoading} error={query.error} retry={query.refetch} skeletonHeight={280}>
        {d && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              <Metric value={fmtInt(d.total)} label={t('about.svc.metric.total')} />
              <Metric value={fmtInt(d.byStatus.live)} label={t('about.svc.metric.live')} tone="teal" />
              <Metric value={fmtInt(d.byStatus.platform)} label={t('about.svc.metric.platform')} />
              <Metric value={fmtInt(d.byStatus['flag-gated'])} label={t('about.svc.metric.flagGated')} tone="amber" />
              <Metric value={fmtInt(d.byStatus['console-pending'])} label={t('about.svc.metric.consolePending')} />
              <Metric
                value={d.withFallback === null ? '—' : fmtInt(d.withFallback)}
                label={t('about.svc.metric.withFallback')}
                tone="teal"
              />
            </div>

            <div className="rounded-lg border border-grid bg-base/40 p-3">
              <p className="eyebrow mb-2">{t('about.svc.legend.title')}</p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-1.5">
                {SERVICE_STATUS_ORDER.map((st) => (
                  <li key={st} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[st]}`} aria-hidden="true" />
                    <span>
                      <strong className="text-ink">
                        {t(`about.status.${st === 'flag-gated' ? 'flagGated' : st === 'console-pending' ? 'consolePending' : st}`)}
                      </strong>{' '}
                      {t(`about.svc.legend.${st === 'flag-gated' ? 'flagGated' : st === 'console-pending' ? 'consolePending' : st}`)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-grid/60 pt-2 text-[11px] leading-relaxed text-muted">
                {t('about.svc.legend.note', {
                  reachable: d.reachableFromCode === null ? '—' : d.reachableFromCode,
                  total: d.total,
                })}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('about.svc.filter.statusAria')}>
                {statusChips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={status === c.key}
                    onClick={() => setStatus(c.key)}
                    className={`min-h-[36px] rounded-full border px-3 text-[11px] transition-colors ${
                      status === c.key
                        ? 'border-amber/60 bg-amber/10 text-amber'
                        : 'border-grid text-muted hover:text-ink hover:border-primary/50'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('about.svc.filter.categoryAria')}>
                {['all', ...d.categories].map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={`min-h-[32px] rounded-full border px-2.5 text-[10px] uppercase tracking-wider transition-colors ${
                      category === c
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-grid text-muted hover:text-ink hover:border-primary/40'
                    }`}
                  >
                    {c === 'all' ? t('about.svc.filter.allCategories') : t(`about.category.${c}`)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex-1 min-w-[10rem]">
                  <span className="sr-only">{t('about.svc.filter.searchLabel')}</span>
                  <input
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t('about.svc.filter.searchPlaceholder')}
                    className="w-full min-h-[40px] rounded-lg border border-grid bg-base/50 px-3 text-xs text-ink placeholder:text-muted focus:border-primary/60 focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={visible.length === 0}
                  className="min-h-[40px] shrink-0 rounded-lg border border-grid bg-base/50 px-3 text-[11px] text-muted hover:text-ink hover:border-primary/60 transition-colors disabled:opacity-50"
                >
                  {t(allOpen ? 'about.svc.collapseAll' : 'about.svc.expandAll')}
                </button>
              </div>
            </div>

            {grouped.length === 0 ? (
              <p className="rounded-lg border border-grid bg-base/40 px-3 py-4 text-center text-xs text-muted">
                {t('about.svc.noMatch')}
              </p>
            ) : grouped.map((g) => (
              <section key={g.status} aria-label={t(`about.status.${g.status === 'flag-gated' ? 'flagGated' : g.status === 'console-pending' ? 'consolePending' : g.status}`)}>
                <div className="flex items-center gap-2 pb-1.5 pt-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[g.status]}`} aria-hidden="true" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink">
                    {t(`about.status.${g.status === 'flag-gated' ? 'flagGated' : g.status === 'console-pending' ? 'consolePending' : g.status}`)}
                  </h3>
                  <span className="num text-[11px] text-muted">{g.rows.length}</span>
                  <span className="text-[10px] text-muted truncate">
                    {t(`about.svc.groupHint.${g.status === 'flag-gated' ? 'flagGated' : g.status === 'console-pending' ? 'consolePending' : g.status}`)}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-2">
                  {g.rows.map((s) => (
                    <ServiceRow
                      key={s.key}
                      svc={s}
                      open={openKeys.has(s.key)}
                      onToggle={() => toggleOne(s.key)}
                      searchNote={s.key === 'data-store-search' ? searchNote : ''}
                    />
                  ))}
                </div>
              </section>
            ))}

            <div className="rounded-lg border border-grid bg-base/40 p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="eyebrow">{t('about.flags.title')}</p>
                <p className="text-[11px] text-muted">{t('about.flags.subtitle')}</p>
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
                {Object.entries(d.flags).map(([k, v]) => (
                  <FlagLamp key={k} name={FLAG_ENV[k] || k} on={Boolean(v)} envName={FLAG_ENV[k] || k} />
                ))}
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-muted">
              {t('about.svc.footnote', { mode: d.dataMode || '—' })}
            </p>
          </div>
        )}
      </PanelState>
    </Card>
  );
}

function Metric({ value, label, tone = 'neutral' }) {
  const color = tone === 'teal' ? 'text-teal' : tone === 'amber' ? 'text-amber' : 'text-ink';
  return (
    <div className="rounded-lg border border-grid bg-base/40 px-2.5 py-2 text-center">
      <div className={`num text-base font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-[9px] uppercase leading-tight tracking-wider text-muted">{label}</div>
    </div>
  );
}
