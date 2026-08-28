// /copilot — the provenance strip under an assistant answer: confidence badge
// (exact aggregate / modelled estimate / unmatched, with a method tooltip),
// an "understood as" intent chip, source-table citation chips (parsed from
// the ZCQL, with data-dictionary tooltips and an explore deep link), and a
// collapsible "How this was answered" pipeline reveal that shows the actual
// parse → intent → query → template path taken for this specific answer.
// Table names stay verbatim (they are Data Store identifiers); their
// descriptions and every label around them are translated.
import { Link } from 'react-router-dom';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';
import {
  INTENT_LABELS, TABLE_INFO, confidenceFor, tablesFromZcql,
} from './answerMeta.js';
import { latencyLabel } from './transcript.js';

const ENGINE_KEY = {
  deterministic: 'deterministic',
  parser: 'deterministic',
  'quickml-rag': 'quickmlRag',
  'demo-static': 'demoStatic',
};

export default function AnswerInsights({ message }) {
  const t = useT();
  const conf = confidenceFor(message);
  const tables = tablesFromZcql(message.zcql);
  const intentText = INTENT_LABELS[message.intent] ? t(`copilot.intent.${message.intent}`) : '';
  if (!conf && !tables.length && !intentText) return null;

  const exploreTable = tables.map((tbl) => TABLE_INFO[tbl]).find((info) => info && info.route);
  const engineKey = ENGINE_KEY[message.engine];
  const engineText = engineKey
    ? t(`copilot.engineText.${engineKey}`)
    : message.engine || t('copilot.engineText.unknown');
  const lat = latencyLabel(message.latencyMs);

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {conf && (
          <Tooltip label={t(`copilot.conf.${conf.level}.desc`)}>
            <Badge tone={conf.tone}>{t(`copilot.conf.${conf.level}.label`)}</Badge>
          </Tooltip>
        )}
        {intentText && (
          <Tooltip label={t('copilot.insights.intentTip')}>
            <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-canvas/60 px-2 py-0.5 text-[10px] text-muted whitespace-nowrap">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              {intentText}
            </span>
          </Tooltip>
        )}
        {tables.map((tbl) => (
          <Tooltip key={tbl} label={TABLE_INFO[tbl] ? t(`copilot.table.${tbl}`) : t('copilot.insights.tableTip')}>
            <span className="inline-flex items-center gap-1 rounded-full border border-teal/40 bg-teal/5 px-2 py-0.5 text-[10px] text-teal whitespace-nowrap font-mono">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
              </svg>
              {tbl}
            </span>
          </Tooltip>
        ))}
        {exploreTable && (
          <Link
            to={exploreTable.route}
            className="no-print inline-flex items-center min-h-[40px] -my-2 px-1.5 text-[10px] text-primary hover:underline whitespace-nowrap"
          >
            {t('copilot.insights.explore', {
              area: exploreTable.navKey ? t(`common.${exploreTable.navKey}`) : exploreTable.routeLabel,
            })}
          </Link>
        )}
      </div>
      {(conf || tables.length > 0) && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted hover:text-amber transition-colors select-none py-2 -my-2">
            {t('copilot.insights.how')}
          </summary>
          <ol className="mt-2 space-y-1 text-[11px] text-muted leading-relaxed">
            {[
              ['parse', t('copilot.insights.step.parseText')],
              ['intent', intentText
                ? t('copilot.insights.step.intentText', { kind: intentText })
                : t('copilot.insights.step.intentNone')],
              ['query', tables.length
                ? t('copilot.insights.step.queryText', { tables: tables.join(' + ') })
                : t('copilot.insights.step.queryNone')],
              ['answer', t('copilot.insights.step.answerText', {
                chart: message.chart ? t('copilot.insights.step.chartSuffix') : '',
                engine: engineText,
                latency: lat ? t('copilot.insights.step.latencySuffix', { t: lat }) : '',
              })],
            ].map(([step, text], i) => (
              <li key={step} className="flex gap-2">
                <span className="num shrink-0 grid place-items-center w-[18px] h-[18px] mt-0.5 rounded-full border border-amber/40 text-amber text-[9px] font-bold">{i + 1}</span>
                <span><strong className="text-ink">{t(`copilot.insights.step.${step}`)}.</strong> {text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
