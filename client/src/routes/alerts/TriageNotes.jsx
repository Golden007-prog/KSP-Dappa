// /alerts — casework block inside the detail sheet: a triage note, an assigned
// owner, and the audit trail of what this console did to the alert.
//
// The AnomalyAlert table has no Note / Owner / Audit columns and a route filler
// does not get to change the schema, so all three live in localStorage. That is
// stated in the panel rather than glossed over — every entry is a real,
// timestamped action the user took, it survives reloads, and it is exactly what
// makes an SLA claim defensible in a review. Notes travel with the alert into
// the copy action, the digest and the CSV export.
import { useEffect, useState } from 'react';
import Badge from '../../components/Badge.jsx';
import { useT } from '../../lib/i18n.jsx';
import { AUDIT_KINDS } from './useTriageMeta.js';

const NOTE_MAX = 400;
const OWNER_LIST_ID = 'dappa-alert-owners';

/** ms epoch → '24 Jul 14:05' in the browser's locale, never a raw number. */
function stamp(ts) {
  try {
    return new Date(Number(ts)).toLocaleString(undefined, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function TriageNotes({ alertId, meta, owners, onNote, onOwner }) {
  const [note, setNoteDraft] = useState(meta?.note || '');
  const [owner, setOwnerDraft] = useState(meta?.owner || '');
  const t = useT();

  // Re-seed the drafts when the sheet jumps to a different alert.
  useEffect(() => {
    setNoteDraft(meta?.note || '');
    setOwnerDraft(meta?.owner || '');
  }, [alertId, meta?.note, meta?.owner]);

  const events = [...(meta?.events || [])].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 8);

  return (
    <div className="space-y-2 border-t border-grid/60 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {t('alerts.triage.title')}
        </span>
        {meta?.owner && <Badge tone="teal">{t('alerts.triage.assignedTo', { who: meta.owner })}</Badge>}
      </div>

      <label className="block">
        <span className="mb-0.5 block text-[11px] text-muted">{t('alerts.triage.ownerLabel')}</span>
        <input
          className="input-dark w-full !py-2 !text-xs"
          value={owner}
          list={OWNER_LIST_ID}
          maxLength={48}
          placeholder={t('alerts.triage.ownerPlaceholder')}
          aria-label={t('alerts.triage.ownerAria')}
          onChange={(e) => setOwnerDraft(e.target.value)}
          onBlur={() => onOwner?.(alertId, owner)}
        />
        <datalist id={OWNER_LIST_ID}>
          {owners.map((o) => <option key={o} value={o} />)}
        </datalist>
      </label>

      <label className="block">
        <span className="mb-0.5 flex items-center justify-between text-[11px] text-muted">
          {t('alerts.triage.noteLabel')}
          <span className="num">{note.length}/{NOTE_MAX}</span>
        </span>
        <textarea
          className="input-dark w-full !text-xs leading-relaxed"
          rows={3}
          value={note}
          maxLength={NOTE_MAX}
          placeholder={t('alerts.triage.notePlaceholder')}
          aria-label={t('alerts.triage.noteAria')}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => onNote?.(alertId, note)}
        />
      </label>

      {events.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t('alerts.triage.trail')}
          </p>
          <ol className="space-y-0.5">
            {events.map((e, i) => (
              <li
                // Audit entries have no id; index is stable because the list is
                // append-only and re-sorted from the same array each render.
                // eslint-disable-next-line react/no-array-index-key
                key={`${e.k}-${e.ts}-${i}`}
                className="flex items-baseline justify-between gap-2 text-[11px]"
              >
                <span className="text-ink">
                  {t(AUDIT_KINDS.includes(e.k) ? `alerts.audit.${e.k}` : 'alerts.audit.seen')}
                  {e.v ? <span className="text-muted"> — {String(e.v).slice(0, 40)}</span> : null}
                </span>
                <span className="num shrink-0 text-muted">{stamp(e.ts)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-[10px] leading-tight text-muted">{t('alerts.triage.note')}</p>
    </div>
  );
}
