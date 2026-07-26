// Crew drill-in — the members behind a score, the signature that binds them,
// and the driver breakdown that produced the ranking.
import { Link } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { RiskBadge, useDistrictName } from './common.jsx';
import { DriverBar } from './crewViz.jsx';

const BAND_TONE = { organised: 'red', emerging: 'amber', loose: 'slate' };
const MEMBER_CAP = 30;

export default function CrewSheet({ crew, analysis, onClose }) {
  const t = useT();
  const dName = useDistrictName();
  if (!crew) return null;

  const signalByKey = analysis?.vocab?.signalByKey;
  const members = [...(crew.members || [])]
    .sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))
    .slice(0, MEMBER_CAP);

  return (
    <Sheet
      open={!!crew}
      onClose={onClose}
      title={t('offenders.crewSheet.title')}
      className="md:w-[32rem]"
    >
      <div className="space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={BAND_TONE[crew.band]}>{t(`offenders.crew.band.${crew.band}`)}</Badge>
            <span className="num text-lg font-semibold text-ink">{fmtNum(crew.score, 1)}</span>
            <span className="text-[11px] text-muted">{t('offenders.crewSheet.scoreOf')}</span>
          </div>
          <p className="text-sm text-ink mt-1.5 leading-5">
            {crew.sharedTags.slice(0, 3).map((x) => x.tag).join(' + ') || crew.id}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            {t('offenders.crewSheet.summary', {
              members: fmtInt(crew.size),
              cases: fmtInt(crew.cases),
              districts: fmtInt(crew.districtCount),
            })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted">{t('offenders.crewSheet.repeatShare')}</p>
            <p className="text-sm text-ink num">{fmtPct(crew.repeatShare * 100, { digits: 0 })}</p>
          </div>
          <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted">{t('offenders.crewSheet.avgRisk')}</p>
            <p className="text-sm text-ink num">{crew.avgRisk === null ? '—' : fmtNum(crew.avgRisk, 1)}</p>
          </div>
          <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted">{t('offenders.crewSheet.moLinks')}</p>
            <p className="text-sm text-ink num">{fmtInt(crew.links.length)}</p>
          </div>
          <div
            className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5"
            title={t('offenders.crewSheet.corroboratedHint')}
          >
            <p className="text-[10px] uppercase tracking-wide text-muted">{t('offenders.crewSheet.corroborated')}</p>
            <p className="text-sm text-ink num">{fmtInt(crew.corroboratedLinks)}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{t('offenders.crewSheet.drivers')}</p>
          <div className="space-y-1.5">
            {(crew.drivers || []).map((d) => (
              <DriverBar
                key={d.id}
                label={t(`offenders.driver.${d.id}`)}
                value={d.value}
                hint={t(`offenders.driver.${d.id}.hint`)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{t('offenders.crewSheet.signature')}</p>
          <div className="flex flex-wrap gap-1.5">
            {crew.sharedTags.slice(0, 10).map((x) => (
              <span key={x.tag} className="chip !py-0 text-[10px]" title={t('offenders.crewSheet.tagLinks', { n: fmtInt(x.count) })}>
                {x.tag}
                <span className="num text-muted">{fmtInt(x.count)}</span>
              </span>
            ))}
          </div>
        </div>

        {crew.districts.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">
              {t('offenders.crewSheet.footprint', { n: fmtInt(crew.districtCount) })}
            </p>
            <p className="text-[11px] text-ink leading-5">
              {crew.districts.slice(0, 14).map(dName).join(' · ')}
              {crew.districts.length > 14 && ` +${crew.districts.length - 14}`}
            </p>
          </div>
        )}

        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
            {t('offenders.crewSheet.members', { n: fmtInt(crew.size) })}
          </p>
          <ul className="divide-y divide-grid/50">
            {members.map((m) => (
              <li key={m.personKey} className="py-1.5 first:pt-0">
                <Link
                  to={`/offenders/${encodeURIComponent(m.personKey)}`}
                  className="flex items-center gap-2 min-h-[36px] group"
                  onClick={onClose}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-ink truncate group-hover:text-amber transition-colors">
                      {m.canonicalName || m.personKey}
                    </span>
                    <span className="block text-[10px] text-muted truncate">
                      {(signalByKey?.get(String(m.personKey)) || []).slice(0, 3).join(' · ') || m.personKey}
                    </span>
                  </span>
                  <Badge tone="slate">{t('offenders.crewSheet.caseBadge', { n: fmtInt(m.caseCount) })}</Badge>
                  <RiskBadge score={m.riskScore} />
                </Link>
              </li>
            ))}
          </ul>
          {crew.size > MEMBER_CAP && (
            <p className="text-[11px] text-muted mt-1.5">
              {t('offenders.crewSheet.memberCap', { shown: fmtInt(MEMBER_CAP), total: fmtInt(crew.size) })}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
