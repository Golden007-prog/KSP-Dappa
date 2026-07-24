// /alerts — mobile options sheet (the sm+ toolbar shows these inline): group-by
// and sort pickers, the sound / desktop notification opt-ins and the test
// notification button, all with comfortable touch targets.
import Sheet from '../../components/Sheet.jsx';
import SegmentedControl from '../../components/SegmentedControl.jsx';

function ToggleRow({ on, onClick, label, hint }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-grid px-3 py-3 min-h-[48px] text-left hover:border-primary/50 transition-colors"
    >
      <span className="min-w-0">
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-muted mt-0.5">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-grid'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-panel shadow-card transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function OptionsSheet({
  open, onClose,
  groupOptions, group, onGroup,
  sortOptions, sort, onSort,
  notify, onToggleSound, onToggleDesktop, desktopAvailable,
  onTestNotification,
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Alert options">
      <div className="space-y-4 px-1 pb-2">
        <div className="space-y-1.5">
          <p className="text-xs text-muted">Group by</p>
          <SegmentedControl options={groupOptions} value={group} onChange={onGroup} ariaLabel="Group alerts by" size="md" />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted">Sort by</p>
          <SegmentedControl options={sortOptions} value={sort} onChange={onSort} ariaLabel="Sort alerts by" size="md" />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted">Notifications (checked every 60 s while on)</p>
          <ToggleRow
            on={notify.sound}
            onClick={onToggleSound}
            label="Sound"
            hint="Chime when new anomalies arrive"
          />
          {desktopAvailable && (
            <ToggleRow
              on={notify.desktop}
              onClick={onToggleDesktop}
              label="Desktop notifications"
              hint="Pop up even when this tab is in the background"
            />
          )}
          <button
            type="button"
            className="btn w-full justify-center min-h-[48px]"
            onClick={onTestNotification}
          >
            Send a test notification
          </button>
        </div>
      </div>
    </Sheet>
  );
}
