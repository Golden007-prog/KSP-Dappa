// Language switch — English · ಕನ್ನಡ · हिन्दी. State lives in LanguageProvider
// (lib/i18n.jsx), which persists to localStorage, sets <html lang> and swaps
// the number/date formatting locale.
// Each option renders in its OWN script so the choice is legible to a reader
// who cannot read the current one — the whole point of a language switcher.
// Props: className?, size? (forwarded to SegmentedControl), variant:
//   'segmented' (default, topbar/sheet) | 'compact' (icon-width, dense bars).
import SegmentedControl from './SegmentedControl.jsx';
import { useI18n } from '../lib/i18n.jsx';

const GLOBE = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </svg>
);

export default function LanguageToggle({ className = '', size = 'sm', variant = 'segmented' }) {
  const { lang, setLang, langs, t } = useI18n();
  return (
    <SegmentedControl
      ariaLabel={t('common.lang.change')}
      className={className}
      size={size}
      value={lang}
      onChange={setLang}
      options={langs.map((l, i) => ({
        value: l.code,
        // Native script for every option; the globe marks the control itself.
        label: variant === 'compact' ? l.short : l.native,
        icon: i === 0 && variant !== 'compact' ? GLOBE : undefined,
      }))}
    />
  );
}
