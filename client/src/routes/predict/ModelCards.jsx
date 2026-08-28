// /predict — model cards: a Sheet documenting every model behind this page in
// the ML-model-card idiom (purpose · inputs · method · metrics · caveats), so
// judges and officers can audit what each number means. Content is static by
// design — it documents the pipeline contract, while live metric badges (AUC,
// MAPE, source) render next to the predictions they belong to. Each card's
// prose lives in the trends namespace under predict.mc.<card>.*.
import { useState } from 'react';
import Sheet from '../../components/Sheet.jsx';
import Badge from '../../components/Badge.jsx';
import { useT } from '../../lib/i18n.jsx';

const CARDS = [
  { key: 'risk', tone: 'amber' },
  { key: 'outcome', tone: 'teal' },
  { key: 'forecast', tone: 'neutral' },
];

const SECTIONS = ['purpose', 'inputs', 'method', 'metrics', 'caveats'];

export default function ModelCards() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn min-h-[40px]" onClick={() => setOpen(true)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
        </svg>
        {t('trends.predict.mc.button')}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('trends.predict.mc.title')}>
        <div className="space-y-3 px-1 pb-1">
          <p className="text-xs text-muted">
            {t('trends.predict.mc.intro')}
          </p>
          {CARDS.map((c) => (
            <section key={c.key} className="rounded-lg border border-grid bg-canvas/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{t(`trends.predict.mc.${c.key}.name`)}</h3>
                <Badge tone={c.tone}>{t('trends.predict.mc.documented')}</Badge>
              </div>
              <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
                {SECTIONS.map((s) => (
                  <div key={s}>
                    <dt className="inline font-medium text-ink/80">{t(`trends.predict.mc.${s}`)}: </dt>
                    <dd className="inline text-muted">{t(`trends.predict.mc.${c.key}.${s}`)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}
