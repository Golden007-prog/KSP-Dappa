// Step 1 — pick the ER table. Reference masters first (they must load before
// the fact tables — the FK order the checklist prescribes), then the case
// tables. Each card says what it needs first and which columns the privacy
// guard will treat as PII or never-used.
import Badge from '../../components/Badge.jsx';
import { useT } from '../../lib/i18n.jsx';
import { templateUrl, isStaticDemo } from './ingestApi.js';
import { toCsv } from '../../lib/csv.js';
import { downloadBlob } from '../alerts/csv.js';

const GROUPS = ['reference', 'fact', 'appendix'];

export default function TablePicker({ tables, value, onChange }) {
  const t = useT();
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => {
        const list = tables.filter((x) => x.group === g);
        if (!list.length) return null;
        return (
          <section key={g} aria-labelledby={`ingest-group-${g}`}>
            <h3 id={`ingest-group-${g}`} className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
              {t(`ingest.group.${g}`)} <span className="num">({list.length})</span>
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2" role="list">
              {list.map((tb) => {
                const active = tb.name === value;
                const pii = tb.columns.filter((c) => c.pii).length;
                const never = tb.neverUsed ? tb.columns.length : tb.columns.filter((c) => c.neverUsed).length;
                return (
                  <li key={tb.name}>
                    <button
                      type="button"
                      onClick={() => onChange(tb.name)}
                      aria-pressed={active}
                      className={`w-full text-left rounded-xl border p-3 min-h-[44px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber ${active ? 'border-primary bg-primary/10' : 'border-grid bg-panel hover:border-control'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-ink"><span className="num text-muted mr-1.5">{tb.order}.</span>{tb.name}</span>
                        <span className="num text-[11px] text-muted">{t('ingest.table.columns', { n: tb.columns.length })}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {tb.requires.length > 0 && <Badge tone="slate">{t('ingest.table.requires', { list: tb.requires.join(', ') })}</Badge>}
                        {pii > 0 && <Badge tone="amber">{t('ingest.table.pii', { n: pii })}</Badge>}
                        {never > 0 && <Badge tone="red">{t('ingest.table.neverUsed', { n: never })}</Badge>}
                        {tb.name === 'CaseMaster' && <Badge tone="teal">{t('ingest.table.whatChanged')}</Badge>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {value && (
        <div className="flex flex-wrap items-center gap-2">
          {isStaticDemo ? (
            <button
              type="button"
              className="btn min-h-[44px] sm:min-h-[36px]"
              onClick={() => {
                const def = tables.find((x) => x.name === value);
                downloadBlob(`${value}_template.csv`, toCsv(def.columns.map((c) => c.name), []));
              }}
            >
              {t('ingest.table.template', { table: value })}
            </button>
          ) : (
            <a className="btn min-h-[44px] sm:min-h-[36px] inline-flex items-center" href={templateUrl(value)} download={`${value}_template.csv`}>
              {t('ingest.table.template', { table: value })}
            </a>
          )}
          <span className="text-xs text-muted">{t('ingest.table.templateHint')}</span>
        </div>
      )}
    </div>
  );
}
