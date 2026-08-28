// Station load board — the "smarter resource deployment" view.
//
// Two questions a district SP actually asks: where is the volume, and where is
// it *stuck*. So each station carries both a count and a median pendency, and
// the Pareto line answers the deployment question directly — how few stations
// carry 80% of the load, i.e. how concentrated a surge deployment can be before
// it stops buying anything.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import ChartPanel from '../../components/ChartPanel.jsx';
import DataTable from '../../components/DataTable.jsx';
import Badge from '../../components/Badge.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useLookups } from '../../lib/api.js';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { readJson, writeJson } from './explorerState.js';
import { median } from './deepScan.js';

const STORAGE_KEY = 'dappa-cases-stationload';
const PARETO_BARS = 15;

/** Per-station rollup of the scanned rows, heaviest first. */
export function stationLoad(rows) {
  const byStation = new Map();
  for (const r of rows || []) {
    const name = String(r.unitName || '').trim();
    if (!name) continue;
    if (!byStation.has(name)) {
      byStation.set(name, {
        unitName: name, districtName: r.districtName || '', cases: 0,
        heinous: 0, anomalies: 0, ages: [], open: 0,
      });
    }
    const s = byStation.get(name);
    s.cases += 1;
    if (/hein/i.test(String(r.gravityName || ''))) s.heinous += 1;
    if (r.anomalyFlag) s.anomalies += 1;
    if (/investigat|pending/i.test(String(r.statusName || ''))) s.open += 1;
    if (Number.isFinite(r.ageDays)) s.ages.push(r.ageDays);
  }
  const total = (rows || []).length;
  const list = [...byStation.values()].map((s) => ({
    unitName: s.unitName,
    districtName: s.districtName,
    cases: s.cases,
    sharePct: total ? (s.cases / total) * 100 : 0,
    heinousPct: s.cases ? (s.heinous / s.cases) * 100 : 0,
    anomalies: s.anomalies,
    open: s.open,
    medianAge: median(s.ages),
  })).sort((a, b) => b.cases - a.cases);
  // How many stations it takes to cover 80% of the scanned volume.
  let acc = 0;
  let p80 = 0;
  for (const s of list) {
    acc += s.cases;
    p80 += 1;
    if (total && acc / total >= 0.8) break;
  }
  return { list, total, p80, stations: list.length };
}

export default function StationLoad({ rows, scopeLabel, onStation }) {
  const t = useT();
  const trName = useCaseNames();
  const { theme } = useTheme();
  const lookups = useLookups();
  const lk = lookups.data;
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, true) !== false);

  const model = useMemo(() => stationLoad(rows), [rows]);

  if (model.stations < 2) return null;

  const toggle = () => setOpen((o) => { writeJson(STORAGE_KEY, !o); return !o; });

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate">
            {t('cases.load.collapsed', { n: fmtInt(model.stations), p: fmtInt(model.p80) })}
          </p>
          <button type="button" className="btn !py-1 !px-2 text-xs shrink-0" onClick={toggle} aria-expanded={false}>
            {t('cases.profile.show')}
          </button>
        </div>
      </Card>
    );
  }

  const pick = (name) => {
    const unit = (lk?.units || []).find((u) => u.unitName === name);
    if (unit) onStation?.({ districtId: unit.districtId || '', unitId: unit.unitId });
  };

  const bars = model.list.slice(0, PARETO_BARS);
  let running = 0;
  const cumulative = bars.map((s) => {
    running += s.cases;
    return model.total ? Math.round((running / model.total) * 1000) / 10 : 0;
  });
  const labelInk = theme === 'light' ? '#5C6B84' : '#8A94A8';
  const lineColor = theme === 'light' ? '#0F766E' : '#2DD4BF';

  const paretoOption = {
    grid: { left: 8, right: 44, top: 20, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: bars.map((s) => s.unitName),
      axisLabel: { fontSize: 9, interval: 0, rotate: 40, width: 84, overflow: 'truncate' },
    },
    yAxis: [
      { type: 'value', minInterval: 1 },
      { type: 'value', max: 100, axisLabel: { formatter: '{value}%', fontSize: 9 }, splitLine: { show: false } },
    ],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [
      {
        type: 'bar', name: t('cases.load.cases'), data: bars.map((s) => s.cases),
        barMaxWidth: 26, itemStyle: { borderRadius: [3, 3, 0, 0] }, cursor: 'pointer',
      },
      {
        type: 'line', name: t('cases.load.cumulative'), yAxisIndex: 1, data: cumulative,
        smooth: true, symbolSize: 5, lineStyle: { width: 2, color: lineColor }, itemStyle: { color: lineColor },
        label: { show: false }, emphasis: { focus: 'series' },
      },
    ],
    legend: { show: true, top: 0, textStyle: { fontSize: 10, color: labelInk } },
  };

  const columns = [
    { key: 'unitName', label: t('cases.load.station'), sortable: true, className: 'font-medium' },
    { key: 'districtName', label: t('cases.load.district'), sortable: true, render: (r) => trName('districts', r.districtName) || '—' },
    { key: 'cases', label: t('cases.load.cases'), sortable: true, align: 'right', width: 76, render: (r) => fmtInt(r.cases) },
    {
      key: 'sharePct', label: t('cases.load.share'), sortable: true, align: 'right', width: 84,
      render: (r) => fmtPct(r.sharePct),
    },
    {
      key: 'medianAge', label: t('cases.load.medianAge'), sortable: true, align: 'right', width: 96,
      render: (r) => (r.medianAge === null
        ? '—'
        : <span className={r.medianAge > 180 ? 'text-signal font-medium' : r.medianAge > 90 ? 'text-amber' : ''}>{fmtInt(r.medianAge)}d</span>),
    },
    {
      key: 'heinousPct', label: t('cases.load.heinous'), sortable: true, align: 'right', width: 88,
      render: (r) => (r.heinousPct > 0 ? fmtPct(r.heinousPct) : '—'),
    },
    {
      key: 'anomalies', label: t('cases.load.anomalies'), sortable: true, align: 'right', width: 84,
      render: (r) => (r.anomalies > 0 ? <Badge tone="red">{fmtInt(r.anomalies)}</Badge> : '—'),
    },
  ];

  return (
    <div className="space-y-3">
      <Card
        title={t('cases.load.title')}
        subtitle={t('cases.load.subtitle', { scope: scopeLabel, n: fmtInt(model.stations) })}
        actions={<button type="button" className="btn !py-1 !px-2 text-xs" onClick={toggle} aria-expanded>{t('cases.profile.hide')}</button>}
      >
        <p className="text-xs text-muted mb-2">
          <span className="text-ink font-medium num">
            {t('cases.load.pareto', {
              p: fmtInt(model.p80),
              n: fmtInt(model.stations),
              pct: model.stations ? Math.round((model.p80 / model.stations) * 100) : 0,
            })}
          </span>
          {' '}
          {t('cases.load.paretoNote')}
        </p>
        <ChartPanel
          option={paretoOption}
          height={250}
          onEvents={{
            click: (p) => {
              const hit = bars[p?.dataIndex];
              if (hit) pick(hit.unitName);
            },
          }}
        />
      </Card>
      <Card padded={false}>
        <DataTable
          dense
          scrollAriaLabel={t('cases.stationLoad.scrollAria')}
          exportFilename="dappa-station-load"
          columns={columns}
          rows={model.list}
          rowKey="unitName"
          onRowClick={(r) => pick(r.unitName)}
          emptyMessage={t('cases.load.empty')}
        />
      </Card>
    </div>
  );
}
