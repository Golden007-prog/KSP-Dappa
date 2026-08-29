// /predict — live case-outcome prediction panel.
// Pick a case profile (or a one-tap preset) → POST /predict/outcome →
// probability gauge labeled with the model source badge (meta.source: QuickML
// endpoint vs embedded logistic fallback) and the model's ROC-AUC. Re-scoring
// shows a what-if delta against the previous run. Protected identity fields are
// never inputs here. The gauge chrome resolves per app theme.
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
import StatDelta from '../../components/StatDelta.jsx';
import { useTheme } from '../../components/ThemeProvider.jsx';
import { useT, useNames } from '../../lib/i18n.jsx';
import { fmtNum, fmtPct } from '../../lib/format.js';
import SensitivityPanel from './SensitivityPanel.jsx';

// Values are the API contract; the visible label comes from predict.band.*.
const HOUR_BANDS = ['night', 'morning', 'day', 'evening'];
const COUNTS = [1, 2, 3, 4, 5, 6];
const FALLBACK_GRAVITIES = [{ id: '1', name: 'Heinous' }, { id: '2', name: 'Non-Heinous' }];

// One-tap case profiles (subhead ids from the pinned fixture lookups). The
// preset keeps whatever district is currently selected.
const PRESETS = [
  {
    key: 'nightVehicleTheft',
    patch: { crimeSubHeadId: '306', gravity: 'Non-Heinous', hourBand: 'night', victimCount: 1, accusedCount: 1, sectionCount: 2, arrestWithin7d: false },
  },
  {
    key: 'chainSnatching',
    patch: { crimeSubHeadId: '307', gravity: 'Non-Heinous', hourBand: 'day', victimCount: 1, accusedCount: 1, sectionCount: 2, arrestWithin7d: false },
  },
  {
    key: 'heinousArrest',
    patch: { crimeSubHeadId: '101', gravity: 'Heinous', hourBand: 'night', victimCount: 1, accusedCount: 2, sectionCount: 4, arrestWithin7d: true },
  },
  {
    key: 'onlineFraud',
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

function gaugeOption(probability, tok, t) {
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
          color: tok.zones,
        },
      },
      pointer: { length: '58%', width: 4, itemStyle: { color: tok.pointer } },
      anchor: { show: true, size: 7, itemStyle: { color: tok.pointer, borderColor: tok.anchorRing, borderWidth: 2 } },
      axisTick: { distance: -16, length: 4, lineStyle: { color: tok.tick, width: 1 } },
      splitLine: { distance: -16, length: 16, lineStyle: { color: tok.tick, width: 2 } },
      axisLabel: { distance: 22, color: tok.label, fontSize: 10, formatter: (v) => (v % 50 === 0 ? `${v}%` : '') },
      detail: {
        valueAnimation: true,
        formatter: (v) => `${fmtNum(v, 1)}%`,
        color: tok.detail,
        fontSize: 26,
        fontWeight: 700,
        offsetCenter: [0, '32%'],
      },
      title: { color: tok.title, fontSize: 11, offsetCenter: [0, '60%'] },
      data: [{ value: pct, name: t('trends.predict.gauge.name') }],
    }],
  };
}

