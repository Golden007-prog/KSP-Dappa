// /about — four live signals across the top of the page, each a jump link to
// the panel that proves it. Nothing here is a constant: every number is read
// back from the deployment on load, so a stale claim is impossible. While the
// introspection calls are in flight the tiles show a skeleton dash rather than
// an optimistic placeholder.
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';

function Tile({ value, sub, label, tone, onJump, jumpLabel, loading }) {
  const color = tone === 'teal' ? 'text-teal' : tone === 'amber' ? 'text-amber' : 'text-ink';
  return (
    <button
      type="button"
      onClick={onJump}
      aria-label={jumpLabel}
      className="flex min-h-[64px] flex-col justify-center rounded-lg border border-grid bg-canvas/40 px-3 py-2 text-left transition-colors hover:border-primary/60"
    >
      <span className="flex items-baseline gap-1">
        <span className={`num text-lg font-semibold ${loading ? 'text-muted' : color}`}>{loading ? '—' : value}</span>
        {!loading && sub && <span className="num text-[11px] text-muted">{sub}</span>}
      </span>
      <span className="mt-0.5 text-[10px] uppercase leading-tight tracking-wider text-muted">{label}</span>
    </button>
  );
}

export default function EvidenceStrip({ services, models, health, onJump }) {
  const t = useT();
  const caseRows = health && health.rowCounts ? health.rowCounts.CaseMaster : null;
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
      <Tile
        loading={!services}
        value={services ? fmtInt(services.byStatus.live) : '—'}
        sub={services ? `/ ${services.total}` : ''}
        label={t('about.evidence.services')}
        tone="teal"
        onJump={() => onJump('services')}
        jumpLabel={t('about.evidence.jump', { section: t('copilot.about.sec.services') })}
      />
      <Tile
        loading={!models}
        value={models ? fmtInt(models.serving) : '—'}
        sub={models ? `/ ${models.total}` : ''}
        label={t('about.evidence.models')}
        tone="teal"
        onJump={() => onJump('models')}
        jumpLabel={t('about.evidence.jump', { section: t('about.sec.models') })}
      />
      <Tile
        loading={!health}
        value={health && health.overallPct !== null ? `${fmtNum(health.overallPct, 1)}%` : '—'}
        label={t('about.evidence.completeness')}
        tone={health && health.overallPct !== null && health.overallPct >= 99.5 ? 'teal' : 'amber'}
        onJump={() => onJump('provenance')}
        jumpLabel={t('about.evidence.jump', { section: t('about.sec.provenance') })}
      />
      <Tile
        loading={!caseRows}
        value={caseRows ? fmtInt(caseRows) : '—'}
        label={t('about.evidence.corpus')}
        onJump={() => onJump('search')}
        jumpLabel={t('about.evidence.jump', { section: t('about.sec.search') })}
      />
    </div>
  );
}
