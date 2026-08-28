// Validation result — counts, reason summary, data-quality profile, Data
// Store budget, the privacy guard's record of what it did, store checks and
// the rejection report download. Everything here is a dry run.
import Badge from '../../components/Badge.jsx';
import Card from '../../components/Card.jsx';
import KpiTile from '../../components/KpiTile.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt } from '../../lib/format.js';
import { toCsv } from '../../lib/csv.js';
import { downloadBlob } from '../alerts/csv.js';
import { codeKey, SEVERITY_TONE } from './codes.js';
import { rejectionsUrl } from './ingestApi.js';

const TONE_BADGE = { signal: 'red', amber: 'amber', muted: 'neutral' };

export function buildRejectionCsv(result) {
  const keys = Object.keys((result.rows[0] && result.rows[0].keys) || {});
  const columns = ['rowNo', ...keys, 'verdict', 'codes', 'columns', 'details'];
  const rows = result.rows.filter((r) => r.verdict === 'reject' || r.issues.some((i) => i.severity === 'warn')).map((r) => ({
    rowNo: r.rowNo, verdict: r.verdict, ...r.keys,
    codes: r.issues.map((i) => `${i.code}${i.severity === 'reject' ? '' : `(${i.severity})`}`).join('|'),
    columns: r.issues.map((i) => i.column || '').join('|'),
    details: r.issues.map((i) => i.detail || '').join('|'),
  }));
  return toCsv(columns, rows);
}

