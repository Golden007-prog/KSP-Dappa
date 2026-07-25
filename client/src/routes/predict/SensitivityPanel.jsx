// /predict — outcome sensitivity sweep ("what moves this prediction?").
// After a profile is scored, one tap re-scores six counterfactual variants —
// arrest flipped, gravity flipped, opposite hour band, +1 accused / victim /
// section — through the SAME live endpoint, and renders the probability deltas
// as a tornado: teal levers raise the detection probability, red levers lower
// it. Honest local explainability for a remote model: measured, not inferred.
import { useEffect, useMemo, useState } from 'react';
import { apiPost } from '../../lib/api.js';
import Badge from '../../components/Badge.jsx';
import InsightLine from '../trends/InsightLine.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtNum } from '../../lib/format.js';

const OPPOSITE_BAND = { night: 'day', day: 'night', morning: 'evening', evening: 'morning' };

/** Counterfactual levers. `t` is threaded in from the component — the patched
 *  values stay API-shaped ('Heinous', 'night'); only the labels translate. */
function buildVariants(p, t) {
  const flipGravity = p.gravity === 'Heinous' ? 'Non-Heinous' : 'Heinous';
  const flipBand = OPPOSITE_BAND[p.hourBand] || 'night';
  return [
    {
      key: 'arrest',
      label: t('trends.predict.sens.arrest', {
        value: t(p.arrestWithin7d ? 'trends.predict.sens.no' : 'trends.predict.sens.yes'),
      }),
      patch: { arrestWithin7d: !p.arrestWithin7d },
    },
    {
      key: 'gravity',
      label: t('trends.predict.sens.gravity', {
        value: t(flipGravity === 'Heinous'
          ? 'trends.predict.gravity.heinous'
          : 'trends.predict.gravity.nonHeinous'),
      }),
      patch: { gravity: flipGravity },
    },
    {
      key: 'band',
      label: t('trends.predict.sens.band', { value: t(`trends.predict.bandShort.${flipBand}`) }),
      patch: { hourBand: flipBand },
    },
    {
      key: 'accused',
      label: t('trends.predict.sens.accused', { from: p.accusedCount, to: Math.min(6, p.accusedCount + 1) }),
      patch: { accusedCount: Math.min(6, p.accusedCount + 1) },
      skip: p.accusedCount >= 6,
    },
    {
      key: 'victims',
      label: t('trends.predict.sens.victims', { from: p.victimCount, to: Math.min(6, p.victimCount + 1) }),
      patch: { victimCount: Math.min(6, p.victimCount + 1) },
      skip: p.victimCount >= 6,
    },
    {
      key: 'sections',
      label: t('trends.predict.sens.sections', { from: p.sectionCount, to: Math.min(8, p.sectionCount + 1) }),
      patch: { sectionCount: Math.min(8, p.sectionCount + 1) },
      skip: p.sectionCount >= 8,
    },
  ].filter((v) => !v.skip);
}

export default function SensitivityPanel({ profile, baseProb }) {
  const t = useT();
  const [state, setState] = useState({ status: 'idle', results: null, error: null });

  // A new scored profile invalidates the previous sweep.
  useEffect(() => {
    setState({ status: 'idle', results: null, error: null });
  }, [profile]);

  const variants = useMemo(() => (profile ? buildVariants(profile, t) : []), [profile, t]);

  const run = async () => {
    if (!profile || !variants.length) return;
    setState({ status: 'running', results: null, error: null });
    try {
      const settled = await Promise.allSettled(
        variants.map((v) => apiPost('/predict/outcome', { ...profile, ...v.patch })),
      );
      const results = variants.map((v, i) => {
        const s = settled[i];
        const prob = s.status === 'fulfilled' ? Number(s.value?.data?.probability) : NaN;
        return {
          ...v,
          deltaPts: Number.isFinite(prob) ? (prob - baseProb) * 100 : null,
        };
      }).filter((r) => r.deltaPts !== null)
        .sort((a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts));
      if (!results.length) {
        setState({ status: 'error', results: null, error: t('trends.predict.sens.allFailed') });
      } else {
        setState({ status: 'done', results, error: null });
      }
    } catch (err) {
      setState({ status: 'error', results: null, error: err?.message || t('trends.predict.sens.failed') });
    }
  };

  if (!profile) return null;
  const { status, results, error } = state;
  const maxAbs = results ? Math.max(0.1, ...results.map((r) => Math.abs(r.deltaPts))) : 1;
  const top = results?.[0];

  return (
    <div className="mt-5 border-t border-grid/60 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn !px-3 text-xs min-h-[40px]"
          onClick={run}
          disabled={status === 'running'}
        >
          {status === 'running'
            ? t('trends.predict.sens.running', { n: variants.length })
            : t('trends.predict.sens.run')}
        </button>
        <Badge tone="slate">{t('trends.predict.sens.badge', { n: variants.length })}</Badge>
      </div>

      {status === 'error' && (
        <p className="text-xs text-signal mt-2">{error}</p>
      )}

      {status === 'done' && results && (
        <>
          <ul className="mt-3 space-y-1.5" aria-label={t('trends.predict.sens.aria')}>
            {results.map((r) => {
              const up = r.deltaPts >= 0;
              const width = Math.max(4, (Math.abs(r.deltaPts) / maxAbs) * 100);
              return (
                <li key={r.key} className="flex items-center gap-2">
                  <span className="text-xs text-ink w-44 sm:w-56 shrink-0 truncate" title={r.label}>{r.label}</span>
                  <span className="flex-1 h-2 rounded-full bg-grid/60 overflow-hidden" aria-hidden="true">
                    <span
                      className={`block h-full rounded-full ${up ? 'bg-teal' : 'bg-signal'}`}
                      style={{ width: `${width}%` }}
                    />
                  </span>
                  <span className={`num text-xs font-semibold w-16 text-right shrink-0 ${up ? 'text-teal' : 'text-signal'}`}>
                    {up ? '+' : '−'}{fmtNum(Math.abs(r.deltaPts), 1)} {t('trends.predict.sens.pts')}
                  </span>
                </li>
              );
            })}
          </ul>
          {top && (
            <div className="mt-2.5">
              <InsightLine
                text={t('trends.predict.sens.insight', {
                  lever: top.label.toLowerCase(),
                  delta: `${top.deltaPts >= 0 ? '+' : '−'}${fmtNum(Math.abs(top.deltaPts), 1)}`,
                })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
