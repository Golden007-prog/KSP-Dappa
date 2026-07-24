// Parties panel (complainants / victims / accused / arrests). The per-person
// object shape is NOT pinned in docs/CONTRACTS.md, so rendering is
// WHITELIST-ONLY on purpose: caste/religion columns exist in the source schema
// for fidelity but must never surface anywhere in the UI (organizer rule) —
// we therefore never dump unknown keys.
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Badge from '../../components/Badge.jsx';
import { dateLabel } from '../../lib/format.js';

export const NAME_KEYS = [
  'name', 'personName', 'fullName', 'canonicalName', 'PersonName', 'FullName',
  'complainantName', 'victimName', 'accusedName',
];

export const PERSON_FIELDS = [
  { label: 'Age', keys: ['age', 'Age', 'ageYears'] },
  { label: 'Gender', keys: ['gender', 'sex', 'Gender'] },
  { label: 'Occupation', keys: ['occupation', 'Occupation'] },
  { label: 'Phone', keys: ['phone', 'mobile', 'contact', 'mobileNo', 'phoneNo'] },
  { label: 'Address', keys: ['address', 'presentAddress', 'Address', 'addressLine'] },
  { label: 'Injury', keys: ['injuryType', 'injury', 'InjuryType'] },
  { label: 'Status', keys: ['statusName', 'accusedStatus', 'personStatus'] },
];

export const ARREST_FIELDS = [
  { label: 'Arrested on', keys: ['arrestDate', 'dateOfArrest', 'arrestedOn', 'date'], fmt: 'date' },
  { label: 'Type', keys: ['arrestTypeName', 'arrestType', 'type', 'mode'] },
  { label: 'Station', keys: ['unitName', 'station', 'stationName'] },
  { label: 'Status', keys: ['statusName', 'bailStatus', 'custodyStatus'] },
];

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function PersonCard({ person, fields }) {
  if (person === null || person === undefined) return null;
  if (typeof person !== 'object') {
    return (
      <div className="border border-grid rounded-lg p-3">
        <p className="text-sm font-medium text-ink break-words">{String(person)}</p>
      </div>
    );
  }
  const name = pick(person, NAME_KEYS) || 'Unnamed';
  const aliases = Array.isArray(person.aliases) ? person.aliases.filter(Boolean) : [];
  const details = fields
    .map((f) => ({ ...f, value: pick(person, f.keys) }))
    .filter((f) => f.value !== undefined);

  return (
    <div className="border border-grid rounded-lg p-3">
      <p className="text-sm font-medium text-ink break-words">{String(name)}</p>
      {aliases.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {aliases.map((a, i) => (
            <span key={`${a}-${i}`} className="chip !py-0.5 !text-[11px]">alias: {String(a)}</span>
          ))}
        </div>
      )}
      {details.length > 0 && (
        <dl className="mt-2 space-y-1">
          {details.map((f) => (
            <div key={f.label} className="flex items-start justify-between gap-2 text-xs">
              <dt className="text-muted shrink-0">{f.label}</dt>
              <dd className="text-ink text-right break-words min-w-0">
                {f.fmt === 'date' ? dateLabel(f.value) : String(f.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default function PartyList({ title, subtitle, people, tone = 'neutral', fields = PERSON_FIELDS, emptyMessage }) {
  const list = Array.isArray(people) ? people : [];
  return (
    <Card
      title={title}
      subtitle={subtitle}
      actions={<Badge tone={list.length ? tone : 'slate'}>{list.length}</Badge>}
    >
      {list.length === 0 ? (
        <EmptyState compact title="None on record" message={emptyMessage || 'No entries for this case.'} />
      ) : (
        <div className="space-y-2">
          {list.map((p, i) => (
            <PersonCard key={i} person={p} fields={fields} />
          ))}
        </div>
      )}
    </Card>
  );
}