export default function ResultPanel({ result, meta, batchId, browserOnly }) {
  const t = useT();
  if (!result) return null;
  const { counts, issueSummary, profile, budget, privacy, storeChecks, prerequisites, reference } = result;
  const nullTop = Object.entries(profile.nullRates || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const geo = profile.coordinates;
  return (
    <div className="space-y-4">
      {browserOnly && (
        <p role="status" className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">{t('ingest.result.browserOnly')}</p>
      )}
      {prerequisites && !prerequisites.ok && (
        <p role="alert" className="rounded-xl border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-signal">{t('ingest.result.orderFirst', { list: prerequisites.missing.join(', '), table: result.table })}</p>
      )}
      {result.missingRequiredColumns && result.missingRequiredColumns.length > 0 && (
        <p role="alert" className="rounded-xl border border-signal/40 bg-signal/10 px-3 py-2 text-sm text-signal">{t('ingest.map.missingRequired', { list: result.missingRequiredColumns.join(', ') })}</p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiTile label={t('ingest.result.rows')} value={counts.rows} accent="teal" />
        <KpiTile label={t('ingest.result.accepted')} value={counts.accepted} accent="teal" hint={counts.acceptedWithWarnings ? t('ingest.result.withWarnings', { n: fmtInt(counts.acceptedWithWarnings) }) : undefined} />
        <KpiTile label={t('ingest.result.rejected')} value={counts.rejected} accent="red" pulse={counts.rejected > 0} />
        <KpiTile label={t('ingest.result.inserts')} value={budget.insertCalls} accent="amber" hint={t('ingest.result.insertsHint', { n: fmtInt(budget.rows), chunk: budget.chunkSize })} />
      </div>

      <Card title={t('ingest.result.reasonsTitle')} subtitle={t('ingest.result.reasonsSub')}>
        {issueSummary.length === 0 ? (
          <p className="text-sm text-muted">{t('ingest.result.noIssues')}</p>
        ) : (
          <ul className="space-y-1.5" role="list">
            {issueSummary.map((i) => (
              <li key={`${i.code}|${i.severity}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <Badge tone={TONE_BADGE[SEVERITY_TONE[i.severity]] || 'neutral'}>{t(`ingest.severity.${i.severity}`)}</Badge>
                <span className="num font-semibold text-ink">{fmtInt(i.count)}</span>
                <span className="text-ink">{codeKey(i.code) ? t(codeKey(i.code)) : i.code}</span>
                {i.column && <span className="num text-xs text-muted">({i.column})</span>}
                {i.sample && <span className="text-xs text-muted truncate max-w-[18rem]">· {i.sample}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {batchId && !browserOnly ? (
            <a className="btn min-h-[44px] sm:min-h-[36px] inline-flex items-center" href={rejectionsUrl(batchId)} download={`${batchId}_rejections.csv`}>{t('ingest.result.downloadRejections')}</a>
          ) : (
            <button type="button" className="btn min-h-[44px] sm:min-h-[36px]" onClick={() => downloadBlob('rejections.csv', buildRejectionCsv(result))}>{t('ingest.result.downloadRejections')}</button>
          )}
          <span className="text-xs text-muted">{t('ingest.result.rejectionsHint')}</span>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={t('ingest.profile.title')} subtitle={t('ingest.profile.sub')}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{t('ingest.profile.mapped')}</dt><dd className="num">{profile.columnsMapped} / {profile.columnsMapped + (profile.columnsUnmapped || []).length}</dd>
            {profile.dateRange && (<><dt className="text-muted">{t('ingest.profile.dates')}</dt><dd className="num">{profile.dateRange.min} → {profile.dateRange.max} <span className="text-muted">({profile.dateRange.column})</span></dd></>)}
            {profile.unitCoverage && (<><dt className="text-muted">{t('ingest.profile.units')}</dt><dd className="num">{t('ingest.profile.unitsValue', { known: profile.unitCoverage.knownUnits, total: profile.unitCoverage.distinctUnits, districts: profile.unitCoverage.districts })}</dd></>)}
            {geo && (<><dt className="text-muted">{t('ingest.profile.coords')}</dt><dd className="num">{t('ingest.profile.coordsValue', { withCoords: geo.withCoords, inside: geo.inDistrict, outside: geo.outOfDistrict, state: geo.outOfState, invalid: geo.invalid })}</dd></>)}
            <dt className="text-muted">{t('ingest.profile.encoding')}</dt><dd>{profile.encoding.bom ? 'UTF-8 BOM' : 'UTF-8'}{profile.encoding.kannadaCells ? ` · ${t('ingest.file.kannada', { n: fmtInt(profile.encoding.kannadaCells) })}` : ''}{profile.encoding.replacementChars ? ` · ${t('ingest.profile.replacement', { n: profile.encoding.replacementChars })}` : ''}</dd>
          </dl>
          {nullTop.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-muted mb-1">{t('ingest.profile.nulls')}</p>
              <ul className="space-y-1">
                {nullTop.map(([c, v]) => (
                  <li key={c} className="flex items-center gap-2 text-xs">
                    <span className="w-36 truncate text-ink">{c}</span>
                    <span className="flex-1 h-2 rounded bg-grid/60 overflow-hidden" aria-hidden="true"><span className="block h-full bg-amber/70" style={{ width: `${Math.min(100, v)}%` }} /></span>
                    <span className="num w-12 text-right text-muted">{v}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title={t('ingest.budget.title')} subtitle={t('ingest.budget.sub')}>
            <p className="text-sm text-ink">{t('ingest.budget.line', { rows: fmtInt(budget.rows), calls: fmtInt(budget.insertCalls), chunk: budget.chunkSize })}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={budget.withinFreeTier ? 'teal' : 'red'}>{budget.withinFreeTier ? t('ingest.budget.within', { free: fmtInt(budget.freeTierInsertsPerMonth) }) : t('ingest.budget.over', { free: fmtInt(budget.freeTierInsertsPerMonth) })}</Badge>
              {typeof budget.loadedThisMonthByThisContainer === 'number' && <span className="num text-xs text-muted">{t('ingest.budget.sofar', { n: fmtInt(budget.loadedThisMonthByThisContainer) })}</span>}
            </div>
            <p className="mt-1.5 text-[11px] text-muted">{t('ingest.budget.note')}</p>
          </Card>

          <Card title={t('ingest.guard.title')} subtitle={t('ingest.guard.acted')}>
            <ul className="space-y-1 text-sm" role="list">
              {privacy.tableNeverUsed && <li><Badge tone="red">{t('ingest.guard.tableNeverUsed')}</Badge></li>}
              {privacy.neverUsedColumns.map((c) => <li key={c.column}><Badge tone="red">{c.column}</Badge> <span className="text-muted text-xs">{t(`ingest.guard.action.${c.action.startsWith('dropped') ? 'dropped' : 'kept'}`)}</span></li>)}
              {privacy.piiColumns.map((c) => <li key={c.column}><Badge tone="amber">{c.column}</Badge> <span className="text-muted text-xs">{t('ingest.guard.action.pii')}</span></li>)}
              {privacy.extraColumns.map((c) => <li key={c.header}><Badge tone={c.kind === 'never-used' ? 'red' : c.kind === 'pii' ? 'amber' : 'neutral'}>{c.header}</Badge> <span className="text-muted text-xs">{t(`ingest.guard.kind.${c.kind}`)} · {t('ingest.guard.action.dropped')}</span></li>)}
              {!privacy.tableNeverUsed && !privacy.neverUsedColumns.length && !privacy.piiColumns.length && !privacy.extraColumns.length && <li className="text-muted text-xs">{t('ingest.guard.nothing')}</li>}
            </ul>
          </Card>
        </div>
      </div>

      {(storeChecks && storeChecks.length > 0) || reference ? (
        <details className="rounded-xl border border-grid bg-panel px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer text-ink min-h-[32px] flex items-center">{t('ingest.result.storeChecks')}</summary>
          <ul className="mt-2 space-y-1">
            {(storeChecks || []).map((s, i) => (
              <li key={i} className="num">{s.kind} · {s.table}.{s.column}{s.via ? ` ← ${s.via}` : ''} · {t('ingest.result.checked', { n: s.checked })} · {t('ingest.result.found', { n: s.found })} · {t('ingest.result.queries', { n: s.queries })}{s.failed ? ` · ${t('ingest.result.failed')}` : ''}{s.partial ? ` · ${t('ingest.result.partial')}` : ''}</li>
            ))}
            {reference && <li>{t('ingest.result.reference', { lookups: reference.lookups, units: reference.liveCounts.Unit, bundled: reference.bundledCounts.Unit })}</li>}
            {meta && meta.source && <li>meta.source: {meta.source}{meta.geo ? ` · geo: ${meta.geo}` : ''}</li>}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
