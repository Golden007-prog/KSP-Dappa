// /copilot — conversation export + time helpers. Pure client-side (Blob
// download), so they work on Catalyst and the static GitHub Pages demo alike.
// copyText lives in clipboard.js (shared with Reports) and is re-exported here
// for the bubble components.
import { format } from 'date-fns';
import { confidenceFor, intentLabel, tablesFromZcql } from './answerMeta.js';

export { copyText } from './clipboard.js';

const DISCLAIMER = 'Synthetic demonstration data — KSP Datathon 2026 prototype. Not real crime records.';

export const timeLabel = (ts) => {
  try {
    return format(new Date(ts), 'HH:mm');
  } catch {
    return '';
  }
};

export const fullTimeLabel = (ts) => {
  try {
    return format(new Date(ts), 'dd MMM yyyy HH:mm');
  } catch {
    return '';
  }
};

/** '4 min ago' / 'just now' for fresh messages; absolute HH:mm after an hour. */
export function relativeTimeLabel(ts, now = Date.now()) {
  const diff = now - Number(ts);
  if (!ts || Number.isNaN(diff)) return '';
  if (diff < 45 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / 60000))} min ago`;
  return timeLabel(ts);
}

/** '0.8s' / '12s' from a millisecond latency; '' when not a valid number. */
export function latencyLabel(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '';
  const s = ms / 1000;
  return s < 9.95 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

const answerMeta = (m) => {
  const parts = [];
  if (m.engine) parts.push(`engine: ${m.engine}`);
  const conf = confidenceFor(m);
  if (conf) parts.push(`confidence: ${conf.label}`);
  const kind = intentLabel(m.intent);
  if (kind) parts.push(`intent: ${kind}`);
  const tables = tablesFromZcql(m.zcql);
  if (tables.length) parts.push(`sources: ${tables.join(', ')}`);
  const lat = latencyLabel(m.latencyMs);
  if (lat) parts.push(`answered in ${lat}`);
  return parts.join(' · ');
};

/** One answer as Markdown (question, answer, provenance line, fenced ZCQL) —
 * for the per-bubble "Copy as Markdown" action. */
export function answerToMarkdown(m) {
  const out = [];
  if (m.question) out.push(`**Q:** ${m.question}`, '');
  out.push(m.text || '', '');
  const meta = answerMeta(m);
  if (meta) out.push(`_${meta}_`, '');
  if (m.chart?.title) out.push(`_Chart: ${m.chart.title}_`, '');
  if (m.zcql) out.push('```sql', String(m.zcql).trim(), '```');
  return `${out.join('\n').trim()}\n`;
}

/** Serialize the chat to a plain-text transcript (answers, ZCQL, engine, latency). */
export function conversationToText(messages) {
  const lines = [
    'Ask DAPPA — conversation transcript',
    `Exported: ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
    DISCLAIMER,
    '',
  ];
  for (const m of messages) {
    const t = m.ts ? `[${timeLabel(m.ts)}] ` : '';
    if (m.role === 'user') {
      lines.push(`${t}You: ${m.text}`);
    } else if (m.error) {
      lines.push(`${t}DAPPA: (failed) ${m.error}`);
    } else {
      lines.push(`${t}DAPPA: ${m.text}`);
      if (m.chart?.title) lines.push(`  [chart: ${m.chart.title}]`);
      if (m.zcql) lines.push(`  ZCQL: ${String(m.zcql).replace(/\s+/g, ' ').trim()}`);
      const meta = answerMeta(m);
      if (meta) lines.push(`  ${meta}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Serialize the chat as Markdown (headings, bold speakers, fenced ZCQL). */
export function conversationToMarkdown(messages) {
  const out = [
    '# Ask DAPPA — conversation transcript',
    '',
    `Exported: ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
    '',
    `> ${DISCLAIMER}`,
    '',
  ];
  for (const m of messages) {
    const t = m.ts ? ` · ${timeLabel(m.ts)}` : '';
    if (m.role === 'user') {
      out.push(`**You${t}:** ${m.text}`, '');
    } else if (m.error) {
      out.push(`**DAPPA${t}:** _request failed — ${m.error}_`, '');
    } else {
      const meta = answerMeta(m);
      out.push(`**DAPPA${t}${meta ? ` · ${meta}` : ''}:**`, '', m.text || '', '');
      if (m.chart?.title) out.push(`_Chart: ${m.chart.title}_`, '');
      if (m.zcql) out.push('```sql', String(m.zcql).trim(), '```', '');
    }
  }
  return out.join('\n');
}

/** Serialize the chat as pretty-printed JSON (full payload incl. charts). */
export function conversationToJson(messages) {
  return JSON.stringify(
    {
      title: 'Ask DAPPA — conversation transcript',
      exportedAt: new Date().toISOString(),
      disclaimer: DISCLAIMER,
      messages: messages.map((m) => {
        const conf = confidenceFor(m);
        const tables = tablesFromZcql(m.zcql);
        return {
          role: m.role,
          ...(m.error ? { error: m.error } : { text: m.text }),
          ts: m.ts ? new Date(m.ts).toISOString() : undefined,
          engine: m.engine || undefined,
          intent: m.intent || undefined,
          confidence: conf ? conf.label : undefined,
          sources: tables.length ? tables : undefined,
          latencyMs: typeof m.latencyMs === 'number' ? m.latencyMs : undefined,
          zcql: m.zcql || undefined,
          chart: m.chart || undefined,
        };
      }),
    },
    null,
    2,
  );
}

/** categories × series → CSV (quoted, CRLF — opens cleanly in Excel/Sheets). */
export function chartToCsv(chart) {
  const cats = Array.isArray(chart?.categories) ? chart.categories.map(String) : [];
  const series = (Array.isArray(chart?.series) ? chart.series : []).filter((s) => s && Array.isArray(s.data));
  if (!cats.length || !series.length) return '';
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Category', ...series.map((s, i) => s.name || `Series ${i + 1}`)].map(esc).join(',')];
  cats.forEach((c, i) => {
    rows.push([esc(c), ...series.map((s) => {
      const v = s.data[i];
      return v === null || v === undefined ? '' : Number(v);
    })].join(','));
  });
  return rows.join('\r\n');
}

/** Download `text` as a file (default plain text; pass a mime for .md/.json/.csv). */
export function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
