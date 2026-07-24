// /copilot — conversation export helpers. Pure client-side (Blob download),
// so they work on Catalyst and the static GitHub Pages demo alike. copyText
// lives in clipboard.js (shared with Reports) and is re-exported here for the
// bubble components.
import { format } from 'date-fns';

export { copyText } from './clipboard.js';

export const timeLabel = (ts) => {
  try {
    return format(new Date(ts), 'HH:mm');
  } catch {
    return '';
  }
};

/** Serialize the chat to a plain-text transcript (answers, ZCQL, engine). */
export function conversationToText(messages) {
  const lines = [
    'Ask DAPPA — conversation transcript',
    `Exported: ${format(new Date(), 'dd MMM yyyy HH:mm')}`,
    'Synthetic demonstration data — KSP Datathon 2026 prototype. Not real crime records.',
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
      if (m.engine) lines.push(`  engine: ${m.engine}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Download `text` as a .txt file. */
export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
