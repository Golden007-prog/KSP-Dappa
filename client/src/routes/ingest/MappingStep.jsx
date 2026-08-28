// Step 3 — column mapping. Auto-mapped by header similarity, overridable per
// column, with presets (CCTNS IIF-1, flagged unverified) and saved templates
// in localStorage. Shows the privacy guard's classification of every source
// column the schema does not name BEFORE anything is sent.
import { useMemo, useState } from 'react';
import Badge from '../../components/Badge.jsx';
import { useT } from '../../lib/i18n.jsx';
import { classifyExtraHeader } from './localValidate.js';
import { loadTemplates, saveTemplate, deleteTemplate } from './mappingStore.js';

const SRC_TONE = { exact: 'teal', preset: 'teal', alias: 'teal', fuzzy: 'amber', none: 'red', manual: 'neutral', template: 'teal' };

export default function MappingStep({ tableDef, headers, mapping, sources, scores, onChange, presets, presetId, onPreset, options, onOptions }) {
  const t = useT();
  const [templates, setTemplates] = useState(() => loadTemplates(tableDef.name));
  const [tplName, setTplName] = useState('');

  const usedHeaders = useMemo(() => new Set(Object.values(mapping).filter(Boolean)), [mapping]);
  const extras = useMemo(() => headers.filter((h) => h && !usedHeaders.has(h)).map((h) => ({ header: h, kind: classifyExtraHeader(h) })), [headers, usedHeaders]);
  const missingRequired = tableDef.columns.filter((c) => c.required && !mapping[c.name]);

  const setOne = (col, header) => {
    const next = { ...mapping, [col]: header || null };
    const nextSources = { ...sources, [col]: header ? 'manual' : 'none' };
    onChange(next, nextSources);
  };
  const applyTemplate = (tpl) => {
    const next = {};
    const src = {};
    for (const c of tableDef.columns) {
      const h = tpl.mapping[c.name];
      next[c.name] = h && headers.includes(h) ? h : null;
      src[c.name] = next[c.name] ? 'template' : 'none';
    }
    onChange(next, src);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          <span className="block mb-1">{t('ingest.map.preset')}</span>
          <select className="input-dark min-h-[44px] sm:min-h-[36px]" value={presetId || ''} onChange={(e) => onPreset(e.target.value || null)} aria-label={t('ingest.map.preset')}>
            <option value="">{t('ingest.map.presetAuto')}</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}{p.verified ? '' : ` — ${t('ingest.map.unverified')}`}</option>)}
          </select>
        </label>
        {presetId && presets.find((p) => p.id === presetId) && !presets.find((p) => p.id === presetId).verified && (
          <p className="text-xs text-amber max-w-prose">{t('ingest.map.presetNote')}</p>
        )}
        <label className="text-xs text-muted">
          <span className="block mb-1">{t('ingest.map.templates')}</span>
          <select
            className="input-dark min-h-[44px] sm:min-h-[36px]"
            value=""
            onChange={(e) => { const tpl = templates.find((x) => x.name === e.target.value); if (tpl) applyTemplate(tpl); }}
            aria-label={t('ingest.map.templates')}
          >
            <option value="">{templates.length ? t('ingest.map.applyTemplate') : t('ingest.map.noTemplates')}</option>
            {templates.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
          </select>
        </label>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); if (!tplName.trim()) return; setTemplates(saveTemplate({ name: tplName.trim(), table: tableDef.name, mapping, headers })); setTplName(''); }}
        >
          <label className="text-xs text-muted">
            <span className="block mb-1">{t('ingest.map.saveAs')}</span>
            <input className="input-dark min-h-[44px] sm:min-h-[36px] w-40" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={t('ingest.map.saveAsPlaceholder')} maxLength={60} />
          </label>
          <button type="submit" className="btn min-h-[44px] sm:min-h-[36px]" disabled={!tplName.trim()}>{t('ingest.map.save')}</button>
        </form>
        {templates.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t('ingest.map.templates')}>
            {templates.map((x) => (
              <li key={x.name} className="inline-flex items-center gap-1 rounded-full border border-grid bg-panel px-2 py-0.5 text-[11px]">
                <span>{x.name}</span>
                <button type="button" className="text-muted hover:text-signal min-h-[24px] min-w-[24px]" aria-label={t('ingest.map.deleteTemplate', { name: x.name })} onClick={() => setTemplates(deleteTemplate(tableDef.name, x.name))}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-grid">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-panel-raised text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="text-left px-3 py-2">{t('ingest.map.colTarget')}</th>
              <th scope="col" className="text-left px-3 py-2">{t('ingest.map.colType')}</th>
              <th scope="col" className="text-left px-3 py-2">{t('ingest.map.colSource')}</th>
              <th scope="col" className="text-left px-3 py-2">{t('ingest.map.colHow')}</th>
            </tr>
          </thead>
          <tbody>
            {tableDef.columns.map((c) => {
              const src = sources[c.name] || 'none';
              return (
                <tr key={c.name} className="border-t border-grid/60">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <span className="font-medium text-ink">{c.name}</span>
                    {c.required && <span className="text-signal ml-1" aria-label={t('ingest.map.required')}>*</span>}
                    <span className="ml-1.5 inline-flex gap-1">
                      {c.pk && <Badge tone="neutral">PK</Badge>}
                      {c.fk && <Badge tone="slate">FK→{c.fk}</Badge>}
                      {c.pii && <Badge tone="amber">{t('ingest.badge.pii')}</Badge>}
                      {c.neverUsed && <Badge tone="red">{t('ingest.badge.neverUsed')}</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 num text-xs text-muted whitespace-nowrap">{c.type}{c.max ? `(${c.max})` : ''}</td>
                  <td className="px-3 py-1.5">
                    <select
                      className="input-dark min-h-[44px] sm:min-h-[32px] w-full max-w-[16rem]"
                      value={mapping[c.name] || ''}
                      onChange={(e) => setOne(c.name, e.target.value)}
                      aria-label={t('ingest.map.sourceFor', { col: c.name })}
                    >
                      <option value="">{t('ingest.map.notMapped')}</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge tone={SRC_TONE[src] || 'neutral'}>
                      {t(`ingest.map.src.${src}`)}{src === 'fuzzy' && scores[c.name] ? ` ${Math.round(scores[c.name] * 100)}%` : ''}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {missingRequired.length > 0 && (
        <p role="alert" className="text-sm text-signal">{t('ingest.map.missingRequired', { list: missingRequired.map((c) => c.name).join(', ') })}</p>
      )}

      <section className="rounded-xl border border-grid bg-panel p-3 space-y-2" aria-labelledby="ingest-guard-h">
        <h3 id="ingest-guard-h" className="text-sm font-semibold text-ink">{t('ingest.guard.title')}</h3>
        <p className="text-xs text-muted">{t('ingest.guard.lead')}</p>
        {extras.length === 0 ? (
          <p className="text-xs text-muted">{t('ingest.guard.noExtras')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {extras.map((x) => (
              <li key={x.header}>
                <Badge tone={x.kind === 'never-used' ? 'red' : x.kind === 'pii' ? 'amber' : 'neutral'}>
                  {x.header} — {t(`ingest.guard.kind.${x.kind}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {tableDef.columns.some((c) => c.neverUsed) && (
          <label className="flex items-center gap-2 text-sm text-ink min-h-[44px]">
            <input type="checkbox" checked={options.dropSensitive !== false} onChange={(e) => onOptions({ ...options, dropSensitive: e.target.checked })} />
            <span>{t('ingest.guard.dropSensitive', { cols: tableDef.columns.filter((c) => c.neverUsed).map((c) => c.name).join(', ') })}</span>
          </label>
        )}
        {tableDef.geo && (
          <label className="flex items-center gap-2 text-sm text-ink min-h-[44px]">
            <input type="checkbox" checked={Boolean(options.strictGeo)} onChange={(e) => onOptions({ ...options, strictGeo: e.target.checked })} />
            <span>{t('ingest.guard.strictGeo')}</span>
          </label>
        )}
      </section>
    </div>
  );
}
