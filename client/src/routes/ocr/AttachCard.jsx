// "Attach to case" — writes ONE ActionLog audit row through POST /ocr/attach
// (admin), never CaseMaster. The public demo is read-only, so the card carries
// the documented demo token flow (X-Admin-Token, kept per tab) and the
// embedded Catalyst sign-in behind FEATURE_AUTH_EMBED.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmbeddedSignIn from '../../components/EmbeddedSignIn.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useT } from '../../lib/i18n.jsx';
import { dateLabel } from '../../lib/format.js';
import { useAttach, useAttachments, readToken, writeToken } from './useOcr.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));

export default function AttachCard({ result, meta, moderation, sampleId, language }) {
  const t = useT();
  const toast = useToast();
  const [caseId, setCaseId] = useState('1');
  const [note, setNote] = useState('');
  const [token, setToken] = useState(readToken);
  const [tokenDraft, setTokenDraft] = useState('');
  const attach = useAttach();
  const history = useAttachments(caseId);

  useEffect(() => { writeToken(token); }, [token]);

  const canAttach = Boolean(result && str(result.text).trim()) && /^\d{1,10}$/.test(caseId);

  const submit = async (e) => {
    e.preventDefault();
    if (!canAttach) return;
    try {
      const out = await attach.mutateAsync({
        token,
        body: {
          caseId,
          text: str(result.text),
          confidence: result.confidence,
          language: language || result.language,
          moTags: result.moTags || [],
          entities: result.entities || [],
          source: meta && meta.source,
          moderation: moderation ? { verdict: moderation.verdict, source: moderation.source } : null,
          sampleId: sampleId || null,
          note: note || undefined,
        },
      });
      const storage = str(out.data && out.data.storage);
      toast.success(t('surfaces.attach.done', { id: caseId, storage: t(storage === 'datastore' ? 'surfaces.attach.storage.datastore' : 'surfaces.attach.storage.memory') }));
      history.refetch();
    } catch (err) {
      if (err && err.status === 403) toast.error(t('surfaces.attach.needsAuth'));
      else toast.error(`${t('surfaces.attach.failed')}: ${err && err.message ? err.message : ''}`);
    }
  };

  return (
    <Card title={t('surfaces.attach.title')} subtitle={t('surfaces.attach.sub')}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-xs text-muted">
            {t('surfaces.attach.caseId')}
            <input
              className="input-dark mt-1 w-full min-h-[44px] num"
              inputMode="numeric"
              pattern="[0-9]*"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value.replace(/[^0-9]/g, ''))}
              aria-describedby="attach-caseid-hint"
            />
            <span id="attach-caseid-hint" className="text-[10px]">{t('surfaces.attach.caseIdHint')}</span>
          </label>
          <label className="block text-xs text-muted">
            {t('surfaces.attach.note')}
            <input className="input-dark mt-1 w-full min-h-[44px]" value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} />
          </label>
        </div>

        {token ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="teal">{t('surfaces.attach.signedIn')}</Badge>
            <button type="button" className="btn-ghost min-h-[44px]" onClick={() => { setToken(''); setTokenDraft(''); }}>{t('surfaces.attach.signOut')}</button>
          </div>
        ) : (
          <div className="rounded-lg border border-amber/40 bg-amber/5 p-3">
            <p className="text-xs text-ink">{t('surfaces.attach.needsAuth')}</p>
            <label className="mt-2 block text-xs text-muted">
              {t('surfaces.attach.demoToken')}
              <span className="mt-1 flex gap-2">
                <input className="input-dark w-full min-h-[44px]" type="password" autoComplete="off" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} aria-describedby="attach-token-hint" />
                <button type="button" className="btn min-h-[44px]" onClick={() => { if (tokenDraft.trim()) setToken(tokenDraft.trim()); }}>{t('surfaces.attach.signIn')}</button>
              </span>
              <span id="attach-token-hint" className="text-[10px]">{t('surfaces.attach.demoTokenHint')}</span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary min-h-[44px]" disabled={!canAttach || attach.isPending}>
            {attach.isPending ? t('surfaces.attach.attaching') : t('surfaces.attach.button')}
          </button>
          {/^\d{1,10}$/.test(caseId) && <Link to={`/cases/${caseId}`} className="btn min-h-[44px]">{t('surfaces.attach.openCase', { id: caseId })}</Link>}
        </div>
      </form>

      <div className="mt-4 border-t border-grid/60 pt-3">
        <p className="eyebrow mb-1.5">{t('surfaces.attach.recent')}</p>
        {history.data && history.data.rows.length ? (
          <ul className="space-y-1.5">
            {history.data.rows.slice(0, 5).map((r) => (
              <li key={r.rowid || r.clientTs} className="text-xs text-muted flex flex-wrap gap-x-2">
                <span className="num">{dateLabel(r.clientTs || r.createdAt)}</span>
                <span className="text-ink">{str(r.actor)}</span>
                <span className="font-mono">{(r.payload && r.payload.moTags ? r.payload.moTags : []).join(' ')}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted">{t('surfaces.attach.recentEmpty')}</p>}
      </div>

      <EmbeddedSignIn className="mt-4" />
    </Card>
  );
}
