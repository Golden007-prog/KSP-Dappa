// Dormant-crew re-activation detector — co-offending pairs quiet for ≥ 12
// months that share a new case. Data: GET /depth/reactivation.
import { Link } from 'react-router-dom';
import DataTable from '../../components/DataTable.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import { useDepthReactivation } from '../../lib/depthApi.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, dateLabel } from '../../lib/format.js';
import { PanelFrame, SampleLine, StatTile } from './DepthBits.jsx';

export default function ReactivationPanel() {
  const t = useT();
  const q = useDepthReactivation();
  const d = q.data;
  const s = d?.summary || {};
  const person = (key, name) => <Link to={`/offenders/${encodeURIComponent(key)}`} className="text-primary hover:underline">{name}</Link>;
  const columns = [
    { key: 'pair', label: t('depth.react.colPair'), render: (r) => <span>{person(r.a, r.nameA)} · {person(r.b, r.nameB)}</span> },
    { key: 'status', label: t('depth.react.colStatus'), render: () => <StatusPill status="rising" label={t('depth.react.reactivated')} /> },
    { key: 'dormantMonths', label: t('depth.react.colQuiet'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtNum(r.dormantMonths, 1)}</span> },
    { key: 'quietFrom', label: t('depth.react.colFrom'), render: (r) => <span className="num">{dateLabel(r.quietFrom)}</span> },
    { key: 'reactivatedOn', label: t('depth.react.colOn'), render: (r) => <span className="num">{dateLabel(r.reactivatedOn)}</span> },
    { key: 'sharedCases', label: t('depth.react.colShared'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtInt(r.sharedCases)}</span> },
  ];
  return (
    <PanelFrame
      title={t('depth.react.title')}
      subtitle={d ? t('depth.react.subtitle', { n: fmtInt(s.pairsWithHistory || 0) }) : undefined}
      term="reactivation"
      termVars={{ n: fmtInt(s.reactivated || 0), dormant: fmtInt(s.dormantNow || 0) }}
      method={t('depth.react.method')}
      methodDetail={d?.method}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
    >
      {d && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <StatTile label={t('depth.react.kpiPairs')} value={fmtInt(s.pairsWithHistory)} />
            <StatTile label={t('depth.react.kpiDormant')} value={fmtInt(s.dormantNow)} hint={t('depth.react.kpiDormantHint')} />
            <StatTile label={t('depth.react.kpiReactivated')} value={fmtInt(s.reactivated)} tone={s.reactivated ? 'text-signal' : ''} />
          </div>
          <DataTable columns={columns} rows={d.pairs || []} rowKey={(r) => `${r.a}~${r.b}`} dense exportable exportFilename="dappa-reactivated-pairs" emptyMessage={t('depth.react.empty')} />
          <SampleLine scan={d.scan} />
        </div>
      )}
    </PanelFrame>
  );
}
