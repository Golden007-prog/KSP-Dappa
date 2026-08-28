// Recidivism curve — Kaplan–Meier time-to-next-case, overall and by case-count
// band / dominant crime family. Data: GET /depth/recidivism.
import { useMemo, useState } from 'react';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { useDepthRecidivism } from '../../lib/depthApi.js';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { seriesColors } from '../trends/palettes.js';
import { PanelFrame, StatTile, StepCurve } from './DepthBits.jsx';

export default function RecidivismPanel() {
  const t = useT();
  const tName = useNames();
  const { theme } = useTheme();
  const colors = seriesColors('standard', theme);
  const q = useDepthRecidivism();
  const d = q.data;
  const [view, setView] = useState('band');
  const summary = d?.summary || {};

  const series = useMemo(() => {
    if (!d) return [];
    const groups = view === 'band' ? d.byCaseCount : d.byFamily;
    const out = [{ label: t('depth.recid.overall'), color: colors[0], steps: d.overall.steps, grid: d.overall.grid }];
    groups.slice(0, 5).forEach((g, i) => out.push({
      label: view === 'band' ? t('depth.recid.bandLabel', { band: g.label }) : tName('crimeHeads', null, g.label) || g.label,
      color: colors[(i + 1) % colors.length], steps: g.steps, grid: g.grid,
    }));
    return out;
  }, [d, view, colors, t, tName]);

  return (
    <PanelFrame
      title={t('depth.recid.title')}
      subtitle={d ? t('depth.recid.subtitle', { persons: fmtInt(summary.persons || 0), n: fmtInt(summary.intervals || 0) }) : undefined}
      term="survival"
      termVars={{ p90: summary.within90 === null || summary.within90 === undefined ? '—' : Math.round(summary.within90 * 100), p365: summary.within365 === null || summary.within365 === undefined ? '—' : Math.round(summary.within365 * 100) }}
      method={t('depth.recid.method')}
      methodDetail={d?.method}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && !(summary.intervals > 0)}
      emptyMessage={t('depth.recid.empty')}
      actions={d && (
        <SegmentedControl
          ariaLabel={t('depth.recid.viewAria')}
          value={view}
          onChange={setView}
          options={[{ value: 'band', label: t('depth.recid.viewBand') }, { value: 'family', label: t('depth.recid.viewFamily') }]}
        />
      )}
    >
      {d && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label={t('depth.recid.kpiMedian')} value={summary.medianDays === null ? '—' : t('depth.common.daysN', { n: fmtInt(summary.medianDays) })} hint={t('depth.recid.kpiMedianHint')} />
            <StatTile label={t('depth.recid.kpi90')} value={fmtPct((summary.within90 || 0) * 100, { digits: 0 })} />
            <StatTile label={t('depth.recid.kpi365')} value={fmtPct((summary.within365 || 0) * 100, { digits: 0 })} />
            <StatTile label={t('depth.recid.kpiCensored')} value={fmtInt(summary.censored)} hint={t('depth.recid.kpiCensoredHint')} />
          </div>
          <StepCurve series={series} grid={d.grid} maxT={730} ariaLabel={t('depth.recid.chartAria')} />
        </div>
      )}
    </PanelFrame>
  );
}
