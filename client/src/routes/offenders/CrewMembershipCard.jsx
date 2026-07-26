// Does this person belong to a scored organised-crime crew?
//
// The registry answers "how risky is this individual"; this answers the
// question an investigator asks next — is the individual part of something
// larger, and how organised is that something.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { RiskBadge } from './common.jsx';
import { DriverBar } from './crewViz.jsx';

const BAND_TONE = { organised: 'red', emerging: 'amber', loose: 'slate' };
const PEER_ROWS = 6;

export default function CrewMembershipCard({ personKey, analysis }) {
  const t = useT();
  const { crews, isLoading, vocab } = analysis;

  const crew = useMemo(
    () => crews.find((c) => c.keys.includes(String(personKey))) || null,
    [crews, personKey],
  );

  const rank = useMemo(
    () => (crew ? crews.findIndex((c) => c.id === crew.id) + 1 : 0),
    [crew, crews],
  );

  if (isLoading) {
    return (
      <Card title={t('offenders.member.title')} subtitle={t('offenders.member.subtitle')}>
        <LoadingSkeleton lines={4} />
      </Card>
    );
  }

  if (!crew) {
    return (
      <Card title={t('offenders.member.title')} subtitle={t('offenders.member.subtitle')}>
        <EmptyState compact title={t('offenders.member.noneTitle')} message={t('offenders.member.noneMsg')} />
      </Card>
    );
  }

  const others = crew.members
    .filter((m) => String(m.personKey) !== String(personKey))
    .sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))
    .slice(0, PEER_ROWS);

  const mine = new Set(vocab?.signalByKey?.get(String(personKey)) || []);
  const shared = crew.sharedTags.filter((x) => mine.has(x.tag));

  return (
    <Card
      title={t('offenders.member.title')}
      subtitle={t('offenders.member.rank', { rank: fmtInt(rank), total: fmtInt(crews.length) })}
      actions={<Badge tone={BAND_TONE[crew.band]}>{t(`offenders.crew.band.${crew.band}`)}</Badge>}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="num text-2xl font-semibold text-ink">{fmtNum(crew.score, 1)}</span>
        <span className="text-[11px] text-muted">{t('offenders.member.scoreOf')}</span>
      </div>
      <p className="text-xs text-ink mt-1 leading-5">
        {crew.sharedTags.slice(0, 3).map((x) => x.tag).join(' + ') || crew.id}
      </p>
      <p className="text-[11px] text-muted mt-0.5">
        {t('offenders.crewSheet.summary', {
          members: fmtInt(crew.size),
          cases: fmtInt(crew.cases),
          districts: fmtInt(crew.districtCount),
        })}
      </p>

      <div className="mt-3 space-y-1.5">
        {(crew.drivers || []).map((d) => (
          <DriverBar
            key={d.id}
            label={t(`offenders.driver.${d.id}`)}
            value={d.value}
            hint={t(`offenders.driver.${d.id}.hint`)}
          />
        ))}
      </div>

      {shared.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
            {t('offenders.member.sharedSignature', { n: fmtInt(shared.length) })}
          </p>
          <div className="flex flex-wrap gap-1">
            {shared.slice(0, 8).map((x) => (
              <span key={x.tag} className="chip !py-0 text-[10px] !border-amber/40 text-amber">{x.tag}</span>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
            {t('offenders.member.coMembers', { n: fmtInt(crew.size - 1) })}
          </p>
          <ul className="divide-y divide-grid/50">
            {others.map((m) => (
              <li key={m.personKey} className="py-1.5 first:pt-0 last:pb-0">
                <Link
                  to={`/offenders/${encodeURIComponent(m.personKey)}`}
                  className="flex items-center gap-2 min-h-[36px] group"
                >
                  <span className="text-xs text-ink truncate flex-1 group-hover:text-amber transition-colors">
                    {m.canonicalName || m.personKey}
                  </span>
                  <Badge tone="slate">{t('offenders.crewSheet.caseBadge', { n: fmtInt(m.caseCount) })}</Badge>
                  <RiskBadge score={m.riskScore} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted mt-2.5 leading-5">
        {t('offenders.member.method', { pct: fmtPct(crew.topTagShare * 100, { digits: 0 }) })}
      </p>
      <Link
        to="/offenders?tab=crews"
        className="btn !py-1.5 !px-2.5 text-xs min-h-[40px] mt-2 inline-flex"
      >
        {t('offenders.member.openRanking')}
      </Link>
    </Card>
  );
}
