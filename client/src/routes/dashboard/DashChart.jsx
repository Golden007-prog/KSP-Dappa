// Bare ECharts surface for dashboard panels (no Card — DashPanel is the frame).
// Same 'dappa'/'dappa-light' themes as ChartPanel (importing it registers them),
// plus a ref API for PNG export:
//   const ref = useRef(); …ref.current?.toDataURL() → data:image/png (2× pixel
//   ratio, panel-colored background so exports aren't transparent).
import { forwardRef, useImperativeHandle, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import '../../components/ChartPanel.jsx'; // side effect: registers both dappa themes
import { useTheme } from '../../components/ThemeProvider.jsx';

const PANEL_BG = { dark: '#111A2C', light: '#FFFFFF' };

const DashChart = forwardRef(function DashChart({ option, height = 300, onEvents }, ref) {
  const { theme } = useTheme();
  const chartRef = useRef(null);
  const chartTheme = theme === 'light' ? 'dappa-light' : 'dappa';

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      const inst = chartRef.current?.getEchartsInstance?.();
      if (!inst) return null;
      return inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: PANEL_BG[theme] || PANEL_BG.dark });
    },
  }), [theme]);

  return (
    <ReactECharts
      key={chartTheme}
      ref={chartRef}
      echarts={echarts}
      theme={chartTheme}
      option={option}
      notMerge
      lazyUpdate
      style={{ height, width: '100%' }}
      onEvents={onEvents}
      opts={{ renderer: 'canvas' }}
    />
  );
});

export default DashChart;
