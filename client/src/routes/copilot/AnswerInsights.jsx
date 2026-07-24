// /copilot — the provenance strip under an assistant answer: confidence badge
// (exact aggregate / modelled estimate / unmatched, with a method tooltip),
// an "understood as" intent chip, source-table citation chips (parsed from
// the ZCQL, with data-dictionary tooltips and an explore deep link), and a
// collapsible "How this was answered" pipeline reveal that shows the actual
// parse → intent → query → template path taken for this specific answer.
import { Link } from 'react-router-dom';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import {
  TABLE_INFO, confidenceFor, intentLabel, tablesFromZcql,
} from './answerMeta.js';
import { latencyLabel } from './transcript.js';

const ENGINE_TEXT = {
  deterministic: 'deterministic parser (rule-based, reproducible)',
  parser: 'deterministic parser (rule-based, reproducible)',
  'quickml-rag': 'QuickML LLM serving with RAG grounding',
  'demo-static': 'pre-generated static demo snapshot',
};

export default function AnswerInsights({ message }) {
  const conf = confidenceFor(message);
  const tables = tablesFromZcql(message.zcql);
  const intentText = intentLabel(message.intent);
  if (!conf && !tables.length && !intentText) return null;

  const exploreTable = tables.map((t) => TABLE_INFO[t]).find((info) => info && info.route);

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {conf && (
          <Tooltip label={conf.desc}>
            <Badge tone={conf.tone}>{conf.label}</Badge>
          </Tooltip>
        )}
        {intentText && (
          <Tooltip label="How the intent grammar understood this question">
            <span className="inline-flex items-center gap-1 rounded-full border border-grid bg-base/60 px-2 py-0.5 text-[10px] text-muted whitespace-nowrap">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              {intentText}
            </span>
          </Tooltip>
        )}
        {tables.map((t) => {
          const info = TABLE_INFO[t];
          return (
            <Tooltip key={t} label={info ? info.desc : 'Data Store table read by this answer'}>
              <span className="inline-flex items-center gap-1 rounded-full border border-teal/40 bg-teal/5 px-2 py-0.5 text-[10px] text-teal whitespace-nowrap font-mono">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
                </svg>
                {t}
              </span>
            </Tooltip>
          );
        })}
        {exploreTable && (
          <Link
            to={exploreTable.route}
            className="no-print inline-flex items-center min-h-[40px] -my-2 px-1.5 text-[10px] text-primary hover:underline whitespace-nowrap"
          >
            Explore in {exploreTable.routeLabel} →
          </Link>
        )}
      </div>
      {(conf || tables.length > 0) && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] text-muted hover:text-amber transition-colors select-none py-2 -my-2">
            How this was answered
          </summary>
          <ol className="mt-2 space-y-1 text-[11px] text-muted leading-relaxed">
            {[
              ['Parse', 'The question is normalised and matched against the crime / district / time-range vocabulary.'],
              ['Intent', intentText ? `Understood as “${intentText}” — one of 14 deterministic question families.` : 'No intent recorded for this answer.'],
              ['Query', tables.length
                ? `A ZCQL query is generated over ${tables.join(' + ')} (expand “Show ZCQL” below to verify it).`
                : 'No structured query was generated for this answer.'],
              ['Answer', `A templated narrative${message.chart ? ' + chart payload' : ''} is composed from the result — engine: ${ENGINE_TEXT[message.engine] || message.engine || 'unknown'}${latencyLabel(message.latencyMs) ? `, answered in ${latencyLabel(message.latencyMs)}` : ''}.`],
            ].map(([step, text], i) => (
              <li key={step} className="flex gap-2">
                <span className="num shrink-0 grid place-items-center w-[18px] h-[18px] mt-0.5 rounded-full border border-amber/40 text-amber text-[9px] font-bold">{i + 1}</span>
                <span><strong className="text-ink">{step}.</strong> {text}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
