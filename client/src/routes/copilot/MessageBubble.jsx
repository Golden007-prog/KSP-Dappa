// /copilot — chat bubbles. User bubbles right-aligned in amber with pin +
// share-link actions; assistant bubbles carry the answer text, optional
// ECharts block, the AnswerInsights provenance strip (confidence, intent,
// source-table citations, "how this was answered"), a collapsible "Show ZCQL"
// reveal (with its own copy button), the engine badge, response latency,
// copy / copy-as-Markdown / listen / compare / regenerate buttons, and a
// relative timestamp (absolute time in the tooltip). Unmatched answers render
// the server's suggested rephrasings as clickable chips.
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import AnswerInsights from './AnswerInsights.jsx';
import CopilotChart from './CopilotChart.jsx';
import {
  answerToMarkdown, copyText, fullTimeLabel, latencyLabel, relativeTimeLabel,
} from './transcript.js';

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

// 40px hit area that stays visually compact inside the tight bubble footers
const ICON_BTN = 'inline-grid place-items-center h-10 w-10 -my-2 rounded-lg text-muted transition-colors';

function Avatar() {
  return (
    <div
      className="shrink-0 h-7 w-7 rounded-lg bg-amber/15 border border-amber/30 text-amber grid place-items-center text-[11px] font-bold select-none"
      aria-hidden="true"
    >
      D
    </div>
  );
}

export function EngineBadge({ engine }) {
  if (!engine) return null;
  if (engine === 'quickml-rag') return <Badge tone="amber">QuickML LLM · RAG</Badge>;
  if (engine === 'demo-static') return <Badge tone="slate">Static demo snapshot</Badge>;
  if (engine === 'deterministic' || engine === 'parser') return <Badge tone="slate">Deterministic parser</Badge>;
  // unknown engines (e.g. a future ConvoKraft fallback) are shown verbatim
  // instead of being mislabelled as the parser
  return <Badge tone="neutral">{engine}</Badge>;
}

export function LatencyChip({ ms }) {
  const label = latencyLabel(ms);
  if (!label) return null;
  return <span className="num text-[10px] text-muted whitespace-nowrap">answered in {label}</span>;
}

