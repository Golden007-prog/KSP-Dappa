// Theme context — class-strategy dark mode (dark default, persisted).
// index.html's pre-paint script applies the stored class before React mounts,
// so this provider only has to keep <html> and localStorage in sync afterwards.
// Usage: const { theme, toggleTheme, setTheme } = useTheme();
// Components outside the provider still get a safe {theme:'dark'} default.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'dappa-theme';
const THEME_COLOR = { dark: '#0B1220', light: '#F3F5FA' };

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, toggleTheme: () => {} });

function readInitialTheme() {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('light')) {
    return 'light';
  }
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* storage unavailable */ }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    root.dataset.theme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* private mode */ }
    // keep the browser chrome color in step with the app theme
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', THEME_COLOR[theme]);
    });
  }, [theme]);

  const setTheme = useCallback((next) => {
    const value = next === 'light' ? 'light' : 'dark';
    // .theme-anim enables a brief global color transition (reduced-motion safe
    // — the CSS rule lives behind prefers-reduced-motion: no-preference)
    const root = document.documentElement;
    root.classList.add('theme-anim');
    window.setTimeout(() => root.classList.remove('theme-anim'), 400);
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(readInitialTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
