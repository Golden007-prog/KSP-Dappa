// CrimeNo serial continuity — a registration-integrity check that falls out of
// the numbering scheme itself.
//
// CrimeNo is [1 category][4 district][4 unit][4 year][5 serial] and the serial
// runs 1..n per station, category and year (docs/CONTRACTS.md). So within one
// (station, year, category) the scanned serials should be a dense run: a hole
// means an FIR that exists in the register but is missing from this result set.
//
// That inference is only sound when the scan could have seen every case of the
// group — a crime-head/gravity/date filter or a truncated scan removes rows by
// design, and the panel says so instead of reporting phantom gaps.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { readJson, writeJson } from './explorerState.js';
import { crimeNoParts } from './deepScan.js';

const STORAGE_KEY = 'dappa-cases-serialgaps';
const MIN_OBSERVED = 5;
const MAX_GROUPS = 8;
const MAX_MISSING_CHIPS = 14;

/** → [{unitName, year, categoryId, observed, span, missing, missingList, completeness}] */
export function serialContinuity(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    const p = crimeNoParts(r.crimeNo);
    if (!p) continue;
    const key = `${p.unitId}|${p.year}|${p.categoryId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, unitId: p.unitId, unitName: r.unitName || p.unitId, year: p.year,
        categoryId: p.categoryId, serials: new Set(),
      });
    }
    groups.get(key).serials.add(p.serial);
  }
  const out = [];
  for (const g of groups.values()) {
    const observed = g.serials.size;
    if (observed < MIN_OBSERVED) continue;
    const list = [...g.serials].sort((a, b) => a - b);
    const lo = list[0];
    const hi = list[list.length - 1];
    const span = hi - lo + 1;
    const missingList = [];
    for (let n = lo; n <= hi; n += 1) if (!g.serials.has(n)) missingList.push(n);
    out.push({
      key: g.key,
      unitName: g.unitName,
      year: g.year,
      categoryId: g.categoryId,
      observed,
      lo,
      hi,
      span,
      missing: missingList.length,
      missingList,
      completeness: span ? (observed / span) * 100 : 100,
    });
  }
  out.sort((a, b) => b.missing - a.missing || b.observed - a.observed);
  return out;
}

const CATEGORY_KEYS = { 1: 'cases.serial.catFir', 3: 'cases.serial.catUdr', 4: 'cases.serial.catPar', 8: 'cases.serial.catZero' };

export default function SerialGaps({ rows, reliable, truncated, scopeLabel }) {
  const t = useT();
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, false) === true);
  const groups = useMemo(() => serialContinuity(rows), [rows]);

  if (!groups.length) return null;

  const toggle = () => setOpen((o) => { writeJson(STORAGE_KEY, !o); return !o; });
  const withGaps = groups.filter((g) => g.missing > 0).length;

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate">
            {t('cases.serial.collapsed', { g: fmtInt(groups.length), n: fmtInt(withGaps) })}
          </p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded={false}>
            {t('cases.profile.show')}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={t('cases.serial.title')}
      subtitle={t('cases.serial.subtitle', { scope: scopeLabel })}
      actions={<button type="button" className="btn !py-1 !px-2 text-xs" onClick={toggle} aria-expanded>{t('cases.profile.hide')}</button>}
    >
      {!reliable || truncated ? (
        <p className="text-[11px] text-amber mb-2.5">
          {truncated ? t('cases.serial.warnTruncated') : t('cases.serial.warnFiltered')}
        </p>
      ) : (
        <p className="text-[11px] text-teal mb-2.5">{t('cases.serial.reliable')}</p>
      )}
      <div className="space-y-2">
        {groups.slice(0, MAX_GROUPS).map((g) => (
          <div key={g.key} className="rounded-lg border border-grid/70 px-2.5 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 text-xs text-ink truncate">
                {g.unitName}
                <span className="text-muted"> · {g.year} · {t(CATEGORY_KEYS[g.categoryId] || 'cases.serial.catOther')}</span>
              </span>
              <span className="inline-flex items-center gap-2 shrink-0">
                <span className="num text-[11px] text-muted">
                  {t('cases.serial.range', { lo: fmtInt(g.lo), hi: fmtInt(g.hi), n: fmtInt(g.observed) })}
                </span>
                <Badge tone={g.missing === 0 ? 'teal' : g.completeness < 80 ? 'red' : 'amber'}>
                  {g.missing === 0 ? t('cases.serial.dense') : t('cases.serial.gaps', { n: fmtInt(g.missing) })}
                </Badge>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-grid/60 overflow-hidden">
              <div
                className={`h-full rounded-full ${g.completeness < 80 ? 'bg-signal' : g.completeness < 100 ? 'bg-amber' : 'bg-teal'}`}
                style={{ width: `${Math.max(2, Math.min(100, g.completeness))}%` }}
              />
            </div>
            <p className="text-[10px] text-muted mt-1 num">
              {t('cases.serial.completeness', { pct: fmtPct(g.completeness) })}
              {g.missingList.length > 0 && (
                <>
                  {' · '}
                  {t('cases.serial.missing')}{' '}
                  {g.missingList.slice(0, MAX_MISSING_CHIPS).map((n) => String(n).padStart(5, '0')).join(', ')}
                  {g.missingList.length > MAX_MISSING_CHIPS ? ` +${g.missingList.length - MAX_MISSING_CHIPS}` : ''}
                </>
              )}
            </p>
          </div>
        ))}
      </div>
      {groups.length > MAX_GROUPS && (
        <p className="text-[11px] text-muted mt-2">{t('cases.serial.more', { n: fmtInt(groups.length - MAX_GROUPS) })}</p>
      )}
    </Card>
  );
}
