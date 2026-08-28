// /alerts/digest — the printable action-loop digest: open alerts, decisions
// recorded in the window, what happened (precision, time-to-acknowledge),
// the alerts nobody touched and the highest-risk stations, rendered from the
// same GET /alerts/digest JSON that POST /alerts/digest/send hands to
// Catalyst Mail. Until a console-verified sender exists (a Gmail MAIL_FROM
// cannot be verified — docs/CATALYST_SERVICE_RESEARCH.md §4.11) this page IS
// the digest: print it, or read the JSON.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/Card.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PlainSentence from '../components/PlainSentence.jsx';
import ProvenanceStamp from '../components/ProvenanceStamp.jsx';
import ReadPageButton from '../components/ReadPageButton.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { API_BASE } from '../lib/api.js';
import { fmtInt, fmtNum } from '../lib/format.js';
import { useI18n, useNames } from '../lib/i18n.jsx';
import { statusFromZ } from '../lib/status.js';
import { useActionDigest } from './alerts/actionsApi.js';
import { stamp, describeAction } from './alerts/ActionTimeline.jsx';

const TOKEN_KEY = 'dappa-admin-token';
const SEV_WORD = { 3: 'critical', 2: 'high', 1: 'medium', 0: 'low' };

function pct100(v) {
  return v === null || v === undefined ? '—' : String(Math.round(Number(v) * 100));
}

