// Print-only page header — invisible on screen (`hidden print:block`), appears
// at the top of every routed view when the user hits Ctrl+P, so any screen is
// brief-able: DAPPA crest, view name, active filter summary, IST timestamp and
// the synthetic-data notice. Mounted once in Layout above the route Outlet.
// Print pages are forced white (see @media print in index.css), so colors here
// are fixed grays rather than theme tokens.
import { useLookups } from '../lib/api.js';
import { useUrlFilters, describeFilters } from '../lib/filters.js';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../lib/i18n.jsx';

function Crest({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <path d="M32 3 57 12.4v17.1c0 15.1-10.6 28.1-25 31.5C17.6 57.6 7 44.6 7 29.5V12.4Z" fill="#0B1220" />
      <path d="M32 7.4 53 15.3v14.2c0 12.9-8.9 23.9-21 26.9-12.1-3-21-14-21-26.9V15.3Z" fill="#5B9DFF" />
      <path d="M32 13 47.5 18.8v10.7c0 9.6-6.6 17.9-15.5 20.2-8.9-2.3-15.5-10.6-15.5-20.2V18.8Z" fill="#0B1220" />
      <path d="M32 21.5 40.5 24.7v6.1c0 5.4-3.5 10.2-8.5 11.7-5-1.5-8.5-6.3-8.5-11.7v-6.1Z" fill="#F5A623" />
    </svg>
  );
}

export default function PrintHeader({ viewName = 'View' }) {
  const lookups = useLookups();
  const { t, tName, lang } = useI18n();
  const { districtId, crimeHeadId, range } = useUrlFilters();
  const [searchParams] = useSearchParams();
  const rawFrom = searchParams.get('from') || '';
  const rawTo = searchParams.get('to') || '';
  const summary = describeFilters(
    { districtId, crimeHeadId, range, from: rawFrom, to: rawTo },
    lookups.data,
    { t, tName },
  );
  const stamp = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : lang === 'kn' ? 'kn-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date());

  return (
    <div className="hidden print:block mb-5 pb-3 border-b-2 border-[#0B1220]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Crest />
          <div className="leading-tight min-w-0">
            <p className="text-base font-bold tracking-[0.06em] text-[#0B1220]">KSP DAPPA — {viewName}</p>
            <p className="text-[11px] text-[#4B5563]">{t('common.app.org')} · {t('shell.print.fullName')}</p>
          </div>
        </div>
        <div className="text-right text-[11px] text-[#4B5563] shrink-0 leading-snug">
          <p>{t('shell.print.generated', { stamp })}</p>
          <p className="font-semibold text-[#92400E]">{t('shell.print.synthetic')}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[#374151]">
        <span className="font-semibold uppercase tracking-wide text-[10px]">{t('shell.print.filters')}</span> {summary}
      </p>
    </div>
  );
}
