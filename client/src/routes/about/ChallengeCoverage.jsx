// /about — challenge-coverage matrix.
//
// The six scored capability areas keep their trilingual titles and summaries
// from the copilot namespace (they were written for this page and are already
// translated). What is new is the evidence layered on top, straight from
// GET /meta/challenge: the highlights the backend claims for each area, the
// exact endpoints that back it, and the Catalyst services those endpoints use.
// If the API is unreachable the section degrades to the translated text alone
// rather than showing an empty shell.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import { useT } from '../../lib/i18n.jsx';
import { CodeChip, Chevron } from './bits.jsx';

const VISIBLE_ENDPOINTS = 4;

function Capability({ item, live }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const endpoints = live ? live.endpoints : [];
  const shown = open ? endpoints : endpoints.slice(0, VISIBLE_ENDPOINTS);
  const bodyId = `cap-body-${item.n}`;

  return (
    <div className="rounded-lg border border-grid bg-base/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full border border-amber/40 text-[11px] font-bold text-amber">
          {item.n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-xs font-semibold text-ink">{t(`copilot.about.challenge.c${item.n}.name`)}</p>
            <Badge tone={live && live.status === 'covered' ? 'teal' : 'slate'}>
              {t(live && live.status === 'covered' ? 'about.challenge.covered' : 'copilot.about.challenge.live')}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{t(`copilot.about.challenge.c${item.n}.desc`)}</p>

          {live && live.highlights.length > 0 && (
            <ul className="mt-2 space-y-1 list-none">
              {live.highlights.map((h) => (
                <li key={h} className="flex gap-1.5 text-[11px] leading-relaxed text-ink/80">
                  <span className="text-teal shrink-0" aria-hidden="true">·</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.areas.map(([navKey, to]) => (
              <Link
                key={`${item.n}-${to}-${navKey}`}
                to={to}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 text-[11px] text-primary transition-colors hover:border-primary hover:bg-primary/10"
              >
                {t(`common.nav.${navKey}`)}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m0 0-5-5m5 5-5 5" /></svg>
              </Link>
            ))}
          </div>

          {live && (
            <div className="mt-2 space-y-1.5 border-t border-grid/60 pt-2">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-0.5 text-[10px] uppercase tracking-wider text-muted">{t('about.challenge.endpoints')}</span>
                {shown.map((e) => <CodeChip key={e}>{e}</CodeChip>)}
                {endpoints.length > VISIBLE_ENDPOINTS && (
                  <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls={bodyId}
                    className="inline-flex min-h-[28px] items-center gap-1 rounded border border-grid px-1.5 text-[10px] text-muted transition-colors hover:text-ink hover:border-primary/50"
                  >
                    {open ? t('about.challenge.showLess') : t('about.challenge.showMore', { n: endpoints.length - VISIBLE_ENDPOINTS })}
                    <Chevron open={open} />
                  </button>
                )}
              </div>
              <div id={bodyId} className="flex flex-wrap items-center gap-1">
                <span className="mr-0.5 text-[10px] uppercase tracking-wider text-muted">{t('about.challenge.services')}</span>
                {live.services.map((s) => <CodeChip key={s} tone="teal">{s}</CodeChip>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChallengeCoverage({ items, query }) {
  const t = useT();
  const d = query.data;
  return (
    <Card
      title={t('copilot.about.challenge.title')}
      subtitle={t('copilot.about.challenge.subtitle')}
      actions={(
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="teal">{t('copilot.about.challenge.badge')}</Badge>
          {d && d.distinctEndpoints !== null && (
            <Badge tone="slate">{t('about.challenge.endpointCount', { n: d.distinctEndpoints })}</Badge>
          )}
        </div>
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-2.5">
        {items.map((item) => (
          <Capability key={item.n} item={item} live={d ? d.byId.get(item.n) || null : null} />
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">{t('copilot.about.challenge.note')}</p>
      {d && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          {t('about.challenge.evidence', { covered: d.covered, total: d.total, endpoints: d.distinctEndpoints === null ? '—' : d.distinctEndpoints })}
        </p>
      )}
      {query.error && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber">{t('about.challenge.offline')}</p>
      )}
    </Card>
  );
}
