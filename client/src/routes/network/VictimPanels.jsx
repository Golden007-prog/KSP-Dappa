// Victim entity panels for the Network Explorer.
//
// The Victim table carries 53,836 rows joined to FIRs by CaseMasterID. These
// panels turn the sampled slice of that table into the third leg of the
// challenge's triangle — suspects, VICTIMS and recurring locations — with
// repeat-victimisation review candidates, suspect↔victim contact rows and
// age/gender demographics per crime head.
//
// Demographics use AGE and GENDER only. Caste and religion columns exist in the
// FIR schema and are never requested by the API layer, never joined here, and
// never rendered — organiser rule, enforced by omission at every hop.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt, fmtPct, dateLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { AGE_BANDS } from './entityData.js';
import { repeatVictims, victimDemographics, suspectVictimRows, multiVictimCases } from './entityGraph.js';
import { downloadCsv } from './download.js';

const GENDERS = ['female', 'male', 'unknown'];
const GENDER_TONE = { female: 'text-teal', male: 'text-amber', unknown: 'text-muted' };

// Heat ramp as Tailwind opacity buckets rather than a literal rgba: the amber
// token differs between the dark and light themes, so a hard-coded colour would
// print the dark-mode hue onto a light background.
const heat = (v) => {
  if (!(v > 0)) return '';
  if (v > 0.66) return 'bg-amber/60';
  if (v > 0.33) return 'bg-amber/35';
  return 'bg-amber/15';
};

// ── repeat victimisation ─────────────────────────────────────────────────────

