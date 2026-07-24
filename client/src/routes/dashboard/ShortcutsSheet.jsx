// "?" keyboard-shortcuts sheet — documents every dashboard shortcut plus the
// global palette hotkey. Rendered in the shared Sheet (Esc / overlay close).
import Sheet from '../../components/Sheet.jsx';
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
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts">
      <div className="space-y-4 px-1">
        <section>
          <p className="eyebrow mb-1">Dashboard</p>
          <ul className="divide-y divide-grid/40">
            <Row label="Open this shortcuts sheet" keys={<Key>?</Key>} />
            <Row label="Refresh every panel now" keys={<Key>r</Key>} />
            <Row label="Toggle auto-refresh" keys={<Key>a</Key>} />
            <Row label="Open saved views" keys={<Key>v</Key>} />
            <Row label="Print the situation brief" keys={<Key>b</Key>} />
            <Row label="Focus the Ask-DAPPA box" keys={<Key>/</Key>} />
            <Row label="Restore a maximized panel" keys={<Key>Esc</Key>} />
            <Row
              label="Command palette (everywhere)"
              keys={<><Key>{isMac ? '⌘' : 'Ctrl'}</Key><Key>K</Key></>}
            />
            <Row label="Close a dialog or sheet" keys={<Key>Esc</Key>} />
          </ul>
        </section>
        <section>
          <p className="eyebrow mb-1">Go to… (press g, then a letter)</p>
          <ul className="divide-y divide-grid/40">
            {GO_ROUTES.map(([key, , label]) => (
              <Row key={key} label={label} keys={<><Key>g</Key><Key>{key}</Key></>} />
            ))}
          </ul>
        </section>
        <p className="text-[11px] text-muted">
          Shortcuts pause automatically while you type in any input.
        </p>
      </div>
    </Sheet>
  );
}
