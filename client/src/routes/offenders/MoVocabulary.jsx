// Learned MO vocabulary — the mined tag lists turned into something with
// structure: what is real signal versus an identity echo, which tags lock
// together, and which recurring signatures those clusters describe.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import DataTable from '../../components/DataTable.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import KpiTile from '../../components/KpiTile.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';
import LoadingSkeleton from '../../components/LoadingSkeleton.jsx';
import Tooltip from '../../components/Tooltip.jsx';
import { fmtInt, fmtNum, fmtPct } from '../../lib/format.js';
import { useT } from '../../lib/i18n.jsx';

const TAG_ROWS = 40;

/** Family card — a recurring signature, its member tags and its reach. */
function FamilyCard({ family, rowsByKey, onPickTag, selected }) {
  const t = useT();
  const people = (family.keys || [])
    .map((k) => rowsByKey.get(String(k)))
    .filter(Boolean)
    .sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))
    .slice(0, 4);

  return (
    <div className="bg-canvas/60 border border-grid rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink leading-5 min-w-0">{family.label}</p>
        <Tooltip label={t('offenders.vocab.liftHint')}>
          <Badge tone="amber">{t('offenders.vocab.liftBadge', { n: fmtNum(family.avgLift, 0) })}</Badge>
        </Tooltip>
      </div>

      <div className="flex flex-wrap gap-1">
        {family.tags.slice(0, 12).map((m) => (
          <button
            key={m.tag}
            type="button"
            onClick={() => onPickTag(m.tag)}
            className={`chip !py-0 text-[10px] min-h-[28px] transition-colors hover:border-amber/50 ${
              selected === m.tag ? '!border-amber text-amber' : ''
            }`}
            title={t('offenders.vocab.tagChipHint', { n: fmtInt(m.offenders) })}
          >
            {m.tag}
            <span className="num text-muted">{fmtInt(m.offenders)}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5 mt-auto">
        <div className="rounded-md bg-panel/70 border border-grid/60 px-2 py-1">
          <p className="text-[9px] uppercase tracking-wide text-muted">{t('offenders.vocab.famPeople')}</p>
          <p className="num text-xs text-ink">{fmtInt(family.offenders)}</p>
        </div>
        <div className="rounded-md bg-panel/70 border border-grid/60 px-2 py-1">
          <p className="text-[9px] uppercase tracking-wide text-muted">{t('offenders.vocab.famCases')}</p>
          <p className="num text-xs text-ink">{fmtInt(family.cases)}</p>
        </div>
        <div className="rounded-md bg-panel/70 border border-grid/60 px-2 py-1">
          <p className="text-[9px] uppercase tracking-wide text-muted">{t('offenders.vocab.famDistricts')}</p>
          <p className="num text-xs text-ink">{fmtInt(family.districts)}</p>
        </div>
      </div>

      {people.length > 0 && (
        <p className="text-[10px] text-muted leading-4">
          {t('offenders.vocab.famTop')}{' '}
          {people.map((p, i) => (
            <span key={p.personKey}>
              {i > 0 && ' · '}
              <Link
                to={`/offenders/${encodeURIComponent(p.personKey)}`}
                className="text-ink hover:text-amber transition-colors"
              >
                {p.canonicalName || p.personKey}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export default function MoVocabulary({ analysis }) {
  const t = useT();
  const [view, setView] = useState('signal');
  const [picked, setPicked] = useState(null);

  const { vocab, rowsByKey, isLoading, error, refetch, rows } = analysis;

  const echoStats = useMemo(() => {
    if (!vocab) return [];
    const freq = new Map();
    for (const list of vocab.echoByKey.values()) {
      for (const tag of list) freq.set(tag, (freq.get(tag) || 0) + 1);
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, offenders]) => ({ tag, offenders, cases: null, districts: null, avgRisk: null }));
  }, [vocab]);

  const tagRows = useMemo(() => {
    if (!vocab) return [];
    const list = view === 'signal' ? vocab.stats : echoStats;
    return list.slice(0, TAG_ROWS);
  }, [vocab, view, echoStats]);

  const pickedCarriers = useMemo(() => {
    if (!picked || !vocab) return [];
    const hit = vocab.stats.find((s) => s.tag === picked);
    return (hit?.keys || [])
      .map((k) => rowsByKey.get(String(k)))
      .filter(Boolean)
      .sort((a, b) => (Number(b.riskScore) || 0) - (Number(a.riskScore) || 0))
      .slice(0, 12);
  }, [picked, vocab, rowsByKey]);

  if (error) {
    return (
      <Card>
        <EmptyState
          title={t('offenders.vocab.error')}
          message={error.message}
          action={<button type="button" className="btn" onClick={() => refetch()}>{t('common.action.retry')}</button>}
        />
      </Card>
    );
  }

  if (isLoading || !vocab) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <KpiTile key={i} label="…" value={0} loading />)}
        </div>
        <Card><LoadingSkeleton lines={6} /></Card>
      </div>
    );
  }

  const tagColumns = [
    { key: 'tag', label: t('offenders.vocab.colTag'), render: (r) => <span className="text-ink">{r.tag}</span> },
    { key: 'offenders', label: t('offenders.vocab.colPeople'), sortable: true, align: 'right', width: 90 },
    {
      key: 'cases',
      label: t('offenders.vocab.colCases'),
      sortable: true,
      align: 'right',
      width: 90,
      render: (r) => <span className="num">{r.cases === null ? '—' : fmtInt(r.cases)}</span>,
    },
    {
      key: 'districts',
      label: t('offenders.vocab.colDistricts'),
      sortable: true,
      align: 'right',
      width: 100,
      render: (r) => <span className="num">{r.districts === null ? '—' : fmtInt(r.districts)}</span>,
    },
    {
      key: 'avgRisk',
      label: t('offenders.vocab.colRisk'),
      sortable: true,
      align: 'right',
      width: 90,
      render: (r) => <span className="num">{r.avgRisk === null ? '—' : fmtNum(r.avgRisk, 1)}</span>,
    },
  ];

  const pairColumns = [
    {
      key: 'pair',
      label: t('offenders.vocab.colPair'),
      render: (p) => (
        <span className="text-ink">
          {p.a} <span className="text-amber">+</span> {p.b}
        </span>
      ),
    },
    { key: 'count', label: t('offenders.vocab.colTogether'), sortable: true, align: 'right', width: 100 },
    {
      key: 'lift',
      label: t('offenders.vocab.colLift'),
      sortable: true,
      align: 'right',
      width: 90,
      render: (p) => <span className="num text-ink">{fmtNum(p.lift, 0)}×</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiTile
          label={t('offenders.vocab.kpiVocab')}
          value={vocab.stats.length}
          hint={t('offenders.vocab.kpiVocabHint')}
        />
        <KpiTile
          label={t('offenders.vocab.kpiNoise')}
          value={fmtPct(vocab.noiseShare * 100, { digits: 0 })}
          accent="red"
          hint={t('offenders.vocab.kpiNoiseHint', { n: fmtInt(vocab.echoCount) })}
        />
        <KpiTile
          label={t('offenders.vocab.kpiFamilies')}
          value={vocab.families.length}
          accent="teal"
          hint={t('offenders.vocab.kpiFamiliesHint')}
        />
        <KpiTile
          label={t('offenders.vocab.kpiCovered')}
          value={vocab.profilesWithSignal}
          hint={t('offenders.vocab.kpiCoveredHint', { n: fmtInt(rows.length) })}
        />
      </div>

      <Card
        title={t('offenders.vocab.hygieneTitle')}
        subtitle={t('offenders.vocab.hygieneSub')}
      >
        <p className="text-xs text-muted leading-5">
          {t('offenders.vocab.hygieneBody', {
            pct: fmtPct(vocab.noiseShare * 100, { digits: 0 }),
            echo: fmtInt(vocab.echoCount),
            total: fmtInt(vocab.total),
            lex: fmtInt(vocab.lexicon.size),
          })}
        </p>
        <div className="mt-2.5 h-2 rounded-full bg-grid/60 overflow-hidden flex" role="img" aria-label={t('offenders.vocab.hygieneAria')}>
          <div className="h-full bg-teal/70" style={{ width: `${(1 - vocab.noiseShare) * 100}%` }} />
          <div className="h-full bg-signal/60" style={{ width: `${vocab.noiseShare * 100}%` }} />
        </div>
        <div className="flex flex-wrap gap-3 mt-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-2 w-2 rounded-full bg-teal/70" />
            {t('offenders.vocab.legendSignal', { n: fmtInt(vocab.signalCount) })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="h-2 w-2 rounded-full bg-signal/60" />
            {t('offenders.vocab.legendEcho', { n: fmtInt(vocab.echoCount) })}
          </span>
        </div>
      </Card>

      <Card
        title={t('offenders.vocab.familiesTitle')}
        subtitle={t('offenders.vocab.familiesSub', { n: fmtInt(vocab.families.length) })}
      >
        {vocab.families.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {vocab.families.map((f) => (
              <FamilyCard
                key={f.id}
                family={f}
                rowsByKey={rowsByKey}
                selected={picked}
                onPickTag={(tag) => setPicked((prev) => (prev === tag ? null : tag))}
              />
            ))}
          </div>
        ) : (
          <EmptyState compact title={t('offenders.vocab.noFamilies')} message={t('offenders.vocab.noFamiliesMsg')} />
        )}
      </Card>

      {picked && (
        <Card
          title={t('offenders.vocab.carriersTitle', { tag: picked })}
          subtitle={t('offenders.vocab.carriersSub')}
          actions={(
            <button type="button" className="btn !py-1.5 !px-2.5 text-xs min-h-[40px]" onClick={() => setPicked(null)}>
              {t('common.action.clear')}
            </button>
          )}
        >
          {pickedCarriers.length ? (
            <ul className="divide-y divide-grid/50">
              {pickedCarriers.map((p) => (
                <li key={p.personKey} className="py-1.5 first:pt-0 last:pb-0">
                  <Link
                    to={`/offenders/${encodeURIComponent(p.personKey)}`}
                    className="flex items-center gap-2 min-h-[36px] group"
                  >
                    <span className="text-xs text-ink truncate flex-1 group-hover:text-amber transition-colors">
                      {p.canonicalName || p.personKey}
                    </span>
                    <Badge tone="slate">{t('offenders.crewSheet.caseBadge', { n: fmtInt(p.caseCount) })}</Badge>
                    <span className="num text-[11px] text-muted">{fmtNum(p.riskScore, 1)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title={t('offenders.vocab.noCarriers')} />
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Card
          padded={false}
          title={t('offenders.vocab.tagsTitle')}
          subtitle={t('offenders.vocab.tagsSub', { n: fmtInt(TAG_ROWS) })}
          actions={(
            <SegmentedControl
              ariaLabel={t('offenders.vocab.viewAria')}
              value={view}
              onChange={setView}
              options={[
                { value: 'signal', label: t('offenders.vocab.viewSignal') },
                { value: 'echo', label: t('offenders.vocab.viewEcho') },
              ]}
            />
          )}
        >
          <DataTable
            columns={tagColumns}
            rows={tagRows}
            rowKey="tag"
            exportFilename="dappa-mo-vocabulary"
            emptyMessage={t('offenders.vocab.noTags')}
            onRowClick={view === 'signal' ? (r) => setPicked((prev) => (prev === r.tag ? null : r.tag)) : undefined}
          />
        </Card>

        <Card
          padded={false}
          title={t('offenders.vocab.pairsTitle')}
          subtitle={t('offenders.vocab.pairsSub')}
        >
          <DataTable
            columns={pairColumns}
            rows={vocab.pairs.slice(0, TAG_ROWS)}
            rowKey={(p) => `${p.a}|${p.b}`}
            exportFilename="dappa-mo-pairs"
            emptyMessage={t('offenders.vocab.noPairs')}
          />
        </Card>
      </div>
    </div>
  );
}
