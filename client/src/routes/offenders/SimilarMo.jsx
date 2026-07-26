// MO fingerprint matching — "same hands, different jurisdiction". Compares this
// person's modus-operandi tag set against every other loaded profile with
// cosine similarity, then reports the shared tags and how many districts the
// two have in common. A high MO match with ZERO shared districts is the
// interesting case: the same method surfacing in a jurisdiction that has not
// linked the two persons.
//
// Runs on the offender registry slice already loaded by the route (no extra
// request); the live tag vocabulary is ~2,500 phrases mined from case
// narratives, so exact-tag overlap is a meaningful signal rather than noise.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { fmtInt, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { similarMo } from '../network/analysis.js';
import { RiskBadge } from './common.jsx';

export default function SimilarMo({ subject, rows = [], loading = false }) {
  const t = useT();
  const matches = useMemo(() => similarMo(rows, subject, { limit: 8 }), [rows, subject]);

  return (
    <Card title={t('network.simmo.title')} subtitle={t('network.simmo.subtitle')}>
      {loading ? (
        <p className="text-[11px] text-muted">{t('network.simmo.loading')}</p>
      ) : matches.length === 0 ? (
        <EmptyState compact title={t('network.simmo.emptyTitle')} message={t('network.simmo.emptyMsg')} />
      ) : (
        <ul className="divide-y divide-grid/50">
          {matches.map((m) => (
            <li key={m.personKey} className="py-1.5 first:pt-0 last:pb-0">
              <Link to={`/offenders/${encodeURIComponent(m.personKey)}`} className="group block">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-ink truncate flex-1 min-w-0 group-hover:text-amber transition-colors">{m.name}</span>
                  <RiskBadge score={m.riskScore} />
                  <span className="num text-[11px] text-amber shrink-0">{fmtPct(m.score * 100, { digits: 0 })}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                  {m.shared.slice(0, 3).map((tag) => (
                    <span key={tag} className="chip !py-0 text-[10px]">{tag}</span>
                  ))}
                  {m.shared.length > 3 && (
                    <span className="chip !py-0 text-[10px] text-muted">+{fmtInt(m.shared.length - 3)}</span>
                  )}
                  {m.sharedDistricts === 0 ? (
                    <Badge tone="red">{t('network.simmo.noSharedDistrict')}</Badge>
                  ) : (
                    <span className="text-[10px] text-muted num">
                      {t('network.simmo.sharedDistricts', { n: fmtInt(m.sharedDistricts) })}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-muted mt-2">{t('network.simmo.footnote')}</p>
    </Card>
  );
}
