import { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

function subscribe(listener: () => void) {
  window.addEventListener('lumiere:theme-change', listener);
  return () => window.removeEventListener('lumiere:theme-change', listener);
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.appTheme ?? 'light');
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      aria-label="Dark theme"
      aria-pressed={theme === 'dark'}
      onClick={() => window.dispatchEvent(new CustomEvent('lumiere:set-theme', {
        detail: theme === 'dark' ? 'light' : 'dark',
      }))}
    >
      <Sun className="theme-sun" aria-hidden="true" />
      <Moon className="theme-moon" aria-hidden="true" />
    </button>
  );
}
