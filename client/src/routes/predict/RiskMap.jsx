// /predict — Karnataka choropleth colored by 30-day station risk.
// Case-count choropleths SUM units per polygon (contract), but summing risk
// scores would inflate polygons that host two police units — so this map shows
// the PEAK station risk per census-district polygon instead.
import { useMemo } from 'react';
import Card from '../../components/Card.jsx';
import MiniChoropleth from '../../components/MiniChoropleth.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useT } from '../../lib/i18n.jsx';
import { polygonForUnit } from '../../lib/districtGeoMap.js';

// Legend gradients mirror MiniChoropleth's internal ramp per app theme —
// dark: #233150 → #F5A623, light: #DBE4F5 → #D97706.
const LEGEND_GRADIENT = {
  dark: 'linear-gradient(90deg,#233150,#F5A623)',
  light: 'linear-gradient(90deg,#DBE4F5,#D97706)',
};

export default function RiskMap({ rows, loading, error, onRetry, onPolygonClick }) {
  const t = useT();
  const { theme } = useTheme();
  const values = useMemo(() => {
    const out = {};
    for (const r of rows) {
      const poly = polygonForUnit(r.districtId);
      if (!poly) continue;
      const score = Number(r.riskScore) || 0;
      if (score > (out[poly] || 0)) out[poly] = Math.round(score);
    }
    return out;
  }, [rows]);

  return (
    <Card
      title={t('trends.predict.map.title')}
      subtitle={t('trends.predict.map.subtitle')}
    >
      {error ? (
        <EmptyState
          compact
          title={t('trends.predict.map.errorTitle')}
          message={error.message}
          action={<button type="button" className="btn" onClick={onRetry}>{t('common.action.retry')}</button>}
        />
      ) : loading ? (
        <LoadingSkeleton height={300} />
      ) : (
        <>
          <MiniChoropleth
            values={values}
            height={300}
            valueLabel={t('trends.predict.map.valueLabel')}
            onPolygonClick={onPolygonClick}
          />
          <div className="flex items-center gap-2 mt-2 text-[10px] text-muted">
            <span>{t('trends.predict.map.low')}</span>
            <span className="h-1.5 w-24 rounded-full" style={{ background: LEGEND_GRADIENT[theme] || LEGEND_GRADIENT.dark }} />
            <span>{t('trends.predict.map.high')}</span>
          </div>
        </>
      )}
    </Card>
  );
}
