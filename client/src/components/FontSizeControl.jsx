// Text-size switch — Normal / Large (html[data-fontsize='large'] → 112.5 %
// root size, index.css). State lives in the shared UI store so the More
// sheet, the command-palette action and index.html's pre-paint agree; the
// preference persists as 'dappa-fontsize'. Browser zoom still works on top of
// it — this is the one-tap control for an officer on a shared station PC.
// Props: className?, size? (forwarded to SegmentedControl).
import SegmentedControl from './SegmentedControl.jsx';
import { useUiStore } from '../lib/store.js';
import { useT } from '../lib/i18n.jsx';

const glyph = (large) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={large ? 'M4 20 12 3l8 17M7.5 14h9' : 'M6 20l6-13 6 13M8.5 15h7'} />
  </svg>
);

export default function FontSizeControl({ className = '', size = 'sm' }) {
  const fontSize = useUiStore((s) => s.fontSize);
  const setFontSize = useUiStore((s) => s.setFontSize);
  const t = useT();
  return (
    <SegmentedControl
      ariaLabel={t('a11y.fontSize.label')}
      className={className}
      size={size}
      value={fontSize}
      onChange={(v) => setFontSize(v)}
      options={[
        { value: 'normal', label: t('a11y.fontSize.normal'), icon: glyph(false) },
        { value: 'large', label: t('a11y.fontSize.large'), icon: glyph(true) },
      ]}
    />
  );
}