export function TypingBubble() {
  return (
    <div className="flex gap-2.5">
      <Avatar />
      <div className="rounded-2xl rounded-tl-sm bg-panel border border-grid px-4 py-3">
        <span className="inline-flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" style={{ animationDelay: '160ms' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" style={{ animationDelay: '320ms' }} />
        </span>
      </div>
    </div>
  );
}

function Time({ ts, now, className = '' }) {
  if (!ts) return null;
  return (
    <Tooltip label={fullTimeLabel(ts)}>
      <span className={`num text-[10px] text-muted whitespace-nowrap ${className}`}>{relativeTimeLabel(ts, now)}</span>
    </Tooltip>
  );
}

export default function MessageBubble({
  message, now, pinned = false, onRetry, onRegenerate, onTogglePin,
  onAsk, onToggleCompare, compareSelected = false, readAloud,
}) {
  const toast = useToast();

  if (message.role === 'user') {
    const shareLink = async () => {
      // HashRouter-safe deep link: works on Catalyst and the Pages mirror alike
      const base = window.location.href.split('#')[0];
      const url = `${base}#/copilot?q=${encodeURIComponent(message.text || '')}`;
      const ok = await copyText(url);
      if (ok) toast.success('Link copied — opening it re-asks this question');
      else toast.error('Copy failed — copy the address bar URL instead.');
    };
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[88%] md:max-w-[72%] rounded-2xl rounded-br-sm bg-amber/10 border border-amber/30 px-3.5 py-2.5 text-sm text-ink whitespace-pre-wrap">
          {message.text}
        </div>
        <div className="mt-1.5 mr-1 flex items-center">
          <Time ts={message.ts} now={now} className="mr-1.5" />
          {onTogglePin && (
            <Tooltip label={pinned ? 'Unpin from suggestions' : 'Pin to suggestions'}>
              <button
                type="button"
                className={`no-print ${ICON_BTN} ${pinned ? 'text-amber' : 'hover:text-amber'}`}
                onClick={() => onTogglePin(message.text)}
                aria-pressed={pinned}
                aria-label={pinned ? 'Unpin this question from suggestions' : 'Pin this question to suggestions'}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" {...ICON} fill={pinned ? 'currentColor' : 'none'} aria-hidden="true">
                  <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8L12 3Z" />
                </svg>
              </button>
            </Tooltip>
          )}
          <Tooltip label="Copy a shareable link to this question">
            <button
              type="button"
              className={`no-print ${ICON_BTN} hover:text-primary`}
              onClick={shareLink}
              aria-label="Copy shareable link to this question"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <path d="M10 14a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 5.93" />
                <path d="M14 10a5 5 0 0 0-7.07 0L4.8 12.12a5 5 0 0 0 7.07 7.07L13 18.07" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex gap-2.5">
        <Avatar />
        <div className="max-w-[88%] md:max-w-[80%] rounded-2xl rounded-tl-sm bg-panel border border-signal/40 px-3.5 py-3">
          <p className="text-sm text-ink">Sorry — that question failed.</p>
          <p className="text-xs text-muted mt-1">{message.error}</p>
          {onRetry && (
            <button type="button" className="btn mt-2 min-h-[40px] text-xs no-print" onClick={() => onRetry(message)}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const copyAnswer = async () => {
    const ok = await copyText(message.text || '');
    if (ok) toast.success('Answer copied to clipboard');
    else toast.error('Copy failed — select the text and copy manually.');
  };

  const copyZcql = async () => {
    const ok = await copyText(String(message.zcql || ''));
    if (ok) toast.success('ZCQL copied to clipboard');
    else toast.error('Copy failed — select the query and copy manually.');
  };

  const copyMarkdown = async () => {
    const ok = await copyText(answerToMarkdown(message));
    if (ok) toast.success('Answer copied as Markdown (with provenance and ZCQL)');
    else toast.error('Copy failed — select the text and copy manually.');
  };

  const speaking = readAloud?.speakingId === message.id;
  const suggestions = Array.isArray(message.suggestions) ? message.suggestions.filter(Boolean) : [];

  return (
    <div className="flex gap-2.5">
      <Avatar />
      <div className="max-w-[88%] md:max-w-[80%] min-w-0 rounded-2xl rounded-tl-sm bg-panel border border-grid px-3.5 py-3">
        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{message.text}</p>
        {suggestions.length > 0 && onAsk && (
          <div className="no-print mt-2 flex flex-wrap gap-1.5" aria-label="Suggested rephrasings">
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                className="text-left text-[11px] text-muted border border-grid bg-base/60 rounded-full px-3 min-h-[40px] hover:border-amber/50 hover:text-ink transition-colors"
                onClick={() => onAsk(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <CopilotChart chart={message.chart} />
        <AnswerInsights message={message} />
        {message.zcql && (
          <details className="mt-2.5">
            <summary className="cursor-pointer text-[11px] text-muted hover:text-amber transition-colors select-none py-2 -my-2">
              Show ZCQL
            </summary>
            <div className="mt-1.5 flex items-center justify-end">
              <button
                type="button"
                className="no-print inline-flex items-center gap-1 min-h-[40px] -my-2.5 px-2 rounded-lg text-[11px] text-muted hover:text-primary transition-colors"
                onClick={copyZcql}
                aria-label="Copy ZCQL query"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy ZCQL
              </button>
            </div>
            <pre className="mt-1 text-[11px] leading-relaxed text-teal/90 bg-base border border-grid rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap font-mono">
              {message.zcql}
            </pre>
          </details>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <EngineBadge engine={message.engine} />
          <LatencyChip ms={message.latencyMs} />
          <button
            type="button"
            className="no-print inline-flex items-center gap-1 rounded-lg px-2 min-h-[40px] -my-2 text-[11px] text-muted hover:text-primary transition-colors"
            onClick={copyAnswer}
            aria-label="Copy answer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy
          </button>
          <Tooltip label="Copy answer as Markdown, with provenance and ZCQL">
            <button
              type="button"
              className="no-print inline-flex items-center gap-1 rounded-lg px-2 min-h-[40px] -my-2 text-[11px] text-muted hover:text-primary transition-colors"
              onClick={copyMarkdown}
              aria-label="Copy answer as Markdown"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M6 15v-5l2.5 2.5L11 10v5m3-5h3m-1.5 0v5" />
              </svg>
              MD
            </button>
          </Tooltip>
          {readAloud?.supported && (
            <Tooltip label={speaking ? 'Stop reading this answer' : 'Read this answer aloud'}>
              <button
                type="button"
                className={`no-print inline-flex items-center gap-1 rounded-lg px-2 min-h-[40px] -my-2 text-[11px] transition-colors ${
                  speaking ? 'text-amber' : 'text-muted hover:text-primary'
                }`}
                onClick={() => readAloud.toggle(message.id, message.text)}
                aria-pressed={speaking}
                aria-label={speaking ? 'Stop reading this answer aloud' : 'Read this answer aloud'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                  <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
                  {speaking ? <path d="M16 9l5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 6a9 9 0 0 1 0 12" />}
                </svg>
                {speaking ? 'Stop' : 'Listen'}
              </button>
            </Tooltip>
          )}
          {onToggleCompare && (
            <Tooltip label={compareSelected ? 'Remove from comparison' : 'Pick for side-by-side comparison (choose two answers)'}>
              <button
                type="button"
                className={`no-print inline-flex items-center gap-1 rounded-lg px-2 min-h-[40px] -my-2 text-[11px] transition-colors ${
                  compareSelected ? 'text-primary' : 'text-muted hover:text-primary'
                }`}
                onClick={() => onToggleCompare(message.id)}
                aria-pressed={compareSelected}
                aria-label={compareSelected ? 'Remove this answer from comparison' : 'Pick this answer for comparison'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                  <rect x="3" y="5" width="7" height="14" rx="1.5" />
                  <rect x="14" y="5" width="7" height="14" rx="1.5" />
                </svg>
                {compareSelected ? 'Picked' : 'Compare'}
              </button>
            </Tooltip>
          )}
          {onRegenerate && message.question && (
            <Tooltip label="Ask this question again (replaces this answer)">
              <button
                type="button"
                className="no-print inline-flex items-center gap-1 rounded-lg px-2 min-h-[40px] -my-2 text-[11px] text-muted hover:text-primary transition-colors"
                onClick={() => onRegenerate(message)}
                aria-label="Regenerate this answer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
                </svg>
                Regenerate
              </button>
            </Tooltip>
          )}
          <Time ts={message.ts} now={now} className="ml-auto" />
        </div>
      </div>
    </div>
  );
}
