// /alerts — the action loop on one alert: acknowledge · assign to unit ·
// escalate to the next tier · dismiss with a reason · add note · record
// outcome. Every choice becomes an ActionLog row (POST /alerts/:key/actions)
// signed with the tier the switcher claims and a display name the officer
// types once, or the Catalyst identity when signed in — the server decides
// which and says so in the response.
//
// Mounted with one line on AlertCard (variant="card": collapsed behind one
// 44-px button so a long feed stays readable) and on AlertDetailSheet
// (variant="sheet": open, with the timeline underneath). Self-contained: its
// own queries, toasts and cache patches, so the host components stay as they
// were.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Badge from '../../components/Badge.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { useTier } from '../../lib/tier.js';
import ActionTimeline, { ACTION_STATUS } from './ActionTimeline.jsx';
import {
  ACTION_TYPES, OUTCOME_LABELS, DISMISS_REASONS, NEXT_TIER,
  useAlertActions, useRecordAction, useActorName, useAuthMe,
} from './actionsApi.js';

const NOTE_MAX = 500;

export default function ActionControls({ alert: a, variant = 'card', className = '' }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { tier, rank } = useTier();
  const [searchParams] = useSearchParams();
  const [actorName, setActorName] = useActorName();
  const me = useAuthMe();
  const record = useRecordAction();
  const alertKey = String(a?.alertId || '');
  const isSheet = variant === 'sheet';
  const [open, setOpen] = useState(isSheet);
  const [mode, setMode] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [assignTo, setAssignTo] = useState('');
  const [outcomeLabel, setOutcomeLabel] = useState('');
  const timeline = useAlertActions(alertKey, { enabled: !!alertKey && (open || isSheet) });

  useEffect(() => { setMode(''); setReason(''); setNote(''); setAssignTo(''); setOutcomeLabel(''); }, [alertKey]);

  const signedIn = !!(me.data && me.data.authenticated && me.data.source === 'catalyst-auth');
  const who = signedIn ? (me.data.user?.email || [me.data.user?.firstName, me.data.user?.lastName].filter(Boolean).join(' ') || me.data.user?.userId) : '';
  const role = signedIn ? (me.data.role || tier) : tier;
  const unit = searchParams.get('unitId') || a?.unitId || a?.districtId || '';
  const toTier = NEXT_TIER[tier] || 'district';
  // 44-px targets on the Beat / Station tiers regardless of viewport; compact on pointer screens above.
  const btn = rank <= 1 ? 'btn !text-xs min-h-[44px] justify-center' : 'btn !text-xs min-h-[44px] sm:min-h-[32px] justify-center';
  const summary = timeline.data?.summary;
  const chips = useMemo(() => {
    if (!summary || !summary.count) return [];
    const out = [];
    if (summary.acknowledged) out.push({ k: 'acknowledged', s: 'stable', text: t('actions.chip.acknowledged') });
    if (summary.assignedTo) out.push({ k: 'assigned', s: 'watch', text: t('actions.chip.assigned', { who: summary.assignedTo }) });
    if (summary.escalated) out.push({ k: 'escalated', s: 'rising', text: t('actions.chip.escalated') });
    if (summary.dismissed) out.push({ k: 'dismissed', s: 'nodata', text: t('actions.chip.dismissed') });
    if (summary.latestOutcome) out.push({ k: 'outcome', s: 'stable', text: t('actions.chip.outcome', { label: t(`actions.outcome.${summary.latestOutcome}`) }) });
    return out;
  }, [summary, t]);

  if (!alertKey) return null;

  const valid = mode === 'acknowledge' || mode === 'escalate'
    || (mode === 'dismiss' && reason && (reason !== 'other' || note.trim()))
    || (mode === 'assign' && assignTo.trim())
    || (mode === 'note' && note.trim())
    || (mode === 'outcome' && outcomeLabel);

  const submit = async () => {
    if (!valid || record.isPending) return;
    const body = {
      actionType: mode,
      actor: signedIn ? undefined : (actorName || undefined),
      actorRole: role,
      unit,
      severity: a.severity,
      clientTs: new Date().toISOString(),
    };
    if (mode === 'dismiss') body.reason = reason;
    if (mode === 'assign') body.assignTo = assignTo.trim();
    if (mode === 'escalate') body.toTier = toTier;
    if (mode === 'outcome') body.outcomeLabel = outcomeLabel;
    if (note.trim()) body.note = note.trim().slice(0, NOTE_MAX);
    try {
      const res = await record.mutateAsync({ alertKey, body });
      const d = res?.data || {};
      const what = t(`actions.done.${mode}`);
      if (d.duplicate) toast.info(t('actions.toast.duplicate'));
      else if (res?.meta?.storage === 'memory') toast.info(`${t('actions.toast.saved', { what })} ${t('actions.toast.savedMemory')}`);
      else toast.success(t('actions.toast.saved', { what }));
      if ((mode === 'acknowledge' || mode === 'dismiss') && d.statusUpdated === false && !d.duplicate) toast.info(t('actions.toast.statusDemo'));
      if (d.push && d.push.mode === 'sent') toast.success(t('actions.toast.pushed', { n: d.push.delivered }));
      setMode(''); setReason(''); setNote(''); setAssignTo(''); setOutcomeLabel('');
      if (!isSheet) setOpen(true);
    } catch (err) {
      toast.error(t('actions.toast.failed', { msg: err?.message || '' }));
    }
  };

  // The six buttons are 44 px on the officer tiers; the select / input /
  // textarea the officer must touch NEXT were 34-35 px. Same rank test.
  const FIELD = `input-dark w-full !py-2 !text-xs${rank <= 1 ? ' min-h-[44px]' : ''}`;

  return (
    <div className={`space-y-2 ${className}`} data-action-controls={variant} data-open={open || isSheet ? 'true' : 'false'}>
      {!isSheet && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className={`${btn} flex-1`}
            aria-expanded={open}
            aria-label={t('actions.controls.openAria', { id: alertKey })}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 20h16M4 4h16M9 4v16M15 8l2 2-2 2" />
            </svg>
            {open ? t('actions.controls.close') : t('actions.controls.open')}
          </button>
          {chips.map((c) => <StatusPill key={c.k} status={c.s} label={c.text} />)}
        </div>
      )}

      {open && (
        <div className="space-y-2 rounded-xl border border-grid/70 bg-canvas/40 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t('actions.controls.title')}</span>
            {isSheet && chips.map((c) => <StatusPill key={c.k} status={c.s} label={c.text} />)}
          </div>
          <p className="text-[11px] italic leading-snug text-muted">{t('actions.framing')}</p>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label={t('actions.controls.title')}>
            {ACTION_TYPES.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={mode === k}
                onClick={() => setMode(mode === k ? '' : k)}
                className={`${btn} ${mode === k ? '!border-primary/60 !text-primary' : ''}`}
              >
                <span aria-hidden="true" className="mr-1 text-[11px]">{ACTION_STATUS[k] === 'rising' ? '▲' : ACTION_STATUS[k] === 'watch' ? '●' : ACTION_STATUS[k] === 'nodata' ? '—' : '✓'}</span>
                {t(`actions.type.${k}`)}
              </button>
            ))}
          </div>

          {mode && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
              {mode === 'escalate' && (
                <p className="text-xs text-ink">
                  <Badge tone="amber">{t('actions.escalate.to', { tier: t(`actions.tier.${toTier}`) })}</Badge>
                  <span className="ml-2 text-muted">{t('actions.escalate.hint')}</span>
                </p>
              )}
              {mode === 'dismiss' && (
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">{t('actions.reason.label')}</span>
                  <select className={`${FIELD} pr-7`} value={reason} onChange={(e) => setReason(e.target.value)} required>
                    <option value="">—</option>
                    {DISMISS_REASONS.map((r) => <option key={r} value={r}>{t(`actions.reason.${r}`)}</option>)}
                  </select>
                </label>
              )}
              {mode === 'outcome' && (
                <fieldset className="space-y-1">
                  <legend className="mb-0.5 text-[11px] text-muted">{t('actions.outcome.label')}</legend>
                  {OUTCOME_LABELS.map((o) => (
                    <label key={o} className={`flex cursor-pointer items-center gap-2 text-xs text-ink ${rank <= 1 ? 'min-h-[44px]' : 'min-h-[36px]'}`}>
                      <input type="radio" name={`outcome-${alertKey}`} value={o} checked={outcomeLabel === o} onChange={() => setOutcomeLabel(o)} className="h-4 w-4 accent-current text-primary" />
                      {t(`actions.outcome.${o}`)}
                    </label>
                  ))}
                </fieldset>
              )}
              {mode === 'assign' && (
                <label className="block">
                  <span className="mb-0.5 block text-[11px] text-muted">{t('actions.assign.label')}</span>
                  <input className={FIELD} value={assignTo} maxLength={64} placeholder={t('actions.assign.placeholder')} onChange={(e) => setAssignTo(e.target.value)} required />
                </label>
              )}
              {(mode === 'note' || mode === 'dismiss' || mode === 'outcome' || mode === 'assign' || mode === 'escalate' || mode === 'acknowledge') && (
                <label className="block">
                  <span className="mb-0.5 flex items-center justify-between text-[11px] text-muted">
                    {t('actions.note.label')}
                    <span className="num">{note.length}/{NOTE_MAX}</span>
                  </span>
                  <textarea className={`${FIELD} leading-relaxed`} rows={2} maxLength={NOTE_MAX} value={note} placeholder={t('actions.note.placeholder')} onChange={(e) => setNote(e.target.value)} required={mode === 'note' || (mode === 'dismiss' && reason === 'other')} />
                </label>
              )}
              <div className="flex flex-wrap items-end gap-2">
                {signedIn ? (
                  <p className="flex-1 text-[11px] text-muted">{t('actions.actor.signedIn', { who })}</p>
                ) : (
                  <label className="min-w-[10rem] flex-1">
                    <span className="mb-0.5 block text-[11px] text-muted">{t('actions.actor.label')} · {t('actions.actor.role', { role: t(`actions.tier.${tier}`) })}</span>
                    <input className={FIELD} value={actorName} maxLength={128} placeholder={t('actions.actor.placeholder')} onChange={(e) => setActorName(e.target.value)} autoComplete="name" />
                  </label>
                )}
                <button type="submit" className={`btn-primary !text-xs min-h-[44px] sm:min-h-[36px]`} disabled={!valid || record.isPending}>
                  {record.isPending ? t('actions.saving') : t('actions.submit')}
                </button>
              </div>
            </form>
          )}

          {(isSheet || timeline.data?.timeline?.length > 0) && (
            <ActionTimeline query={timeline} lang={lang} compact={!isSheet} />
          )}
        </div>
      )}
    </div>
  );
}
