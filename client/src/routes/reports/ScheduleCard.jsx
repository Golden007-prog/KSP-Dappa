// /reports — scheduled-delivery card (visual only, clearly badged: the real
// cron + mailer will live in /admin later). Frequency (weekly/monthly), day,
// time, validated recipient chips, an enable toggle, a computed next-run
// preview, and a "send test digest now" that reuses the flag-gated Catalyst
// Mail mutation owned by the Reports page. Everything persists to localStorage.
import { useState } from 'react';
import { format } from 'date-fns';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { dateLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import {
  loadSchedule, saveSchedule, nextRun, describeSchedule, weekdayNames, isEmail,
} from './schedule.js';

export default function ScheduleCard({ onTest, testing = false }) {
  const t = useT();
  const [schedule, setSchedule] = useState(loadSchedule);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');

  const freqOptions = [
    { value: 'weekly', label: t('alerts.sched.weekly') },
    { value: 'monthly', label: t('alerts.sched.monthly') },
  ];

  const patch = (p) => {
    setSchedule((prev) => {
      const next = { ...prev, ...p };
      saveSchedule(next);
      return next;
    });
  };

  const addRecipient = () => {
    const v = draft.trim();
    if (!v) return;
    if (!isEmail(v)) { setDraftError(t('alerts.sched.notEmail')); return; }
    if (schedule.recipients.includes(v)) { setDraftError(t('alerts.sched.duplicate')); return; }
    if (schedule.recipients.length >= 12) { setDraftError(t('alerts.sched.capped')); return; }
    patch({ recipients: [...schedule.recipients, v] });
    setDraft('');
    setDraftError('');
  };

  const removeRecipient = (v) => patch({ recipients: schedule.recipients.filter((r) => r !== v) });

  const next = nextRun(schedule);

  return (
    <Card
      title={t('alerts.sched.title')}
      subtitle={t('alerts.sched.subtitle')}
      actions={<Badge tone="slate">{t('alerts.sched.badge')}</Badge>}
    >
      <div className="space-y-3">
        <button
          type="button"
          aria-pressed={schedule.enabled}
          onClick={() => patch({ enabled: !schedule.enabled })}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-grid px-3 py-2.5 min-h-[48px] text-left transition-colors hover:border-primary/50"
        >
          <span className="min-w-0">
            <span className="block text-sm text-ink">{t('alerts.sched.enable')}</span>
            <span className="block text-[11px] text-muted mt-0.5">
              {schedule.enabled ? describeSchedule(schedule, t) : t('alerts.sched.off')}
            </span>
          </span>
          <span
            aria-hidden="true"
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${schedule.enabled ? 'bg-primary' : 'bg-grid'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-panel shadow-card transition-all ${schedule.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            options={freqOptions}
            value={schedule.freq}
            onChange={(v) => patch({ freq: v })}
            ariaLabel={t('alerts.sched.freqAria')}
          />
          {schedule.freq === 'weekly' ? (
            <label className="flex items-center gap-2 text-xs text-muted">
              {t('alerts.sched.day')}
              <select
                className="input-dark !py-1.5 pr-7"
                value={schedule.weekday}
                onChange={(e) => patch({ weekday: Number(e.target.value) })}
                aria-label={t('alerts.sched.dayAria')}
              >
                {weekdayNames(t).map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-xs text-muted">
              {t('alerts.sched.dayOfMonth')}
              <select
                className="input-dark !py-1.5 pr-7"
                value={schedule.monthday}
                onChange={(e) => patch({ monthday: Number(e.target.value) })}
                aria-label={t('alerts.sched.dayOfMonthAria')}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-muted">
            {t('alerts.sched.time')}
            <input
              type="time"
              className="input-dark !py-1.5"
              value={schedule.time}
              onChange={(e) => patch({ time: e.target.value || '08:00' })}
              aria-label={t('alerts.sched.timeAria')}
            />
          </label>
        </div>

        <div>
          <p className="text-xs text-muted mb-1.5">{t('alerts.sched.recipients')}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {schedule.recipients.map((r) => (
              <span key={r} className="inline-flex items-center rounded-full border border-grid bg-panel text-xs text-ink">
                <span className="pl-2.5 pr-1 py-1">{r}</span>
                <button
                  type="button"
                  aria-label={t('alerts.sched.removeAria', { email: r })}
                  onClick={() => removeRecipient(r)}
                  className="px-1.5 py-1 min-h-[40px] sm:min-h-[26px] text-muted transition-colors hover:text-signal"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </span>
            ))}
            <form
              className="inline-flex items-center gap-1.5"
              onSubmit={(e) => { e.preventDefault(); addRecipient(); }}
            >
              <input
                type="email"
                className="input-dark !py-1.5 !px-2.5 !text-xs w-52 min-h-[40px] sm:min-h-[30px]"
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setDraftError(''); }}
                placeholder="officer@ksp.gov.in"
                aria-label={t('alerts.sched.addAria')}
              />
              <button type="submit" className="btn !px-2.5 !text-xs min-h-[40px] sm:min-h-[30px]" disabled={!draft.trim()}>
                {t('alerts.sched.add')}
              </button>
            </form>
          </div>
          {draftError && <p className="mt-1 text-[11px] text-signal" role="alert">{draftError}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-grid/60 pt-3">
          <p className="text-xs text-muted">
            {schedule.enabled && next
              ? <>{t('alerts.sched.nextRun')} <span className="num text-ink">{dateLabel(format(next, 'yyyy-MM-dd'))} {format(next, 'HH:mm')}</span></>
              : t('alerts.sched.enableToSee')}
          </p>
          <div className="ml-auto">
            <Tooltip label={t('alerts.sched.sendTestTip')}>
              <button
                type="button"
                className="btn !text-xs min-h-[44px] sm:min-h-[30px]"
                disabled={testing}
                onClick={onTest}
              >
                {testing ? t('alerts.sched.sending') : t('alerts.sched.sendTest')}
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </Card>
  );
}
