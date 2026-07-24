// /predict — live case-outcome prediction panel.
// Pick a case profile (or a one-tap preset) → POST /predict/outcome →
// probability gauge labeled with the model source badge (meta.source: QuickML
// endpoint vs embedded logistic fallback) and the model's ROC-AUC. Re-scoring
// shows a what-if delta against the previous run. Caste/religion are never
// inputs here. The gauge chrome resolves per app theme.
import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { useLookups, usePredictOutcome } from '../../lib/api.js';
// Importing ChartPanel registers the shared echarts themes as a side effect.
import { DAPPA_CHART_COLORS } from '../../components/ChartPanel.jsx';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { fmtNum, fmtPct } from '../../lib/format.js';

const HOUR_BANDS = [
  { value: 'night', label: 'Night (22:00–05:00)' },
  { value: 'morning', label: 'Morning (05:00–12:00)' },
  { value: 'day', label: 'Afternoon (12:00–17:00)' },
  { value: 'evening', label: 'Evening (17:00–22:00)' },
];
const COUNTS = [1, 2, 3, 4, 5, 6];
const FALLBACK_GRAVITIES = [{ id: '1', name: 'Heinous' }, { id: '2', name: 'Non-Heinous' }];

// One-tap case profiles (subhead ids from the pinned fixture lookups). The
// preset keeps whatever district is currently selected.
const PRESETS = [
  {
    label: 'Night vehicle theft',
    patch: { crimeSubHeadId: '306', gravity: 'Non-Heinous', hourBand: 'night', victimCount: 1, accusedCount: 1, sectionCount: 2, arrestWithin7d: false },
  },
  {
    label: 'Daytime chain snatching',
    patch: { crimeSubHeadId: '307', gravity: 'Non-Heinous', hourBand: 'day', victimCount: 1, accusedCount: 1, sectionCount: 2, arrestWithin7d: false },
  },
  {
    label: 'Heinous · early arrest',
    patch: { crimeSubHeadId: '101', gravity: 'Heinous', hourBand: 'night', victimCount: 1, accusedCount: 2, sectionCount: 4, arrestWithin7d: true },
  },
  {
    label: 'Online fraud',
    patch: { crimeSubHeadId: '501', gravity: 'Non-Heinous', hourBand: 'evening', victimCount: 1, accusedCount: 1, sectionCount: 3, arrestWithin7d: false },
  },
];

// Gauge chrome per app theme — the near-white pointer/detail text of the dark
// look is invisible on a white card, so light mode gets ink-on-white tokens
// and AA-dark zone colors.
const GAUGE_TOKENS = {
  dark: {
    zones: [[0.4, '#E5484D'], [0.7, DAPPA_CHART_COLORS[0]], [1, '#2DD4BF']],
    pointer: '#E6EAF2', anchorRing: '#0B1220', tick: '#0B1220',
    label: '#8A94A8', detail: '#E6EAF2', title: '#8A94A8',
  },
  light: {
    zones: [[0.4, '#DC2626'], [0.7, '#D97706'], [1, '#0F766E']],
    pointer: '#131B2E', anchorRing: '#FFFFFF', tick: '#FFFFFF',
    label: '#5C6B84', detail: '#131B2E', title: '#5C6B84',
  },
};

