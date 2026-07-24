// Side-by-side comparison of 2–3 offenders in a bottom sheet.
// Registry rows give the instant columns; GET /offenders/:key enriches each
// column with degree + first/last seen + timeline + associates once the sheet
// is open (queries stay disabled while closed — keys pass through as '' so
// nothing fetches). Numeric rows tint the highest value so differences read at
// a glance (risk = red tint, cases/degree = amber). Association-detection
// rows: per-year activity sparkline, direct co-accused links between the
// compared people, shared MO tags highlighted, and a common-associates footer.
import { Link } from 'react-router-dom';
import Sheet from '../../components/Sheet.jsx';
import { useOffender } from '../../lib/api.js';
import { fmtInt, dateLabel } from '../../lib/format.js';
import { RiskBadge } from './common.jsx';
import YearSparkline from './YearSparkline.jsx';
import { communityColor } from '../network/graphUtils.js';

function DetCell({ loading, children }) {
  return loading ? <div className="skeleton h-4 w-16" /> : children;
}

const METRICS = [
  {
    id: 'risk',
    label: 'Risk',
    num: (c) => Number(c.p.riskScore),
    maxTint: 'bg-signal/10',
    render: (c) => <RiskBadge score={c.p.riskScore} />,
  },
  {
    id: 'cases',
    label: 'Cases',
    num: (c) => Number(c.p.caseCount),
    maxTint: 'bg-amber/10',
    render: (c) => fmtInt(c.p.caseCount),
  },
  {
    id: 'degree',
    label: 'Network degree',
    num: (c) => Number(c.p.degree),
    maxTint: 'bg-amber/10',
    render: (c) => <DetCell loading={c.loading}>{fmtInt(c.p.degree)}</DetCell>,
  },
  {
    id: 'districts',
    label: 'Districts',
    render: (c) => (
      <span className="whitespace-normal">{(c.p.districts || []).join(', ') || '—'}</span>
    ),
  },
  {
    id: 'firstSeen',
    label: 'First seen',
    render: (c) => <DetCell loading={c.loading}>{dateLabel(c.p.firstSeen)}</DetCell>,
  },
  {
    id: 'lastSeen',
    label: 'Last seen',
    render: (c) => <DetCell loading={c.loading}>{dateLabel(c.p.lastSeen)}</DetCell>,
  },
  {
    id: 'aliases',
    label: 'Aliases',
    render: (c) => {
      const aliases = c.p.aliases || [];
      if (!aliases.length) return '—';
      return (
        <span className="inline-flex flex-wrap gap-1">
          {aliases.slice(0, 4).map((a) => <span key={a} className="chip !py-0 text-[10px]">{a}</span>)}
          {aliases.length > 4 && (
            <span className="chip !py-0 text-[10px] text-muted" title={aliases.slice(4).join(', ')}>
              +{aliases.length - 4}
            </span>
          )}
        </span>
      );
    },
  },
  {
    id: 'mo',
    label: 'MO tags',
    render: (c, ctx) => {
      const tags = c.p.moTags || [];
      if (!tags.length) return '—';
      return (
        <span className="inline-flex flex-wrap gap-1">
          {tags.slice(0, 6).map((t) => (
            <span
              key={t}
              className={`chip !py-0 text-[10px] ${ctx?.sharedTags?.has(t) ? '!border-amber text-amber' : ''}`}
              title={ctx?.sharedTags?.has(t) ? 'Shared with another compared offender' : undefined}
            >
              {t}
            </span>
          ))}
          {tags.length > 6 && (
            <span className="chip !py-0 text-[10px] text-muted" title={tags.slice(6).join(', ')}>+{tags.length - 6}</span>
          )}
        </span>
      );
    },
  },
  {
    id: 'activity',
    label: 'Activity',
    render: (c) => {
      if (c.loading) return <div className="skeleton h-10 w-28" />;
      return (c.p.timeline || []).length
        ? <YearSparkline timeline={c.p.timeline} height={28} />
        : <span className="text-muted">—</span>;
    },
  },
  {
    id: 'links',
    label: 'Direct links',
    render: (c, ctx) => {
      if (c.loading) return <div className="skeleton h-4 w-16" />;
      const links = (ctx?.cols || [])
        .filter((o) => o.key !== c.key)
        .map((o) => {
          const hit = (c.p.associates || []).find((a) => String(a.personKey) === o.key);
          return hit ? { key: o.key, name: o.p.canonicalName || o.key, n: hit.sharedCases } : null;
        })
        .filter(Boolean);
      if (!links.length) return <span className="text-muted">no direct link</span>;
      return (
        <span className="inline-flex flex-wrap gap-1">
          {links.map((l) => (
            <span key={l.key} className="chip !py-0 text-[10px] !border-amber/60 text-amber" title="These two are co-accused on the same FIR(s)">
              ↔ {l.name} · {fmtInt(l.n)} shared
            </span>
          ))}
        </span>
      );
    },
  },
  {
    id: 'community',
    label: 'Community',
    render: (c) => {
      const cid = c.p.communityId;
      if (cid === null || cid === undefined || cid === '') return '—';
      return (
        <Link
          to={`/network?communityId=${encodeURIComponent(cid)}&focus=${encodeURIComponent(c.key)}`}
          className="chip !py-0 text-[10px] hover:border-amber/50 transition-colors"
        >
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: communityColor(cid) }} />
          #{String(cid)}
        </Link>
      );
    },
  },
];

