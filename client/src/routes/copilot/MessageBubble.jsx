// /copilot — chat bubbles. User bubbles right-aligned in amber; assistant
// bubbles carry the answer text, optional ECharts block, a collapsible
// "Show ZCQL" reveal, and the engine badge from response.engine.
import Badge from '../../components/Badge.jsx';
import CopilotChart from './CopilotChart.jsx';

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
  const isRag = engine === 'quickml-rag';
  return (
    <Badge tone={isRag ? 'amber' : 'slate'}>
      {isRag ? 'QuickML LLM · RAG' : 'Deterministic parser'}
    </Badge>
  );
}

export function TypingBubble() {
  return (
    <div className="flex gap-2.5">
      <Avatar />
      <div className="rounded-2xl rounded-tl-sm bg-panel border border-grid px-4 py-3">
        <span className="inline-flex items-center gap-1.5" aria-label="DAPPA is thinking">
          <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" style={{ animationDelay: '160ms' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" style={{ animationDelay: '320ms' }} />
        </span>
      </div>
    </div>
  );
}

export default function MessageBubble({ message, onRetry }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] md:max-w-[72%] rounded-2xl rounded-br-sm bg-amber/10 border border-amber/30 px-3.5 py-2.5 text-sm text-ink whitespace-pre-wrap">
          {message.text}
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
            <button type="button" className="btn mt-2 !py-1 text-xs" onClick={() => onRetry(message)}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <Avatar />
      <div className="max-w-[88%] md:max-w-[80%] min-w-0 rounded-2xl rounded-tl-sm bg-panel border border-grid px-3.5 py-3">
        <p className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{message.text}</p>
        <CopilotChart chart={message.chart} />
        {message.zcql && (
          <details className="mt-2.5">
            <summary className="cursor-pointer text-[11px] text-muted hover:text-amber transition-colors select-none">
              Show ZCQL
            </summary>
            <pre className="mt-1.5 text-[11px] leading-relaxed text-teal/90 bg-base border border-grid rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap font-mono">
              {message.zcql}
            </pre>
          </details>
        )}
        <div className="mt-2.5">
          <EngineBadge engine={message.engine} />
        </div>
      </div>
    </div>
  );
}
