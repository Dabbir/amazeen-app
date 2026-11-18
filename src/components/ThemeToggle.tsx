import type { MouseEvent } from 'react';
import { setPreference, useTheme } from '../lib/theme';
import styles from './ThemeToggle.module.css';

interface ThemeToggleProps {
  /** Vertical sits in the spine; horizontal in top bars. */
  orientation?: 'vertical' | 'horizontal';
  size?: 'regular' | 'small';
  className?: string | undefined;
}

/** Toggle between Day and Night editions, spilling from the centre of an element when given. */
export function toggleTheme(current: 'light' | 'dark', from?: Element | null): void {
  const rect = from?.getBoundingClientRect();
  const visible = rect && rect.width > 0 && rect.height > 0;
  setPreference(current === 'dark' ? 'light' : 'dark', visible ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined);
}

/** The switch currently on screen (the spine's on wide screens, the top bar's on phones). */
export function visibleThemeSwitch(): Element | null {
  return [...document.querySelectorAll('[data-theme-switch]')].find((el) => el.getBoundingClientRect().width > 0) ?? null;
}

/**
 * Day / Night edition switch. A real switch (role="switch") so it announces its state and
 * works with Space/Enter; the new edition spills out from the knob as a circle of ink.
 */
export function ThemeToggle({ orientation = 'horizontal', size = 'regular', className }: ThemeToggleProps) {
  const { theme } = useTheme();
  const night = theme === 'dark';

  const onClick = (e: MouseEvent<HTMLButtonElement>): void => {
    const knob = e.currentTarget.querySelector(`.${styles.knob}`);
    toggleTheme(theme, knob ?? e.currentTarget);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={night}
      aria-label="Night edition"
      title={night ? 'Night edition (T to switch)' : 'Day edition (T to switch)'}
      className={`${styles.toggle} ${className ?? ''}`}
      data-orientation={orientation}
      data-size={size}
      data-theme-switch=""
      data-theme-state={theme}
      onClick={onClick}
    >
      <span className={styles.track} aria-hidden="true">
        <svg className={styles.sun} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
        </svg>
        <svg className={styles.moon} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
        <span className={styles.stars} />
        <span className={styles.knob} />
      </span>
    </button>
  );
}
