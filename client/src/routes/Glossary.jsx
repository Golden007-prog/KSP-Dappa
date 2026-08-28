// /glossary — the officer glossary (backlog rows 15, 16): the 19 worked terms
// of lib/plainlanguage.js side by side in English and Kannada — label →
// sentence → example → technical term — with each Kannada wording's
// verification status, and the KPI dictionary in the SCRB's idiom (CCS-17
// disposal states, the Crime Review heads, rates and registers). GIGW's
// "list of abbreviations or a glossary" and WCAG 3.2.6 self-help.
import { useMemo, useState } from 'react';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import { GLOSSARY, TERM_KEYS } from '../lib/plainlanguage.js';
import { useI18n } from '../lib/i18n.jsx';
import { DISPOSAL_STATES, REVIEW_HEADS, METRICS } from './tiers/kpiDictionary.js';
import { TierHeader } from './tiers/bits.jsx';

const STATUS_TONE = { 'kn-V': 'teal', repo: 'neutral', unv: 'amber', ok: 'teal' };

function Col({ lang, entry, t }) {
  return (
    <div lang={lang} className="min-w-0 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{lang === 'kn' ? 'ಕನ್ನಡ' : 'English'}</p>
      <p className="text-sm font-semibold text-ink"><span className="text-muted font-normal">{t('tier.glossary.col.label')}: </span>{entry.label}</p>
      <p className="text-[13px] leading-snug text-ink">{entry.sentence}</p>
      <p className="text-xs text-muted"><span className="font-medium">{t('tier.glossary.col.example')}:</span> {entry.example}</p>
    </div>
  );
}

export default function Glossary() {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('');
  const terms = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return TERM_KEYS.map((key) => ({ key, ...GLOSSARY[key] })).filter((g) => !needle
      || [g.technical, g.en.label, g.en.sentence, g.kn.label, g.kn.sentence].some((s) => String(s).toLowerCase().includes(needle)));
  }, [filter]);

  return (
    <div id="glossary" className="space-y-4">
      <TierHeader eyebrow={t('tier.nav.group')} title={t('tier.glossary.title')} sub={t('tier.glossary.sub', { n: TERM_KEYS.length })} readTarget="glossary" />
      <div className="no-print flex flex-col gap-1 max-w-md">
        <label htmlFor="glossary-filter" className="text-[11px] font-medium text-muted">{t('tier.glossary.search')}</label>
        <input id="glossary-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('tier.glossary.searchAria')} className="input-dark min-h-[44px] w-full" />
      </div>
      <p className="text-[11px] text-muted">{t('tier.glossary.status.legend')}</p>

      {terms.length === 0 && <p className="text-sm text-muted">{t('tier.glossary.none')}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {terms.map((g) => {
          const status = g.kn.status || 'ok';
          return (
            <Card key={g.key} padded={false} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-sm font-semibold text-ink"><span className="text-muted font-normal">{t('tier.glossary.col.term')}: </span><span className="num">{g.technical}</span></h2>
                <Badge tone={STATUS_TONE[status] || 'neutral'}>{t(`tier.glossary.status.${status}`)}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Col lang="en" entry={g.en} t={t} />
                <Col lang="kn" entry={g.kn} t={t} />
              </div>
            </Card>
          );
        })}
      </div>

      <Card title={t('tier.glossary.kpi.title')} subtitle={t('tier.glossary.kpi.sub')}>
        <section className="space-y-2">
          <h3 className="eyebrow">{t('tier.glossary.kpi.disposal')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                  <th scope="col" className="px-2 py-1.5 font-medium">CCS-17</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">{t('tier.glossary.col.label')}</th>
                  <th scope="col" className="px-2 py-1.5 font-medium">{t('tier.glossary.col.sentence')}</th>
                </tr>
              </thead>
              <tbody>
                {DISPOSAL_STATES.map((s) => (
                  <tr key={s.code} className="border-t border-grid/60">
                    <th scope="row" className="num px-2 py-1.5 text-left font-semibold text-ink whitespace-nowrap">{s.code}</th>
                    <td className="px-2 py-1.5 text-ink">{(s[lang] || s.en).name}</td>
                    <td className="px-2 py-1.5 text-muted">{(s[lang] || s.en).plain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">{t('tier.glossary.kpi.note')}</p>
        </section>
        <section className="mt-5 space-y-2">
          <h3 className="eyebrow">{t('tier.glossary.kpi.heads')}</h3>
          <ol className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {REVIEW_HEADS.map((h, i) => (
              <li key={h.en} className="flex gap-2 py-1 border-b border-grid/40">
                <span className="num text-muted w-5 shrink-0">{i + 1}</span>
                <span className="min-w-0"><span className="text-ink">{h.en}</span> <span lang="kn" className="text-muted">· {h.kn}</span>{h.split ? <span className="block text-[11px] text-muted">{h.split}</span> : null}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-5 space-y-2">
          <h3 className="eyebrow">{t('tier.glossary.kpi.metrics')}</h3>
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 text-xs">
            {METRICS.map((m) => (
              <div key={m.en.name} className="rounded-lg border border-grid bg-panel-raised px-3 py-2">
                <dt className="font-semibold text-ink">{(m[lang] || m.en).name}</dt>
                <dd className="text-muted mt-0.5">{(m[lang] || m.en).plain}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Card>
    </div>
  );
}
