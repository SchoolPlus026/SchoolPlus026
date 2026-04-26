import React, { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * ThemeToggle — unified with the rest of the app.
 * Storage key: 'lfs_theme'  (matches SharedSettings & legacy app)
 * Applies: data-theme attr on <html> + class 'dark' / 'light' on <html>
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('lfs_theme') || 'dark'
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function applyTheme(val) {
    const root = document.documentElement;
    localStorage.setItem('lfs_theme', val);
    root.setAttribute('data-theme', val);
    if (val === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }

  const toggle = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      title={theme === 'dark' ? '☀ Switch to Light Mode' : '🌙 Switch to Dark Mode'}
      className="p-2 rounded-xl transition-all"
      style={{
        color: 'var(--header-muted)',
        background: 'var(--header-icon-bg)',
      }}
      onMouseEnter={e => e.currentTarget.style.color = '#fff'}
      onMouseLeave={e => e.currentTarget.style.color = 'var(--header-muted)'}
    >
      {theme === 'dark'
        ? <Sun size={18} strokeWidth={2.5} />
        : <Moon size={18} strokeWidth={2.5} />
      }
    </button>
  );
}
