// /cases — Data Explorer: shared FilterBar + server-paginated case table with
// an anomaly badge column. Rows open the FIR detail view.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCases } from '../lib/api.js';
import { useUrlFilters } from '../lib/filters.js';
import Card from '../components/Card.jsx';
import FilterBar from '../components/FilterBar.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Badge from '../components/Badge.jsx';
import { dateLabel, fmtInt } from '../lib/format.js';
import { CrimeNoInline } from './cases/CrimeNoBreakdown.jsx';

const COLUMNS = [
  {
    key: 'crimeNo',
    label: 'Crime no',
    className: 'font-medium whitespace-nowrap',
    render: (r) => <CrimeNoInline crimeNo={r.crimeNo} />,
  },
  {
    key: 'registeredDate',
    label: 'Registered',
    sortable: true,
    render: (r) => dateLabel(r.registeredDate),
  },
  { key: 'districtName', label: 'District' },
  { key: 'unitName', label: 'Station' },
  { key: 'headName', label: 'Crime head' },
  { key: 'subHeadName', label: 'Subhead' },
  { key: 'statusName', label: 'Status' },
  {
    key: 'gravityName',
    label: 'Gravity',
    render: (r) =>
      r.gravityName ? (
        <Badge tone={/hein/i.test(String(r.gravityName)) ? 'red' : 'slate'}>{r.gravityName}</Badge>
      ) : (
        '—'
      ),
  },
  {
    key: 'anomalyFlag',
    label: 'Anomaly',
    width: 90,
    align: 'center',
    render: (r) => (r.anomalyFlag ? <Badge tone="red" pulse>anomaly</Badge> : null),
  },
];

export default function Cases() {
  const navigate = useNavigate();
  const { apiParams } = useUrlFilters();
  const [page, setPage] = useState(1);

  // New filters restart pagination — page 6 of a narrower result set is noise.
  const filterKey = JSON.stringify(apiParams);
  useEffect(() => {
    setPage(1);
  }, [filterKey]);

  const cases = useCases({ ...apiParams, page });
  const total = cases.data?.total;

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div>
        <h1 className="page-title">Case Explorer</h1>
        <p className="page-subtitle">
          Server-paginated FIR registry
          {Number.isFinite(Number(total)) ? <> · <span className="num">{fmtInt(total)}</span> cases match</> : null}
        </p>
      </div>

      <FilterBar />

      <Card padded={false}>
        {cases.error ? (
          <EmptyState
            title="Couldn't load cases"
            message={cases.error.message}
            action={<button type="button" className="btn" onClick={() => cases.refetch()}>Retry</button>}
          />
        ) : (
          <DataTable
            columns={COLUMNS}
            rows={cases.data?.rows || []}
            rowKey="caseMasterId"
            loading={cases.isLoading}
            emptyMessage="No cases match the current filters — widen the date range or clear a filter."
            total={total}
            page={cases.data?.page || page}
            perPage={cases.data?.perPage || 50}
            onPageChange={setPage}
            onRowClick={(r) => navigate(`/cases/${r.caseMasterId}`)}
          />
        )}
      </Card>
    </div>
  );
}
