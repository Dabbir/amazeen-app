import { describe, expect, it } from 'vitest';
import { endOfWeek, formatWeekRange, isoWeek, startOfWeek, timeUntil, toRoman, weekKey, weekKeyToDate } from './dates';
import { createEntry, emptyDraft, isDraftBlank, normalizeDraft, parseEntry, updateEntry, validateDraft } from './entries';
import { compileIssues, pickCoverStory, pressCheck, weeklyStreak } from './issues';
import { contentsFor, layoutIssue } from './layout';
import { sampleEntries } from './sample';
import { searchEntries } from './search';
import { DataFormatError, loadData, parseAppData, saveData, STORAGE_KEY } from './storage';
import { countWords, highlight, paragraphs, pullQuote, truncate } from './text';
import type { Entry, EntryDraft, EntryMeta } from './types';

const META: EntryMeta = { section: 'life', mood: 4, starred: false };
const story = (title: string, words: number, at: Date, meta: Partial<EntryMeta> = {}): Entry =>
  createEntry({ kind: 'story', title, body: Array.from({ length: words }, () => 'word').join(' ') }, { ...META, ...meta }, at);
const note = (body: string, at: Date, meta: Partial<EntryMeta> = {}): Entry => createEntry({ kind: 'note', body }, { ...META, ...meta }, at);

describe('dates', () => {
  it('computes ISO weeks across year boundaries', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 }); // Thursday
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 }); // Friday belongs to prior year
    expect(isoWeek(new Date(2024, 11, 30))).toEqual({ year: 2025, week: 1 }); // Monday belongs to next year
    expect(weekKey(new Date(2026, 10, 18))).toBe('2026-W47');
  });

  it('round-trips week keys and rejects invalid ones', () => {
    const monday = weekKeyToDate('2026-W47');
    expect(monday?.getDay()).toBe(1);
    expect(monday && weekKey(monday)).toBe('2026-W47');
    expect(weekKeyToDate('2025-W53')).toBeNull(); // 2025 has only 52 ISO weeks
    expect(weekKeyToDate('nonsense')).toBeNull();
    expect(weekKeyToDate('2026-W00')).toBeNull();
  });

  it('bounds weeks Monday to Sunday', () => {
    const wed = new Date(2026, 10, 18, 15);
    expect(startOfWeek(wed)).toEqual(new Date(2026, 10, 16));
    expect(endOfWeek(wed).getDate()).toBe(22);
    expect(startOfWeek(new Date(2026, 10, 22, 23))).toEqual(new Date(2026, 10, 16)); // Sunday stays in the week
  });

  it('formats ranges, countdowns and numerals', () => {
    expect(formatWeekRange(new Date(2026, 10, 16), new Date(2026, 10, 22))).toBe('Nov 16 – 22, 2026');
    expect(formatWeekRange(new Date(2026, 11, 28), new Date(2027, 0, 3))).toBe('Dec 28 – Jan 3, 2027');
    const now = new Date(2026, 0, 1, 12);
    expect(timeUntil(new Date(2026, 0, 4, 12), now)).toBe('3 days');
    expect(timeUntil(new Date(2026, 0, 1, 14), now)).toBe('2 hours');
    expect(timeUntil(new Date(2025, 0, 1), now)).toBe('a minute');
    expect(toRoman(14)).toBe('XIV');
  });
});

