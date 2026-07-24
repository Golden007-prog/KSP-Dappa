// Case lifecycle stepper — Incident → Info at PS → FIR → Arrest → Chargesheet
// → Court, derived from the /cases/:id payload. A step is "done" when its date
// (or record) exists; the last done step glows as the current stage. Day gaps
// between consecutive dated steps quantify registration/arrest lag — a small
// analytic judges asked for. Horizontally scrollable on phones.
import { differenceInCalendarDays, isValid, parse } from 'date-fns';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import { dateLabel } from '../../lib/format.js';

const toDate = (iso) => {
  if (!iso) return null;
  const d = parse(String(iso).slice(0, 10), 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : null;
};

function buildSteps(d) {
  const arrests = Array.isArray(d.arrests) ? d.arrests : [];
  const arrestDates = arrests.map((a) => toDate(a.date)).filter(Boolean).sort((a, b) => a - b);
  const csDate = toDate(d.chargesheet?.date);
  const steps = [
    {
      key: 'incident',
      label: 'Incident',
      date: toDate(d.incidentFrom),
      dateLabel: dateLabel(d.incidentFrom),
      detail: d.incidentTo && d.incidentTo !== d.incidentFrom ? `until ${dateLabel(d.incidentTo)}` : null,
      done: !!toDate(d.incidentFrom),
    },
    {
      key: 'info',
      label: 'Info at PS',
      date: toDate(d.infoReceivedDate),
      dateLabel: dateLabel(d.infoReceivedDate),
      detail: null,
      done: !!toDate(d.infoReceivedDate),
    },
    {
      key: 'fir',
      label: 'FIR registered',
      date: toDate(d.registeredDate),
      dateLabel: dateLabel(d.registeredDate),
      detail: null,
      done: !!toDate(d.registeredDate),
    },
    {
      key: 'arrest',
      label: 'Arrest',
      date: arrestDates[0] || null,
      dateLabel: arrestDates[0] ? dateLabel(arrests.map((a) => a.date).filter(Boolean).sort()[0]) : '—',
      detail: arrests.length ? `${arrests.length} record${arrests.length > 1 ? 's' : ''}` : null,
      done: arrests.length > 0,
    },
    {
      key: 'chargesheet',
      label: 'Chargesheet',
      date: csDate,
      dateLabel: d.chargesheet?.date ? dateLabel(d.chargesheet.date) : '—',
      detail: d.chargesheet?.type ? String(d.chargesheet.type) : null,
      done: !!d.chargesheet,
    },
    {
      key: 'court',
      label: 'Court',
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
  const d = caseData || {};
  const steps = buildSteps(d);
  const lastDone = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);

  return (
    <Card
      title="Case lifecycle"
      subtitle="Incident to court — derived from the FIR joins"
      actions={d.statusName ? <Badge tone="amber">{d.statusName}</Badge> : null}
    >
      <ol className="case-timeline flex items-stretch overflow-x-auto no-scrollbar -mx-1 px-1" aria-label="Case lifecycle">
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
