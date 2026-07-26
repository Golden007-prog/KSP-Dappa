// Selection drawers for the two entity classes the co-accusal graph never had:
// victims and recurring locations. Same shell language as Drawers.jsx so a tap
// on a square (victim) or hexagon (location) node reads like a tap on a person.
import { Link } from 'react-router-dom';
import Badge from '../../components/Badge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { fmtInt, fmtPct, fmtNum, dateLabel } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

function DrawerShell({ title, subtitle, onClose, children }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted truncate">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="flex h-10 w-10 -mt-2 -mr-2 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
          onClick={onClose}
          aria-label={t('network.drawer.close')}
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, children }) {
  return (
    <div className="bg-base/60 border border-grid rounded-lg px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-ink num">{children}</p>
    </div>
  );
}

/** Victim node tap → the FIR party record plus every suspect it links to. */
export function VictimDrawer({ victim, index, nodesById, onClose, onPickPerson }) {
  const t = useT();
  if (!victim) return null;
  const entity = index?.victims.get(String(victim.id)) || null;
  const profile = entity?.profileKey ? index?.profiles.get(entity.profileKey) : null;
  const repeat = profile && profile.caseIds.length > 1;
  const suspects = entity?.suspects || [];
  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);

  return (
    <DrawerShell
      title={entity?.name || victim.label || t('network.entity.victim')}
      subtitle={t('network.entity.victimSub', {
        age: entity?.age ?? victim.age ?? '—',
        gender: t(`network.victim.gender.${entity?.gender || victim.gender || 'unknown'}`),
      })}
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="teal">{t('network.entity.victimBadge')}</Badge>
        {repeat && <Badge tone="red" pulse>{t('network.entity.repeatBadge', { n: fmtInt(profile.caseIds.length) })}</Badge>}
        {entity?.isPolice && <Badge tone="amber">{t('network.entity.policeVictim')}</Badge>}
        {entity?.ageBand === 'minor' && <Badge tone="red">{t('network.victim.band.minor')}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t('network.entity.head')}>
          <span className="text-xs">{entity?.subHeadName || entity?.headName || '—'}</span>
        </Stat>
        <Stat label={t('network.entity.registered')}>
          <span className="text-xs">{entity?.registeredDate ? dateLabel(entity.registeredDate) : '—'}</span>
        </Stat>
        <Stat label={t('network.entity.unit')}>
          <span className="text-xs">{entity?.unitName || '—'}</span>
        </Stat>
        <Stat label={t('network.entity.district')}>
          <span className="text-xs">{entity?.districtName || '—'}</span>
        </Stat>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{t('network.entity.linkedSuspects')}</p>
        {suspects.length === 0 ? (
          <p className="text-[11px] text-muted">{t('network.entity.noSuspects')}</p>
        ) : (
          <ul className="space-y-1">
            {suspects.map((pk) => (
              <li key={pk}>
                <button type="button" className="text-xs text-amber hover:underline underline-offset-2" onClick={() => onPickPerson?.(pk)}>
                  {nameOf(pk)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {repeat && (
        <div className="border-t border-grid/60 pt-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{t('network.entity.repeatTitle')}</p>
          <p className="text-[11px] text-muted leading-5">
            {t('network.entity.repeatLine', {
              n: fmtInt(profile.caseIds.length),
              ages: [...profile.ages].sort((a, b) => a - b).join(', ') || '—',
              units: fmtInt(profile.units.size),
            })}
          </p>
        </div>
      )}

      {entity?.caseId && (
        <Link to={`/cases/${encodeURIComponent(entity.caseId)}`} className="btn !py-2 !px-3 text-xs min-h-[40px] inline-flex">
          {t('network.entity.openCase')}
        </Link>
      )}

      <p className="text-[10px] text-muted leading-4 border-t border-grid/60 pt-2">
        {t('network.entity.victimFootnote')}
      </p>
    </DrawerShell>
  );
}

/** Location node tap → the unit's suspect roster, crime mix and risk score. */
export function LocationDrawer({
  location, index, nodesById, onClose, onPickPerson, onIsolateUnit, activeUnit = '', riskScore = null,
}) {
  const t = useT();
  if (!location) return null;
  const entity = index?.locations.get(String(location.id)) || null;
  const unitName = entity?.unitName || location.unitName || location.label || '';
  const suspects = entity ? [...entity.suspects] : [];
  const heads = entity ? [...entity.heads.entries()].sort((a, b) => b[1] - a[1]) : [];
  const nameOf = (id) => nodesById.get(String(id))?.label || String(id);
  const isolated = activeUnit === unitName;

  return (
    <DrawerShell
      title={unitName || t('network.entity.location')}
      subtitle={entity?.districtName || location.districtName || ''}
      onClose={onClose}
    >
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="amber">{t('network.entity.locationBadge')}</Badge>
        {riskScore !== null && riskScore !== undefined && (
          <Badge tone={riskScore >= 70 ? 'red' : riskScore >= 40 ? 'amber' : 'slate'}>
            {t('network.loc.recurring.risk', { n: fmtNum(riskScore, 0) })}
          </Badge>
        )}
        {isolated && <Badge tone="teal">{t('network.entity.isolatedHere')}</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t('network.entity.suspects')}>{fmtInt(suspects.length)}</Stat>
        <Stat label={t('network.entity.firs')}>{fmtInt(entity?.caseIds.size || 0)}</Stat>
        <Stat label={t('network.entity.victimsHere')}>{fmtInt(entity?.victims || 0)}</Stat>
        <Stat label={t('network.entity.span')}>
          <span className="text-xs">
            {entity?.firstSeen && entity?.lastSeen && entity.firstSeen !== entity.lastSeen
              ? `${dateLabel(entity.firstSeen)} → ${dateLabel(entity.lastSeen)}`
              : dateLabel(entity?.firstSeen || '') || '—'}
          </span>
        </Stat>
      </div>

      {heads.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{t('network.entity.crimeMix')}</p>
          <ul className="space-y-1">
            {heads.slice(0, 5).map(([head, n]) => (
              <li key={head} className="flex items-center gap-2 text-[11px]">
                <span className="text-ink truncate min-w-0">{head}</span>
                <span className="num text-muted ml-auto shrink-0">
                  {fmtInt(n)} · {fmtPct((n / Math.max(1, entity.caseIds.size)) * 100, { digits: 0 })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{t('network.entity.roster')}</p>
        {suspects.length === 0 ? (
          <EmptyState compact title={t('network.entity.noRoster')} />
        ) : (
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {suspects.slice(0, 25).map((pk) => (
              <li key={pk}>
                <button type="button" className="text-xs text-amber hover:underline underline-offset-2 truncate" onClick={() => onPickPerson?.(pk)}>
                  {nameOf(pk)}
                </button>
              </li>
            ))}
            {suspects.length > 25 && (
              <li className="text-[10px] text-muted">{t('network.entity.rosterMore', { n: fmtInt(suspects.length - 25) })}</li>
            )}
          </ul>
        )}
      </div>

      <button
        type="button"
        className={`btn !py-2 !px-3 text-xs min-h-[40px] w-full ${isolated ? '!border-amber text-amber' : ''}`}
        onClick={() => onIsolateUnit?.(isolated ? '' : unitName)}
      >
        {isolated ? t('network.entity.exitLocationFocus') : t('network.entity.locationFocus')}
      </button>

      <p className="text-[10px] text-muted leading-4 border-t border-grid/60 pt-2">
        {t('network.entity.locationFootnote')}
      </p>
    </DrawerShell>
  );
}
