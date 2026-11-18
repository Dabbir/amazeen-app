import type { ReactNode } from 'react';
import { Link, paths, useRouter } from '../router/router';
import type { Route } from '../router/router';
import { useHotkeys } from '../state/hooks';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import styles from './AppShell.module.css';

const NAV: { name: Route['name']; label: string; to: string; icon: IconName }[] = [
  { name: 'desk', label: 'Desk', to: paths.desk(), icon: 'desk' },
  { name: 'shelf', label: 'Shelf', to: paths.shelf(), icon: 'book' },
  { name: 'settings', label: 'Settings', to: paths.settings(), icon: 'cog' },
];

function StorageBanner() {
  const { saveStatus, loadStatus } = useStore();
  if (loadStatus === 'corrupt') {
    return (
      <div className={styles.banner} role="alert">
        We couldn’t read your saved archive. It hasn’t been touched — export a rescue copy from{' '}
        <Link to={paths.settings()}>Settings</Link> before writing anything new.
      </div>
    );
  }
  if (!saveStatus.ok) {
    return (
      <div className={styles.banner} role="alert">
        {saveStatus.reason === 'quota'
          ? 'This browser’s storage is full, so recent changes aren’t saved. Export your archive from Settings to keep a copy.'
          : 'Storage is unavailable (private browsing?), so changes will be lost when you close this tab.'}
      </div>
    );
  }
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { route, navigate } = useRouter();
  const { data, current } = useStore();

  useHotkeys({
    n: (e) => {
      e.preventDefault();
      navigate(paths.write('note'));
    },
    w: (e) => {
      e.preventDefault();
      navigate(paths.write('story'));
    },
    '/': (e) => {
      e.preventDefault();
      if (route.name === 'shelf') document.getElementById('shelf-search')?.focus();
      else navigate(paths.shelf());
    },
  });

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      <header className={styles.topbar}>
        <div className={styles.topInner}>
          <Link to={paths.desk()} className={styles.brand} aria-label="AMAZEEN, go to the desk">
            <span className={styles.brandMark} aria-hidden="true">
              A
            </span>
            <span className={styles.brandWord}>Amazeen</span>
          </Link>
          <span className={styles.edition} aria-hidden="true">
            {data.magazine?.title} · No. {current.number}
          </span>
          <nav className={styles.nav} aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.name}
                to={item.to}
                className={styles.navLink}
                aria-current={route.name === item.name ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link to={paths.write('story')} className={styles.fileBtn}>
            <Icon name="plus" size={16} />
            File a piece
          </Link>
        </div>
      </header>

      <StorageBanner />
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>

      <nav className={styles.tabbar} aria-label="Primary">
        {NAV.slice(0, 1).map((item) => (
          <Link key={item.name} to={item.to} className={styles.tab} aria-current={route.name === item.name ? 'page' : undefined}>
            <Icon name={item.icon} size={20} />
            {item.label}
          </Link>
        ))}
        <Link to={paths.write('story')} className={styles.tabFile} aria-label="File a piece">
          <Icon name="plus" size={24} />
        </Link>
        {NAV.slice(1).map((item) => (
          <Link key={item.name} to={item.to} className={styles.tab} aria-current={route.name === item.name ? 'page' : undefined}>
            <Icon name={item.icon} size={20} />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