/** Index of the strictly-highest numeric value, or -1 when tied/empty. */
function maxIndex(metric, cols) {
  if (!metric.num || cols.length < 2) return -1;
  const vals = cols.map((c) => metric.num(c));
  let best = -Infinity;
  let idx = -1;
  vals.forEach((v, i) => { if (Number.isFinite(v) && v > best) { best = v; idx = i; } });
  const finite = vals.filter(Number.isFinite);
  if (finite.length < 2 || Math.min(...finite) === Math.max(...finite)) return -1;
  return idx;
}

export default function CompareDrawer({ open, keys = [], baseByKey = new Map(), onClose, onRemove }) {
  // Fixed slots keep the hook count stable for up to 3 offenders.
  const d0 = useOffender(open ? keys[0] || '' : '');
  const d1 = useOffender(open ? keys[1] || '' : '');
  const d2 = useOffender(open ? keys[2] || '' : '');
  const details = [d0, d1, d2];

  const cols = keys.slice(0, 3).map((k, i) => ({
    key: String(k),
    loading: details[i].isLoading,
    p: { ...(baseByKey.get(String(k)) || {}), ...(details[i].data || {}) },
  }));

  // MO tags carried by 2+ compared offenders → highlighted in the MO row.
  const tagCount = new Map();
  for (const c of cols) {
    for (const t of new Set(c.p.moTags || [])) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }
  const sharedTags = new Set([...tagCount].filter(([, n]) => n >= 2).map(([t]) => t));
  const ctx = { cols, sharedTags };

  // Associates shared by 2+ compared offenders (excluding the compared people
  // themselves) — hidden-association detection across the set.
  const assocCount = new Map();
  for (const c of cols) {
    for (const a of c.p.associates || []) {
      const k = String(a.personKey);
      if (cols.some((o) => o.key === k)) continue;
      assocCount.set(k, (assocCount.get(k) || 0) + 1);
    }
  }
  const commonAssociates = [...assocCount.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 8);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Compare offenders (${cols.length})`}
      className="md:!w-[46rem] md:max-w-[calc(100vw-3rem)]"
    >
      {cols.length < 2 ? (
        <p className="text-xs text-muted px-2 py-6 text-center">
          Select at least two offenders in the registry to compare them side by side.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: `${8 + cols.length * 12}rem` }}>
            <thead>
              <tr className="border-b border-grid">
                <th scope="col" className="text-left text-[10px] uppercase tracking-wide text-muted px-2 py-2 align-bottom w-28">
                  Metric
                </th>
                {cols.map((c) => (
                  <th key={c.key} scope="col" className="text-left px-2 py-2 align-bottom">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <Link
                          to={`/offenders/${encodeURIComponent(c.key)}`}
                          className="text-sm font-semibold text-ink hover:text-amber transition-colors block truncate"
                        >
                          {c.p.canonicalName || c.key}
                        </Link>
                        <p className="text-[10px] text-muted num truncate">{c.key}</p>
                      </div>
                      <button
                        type="button"
                        className="flex h-9 w-9 -mt-1 -mr-1 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-grid/40 transition-colors"
                        onClick={() => onRemove?.(c.key)}
                        aria-label={`Remove ${c.p.canonicalName || c.key} from comparison`}
                      >
                        ✕
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const hi = maxIndex(m, cols);
                return (
                  <tr key={m.id} className="border-b border-grid/40 align-top">
                    <th scope="row" className="text-left text-[10px] uppercase tracking-wide text-muted font-semibold px-2 py-2 whitespace-nowrap">
                      {m.label}
                    </th>
                    {cols.map((c, i) => (
                      <td
                        key={c.key}
                        className={`px-2 py-2 num text-xs text-ink align-top ${i === hi ? `${m.maxTint} rounded` : ''}`}
                        title={i === hi ? `Highest ${m.label.toLowerCase()} of the compared set` : undefined}
                      >
                        {m.render(c, ctx)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="align-top">
                <th scope="row" className="text-left text-[10px] uppercase tracking-wide text-muted font-semibold px-2 py-2 whitespace-nowrap">
                  Common associates
                </th>
                <td colSpan={cols.length} className="px-2 py-2 text-xs text-ink">
                  {cols.some((c) => c.loading) ? (
                    <div className="skeleton h-4 w-24" />
                  ) : commonAssociates.length ? (
                    <span className="inline-flex flex-wrap gap-1">
                      {commonAssociates.map((k) => (
                        <Link
                          key={k}
                          to={`/offenders/${encodeURIComponent(k)}`}
                          className="chip !py-0 text-[10px] hover:border-amber/50 transition-colors"
                          title="Co-accused with at least two of the compared offenders"
                        >
                          {baseByKey.get(k)?.canonicalName || k}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted">none shared by two or more of the compared offenders</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}
