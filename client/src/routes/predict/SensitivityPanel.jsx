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
import { fmtNum } from '../../lib/format.js';

const OPPOSITE_BAND = { night: 'day', day: 'night', morning: 'evening', evening: 'morning' };
const BAND_LABEL = { night: 'night', day: 'afternoon', morning: 'morning', evening: 'evening' };

function buildVariants(p) {
  const flipGravity = p.gravity === 'Heinous' ? 'Non-Heinous' : 'Heinous';
  const flipBand = OPPOSITE_BAND[p.hourBand] || 'night';
  return [
    {
      key: 'arrest',
      label: `Arrest within 7 days → ${p.arrestWithin7d ? 'no' : 'yes'}`,
      patch: { arrestWithin7d: !p.arrestWithin7d },
    },
    {
      key: 'gravity',
      label: `Gravity → ${flipGravity}`,
      patch: { gravity: flipGravity },
    },
    {
      key: 'band',
      label: `Hour band → ${BAND_LABEL[flipBand] || flipBand}`,
      patch: { hourBand: flipBand },
    },
    {
      key: 'accused',
      label: `Accused ${p.accusedCount} → ${Math.min(6, p.accusedCount + 1)}`,
      patch: { accusedCount: Math.min(6, p.accusedCount + 1) },
      skip: p.accusedCount >= 6,
    },
    {
      key: 'victims',
      label: `Victims ${p.victimCount} → ${Math.min(6, p.victimCount + 1)}`,
      patch: { victimCount: Math.min(6, p.victimCount + 1) },
      skip: p.victimCount >= 6,
    },
    {
      key: 'sections',
      label: `Sections ${p.sectionCount} → ${Math.min(8, p.sectionCount + 1)}`,
      patch: { sectionCount: Math.min(8, p.sectionCount + 1) },
      skip: p.sectionCount >= 8,
    },
  ].filter((v) => !v.skip);
}

export default function SensitivityPanel({ profile, baseProb }) {
  const [state, setState] = useState({ status: 'idle', results: null, error: null });

  // A new scored profile invalidates the previous sweep.
  useEffect(() => {
    setState({ status: 'idle', results: null, error: null });
  }, [profile]);

  const variants = useMemo(() => (profile ? buildVariants(profile) : []), [profile]);

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
        setState({ status: 'error', results: null, error: 'Every counterfactual scoring call failed — is the API up?' });
      } else {
        setState({ status: 'done', results, error: null });
      }
    } catch (err) {
      setState({ status: 'error', results: null, error: err?.message || 'Sweep failed.' });
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
          {status === 'running' ? 'Re-scoring 6 variants…' : 'Explain drivers — what-if sweep'}
        </button>
        <Badge tone="slate">{variants.length} counterfactual rescorings · same model</Badge>
      </div>

      {status === 'error' && (
        <p className="text-xs text-signal mt-2">{error}</p>
      )}

      {status === 'done' && results && (
        <>
          <ul className="mt-3 space-y-1.5" aria-label="Sensitivity of the detection probability to each lever">
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
                    {up ? '+' : '−'}{fmtNum(Math.abs(r.deltaPts), 1)} pts
                  </span>
                </li>
              );
            })}
          </ul>
          {top && (
            <div className="mt-2.5">
              <InsightLine
                text={`Biggest lever for this profile: ${top.label.toLowerCase()} moves the detection probability by ${top.deltaPts >= 0 ? '+' : '−'}${fmtNum(Math.abs(top.deltaPts), 1)} points. Deltas are measured by actually re-scoring, one change at a time.`}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