function Field({ label, children }) {
  return (
    <label className="block text-xs text-muted">
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

function gaugeOption(probability, t) {
  const pct = Math.round((Number(probability) || 0) * 1000) / 10;
  return {
    series: [{
      type: 'gauge',
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      radius: '100%',
      center: ['50%', '60%'],
      axisLine: {
        lineStyle: {
          width: 16,
          // Semantic zones: red (unlikely), amber (uncertain), teal (likely detected).
          color: t.zones,
        },
      },
      pointer: { length: '58%', width: 4, itemStyle: { color: t.pointer } },
      anchor: { show: true, size: 7, itemStyle: { color: t.pointer, borderColor: t.anchorRing, borderWidth: 2 } },
      axisTick: { distance: -16, length: 4, lineStyle: { color: t.tick, width: 1 } },
      splitLine: { distance: -16, length: 16, lineStyle: { color: t.tick, width: 2 } },
      axisLabel: { distance: 22, color: t.label, fontSize: 10, formatter: (v) => (v % 50 === 0 ? `${v}%` : '') },
      detail: {
        valueAnimation: true,
        formatter: (v) => `${fmtNum(v, 1)}%`,
        color: t.detail,
        fontSize: 26,
        fontWeight: 700,
        offsetCenter: [0, '32%'],
      },
      title: { color: t.title, fontSize: 11, offsetCenter: [0, '60%'] },
      data: [{ value: pct, name: 'P(A-final · detected)' }],
    }],
  };
}

export default function OutcomePanel() {
  const lookups = useLookups();
  const predict = usePredictOutcome();
  const { theme } = useTheme();
  const chartTheme = theme === 'light' ? 'dappa-light' : 'dappa';
  const tokens = GAUGE_TOKENS[theme] || GAUGE_TOKENS.dark;

  const [profile, setProfile] = useState({
    districtId: '0101',
    crimeSubHeadId: '306',
    gravity: 'Non-Heinous',
    hourBand: 'night',
    victimCount: 1,
    accusedCount: 1,
    sectionCount: 2,
    arrestWithin7d: false,
  });
  // Previous run's probability — powers the "vs last run" what-if delta.
  const [prevProb, setPrevProb] = useState(null);

  const set = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setProfile((p) => ({ ...p, [key]: v }));
  };

  const districts = lookups.data?.districts || [];
  const crimeHeads = lookups.data?.crimeHeads || [];
  const subHeads = lookups.data?.crimeSubHeads || [];
  const gravities = (lookups.data?.gravities?.length ? lookups.data.gravities : FALLBACK_GRAVITIES);

  // If the deployed lookups lack the hardcoded default ids, snap to the first
  // real option instead of rendering a blank select that still POSTs stale ids.
  useEffect(() => {
    const d = lookups.data;
    if (!d) return;
    setProfile((p) => {
      let next = p;
      if (d.districts.length && !d.districts.some((x) => x.districtId === String(p.districtId))) {
        next = { ...next, districtId: d.districts[0].districtId };
      }
      if (d.crimeSubHeads.length && !d.crimeSubHeads.some((x) => x.crimeSubHeadId === String(p.crimeSubHeadId))) {
        next = { ...next, crimeSubHeadId: d.crimeSubHeads[0].crimeSubHeadId };
      }
      return next;
    });
  }, [lookups.data]);

  const result = predict.data?.data;
  const source = predict.data?.meta?.source;

  const run = () => {
    setPrevProb(result ? Number(result.probability) : null);
    predict.mutate({
      districtId: profile.districtId,
      crimeSubHeadId: profile.crimeSubHeadId,
      gravity: profile.gravity,
      hourBand: profile.hourBand,
      victimCount: Number(profile.victimCount),
      accusedCount: Number(profile.accusedCount),
      sectionCount: Number(profile.sectionCount),
      arrestWithin7d: !!profile.arrestWithin7d,
    });
  };

  const applyPreset = (preset) => {
    setProfile((p) => ({ ...p, ...preset.patch }));
  };

  const option = useMemo(() => (result ? gaugeOption(result.probability, tokens) : null), [result, tokens]);
  const probA = result?.probabilities?.[result?.classes?.[0] ?? 'A'];
  const probC = result?.probabilities?.[result?.classes?.[1] ?? 'C'];
  const deltaPts = result && prevProb !== null && Number.isFinite(Number(result.probability))
    ? (Number(result.probability) - prevProb) * 100
    : null;

  return (
    <Card
      title="Live outcome prediction"
      subtitle="Will this FIR profile end in an A-final (detected) chargesheet? Scored by QuickML, or the embedded logistic model when the flag is off."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- case profile form ------------------------------------------ */}
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Preset case profiles">
            <span className="text-[11px] text-muted mr-1">Presets:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="chip !px-3 min-h-[40px] hover:border-amber/40 hover:text-amber transition-colors"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="District">
              <select className="input-dark w-full !py-2" value={profile.districtId} onChange={set('districtId')} disabled={lookups.isLoading}>
                {lookups.isLoading && <option>Loading…</option>}
                {districts.map((d) => <option key={d.districtId} value={d.districtId}>{d.districtName}</option>)}
              </select>
            </Field>
            <Field label="Crime subhead">
              <select className="input-dark w-full !py-2" value={profile.crimeSubHeadId} onChange={set('crimeSubHeadId')} disabled={lookups.isLoading}>
                {lookups.isLoading && <option>Loading…</option>}
                {crimeHeads.map((h) => (
                  <optgroup key={h.crimeHeadId} label={h.headName}>
                    {subHeads.filter((s) => s.crimeHeadId === h.crimeHeadId).map((s) => (
                      <option key={s.crimeSubHeadId} value={s.crimeSubHeadId}>{s.subHeadName}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="Gravity">
              <select className="input-dark w-full !py-2" value={profile.gravity} onChange={set('gravity')}>
                {gravities.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="Hour band">
              <select className="input-dark w-full !py-2" value={profile.hourBand} onChange={set('hourBand')}>
                {HOUR_BANDS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </Field>
            <Field label="Victims">
              <select className="input-dark w-full !py-2" value={profile.victimCount} onChange={set('victimCount')}>
                {COUNTS.map((n) => <option key={n} value={n}>{n === 6 ? '6+' : n}</option>)}
              </select>
            </Field>
            <Field label="Accused">
              <select className="input-dark w-full !py-2" value={profile.accusedCount} onChange={set('accusedCount')}>
                {COUNTS.map((n) => <option key={n} value={n}>{n === 6 ? '6+' : n}</option>)}
              </select>
            </Field>
            <Field label="Sections invoked">
              <select className="input-dark w-full !py-2" value={profile.sectionCount} onChange={set('sectionCount')}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 py-2 text-xs text-muted cursor-pointer select-none min-h-[40px]">
              <input
                type="checkbox"
                className="accent-amber h-4 w-4"
                checked={profile.arrestWithin7d}
                onChange={set('arrestWithin7d')}
              />
              Arrest within 7 days
            </label>
          </div>
          <button
            type="button"
            className="btn-primary mt-4 w-full sm:w-auto min-h-[44px] disabled:opacity-50"
            onClick={run}
            disabled={predict.isPending || lookups.isLoading}
          >
            {predict.isPending ? 'Scoring…' : 'Predict outcome'}
          </button>
          <p className="text-[11px] text-muted mt-2">
            Synthetic model inputs only — caste/religion fields are never part of any feature set.
          </p>
        </div>

        {/* --- probability gauge ------------------------------------------ */}
        <div className="min-h-[260px]">
          {predict.isPending ? (
            <LoadingSkeleton height={240} />
          ) : predict.error ? (
            <EmptyState
              compact
              title="Prediction failed"
              message={predict.error.message}
              action={<button type="button" className="btn" onClick={run}>Retry</button>}
            />
          ) : !result ? (
            <EmptyState
              compact
              title="No prediction yet"
              message="Configure a case profile on the left (or tap a preset) and press Predict outcome."
            />
          ) : (
            <div>
              <ReactECharts
                key={chartTheme}
                echarts={echarts}
                theme={chartTheme}
                option={option}
                notMerge
                style={{ height: 220, width: '100%' }}
                opts={{ renderer: 'canvas' }}
              />
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <Badge tone={result.predictedClass === 'A' ? 'teal' : 'red'}>
                  Predicted: {result.predictedClass} — {result.predictedClass === 'A' ? 'detected' : 'undetected'}
                </Badge>
                <span title={`meta.source: ${source}`}>
                  <Badge tone={source === 'fallback-local' ? 'slate' : 'amber'}>
                    {source === 'fallback-local' ? 'Embedded logistic · local fallback' : 'QuickML · live endpoint'}
                  </Badge>
                </span>
                {result.modelAuc != null && (
                  <Badge tone="teal">ROC-AUC {fmtNum(result.modelAuc, 2)}</Badge>
                )}
                {deltaPts !== null && (
                  <span title="Change in detection probability vs the previous run">
                    <Badge tone={Math.abs(deltaPts) < 0.05 ? 'slate' : deltaPts > 0 ? 'teal' : 'red'}>
                      {deltaPts >= 0 ? '+' : '−'}{fmtNum(Math.abs(deltaPts), 1)} pts vs last run
                    </Badge>
                  </span>
                )}
              </div>
              {Number.isFinite(Number(probA)) && Number.isFinite(Number(probC)) && (
                <p className="text-center text-[11px] text-muted mt-2 num">
                  A (detected) {fmtPct(Number(probA) * 100, { digits: 1, fraction: false })}
                  {' · '}
                  C (undetected) {fmtPct(Number(probC) * 100, { digits: 1, fraction: false })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
