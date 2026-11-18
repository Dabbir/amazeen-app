import { CoverArt } from '../../components/CoverArt';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import ui from '../../components/ui.module.css';
import { KIND_INFO } from '../../domain/catalog';
import { formatDayMonth, formatWeekRange, formatWeekday, startOfDay, timeUntil } from '../../domain/dates';
import { pressCheck, totalWords } from '../../domain/issues';
import { ENTRY_KINDS } from '../../domain/types';
import type { Entry } from '../../domain/types';
import { Link, paths } from '../../router/router';
import { useDocumentTitle } from '../../state/hooks';
import { useNow } from '../../state/now';
import { useStore } from '../../state/store';
import { EntryRow } from './EntryRow';
import styles from './Desk.module.css';

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function groupByDay(entries: readonly Entry[]): { day: Date; entries: Entry[] }[] {
  const map = new Map<number, Entry[]>();
  for (const e of entries) {
    const key = startOfDay(new Date(e.createdAt)).getTime();
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  return [...map.entries()]
    .toSorted(([a], [b]) => b - a)
    .map(([key, list]) => ({ day: new Date(key), entries: list.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
}

export function Desk() {
  const store = useStore();
  const { data, current, issues, streak } = store;
  const now = useNow();
  const toast = useToast();
  useDocumentTitle('Desk');

  const checks = pressCheck(current);
  const done = checks.filter((c) => c.done).length;
  const ready = done === checks.length;
  const latest = issues.find((i) => i.status === 'published' && i.entries.length > 0);
  const published = issues.filter((i) => i.status === 'published' && i.entries.length > 0).length;
  const editorFirst = data.magazine?.editor.split(' ')[0] ?? '';
  const days = groupByDay(current.entries);

  const onDelete = (entry: Entry): void => {
    const removed = store.deleteEntry(entry.id);
    if (!removed) return;
    toast.push({
      message: `Pulled from No. ${current.number}.`,
      action: { label: 'Undo', onAction: () => store.addEntry(removed) },
      duration: 7000,
    });
  };

  return (
    <div className={styles.desk}>
      <div className={styles.dateline}>
        <span>{formatWeekday(now)}, {formatDayMonth(now)}</span>
        <span className={styles.datelineMid}>{data.magazine?.title} · No. {current.number} · {formatWeekRange(current.weekStart, current.weekEnd)}</span>
        <span className={styles.deadline}>
          <span className={styles.pulse} aria-hidden="true" /> Goes to press in {timeUntil(current.weekEnd, now)}
        </span>
      </div>

      <section className={styles.hero} aria-labelledby="desk-heading">
        <div className={styles.heroCopy}>
          <p className={styles.greeting}>
            {greeting(now)}{editorFirst && editorFirst !== 'The' ? `, ${editorFirst}` : ''}.
          </p>
          <h1 id="desk-heading" className={styles.headline}>
            Issue No.&nbsp;{current.number} is{' '}
            {current.entries.length === 0 ? (
              <>
                <em>blank pages.</em> Let’s fix that.
              </>
            ) : ready ? (
              <em>ready for print.</em>
            ) : (
              <em>taking shape.</em>
            )}
          </h1>

          <nav className={styles.launcher} aria-label="File a new piece">
            {ENTRY_KINDS.map((kind, i) => (
              <Link key={kind} to={paths.write(kind)} className={styles.launch}>
                <span className={styles.launchNum} aria-hidden="true">
                  0{i + 1}
                </span>
                <span className={styles.launchWord}>{KIND_INFO[kind].label}</span>
                <span className={styles.launchHint}>{KIND_INFO[kind].hint}</span>
                <span className={styles.launchArrow} aria-hidden="true">
                  <Icon name="right" size={22} />
                </span>
              </Link>
            ))}
          </nav>
          <p className={styles.shortcuts}>
            Shortcuts: <kbd>W</kbd> story · <kbd>N</kbd> note · <kbd>/</kbd> search
          </p>
        </div>

        <div className={styles.proof}>
          <Link
            to={paths.issue(current.key)}
            className={styles.coverLink}
            aria-label={`Preview Issue No. ${current.number}: ${current.headline}`}
          >
            <CoverArt issue={current} masthead={data.magazine?.title ?? 'Amazeen'} morph decorative />
            <span className={styles.coverHint}>{current.entries.length ? 'Preview the proof' : 'See the blank proof'} →</span>
          </Link>

          <div className={styles.check} aria-labelledby="press-check">
            <div className={styles.checkHead}>
              <h2 id="press-check" className="kicker">
                Press check
              </h2>
              <span className={styles.checkCount}>
                {done}/{checks.length}
              </span>
            </div>
            <div
              className={styles.meter}
              role="progressbar"
              aria-label="Issue completeness"
              aria-valuemin={0}
              aria-valuemax={checks.length}
              aria-valuenow={done}
            >
              <span style={{ width: `${(done / checks.length) * 100}%` }} />
            </div>
            <ul className={styles.checkList}>
              {checks.map((c) => (
                <li key={c.id} data-done={c.done}>
                  <span className={styles.tick} aria-hidden="true">
                    {c.done && <Icon name="check" size={14} />}
                  </span>
                  <span>
                    <span className={styles.checkLabel}>
                      {c.label}
                      <span className="visually-hidden">{c.done ? ' (done)' : ' (to do)'}</span>
                    </span>
                    {!c.done && <span className={styles.checkHint}>{c.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.lower}>
        <div className={styles.filed} aria-labelledby="filed-heading">
          <div className={styles.sectionHead}>
            <h2 id="filed-heading">Filed this week</h2>
            <span className={styles.sectionMeta}>
              {current.stats.entries} {current.stats.entries === 1 ? 'piece' : 'pieces'} · {current.stats.words.toLocaleString()} words
            </span>
          </div>

          {days.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Nothing filed yet.</p>
              <p className={styles.emptyText}>
                A note takes thirty seconds. Something you noticed on the way to work, something someone said, a song you had on repeat.
                Small things make the best issues.
              </p>
              <Link to={paths.write('note')} className={`${ui.btn} ${ui.dark}`}>
                Jot your first note
              </Link>
            </div>
          ) : (
            <ol className={styles.days}>
              {days.map(({ day, entries }) => (
                <li key={day.getTime()} className={styles.day}>
                  <div className={styles.dayLabel}>
                    <span className={styles.dayName}>{formatWeekday(day)}</span>
                    <span className={styles.dayDate}>{formatDayMonth(day)}</span>
                  </div>
                  <ul className={styles.dayEntries}>
                    {entries.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        isCover={entry.id === current.coverStory?.id}
                        onToggleStar={() => store.toggleStar(entry.id)}
                        onDelete={() => onDelete(entry)}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className={styles.side}>
          {latest && (
            <Link to={paths.issue(latest.key)} className={styles.latest}>
              <span className="kicker">Fresh off the press</span>
              <div className={styles.latestBody}>
                <div className={styles.latestCover}>
                  <CoverArt issue={latest} masthead={data.magazine?.title ?? ''} decorative />
                </div>
                <div>
                  <p className={styles.latestNo}>No. {latest.number}</p>
                  <p className={styles.latestTitle}>{latest.headline}</p>
                  <p className={styles.latestMeta}>{formatWeekRange(latest.weekStart, latest.weekEnd)}</p>
                  <span className={styles.readLink}>Read the issue →</span>
                </div>
              </div>
            </Link>
          )}

          <dl className={styles.stats}>
            <div>
              <dt>Week streak</dt>
              <dd className="numeral">{streak}</dd>
            </div>
            <div>
              <dt>Issues printed</dt>
              <dd className="numeral">{published}</dd>
            </div>
            <div>
              <dt>Total words</dt>
              <dd className="numeral">{totalWords(data.entries).toLocaleString()}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </div>
  );
}
