// Small label/value panel for the unpinned single-object joins on /cases/:id
// (chargesheet, IO, court). Whitelist-only rows — unknown keys are never dumped
// (caste/religion may exist in the source schema and must never reach the UI).
import Card from '../../components/Card.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { dateLabel } from '../../lib/format.js';

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

export default function KeyValuePanel({ title, subtitle, data, rows = [], emptyTitle = 'No record', emptyMessage }) {
  const obj = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  const found = obj
    ? rows.map((r) => ({ ...r, value: pick(obj, r.keys) })).filter((r) => r.value !== undefined)
    : [];

  return (
    <Card title={title} subtitle={subtitle}>
      {found.length === 0 ? (
        <EmptyState compact title={emptyTitle} message={emptyMessage || 'Nothing on file for this case.'} />
      ) : (
        <dl className="space-y-2">
          {found.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3 text-sm">
              <dt className="text-muted shrink-0">{r.label}</dt>
              <dd className="text-ink text-right num break-words min-w-0">
                {r.fmt === 'date' ? dateLabel(r.value) : String(r.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
