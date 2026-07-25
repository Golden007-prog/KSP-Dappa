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
import { useT } from '../../lib/i18n.jsx';
import { RiskBadge, useDistrictName } from './common.jsx';
import YearSparkline from './YearSparkline.jsx';
import { communityColor } from '../network/graphUtils.js';

function DetCell({ loading, children }) {
  return loading ? <div className="skeleton h-4 w-16" /> : children;
}

// `ctx` carries the translator and the compared columns into every renderer.
const METRICS = [
  {
    id: 'risk',
    labelKey: 'network.compare.risk',
    num: (c) => Number(c.p.riskScore),
    maxTint: 'bg-signal/10',
    render: (c) => <RiskBadge score={c.p.riskScore} />,
  },
  {
    id: 'cases',
    labelKey: 'network.compare.cases',
    num: (c) => Number(c.p.caseCount),
    maxTint: 'bg-amber/10',
    render: (c) => fmtInt(c.p.caseCount),
  },
  {
    id: 'degree',
    labelKey: 'network.compare.degree',
    num: (c) => Number(c.p.degree),
    maxTint: 'bg-amber/10',
    render: (c) => <DetCell loading={c.loading}>{fmtInt(c.p.degree)}</DetCell>,
  },
  {
    id: 'districts',
    labelKey: 'network.compare.districts',
    render: (c, ctx) => (
      <span className="whitespace-normal">{(c.p.districts || []).map(ctx.districtName).join(', ') || '—'}</span>
    ),
  },
  {
    id: 'firstSeen',
    labelKey: 'network.compare.firstSeen',
    render: (c) => <DetCell loading={c.loading}>{dateLabel(c.p.firstSeen)}</DetCell>,
  },
  {
    id: 'lastSeen',
    labelKey: 'network.compare.lastSeen',
    render: (c) => <DetCell loading={c.loading}>{dateLabel(c.p.lastSeen)}</DetCell>,
  },
  {
    id: 'aliases',
    labelKey: 'network.compare.aliases',
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
    labelKey: 'network.compare.mo',
    render: (c, ctx) => {
      const tags = c.p.moTags || [];
      if (!tags.length) return '—';
      return (
        <span className="inline-flex flex-wrap gap-1">
          {tags.slice(0, 6).map((tag) => (
            <span
              key={tag}
              className={`chip !py-0 text-[10px] ${ctx?.sharedTags?.has(tag) ? '!border-amber text-amber' : ''}`}
              title={ctx?.sharedTags?.has(tag) ? ctx.t('network.compare.sharedTagHint') : undefined}
            >
              {tag}
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
    labelKey: 'network.compare.activity',
    render: (c) => {
      if (c.loading) return <div className="skeleton h-10 w-28" />;
      return (c.p.timeline || []).length
        ? <YearSparkline timeline={c.p.timeline} height={28} />
        : <span className="text-muted">—</span>;
    },
  },
  {
    id: 'links',
    labelKey: 'network.compare.directLinks',
    render: (c, ctx) => {
      if (c.loading) return <div className="skeleton h-4 w-16" />;
      const links = (ctx?.cols || [])
        .filter((o) => o.key !== c.key)
        .map((o) => {
          const hit = (c.p.associates || []).find((a) => String(a.personKey) === o.key);
          return hit ? { key: o.key, name: o.p.canonicalName || o.key, n: hit.sharedCases } : null;
        })
        .filter(Boolean);
      if (!links.length) return <span className="text-muted">{ctx.t('network.compare.noDirectLink')}</span>;
      return (
        <span className="inline-flex flex-wrap gap-1">
          {links.map((l) => (
            <span key={l.key} className="chip !py-0 text-[10px] !border-amber/60 text-amber" title={ctx.t('network.compare.linkHint')}>
              {ctx.t('network.compare.sharedLink', { name: l.name, n: fmtInt(l.n) })}
            </span>
          ))}
        </span>
      );
    },
  },
  {
    id: 'community',
    labelKey: 'network.compare.community',
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
  const t = useT();
  const districtName = useDistrictName();
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
    for (const tag of new Set(c.p.moTags || [])) tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
  }
  const sharedTags = new Set([...tagCount].filter(([, n]) => n >= 2).map(([tag]) => tag));
  const ctx = { cols, sharedTags, t, districtName };

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
      title={t('network.compare.title', { n: fmtInt(cols.length) })}
      className="md:!w-[46rem] md:max-w-[calc(100vw-3rem)]"
    >
      {cols.length < 2 ? (
        <p className="text-xs text-muted px-2 py-6 text-center">
          {t('network.compare.needTwo')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: `${8 + cols.length * 12}rem` }}>
            <thead>
              <tr className="border-b border-grid">
                <th scope="col" className="text-left text-[10px] uppercase tracking-wide text-muted px-2 py-2 align-bottom w-28">
                  {t('network.compare.metric')}
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
                        aria-label={t('network.tray.removeAria', { name: c.p.canonicalName || c.key })}
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
                const label = t(m.labelKey);
                return (
                  <tr key={m.id} className="border-b border-grid/40 align-top">
                    <th scope="row" className="text-left text-[10px] uppercase tracking-wide text-muted font-semibold px-2 py-2 whitespace-nowrap">
                      {label}
                    </th>
                    {cols.map((c, i) => (
                      <td
                        key={c.key}
                        className={`px-2 py-2 num text-xs text-ink align-top ${i === hi ? `${m.maxTint} rounded` : ''}`}
                        title={i === hi ? t('network.compare.highestHint', { label: label.toLowerCase() }) : undefined}
                      >
                        {m.render(c, ctx)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr className="align-top">
                <th scope="row" className="text-left text-[10px] uppercase tracking-wide text-muted font-semibold px-2 py-2 whitespace-nowrap">
                  {t('network.compare.commonAssociates')}
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
                          title={t('network.compare.commonHint')}
                        >
                          {baseByKey.get(k)?.canonicalName || k}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="text-muted">{t('network.compare.noneShared')}</span>
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
