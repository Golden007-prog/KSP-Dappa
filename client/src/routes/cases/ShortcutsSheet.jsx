// Keyboard shortcut reference for the Case Explorer + FIR detail, opened with
// '?' or the keyboard icon in the results row.
import Sheet from '../../components/Sheet.jsx';

function Key({ children }) {
  return (
    <kbd className="num inline-flex min-w-[1.6rem] items-center justify-center rounded border border-grid bg-base/60 px-1.5 py-0.5 text-[11px] text-ink">
      {children}
    </kbd>
  );
}

const GROUPS = [
  {
    title: 'Explorer',
    rows: [
      [['/'], 'focus the search box'],
      [['Esc'], 'clear the search, then blur it'],
      [['e'], 'export the current filter as CSV'],
      [['c'], 'open the compare sheet (2+ cases selected)'],
      [['?'], 'this shortcut reference'],
      [['Enter'], 'open the focused table row'],
    ],
  },
  {
    title: 'FIR detail',
    rows: [
      [['←', '→'], 'previous / next case in the filtered list'],
    ],
  },
  {
    title: 'Search syntax',
    rows: [
      [['a b'], 'terms AND together'],
      [['head:theft|robbery'], 'scope a term to a column, | for OR'],
      [['-word'], 'exclude matches'],
      [['#123'], 'exact CaseMasterID (with an open-case chip)'],
    ],
  },
];

export default function ShortcutsSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts & search syntax">
      <div className="space-y-4 px-1 pb-1">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="eyebrow mb-1.5">{g.title}</p>
            <dl className="space-y-1.5">
              {g.rows.map(([keys, desc]) => (
                <div key={desc} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="flex items-center gap-1 shrink-0">
                    {keys.map((k) => <Key key={k}>{k}</Key>)}
                  </dt>
                  <dd className="text-muted text-xs text-right min-w-0">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p className="text-[10px] text-muted">Search fields: no · case · district · station · head · subhead · status · gravity.</p>
      </div>
    </Sheet>
  );
}
