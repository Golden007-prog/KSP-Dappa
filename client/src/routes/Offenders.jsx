// Offenders registry — searchable table of identity-resolved persons
// (repeat-offender filter default ON). Row → /offenders/:personKey (Offender 360).
// Spec: master prompt §7 route 5.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLookups, useOffenders } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import { unitInfo } from '../lib/districtGeoMap.js';
import Card from '../components/Card.jsx';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import { fmtInt } from '../lib/format.js';
import { RiskBadge, MoChips } from './offenders/common.jsx';
import { communityColor } from './network/graphUtils.js';

const PER_PAGE = 25;
const FETCH_CAP = 200; // API perPage ceiling — search/paging run client-side on this slice

export default function Offenders() {
  const navigate = useNavigate();
  const { districtId } = useUrlFilters();
  const lookups = useLookups();
  const [repeatOnly, setRepeatOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // The API's district filter matches OffenderProfile district NAMES — resolve
  // the FilterBar's unit code via lookups (static table as fallback).
  const districtName = useMemo(() => {
    if (!districtId) return '';
    const hit = (lookups.data?.districts || []).find((d) => d.districtId === districtId);
    return hit?.districtName || unitInfo(districtId)?.name || '';
  }, [districtId, lookups.data]);

  const params = { perPage: FETCH_CAP, repeatOnly: repeatOnly ? '1' : undefined };
  if (districtName) params.district = districtName;
  const offenders = useOffenders(params);

  const filtered = useMemo(() => {
    const rows = offenders.data?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.canonicalName, r.personKey, ...(r.aliases || []), ...(r.moTags || [])]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [offenders.data, search]);

  useEffect(() => { setPage(1); }, [search, repeatOnly, districtName]);

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [filtered, page],
  );

  const serverTotal = offenders.data?.total ?? 0;
  const truncated = serverTotal > FETCH_CAP;

  const columns = [
    {
      key: 'canonicalName',
      label: 'Canonical name',
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-ink truncate">{r.canonicalName || r.personKey}</p>
          <p className="text-[10px] text-muted num truncate">{r.personKey}</p>
        </div>
      ),
    },
    {
      key: 'aliases',
      label: 'Aliases',
      align: 'right',
      width: 70,
      render: (r) => (
        <span title={(r.aliases || []).join(', ') || 'no aliases'}>{fmtInt((r.aliases || []).length)}</span>
      ),
    },
    { key: 'caseCount', label: 'Cases', sortable: true, align: 'right', width: 70 },
    {
      key: 'districts',
      label: 'Districts',
      align: 'right',
      width: 80,
      render: (r) => (
        <span title={(r.districts || []).join(', ') || '—'}>{fmtInt((r.districts || []).length)}</span>
      ),
    },
    {
      key: 'moTags',
      label: 'MO tags',
      render: (r) => <MoChips tags={r.moTags || []} />,
    },
    {
      key: 'riskScore',
      label: 'Risk',
      sortable: true,
      align: 'right',
      width: 80,
      render: (r) => <RiskBadge score={r.riskScore} />,
    },
    {
      key: 'communityId',
      label: 'Group',
      align: 'center',
      width: 80,
      render: (r) => (r.communityId === null || r.communityId === undefined ? (
        <span className="text-muted">—</span>
      ) : (
        <Link
          to={`/network?communityId=${encodeURIComponent(r.communityId)}&focus=${encodeURIComponent(r.personKey)}`}
          className="chip !py-0 text-[10px] hover:border-amber/50 transition-colors"
          onClick={(e) => e.stopPropagation()}
          title="Open this community in the Network Explorer"
        >
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: communityColor(r.communityId) }} />
          #{String(r.communityId)}
        </Link>
      )),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Offenders</h1>
        <p className="page-subtitle">Identity-resolved persons across FIRs — linked by alias, phone and address signals</p>
      </div>

      <FilterBar show={['district']}>
        <input
          className="input-dark !py-1.5 w-52 sm:w-64"
          placeholder="Search name, alias, MO tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search offenders"
        />
        <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-amber"
            checked={repeatOnly}
            onChange={(e) => setRepeatOnly(e.target.checked)}
          />
          Repeat only (≥3 cases)
        </label>
      </FilterBar>

      <Card
        padded={false}
        title="Resolved persons"
        subtitle={offenders.isLoading
          ? 'Loading registry…'
          : `${fmtInt(filtered.length)} shown${search ? ` for “${search.trim()}”` : ''} · ${fmtInt(serverTotal)} total on file`}
        actions={truncated ? <Badge tone="slate">top {FETCH_CAP} by risk loaded</Badge> : undefined}
      >
        {offenders.error ? (
          <EmptyState
            title="Couldn't load the offender registry"
            message={offenders.error.message}
            action={<button type="button" className="btn" onClick={() => offenders.refetch()}>Retry</button>}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={pageRows}
            rowKey="personKey"
            loading={offenders.isLoading}
            emptyMessage={search
              ? 'No offender matches this search — try a shorter fragment.'
              : repeatOnly
                ? 'No repeat offenders (≥3 cases) under the current filters — untick “Repeat only”.'
                : 'No offender profiles under the current filters.'}
            total={filtered.length}
            page={page}
            perPage={PER_PAGE}
            onPageChange={setPage}
            onRowClick={(r) => navigate(`/offenders/${encodeURIComponent(r.personKey)}`)}
          />
        )}
      </Card>
    </div>
  );
}
