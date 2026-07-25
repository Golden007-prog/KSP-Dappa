// Case lifecycle stepper — Incident → Info at PS → FIR → Arrest → Chargesheet
// → Court, derived from the /cases/:id payload. A step is "done" when its date
// (or record) exists; the last done step glows as the current stage. Day gaps
// between consecutive dated steps quantify registration/arrest lag — a small
// analytic judges asked for. Horizontally scrollable on phones.
import { differenceInCalendarDays } from 'date-fns';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import { dateLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import {
  toDate, pickDate, pickValue, firstArrest,
  CS_DATE_KEYS, CS_TYPE_KEYS,
} from './caseDates.js';

function buildSteps(d, t) {
  const arrests = Array.isArray(d.arrests) ? d.arrests : [];
  // Key names vary per payload shape (arrestDate/dateOfArrest/…,
  // chargesheetDate/csDate/…) — resolved via the shared tolerant pickers.
  const arrest = firstArrest(arrests);
  const cs = pickDate(d.chargesheet, CS_DATE_KEYS);
  const csType = pickValue(d.chargesheet, CS_TYPE_KEYS);
  const hasChargesheet = !!cs
    || (d.chargesheet && typeof d.chargesheet === 'object' && Object.keys(d.chargesheet).length > 0);
  const steps = [
    {
      key: 'incident',
      label: t('cases.timeline.incident'),
      date: toDate(d.incidentFrom),
      dateLabel: dateLabel(d.incidentFrom),
      detail: d.incidentTo && d.incidentTo !== d.incidentFrom ? t('cases.timeline.until', { date: dateLabel(d.incidentTo) }) : null,
      done: !!toDate(d.incidentFrom),
    },
    {
      key: 'info',
      label: t('cases.timeline.info'),
      date: toDate(d.infoReceivedDate),
      dateLabel: dateLabel(d.infoReceivedDate),
      detail: null,
      done: !!toDate(d.infoReceivedDate),
    },
    {
      key: 'fir',
      label: t('cases.timeline.fir'),
      date: toDate(d.registeredDate),
      dateLabel: dateLabel(d.registeredDate),
      detail: null,
      done: !!toDate(d.registeredDate),
    },
    {
      key: 'arrest',
      label: t('cases.timeline.arrest'),
      date: arrest?.date || null,
      dateLabel: arrest ? dateLabel(arrest.raw) : '—',
      detail: arrests.length
        ? t(arrests.length > 1 ? 'cases.timeline.records' : 'cases.timeline.recordOne', { n: arrests.length })
        : null,
      done: arrests.length > 0,
    },
    {
      key: 'chargesheet',
      label: t('cases.timeline.chargesheet'),
      date: cs?.date || null,
      dateLabel: cs ? dateLabel(cs.raw) : '—',
      detail: csType !== undefined ? String(csType) : null,
      done: hasChargesheet,
    },
    {
      key: 'court',
      label: t('cases.timeline.court'),
      date: null,
      dateLabel: d.court?.courtName ? '' : '—',
      detail: d.court?.courtName ? String(d.court.courtName) : null,
      done: !!d.court,
    },
  ];
  // +Nd lag vs the previous DATED step (skips undated ones).
  let prevDate = null;
  for (const s of steps) {
    if (s.date && prevDate) {
      const gap = differenceInCalendarDays(s.date, prevDate);
      if (Number.isFinite(gap) && gap >= 0) s.gapDays = gap;
    }
    if (s.date) prevDate = s.date;
  }
  return steps;
}

export default function CaseTimeline({ caseData }) {
  const t = useT();
  const trName = useCaseNames();
  const d = caseData || {};
  const steps = buildSteps(d, t);
  const lastDone = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);

  // Completion % + time sitting in the current stage (days since the last
  // dated done step) — quick pendency reads for reviewers and supervisors.
  const doneCount = steps.filter((s) => s.done).length;
  const progressPct = Math.round((doneCount / steps.length) * 100);
  const lastDated = [...steps].reverse().find((s) => s.done && s.date) || null;
  const stageDays = lastDone >= 0 && lastDone < steps.length - 1 && lastDated
    ? differenceInCalendarDays(new Date(), lastDated.date)
    : null;

  return (
    <Card
      title={t('cases.timeline.title')}
      subtitle={t('cases.timeline.subtitle')}
      actions={
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span
            className="num inline-flex items-center gap-1.5 text-[11px] text-muted"
            title={t('cases.timeline.progressTip', { done: doneCount, total: steps.length })}
          >
            <span className="inline-block h-1.5 w-14 rounded-full bg-grid overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-amber" style={{ width: `${progressPct}%` }} />
            </span>
            {progressPct}%
          </span>
          {Number.isFinite(stageDays) && stageDays > 0 && (
            <Badge tone={stageDays > 60 ? 'amber' : 'slate'}>{t('cases.timeline.inStage', { n: stageDays })}</Badge>
          )}
          {d.statusName ? <Badge tone="amber">{trName('statuses', d.statusName)}</Badge> : null}
        </span>
      }
    >
      <ol className="case-timeline flex items-stretch overflow-x-auto no-scrollbar -mx-1 px-1" aria-label={t('cases.timeline.aria')}>
        {steps.map((s, i) => {
          const current = i === lastDone;
          return (
            <li key={s.key} className="relative flex-1 min-w-[6.8rem] px-1" aria-current={current ? 'step' : undefined}>
              {/* connector */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[-50%] right-[50%] top-[9px] h-0.5 ${steps[i - 1].done && s.done ? 'bg-amber/70' : 'bg-grid'}`}
                />
              )}
              <span
                aria-hidden="true"
                className={`relative z-10 mx-auto mb-2 flex h-[19px] w-[19px] items-center justify-center rounded-full border-2 ${
                  current
                    ? 'border-amber bg-amber/20 animate-pulse-glow'
                    : s.done
                      ? 'border-amber bg-amber'
                      : 'border-grid bg-panel'
                }`}
              >
                {s.done && !current && (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--t-primary-on))" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m4.5 12.5 5 5 10-11" />
                  </svg>
                )}
                {current && <span className="h-1.5 w-1.5 rounded-full bg-amber" />}
              </span>
              <div className="text-center">
                <p className={`text-[11px] font-medium leading-tight ${s.done ? 'text-ink' : 'text-muted'}`}>{s.label}</p>
                <p className="num text-[10px] text-muted mt-0.5">{s.dateLabel}</p>
                {s.detail && <p className="text-[10px] text-muted/80 truncate mt-0.5" title={s.detail}>{s.detail}</p>}
                {Number.isFinite(s.gapDays) && s.gapDays > 0 && (
                  <p className="num text-[10px] text-amber mt-0.5">+{s.gapDays}d</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
