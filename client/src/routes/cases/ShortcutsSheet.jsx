// Keyboard shortcut reference for the Case Explorer + FIR detail, opened with
// '?' or the keyboard icon in the results row.
import Sheet from '../../components/Sheet.jsx';
import { useT } from '../../lib/i18n.jsx';

function Key({ children }) {
  return (
    <kbd className="num inline-flex min-w-[1.6rem] items-center justify-center rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[11px] text-ink">
      {children}
    </kbd>
  );
}

// Key literals ('/', 'head:theft|robbery') are what the user actually types —
// never translated. Only the descriptions are.
const GROUPS = [
  {
    titleKey: 'cases.shortcuts.groupExplorer',
    rows: [
      [['/'], 'cases.shortcuts.focusSearch'],
      [['Esc'], 'cases.shortcuts.clearSearch'],
      [['e'], 'cases.shortcuts.export'],
      [['c'], 'cases.shortcuts.compare'],
      [['b'], 'cases.shortcuts.bulk'],
      [['q'], 'cases.shortcuts.builder'],
      [['?'], 'cases.shortcuts.help'],
      [['Enter'], 'cases.shortcuts.openRow'],
    ],
  },
  {
    titleKey: 'cases.shortcuts.groupDetail',
    rows: [
      [['←', '→'], 'cases.shortcuts.prevNext'],
    ],
  },
  {
    titleKey: 'cases.shortcuts.groupSyntax',
    rows: [
      [['a b'], 'cases.shortcuts.and'],
      [['head:theft|robbery'], 'cases.shortcuts.scope'],
      [['-word'], 'cases.shortcuts.exclude'],
      [['#123'], 'cases.shortcuts.byId'],
    ],
  },
];

export default function ShortcutsSheet({ open, onClose }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t('cases.shortcuts.title')}>
      <div className="space-y-4 px-1 pb-1">
        {GROUPS.map((g) => (
          <div key={g.titleKey}>
            <p className="eyebrow mb-1.5">{t(g.titleKey)}</p>
            <dl className="space-y-1.5">
              {g.rows.map(([keys, descKey]) => (
                <div key={descKey} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="flex items-center gap-1 shrink-0">
                    {keys.map((k) => <Key key={k}>{k}</Key>)}
                  </dt>
                  <dd className="text-muted text-xs text-right min-w-0">{t(descKey)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p className="text-[10px] text-muted">{t('cases.shortcuts.fields')}</p>
      </div>
    </Sheet>
  );
}
