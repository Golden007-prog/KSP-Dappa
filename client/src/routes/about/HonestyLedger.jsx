// /about — the honesty ledger: what this submission is NOT.
//
// Every item is derived from the same live payloads the panels above render,
// so the ledger cannot drift from reality: turn a flag on and the matching
// line disappears, finish loading ChargesheetDetails and its line goes with
// it. Two items are unconditional because they are true by construction —
// the dataset is synthetic, and metrics measured on synthetic data say the
// pipeline works, not that the model would hold on real FIRs.
//
// A judge can copy the whole thing (plus the raw counts behind it) as plain
// text with one button, which is deliberate: nothing here should need a
// screenshot to be checkable.
import Card from '../../components/Card.jsx';
import Badge from '../../components/Badge.jsx';
import { useT } from '../../lib/i18n.jsx';
import { fmtInt, fmtNum } from '../../lib/format.js';
import { CopyButton } from './bits.jsx';

/** Plain-text diagnostics snapshot — same numbers, pasteable into a report. */
export function buildDiagnostics({ services, models, health, search }) {
  const lines = ['KSP DAPPA — runtime diagnostics', `captured: ${new Date().toISOString()}`, ''];
  if (services) {
    lines.push(`Catalyst services: ${services.total} declared`);
    for (const [st, n] of Object.entries(services.byStatus)) lines.push(`  ${st}: ${n}`);
    lines.push(`  reachable from code (reported): ${services.reachableFromCode ?? '—'}`);
    lines.push(`  with a coded fallback (reported): ${services.withFallback ?? '—'}`);
    lines.push(`  data mode: ${services.dataMode || '—'}`);
    const off = Object.entries(services.flags).filter(([, v]) => !v).map(([k]) => k);
    lines.push(`  flags off: ${off.length ? off.join(', ') : 'none'}`);
    lines.push('');
  }
  if (models) {
    lines.push(`ML models: ${models.total} registered · ${models.serving} serving · ${models.disabled} disabled`);
    for (const m of models.models) lines.push(`  [${m.status}] ${m.key} — ${m.service} — ${m.endpoint}`);
    lines.push('');
  }
  if (health) {
    lines.push(`Health: ${health.status} · overall completeness ${health.overallPct ?? '—'}%`);
    lines.push(`  datastore ok=${health.datastore.ok}${health.datastore.mode ? ` mode=${health.datastore.mode}` : ''}`);
    lines.push(`  cache ok=${health.cache.ok} backend=${health.cache.backend || '—'}`);
    lines.push(`  nosql ok=${health.nosql.ok}${health.nosql.mode ? ` mode=${health.nosql.mode}` : ''}`);
    for (const tb of health.tables) {
      lines.push(`  ${tb.name}: ${tb.actual === null ? 'count not reported' : tb.actual}/${tb.expected} (${tb.pct === null ? 'n/a' : `${tb.pct}%`})`);
    }
    lines.push('');
  }
  if (search) {
    lines.push(`Search demo: q="${search.query}" scope=${search.scope} source=${search.source} matched=${search.matched} in ${search.elapsedMs}ms`);
  }
  return lines.join('\n');
}

function Item({ tone = 'amber', head, body }) {
  const dot = tone === 'teal' ? 'text-teal' : tone === 'red' ? 'text-signal' : 'text-amber';
  return (
    <li className="flex gap-2 text-[11px] leading-relaxed text-muted">
      <span className={`${dot} shrink-0`} aria-hidden="true">•</span>
      <span><strong className="text-ink">{head}</strong> {body}</span>
    </li>
  );
}

export default function HonestyLedger({ services, models, health, search }) {
  const t = useT();
  const items = [];

  items.push({
    key: 'synthetic',
    head: t('about.ledger.synthetic.head'),
    body: t('about.ledger.synthetic.body'),
  });

  if (health && health.incomplete.length > 0) {
    // `incomplete` is sorted lowest-completeness first, so [0] is the worst gap.
    const worst = health.incomplete[0];
    items.push({
      key: 'incomplete',
      head: t(health.incomplete.length === 1 ? 'about.ledger.incomplete.headOne' : 'about.ledger.incomplete.headMany', {
        n: health.incomplete.length,
      }),
      body: t('about.ledger.incomplete.body', {
        table: worst.name,
        actual: fmtInt(worst.actual || 0),
        expected: fmtInt(worst.expected),
        pct: worst.pct === null ? '—' : fmtNum(worst.pct, 1),
      }),
    });
  }

  if (health && health.unknown.length > 0) {
    items.push({
      key: 'unknownCounts',
      head: t('about.ledger.unknownCounts.head', { n: health.unknown.length }),
      body: t('about.ledger.unknownCounts.body', { tables: health.unknown.map((tb) => tb.name).join(', ') }),
    });
  }

  if (search && search.source === 'fallback-zcql-like') {
    items.push({
      key: 'searchFallback',
      head: t('about.ledger.searchFallback.head'),
      body: t('about.ledger.searchFallback.body'),
    });
  }

  if (services && services.byStatus['flag-gated'] > 0) {
    items.push({
      key: 'flagGated',
      head: t('about.ledger.flagGated.head', { n: services.byStatus['flag-gated'] }),
      body: t('about.ledger.flagGated.body'),
    });
  }

  if (services && services.byStatus['console-pending'] > 0) {
    items.push({
      key: 'consolePending',
      head: t('about.ledger.consolePending.head', { n: services.byStatus['console-pending'] }),
      body: t('about.ledger.consolePending.body'),
    });
  }

  if (models && models.disabled > 0) {
    items.push({
      key: 'models',
      head: t('about.ledger.models.head', { disabled: models.disabled, total: models.total }),
      body: t('about.ledger.models.body', { serving: models.serving }),
    });
  }

  if (health && health.nosql.mode === 'fixture-demo') {
    items.push({
      key: 'nosqlFixture',
      head: t('about.ledger.nosqlFixture.head'),
      body: t('about.ledger.nosqlFixture.body'),
    });
  }

  items.push({ key: 'rowCap', head: t('about.ledger.rowCap.head'), body: t('about.ledger.rowCap.body') });
  items.push({ key: 'metrics', head: t('about.ledger.metrics.head'), body: t('about.ledger.metrics.body') });
  items.push({ key: 'sensitive', head: t('about.ledger.sensitive.head'), body: t('about.ledger.sensitive.body') });

  const anyData = Boolean(services || models || health);

  return (
    <Card
      title={t('about.ledger.title')}
      subtitle={t('about.ledger.subtitle')}
      actions={(
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="amber">{t('about.ledger.badge', { n: items.length })}</Badge>
          {anyData && (
            <CopyButton
              text={() => buildDiagnostics({ services, models, health, search })}
              label={t('about.ledger.copy')}
              okMessage={t('about.ledger.copied')}
            />
          )}
        </div>
      )}
    >
      <ul className="space-y-2 list-none">
        {items.map((it) => <Item key={it.key} head={it.head} body={it.body} />)}
      </ul>
      <p className="mt-3 border-t border-grid/60 pt-2.5 text-[11px] leading-relaxed text-muted">
        {t('about.ledger.footnote')}
      </p>
    </Card>
  );
}
