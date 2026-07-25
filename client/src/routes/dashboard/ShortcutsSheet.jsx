// "?" keyboard-shortcuts sheet — documents every dashboard shortcut plus the
// global palette hotkey. Rendered in the shared Sheet (Esc / overlay close).
import Sheet from '../../components/Sheet.jsx';
import { useT } from '../../lib/i18n.jsx';
import { GO_ROUTES } from './useDashShortcuts.js';

function Key({ children }) {
  return (
    <kbd className="num inline-flex min-w-[1.6rem] items-center justify-center rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[11px] text-ink">
      {children}
    </kbd>
  );
}

function Row({ keys, label }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="flex items-center gap-1">{keys}</span>
    </li>
  );
}

export default function ShortcutsSheet({ open, onClose }) {
  const t = useT();
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');
  return (
    <Sheet open={open} onClose={onClose} title={t('dashboard.shortcuts.title')}>
      <div className="space-y-4 px-1">
        <section>
          <p className="eyebrow mb-1">{t('dashboard.shortcuts.sectionDashboard')}</p>
          <ul className="divide-y divide-grid/40">
            <Row label={t('dashboard.shortcuts.openSheet')} keys={<Key>?</Key>} />
            <Row label={t('dashboard.shortcuts.refresh')} keys={<Key>r</Key>} />
            <Row label={t('dashboard.shortcuts.toggleAuto')} keys={<Key>a</Key>} />
            <Row label={t('dashboard.shortcuts.views')} keys={<Key>v</Key>} />
            <Row label={t('dashboard.shortcuts.print')} keys={<Key>b</Key>} />
            <Row label={t('dashboard.shortcuts.focusOmni')} keys={<Key>/</Key>} />
            <Row label={t('dashboard.shortcuts.restorePanel')} keys={<Key>Esc</Key>} />
            <Row
              label={t('dashboard.shortcuts.palette')}
              keys={<><Key>{isMac ? '⌘' : 'Ctrl'}</Key><Key>K</Key></>}
            />
            <Row label={t('dashboard.shortcuts.closeDialog')} keys={<Key>Esc</Key>} />
          </ul>
        </section>
        <section>
          <p className="eyebrow mb-1">{t('dashboard.shortcuts.sectionGoto')}</p>
          <ul className="divide-y divide-grid/40">
            {GO_ROUTES.map(([key]) => (
              <Row key={key} label={t(`dashboard.goto.${key}`)} keys={<><Key>g</Key><Key>{key}</Key></>} />
            ))}
          </ul>
        </section>
        <p className="text-[11px] text-muted">{t('dashboard.shortcuts.footnote')}</p>
      </div>
    </Sheet>
  );
}
