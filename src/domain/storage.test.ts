import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createEntry } from './entries';
import { highlight } from './text';
import { searchEntries } from './search';
import { createIdbAdapter, createMemoryAdapter, migrate, parseAppData, STORAGE_KEY } from './storage';
import type { AppData } from './types';

const sample = (): AppData => ({
  version: 1,
  magazine: { title: 'Mine', editor: 'Me', createdAt: '2026-01-01T00:00:00.000Z' },
  entries: [createEntry({ kind: 'note', body: 'hello idb' }, { section: 'life', mood: 4, starred: false })],
  overrides: {},
});

describe('IndexedDB adapter', () => {
  it('round-trips the archive', async () => {
    const adapter = createIdbAdapter({ factory: new IDBFactory(), legacy: undefined });
    expect((await adapter.load()).status).toBe('empty');
    expect(await adapter.save(sample())).toEqual({ ok: true });
    const loaded = await adapter.load();
    expect(loaded.status).toBe('ok');
    expect(loaded.data.entries[0]).toMatchObject({ body: 'hello idb' });
    expect(adapter.kind).toBe('indexeddb');
  });

  it('migrates a legacy localStorage archive on first run and keeps the old copy', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sample()));
    const factory = new IDBFactory();
    const first = await createIdbAdapter({ factory, legacy: localStorage }).load();
    expect(first.status).toBe('ok');
    expect(first.data.magazine?.title).toBe('Mine');
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    // A later session reads straight from IndexedDB, even if the legacy copy is gone.
    localStorage.clear();
    const second = await createIdbAdapter({ factory, legacy: localStorage }).load();
    expect(second.data.entries).toHaveLength(1);
  });

  it('reports corrupt data without discarding it', async () => {
    const factory = new IDBFactory();
    const adapter = createIdbAdapter({ factory, legacy: undefined });
    await adapter.save(sample());
    // Simulate damage by writing garbage under the same key.
    const db = await new Promise<IDBDatabase>((resolve) => {
      const req = factory.open('amazeen', 1);
      req.addEventListener('success', () => resolve(req.result));
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ version: 1, entries: 'nope' }, 'data');
      tx.addEventListener('complete', () => resolve());
    });
    const outcome = await createIdbAdapter({ factory, legacy: undefined }).load();
    expect(outcome.status).toBe('corrupt');
    expect(await adapter.readRaw()).toContain('nope');
  });

  it('falls back to localStorage when IndexedDB is unavailable', async () => {
    const adapter = createIdbAdapter({ factory: undefined, legacy: localStorage });
    await adapter.load();
    expect(adapter.kind).toBe('localstorage');
    await adapter.save(sample());
    expect(localStorage.getItem(STORAGE_KEY)).toContain('hello idb');
  });

  it('clear() removes both the IndexedDB archive and the legacy copy', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sample()));
    const factory = new IDBFactory();
    const adapter = createIdbAdapter({ factory, legacy: localStorage });
    await adapter.load();
    await adapter.clear();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect((await createIdbAdapter({ factory, legacy: localStorage }).load()).status).toBe('empty');
  });

  it('memory adapter detects corruption', async () => {
    expect((await createMemoryAdapter({ version: 1, entries: 5 }).load()).status).toBe('corrupt');
  });
});

describe('schema migration', () => {
  it('passes current documents through and leaves non-objects for validation to reject', () => {
    const doc = { version: 1, entries: [] };
    expect(migrate(doc)).toBe(doc);
    expect(migrate('text')).toBe('text');
    expect(() => parseAppData({ version: 0, entries: [] })).toThrow(/unsupported version/);
  });

  it('rejects arbitrary junk without throwing anything but DataFormatError', () => {
    const junk: unknown[] = [null, 42, 'x', [], { version: 1 }, { version: 1, entries: {} }, { version: 1, entries: [null, 1, 'a', {}] }];
    const outcomes = junk.map((value) => {
      try {
        return parseAppData(value).data.entries.length === 0 ? 'empty' : 'entries';
      } catch (err) {
        return (err as Error).name;
      }
    });
    expect(outcomes.every((o) => o === 'empty' || o === 'DataFormatError')).toBe(true);
  });
});

describe('search refinements (audit #7)', () => {
  it('highlights every query term, longest first', () => {
    const parts = highlight('Bread and breadcrumbs at dawn', 'dawn bread breadcrumbs');
    expect(parts.filter((p) => p.match).map((p) => p.text)).toEqual(['Bread', 'breadcrumbs', 'dawn']);
  });

  it('lets callers detect truncation by asking for one extra result', () => {
    const at = new Date(2026, 10, 16);
    const entries = Array.from({ length: 51 }, (_, i) => createEntry({ kind: 'note', body: `match ${i}` }, { section: 'life', mood: 3, starred: false }, at));
    expect(searchEntries(entries, 'match', null, 51)).toHaveLength(51);
    expect(searchEntries(entries.slice(0, 50), 'match', null, 51)).toHaveLength(50);
  });
});
