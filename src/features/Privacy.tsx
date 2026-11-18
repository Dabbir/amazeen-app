import { Link, paths } from '../router/router';
import { useDocumentTitle } from '../state/hooks';
import styles from './Privacy.module.css';

/** Plain-language privacy notice. AMAZEEN has no server, so there is very little to say, and that's the point. */
export default function Privacy({ standalone = false }: { standalone?: boolean }) {
  useDocumentTitle('Privacy');
  return (
    <article className={`${styles.page} ${standalone ? styles.standalone : ''}`}>
      <p className="kicker">The fine print, not so fine</p>
      <h1 className={styles.title}>Privacy</h1>
      <div className={styles.body}>
        <p className={styles.lede}>Your magazine is yours. AMAZEEN has no accounts, no servers that store your writing, and no tracking.</p>
        <h2>Where your writing lives</h2>
        <p>
          Everything you write is stored only in this browser, on this device (in IndexedDB). It is never uploaded. If you clear this site’s data or
          lose the device, it’s gone. That’s why AMAZEEN reminds you to export a backup.
        </p>
        <h2>What we collect</h2>
        <p>
          Nothing. There are no analytics, cookies, advertising or third-party scripts. Fonts and code are served from the same address as the app.
          Our hosting provider keeps standard, short-lived request logs (such as IP address and time) to run and protect the service, as every
          website’s host does.
        </p>
        <h2>Backups and moving devices</h2>
        <p>
          Exports are ordinary JSON files that you download and keep wherever you like. Importing reads the file inside your browser. It is not
          sent anywhere.
        </p>
        <h2>Deleting everything</h2>
        <p>Settings → Erase everything permanently removes your archive, drafts and settings from this browser.</p>
      </div>
      <p className={styles.back}>
        <Link to={paths.desk()}>← Back to AMAZEEN</Link>
      </p>
    </article>
  );
}
