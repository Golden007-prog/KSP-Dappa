// FIR record-completeness meter.
//
// A case file is only as good as what was actually filled in. This scores the
// detail payload against the ER sections a usable FIR needs, so a reviewer sees
// at a glance that (say) the chargesheet and arrest blocks are empty on a case
// that has been open 240 days. Presence only — never the contents of a party
// record, and never caste/religion, which the API does not return at all.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';

const has = (v) => {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
};

// [key, i18n label key, weight] — weight marks the blocks a case cannot be
// worked without, so a missing section costs more than a missing court entry.
const ITEMS = [
  ['briefFacts', 'cases.complete.briefFacts', 2],
  ['sections', 'cases.complete.sections', 2],
  ['complainants', 'cases.complete.complainants', 2],
  ['victims', 'cases.complete.victims', 1],
  ['accused', 'cases.complete.accused', 1],
  ['arrests', 'cases.complete.arrests', 1],
  ['chargesheet', 'cases.complete.chargesheet', 1],
  ['io', 'cases.complete.io', 2],
  ['court', 'cases.complete.court', 1],
  ['coords', 'cases.complete.coords', 2],
  ['incidentFrom', 'cases.complete.incidentWindow', 1],
  ['infoReceivedDate', 'cases.complete.infoReceived', 1],
];

export default function CaseCompleteness({ caseData }) {
  const t = useT();
  const d = caseData || {};

  const model = useMemo(() => {
    const coords = Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude))
      && (Number(d.latitude) !== 0 || Number(d.longitude) !== 0);
    const source = { ...d, coords: coords ? 1 : '' };
    const rows = ITEMS.map(([key, labelKey, weight]) => ({
      key, labelKey, weight, ok: has(source[key]),
    }));
    const max = rows.reduce((n, r) => n + r.weight, 0);
    const got = rows.reduce((n, r) => n + (r.ok ? r.weight : 0), 0);
    return { rows, pct: max ? Math.round((got / max) * 100) : 0, missing: rows.filter((r) => !r.ok) };
  }, [d]);

  const tone = model.pct >= 80 ? 'text-teal' : model.pct >= 55 ? 'text-amber' : 'text-signal';
  const barTone = model.pct >= 80 ? 'bg-teal' : model.pct >= 55 ? 'bg-amber' : 'bg-signal';

  return (
    <Card
      title={t('cases.complete.title')}
      subtitle={t('cases.complete.subtitle')}
      actions={(
        <Tooltip label={t('cases.complete.tip')}>
          <span className={`num text-lg font-semibold cursor-help ${tone}`}>{model.pct}%</span>
        </Tooltip>
      )}
    >
      <div className="h-2 rounded-full bg-grid/60 overflow-hidden" role="progressbar" aria-valuenow={model.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('cases.complete.title')}>
        <div className={`h-full rounded-full ${barTone} transition-all`} style={{ width: `${Math.max(2, model.pct)}%` }} />
      </div>
      <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-1.5">
        {model.rows.map((r) => (
          <li key={r.key} className={`flex items-center gap-1.5 text-[11px] ${r.ok ? 'text-muted' : 'text-signal'}`}>
            <span aria-hidden="true" className="shrink-0">
              {r.ok ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 13 4.5 4.5L19 7" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              )}
            </span>
            <span className="truncate">{t(r.labelKey)}</span>
          </li>
        ))}
      </ul>
      {model.missing.length > 0 && (
        <p className="text-[11px] text-muted mt-2">
          {t('cases.complete.missingCount', { n: model.missing.length })}
        </p>
      )}
    </Card>
  );
}
