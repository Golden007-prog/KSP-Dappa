// Route 8 /copilot — "Ask DAPPA" chat. User/assistant bubbles, answers with an
// optional ECharts block + collapsible ZCQL reveal, 8 suggested-question chips,
// engine badge from response.engine, and auto-send of the ?q= URL param that
// the Dashboard omnibox passes in. See client/CONTRACT.md.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCopilotQuery } from '../lib/api.js';
import EmptyState from '../components/EmptyState.jsx';
import MessageBubble, { EngineBadge, TypingBubble } from './copilot/MessageBubble.jsx';
import { SUGGESTED_QUESTIONS } from './copilot/suggestions.js';

export default function Copilot() {
  const [searchParams] = useSearchParams();
  const copilot = useCopilotQuery();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const idRef = useRef(0);
  const autoQRef = useRef('');
  const endRef = useRef(null);
  const nextId = () => ++idRef.current;

  const send = (text, opts = {}) => {
    const q = String(text || '').trim();
    if (!q || copilot.isPending) return;
    setMessages((m) => {
      const base = opts.replaceId ? m.filter((x) => x.id !== opts.replaceId) : m;
      return opts.silent ? base : [...base, { id: nextId(), role: 'user', text: q }];
    });
    copilot.mutate(q, {
      onSuccess: (res) => {
        const d = res?.data || {};
        setMessages((m) => [...m, {
          id: nextId(),
          role: 'assistant',
          text: d.answer || 'No answer returned.',
          chart: d.chart,
          zcql: d.zcql,
          engine: d.engine,
          source: res?.meta?.source,
        }]);
      },
      onError: (err) => {
        setMessages((m) => [...m, {
          id: nextId(),
          role: 'assistant',
          error: err?.message || 'The copilot request failed.',
          retryText: q,
        }]);
      },
    });
  };

  // ?q= from the Dashboard omnibox — auto-ask once per distinct value (also
  // covers in-place navigation while already on /copilot).
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && q !== autoQRef.current) {
      autoQRef.current = q;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, copilot.isPending]);

  const submit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    send(input);
    setInput('');
  };

  const lastEngine = [...messages].reverse().find((m) => m.role === 'assistant' && m.engine)?.engine;
  const empty = messages.length === 0 && !copilot.isPending;

  return (
    <div className="flex flex-col h-[calc(100dvh-7.5rem)] min-h-[480px] max-w-4xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
        <div>
          <h1 className="page-title">Ask DAPPA</h1>
          <p className="page-subtitle">Natural-language crime analytics — every answer shows its query and its engine</p>
        </div>
        <EngineBadge engine={lastEngine} />
      </div>

      <section className="flex-1 min-h-0 flex flex-col bg-panel border border-grid rounded-xl overflow-hidden">
        {/* conversation */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {empty ? (
            <div className="h-full flex flex-col items-center justify-center">
              <EmptyState
                compact
                title="Ask anything about Karnataka crime data"
                message="Trends, comparisons, forecasts, risk, offenders — answered from the synthetic Data Store, with the generated ZCQL on show."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 w-full max-w-2xl">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="text-left text-xs text-muted border border-grid bg-base/60 rounded-lg px-3 py-2.5 hover:border-amber/50 hover:text-ink transition-colors"
                    onClick={() => send(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onRetry={(msg) => send(msg.retryText, { silent: true, replaceId: msg.id })} />
              ))}
              {copilot.isPending && <TypingBubble />}
              <div ref={endRef} />
            </>
          )}
        </div>

        {/* suggestions + input */}
        <div className="border-t border-grid p-3 space-y-2.5">
          {!empty && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="text-[11px] text-muted border border-grid bg-base/60 rounded-full px-2.5 py-1 hover:border-amber/50 hover:text-ink transition-colors disabled:opacity-50"
                  onClick={() => send(q)}
                  disabled={copilot.isPending}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form onSubmit={submit} className="flex items-center gap-2">
            <input
              className="input-dark flex-1 !py-2.5"
              placeholder="e.g. top 5 districts for vehicle theft this year"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Ask DAPPA"
              autoFocus
            />
            <button
              type="submit"
              className="btn-primary !py-2.5 disabled:opacity-50"
              disabled={copilot.isPending || !input.trim()}
            >
              {copilot.isPending ? 'Thinking…' : 'Ask'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
