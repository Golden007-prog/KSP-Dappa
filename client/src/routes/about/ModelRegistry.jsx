// /about — ML model registry from GET /ml/models.
//
// Two views over the same payload:
//   · Resolution chains — grouped by the endpoint that serves them, ordered the
//     way a request actually travels: flagged Catalyst AI candidates first, the
//     model that answers today last. This is the honest picture, because every
//     endpoint currently resolves to its in-function model.
//   · The registry itself — every model with its task, target, service, metrics
//     and the flag/env it waits on.
//
// "serving" here means the model that answers a request right now; "disabled"
// means its feature flag is off, not that the integration is missing.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtNum } from '../../lib/format.js';
import { PanelState, Field, CodeChip, Chevron } from './bits.jsx';

const TASK_KEYS = {
  'binary-classification': 'binaryClassification',
  'text-generation': 'textGeneration',
  'time-series': 'timeSeries',
  'anomaly-detection': 'anomalyDetection',
  nlp: 'nlp',
  ocr: 'ocr',
};

const taskLabelKey = (task) => `about.task.${TASK_KEYS[task] || 'other'}`;

/** Format one metrics entry; auc/mape read as numbers, counts as integers. */
function metricPairs(metrics) {
  if (!metrics) return [];
  return Object.entries(metrics)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? fmtNum(v, 2) : String(v)]);
}

