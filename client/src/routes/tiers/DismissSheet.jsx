// "Not tonight — give a reason": the Beat / Station dismiss control. A real
// control (design correction 5): a bottom sheet with a required reason, 44 px
// buttons, and a result line that says where the record went (action log or
// this phone only). Props: open, onClose, onSave(reason) → Promise<record>,
// title?, pending?
import { useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import { useI18n } from '../../lib/i18n.jsx';

export default function DismissSheet({ open, onClose, onSave, title }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const text = reason.trim();
    if (!text) { setError(t('tier.beat.dismiss.needReason')); return; }
    setBusy(true);
    try {
      await onSave(text);
      setReason('');
      setError('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={title || t('tier.beat.dismiss.title')}>
      <form className="space-y-3 px-1 pb-1" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label htmlFor="tier-dismiss-reason" className="block text-xs font-medium text-muted">{t('tier.beat.dismiss.reason')}</label>
        <textarea
          id="tier-dismiss-reason"
          value={reason}
          onChange={(e) => { setReason(e.target.value); if (error) setError(''); }}
          placeholder={t('tier.beat.dismiss.placeholder')}
          rows={3}
          required
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'tier-dismiss-error' : undefined}
          className="input-dark w-full text-base"
        />
        {error && <p id="tier-dismiss-error" role="alert" className="text-xs text-signal">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn min-h-[44px] flex-1 justify-center">{t('tier.beat.dismiss.cancel')}</button>
          <button type="submit" disabled={busy} className="btn-primary min-h-[44px] flex-1 justify-center">{t('tier.beat.dismiss.save')}</button>
        </div>
      </form>
    </Sheet>
  );
}
