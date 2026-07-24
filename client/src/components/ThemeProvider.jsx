// Theme context — class-strategy dark mode (dark default, persisted) with a
// three-way preference: 'dark' | 'light' | 'system' (follows
// prefers-color-scheme live). index.html's pre-paint script applies the stored
// preference before React mounts, so this provider only keeps <html> and
// localStorage in sync afterwards.
// Usage: const { theme, pref, setTheme, toggleTheme } = useTheme();
//   theme — the RESOLVED theme, always 'dark' | 'light' (safe for chart/palette
//           lookups; unchanged contract for existing callers)
//   pref  — the stored preference, may be 'system'
//   setTheme(next) — accepts 'dark' | 'light' | 'system'
// Components outside the provider still get a safe {theme:'dark'} default.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'dappa-theme';
const THEME_COLOR = { dark: '#0B1220', light: '#F3F5FA' };

const ThemeContext = createContext({ theme: 'dark', pref: 'dark', setTheme: () => {}, toggleTheme: () => {} });

function systemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

function readPref() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch { /* storage unavailable */ }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [pref, setPrefState] = useState(readPref);
  const [sys, setSys] = useState(systemTheme);
  const theme = pref === 'system' ? sys : pref;

  // follow the OS scheme live while pref === 'system'
  useEffect(() => {
    if (pref !== 'system' || typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setSys(mq.matches ? 'light' : 'dark');
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    root.dataset.theme = theme;
    try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* private mode */ }
    // keep the browser chrome color in step with the app theme
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', THEME_COLOR[theme]);
    });
  }, [theme, pref]);

  const setTheme = useCallback((next) => {
    const value = next === 'light' || next === 'system' ? next : 'dark';
    // .theme-anim enables a brief global color transition (reduced-motion safe
    // — the CSS rule lives behind prefers-reduced-motion: no-preference)
    const root = document.documentElement;
    root.classList.add('theme-anim');
    window.setTimeout(() => root.classList.remove('theme-anim'), 400);
    setPrefState(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const value = useMemo(() => ({ theme, pref, setTheme, toggleTheme }), [theme, pref, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
