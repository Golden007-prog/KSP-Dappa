// Route 8 /copilot — "Ask DAPPA" chat. User/assistant bubbles with relative
// timestamps, typing indicator, answers with an optional ECharts block
// (theme-aware, bar⇄line toggle, data table, CSV/PNG export), collapsible
// ZCQL reveal with copy, regenerate + copy-answer buttons, pinned questions,
// suggestion chip carousel, transcript export (.txt/.md/.json), conversation
// persistence (localStorage), input history (↑/↓, persisted), '/' focus and
// Esc shortcuts, voice input via webkitSpeechRecognition (hidden when
// unsupported), a dismissible disclaimer banner, engine + latency badges, a
// print stylesheet for clean Ctrl+P output, and auto-send of the ?q= URL
// param that the Dashboard omnibox passes in. Second pass adds the AI-story
// storefront: per-answer provenance (confidence, intent, source-table
// citations, "how answered" pipeline), contextual follow-up chips, a
// searchable question-history panel, a two-answer compare split view,
// read-aloud, session stats, and a capability guide. See client/CONTRACT.md.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useCopilotQuery } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Tooltip from '../components/Tooltip.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import MessageBubble, { EngineBadge, TypingBubble } from './copilot/MessageBubble.jsx';
import SuggestionCarousel from './copilot/SuggestionCarousel.jsx';
import ExportMenu from './copilot/ExportMenu.jsx';
import CapabilityGuide from './copilot/CapabilityGuide.jsx';
import CompareSheet from './copilot/CompareSheet.jsx';
import FollowUpChips from './copilot/FollowUpChips.jsx';
import HistoryPanel from './copilot/HistoryPanel.jsx';
import { followUpsFor } from './copilot/answerMeta.js';
import { SUGGESTED_QUESTIONS } from './copilot/suggestions.js';
import {
  conversationToJson, conversationToMarkdown, conversationToText, downloadTextFile, latencyLabel,
} from './copilot/transcript.js';
import useReadAloud from './copilot/useReadAloud.js';
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
  .copilot-scrollwrap, .copilot-scroll { height: auto !important; }
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
  const { lang, t } = useI18n();
  const [messages, setMessages] = useState(loadConversation);
  const [pinned, setPinned] = useState(loadPins);
  const [input, setInput] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [, setHistVersion] = useState(0); // re-render after clearing ↑ history
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try { return localStorage.getItem(KEY_DISCLAIMER) !== '1'; } catch { return true; }
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compare, setCompare] = useState([]); // message ids picked for compare (max 2)
  const [compareOpen, setCompareOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const idRef = useRef(messages.reduce((a, m) => Math.max(a, m.id || 0), 0));
  const autoQRef = useRef('');
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const readAloud = useReadAloud();
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
        toast.error(t('copilot.voice.blocked'));
      } else if (code === 'no-speech') {
        toast.info(t('copilot.voice.noSpeech'));
      } else if (code !== 'aborted') {
        toast.error(t('copilot.voice.failed'));
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
          text: d.answer || t('copilot.answer.none'),
          chart: d.chart,
          zcql: d.zcql,
          engine: d.engine,
          intent: d.intent,
          suggestions: Array.isArray(d.suggestions) ? d.suggestions.map(String).slice(0, 4) : undefined,
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
          error: err?.message || t('copilot.answer.requestFailed'),
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

  // Compare picks must always point at live messages (regenerate/new-chat
  // replace ids); prune stale ids and close the sheet if a pane vanished.
  useEffect(() => {
    setCompare((p) => {
      const next = p.filter((id) => messages.some((m) => m.id === id));
      return next.length === p.length ? p : next;
    });
  }, [messages]);
  useEffect(() => {
    if (compareOpen && compare.length < 2) setCompareOpen(false);
  }, [compareOpen, compare]);

  const toggleCompare = (id) => {
    const p = compare;
    const next = p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : [p[0], id];
    setCompare(next);
    if (!p.includes(id) && next.length === 2) setCompareOpen(true);
  };

  // jump-to-latest affordance appears once the reader scrolls up a screen
  const onChatScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 280);
  };
  const jumpToLatest = () => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });

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
    toast.success(t('copilot.export.done', { fmt }));
  };

  const newChat = () => {
    setMessages([]);
    setCompare([]);
    setCompareOpen(false);
    readAloud.stop();
    autoQRef.current = '';
    // drop a stale ?q= so the queue effect can't re-ask it after the reset
    if (searchParams.get('q')) setSearchParams({}, { replace: true });
    toast.info(t('copilot.newChat.toast'));
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
    toast.info(t('copilot.history.cleared'));
  };

  const deleteHistoryItem = (q) => {
    const h = histRef.current;
    h.list = h.list.filter((x) => x !== q);
    h.idx = null;
    h.draft = '';
    try {
      if (h.list.length) localStorage.setItem(KEY_HISTORY, JSON.stringify(h.list));
      else localStorage.removeItem(KEY_HISTORY);
    } catch { /* private mode */ }
    setHistVersion((v) => v + 1);
  };

  const regenerate = (msg) => {
    if (msg?.question) send(msg.question, { silent: true, replaceId: msg.id });
  };

  const lastEngine = [...messages].reverse().find((m) => m.role === 'assistant' && m.engine)?.engine;
  const empty = messages.length === 0 && !copilot.isPending;
  const historyItems = [...new Set([...histRef.current.list].reverse())];
  const recent = historyItems.slice(0, 4);
  const emptySuggestions = [...pinned, ...SUGGESTED_QUESTIONS.filter((q) => !pinned.includes(q))].slice(0, 8);

  // session stats: questions asked, mean answer latency, engine mix (tooltip)
  const asked = messages.filter((m) => m.role === 'user').length;
  const timed = messages.filter((m) => m.role === 'assistant' && typeof m.latencyMs === 'number');
  const avgMs = timed.length ? timed.reduce((a, m) => a + m.latencyMs, 0) / timed.length : null;
  const engineMix = Object.entries(messages.reduce((acc, m) => {
    if (m.role === 'assistant' && m.engine) acc[m.engine] = (acc[m.engine] || 0) + 1;
    return acc;
  }, {})).map(([k, v]) => `${k} ×${v}`).join(', ');

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.error);
  const followUps = useMemo(
    () => (copilot.isPending ? [] : followUpsFor(lastAssistant)),
    [lastAssistant, copilot.isPending],
  );
  const compareMsgs = compare.map((id) => messages.find((m) => m.id === id)).filter(Boolean);

  return (
    <div className="copilot-shell flex flex-col h-[calc(100dvh-10rem)] md:h-[calc(100dvh-7.5rem)] min-h-[420px] md:min-h-[480px] max-w-4xl mx-auto">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 pb-3">
        <div>
          <h1 className="page-title">{t('copilot.page.title')}</h1>
          <p className="page-subtitle hidden sm:block">{t('copilot.page.subtitle')}</p>
        </div>
        <div className="no-print flex items-center gap-1.5">
          {asked > 0 && (
            <Tooltip label={`${asked === 1 ? t('copilot.stats.tooltipOne') : t('copilot.stats.tooltipMany', { n: asked })}${engineMix ? ` · ${t('copilot.stats.engines', { mix: engineMix })}` : ''}`}>
              <span className="num hidden md:inline-flex items-center px-1 text-[10px] text-muted whitespace-nowrap">
                {t('copilot.stats.count', { n: asked })}
                {avgMs !== null ? ` · ${t('copilot.stats.avg', { t: latencyLabel(avgMs) })}` : ''}
              </span>
            </Tooltip>
          )}
          <EngineBadge engine={lastEngine} />
          <Tooltip label={t('copilot.history.tooltip')}>
            <button type="button" className="btn-ghost !px-2 !text-xs min-h-[40px]" onClick={() => setHistoryOpen(true)} aria-label={t('copilot.history.open')}>
              <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" /><path d="M12 7v5l3.5 2" />
              </svg>
              <span className="hidden sm:inline">{t('copilot.history.label')}</span>
            </button>
          </Tooltip>
          {messages.length > 0 && (
            <>
              <ExportMenu onExport={exportConversation} />
              <Tooltip label={t('copilot.newChat.tooltip')}>
                <button type="button" className="btn-ghost !px-2 !text-xs min-h-[40px]" onClick={newChat} aria-label={t('copilot.newChat.aria')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  <span className="hidden sm:inline">{t('copilot.newChat.label')}</span>
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* The backend answers in English; say so rather than faking a translated
          answer. Only shown when the UI is not already in English. */}
      {lang !== 'en' && (
        <p className="no-print mb-2 flex items-start gap-2 text-[11px] text-muted leading-relaxed">
          <svg width="13" height="13" viewBox="0 0 24 24" {...ICON} className="text-primary shrink-0 mt-0.5" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" />
          </svg>
          <span>{t('copilot.note.englishAnswers')}</span>
        </p>
      )}

      {showDisclaimer && (
        <div className="no-print mb-3 flex items-start gap-2.5 rounded-xl border border-amber/40 bg-amber/5 px-3 py-2.5">
          <svg width="15" height="15" viewBox="0 0 24 24" {...ICON} className="text-amber shrink-0 mt-0.5" aria-hidden="true">
            <path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4m0 3h.01" />
          </svg>
          <p className="flex-1 text-xs text-muted leading-relaxed">
            <strong className="text-amber">{t('copilot.disclaimer.strong')}</strong>{' '}
            {t('copilot.disclaimer.body')}
          </p>
          <button
            type="button"
            onClick={dismissDisclaimer}
            aria-label={t('copilot.disclaimer.dismiss')}
            className="shrink-0 -m-2 grid place-items-center h-10 w-10 rounded-lg text-muted hover:text-ink transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}

      <section className="flex-1 min-h-0 flex flex-col bg-panel border border-grid rounded-xl overflow-hidden">
        {/* conversation */}
        <div className="copilot-scrollwrap relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={onChatScroll} className="copilot-scroll h-full overflow-y-auto p-4">
          {empty ? (
            <div className="min-h-full flex flex-col items-center justify-center">
              <EmptyState
                compact
                title={t('copilot.empty.title')}
                message={t('copilot.empty.message')}
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
                    <p className="eyebrow">{t('copilot.empty.recent')}</p>
                    <button
                      type="button"
                      className="text-[11px] text-muted hover:text-signal transition-colors min-h-[40px] px-2 -my-2"
                      onClick={clearHistory}
                    >
                      {t('copilot.empty.clearHistory')}
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
              <CapabilityGuide onAsk={(q) => send(q)} disabled={copilot.isPending} />
            </div>
          ) : (
            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label={t('copilot.log.aria')}
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
                  onAsk={(q) => send(q)}
                  onToggleCompare={m.role === 'assistant' && !m.error ? toggleCompare : undefined}
                  compareSelected={compare.includes(m.id)}
                  readAloud={readAloud}
                />
              ))}
              {followUps.length > 0 && <FollowUpChips items={followUps} onPick={(q) => send(q)} disabled={copilot.isPending} />}
              {copilot.isPending && <TypingBubble />}
              <div ref={endRef} />
            </div>
          )}
        </div>
        {showJump && !empty && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="no-print absolute bottom-3 right-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-grid bg-panel/95 backdrop-blur-sm px-3 min-h-[40px] text-[11px] text-muted shadow-lift hover:text-ink hover:border-primary/60 transition-colors"
            aria-label={t('copilot.jump.aria')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" {...ICON} aria-hidden="true"><path d="M12 5v14m0 0 5-5m-5 5-5-5" /></svg>
            {t('copilot.jump.label')}
          </button>
        )}
        </div>
        {/* screen-reader announcement for the visual typing indicator */}
        <p className="sr-only" role="status">{copilot.isPending ? t('copilot.status.thinking') : ''}</p>

        {/* suggestions + input */}
        <div className="no-print border-t border-grid p-3 space-y-2">
          {compare.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1 text-[11px] text-muted" role="status">
              <span>{t(compare.length === 2 ? 'copilot.compare.twoPicked' : 'copilot.compare.pickOneMore')}</span>
              <button
                type="button"
                className="min-h-[40px] px-1.5 text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                disabled={compare.length < 2}
                onClick={() => setCompareOpen(true)}
              >
                {t('copilot.compare.openSideBySide')}
              </button>
              <button type="button" className="min-h-[40px] px-1.5 hover:text-signal transition-colors" onClick={() => setCompare([])}>
                {t('common.action.clear')}
              </button>
            </div>
          )}
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
              <Tooltip label={t(speech.listening ? 'copilot.voice.stopTip' : 'copilot.voice.startTip')}>
                <button
                  type="button"
                  onClick={() => (speech.listening ? speech.stop() : speech.start())}
                  aria-label={t(speech.listening ? 'copilot.voice.stopAria' : 'copilot.voice.startAria')}
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
              placeholder={t(speech.listening ? 'copilot.input.listening' : 'copilot.input.placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKeyDown}
              aria-label={t('copilot.input.aria')}
              autoFocus={FINE_POINTER}
            />
            <button
              type="submit"
              className="btn-primary !py-2.5 min-h-[40px] disabled:opacity-50"
              disabled={copilot.isPending || !input.trim()}
            >
              {t(copilot.isPending ? 'copilot.send.pending' : 'copilot.send.label')}
            </button>
          </form>
          <p className="hidden sm:block text-[10px] text-muted/80 px-0.5">
            <kbd className="rounded border border-grid bg-base/60 px-1 py-0.5">/</kbd> {t('copilot.keys.focus')} ·{' '}
            <kbd className="rounded border border-grid bg-base/60 px-1 py-0.5">↑↓</kbd> {t('copilot.keys.history')} ·{' '}
            <kbd className="rounded border border-grid bg-base/60 px-1 py-0.5">Esc</kbd> {t('copilot.keys.stopVoice')}
          </p>
        </div>
      </section>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={historyItems}
        pinned={pinned}
        onAsk={(q) => send(q)}
        onTogglePin={togglePin}
        onDelete={deleteHistoryItem}
        onClearAll={clearHistory}
      />
      <CompareSheet
        open={compareOpen && compareMsgs.length === 2}
        onClose={() => setCompareOpen(false)}
        left={compareMsgs[0]}
        right={compareMsgs[1]}
        onSwap={() => setCompare(([a, b]) => [b, a])}
      />
    </div>
  );
}
