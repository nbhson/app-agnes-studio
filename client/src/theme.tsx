import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Light/dark theme (F3). Default dark; first visit respects
 * prefers-color-scheme; choice persists in localStorage. The initial class is
 * applied by an inline script in index.html to avoid a flash — this provider
 * just keeps React state in sync with it.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'agnes_theme';

function initialTheme(): Theme {
  if (document.documentElement.classList.contains('light')) return 'light';
  return 'dark';
}

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
