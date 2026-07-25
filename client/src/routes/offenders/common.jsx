// Shared bits for the Offenders registry + Offender 360 views.
import { useMemo } from 'react';
import Badge from '../../components/Badge.jsx';
import { fmtNum } from '../../lib/format.js';
import { useLookups } from '../../lib/api.js';
import { useNames } from '../../lib/i18n.jsx';
import { UNITS } from '../../lib/districtGeoMap.js';

const UNIT_ID_BY_NAME = new Map(UNITS.map((u) => [u.name, u.unitId]));

/** The offender API sends district NAMES, not ids — recover the unit code from
 *  the static table so tName() can answer in the active language. */
export function useDistrictName() {
  const tName = useNames();
  return useMemo(
    () => (name) => tName('districts', UNIT_ID_BY_NAME.get(String(name || '')) || '', name || ''),
    [tName],
  );
}

/** Same problem for the timeline's status / crime-head strings: reverse the
 *  name back to its lookup id, then translate. Falls back to the API string. */
export function useRefNames() {
  const tName = useNames();
  const lookups = useLookups();
  return useMemo(() => {
    const d = lookups.data || {};
    const index = (rows, nameKey, idKey) =>
      new Map((rows || []).map((r) => [String(r[nameKey] ?? ''), String(r[idKey] ?? '')]));
    const statuses = index(d.statuses, 'name', 'id');
    const heads = index(d.crimeHeads, 'headName', 'crimeHeadId');
    const subHeads = index(d.crimeSubHeads, 'subHeadName', 'crimeSubHeadId');
    return {
      status: (n) => tName('statuses', statuses.get(String(n || '')) || '', n || ''),
      head: (n) => tName('crimeHeads', heads.get(String(n || '')) || '', n || ''),
      subHead: (n) => tName('crimeSubHeads', subHeads.get(String(n || '')) || '', n || ''),
    };
  }, [lookups.data, tName]);
}

/** Risk score 0–100 → tone-coded badge (thresholds match StationRisk styling). */
export function RiskBadge({ score, pulse = false }) {
  const n = Number(score);
  if (!Number.isFinite(n)) return <Badge tone="slate">—</Badge>;
  const tone = n >= 70 ? 'red' : n >= 40 ? 'amber' : 'teal';
  return <Badge tone={tone} pulse={pulse && tone === 'red'}>{fmtNum(n, 1)}</Badge>;
}

/** Case outcome → tone-coded badge for timeline / tables. The tone is derived
 *  from the raw English status; `label` carries the translated text. */
export function OutcomeBadge({ status, label }) {
  const s = String(status || '');
  if (!s) return <Badge tone="slate">—</Badge>;
  const tone = /convict|charge\s*sheet|a\s*final/i.test(s) ? 'teal'
    : /under\s*invest|pending|open/i.test(s) ? 'amber'
      : 'neutral';
  return <Badge tone={tone}>{label || s}</Badge>;
}

/** MO tag chips, truncated to `max` with a +n overflow chip. */
export function MoChips({ tags = [], max = 3, className = '' }) {
  if (!tags.length) return <span className="text-muted text-xs">—</span>;
  const shown = tags.slice(0, max);
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {shown.map((t) => <span key={t} className="chip !py-0 text-[10px]">{t}</span>)}
      {tags.length > max && (
        <span className="chip !py-0 text-[10px] text-muted" title={tags.slice(max).join(', ')}>+{tags.length - max}</span>
      )}
    </span>
  );
}
