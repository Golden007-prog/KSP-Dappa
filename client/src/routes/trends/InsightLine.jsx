// One-line auto-generated insight rendered under a chart card.
// Renders nothing when there is no sentence (empty/error states show in the chart).
import { useT } from '../../lib/i18n.jsx';

export default function InsightLine({ text, loading = false }) {
  const t = useT();
  if (loading) return <div className="skeleton h-3.5 w-2/3" aria-hidden="true" />;
  if (!text) return null;
  return (
    <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
      <span className="text-amber mt-px" aria-hidden="true">◆</span>
      <span>
        <span className="font-medium text-ink/80">{t('trends.insight.label')} · </span>
        {text}
      </span>
    </p>
  );
}
