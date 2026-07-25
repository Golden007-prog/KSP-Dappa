// Filter-profile bar — a small client-aggregated horizontal bar of the rows
// the table is showing (by district; by station once a district is filtered;
// by crime head once a station is filtered too). Single-series magnitude bar:
// one theme hue (ChartPanel's registered dappa/dappa-light themes), labels in
// text tokens, per-mark tooltip, no legend. Collapsible; state persists.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import ChartPanel from '../../components/ChartPanel.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useT } from '../../lib/i18n.jsx';
import { useCaseNames } from './names.js';
import { readJson, writeJson } from './explorerState.js';

const STORAGE_KEY = 'dappa-cases-summarybar';
const MAX_BARS = 8;

// `groupKind` names the tName table for the grouped column ('' for stations,
// which have no translation table).
export default function SummaryBar({ rows, groupKey, groupLabel, groupKind = '', scopeLabel }) {
  const t = useT();
  const trName = useCaseNames();
  const { theme } = useTheme();
  const [open, setOpen] = useState(() => readJson(STORAGE_KEY, true) !== false);

  const agg = useMemo(() => {
    const counts = new Map();
    for (const r of rows || []) {
      const raw = String(r?.[groupKey] ?? '').trim();
      const name = raw ? (groupKind ? trName(groupKind, raw) : raw) : t('cases.profile.unknown');
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, MAX_BARS).map(([name, count]) => ({ name, count }));
    const rest = sorted.slice(MAX_BARS).reduce((acc, [, c]) => acc + c, 0);
    if (rest > 0) top.push({ name: t('cases.profile.other'), count: rest });
    return top;
  }, [rows, groupKey, groupKind, trName, t]);

  // A one-group profile says nothing — skip the panel entirely.
  if (agg.length < 2) return null;

  const toggle = () => {
    setOpen((o) => {
      writeJson(STORAGE_KEY, !o);
      return !o;
    });
  };
  const toggleBtn = (
    <button type="button" className="btn !py-1 !px-2 text-xs" onClick={toggle} aria-expanded={open}>
      {open ? t('cases.profile.hide') : t('cases.profile.show')}
    </button>
  );

  if (!open) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3 -my-1.5">
          <p className="text-xs text-muted truncate">
            {t('cases.profile.collapsed', { group: groupLabel, scope: scopeLabel })}
          </p>
          {toggleBtn}
        </div>
      </Card>
    );
  }

  // Value labels wear muted text ink (never the series color); canvas charts
  // can't read CSS vars, so the token hex is picked per theme.
  const labelInk = theme === 'light' ? '#5C6B84' : '#8A94A8';

  const height = Math.max(120, agg.length * 30 + 24);
  const option = {
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: agg.map((a) => a.name),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { width: 130, overflow: 'truncate' },
    },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    series: [
      {
        type: 'bar',
        data: agg.map((a) => a.count),
        barWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', fontSize: 11, color: labelInk },
      },
    ],
  };

  return (
    <ChartPanel
      title={t('cases.profile.title')}
      subtitle={t('cases.profile.subtitle', { group: groupLabel, scope: scopeLabel })}
      actions={toggleBtn}
      option={option}
      height={height}
    />
  );
}