export default function AlertsDigest() {
  const { t, lang } = useI18n();
  const tName = useNames();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const days = Math.max(1, Math.min(365, Number(params.get('days')) || 7));
  const unit = params.get('unit') || '';
  const [unitDraft, setUnitDraft] = useState(unit);
  const [daysDraft, setDaysDraft] = useState(String(days));
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const q = useActionDigest({ days, unit: unit || undefined });
  const d = q.data;

  const apply = (e) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (unitDraft.trim()) next.set('unit', unitDraft.trim()); else next.delete('unit');
    next.set('days', String(Math.max(1, Math.min(365, Number(daysDraft) || 7))));
    setParams(next, { replace: true });
  };

  const send = async () => {
    setSending(true);
    try {
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
      const res = await fetch(`${API_BASE}/alerts/digest/send`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'X-Admin-Token': token } : {}),
        body: JSON.stringify({ days, unit: unit || undefined }),
      });
      const json = await res.json().catch(() => null);
      if (!json || json.ok !== true) {
        const code = json?.error?.code || `HTTP_${res.status}`;
        if (res.status === 403 || code === 'AUTH_REQUIRED') toast.info(t('actions.digest.sendReadOnly'));
        else toast.error(t('actions.toast.failed', { msg: json?.error?.message || code }));
        return;
      }
      setSendResult(json.data);
      if (json.data.sent) toast.success(t('actions.digest.sent', { n: (json.data.to || []).length }));
      else toast.info(t('actions.digest.notSent', { mode: json.data.mode }));
    } catch (err) {
      toast.error(t('actions.toast.failed', { msg: err?.message || '' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <div id="alerts-digest" className="mx-auto max-w-[900px] space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="page-title">{t('actions.digest.title')}</h1>
          <p className="page-subtitle">{t('actions.digest.subtitle')}</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <ReadPageButton targetId="alerts-digest" />
          <button type="button" className="btn !text-xs min-h-[44px] sm:min-h-[36px]" onClick={() => window.print()}>{t('common.action.print')}</button>
          <Link to="/alerts" className="btn !text-xs min-h-[44px] sm:min-h-[36px]">{t('common.nav.alerts')}</Link>
        </div>
      </div>

      <form onSubmit={apply} className="no-print flex flex-wrap items-end gap-2">
        <label className="min-w-[8rem]">
          <span className="mb-0.5 block text-[11px] text-muted">{t('actions.digest.days')}</span>
          <input className="input-dark w-full !py-2 !text-xs" type="number" min="1" max="365" value={daysDraft} onChange={(e) => setDaysDraft(e.target.value)} />
        </label>
        <label className="min-w-[10rem] flex-1">
          <span className="mb-0.5 block text-[11px] text-muted">{t('actions.digest.unit')}</span>
          <input className="input-dark w-full !py-2 !text-xs" value={unitDraft} placeholder="0101 / 1011" onChange={(e) => setUnitDraft(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary !text-xs min-h-[44px] sm:min-h-[36px]">{t('common.action.apply')}</button>
      </form>

      <p className="text-[11px] italic leading-snug text-muted">{t('actions.framing')}</p>

      {q.isLoading ? (
        <Card><LoadingSkeleton lines={6} /></Card>
      ) : q.error ? (
        <Card><EmptyState title={t('actions.digest.error')} message={q.error.message} action={<button type="button" className="btn" onClick={() => q.refetch()}>{t('common.action.retry')}</button>} /></Card>
      ) : d && (
        <div className="space-y-4" data-readable="true">
          <Card>
            <h2 className="text-base font-semibold text-ink">{d.subject}</h2>
            <p className="num mt-1 text-[11px] text-muted">
              {t('actions.digest.generated', { when: stamp(d.generatedAt, lang), source: t(`actions.timeline.source.${d.storage || 'memory'}`) })}
              {' · '}{d.scope?.scopeName}
            </p>
            <ProvenanceStamp provenance={{ asOn: d.generatedAt, window: `${days}d`, method: 'ActionLog + AnomalyAlert (GET /alerts/digest)', provisional: true }} />
          </Card>

          <Card title={t('actions.digest.h.open')}>
            {d.alerts.length === 0 ? (
              <p className="text-xs text-muted">{t('actions.digest.noOpen')}</p>
            ) : (
              <ul className="space-y-1">
                {d.alerts.map((a) => (
                  <li key={a.alertId} className="flex items-start gap-2 rounded-lg border border-grid/60 px-2 py-1.5 text-xs">
                    <StatusPill status={statusFromZ(a.zScore)} label={t(`alerts.sevLower.${SEV_WORD[a.severity] || 'unrated'}`)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink">{a.alertId} · {tName('crimeHeads', null, a.headName) || a.headName} — {a.districtName}</span>
                      {a.narrative && <span className="block text-muted">{a.narrative}</span>}
                    </span>
                    <span className="num shrink-0 text-[11px] text-muted">z {fmtNum(a.zScore, 1)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('actions.digest.h.actions')}>
            <p className="text-xs text-ink">
              {t('actions.digest.decisionsLine', {
                decisions: fmtInt(d.actions.decisions), days,
                ack: fmtInt(d.actions.byType.acknowledge || 0), assign: fmtInt(d.actions.byType.assign || 0),
                esc: fmtInt(d.actions.byType.escalate || 0), dis: fmtInt(d.actions.byType.dismiss || 0),
                out: fmtInt(d.actions.byType.outcome || 0), note: fmtInt(d.actions.byType.note || 0),
              })}
            </p>
            {d.actions.recent.length > 0 && (
              <ul className="mt-2 space-y-1">
                {d.actions.recent.slice(0, 12).map((x) => (
                  <li key={x.actionId} className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="num text-muted">{stamp(x.ts ?? x.clientTs, lang)}</span>
                    <span className="text-ink">{x.alertKey || x.subjectKey}</span>
                    <span className="text-muted">{describeAction(x, t)} · {x.actor}{x.seeded ? ` (${t('actions.timeline.seeded')})` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('actions.digest.h.outcomes')}>
            <div className="space-y-2">
              {d.outcomes.labelled ? (
                <PlainSentence term="precision" vars={{ tp: fmtInt(d.outcomes.truePositive), n: fmtInt(d.outcomes.labelled), pct: pct100(d.outcomes.precision), lo: pct100(d.outcomes.precisionInterval?.lo), hi: pct100(d.outcomes.precisionInterval?.hi) }} />
              ) : <p className="text-[13px] text-ink">{t('actions.panel.precision.none')}</p>}
              {d.outcomes.medianTimeToAckHours !== null && d.outcomes.medianTimeToAckHours !== undefined && (
                <PlainSentence term="timeToAck" vars={{ h: fmtNum(d.outcomes.medianTimeToAckHours, 1) }} />
              )}
              <p className="text-xs text-muted">
                {t('actions.panel.labels.sentence', { n: fmtInt(d.labels.labelled || 0), min: d.labels.minimumPerClass, total: d.labels.minimumTotal })}
              </p>
            </div>
          </Card>

          <Card title={t('actions.digest.h.untouched')}>
            {d.untouched.length === 0 ? (
              <p className="text-xs text-muted">{t('actions.panel.untouched.empty')}</p>
            ) : (
              <ul className="space-y-1">
                {d.untouched.map((u) => (
                  <li key={u.alertId} className="flex items-center gap-2 text-xs">
                    <StatusPill status={statusFromZ(u.zScore)} label={t(`alerts.sevLower.${u.severityWord}`)} />
                    <span className="min-w-0 flex-1 truncate text-ink">{u.alertId} · {u.headName} — {u.districtName || u.districtId}</span>
                    <span className={`num shrink-0 ${u.pastSla ? 'text-signal' : 'text-muted'}`}>{t('actions.panel.untouched.age', { d: fmtNum(u.ageHours / 24, 1), h: u.slaHours })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {d.topRisk.length > 0 && (
            <Card title={t('actions.digest.h.risk')}>
              <ul className="space-y-1">
                {d.topRisk.map((r) => (
                  <li key={r.unitId} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-ink">{r.unitName}</span>
                    <span className="num text-muted">{t('actions.digest.risk', { n: fmtNum(r.riskScore, 1) })}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={t('actions.digest.h.text')} className="no-print">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-grid bg-base/60 p-3 text-[11px] leading-relaxed text-muted">{d.text}</pre>
          </Card>

          <Card className="no-print">
            <p className="text-xs text-muted">{t('actions.digest.mailNote')}</p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-[10rem] flex-1">
                <span className="mb-0.5 block text-[11px] text-muted">{t('actions.digest.token')}</span>
                <input className="input-dark w-full !py-2 !text-xs" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
              </label>
              <button type="button" className="btn-primary !text-xs min-h-[44px] sm:min-h-[36px]" disabled={sending} onClick={send}>
                {sending ? t('actions.digest.sending') : t('actions.digest.send')}
              </button>
            </div>
            {sendResult && (
              <p className="mt-2 text-xs text-muted">
                {sendResult.sent ? t('actions.digest.sent', { n: (sendResult.to || []).length }) : t('actions.digest.notSent', { mode: sendResult.mode })}
                {sendResult.note ? ` ${sendResult.note}` : ''}
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
