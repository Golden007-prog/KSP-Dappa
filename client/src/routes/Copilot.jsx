// Route 8 /copilot — "Ask DAPPA" chat. User/assistant bubbles with relative
// timestamps, typing indicator, answers with an optional ECharts block
// (theme-aware, bar⇄line toggle, data table, CSV/PNG export), collapsible
// ZCQL reveal with copy, regenerate + copy-answer buttons, pinned questions,
// suggestion chip carousel, transcript export (.txt/.md/.json), conversation
// persistence (localStorage), input history (↑/↓, persisted), '/' focus and
// Esc shortcuts, voice input via webkitSpeechRecognition (hidden when
// unsupported), a dismissible disclaimer banner, engine + latency badges, a
// print stylesheet for clean Ctrl+P output, and auto-send of the ?q= URL
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
import ExportMenu from './copilot/ExportMenu.jsx';
import { SUGGESTED_QUESTIONS } from './copilot/suggestions.js';
import {
  conversationToJson, conversationToMarkdown, conversationToText, downloadTextFile,
} from './copilot/transcript.js';
import useSpeechInput from './copilot/useSpeechInput.js';

const KEY_HISTORY = 'dappa-copilot-history';
const KEY_DISCLAIMER = 'dappa-copilot-disclaimer';
const KEY_CONVO = 'dappa-copilot-convo';
const KEY_PINS = 'dappa-copilot-pins';
const HISTORY_CAP = 50;
const CONVO_CAP = 60;
const PINS_CAP = 12;

const loadHistory = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_HISTORY));
    return Array.isArray(v) ? v.map(String).slice(-HISTORY_CAP) : [];
  } catch {
    return [];
  }
};

// Restore the saved conversation so navigating away and back keeps the chat.
const loadConversation = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_CONVO));
    if (!Array.isArray(v)) return [];
    return v
      .filter((m) => m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-CONVO_CAP)
      .map((m, i) => ({ ...m, id: typeof m.id === 'number' ? m.id : i + 1 }));
  } catch {
    return [];
  }
};

const loadPins = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_PINS));
    return Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, PINS_CAP) : [];
  } catch {
    return [];
  }
};

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

// mobile soft keyboards shouldn't pop (and hide the empty state) on load
const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

// Ctrl+P: let the chat grow to full height on white, hide chrome (via
// .no-print), and lighten the bubbles so the Q&A record prints legibly.
const PRINT_CSS = `
@media print {
  .copilot-shell { height: auto !important; min-height: 0 !important; border: none !important; }
  .copilot-scroll { overflow: visible !important; }
  .copilot-shell .bg-panel, .copilot-shell .bg-amber\\/10, .copilot-shell .bg-base\\/60 {
    background: #ffffff !important; box-shadow: none !important;
  }
  .copilot-shell .text-ink { color: #111827 !important; }
  .copilot-shell .text-muted { color: #4b5563 !important; }
  .copilot-shell pre { color: #0f766e !important; background: #f8fafc !important; }
}`;

