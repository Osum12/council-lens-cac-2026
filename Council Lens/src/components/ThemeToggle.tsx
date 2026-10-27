import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'council-lens-theme';

/** The saved theme (light unless the visitor switched to dark). Storage can be blocked, so reads never throw. */
function savedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * The page theme, kept on <html data-theme> (index.html applies the saved choice before
 * the first paint, so a dark page never flashes light).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (typeof document === 'undefined' ? 'light' : savedTheme()));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // A blocked store only means the choice is not remembered.
    }
  }, [theme]);
  return [theme, setTheme] as const;
}

/** A switch between the light and dark pages. */
export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => onChange(dark ? 'light' : 'dark')}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <path
            d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