function ModelRow({ model, open, onToggle }) {
  const t = useT();
  const serving = model.status === 'serving';
  const bodyId = `model-body-${model.key}`;
  return (
    <div className={`rounded-lg border bg-base/40 ${serving ? 'border-teal/30' : 'border-grid'}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-start gap-2 p-3 text-left min-h-[44px]"
      >
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${serving ? 'bg-teal' : 'bg-muted/50'}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-ink">{model.name}</span>
            <Badge tone={serving ? 'teal' : 'slate'}>{t(serving ? 'about.model.serving' : 'about.model.disabled')}</Badge>
            {model.flag && <CodeChip tone="amber">{model.flag}</CodeChip>}
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-muted">
            {t('about.model.line', { task: t(taskLabelKey(model.task)), service: model.service || '—' })}
          </span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <dl id={bodyId} className="border-t border-grid/60 px-3 pb-3 pt-2">
          <Field label={t('about.model.field.target')}>{model.target}</Field>
          <Field label={t('about.model.field.endpoint')} mono>{model.endpoint}</Field>
          <Field label={t('about.model.field.service')}>{model.service}</Field>
          {metricPairs(model.metrics).length > 0 && (
            <Field label={t('about.model.field.metrics')}>
              <span className="flex flex-wrap gap-1">
                {metricPairs(model.metrics).map(([k, v]) => (
                  <CodeChip key={k} tone="teal">{`${k} = ${v}`}</CodeChip>
                ))}
              </span>
            </Field>
          )}
          {model.flag && <Field label={t('about.model.field.flag')} mono>{model.flag}</Field>}
          {model.requires.length > 0 && (
            <Field label={t('about.model.field.requires')}>
              <span className="flex flex-wrap gap-1">
                {model.requires.map((r) => <CodeChip key={r} tone="amber">{r}</CodeChip>)}
              </span>
            </Field>
          )}
          <Field label={t('about.model.field.fallbackFor')}>
            {model.fallbackFor
              ? <CodeChip>{model.fallbackFor}</CodeChip>
              : <span className="italic text-muted">{t('about.model.noFallbackFor')}</span>}
          </Field>
          <Field label={t('about.model.field.trainedAt')}>
            {model.trainedAt || <span className="italic text-muted">{t('about.model.noTrainedAt')}</span>}
          </Field>
        </dl>
      )}
    </div>
  );
}

/**
 * The footnote under a chain. Three real cases, and the third is the one a
 * demo would normally hide: POST /zia/ocr registers exactly one model and it
 * is disabled, so nothing serves that endpoint today. Its declared fallback
 * lives on a different endpoint, which the note names rather than glossing.
 */
function chainNote(chain, t) {
  if (!chain.serving) {
    const only = chain.members[0];
    const fallback = only ? only.fallbackFor : '';
    return fallback
      ? t('about.model.chainNoneFallback', { name: only.name, fallback })
      : t('about.model.chainNone', { name: only ? only.name : '—' });
  }
  const skipped = chain.members.length - 1;
  if (skipped === 0) return t('about.model.chainSingle', { serving: chain.serving.name });
  return t(skipped === 1 ? 'about.model.chainNoteOne' : 'about.model.chainNoteMany', {
    serving: chain.serving.name, skipped,
  });
}

function Chain({ chain }) {
  const t = useT();
  return (
    <li className="rounded-lg border border-grid bg-base/40 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <CodeChip tone="teal">{chain.endpoint}</CodeChip>
        <span className="text-[10px] uppercase tracking-wider text-muted">{t(taskLabelKey(chain.task))}</span>
      </div>
      <ol className="mt-2 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center">
        {chain.members.map((m, i) => (
          <li key={m.key} className="flex items-center gap-1.5 min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] min-w-0 ${
                m.status === 'serving' ? 'border-teal/50 bg-teal/5 text-teal' : 'border-grid bg-panel text-muted line-through decoration-muted/50'
              }`}
            >
              <span className="truncate">{m.name}</span>
            </span>
            {i < chain.members.length - 1 && (
              <span className="shrink-0 text-muted" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m0 0-5-5m5 5-5 5" /></svg>
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className={`mt-1.5 text-[11px] leading-relaxed ${chain.serving ? 'text-muted' : 'text-amber'}`}>
        {chainNote(chain, t)}
      </p>
    </li>
  );
}

export default function ModelRegistry({ query }) {
  const t = useT();
  const [view, setView] = useState('chains');
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const d = query.data;

  const byTask = useMemo(() => {
    if (!d) return [];
    return d.tasks.map((task) => ({ task, rows: d.models.filter((m) => m.task === task) }));
  }, [d]);

  const toggleOne = (key) => setOpenKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <Card
      title={t('about.model.title')}
      subtitle={t('about.model.subtitle')}
      actions={d ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="teal">{t('about.model.badgeServing', { n: d.serving })}</Badge>
          <Badge tone="slate">{t('about.model.badgeDisabled', { n: d.disabled })}</Badge>
        </div>
      ) : null}
    >
      <PanelState isLoading={query.isLoading} error={query.error} retry={query.refetch} skeletonHeight={240}>
        {d && (
          <div className="space-y-3">
            <SegmentedControl
              ariaLabel={t('about.model.viewAria')}
              value={view}
              onChange={setView}
              options={[
                { value: 'chains', label: t('about.model.viewChains') },
                { value: 'registry', label: t('about.model.viewRegistry') },
              ]}
            />

            {view === 'chains' ? (
              <>
                <p className="text-[11px] leading-relaxed text-muted">{t('about.model.chainsIntro')}</p>
                <ul className="grid grid-cols-1 xl:grid-cols-2 items-start gap-2 list-none">
                  {d.chains.map((c) => <Chain key={c.endpoint} chain={c} />)}
                </ul>
              </>
            ) : (
              <div className="space-y-3">
                {byTask.map((g) => (
                  <section key={g.task}>
                    <div className="flex items-center gap-2 pb-1.5">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink">{t(taskLabelKey(g.task))}</h3>
                      <span className="num text-[11px] text-muted">{g.rows.length}</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-2">
                      {g.rows.map((m) => (
                        <ModelRow key={m.key} model={m} open={openKeys.has(m.key)} onToggle={() => toggleOne(m.key)} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            <p className="rounded-lg border border-amber/40 bg-amber/5 p-3 text-[11px] leading-relaxed text-muted">
              <strong className="text-amber">{t('about.model.honestTitle')}</strong>{' '}
              {t('about.model.honestBody', { serving: d.serving, total: d.total, disabled: d.disabled })}
            </p>
          </div>
        )}
      </PanelState>
    </Card>
  );
}
