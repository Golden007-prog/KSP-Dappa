/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0B1220',
        panel: '#111A2C',
        grid: '#1E2A44',
        amber: { DEFAULT: '#F5A623', dim: '#8a6420' },
        signal: { DEFAULT: '#E5484D', dim: '#5b2530' },
        teal: { DEFAULT: '#2DD4BF', dim: '#1a4f4b' },
        ink: '#E6EAF2',
        muted: '#8A94A8',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(229, 72, 77, 0.45)' },
          '50%': { boxShadow: '0 0 0 8px rgba(229, 72, 77, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
