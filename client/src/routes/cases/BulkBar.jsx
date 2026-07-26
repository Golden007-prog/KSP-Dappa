// Sticky action bar for the bulk selection. Sits below the compare tray in
// normal flow, so the two never overlap even when both are live.
import Badge from '../../components/Badge.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { BULK_CAP } from './bulk.js';

export default function BulkBar({
  items, starredCount, onStarAll, onUnstarAll, onCopy, onExport, onClear, onExit, exporting = false,
}) {
  const t = useT();
  if (!items.length) return null;
  const allStarred = starredCount >= items.length;
  return (
    <div className="sticky bottom-3 z-30 animate-fade-in no-print" role="region" aria-label={t('cases.bulk.barAria')}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal/40 bg-panel/95 backdrop-blur-sm shadow-lift px-3 py-2">
        <span className="eyebrow shrink-0">{t('cases.bulk.count', { n: fmtInt(items.length), cap: fmtInt(BULK_CAP) })}</span>
        {items.length >= BULK_CAP && <Badge tone="amber">{t('cases.bulk.capped')}</Badge>}
        {starredCount > 0 && <Badge tone="amber">{t('cases.bulk.starredCount', { n: fmtInt(starredCount) })}</Badge>}
        <span className="flex-1" />
        <button type="button" className="btn !py-1.5 !px-2 text-xs" onClick={allStarred ? onUnstarAll : onStarAll}>
          {t(allStarred ? 'cases.bulk.unstarAll' : 'cases.bulk.starAll')}
        </button>
        <button type="button" className="btn !py-1.5 !px-2 text-xs" onClick={onCopy}>
          {t('cases.bulk.copyNos')}
        </button>
        <button type="button" className="btn !py-1.5 !px-2 text-xs" onClick={onExport} disabled={exporting}>
          {t(exporting ? 'cases.toolbar.exporting' : 'cases.bulk.exportCsv')}
        </button>
        <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={onClear}>
          {t('common.action.clear')}
        </button>
        <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs" onClick={onExit}>
          {t('cases.bulk.exit')}
        </button>
      </div>
    </div>
  );
}
