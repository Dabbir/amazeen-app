import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { CoverArt } from '../../components/CoverArt';
import { Icon } from '../../components/Icon';
import ui from '../../components/ui.module.css';
import { KIND_INFO, SECTION_INFO } from '../../domain/catalog';
import { formatDayMonth, formatMonthYear, formatWeekRange } from '../../domain/dates';
import { totalWords } from '../../domain/issues';
import { layoutIssue, pageOf } from '../../domain/layout';
import { searchEntries } from '../../domain/search';
import type { SearchHit } from '../../domain/search';
import { highlight } from '../../domain/text';
import { SECTIONS } from '../../domain/types';
import type { Issue, Section } from '../../domain/types';
import { Link, paths, useRouter } from '../../router/router';
import { useDocumentTitle } from '../../state/hooks';
import { useStore } from '../../state/store';
import { entryHeadline } from '../desk/EntryRow';
import styles from './Shelf.module.css';

function Highlighted({ text, query }: { text: string; query: string }) {
  const term = query.trim().split(/\s+/u)[0] ?? '';
  return (
    <>
      {highlight(text, term).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>))}
    </>
  );
}

function groupByMonth(issues: readonly Issue[]): { label: string; issues: Issue[] }[] {
  const groups: { label: string; issues: Issue[] }[] = [];
  for (const issue of issues) {
    const label = formatMonthYear(issue.weekStart);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.issues.push(issue);
    else groups.push({ label, issues: [issue] });
  }
  return groups;
}

export default function Shelf({ initialQuery }: { initialQuery: string }) {
  const { data, issues, findIssue } = useStore();
  const { navigate } = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [section, setSection] = useState<Section | null>(null);
  const deferredQuery = useDeferredValue(query);
  useDocumentTitle('The Shelf');

  // Keep the URL shareable/back-button friendly without spamming history.
  useEffect(() => {
    const id = window.setTimeout(() => {
      // Only sync while the shelf still owns the URL; never drag the user back from a page they opened.
      if (window.location.pathname !== paths.shelf()) return;
      navigate(paths.shelf(query.trim()), { replace: true, transition: false });
    }, 300);
    return () => window.clearTimeout(id);
  }, [query, navigate]);

  const shelved = issues.filter((i) => i.entries.length > 0 || i.status === 'in-production');
  const searching = deferredQuery.trim() !== '' || section !== null;
  const hits = useMemo(() => (searching ? searchEntries(data.entries, deferredQuery, section) : []), [searching, data.entries, deferredQuery, section]);
  const pageCache = useMemo(() => new Map<string, ReturnType<typeof layoutIssue>>(), [issues]);
  const hrefFor = (hit: SearchHit): string => {
    const issue = findIssue(hit.issueKey);
    if (!issue) return paths.edit(hit.entry.id);
    let pages = pageCache.get(issue.key);
    if (!pages) {
      pages = layoutIssue(issue);
      pageCache.set(issue.key, pages);
    }
    return paths.issue(issue.key, pageOf(pages, hit.entry.id));
  };

  const first = data.entries.reduce<string | null>((min, e) => (min === null || e.createdAt < min ? e.createdAt : min), null);
  const printed = issues.filter((i) => i.status === 'published' && i.entries.length > 0).length;

  return (
    <div className={styles.shelf}>
      <header className={styles.head}>
        <div>
          <p className="kicker">The archive</p>
          <h1 className={styles.title}>The Shelf</h1>
        </div>
        <p className={styles.summary}>
          {printed} {printed === 1 ? 'issue' : 'issues'} printed · {totalWords(data.entries).toLocaleString()} words
          {first && ` · since ${formatMonthYear(new Date(first))}`}
        </p>
      </header>

      <div className={styles.tools} role="search">
        <label className={styles.search}>
          <Icon name="search" size={20} />
          <span className="visually-hidden">Search every issue</span>
          <input
            id="shelf-search"
            type="search"
            value={query}
            placeholder="Search every issue…"
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
          {query && (
            <button type="button" className={ui.iconBtn} aria-label="Clear search" onClick={() => setQuery('')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        <div className={styles.filters} role="group" aria-label="Filter by section">
          <button type="button" className={styles.filter} aria-pressed={section === null} onClick={() => setSection(null)}>
            All
          </button>
          {SECTIONS.map((s) => (
            <button key={s} type="button" className={styles.filter} aria-pressed={section === s} onClick={() => setSection(section === s ? null : s)}>
              {SECTION_INFO[s].label}
            </button>
          ))}
        </div>
      </div>

      {searching ? (
        <section aria-live="polite" aria-label="Search results">
          <p className={styles.resultCount}>
            {hits.length === 0
              ? 'No matches'
              : `${hits.length}${hits.length === 50 ? '+' : ''} ${hits.length === 1 ? 'piece' : 'pieces'}`}
            {deferredQuery.trim() && <> for “{deferredQuery.trim()}”</>}
            {section && <> in {SECTION_INFO[section].label}</>}
          </p>
          {hits.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Nothing on file.</p>
              <p className={styles.emptyText}>Try a different word, or clear the section filter. Search looks through every headline, note, quote and list.</p>
            </div>
          ) : (
            <ol className={styles.results}>
              {hits.map((hit) => {
                const issue = findIssue(hit.issueKey);
                return (
                  <li key={hit.entry.id}>
                    <Link to={hrefFor(hit)} className={styles.result}>
                      <span className={styles.resultIssue}>
                        <span className={styles.resultNo}>No. {issue?.number ?? '—'}</span>
                        <span>{formatDayMonth(new Date(hit.entry.createdAt))}</span>
                      </span>
                      <span className={styles.resultBody}>
                        <span className={styles.resultKind}>
                          {KIND_INFO[hit.entry.kind].label} · {SECTION_INFO[hit.entry.section].label}
                        </span>
                        <span className={styles.resultTitle}>
                          <Highlighted text={entryHeadline(hit.entry)} query={deferredQuery} />
                        </span>
                        {hit.entry.kind === 'story' || hit.entry.kind === 'list' ? (
                          <span className={styles.resultSnippet}>
                            <Highlighted text={hit.snippet} query={deferredQuery} />
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : data.entries.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>An empty shelf, for now.</p>
          <p className={styles.emptyText}>Every Sunday at midnight, the week’s issue lands here. File your first piece and watch the proof take shape on the desk.</p>
          <Link to={paths.write('note')} className={`${ui.btn} ${ui.dark}`}>
            File your first piece
          </Link>
        </div>
      ) : (
        <div className={styles.months}>
          {groupByMonth(shelved).map((group) => (
            <section key={group.label} className={styles.month} aria-label={group.label}>
              <h2 className={styles.monthTitle}>{group.label}</h2>
              <ul className={styles.grid}>
                {group.issues.map((issue, i) => (
                  <li key={issue.key} style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }} className={styles.item}>
                    <Link
                      to={paths.issue(issue.key)}
                      className={styles.issueLink}
                      aria-label={`Issue No. ${issue.number}, ${formatWeekRange(issue.weekStart, issue.weekEnd)}: ${issue.headline}`}
                    >
                      <CoverArt issue={issue} masthead={data.magazine?.title ?? ''} decorative morph />
                      <span className={styles.caption} aria-hidden="true">
                        <span className={styles.captionNo}>
                          No. {issue.number}
                          {issue.status === 'in-production' && <span className={styles.proof}>Proof</span>}
                        </span>
                        <span className={styles.captionDate}>{formatWeekRange(issue.weekStart, issue.weekEnd)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
