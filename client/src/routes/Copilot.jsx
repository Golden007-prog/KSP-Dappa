// Route 8 /copilot — "Ask DAPPA" chat. User/assistant bubbles with timestamps,
// typing indicator, answers with an optional ECharts block (+PNG export) and
// collapsible ZCQL reveal, copy-answer buttons, suggestion chip carousel,
// transcript export (.txt), input history (↑/↓, persisted), voice input via
// webkitSpeechRecognition (hidden when unsupported), a dismissible disclaimer
// banner, engine badge from response.engine, and auto-send of the ?q= URL
// param that the Dashboard omnibox passes in. See client/CONTRACT.md.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useCopilotQuery } from '../lib/api.js';
import EmptyState from '../components/EmptyState.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import MessageBubble, { EngineBadge, TypingBubble } from './copilot/MessageBubble.jsx';
import SuggestionCarousel from './copilot/SuggestionCarousel.jsx';
import { SUGGESTED_QUESTIONS } from './copilot/suggestions.js';
import { conversationToText, downloadTextFile } from './copilot/transcript.js';
import useSpeechInput from './copilot/useSpeechInput.js';

const KEY_HISTORY = 'dappa-copilot-history';
const KEY_DISCLAIMER = 'dappa-copilot-disclaimer';
const HISTORY_CAP = 50;

const loadHistory = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_HISTORY));
    return Array.isArray(v) ? v.map(String).slice(-HISTORY_CAP) : [];
  } catch {
    return [];
  }
};

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export default function Copilot() {
  const [searchParams] = useSearchParams();
  const copilot = useCopilotQuery();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try { return localStorage.getItem(KEY_DISCLAIMER) !== '1'; } catch { return true; }
  });
  const idRef = useRef(0);
  const autoQRef = useRef('');
  const endRef = useRef(null);
  const inputRef = useRef(null);
  // Input history: list persists in localStorage; idx/draft track ↑/↓ recall.
  const histRef = useRef({ list: loadHistory(), idx: null, draft: '' });
  const nextId = () => ++idRef.current;

  const speech = useSpeechInput({
    onResult: (text) => {
      setInput(text);
      inputRef.current?.focus();
    },
    onError: (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        toast.error('Microphone access is blocked — allow it in the browser to use voice input.');
      } else if (code === 'no-speech') {
        toast.info('Didn’t catch that — try again, a little closer to the mic.');
      } else if (code !== 'aborted') {
        toast.error('Voice input failed — you can keep typing.');
      }
    },
  });

  const send = (text, opts = {}) => {
    const q = String(text || '').trim();
    if (!q || copilot.isPending) return;
    const h = histRef.current;
    if (h.list[h.list.length - 1] !== q) {
      h.list = [...h.list, q].slice(-HISTORY_CAP);
      try { localStorage.setItem(KEY_HISTORY, JSON.stringify(h.list)); } catch { /* private mode */ }
    }
    h.idx = null;
    h.draft = '';
    setMessages((m) => {
      const base = opts.replaceId ? m.filter((x) => x.id !== opts.replaceId) : m;
      return opts.silent ? base : [...base, { id: nextId(), role: 'user', text: q, ts: Date.now() }];
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
          ts: Date.now(),
        }]);
      },
      onError: (err) => {
        setMessages((m) => [...m, {
          id: nextId(),
          role: 'assistant',
          error: err?.message || 'The copilot request failed.',
          retryText: q,
          ts: Date.now(),
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

  // ↑/↓ recall previous questions (shell-style); the in-progress draft is
  // restored when you arrow back past the newest entry.
  const onInputKeyDown = (e) => {
    if (e.isComposing) return;
    const h = histRef.current;
    if (e.key === 'ArrowUp') {
      if (!h.list.length) return;
      e.preventDefault();
      if (h.idx === null) { h.draft = input; h.idx = h.list.length - 1; } else if (h.idx > 0) { h.idx -= 1; }
      setInput(h.list[h.idx]);
    } else if (e.key === 'ArrowDown') {
      if (h.idx === null) return;
      e.preventDefault();
      if (h.idx < h.list.length - 1) {
        h.idx += 1;
        setInput(h.list[h.idx]);
      } else {
        h.idx = null;
        setInput(h.draft);
      }
    }
  };

  const dismissDisclaimer = () => {
    setShowDisclaimer(false);
    try { localStorage.setItem(KEY_DISCLAIMER, '1'); } catch { /* private mode */ }
  };

  const exportConversation = () => {
    downloadTextFile(
      `dappa-copilot-${format(new Date(), 'yyyyMMdd-HHmm')}.txt`,
      conversationToText(messages),
    );
    toast.success('Conversation exported as text');
  };

  const clearConversation = () => {
    setMessages([]);
    toast.info('Conversation cleared');
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
        <div className="flex items-center gap-1.5">
          <EngineBadge engine={lastEngine} />
          {messages.length > 0 && (
            <>
              <Tooltip label="Download this conversation as a .txt transcript">
                <button type="button" className="btn-ghost !px-2 !text-xs" onClick={exportConversation} aria-label="Export conversation">
                  <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5" /><path d="M4 19h16" /></svg>
                  <span className="hidden sm:inline">Export</span>
                </button>
              </Tooltip>
              <Tooltip label="Clear the conversation (history for ↑ recall is kept)">
                <button type="button" className="btn-ghost !px-2 !text-xs" onClick={clearConversation} aria-label="Clear conversation">
                  <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" /></svg>
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {showDisclaimer && (
        <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber/40 bg-amber/5 px-3 py-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" {...ICON} className="text-amber shrink-0 mt-0.5" aria-hidden="true">
            <path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4m0 3h.01" />
          </svg>
          <p className="flex-1 text-xs text-muted leading-relaxed">
            <strong className="text-amber">Decision support, not decisions.</strong>{' '}
            Answers are generated from synthetic demo data by a parser/LLM pipeline and can be
            imperfect — expand &ldquo;Show ZCQL&rdquo; under an answer to verify the underlying query before acting on it.
          </p>
          <button
            type="button"
            onClick={dismissDisclaimer}
            aria-label="Dismiss disclaimer"
            className="shrink-0 -mr-1 rounded-lg p-1 text-muted hover:text-ink transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}

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
            <SuggestionCarousel
              questions={SUGGESTED_QUESTIONS}
              onPick={(q) => send(q)}
              disabled={copilot.isPending}
            />
          )}
          <form onSubmit={submit} className="flex items-center gap-2">
            {speech.supported && (
              <Tooltip label={speech.listening ? 'Stop listening' : 'Ask by voice (en-IN)'}>
                <button
                  type="button"
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  aria-label={speech.listening ? 'Stop voice input' : 'Start voice input'}
                  aria-pressed={speech.listening}
                  className={`grid place-items-center h-10 w-10 shrink-0 rounded-lg border transition-colors ${
                    speech.listening
                      ? 'border-signal/60 text-signal bg-signal/10 animate-pulse'
                      : 'border-grid text-muted hover:text-primary hover:border-primary/60'
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                </button>
              </Tooltip>
            )}
            <input
              ref={inputRef}
              className="input-dark flex-1 !py-2.5 min-w-0"
              placeholder={speech.listening ? 'Listening…' : 'e.g. top 5 districts for vehicle theft this year'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
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
