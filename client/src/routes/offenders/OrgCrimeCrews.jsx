// Organised-crime scoring for whole GROUPS rather than individuals.
//
// Crews are derived from shared modus operandi (see crews.js for why the stored
// CommunityID cannot carry this), scored on six drivers, and ranked. Every row
// opens a drill-in with the members, the binding signature and the driver
// breakdown, so the score is arguable rather than oracular.
import { useMemo, useState } from 'react';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import KpiTile from '../../components/KpiTile.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';
import { downloadCsv } from '../network/download.js';
import { CREW_DRIVERS } from './crews.js';
import CrewSheet from './CrewSheet.jsx';
import { ScoreMeter } from './crewViz.jsx';
import { useDistrictName } from './common.jsx';

const BAND_TONE = { organised: 'red', emerging: 'amber', loose: 'slate' };

export default function OrgCrimeCrews({ analysis }) {
  const t = useT();
  const toast = useToast();
  const dName = useDistrictName();
  const [band, setBand] = useState('all');
  const [openCrew, setOpenCrew] = useState(null);
  const [sort, setSort] = useState({ key: 'score', dir: 'desc' });

  const { crews, isLoading, error, refetch, graphSampled } = analysis;

  const filtered = useMemo(
    () => (band === 'all' ? crews : crews.filter((c) => c.band === band)),
    [crews, band],
  );

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const mul = dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = a?.[key];
      const bv = b?.[key];
      if (av === bv) return 0;
      const an = Number(av);
      const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return (an - bn) * mul;
      return String(av ?? '').localeCompare(String(bv ?? '')) * mul;
    });
  }, [filtered, sort]);

  const kpi = useMemo(() => ({
    crews: crews.length,
    organised: crews.filter((c) => c.band === 'organised').length,
    members: crews.reduce((s, c) => s + c.size, 0),
    crossDistrict: crews.filter((c) => c.districtCount >= 5).length,
    topScore: crews.length ? crews[0].score : 0,
  }), [crews]);

  const bandOptions = [
    { value: 'all', label: t('offenders.crew.bandAll') },
    { value: 'organised', label: t('offenders.crew.bandOrganised') },
    { value: 'emerging', label: t('offenders.crew.bandEmerging') },
    { value: 'loose', label: t('offenders.crew.bandLoose') },
  ];

  const exportCsv = () => {
    if (!sorted.length) { toast.info(t('offenders.toast.nothingToExport')); return; }
    downloadCsv(
      `dappa-crews-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { label: t('offenders.csv.crewId'), map: (c) => c.id },
        { label: t('offenders.csv.score'), map: (c) => c.score.toFixed(1) },
        { label: t('offenders.csv.band'), map: (c) => t(`offenders.crew.band.${c.band}`) },
        { label: t('offenders.csv.members'), map: (c) => c.size },
        { label: t('offenders.csv.cases'), map: (c) => c.cases },
        { label: t('offenders.csv.districts'), map: (c) => c.districts.map(dName).join('; ') },
        { label: t('offenders.csv.signature'), map: (c) => c.sharedTags.slice(0, 6).map((x) => x.tag).join('; ') },
        { label: t('offenders.csv.memberKeys'), map: (c) => c.keys.join('; ') },
      ],
      sorted,
    );
    toast.success(t('offenders.toast.crewCsv', { n: fmtInt(sorted.length) }));
  };

  const columns = [
    {
      key: 'label',
      label: t('offenders.crew.colCrew'),
      render: (c) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {c.sharedTags.slice(0, 2).map((x) => x.tag).join(' + ') || c.id}
          </p>
          <p className="text-[10px] text-muted num truncate">
            {t('offenders.crew.rowMeta', { members: fmtInt(c.size), cases: fmtInt(c.cases) })}
          </p>
        </div>
      ),
    },
    {
      key: 'band',
      label: t('offenders.crew.colBand'),
      align: 'center',
      width: 110,
      render: (c) => <Badge tone={BAND_TONE[c.band]}>{t(`offenders.crew.band.${c.band}`)}</Badge>,
    },
    { key: 'size', label: t('offenders.crew.colMembers'), sortable: true, align: 'right', width: 84 },
    { key: 'cases', label: t('offenders.crew.colCases'), sortable: true, align: 'right', width: 80 },
    {
      key: 'districtCount',
      label: t('offenders.crew.colDistricts'),
      sortable: true,
      align: 'right',
      width: 92,
      render: (c) => (
        <span className="num" title={c.districts.map(dName).join(', ')}>{fmtInt(c.districtCount)}</span>
      ),
    },
    {
      key: 'repeatShare',
      label: t('offenders.crew.colRepeat'),
      sortable: true,
      align: 'right',
      width: 92,
      render: (c) => <span className="num">{fmtPct(c.repeatShare * 100, { digits: 0 })}</span>,
    },
    {
      key: 'avgRisk',
      label: t('offenders.crew.colRisk'),
      sortable: true,
      align: 'right',
      width: 84,
      render: (c) => <span className="num">{c.avgRisk === null ? '—' : fmtNum(c.avgRisk, 1)}</span>,
    },
    {
      key: 'score',
      label: t('offenders.crew.colScore'),
      sortable: true,
      align: 'right',
      width: 128,
      render: (c) => <ScoreMeter score={c.score} band={c.band} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile
          label={t('offenders.crew.kpiCrews')}
          value={kpi.crews}
          loading={isLoading}
          hint={t('offenders.crew.kpiCrewsHint')}
        />
        <KpiTile
          label={t('offenders.crew.kpiOrganised')}
          value={kpi.organised}
          accent="red"
          loading={isLoading}
          hint={t('offenders.crew.kpiOrganisedHint')}
        />
        <KpiTile
          label={t('offenders.crew.kpiMembers')}
          value={kpi.members}
          accent="teal"
          loading={isLoading}
          hint={t('offenders.crew.kpiMembersHint')}
        />
        <KpiTile
          label={t('offenders.crew.kpiTopScore')}
          value={fmtNum(kpi.topScore, 1)}
          loading={isLoading}
          hint={t('offenders.crew.kpiTopScoreHint')}
        />
      </div>

      <Card
        padded={false}
        title={t('offenders.crew.title')}
        subtitle={t('offenders.crew.subtitle', { n: fmtInt(crews.length) })}
        actions={(
          <>
            <SegmentedControl
              ariaLabel={t('offenders.crew.bandAria')}
              value={band}
              onChange={setBand}
              options={bandOptions}
            />
            <button
              type="button"
              className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]"
              onClick={exportCsv}
              disabled={isLoading || !sorted.length}
            >
              {t('common.action.exportCsv')}
            </button>
          </>
        )}
      >
        {error ? (
          <EmptyState
            title={t('offenders.crew.error')}
            message={error.message}
            action={<button type="button" className="btn" onClick={() => refetch()}>{t('common.action.retry')}</button>}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={sorted}
            rowKey="id"
            loading={isLoading}
            exportable={false}
            emptyMessage={t('offenders.crew.empty')}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(c) => setOpenCrew(c)}
          />
        )}
      </Card>

      <Card
        title={t('offenders.crew.methodTitle')}
        subtitle={t('offenders.crew.methodSub')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-2.5">
          {CREW_DRIVERS.map((d) => (
            <div key={d.id} className="bg-canvas/60 border border-grid rounded-lg px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-ink truncate">{t(`offenders.driver.${d.id}`)}</p>
                <span className="num text-[10px] text-muted shrink-0">{fmtPct(d.weight * 100, { digits: 0 })}</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-4">{t(`offenders.driver.${d.id}.hint`)}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-3 leading-5">
          <Tooltip label={t('offenders.crew.samplingHint')}>
            <Badge tone="slate" className="mr-1.5">{t('offenders.crew.samplingBadge')}</Badge>
          </Tooltip>
          {t('offenders.crew.methodNote', { n: fmtInt(graphSampled) })}
        </p>
      </Card>

      <CrewSheet
        crew={openCrew}
        analysis={analysis}
        onClose={() => setOpenCrew(null)}
      />
    </div>
  );
}
