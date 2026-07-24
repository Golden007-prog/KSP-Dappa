// /copilot — side-by-side comparison of two assistant answers, opened from
// the per-bubble "Compare" pickers. Each pane repeats the question, answer,
// chart, provenance chips (engine / confidence / latency / sources) and a
// collapsible ZCQL block; a swap button flips the panes. Two columns on md+,
// stacked on mobile.
import Badge from '../../components/Badge.jsx';
import Sheet from '../../components/Sheet.jsx';
import CopilotChart from './CopilotChart.jsx';
import { EngineBadge, LatencyChip } from './MessageBubble.jsx';
import { confidenceFor, tablesFromZcql } from './answerMeta.js';
import { fullTimeLabel } from './transcript.js';

function Pane({ message, side }) {
  if (!message) return null;
  const conf = confidenceFor(message);
  const tables = tablesFromZcql(message.zcql);
  return (
    <section className="min-w-0 rounded-xl border border-grid bg-base/40 p-3" aria-label={`${side} answer`}>
      {message.question && (
        <p className="text-[11px] text-amber leading-snug mb-1.5">
          <span className="uppercase tracking-wider text-[9px] text-muted mr-1.5">Q</span>
          {message.question}
        </p>
      )}
      <p className="text-xs text-ink whitespace-pre-wrap leading-relaxed">{message.text}</p>
      <CopilotChart chart={message.chart} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <EngineBadge engine={message.engine} />
        {conf && <Badge tone={conf.tone}>{conf.label}</Badge>}
        <LatencyChip ms={message.latencyMs} />
        {tables.map((t) => (
          <span key={t} className="rounded-full border border-teal/40 bg-teal/5 px-2 py-0.5 text-[10px] text-teal font-mono whitespace-nowrap">{t}</span>
        ))}
        {message.ts ? <span className="num text-[10px] text-muted ml-auto whitespace-nowrap">{fullTimeLabel(message.ts)}</span> : null}
      </div>
      {message.zcql && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted hover:text-amber transition-colors select-none py-1.5 -my-1.5">Show ZCQL</summary>
          <pre className="mt-1.5 text-[10px] leading-relaxed text-teal/90 bg-base border border-grid rounded-lg p-2 overflow-x-auto whitespace-pre-wrap font-mono">{message.zcql}</pre>
        </details>
      )}
    </section>
  );
}

export default function CompareSheet({ open, onClose, left, right, onSwap }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compare answers"
      className="md:!w-[60rem] md:!max-w-[calc(100vw-4rem)]"
    >
      <div className="flex items-center justify-between gap-2 mb-2 px-0.5">
        <p className="text-[11px] text-muted">Two answers, side by side — same provenance detail as the chat bubbles.</p>
        <button
          type="button"
          className="btn-ghost !px-2 !text-xs min-h-[40px] shrink-0"
          onClick={onSwap}
          aria-label="Swap the two answers"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7" />
          </svg>
          Swap
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Pane message={left} side="Left" />
        <Pane message={right} side="Right" />
      </div>
    </Sheet>
  );
}
