// /alerts — digest composer sheet.
//
// Opens on the current bulk selection (or the top of the open queue when
// nothing is selected), shows the composed text live, and lets the officer
// trim it before it leaves the building: a severity floor, a cap on how many
// alerts to include, and an optional "prepared by" stamp. Output goes to the
// clipboard or a .txt download — both purely client-side, so this works
// identically on Catalyst and in the static demo.
import { useMemo, useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt } from '../../lib/format.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { buildDigest, digestFilename } from './digest.js';
import { downloadBlob } from './csv.js';
import { sevRank } from './severity.js';

const FLOORS = ['low', 'medium', 'high', 'critical'];
const LIMITS = [5, 10, 20, 50];
const BTN = 'btn !text-xs flex-1 justify-center min-h-[44px]';

export default function DigestComposer({
  open, onClose, alerts, preparedBy = '', metaFor, onCopy, onSent,
}) {
  const t = useT();
  const tName = useNames();
  const [floor, setFloor] = useState('low');
  const [limit, setLimit] = useState(10);
  const [by, setBy] = useState(preparedBy);

  const picked = useMemo(() => {
    const min = sevRank(floor);
    return (alerts || [])
      .filter((a) => sevRank(a.severity) >= min)
      .slice(0, limit);
  }, [alerts, floor, limit]);

  const text = useMemo(
    () => buildDigest(picked, { t, tName, metaFor, preparedBy: by.trim() }),
    [picked, t, tName, metaFor, by],
  );

  const copy = async () => {
    const ok = await onCopy?.(text);
    if (ok) onSent?.(picked);
  };

  const download = () => {
    if (!text) return;
    downloadBlob(digestFilename(), text, 'text/plain;charset=utf-8');
    onSent?.(picked);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('alerts.digest.title')}>
      <div className="space-y-3 px-1 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={picked.length ? 'amber' : 'slate'} className="num">
            {t('alerts.digest.included', { n: fmtInt(picked.length), total: fmtInt((alerts || []).length) })}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <span className="block text-[11px] text-muted">{t('alerts.digest.floor')}</span>
          <SegmentedControl
            options={FLOORS.map((f) => ({ value: f, label: t(`alerts.sev.${f}`) }))}
            value={floor}
            onChange={setFloor}
            ariaLabel={t('alerts.digest.floorAria')}
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <span className="block text-[11px] text-muted">{t('alerts.digest.limit')}</span>
          <SegmentedControl
            options={LIMITS.map((n) => ({ value: n, label: String(n) }))}
            value={limit}
            onChange={setLimit}
            ariaLabel={t('alerts.digest.limitAria')}
            className="w-full"
          />
        </div>

        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{t('alerts.digest.by')}</span>
          <input
            className="input-dark w-full !py-2 !text-xs"
            value={by}
            maxLength={80}
            onChange={(e) => setBy(e.target.value)}
            placeholder={t('alerts.digest.byPlaceholder')}
            aria-label={t('alerts.digest.byAria')}
          />
        </label>

        <label className="block">
          <span className="mb-0.5 block text-[11px] text-muted">{t('alerts.digest.preview')}</span>
          <textarea
            readOnly
            rows={10}
            value={text || t('alerts.digest.emptyPreview')}
            aria-label={t('alerts.digest.previewAria')}
            className="input-dark w-full !text-[11px] leading-relaxed"
          />
        </label>

        <div className="flex items-center gap-2">
          <button type="button" className={`btn-primary ${BTN}`} disabled={!text} onClick={copy}>
            {t('alerts.digest.copy')}
          </button>
          <button type="button" className={BTN} disabled={!text} onClick={download}>
            {t('alerts.digest.download')}
          </button>
        </div>

        <p className="text-[10px] leading-tight text-muted">{t('alerts.digest.note')}</p>
      </div>
    </Sheet>
  );
}
