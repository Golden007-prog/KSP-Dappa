/** @type {import('tailwindcss').Config} */
// Design tokens are RGB triplets in index.css (`--t-*`) so every utility here
// (bg-panel, text-ink, border-grid, …) re-skins itself when <html> carries the
// .light class — route files keep the same class names in both themes.
// `primary` (electric blue) is the interactive chrome channel; `amber` stays
// the signal/risk channel — never swap them.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // The page-background key is `canvas`, NOT `base`: a colour named
        // `base` makes Tailwind emit `.text-base` twice — once as the
        // font-size utility, once as the colour — and the colour copy wins on
        // every `text-base text-amber` tile because the colour block is
        // ordered after `.text-amber`, painting the number in the page
        // background (invisible). `--t-base` stays the token name.
        canvas: v('--t-base'),
        panel: { DEFAULT: v('--t-panel'), raised: v('--t-panel-raised') },
        grid: v('--t-grid'),
        // ≥3:1 boundary for inputs/buttons (WCAG 1.4.11); hairlines stay `grid`
        control: v('--t-control'),
        ink: v('--t-ink'),
        muted: v('--t-muted'),
        primary: { DEFAULT: v('--t-primary'), on: v('--t-primary-on') },
        amber: { DEFAULT: v('--t-amber'), dim: '#8a6420' },
        signal: { DEFAULT: v('--t-signal'), dim: '#5b2530' },
        teal: { DEFAULT: v('--t-teal'), dim: '#1a4f4b' },
      },
      fontFamily: {
        // Inter covers Latin; per-glyph fallback picks up the platform's Indic
        // fonts for ಕನ್ನಡ without a single webfont request (external
        // network calls are barred, and system Indic fonts are universal:
        // Nirmala UI on Windows, Noto Sans * on Android/Linux, Sangam MN on Apple).
        sans: [
          'Inter',
          'Nirmala UI',
          'Noto Sans Kannada',
          'Kannada Sangam MN',
          'Tunga',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
      },
      spacing: {
        4.5: '1.125rem',
        13: '3.25rem',
        15: '3.75rem',
        18: '4.5rem',
      },
      zIndex: { 60: '60', 70: '70', 80: '80', 90: '90' },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(229, 72, 77, 0.45)' },
          '50%': { boxShadow: '0 0 0 8px rgba(229, 72, 77, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-in': 'fade-in 0.15s ease-out both',
        'fade-up': 'fade-up 0.2s ease-out both',
        'sheet-up': 'sheet-up 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        'scale-in': 'scale-in 0.12s ease-out both',
      },
    },
  },
  plugins: [],
};
