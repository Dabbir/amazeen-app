import { isInk, parseEntry, LIMITS } from './entries';
import { isWeekKey } from './dates';
import { IdbUnavailableError, openKeyValueStore } from './idb';
import type { KeyValueStore } from './idb';
import type { AppData, Entry, Ink, IssueOverride, Magazine } from './types';

export const STORAGE_KEY = 'amazeen:data:v1';
export const DRAFT_KEY = 'amazeen:draft:v1';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

export const EMPTY_DATA: AppData = { version: 1, magazine: null, entries: [], overrides: {} };

export const CURRENT_VERSION = 1;

/**
 * Upgrade older archive shapes to the current version, one step at a time.
 * Each future schema change adds a `case` that rewrites version N into N+1, so old exports keep opening forever.
 */
export function migrate(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  let doc = input as Record<string, unknown>;
  for (let guard = 0; guard < 100 && typeof doc.version === 'number' && doc.version < CURRENT_VERSION; guard++) {
    switch (doc.version) {
      // case 1: doc = { ...doc, version: 2, /* transform */ }; break;
      default:
        return doc; // unknown older version: let validation report it
    }
  }
  return doc;
}

export interface ParseResult {
  data: AppData;
  /** Entries that failed validation and were skipped. */
  skipped: number;
}

export class DataFormatError extends Error {
  override name = 'DataFormatError';
}

export function parseMagazine(value: unknown): Magazine | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || typeof v.editor !== 'string') return null;
  const title = v.title.trim().slice(0, LIMITS.magazineTitle);
  if (!title) return null;
  const createdAt = typeof v.createdAt === 'string' && !Number.isNaN(Date.parse(v.createdAt)) ? v.createdAt : new Date().toISOString();
  return { title, editor: v.editor.trim().slice(0, LIMITS.editor), createdAt };
}

function parseOverrides(value: unknown): Record<string, IssueOverride> {
  const out: Record<string, IssueOverride> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isWeekKey(key) || typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const o: { ink?: Ink; headline?: string } = {};
    if (isInk(r.ink)) o.ink = r.ink;
    if (typeof r.headline === 'string' && r.headline.trim()) o.headline = r.headline.trim().slice(0, LIMITS.headline);
    if (o.ink || o.headline) out[key] = o;
  }
  return out;
}

/** Validate untrusted data (from storage or an import file). Throws DataFormatError if unusable. */
export function parseAppData(input: unknown): ParseResult {
  const value = migrate(input);
  if (typeof value !== 'object' || value === null) throw new DataFormatError('This file is not an AMAZEEN archive.');
  const v = value as Record<string, unknown>;
  if (v.version !== 1) throw new DataFormatError('This archive was made by an unsupported version of AMAZEEN.');
  if (!Array.isArray(v.entries)) throw new DataFormatError('The archive has no entries list.');
  if (v.entries.length > MAX_ENTRIES) throw new DataFormatError('The archive is too large to open.');

  const seen = new Set<string>();
  const entries: Entry[] = [];
  let skipped = 0;
  for (const raw of v.entries) {
    const entry = parseEntry(raw);
    if (!entry || seen.has(entry.id)) {
      skipped += 1;
      continue;
    }
    seen.add(entry.id);
    entries.push(entry);
  }
  const lastExportedAt = typeof v.lastExportedAt === 'string' && !Number.isNaN(Date.parse(v.lastExportedAt)) ? v.lastExportedAt : null;
  return {
    data: {
      version: 1,
      magazine: parseMagazine(v.magazine),
      entries,
      overrides: parseOverrides(v.overrides),
      ...(lastExportedAt ? { lastExportedAt } : {}),
    },
    skipped,
  };
}

export type LoadOutcome =
  | { status: 'empty'; data: AppData }
  | { status: 'ok'; data: AppData; skipped: number }
  | { status: 'corrupt'; data: AppData; raw: string };

/** Load persisted data. Never throws: corrupt data is reported so the UI can offer recovery. */
export function loadData(storage: Storage | undefined = safeStorage()): LoadOutcome {
  const raw = readRaw(storage, STORAGE_KEY);
  if (raw === null) return { status: 'empty', data: EMPTY_DATA };
  try {
    const { data, skipped } = parseAppData(JSON.parse(raw));
    return { status: 'ok', data, skipped };
  } catch {
    return { status: 'corrupt', data: EMPTY_DATA, raw };
  }
}

export type SaveOutcome = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' };

export function saveData(data: AppData, storage: Storage | undefined = safeStorage()): SaveOutcome {
  return writeRaw(storage, STORAGE_KEY, JSON.stringify(data));
}

export function serializeForExport(data: AppData): string {
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString(), app: 'AMAZEEN' }, null, 2);
}

