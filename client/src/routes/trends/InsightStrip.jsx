// "AI-style" insight strip — a card of deterministic, templated sentences
// (built in insights.js; no LLM involved, and the badge says so per the
// route convention that every AI-looking feature declares its source).
// Items fade up with a small stagger; a copy button puts the whole digest
// on the clipboard for pasting into a briefing note.
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useT } from '../../lib/i18n.jsx';

export default function InsightStrip({ items = [], loading = false }) {
  const toast = useToast();
  const t = useT();
  const texts = items.filter(Boolean);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(texts.map((s) => `• ${s}`).join('\n'));
      toast.success(t('trends.insights.copied'));
    } catch {
      toast.error(t('trends.clipboard.unavailable'));
    }
  };

  return (
    <Card
      title={t('trends.insights.title')}
      subtitle={t('trends.insights.subtitle')}
      actions={(
        <div className="flex items-center gap-2">
          <Badge tone="slate">{t('trends.insights.badge')}</Badge>
          {texts.length > 0 && (
            <Tooltip label={t('trends.insights.copy')}>
              <button type="button" className="btn-ghost !px-2" onClick={copyAll} aria-label={t('trends.insights.copy')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h8" />
                </svg>
              </button>
            </Tooltip>
          )}
        </div>
      )}
    >
      {loading ? (
        <div className="space-y-2.5" aria-hidden="true">
          <div className="skeleton h-3.5 w-3/4" />
          <div className="skeleton h-3.5 w-2/3" />
          <div className="skeleton h-3.5 w-4/5" />
        </div>
      ) : texts.length === 0 ? (
        <p className="text-xs text-muted">{t('trends.insights.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {texts.map((s, i) => (
            <li
              key={s}
              className="flex items-start gap-2 text-xs leading-relaxed text-ink/90 animate-fade-up"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="text-amber mt-px shrink-0" aria-hidden="true">◆</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
