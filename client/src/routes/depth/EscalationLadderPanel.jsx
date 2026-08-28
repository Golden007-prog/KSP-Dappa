// Escalation ladder — corpus-wide gravity transition matrix + the escalation
// watchlist (everyone whose later cases outrank their earlier ones), with the
// specialisation index beside each name. Data: GET /depth/escalation.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import DataTable from '../../components/DataTable.jsx';
import StatusPill from '../../components/StatusPill.jsx';
import PlainTerm from '../../components/PlainTerm.jsx';
import { useDepthEscalation } from '../../lib/depthApi.js';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { PanelFrame, HeatMatrix, SampleLine, StatTile, statusOf } from './DepthBits.jsx';

export default function EscalationLadderPanel() {
  const t = useT();
  const q = useDepthEscalation();
  const d = q.data;
  const bands = d?.bands || [];
  const axis = useMemo(() => bands.map((b) => ({ key: b, label: t(`depth.band.${b}`) })), [bands, t]);
  const summary = d?.summary || {};
  const watch = d?.watchlist || [];

  const columns = [
    { key: 'name', label: t('depth.ladder.colPerson'), render: (r) => <Link to={`/offenders/${encodeURIComponent(r.personKey)}`} className="text-primary hover:underline">{r.name}</Link> },
    { key: 'verdict', label: t('depth.ladder.colVerdict'), render: (r) => <StatusPill status={statusOf(r.verdict)} label={t(`depth.verdict.${r.verdict}`)} /> },
    { key: 'gravityDelta', label: t('depth.ladder.colGravity'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtNum(r.earlyGravity, 1)} → {fmtNum(r.lateGravity, 1)}</span> },
    { key: 'casesDated', label: t('depth.ladder.colSeen'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtInt(r.casesDated)}/{fmtInt(r.caseCount)}</span> },
    { key: 'netRungs', label: t('depth.ladder.colRungs'), align: 'right', sortable: true, render: (r) => <span className="num">{r.netRungs > 0 ? '+' : ''}{r.netRungs}</span> },
    { key: 'specialisation', label: t('depth.ladder.colSpecial'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtNum(r.specialisation, 2)}</span> },
    { key: 'monthsSinceLast', label: t('depth.ladder.colQuiet'), align: 'right', sortable: true, render: (r) => <span className="num">{r.monthsSinceLast === null ? '—' : fmtNum(r.monthsSinceLast, 1)}</span> },
    { key: 'riskScore', label: t('depth.ladder.colRisk'), align: 'right', sortable: true, render: (r) => <span className="num">{fmtNum(r.riskScore, 1)}</span> },
  ];

  return (
    <PanelFrame
      title={t('depth.ladder.title')}
      subtitle={d ? t('depth.ladder.subtitle', { n: fmtInt(summary.personsMeasured || 0), tr: fmtInt(summary.transitions || 0) }) : undefined}
      term="ladder"
      termVars={{ up: summary.upShare === null || summary.upShare === undefined ? '—' : Math.round(summary.upShare * 100), down: summary.downShare === null || summary.downShare === undefined ? '—' : Math.round(summary.downShare * 100) }}
      method={t('depth.ladder.method')}
      methodDetail={d?.method}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      empty={Boolean(d) && !(summary.transitions > 0)}
      emptyMessage={t('depth.ladder.empty')}
    >
      {d && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatTile label={t('depth.ladder.kpiTransitions')} value={fmtInt(summary.transitions)} />
            <StatTile label={t('depth.ladder.kpiUp')} value={fmtPct(summary.upShare * 100, { digits: 0 })} tone="text-signal" />
            <StatTile label={t('depth.ladder.kpiDown')} value={fmtPct(summary.downShare * 100, { digits: 0 })} tone="text-teal" />
            <StatTile label={t('depth.ladder.kpiEscalating')} value={fmtInt(summary.escalating)} hint={t('depth.ladder.kpiEscalatingHint', { n: fmtInt(summary.personsMeasured) })} />
          </div>
          <HeatMatrix
            rows={axis}
            cols={axis}
            corner={t('depth.ladder.corner')}
            caption={t('depth.ladder.matrixCaption')}
            max={1}
            value={(r, c) => {
              const row = d.matrix.find((m) => m.from === r.key);
              const cell = row && row.to.find((x) => x.band === c.key);
              if (!cell) return { v: 0, label: '—' };
              return { v: cell.p ?? 0, label: cell.p === null ? '—' : fmtPct(cell.p * 100, { digits: 0 }), sub: fmtInt(cell.count), title: `${t(`depth.band.${r.key}`)} → ${t(`depth.band.${c.key}`)}: ${cell.count}` };
            }}
          />
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
              <h3 className="text-xs font-semibold text-ink">{t('depth.ladder.watchTitle')}</h3>
              <PlainTerm term="specialisation" className="text-[11px] text-muted" />
            </div>
            <DataTable
              columns={columns}
              rows={watch}
              rowKey="personKey"
              dense
              exportable
              exportFilename="dappa-escalation-watchlist"
              emptyMessage={t('depth.ladder.watchEmpty')}
            />
          </div>
          <SampleLine scan={d.scan} />
        </div>
      )}
    </PanelFrame>
  );
}