export function safeStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readRaw(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeRaw(storage: Storage | undefined, key: string, value: string): SaveOutcome {
  if (!storage) return { ok: false, reason: 'unavailable' };
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const quota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
    return { ok: false, reason: quota ? 'quota' : 'unavailable' };
  }
}

export function removeRaw(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* storage unavailable: nothing to remove */
  }
}

// ── Storage adapters ──────────────────────────────────────────────

/** Where the archive lives. Swappable so cloud sync can be added later without touching the UI. */
export interface StorageAdapter {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  load(): Promise<LoadOutcome>;
  save(data: AppData): Promise<SaveOutcome>;
  /** The raw stored value as text, for rescue downloads when it can't be parsed. */
  readRaw(): Promise<string | null>;
  clear(): Promise<void>;
}

export function createLocalStorageAdapter(storage: Storage | undefined = safeStorage()): StorageAdapter {
  return {
    kind: 'localstorage',
    load: async () => loadData(storage),
    save: async (data) => saveData(data, storage),
    readRaw: async () => readRaw(storage, STORAGE_KEY),
    clear: async () => removeRaw(storage, STORAGE_KEY),
  };
}

export function createMemoryAdapter(initial: unknown = null): StorageAdapter {
  let value: string | null = initial === null ? null : JSON.stringify(initial);
  return {
    kind: 'memory',
    async load() {
      if (value === null) return { status: 'empty', data: EMPTY_DATA };
      try {
        const { data, skipped } = parseAppData(JSON.parse(value));
        return { status: 'ok', data, skipped };
      } catch {
        return { status: 'corrupt', data: EMPTY_DATA, raw: value };
      }
    },
    async save(data) {
      value = JSON.stringify(data);
      return { ok: true };
    },
    readRaw: async () => value,
    clear: async () => {
      value = null;
    },
  };
}

const IDB_DATA_KEY = 'data';

function isQuotaError(err: unknown): boolean {
  return err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
}

/**
 * IndexedDB-backed storage (the default). On first run it migrates any archive left in localStorage
 * by earlier versions, leaving the old copy in place as a fallback. If IndexedDB is unavailable
 * (some private-browsing modes), it transparently falls back to localStorage.
 */
export function createIdbAdapter(options: { factory?: IDBFactory | undefined; legacy?: Storage | undefined } = {}): StorageAdapter {
  const legacy = 'legacy' in options ? options.legacy : safeStorage();
  const fallback = createLocalStorageAdapter(legacy);
  let kvPromise: Promise<KeyValueStore | null> | null = null;
  const kv = (): Promise<KeyValueStore | null> => {
    kvPromise ??= openKeyValueStore('factory' in options ? options.factory : globalThis.indexedDB).catch((err: unknown) => {
      if (!(err instanceof IdbUnavailableError)) console.warn('IndexedDB unavailable, using localStorage', err);
      return null;
    });
    return kvPromise;
  };

  let mode: StorageAdapter['kind'] = 'indexeddb';
  const adapter: StorageAdapter = {
    get kind() {
      return mode;
    },
    async load() {
      const store = await kv();
      if (!store) {
        mode = 'localstorage';
        return fallback.load();
      }
      let raw: unknown;
      try {
        raw = await store.get(IDB_DATA_KEY);
      } catch {
        mode = 'localstorage';
        return fallback.load();
      }
      if (raw === undefined) {
        // First run on IndexedDB: adopt the legacy localStorage archive if there is one.
        const legacyOutcome = await fallback.load();
        if (legacyOutcome.status === 'ok') {
          try {
            await store.set(IDB_DATA_KEY, legacyOutcome.data);
          } catch {
            /* keep serving from memory; the next save retries */
          }
        }
        return legacyOutcome;
      }
      try {
        const { data, skipped } = parseAppData(raw);
        return { status: 'ok', data, skipped };
      } catch {
        return { status: 'corrupt', data: EMPTY_DATA, raw: safeStringify(raw) };
      }
    },
    async save(data) {
      const store = await kv();
      if (!store) return fallback.save(data);
      try {
        await store.set(IDB_DATA_KEY, data);
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: isQuotaError(err) ? 'quota' : 'unavailable' };
      }
    },
    async readRaw() {
      const store = await kv();
      if (!store) return fallback.readRaw();
      try {
        const raw = await store.get(IDB_DATA_KEY);
        return raw === undefined ? fallback.readRaw() : safeStringify(raw);
      } catch {
        return fallback.readRaw();
      }
    },
    async clear() {
      const store = await kv();
      await store?.delete(IDB_DATA_KEY).catch(() => undefined);
      await fallback.clear();
    },
  };
  return adapter;
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
