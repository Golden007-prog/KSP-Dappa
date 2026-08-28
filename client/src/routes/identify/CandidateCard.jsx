// One ranked candidate: stand-in thumbnail, the confidence figure beside the
// band word (colour + glyph + word via StatusPill — never colour alone), the
// engine that produced it, the two-signal rule, and confirm / reject with a
// required rationale. "Match" never appears without its number (rule R4).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusPill from '../../components/StatusPill.jsx';
import Badge from '../../components/Badge.jsx';
import PlainTerm from '../../components/PlainTerm.jsx';
import { API_BASE } from '../../lib/api.js';
import { fmtInt } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const BAND_STATUS = { lead: 'rising', borderline: 'watch', below: 'falling', unscored: 'nodata' };

export function ConfidenceBar({ confidence, floor, deadBand = 0.1, label }) {
  const pct = confidence === null || confidence === undefined ? 0 : Math.round(Number(confidence) * 100);
  return (
    <div className="space-y-1">
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
        className="relative h-2.5 w-full rounded-full bg-grid/60 overflow-hidden"
      >
        <div className="absolute inset-y-0 left-0 bg-primary/70" style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 bg-amber/30" style={{ left: `${Math.round((floor - deadBand) * 100)}%`, width: `${Math.round(deadBand * 100)}%` }} aria-hidden="true" />
        <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${Math.round(floor * 100)}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}

// Three states, never two: ✓ corroborated, ✕ not corroborated, — not checked
// (the case number did not resolve to one FIR, so there is nothing to test
// against and a ✕ would claim knowledge the system does not have).
function Signal({ on, label, note, unknownLabel }) {
  const glyph = on === true ? '✓' : on === false ? '✕' : '—';
  const tone = on === true ? '!border-teal/60 text-teal' : 'text-muted';
  return (
    <span className={`chip !py-0.5 text-[11px] ${tone}`} aria-label={`${label}: ${on === null || on === undefined ? unknownLabel : glyph}${note ? ` (${note})` : ''}`}>
      <span aria-hidden="true">{glyph}</span>
      {label}
      {note && <span className="opacity-70">&nbsp;({note})</span>}
    </span>
  );
}

export default function CandidateCard({ cand, floor, deadBand, searchId, decisions = [], onDecide, deciding = false }) {
  const t = useT();
  const [mode, setMode] = useState(null); // 'confirm' | 'reject'
  const [rationale, setRationale] = useState('');
  const pct = cand.confidence === null || cand.confidence === undefined ? null : Math.round(Number(cand.confidence) * 100);
  const band = cand.band || 'unscored';
  const status = BAND_STATUS[band] || 'nodata';
  // The second signal is read off the FIR the search is bound to, not off the
  // officer's own filter — a hit that only restates the filter is shown but
  // never counted (faces.js "Step 2b").
  const corr = cand.corroboration || {};
  const checked = corr.basis === 'case-record';
  const anyHit = corr.districtHit === true || corr.moHit === true;
  const verdict = !checked
    ? t('identify.cand.notChecked')
    : corr.twoSignals
      ? t('identify.cand.twoSignals')
      : band === 'lead' && anyHit && !corr.independent
        ? t('identify.cand.filterOnly')
        : band === 'lead'
          ? t('identify.cand.oneSignal')
          : t('identify.cand.noSignal');
  const decided = decisions.filter((d) => d.personKey === cand.personKey);
  const last = decided[decided.length - 1] || null;
  const canRecord = rationale.trim().length >= 10 && !deciding;

  const submit = () => {
    if (!mode || !canRecord) return;
    onDecide({ searchId, personKey: cand.personKey, decision: mode, rationale: rationale.trim(), confidence: cand.confidence, engine: cand.engine });
    setMode(null);
    setRationale('');
  };

  return (
    <li className={`rounded-xl border p-3 bg-panel ${band === 'lead' ? 'border-primary/50' : 'border-grid'}`}>
      <div className="flex gap-3">
        <img
          src={`${API_BASE}${cand.thumbUrl}`}
          alt={t('identify.cand.thumbAlt', { name: cand.name || cand.personKey })}
          width="72"
          height="72"
          loading="lazy"
          className="h-[72px] w-[72px] shrink-0 rounded-lg border border-grid bg-canvas object-cover"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="num text-[11px] text-muted">#{cand.rank}</span>
            <Link to={`/offenders/${encodeURIComponent(cand.personKey)}`} className="inline-flex min-h-[24px] items-center text-sm font-semibold text-ink hover:text-amber transition-colors truncate">
              {cand.name || cand.personKey}
            </Link>
            <span className="num text-[11px] text-muted">{cand.personKey}</span>
            <StatusPill status={status} label={t(`identify.cand.band.${band}`)} />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <PlainTerm term="faceConfidence" vars={{ floor: Math.round(floor * 100) }} className="text-[11px] text-muted" size="lg" />
            <span className="num text-base font-semibold text-ink">{pct === null ? '—' : t('identify.cand.confidenceOf', { n: pct })}</span>
            <Badge tone={cand.engine === 'zia-identity-scanner' ? 'teal' : 'slate'}>
              {cand.engine === 'zia-identity-scanner' ? t('identify.cand.engineZia') : t('identify.cand.engineLocal')}
              {cand.zia && cand.zia.matched !== null && cand.zia.matched !== undefined ? ` · matched:"${cand.zia.matched}"` : ''}
            </Badge>
          </div>
          <ConfidenceBar confidence={cand.confidence} floor={floor} deadBand={deadBand} label={`${cand.name || cand.personKey}: ${pct === null ? '—' : pct}`} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted">{t('identify.cand.signals')}:</span>
            <Signal on={band === 'lead'} label={t('identify.cand.signalFace')} unknownLabel={t('identify.cand.signalUnknown')} />
            <Signal
              on={checked ? corr.districtHit : null}
              label={t('identify.cand.signalDistrict')}
              note={corr.fromFilter && corr.fromFilter.district ? t('identify.cand.fromFilter') : null}
              unknownLabel={t('identify.cand.signalUnknown')}
            />
            <Signal
              on={checked ? corr.moHit : null}
              label={t('identify.cand.signalMo')}
              note={corr.fromFilter && corr.fromFilter.mo ? t('identify.cand.fromFilter') : null}
              unknownLabel={t('identify.cand.signalUnknown')}
            />
            <span className={`text-[11px] ${corr.twoSignals ? 'text-teal' : 'text-muted'}`}>{verdict}</span>
          </div>
          {(corr.moMatches || []).length > 0 && (
            <p className="text-[11px] text-muted num">{t('identify.cand.moMatched', { tags: corr.moMatches.join(', ') })}</p>
          )}
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
            <span>{t('identify.cand.risk', { n: fmtInt(Math.round(cand.riskScore || 0)) })}</span>
            <span>·</span>
            <span>{t('identify.cand.cases', { n: fmtInt(cand.caseCount || 0) })}</span>
            {cand.traits && cand.traits.length > 0 && (<><span>·</span><span>{cand.traits.join(', ')}</span></>)}
          </div>
          <details className="text-[11px] text-muted">
            <summary className="cursor-pointer select-none min-h-[32px] inline-flex items-center">{t('identify.cand.reasons')}</summary>
            <p className="num mt-1">{(cand.reasonCodes || []).join(' · ')}</p>
          </details>
        </div>
      </div>

      <div className="mt-2.5 border-t border-grid/60 pt-2.5">
        {last ? (
          <p className="text-xs text-ink">
            <StatusPill status={last.decision === 'confirm' ? 'stable' : 'falling'} label={t(`identify.decision.${last.decision}`)} className="mr-2" />
            {t('identify.cand.decided', { actor: last.actor })}
            <span className="block text-[11px] text-muted mt-0.5">“{last.rationale}”</span>
          </p>
        ) : mode ? (
          <div className="space-y-2">
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wide text-muted mb-1">{t('identify.cand.rationale')}</span>
              <textarea
                className="input-dark w-full min-h-[64px]"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder={t('identify.cand.rationalePh')}
                maxLength={600}
                aria-required="true"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${mode === 'confirm' ? 'btn-primary' : 'btn'} min-h-[44px]`} disabled={!canRecord} onClick={submit}>
                {t('identify.cand.record')} · {t(`identify.decision.${mode}`)}
              </button>
              <button type="button" className="btn-ghost min-h-[44px]" onClick={() => { setMode(null); setRationale(''); }}>{t('common.action.cancel')}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn min-h-[44px] hover:border-teal/60" onClick={() => setMode('confirm')} disabled={deciding}>
              ✓ {t('identify.cand.confirm')}
            </button>
            <button type="button" className="btn min-h-[44px] hover:border-signal/60" onClick={() => setMode('reject')} disabled={deciding}>
              ✕ {t('identify.cand.reject')}
            </button>
            <Link to={`/offenders/${encodeURIComponent(cand.personKey)}`} className="btn-ghost min-h-[44px] text-xs">{t('identify.cand.open')}</Link>
          </div>
        )}
      </div>
    </li>
  );
}