export default function Copilot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const copilot = useCopilotQuery();
  const toast = useToast();
  const [messages, setMessages] = useState(loadConversation);
  const [pinned, setPinned] = useState(loadPins);
  const [input, setInput] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [, setHistVersion] = useState(0); // re-render after clearing ↑ history
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try { return localStorage.getItem(KEY_DISCLAIMER) !== '1'; } catch { return true; }
  });
  const idRef = useRef(messages.reduce((a, m) => Math.max(a, m.id || 0), 0));
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

  /** Dispatch a question. Returns true when it was actually sent. */
  const send = (text, opts = {}) => {
    const q = String(text || '').trim();
    if (!q || copilot.isPending) return false;
    const h = histRef.current;
    if (h.list[h.list.length - 1] !== q) {
      h.list = [...h.list, q].slice(-HISTORY_CAP);
      try { localStorage.setItem(KEY_HISTORY, JSON.stringify(h.list)); } catch { /* private mode */ }
    }
    h.idx = null;
    h.draft = '';
    const startedAt = Date.now();
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
          question: q,
          latencyMs: Date.now() - startedAt,
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
    return true;
  };

  // ?q= from the Dashboard omnibox — auto-ask once per distinct value (also
  // covers in-place navigation while already on /copilot). Re-runs when a
  // pending mutation clears so an omnibox question that arrived mid-flight is
  // queued instead of silently dropped.
  useEffect(() => {
    const q = searchParams.get('q');
    if (!q || q === autoQRef.current || copilot.isPending) return;
    if (send(q)) autoQRef.current = q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, copilot.isPending]);

  // Persist the conversation (capped) so it survives navigating away and back.
  useEffect(() => {
    try {
      if (messages.length) localStorage.setItem(KEY_CONVO, JSON.stringify(messages.slice(-CONVO_CAP)));
      else localStorage.removeItem(KEY_CONVO);
    } catch { /* private mode / quota */ }
  }, [messages]);

  useEffect(() => {
    try {
      if (pinned.length) localStorage.setItem(KEY_PINS, JSON.stringify(pinned));
      else localStorage.removeItem(KEY_PINS);
    } catch { /* private mode */ }
  }, [pinned]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, copilot.isPending]);

  // relative timestamps ('4 min ago') tick over once a minute
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // '/' focuses the input from anywhere; Esc stops voice capture or blurs.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (speech.listening) {
          e.preventDefault();
          speech.stop();
        } else if (el === inputRef.current) {
          el.blur();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [speech]);

  // Ctrl+P: expand every "Show ZCQL" reveal so the printout is complete.
  useEffect(() => {
    const openAll = () => {
      document.querySelectorAll('.copilot-scroll details').forEach((d) => { d.open = true; });
    };
    window.addEventListener('beforeprint', openAll);
    return () => window.removeEventListener('beforeprint', openAll);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (send(input)) setInput('');
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

  const exportConversation = (fmt = 'txt') => {
    const stamp = format(new Date(), 'yyyyMMdd-HHmm');
    if (fmt === 'md') {
      downloadTextFile(`dappa-copilot-${stamp}.md`, conversationToMarkdown(messages), 'text/markdown;charset=utf-8');
    } else if (fmt === 'json') {
      downloadTextFile(`dappa-copilot-${stamp}.json`, conversationToJson(messages), 'application/json;charset=utf-8');
    } else {
      downloadTextFile(`dappa-copilot-${stamp}.txt`, conversationToText(messages));
    }
    toast.success(`Conversation exported as .${fmt}`);
  };

  const newChat = () => {
    setMessages([]);
    autoQRef.current = '';
    // drop a stale ?q= so the queue effect can't re-ask it after the reset
    if (searchParams.get('q')) setSearchParams({}, { replace: true });
    toast.info('New chat started — input history (↑) is kept');
  };

  const togglePin = (q) => {
    const text = String(q || '').trim();
    if (!text) return;
    setPinned((p) => (p.includes(text)
      ? p.filter((x) => x !== text)
      : [text, ...p].slice(0, PINS_CAP)));
  };

  const clearHistory = () => {
    histRef.current.list = [];
    histRef.current.idx = null;
    histRef.current.draft = '';
    try { localStorage.removeItem(KEY_HISTORY); } catch { /* private mode */ }
    setHistVersion((v) => v + 1);
    toast.info('Question history cleared');
  };

  const regenerate = (msg) => {
    if (msg?.question) send(msg.question, { silent: true, replaceId: msg.id });
  };

  const lastEngine = [...messages].reverse().find((m) => m.role === 'assistant' && m.engine)?.engine;
  const empty = messages.length === 0 && !copilot.isPending;
  const recent = [...new Set([...histRef.current.list].reverse())].slice(0, 4);
  const emptySuggestions = [...pinned, ...SUGGESTED_QUESTIONS.filter((q) => !pinned.includes(q))].slice(0, 8);

  return (
    <div className="copilot-shell flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-7.5rem)] min-h-[420px] md:min-h-[480px] max-w-4xl mx-auto">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pb-3">
        <div>
          <h1 className="page-title">Ask DAPPA</h1>
          <p className="page-subtitle hidden sm:block">Natural-language crime analytics — every answer shows its query and its engine</p>
        </div>
        <div className="no-print flex items-center gap-1.5">
          <EngineBadge engine={lastEngine} />
          {messages.length > 0 && (
            <>
              <ExportMenu onExport={exportConversation} />
              <Tooltip label="Start a new chat (the saved transcript is cleared; ↑ history is kept)">
                <button type="button" className="btn-ghost !px-2 !text-xs min-h-[40px]" onClick={newChat} aria-label="Start a new chat">
                  <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  <span className="hidden sm:inline">New chat</span>
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {showDisclaimer && (
        <div className="no-print mb-3 flex items-start gap-2.5 rounded-xl border border-amber/40 bg-amber/5 px-3 py-2.5">
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
            className="shrink-0 -m-2 grid place-items-center h-10 w-10 rounded-lg text-muted hover:text-ink transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}

      <section className="flex-1 min-h-0 flex flex-col bg-panel border border-grid rounded-xl overflow-hidden">
        {/* conversation */}
        <div className="copilot-scroll flex-1 min-h-0 overflow-y-auto p-4">
          {empty ? (
            <div className="min-h-full flex flex-col items-center justify-center">
              <EmptyState
                compact
                title="Ask anything about Karnataka crime data"
                message="Trends, comparisons, forecasts, risk, offenders — answered from the synthetic Data Store, with the generated ZCQL on show."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 w-full max-w-2xl">
                {emptySuggestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`text-left text-xs rounded-lg px-3 py-2.5 min-h-[44px] border transition-colors ${
                      pinned.includes(q)
                        ? 'border-amber/50 bg-amber/5 text-amber hover:border-amber'
                        : 'border-grid bg-base/60 text-muted hover:border-amber/50 hover:text-ink'
                    }`}
                    onClick={() => send(q)}
                  >
                    {pinned.includes(q) ? '★ ' : ''}{q}
                  </button>
                ))}
              </div>
              {recent.length > 0 && (
                <div className="mt-4 w-full max-w-2xl">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="eyebrow">Recent questions</p>
                    <button
                      type="button"
                      className="text-[11px] text-muted hover:text-signal transition-colors min-h-[40px] px-2 -my-2"
                      onClick={clearHistory}
                    >
                      Clear history
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((q) => (
                      <button
                        key={q}
                        type="button"
                        className="text-left text-[11px] text-muted border border-grid bg-base/60 rounded-full px-3 min-h-[40px] hover:border-primary/50 hover:text-ink transition-colors"
                        onClick={() => send(q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Conversation with DAPPA"
              className="space-y-4"
            >
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  now={now}
                  pinned={m.role === 'user' && pinned.includes(m.text)}
                  onRetry={(msg) => send(msg.retryText, { silent: true, replaceId: msg.id })}
                  onRegenerate={regenerate}
                  onTogglePin={togglePin}
                />
              ))}
              {copilot.isPending && <TypingBubble />}
              <div ref={endRef} />
            </div>
          )}
        </div>
        {/* screen-reader announcement for the visual typing indicator */}
        <p className="sr-only" role="status">{copilot.isPending ? 'DAPPA is thinking' : ''}</p>

        {/* suggestions + input */}
        <div className="no-print border-t border-grid p-3 space-y-2">
          {!empty && (
            <SuggestionCarousel
              questions={SUGGESTED_QUESTIONS}
              pinned={pinned}
              onPick={(q) => send(q)}
              onTogglePin={togglePin}
              disabled={copilot.isPending}
            />
          )}
          <form onSubmit={submit} className="flex items-center gap-2">
            {speech.supported && (
              <Tooltip label={speech.listening ? 'Stop listening (Esc)' : 'Ask by voice (en-IN)'}>
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
              autoFocus={FINE_POINTER}
            />
            <button
              type="submit"
              className="btn-primary !py-2.5 min-h-[40px] disabled:opacity-50"
              disabled={copilot.isPending || !input.trim()}
            >
              {copilot.isPending ? 'Thinking…' : 'Ask'}
            </button>
          </form>
          <p className="hidden sm:block text-[10px] text-muted/80 px-0.5">
            <kbd className="rounded border border-grid bg-base/60 px-1 py-0.5">/</kbd> focus ·{' '}
            <kbd className="rounded border border-grid bg-base/60 px-1 py-0.5">↑↓</kbd> history ·{' '}
            <kbd className="rounded border border-grid bg-base/60 px-1 py-0.5">Esc</kbd> stop voice / blur
          </p>
        </div>
      </section>
    </div>
  );
}
