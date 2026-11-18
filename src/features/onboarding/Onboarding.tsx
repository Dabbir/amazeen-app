import { useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CoverArt } from '../../components/CoverArt';
import ui from '../../components/ui.module.css';
import { LIMITS } from '../../domain/entries';
import { compileIssues } from '../../domain/issues';
import { sampleEntries } from '../../domain/sample';
import { useDocumentTitle } from '../../state/hooks';
import { useStore } from '../../state/store';
import styles from './Onboarding.module.css';

const SUGGESTIONS = ['The Weekly Me', 'Small Hours', 'Field Notes', 'Sunday Edition', 'Good Days'];

export function Onboarding() {
  useDocumentTitle('Start your magazine');
  const { replaceData } = useStore();
  const [title, setTitle] = useState('');
  const [editor, setEditor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const editorId = useId();
  const errorId = useId();

  // A real issue from the sample archive gives the preview believable content.
  const preview = useMemo(() => {
    const issues = compileIssues({ entries: sampleEntries(), overrides: {} });
    return issues.find((i) => i.status === 'published' && i.coverStory?.kind === 'story') ?? issues[0];
  }, []);

  const shownTitle = title.trim() || 'Amazeen';

  const start = (withSample: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    const clean = title.trim();
    if (!clean) {
      setError('Give your magazine a name. You can change it later.');
      document.getElementById(titleId)?.focus();
      return;
    }
    if (clean.length > LIMITS.magazineTitle) {
      setError(`Mastheads look best short. Keep it under ${LIMITS.magazineTitle} characters.`);
      return;
    }
    replaceData({
      version: 1,
      magazine: { title: clean, editor: editor.trim() || 'The Editor', createdAt: new Date().toISOString() },
      entries: withSample ? sampleEntries() : [],
      overrides: {},
    });
  };

  return (
    <main className={styles.page}>
      <div className={styles.strip} aria-hidden="true">
        <span>Est. {new Date().getFullYear()}</span>
        <span>Printed weekly</span>
        <span>Circulation: one</span>
      </div>

      <div className={styles.grid}>
        <section className={styles.copy}>
          <h1 className={styles.wordmark} aria-label="AMAZEEN">
            {'AMAZEEN'.split('').map((ch, i) => (
              <span key={i} style={{ animationDelay: `${i * 55}ms` }} aria-hidden="true">
                {ch}
              </span>
            ))}
          </h1>
          <p className={styles.lede}>
            The weekly magazine of <em>your own life.</em> Write a little every day: stories, notes, things people said, lists. Every
            Sunday, AMAZEEN takes it to press as a real issue.
          </p>

          <form className={styles.form} onSubmit={start(false)} noValidate>
            <div className={styles.field}>
              <label className={ui.label} htmlFor={titleId}>
                Name your magazine
              </label>
              <input
                id={titleId}
                className={`${ui.input} ${styles.titleInput}`}
                value={title}
                maxLength={LIMITS.magazineTitle + 8}
                placeholder="The Weekly Me"
                autoComplete="off"
                autoFocus
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(null);
                }}
              />
              {error && (
                <p id={errorId} className={ui.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.suggestions} aria-label="Suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => {
                      setTitle(s);
                      setError(null);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={ui.label} htmlFor={editorId}>
                Your byline <span className={styles.optional}>(optional)</span>
              </label>
              <input
                id={editorId}
                className={ui.input}
                value={editor}
                maxLength={LIMITS.editor}
                placeholder="Editor-in-chief"
                autoComplete="name"
                onChange={(e) => setEditor(e.target.value)}
              />
            </div>

            <div className={styles.actions}>
              <button type="submit" className={`${ui.btn} ${ui.primary}`}>
                Start with blank pages
              </button>
              <button type="button" className={ui.btn} onClick={start(true)}>
                Explore a sample archive
              </button>
            </div>
            <p className={styles.privacy}>Everything stays in this browser. No account, no tracking, no cloud.</p>
          </form>
        </section>

        <aside className={styles.preview} aria-label="Cover preview">
          {preview && <CoverArt issue={preview} masthead={shownTitle} decorative />}
          <p className={styles.caption}>Your masthead, on every cover.</p>
        </aside>
      </div>
    </main>
  );
}
