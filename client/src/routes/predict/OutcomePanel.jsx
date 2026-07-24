// /predict — live case-outcome prediction panel.
// Pick a case profile → POST /predict/outcome → probability gauge labeled with
// the model source badge (meta.source: QuickML endpoint vs embedded logistic
// fallback) and the model's ROC-AUC. Caste/religion are never inputs here.
import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { useLookups, usePredictOutcome } from '../../lib/api.js';
// Importing ChartPanel registers the shared 'dappa' echarts theme as a side effect.
import { DAPPA_CHART_COLORS } from '../../components/ChartPanel.jsx';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { fmtNum, fmtPct } from '../../lib/format.js';

const HOUR_BANDS = [
  { value: 'night', label: 'Night (22:00–05:00)' },
  { value: 'morning', label: 'Morning (05:00–12:00)' },
  { value: 'day', label: 'Afternoon (12:00–17:00)' },
  { value: 'evening', label: 'Evening (17:00–22:00)' },
];
const COUNTS = [1, 2, 3, 4, 5, 6];
const FALLBACK_GRAVITIES = [{ id: '1', name: 'Heinous' }, { id: '2', name: 'Non-Heinous' }];

function Field({ label, children }) {
  return (
    <label className="block text-xs text-muted">
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

function gaugeOption(probability) {
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
          color: [[0.4, '#E5484D'], [0.7, DAPPA_CHART_COLORS[0]], [1, '#2DD4BF']],
        },
      },
      pointer: { length: '58%', width: 4, itemStyle: { color: '#E6EAF2' } },
      anchor: { show: true, size: 7, itemStyle: { color: '#E6EAF2', borderColor: '#0B1220', borderWidth: 2 } },
      axisTick: { distance: -16, length: 4, lineStyle: { color: '#0B1220', width: 1 } },
      splitLine: { distance: -16, length: 16, lineStyle: { color: '#0B1220', width: 2 } },
      axisLabel: { distance: 22, color: '#8A94A8', fontSize: 10, formatter: (v) => (v % 50 === 0 ? `${v}%` : '') },
      detail: {
        valueAnimation: true,
        formatter: (v) => `${fmtNum(v, 1)}%`,
        color: '#E6EAF2',
        fontSize: 26,
        fontWeight: 700,
        offsetCenter: [0, '32%'],
      },
      title: { color: '#8A94A8', fontSize: 11, offsetCenter: [0, '60%'] },
      data: [{ value: pct, name: 'P(A-final · detected)' }],
    }],
  };
}

export default function OutcomePanel() {
  const lookups = useLookups();
  const predict = usePredictOutcome();

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
  const set = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setProfile((p) => ({ ...p, [key]: v }));
  };

  const districts = lookups.data?.districts || [];
  const crimeHeads = lookups.data?.crimeHeads || [];
  const subHeads = lookups.data?.crimeSubHeads || [];
  const gravities = (lookups.data?.gravities?.length ? lookups.data.gravities : FALLBACK_GRAVITIES);

  const run = () => {
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

  const result = predict.data?.data;
  const source = predict.data?.meta?.source;
  const option = useMemo(() => (result ? gaugeOption(result.probability) : null), [result]);
  const probA = result?.probabilities?.[result?.classes?.[0] ?? 'A'];
  const probC = result?.probabilities?.[result?.classes?.[1] ?? 'C'];

  return (
    <Card
      title="Live outcome prediction"
      subtitle="Will this FIR profile end in an A-final (detected) chargesheet? Scored by QuickML, or the embedded logistic model when the flag is off."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- case profile form ------------------------------------------ */}
        <div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="District">
              <select className="input-dark w-full !py-1.5" value={profile.districtId} onChange={set('districtId')} disabled={lookups.isLoading}>
                {lookups.isLoading && <option>Loading…</option>}
                {districts.map((d) => <option key={d.districtId} value={d.districtId}>{d.districtName}</option>)}
              </select>
            </Field>
            <Field label="Crime subhead">
              <select className="input-dark w-full !py-1.5" value={profile.crimeSubHeadId} onChange={set('crimeSubHeadId')} disabled={lookups.isLoading}>
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
              <select className="input-dark w-full !py-1.5" value={profile.gravity} onChange={set('gravity')}>
                {gravities.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select>
            </Field>
            <Field label="Hour band">
              <select className="input-dark w-full !py-1.5" value={profile.hourBand} onChange={set('hourBand')}>
                {HOUR_BANDS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </Field>
            <Field label="Victims">
              <select className="input-dark w-full !py-1.5" value={profile.victimCount} onChange={set('victimCount')}>
                {COUNTS.map((n) => <option key={n} value={n}>{n === 6 ? '6+' : n}</option>)}
              </select>
            </Field>
            <Field label="Accused">
              <select className="input-dark w-full !py-1.5" value={profile.accusedCount} onChange={set('accusedCount')}>
                {COUNTS.map((n) => <option key={n} value={n}>{n === 6 ? '6+' : n}</option>)}
              </select>
            </Field>
            <Field label="Sections invoked">
              <select className="input-dark w-full !py-1.5" value={profile.sectionCount} onChange={set('sectionCount')}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-muted cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-amber h-3.5 w-3.5"
                checked={profile.arrestWithin7d}
                onChange={set('arrestWithin7d')}
              />
              Arrest within 7 days
            </label>
          </div>
          <button
            type="button"
            className="btn-primary mt-4 w-full sm:w-auto disabled:opacity-50"
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
              message="Configure a case profile on the left and press Predict outcome."
            />
          ) : (
            <div>
              <ReactECharts
                echarts={echarts}
                theme="dappa"
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