export function RepeatVictimPanel({ index, nodesById, onPickPerson, onPickVictim }) {
  const t = useT();
  const [onlyPlausible, setOnlyPlausible] = useState(false);
  const rows = useMemo(() => repeatVictims(index, { limit: 40 }), [index]);
  const shown = onlyPlausible ? rows.filter((r) => r.ageOk) : rows;
  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);

  const exportCsv = () => {
    downloadCsv(`dappa-repeat-victims-${new Date().toISOString().slice(0, 10)}.csv`, [
      { key: 'name', label: t('network.victim.csv.name') },
      { key: 'cases', label: t('network.victim.csv.firs') },
      { label: t('network.victim.csv.ages'), map: (r) => r.ages.join('; ') },
      { label: t('network.victim.csv.units'), map: (r) => r.units.join('; ') },
      { label: t('network.victim.csv.heads'), map: (r) => r.heads.join('; ') },
      { label: t('network.victim.csv.suspects'), map: (r) => r.suspects.map(nameOf).join('; ') },
      { key: 'first', label: t('network.victim.csv.first') },
      { key: 'last', label: t('network.victim.csv.last') },
      { label: t('network.victim.csv.plausible'), map: (r) => (r.ageOk ? 'yes' : 'review') },
    ], shown);
  };

  return (
    <Card
      title={t('network.victim.repeat.title')}
      subtitle={t('network.victim.repeat.subtitle')}
      padded={false}
      actions={(
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none min-h-[36px]">
            <input type="checkbox" className="accent-amber h-4 w-4" checked={onlyPlausible} onChange={(e) => setOnlyPlausible(e.target.checked)} />
            {t('network.victim.repeat.plausibleOnly')}
          </label>
          {shown.length > 0 && (
            <button type="button" className="btn-ghost !py-1 !px-2 text-[11px] min-h-[36px]" onClick={exportCsv}>
              {t('network.victim.repeat.csv')}
            </button>
          )}
        </div>
      )}
    >
      {shown.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.victim.repeat.emptyTitle')} message={t('network.victim.repeat.emptyMsg')} />
        </div>
      ) : (
        <>
          <ol className="divide-y divide-grid/50 max-h-[22rem] overflow-y-auto">
            {shown.map((r) => (
              <li key={r.profileKey} className="px-4 py-2.5">
                <div className="flex items-start gap-2 min-w-0">
                  <button
                    type="button"
                    className="text-xs text-ink truncate min-w-0 text-left hover:text-amber underline-offset-2 hover:underline"
                    onClick={() => onPickVictim?.(r.victimIds[0])}
                    title={t('network.victim.repeat.openHint')}
                  >
                    {r.name}
                  </button>
                  <Badge tone={r.cases > 2 ? 'red' : 'amber'}>
                    {t('network.victim.repeat.firs', { n: fmtInt(r.cases) })}
                  </Badge>
                  {!r.ageOk && (
                    <Tooltip label={t('network.victim.repeat.ageDriftHint')}>
                      <Badge tone="slate">{t('network.victim.repeat.ageDrift')}</Badge>
                    </Tooltip>
                  )}
                </div>
                <p className="text-[10px] text-muted mt-0.5">
                  {t('network.victim.repeat.line', {
                    ages: r.ages.join(', '),
                    units: r.units.length,
                    heads: r.heads.slice(0, 2).join(', ') || '—',
                  })}
                </p>
                <p className="text-[10px] text-muted">
                  {r.first && r.last && r.first !== r.last
                    ? t('network.victim.repeat.span', { from: dateLabel(r.first), to: dateLabel(r.last) })
                    : dateLabel(r.first)}
                </p>
                {r.suspects.length > 0 && (
                  <p className="text-[10px] mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5">
                    <span className="text-muted">{t('network.victim.repeat.linkedTo')}</span>
                    {r.suspects.slice(0, 4).map((pk) => (
                      <button
                        key={pk}
                        type="button"
                        className="text-amber hover:underline underline-offset-2"
                        onClick={() => onPickPerson?.(pk)}
                      >
                        {nameOf(pk)}
                      </button>
                    ))}
                    {r.suspects.length > 4 && <span className="text-muted">+{fmtInt(r.suspects.length - 4)}</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t('network.victim.repeat.footnote')}
          </p>
        </>
      )}
    </Card>
  );
}

// ── demographics ─────────────────────────────────────────────────────────────

export function VictimDemographicsPanel({ index, headLabel = (n) => n }) {
  const t = useT();
  const [view, setView] = useState('age');
  const demo = useMemo(() => victimDemographics(index), [index]);
  const heads = demo.heads.slice(0, 10);

  if (!heads.length) {
    return (
      <Card title={t('network.victim.demo.title')} subtitle={t('network.victim.demo.subtitle')}>
        <EmptyState compact title={t('network.victim.demo.emptyTitle')} message={t('network.victim.demo.emptyMsg')} />
      </Card>
    );
  }

  const totalVictims = heads.reduce((a, h) => a + h.total, 0);
  const columns = view === 'age' ? AGE_BANDS.map((b) => b.key) : GENDERS;
  const colLabel = (k) => (view === 'age' ? t(`network.victim.band.${k}`) : t(`network.victim.gender.${k}`));
  const cellOf = (h, k) => (view === 'age' ? h.bands[k] || 0 : h.genders[k] || 0);
  const minorTotal = heads.reduce((a, h) => a + h.minors, 0);
  const policeTotal = heads.reduce((a, h) => a + h.police, 0);

  return (
    <Card
      title={t('network.victim.demo.title')}
      subtitle={t('network.victim.demo.subtitle')}
      padded={false}
      actions={(
        <SegmentedControl
          ariaLabel={t('network.victim.demo.viewAria')}
          value={view}
          onChange={setView}
          options={[
            { value: 'age', label: t('network.victim.demo.age') },
            { value: 'gender', label: t('network.victim.demo.gender') },
          ]}
        />
      )}
    >
      <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-grid/60">
        <Badge tone="teal">{t('network.victim.demo.total', { n: fmtInt(totalVictims) })}</Badge>
        {minorTotal > 0 && (
          <Tooltip label={t('network.victim.demo.minorsHint')}>
            <Badge tone="red">{t('network.victim.demo.minors', { n: fmtInt(minorTotal) })}</Badge>
          </Tooltip>
        )}
        {policeTotal > 0 && (
          <Tooltip label={t('network.victim.demo.policeHint')}>
            <Badge tone="amber">{t('network.victim.demo.police', { n: fmtInt(policeTotal) })}</Badge>
          </Tooltip>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] min-w-[30rem]">
          <caption className="sr-only">{t('network.victim.demo.tableCaption')}</caption>
          <thead>
            <tr className="text-muted text-[10px] uppercase tracking-wide">
              <th scope="col" className="text-left font-normal px-4 py-1.5">{t('network.victim.demo.head')}</th>
              {columns.map((k) => (
                <th key={k} scope="col" className="text-right font-normal px-2 py-1.5 whitespace-nowrap">{colLabel(k)}</th>
              ))}
              <th scope="col" className="text-right font-normal px-4 py-1.5">{t('network.victim.demo.median')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-grid/40">
            {heads.map((h) => {
              const max = Math.max(1, ...columns.map((k) => cellOf(h, k)));
              return (
                <tr key={h.headName || '—'}>
                  <th scope="row" className="text-left font-normal text-ink px-4 py-1.5 truncate max-w-[10rem]">
                    {headLabel(h.headName) || t('network.victim.demo.unknownHead')}
                  </th>
                  {columns.map((k) => {
                    const v = cellOf(h, k);
                    return (
                      <td
                        key={k}
                        className={`num text-right px-2 py-1.5 ${v ? 'text-ink' : 'text-muted/50'} ${view === 'gender' ? GENDER_TONE[k] : ''} ${heat(v / max)}`}
                        title={`${h.headName} · ${colLabel(k)}: ${fmtInt(v)}`}
                      >
                        {v ? fmtInt(v) : '·'}
                      </td>
                    );
                  })}
                  <td className="num text-right px-4 py-1.5 text-muted">{h.medianAge === null ? '—' : h.medianAge}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
        {t('network.victim.demo.footnote')}
      </p>
    </Card>
  );
}

// ── suspect ↔ victim contact rows ────────────────────────────────────────────

export function SuspectVictimPanel({ index, nodesById, onPickPerson, onPickVictim }) {
  const t = useT();
  const [repeatOnly, setRepeatOnly] = useState(false);
  const all = useMemo(() => suspectVictimRows(index, { limit: 120 }), [index]);
  const rows = (repeatOnly ? all.filter((r) => r.weight > 1) : all).slice(0, 40);
  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);

  const exportCsv = () => {
    downloadCsv(`dappa-suspect-victim-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label: t('network.victim.csv.suspect'), map: (r) => nameOf(r.personKey) },
      { key: 'personKey', label: t('network.victim.csv.personKey') },
      { key: 'victimName', label: t('network.victim.csv.victim') },
      { key: 'victimAge', label: t('network.victim.csv.age') },
      { label: t('network.victim.csv.gender'), map: (r) => t(`network.victim.gender.${r.victimGender}`) },
      { key: 'headName', label: t('network.victim.csv.head') },
      { key: 'unitName', label: t('network.victim.csv.unit') },
      { key: 'weight', label: t('network.victim.csv.firs') },
      { label: t('network.victim.csv.caseIds'), map: (r) => r.caseIds.join('; ') },
    ], rows);
  };

  return (
    <Card
      title={t('network.victim.pairs.title')}
      subtitle={t('network.victim.pairs.subtitle')}
      padded={false}
      actions={(
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none min-h-[36px]">
            <input type="checkbox" className="accent-amber h-4 w-4" checked={repeatOnly} onChange={(e) => setRepeatOnly(e.target.checked)} />
            {t('network.victim.pairs.repeatOnly')}
          </label>
          {rows.length > 0 && (
            <button type="button" className="btn-ghost !py-1 !px-2 text-[11px] min-h-[36px]" onClick={exportCsv}>
              {t('network.victim.pairs.csv')}
            </button>
          )}
        </div>
      )}
    >
      {rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.victim.pairs.emptyTitle')} message={t('network.victim.pairs.emptyMsg')} />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-grid/50 max-h-[22rem] overflow-y-auto">
            {rows.map((r) => (
              <li key={`${r.personKey}|${r.victimId}`} className="px-4 py-2 min-h-[48px]">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <button type="button" className="text-xs text-ink hover:text-amber underline-offset-2 hover:underline truncate max-w-[9rem]" onClick={() => onPickPerson?.(r.personKey)}>
                    {nameOf(r.personKey)}
                  </button>
                  <span className="text-muted text-[11px]">→</span>
                  <button type="button" className="text-xs text-teal hover:underline underline-offset-2 truncate max-w-[9rem]" onClick={() => onPickVictim?.(r.victimId)}>
                    {r.victimName}
                  </button>
                  {r.weight > 1 && <Badge tone="red">{t('network.victim.pairs.repeat', { n: fmtInt(r.weight) })}</Badge>}
                </div>
                <p className="text-[10px] text-muted mt-0.5 truncate">
                  {t('network.victim.pairs.line', {
                    age: r.victimAge === null ? '—' : r.victimAge,
                    gender: t(`network.victim.gender.${r.victimGender}`),
                    head: r.headName || '—',
                    unit: r.unitName || '—',
                  })}
                </p>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t('network.victim.pairs.footnote')}
          </p>
        </>
      )}
    </Card>
  );
}

// ── multi-victim FIRs ────────────────────────────────────────────────────────

export function MultiVictimPanel({ index, nodesById, onPickPerson }) {
  const t = useT();
  const rows = useMemo(() => multiVictimCases(index, { limit: 20 }), [index]);
  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);

  return (
    <Card title={t('network.victim.multi.title')} subtitle={t('network.victim.multi.subtitle')} padded={false}>
      {rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.victim.multi.emptyTitle')} message={t('network.victim.multi.emptyMsg')} />
        </div>
      ) : (
        <ul className="divide-y divide-grid/50 max-h-[20rem] overflow-y-auto">
          {rows.map((c) => (
            <li key={c.caseId} className="px-4 py-2 min-h-[48px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-ink truncate min-w-0">{c.crimeNo || c.caseId}</span>
                <Badge tone="teal">{t('network.victim.multi.victims', { n: fmtInt(c.victimCount) })}</Badge>
                <span className="num text-[10px] text-muted ml-auto shrink-0">{dateLabel(c.registeredDate)}</span>
              </div>
              <p className="text-[10px] text-muted mt-0.5 truncate">
                {[c.subHeadName || c.headName, c.unitName, c.districtName].filter(Boolean).join(' · ')}
              </p>
              {c.suspects.length > 0 && (
                <p className="text-[10px] mt-0.5 flex flex-wrap gap-x-1.5">
                  {c.suspects.slice(0, 3).map((pk) => (
                    <button key={pk} type="button" className="text-amber hover:underline underline-offset-2" onClick={() => onPickPerson?.(pk)}>
                      {nameOf(pk)}
                    </button>
                  ))}
                  {c.suspects.length > 3 && <span className="text-muted">+{fmtInt(c.suspects.length - 3)}</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── victim age profile strip ─────────────────────────────────────────────────

export function VictimAgeProfile({ index }) {
  const t = useT();
  const stats = useMemo(() => {
    const bands = new Map();
    const genders = new Map();
    let total = 0;
    let ageSum = 0;
    let aged = 0;
    for (const v of index.victims.values()) {
      total += 1;
      if (v.ageBand) bands.set(v.ageBand, (bands.get(v.ageBand) || 0) + 1);
      genders.set(v.gender, (genders.get(v.gender) || 0) + 1);
      if (v.age !== null) { ageSum += v.age; aged += 1; }
    }
    return { bands, genders, total, mean: aged ? ageSum / aged : null };
  }, [index]);

  if (!stats.total) return null;
  const max = Math.max(1, ...AGE_BANDS.map((b) => stats.bands.get(b.key) || 0));

  return (
    <Card title={t('network.victim.profile.title')} subtitle={t('network.victim.profile.subtitle')}>
      <div className="space-y-3">
        <div className="flex items-end gap-1.5" role="img" aria-label={t('network.victim.profile.aria', {
          list: AGE_BANDS.map((b) => `${t(`network.victim.band.${b.key}`)}: ${fmtInt(stats.bands.get(b.key) || 0)}`).join(', '),
        })}
        >
          {AGE_BANDS.map((b) => {
            const v = stats.bands.get(b.key) || 0;
            return (
              <div key={b.key} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <span className="num text-[10px] text-muted" aria-hidden="true">{v ? fmtInt(v) : ''}</span>
                <div
                  className={`w-full rounded-sm ${b.key === 'minor' && v ? 'bg-signal/70' : v ? 'bg-teal/70' : 'bg-grid/50'}`}
                  style={{ height: `${4 + Math.round((v / max) * 40)}px` }}
                  title={`${t(`network.victim.band.${b.key}`)}: ${fmtInt(v)}`}
                />
                <span className="text-[9px] text-muted num truncate w-full text-center" aria-hidden="true">{t(`network.victim.band.${b.key}`)}</span>
              </div>
            );
          })}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] border-t border-grid/60 pt-2.5">
          {GENDERS.map((g) => {
            const v = stats.genders.get(g) || 0;
            if (!v) return null;
            return (
              <li key={g} className={GENDER_TONE[g]}>
                {t(`network.victim.gender.${g}`)}
                {' '}
                <span className="num">{fmtInt(v)}</span>
                <span className="text-muted"> ({fmtPct((v / stats.total) * 100, { digits: 0 })})</span>
              </li>
            );
          })}
          {stats.mean !== null && (
            <li className="text-muted ml-auto">{t('network.victim.profile.mean', { n: Math.round(stats.mean) })}</li>
          )}
        </ul>
      </div>
    </Card>
  );
}
