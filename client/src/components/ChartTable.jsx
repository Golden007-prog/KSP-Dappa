// Text equivalent of a chart (WCAG 1.1.1): the option's series rendered as a
// real <table> with column headers and a caption. ChartPanel shows it on the
// "Table" toggle and always in print (hidden print:block), so a printed brief
// carries the numbers beneath every figure — the copilot answer chart already
// did this for its own payload (routes/copilot/CopilotChart.jsx).
// Props: table ({columns, rows} from lib/chartA11y.js optionToTable), caption,
// visible (bool — false renders print-only), maxRows (default 60).
import { useT } from '../lib/i18n.jsx';
import { fmtNum } from '../lib/format.js';

const COLUMN_KEY = {
  category: 'a11y.chart.col.category', value: 'a11y.chart.col.value', series: 'a11y.chart.col.series',
  metric: 'a11y.chart.col.metric', x: 'a11y.chart.col.x', y: 'a11y.chart.col.y',
};

export default function ChartTable({ table, caption, visible = false, maxRows = 60, className = '', style }) {
  const t = useT();
  if (!table || !table.rows?.length) return null;
  const rows = table.rows.slice(0, maxRows);
  const truncated = table.rows.length > rows.length;
  return (
    // .chart-table scrolls sideways (index.css) and holds nothing focusable,
    // so it takes tabindex=0 for WCAG 2.1.1 and a name for the landmark that
    // creates. Harmless on the print-only copy, which is display:none.
    <div
      className={`chart-table ${visible ? '' : 'hidden print:block'} ${className}`}
      style={style}
      tabIndex={0}
      role="region"
      aria-label={t('a11y.scroll.chartTable')}
    >
      <table className="w-full">
        <caption className="sr-only">{caption || t('a11y.chart.tableCaption')}</caption>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} scope="col">{COLUMN_KEY[c] ? t(COLUMN_KEY[c]) : c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-grid/40">
              {r.map((cell, ci) => (
                ci === 0
                  ? <th key={ci} scope="row" className="!font-normal !text-ink">{String(cell ?? '—')}</th>
                  : <td key={ci} className="num text-right">{typeof cell === 'number' ? fmtNum(cell, Number.isInteger(cell) ? 0 : 2) : String(cell ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && <p className="px-2 py-1 text-[10px] text-muted">{t('a11y.chart.tableTruncated', { n: rows.length, total: table.rows.length })}</p>}
    </div>
  );
}