describe('text', () => {
  it('counts words and splits paragraphs', () => {
    expect(countWords('  hello   brave\nnew world ')).toBe(4);
    expect(countWords('   ')).toBe(0);
    expect(paragraphs('one\n\n\n two \n\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('truncates on word boundaries', () => {
    expect(truncate('The quick brown fox jumps over the lazy dog', 20)).toBe('The quick brown fox…');
    expect(truncate('short', 20)).toBe('short');
  });

  it('extracts a pull quote only from substantial copy', () => {
    expect(pullQuote('Too short. Really.')).toBeNull();
    const body = 'Opening line here. I never thought bread could teach me anything about patience at all. Another sentence follows it. And a final one closes.';
    expect(pullQuote(body)).toBe('I never thought bread could teach me anything about patience at all.');
  });

  it('highlights matches without generating markup', () => {
    expect(highlight('Bread and butter', 'BREAD')).toEqual([
      { text: 'Bread', match: true },
      { text: ' and butter', match: false },
    ]);
    expect(highlight('a+b', '+')).toEqual([
      { text: 'a', match: false },
      { text: '+', match: true },
      { text: 'b', match: false },
    ]);
  });
});

describe('entries', () => {
  it('validates each kind with helpful messages', () => {
    expect(validateDraft(emptyDraft('story'))).toEqual({
      title: 'Every story needs a headline.',
      body: 'A story needs at least a few words of copy.',
    });
    expect(validateDraft({ kind: 'note', body: 'x'.repeat(1001) }).body).toMatch(/limit is 1,000/);
    expect(validateDraft({ kind: 'list', title: 'Wins', items: ['', '  '] }).items).toBe('Add at least one item.');
    expect(validateDraft({ kind: 'quote', body: 'Hi', attribution: '' })).toEqual({});
  });

  it('normalises whitespace and strips quote marks', () => {
    const d = normalizeDraft({ kind: 'quote', body: '  “Hello  there” ', attribution: ' Ana ' });
    expect(d).toEqual({ kind: 'quote', body: 'Hello there', attribution: 'Ana' });
    expect(normalizeDraft({ kind: 'story', title: 'T', body: 'a\r\n\r\n\r\n\r\nb' })).toEqual({ kind: 'story', title: 'T', body: 'a\n\nb' });
  });

  it('detects blank drafts', () => {
    expect(isDraftBlank(emptyDraft('list'))).toBe(true);
    expect(isDraftBlank({ kind: 'note', body: ' hi ' })).toBe(false);
  });

  it('refuses to create invalid entries and preserves identity on update', () => {
    expect(() => createEntry(emptyDraft('note'), META)).toThrow();
    const created = createEntry({ kind: 'note', body: 'first' }, META, new Date(2026, 0, 5), 'id-1');
    const updated = updateEntry(created, { kind: 'note', body: 'second' }, { ...META, starred: true }, new Date(2026, 0, 6));
    expect(updated).toMatchObject({ id: 'id-1', createdAt: created.createdAt, body: 'second', starred: true });
    expect(updated.updatedAt).not.toBe(created.updatedAt);
  });

  it('parses untrusted entries strictly', () => {
    const good = createEntry({ kind: 'list', title: 'L', items: ['a'] }, META);
    expect(parseEntry(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseEntry({ ...good, kind: 'poem' })).toBeNull();
    expect(parseEntry({ ...good, mood: 9 })).toBeNull();
    expect(parseEntry({ ...good, createdAt: 'yesterday' })).toBeNull();
    expect(parseEntry({ ...good, items: [] })).toBeNull();
    expect(parseEntry(null)).toBeNull();
  });
});

describe('issues', () => {
  const now = new Date(2026, 10, 18, 12); // Wed, 2026-W47

  it('always includes the current week and numbers issues chronologically', () => {
    const entries = [note('old', new Date(2026, 10, 3)), note('older', new Date(2026, 9, 20))];
    const issues = compileIssues({ entries, overrides: {} }, now);
    expect(issues.map((i) => [i.key, i.number, i.status])).toEqual([
      ['2026-W47', 3, 'in-production'],
      ['2026-W45', 2, 'published'],
      ['2026-W43', 1, 'published'],
    ]);
    expect(issues[0]?.headline).toBe('Blank Pages');
  });

  it('prefers a starred piece, then the longest story, for the cover', () => {
    const at = new Date(2026, 10, 17);
    const short = story('Short', 10, at);
    const long = story('Long', 300, at);
    const starredNote = note('A starred note', at, { starred: true });
    expect(pickCoverStory([short, long])?.id).toBe(long.id);
    expect(pickCoverStory([short, long, starredNote])?.id).toBe(starredNote.id);
    expect(pickCoverStory([])).toBeNull();
  });

  it('applies overrides and computes stats', () => {
    const entries = [story('Bread', 200, new Date(2026, 10, 16), { mood: 5 }), note('hi there', new Date(2026, 10, 18), { mood: 3, section: 'work' })];
    const [issue] = compileIssues({ entries, overrides: { '2026-W47': { ink: 'pink', headline: 'Custom!' } } }, now);
    expect(issue?.ink).toBe('pink');
    expect(issue?.headline).toBe('Custom!');
    expect(issue?.stats).toMatchObject({ entries: 2, daysWritten: 2, mood: 4, words: 203 });
    expect(issue?.stats.moodByDay).toEqual([5, null, 3, null, null, null, null]);
    expect(issue?.coverLines).toEqual(['hi there']);
  });

  it('reports press-check progress', () => {
    const [issue] = compileIssues({ entries: [story('Feature', 160, new Date(2026, 10, 16))], overrides: {} }, now);
    expect(issue && pressCheck(issue).map((c) => c.done)).toEqual([true, false, false, false]);
  });

  it('counts weekly streaks, forgiving a still-blank current week', () => {
    const entries = [note('a', new Date(2026, 10, 10)), note('b', new Date(2026, 10, 3)), note('c', new Date(2026, 9, 13))];
    expect(weeklyStreak(entries, now)).toBe(2);
    expect(weeklyStreak([...entries, note('d', new Date(2026, 10, 17))], now)).toBe(3);
    expect(weeklyStreak([note('old', new Date(2026, 8, 1))], now)).toBe(0);
  });
});

describe('layout', () => {
  it('lays out cover, contents, features, dispatches, quotes, numbers and back page', () => {
    const at = new Date(2026, 10, 16);
    const drafts: EntryDraft[] = [
      { kind: 'story', title: 'A', body: 'Body text.' },
      { kind: 'note', body: 'n1' },
      { kind: 'list', title: 'L', items: ['x'] },
      { kind: 'quote', body: 'q', attribution: 'p' },
    ];
    const entries = drafts.map((d) => createEntry(d, META, at));
    const [issue] = compileIssues({ entries, overrides: {} }, new Date(2026, 10, 18));
    if (!issue) throw new Error('missing issue');
    const pages = layoutIssue(issue);
    expect(pages.map((p) => p.kind)).toEqual(['cover', 'contents', 'feature', 'dispatches', 'overheard', 'numbers', 'back']);
    expect(contentsFor(issue, pages).map((c) => c.page)).toEqual([3, 4, 5, 6]);
  });

  it('paginates long runs of dispatches and keeps empty issues minimal', () => {
    const at = new Date(2026, 10, 16);
    const entries = Array.from({ length: 8 }, (_, i) => note(`note ${i}`, at));
    const [issue] = compileIssues({ entries, overrides: {} }, new Date(2026, 10, 18));
    if (!issue) throw new Error('missing issue');
    expect(layoutIssue(issue).filter((p) => p.kind === 'dispatches')).toHaveLength(2);
    const [empty] = compileIssues({ entries: [], overrides: {} }, new Date(2026, 10, 18));
    if (!empty) throw new Error('missing issue');
    expect(layoutIssue(empty).map((p) => p.kind)).toEqual(['cover', 'back']);
  });
});

describe('search', () => {
  it('matches all terms case-insensitively and filters by section', () => {
    const at = new Date(2026, 10, 16);
    const entries = [note('Baked sourdough bread today', at), note('Bread meeting at work', at, { section: 'work' })];
    expect(searchEntries(entries, 'bread')).toHaveLength(2);
    expect(searchEntries(entries, 'BREAD sourdough')).toHaveLength(1);
    expect(searchEntries(entries, 'bread', 'work')[0]?.entry.section).toBe('work');
    expect(searchEntries(entries, '   ')).toEqual([]);
  });
});

describe('storage', () => {
  it('round-trips data and recovers from corruption without throwing', () => {
    const data = { version: 1 as const, magazine: { title: 'Mine', editor: 'Me', createdAt: new Date().toISOString() }, entries: sampleEntries(), overrides: {} };
    expect(saveData(data)).toEqual({ ok: true });
    const loaded = loadData();
    expect(loaded.status).toBe('ok');
    expect(loaded.data.entries).toHaveLength(data.entries.length);

    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadData().status).toBe('corrupt');
    localStorage.removeItem(STORAGE_KEY);
    expect(loadData().status).toBe('empty');
  });

  it('rejects foreign files and skips invalid or duplicate entries', () => {
    expect(() => parseAppData({ hello: 'world' })).toThrow(DataFormatError);
    expect(() => parseAppData({ version: 2, entries: [] })).toThrow(DataFormatError);
    const good = note('ok', new Date());
    const result = parseAppData({ version: 1, entries: [good, good, { junk: true }], overrides: { bad: { ink: 'pink' }, '2026-W47': { ink: 'nope', headline: '  Hi ' } } });
    expect(result.data.entries).toHaveLength(1);
    expect(result.skipped).toBe(2);
    expect(result.data.overrides).toEqual({ '2026-W47': { headline: 'Hi' } });
    expect(result.data.magazine).toBeNull();
  });
});

describe('sample data', () => {
  it('never produces future-dated entries and passes validation', () => {
    const now = new Date(2026, 10, 17, 9); // Tuesday morning
    const entries = sampleEntries(now);
    expect(entries.length).toBeGreaterThan(15);
    expect(entries.every((e) => new Date(e.createdAt) <= now)).toBe(true);
    expect(entries.every((e) => parseEntry(JSON.parse(JSON.stringify(e))) !== null)).toBe(true);
  });
});
