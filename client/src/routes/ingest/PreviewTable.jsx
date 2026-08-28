// Mapped preview — the first 50 rows through the mapping, one verdict pill
// per row and a mark per cell the validator commented on (✕ reject, ● warn,
// ℹ note). Pure presentation; the verdicts come from the validate result.
import StatusPill from '../../components/StatusPill.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useT } from '../../lib/i18n.jsx';
import { codeKey, SEVERITY_GLYPH, verdictStatus } from './codes.js';

const CELL_TONE = { reject: 'bg-signal/15 border-signal/50', warn: 'bg-amber/15 border-amber/50', info: 'bg-grid/40 border-grid' };
const RANK = { reject: 3, warn: 2, info: 1 };

export default function PreviewTable({ tableDef, headers, rows, mapping, verdicts, limit = 50 }) {
  const t = useT();
  const cols = tableDef.columns.filter((c) => mapping[c.name]);
  const idx = Object.fromEntries(cols.map((c) => [c.name, headers.indexOf(mapping[c.name])]));
  const byRow = new Map((verdicts || []).map((v) => [v.rowNo, v]));
  const shown = rows.slice(0, limit);
  const labelFor = (v) => (v.verdict === 'reject' ? t('ingest.verdict.reject') : (v.issues || []).some((i) => i.severity === 'warn') ? t('ingest.verdict.warn') : t('ingest.verdict.accept'));

  return (
    <div className="overflow-x-auto rounded-xl border border-grid">
      <table className="text-xs min-w-full">
        <caption className="sr-only">{t('ingest.preview.caption', { n: shown.length })}</caption>
        <thead className="bg-panel-raised text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="sticky left-0 bg-panel-raised px-2 py-2 text-left">#</th>
            <th scope="col" className="px-2 py-2 text-left">{t('ingest.preview.verdict')}</th>
            {cols.map((c) => <th key={c.name} scope="col" className="px-2 py-2 text-left whitespace-nowrap">{c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const v = byRow.get(i + 1);
            const issuesByCol = new Map();
            for (const is of (v && v.issues) || []) {
              const cur = issuesByCol.get(is.column) || [];
              cur.push(is);
              issuesByCol.set(is.column, cur);
            }
            const rowIssues = issuesByCol.get('CrimeNo') || [];
            return (
              <tr key={i} className="border-t border-grid/60 align-top">
                <td className="sticky left-0 bg-panel num px-2 py-1 text-muted">{i + 1}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {v ? <StatusPill status={verdictStatus(v)} label={labelFor(v)} /> : <StatusPill status="nodata" label={t('ingest.verdict.pending')} />}
                </td>
                {cols.map((c) => {
                  const raw = r[idx[c.name]];
                  const list = (issuesByCol.get(c.name) || []).concat(c.name === 'CrimeNo' ? [] : []);
                  const top = list.slice().sort((a, b) => RANK[b.severity] - RANK[a.severity])[0];
                  const text = raw === undefined || raw === null ? '' : String(raw);
                  const cell = (
                    <span className={`inline-block max-w-[14rem] truncate align-middle rounded border px-1 ${top ? CELL_TONE[top.severity] : 'border-transparent'}`}>
                      {top && <span aria-hidden="true" className="mr-1">{SEVERITY_GLYPH[top.severity]}</span>}
                      {text || <span className="text-muted">—</span>}
                    </span>
                  );
                  if (!top) return <td key={c.name} className="px-1 py-1">{cell}</td>;
                  const label = list.map((is) => `${codeKey(is.code) ? t(codeKey(is.code)) : is.code}${is.detail ? ` (${is.detail})` : ''}`).join(' · ');
                  return (
                    <td key={c.name} className="px-1 py-1">
                      <Tooltip label={label} position="top">
                        <button type="button" className="text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber rounded" aria-label={`${c.name}: ${label}`}>{cell}</button>
                      </Tooltip>
                    </td>
                  );
                })}
                {rowIssues.length === 0 ? null : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
