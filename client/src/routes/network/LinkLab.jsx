// Link-analysis depth for the Network Explorer: ranked multi-hop routes,
// temporal edge evolution, and a switchable / cross-checked link-prediction
// board whose rows are explicitly suggestions for review, not assertions.
import { useEffect, useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { communityColor } from './graphUtils.js';
import { kShortestPaths, edgeTimeline, predictLinksBy, consensusPredictions, PREDICT_METHODS } from './pathAnalysis.js';
import { readPref, writePref } from './hooks.js';

const REVIEW_PREF = 'dappa-net-reviewed';

/** Locally-remembered review decisions on predicted links ('ok' | 'no'). */
function useReviewLog() {
  const [log, setLog] = useState(() => {
    try {
      const raw = readPref(REVIEW_PREF, '');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  const mark = (key, verdict) => {
    setLog((prev) => {
      const next = { ...prev };
      if (!verdict || next[key] === verdict) delete next[key];
      else next[key] = verdict;
      writePref(REVIEW_PREF, JSON.stringify(next));
      return next;
    });
  };
  const clear = () => { setLog({}); writePref(REVIEW_PREF, '{}'); };
  return { log, mark, clear };
}

// ── ranked multi-hop routes ──────────────────────────────────────────────────

export function MultiHopPanel({ edges, nodesById, a, b, mode = 'hops', onSelectRoute, onSelectNode, activeRank = 0 }) {
  const t = useT();
  const [k, setK] = useState(4);
  const routes = useMemo(
    () => (a && b ? kShortestPaths(edges, a, b, { k, mode }) : []),
    [edges, a, b, k, mode],
  );
  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);

  // A filter change can invalidate the highlighted route — clear it rather than
  // leave the canvas emphasising elements that are no longer drawn.
  useEffect(() => {
    if (activeRank && !routes.some((r) => r.rank === activeRank)) onSelectRoute?.(null);
  }, [routes, activeRank, onSelectRoute]);

  return (
    <Card
      title={t('network.hop.title')}
      subtitle={t('network.hop.subtitle')}
      padded={false}
      actions={(
        <SegmentedControl
          ariaLabel={t('network.hop.kAria')}
          value={String(k)}
          onChange={(v) => setK(Number(v))}
          options={[2, 4, 6].map((n) => ({ value: String(n), label: t('network.hop.kOption', { n }) }))}
        />
      )}
    >
      {!a || !b ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.hop.pickTitle')} message={t('network.hop.pickMsg')} />
        </div>
      ) : routes.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.hop.noneTitle')} message={t('network.hop.noneMsg')} />
        </div>
      ) : (
        <>
          <ol className="divide-y divide-grid/50 max-h-[22rem] overflow-y-auto">
            {routes.map((r) => {
              const active = activeRank === r.rank;
              return (
                <li key={r.path.join('>')}>
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2.5 min-h-[56px] transition-colors ${active ? 'bg-grid/40' : 'hover:bg-grid/30'}`}
                    onClick={() => onSelectRoute?.(active ? null : r)}
                    aria-pressed={active}
                    title={t('network.hop.rowHint')}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={r.rank === 1 ? 'amber' : 'slate'}>{t('network.hop.route', { n: r.rank })}</Badge>
                      <Badge tone="teal">{t(r.hops === 1 ? 'network.path.hops.one' : 'network.path.hops.other', { n: fmtInt(r.hops) })}</Badge>
                      {r.strength > 0 && (
                        <span className="num text-[10px] text-muted">{t('network.hop.strength', { n: fmtInt(r.strength) })}</span>
                      )}
                      {r.minLink > 0 && (
                        <Tooltip label={t('network.hop.weakestHint')}>
                          <span className={`num text-[10px] ${r.minLink === 1 ? 'text-signal' : 'text-muted'}`}>
                            {t('network.hop.weakest', { n: fmtInt(r.minLink) })}
                          </span>
                        </Tooltip>
                      )}
                      {r.rank > 1 && r.distinct > 0 && (
                        <Tooltip label={t('network.hop.distinctHint')}>
                          <span className="num text-[10px] text-amber ml-auto">
                            {t(r.distinct === 1 ? 'network.hop.distinct.one' : 'network.hop.distinct.other', { n: fmtInt(r.distinct) })}
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-[11px] leading-5 mt-1">
                      {r.path.map((id, i) => (
                        <span key={id}>
                          {i > 0 && <span className="text-amber"> → </span>}
                          <span
                            role="link"
                            tabIndex={0}
                            className="text-ink hover:text-amber underline-offset-2 hover:underline cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); onSelectNode?.(id); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onSelectNode?.(id); } }}
                          >
                            {nameOf(id)}
                          </span>
                        </span>
                      ))}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t(mode === 'strength' ? 'network.hop.footnoteStrength' : 'network.hop.footnote')}
          </p>
        </>
      )}
    </Card>
  );
}

// ── temporal link evolution ──────────────────────────────────────────────────

export function TemporalPanel({ edges, dateByCase, activePeriod = '', onPickPeriod }) {
  const t = useT();
  const [grain, setGrain] = useState('year');
  const tl = useMemo(() => edgeTimeline(edges, dateByCase, { grain }), [edges, dateByCase, grain]);
  const max = Math.max(1, ...tl.periods.map((p) => tl.counts.get(p)?.edges || 0));

  return (
    <Card
      title={t('network.time.title')}
      subtitle={t('network.time.subtitle')}
      actions={(
        <SegmentedControl
          ariaLabel={t('network.time.grainAria')}
          value={grain}
          onChange={setGrain}
          options={[
            { value: 'year', label: t('network.time.year') },
            { value: 'quarter', label: t('network.time.quarter') },
          ]}
        />
      )}
    >
      {tl.periods.length === 0 ? (
        <EmptyState compact title={t('network.time.emptyTitle')} message={t('network.time.emptyMsg')} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={tl.coverage >= 0.25 ? 'teal' : 'slate'}>
              {t('network.time.coverage', {
                n: fmtInt(tl.datedEdges),
                total: fmtInt(tl.totalEdges),
                pct: fmtPct(tl.coverage * 100, { digits: 1 }),
              })}
            </Badge>
            {activePeriod && (
              <button type="button" className="btn-ghost !py-1 !px-2 text-[11px] min-h-[36px]" onClick={() => onPickPeriod?.('')}>
                {t('network.time.clear')}
              </button>
            )}
          </div>
          <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
            {tl.periods.map((p) => {
              const c = tl.counts.get(p) || { edges: 0, newEdges: 0 };
              const on = activePeriod === p;
              return (
                <button
                  key={p}
                  type="button"
                  className="flex flex-col items-center gap-1 min-w-[2.75rem] shrink-0 group"
                  onClick={() => onPickPeriod?.(on ? '' : p)}
                  aria-pressed={on}
                  title={t('network.time.barTitle', { p, n: fmtInt(c.edges), nw: fmtInt(c.newEdges) })}
                >
                  <span className="num text-[10px] text-muted">{fmtInt(c.edges)}</span>
                  <span
                    className={`w-full rounded-sm transition-colors ${on ? 'bg-amber' : 'bg-amber/45 group-hover:bg-amber/70'}`}
                    style={{ height: `${6 + Math.round((c.edges / max) * 46)}px` }}
                  />
                  <span className={`text-[10px] num ${on ? 'text-amber' : 'text-muted'}`}>{p}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted leading-4">{t('network.time.footnote')}</p>
        </div>
      )}
    </Card>
  );
}

// ── prediction lab ───────────────────────────────────────────────────────────

export function PredictionLab({ edges, nodesById, activeKey = '', onInspect }) {
  const t = useT();
  const [method, setMethod] = useState('adamic');
  const { log, mark, clear } = useReviewLog();

  const single = useMemo(() => predictLinksBy(edges, { method, limit: 20 }), [edges, method]);
  const consensus = useMemo(() => consensusPredictions(edges, { limit: 20 }), [edges]);
  const agreeBy = useMemo(() => {
    const m = new Map();
    for (const r of consensus) m.set(`${r.a}~~${r.b}`, r.methods.length);
    return m;
  }, [consensus]);

  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);
  const reviewed = Object.keys(log).length;

  return (
    <Card
      title={t('network.lab.title')}
      subtitle={t('network.lab.subtitle')}
      padded={false}
      actions={(
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <SegmentedControl
            ariaLabel={t('network.lab.methodAria')}
            value={method}
            onChange={setMethod}
            options={PREDICT_METHODS.map((m) => ({ value: m, label: t(`network.lab.method.${m}`) }))}
          />
          {reviewed > 0 && (
            <button type="button" className="btn-ghost !py-1 !px-2 text-[11px] min-h-[36px]" onClick={clear}>
              {t('network.lab.clearReview', { n: fmtInt(reviewed) })}
            </button>
          )}
        </div>
      )}
    >
      <p className="px-4 py-2 text-[11px] text-muted border-b border-grid/60 leading-5">
        {t(`network.lab.methodHint.${method}`)}
      </p>
      {single.rows.length === 0 ? (
        <div className="px-4 py-3">
          <EmptyState compact title={t('network.lab.emptyTitle')} message={t('network.lab.emptyMsg')} />
        </div>
      ) : (
        <>
          <ol className="divide-y divide-grid/50 max-h-[24rem] overflow-y-auto">
            {single.rows.map((r) => {
              const key = `${r.a}~~${r.b}`;
              const active = activeKey === key;
              const agree = agreeBy.get(key) || 1;
              const verdict = log[key];
              return (
                <li key={key} className={`px-4 py-2 ${active ? 'bg-grid/40' : ''} ${verdict === 'no' ? 'opacity-55' : ''}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 min-w-0 text-left flex-1"
                      onClick={() => onInspect?.(r)}
                      title={t('network.lab.inspectHint')}
                    >
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(nodesById.get(String(r.a))?.communityId) }} aria-hidden="true" />
                      <span className="text-xs text-ink truncate min-w-0">{nameOf(r.a)}</span>
                      <span className="text-muted text-[11px] shrink-0">⋯</span>
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: communityColor(nodesById.get(String(r.b))?.communityId) }} aria-hidden="true" />
                      <span className="text-xs text-ink truncate min-w-0">{nameOf(r.b)}</span>
                    </button>
                    <span className="num text-[11px] text-amber shrink-0">
                      {method === 'pref' || method === 'common' ? fmtInt(r.score) : fmtNum(r.score, method === 'jaccard' ? 3 : 2)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Tooltip label={t('network.lab.agreeHint')}>
                      <Badge tone={agree >= 3 ? 'teal' : agree === 2 ? 'amber' : 'slate'}>
                        {t('network.lab.agree', { n: fmtInt(agree), total: fmtInt(PREDICT_METHODS.length) })}
                      </Badge>
                    </Tooltip>
                    <span className="text-[10px] text-muted truncate min-w-0">
                      {t(r.common === 1 ? 'network.predict.common.one' : 'network.predict.common.other', { n: fmtInt(r.common) })}
                      {r.via.length > 0 && <> · {r.via.slice(0, 2).map(nameOf).join(', ')}</>}
                    </span>
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className={`chip !py-0.5 !px-2 text-[10px] min-h-[32px] ${verdict === 'ok' ? '!border-teal text-teal' : ''}`}
                        onClick={() => mark(key, 'ok')}
                        aria-pressed={verdict === 'ok'}
                        title={t('network.lab.keepHint')}
                      >
                        {t('network.lab.keep')}
                      </button>
                      <button
                        type="button"
                        className={`chip !py-0.5 !px-2 text-[10px] min-h-[32px] ${verdict === 'no' ? '!border-signal text-signal' : ''}`}
                        onClick={() => mark(key, 'no')}
                        aria-pressed={verdict === 'no'}
                        title={t('network.lab.dismissHint')}
                      >
                        {t('network.lab.dismiss')}
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="px-4 py-2 border-t border-grid/60 text-[10px] text-muted leading-4">
            {t('network.lab.footnote')}
            {single.truncated && <> · {t('network.predict.bounded')}</>}
          </p>
        </>
      )}
    </Card>
  );
}