export default function OutcomePanel() {
  const t = useT();
  const tName = useNames();
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
  // The exact payload that produced the current result (the form may have been
  // edited since) — the sensitivity sweep perturbs THIS, not the live form.
  const [scoredProfile, setScoredProfile] = useState(null);
  // Session scoring log (newest first, capped) for the run-history strip.
  const [runLog, setRunLog] = useState([]);

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
    const payload = {
      districtId: profile.districtId,
      crimeSubHeadId: profile.crimeSubHeadId,
      gravity: profile.gravity,
      hourBand: profile.hourBand,
      victimCount: Number(profile.victimCount),
      accusedCount: Number(profile.accusedCount),
      sectionCount: Number(profile.sectionCount),
      arrestWithin7d: !!profile.arrestWithin7d,
    };
    predict.mutate(payload, {
      onSuccess: (res) => {
        setScoredProfile(payload);
        const p = Number(res?.data?.probability);
        if (!Number.isFinite(p)) return;
        setRunLog((log) => [{
          t: new Date(),
          prob: p,
          cls: res?.data?.predictedClass || '—',
          source: res?.meta?.source || '',
        }, ...log].slice(0, 5));
      },
    });
  };

  const applyPreset = (preset) => {
    setProfile((p) => ({ ...p, ...preset.patch }));
  };

  const option = useMemo(
    () => (result ? gaugeOption(result.probability, tokens, t) : null),
    [result, tokens, t],
  );
  const probA = result?.probabilities?.[result?.classes?.[0] ?? 'A'];
  const probC = result?.probabilities?.[result?.classes?.[1] ?? 'C'];
  const deltaPts = result && prevProb !== null && Number.isFinite(Number(result.probability))
    ? (Number(result.probability) - prevProb) * 100
    : null;

  return (
    <Card
      title={t('trends.predict.outcome.title')}
      subtitle={t('trends.predict.outcome.subtitle')}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* --- case profile form ------------------------------------------ */}
        <div>
          <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label={t('trends.predict.outcome.presetsAria')}>
            <span className="text-[11px] text-muted mr-1">{t('trends.predict.outcome.presets')}</span>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="chip !px-3 min-h-[40px] hover:border-amber/40 hover:text-amber transition-colors"
                onClick={() => applyPreset(p)}
              >
                {t(`trends.predict.preset.${p.key}`)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.filter.district')}>
              <select className="input-dark w-full !py-2" value={profile.districtId} onChange={set('districtId')} disabled={lookups.isLoading}>
                {lookups.isLoading && <option>{t('common.state.loading')}</option>}
                {districts.map((d) => (
                  <option key={d.districtId} value={d.districtId}>
                    {tName('districts', d.districtId, d.districtName)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('trends.predict.field.subhead')}>
              <select className="input-dark w-full !py-2" value={profile.crimeSubHeadId} onChange={set('crimeSubHeadId')} disabled={lookups.isLoading}>
                {lookups.isLoading && <option>{t('common.state.loading')}</option>}
                {crimeHeads.map((h) => (
                  <optgroup key={h.crimeHeadId} label={tName('crimeHeads', h.crimeHeadId, h.headName)}>
                    {subHeads.filter((s) => s.crimeHeadId === h.crimeHeadId).map((s) => (
                      <option key={s.crimeSubHeadId} value={s.crimeSubHeadId}>
                        {tName('crimeSubHeads', s.crimeSubHeadId, s.subHeadName)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label={t('trends.predict.field.gravity')}>
              <select className="input-dark w-full !py-2" value={profile.gravity} onChange={set('gravity')}>
                {gravities.map((g) => (
                  <option key={g.id} value={g.name}>{tName('gravities', g.id, g.name)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('trends.predict.field.hourBand')}>
              <select className="input-dark w-full !py-2" value={profile.hourBand} onChange={set('hourBand')}>
                {HOUR_BANDS.map((band) => (
                  <option key={band} value={band}>{t(`trends.predict.band.${band}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('trends.predict.field.victims')}>
              <select className="input-dark w-full !py-2" value={profile.victimCount} onChange={set('victimCount')}>
                {COUNTS.map((n) => <option key={n} value={n}>{n === 6 ? '6+' : n}</option>)}
              </select>
            </Field>
            <Field label={t('trends.predict.field.accused')}>
              <select className="input-dark w-full !py-2" value={profile.accusedCount} onChange={set('accusedCount')}>
                {COUNTS.map((n) => <option key={n} value={n}>{n === 6 ? '6+' : n}</option>)}
              </select>
            </Field>
            <Field label={t('trends.predict.field.sections')}>
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
              {t('trends.predict.field.arrest7d')}
            </label>
          </div>
          <button
            type="button"
            className="btn-primary mt-4 w-full sm:w-auto min-h-[44px] disabled:opacity-50"
            onClick={run}
            disabled={predict.isPending || lookups.isLoading}
          >
            {predict.isPending ? t('trends.predict.outcome.scoring') : t('trends.predict.outcome.run')}
          </button>
          <p className="text-[11px] text-muted mt-2">
            {t('trends.predict.outcome.note')}
          </p>
        </div>

        {/* --- probability gauge ------------------------------------------ */}
        <div className="min-h-[260px]">
          {predict.isPending ? (
            <LoadingSkeleton height={240} />
          ) : predict.error ? (
            <EmptyState
              compact
              title={t('trends.predict.outcome.failed')}
              message={predict.error.message}
              action={<button type="button" className="btn" onClick={run}>{t('common.action.retry')}</button>}
            />
          ) : !result ? (
            <EmptyState
              compact
              title={t('trends.predict.outcome.noneTitle')}
              message={t('trends.predict.outcome.noneMsg')}
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
                  {t('trends.predict.outcome.predicted', {
                    cls: result.predictedClass,
                    label: t(result.predictedClass === 'A'
                      ? 'trends.predict.outcome.detected'
                      : 'trends.predict.outcome.undetected'),
                  })}
                </Badge>
                <span title={`meta.source: ${source}`}>
                  <Badge tone={source === 'fallback-local' ? 'slate' : 'amber'}>
                    {source === 'fallback-local'
                      ? t('trends.predict.outcome.sourceFallback')
                      : t('trends.predict.outcome.sourceLive')}
                  </Badge>
                </span>
                {/* The embedded asset ships hand-set coefficients its own note calls a
                    placeholder, and its 0.78 was never produced by a training run. A teal
                    badge reading "ROC-AUC 0.78" presented that constant as a measured
                    score. When the API says it is not measured, say so instead. */}
                {result.modelAuc != null && (
                  result.modelAucMeasured === false
                    ? <Badge tone="amber">{t('trends.predict.outcome.aucIllustrative', { value: fmtNum(result.modelAuc, 2) })}</Badge>
                    : <Badge tone="teal">{t('trends.predict.outcome.auc', { value: fmtNum(result.modelAuc, 2) })}</Badge>
                )}
                {deltaPts !== null && (
                  <span title={t('trends.predict.outcome.deltaTip')}>
                    <Badge tone={Math.abs(deltaPts) < 0.05 ? 'slate' : deltaPts > 0 ? 'teal' : 'red'}>
                      {t('trends.predict.outcome.deltaBadge', {
                        delta: `${deltaPts >= 0 ? '+' : '−'}${fmtNum(Math.abs(deltaPts), 1)}`,
                      })}
                    </Badge>
                  </span>
                )}
              </div>
              {Number.isFinite(Number(probA)) && Number.isFinite(Number(probC)) && (
                <p className="text-center text-[11px] text-muted mt-2 num">
                  {t('trends.predict.outcome.classA', { p: fmtPct(Number(probA) * 100, { digits: 1, fraction: false }) })}
                  {' · '}
                  {t('trends.predict.outcome.classC', { p: fmtPct(Number(probC) * 100, { digits: 1, fraction: false }) })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {result && scoredProfile && !predict.isPending && (
        <SensitivityPanel profile={scoredProfile} baseProb={Number(result.probability)} />
      )}

      {runLog.length >= 2 && (
        <div className="mt-4 border-t border-grid/60 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-wide text-muted">{t('trends.predict.runlog.title')}</p>
            <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-[11px]" onClick={() => setRunLog([])}>
              {t('common.action.clear')}
            </button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {runLog.map((r, i) => {
              const older = runLog[i + 1];
              const delta = older ? (r.prob - older.prob) * 100 : null;
              return (
                <li
                  key={r.t.getTime()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-grid bg-canvas/60 px-2.5 py-1 text-[11px] text-muted"
                  title={t('trends.predict.runlog.scoredBy', {
                    source: t(r.source === 'fallback-local'
                      ? 'trends.predict.runlog.sourceFallback'
                      : 'trends.predict.runlog.sourceLive'),
                  })}
                >
                  <span className="num">{r.t.toLocaleTimeString('en-IN', { hour12: false })}</span>
                  <span className="num font-semibold text-ink">{fmtNum(r.prob * 100, 1)}%</span>
                  <span className={r.cls === 'A' ? 'text-teal' : 'text-signal'}>{r.cls}</span>
                  {delta !== null && <StatDelta value={delta} label="" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
