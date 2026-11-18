import { isInk, parseEntry, LIMITS } from './entries';
import { isWeekKey } from './dates';
import type { AppData, Entry, Ink, IssueOverride, Magazine } from './types';

export const STORAGE_KEY = 'amazeen:data:v1';
export const DRAFT_KEY = 'amazeen:draft:v1';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

export const EMPTY_DATA: AppData = { version: 1, magazine: null, entries: [], overrides: {} };

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
export function parseAppData(value: unknown): ParseResult {
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
  return {
    data: { version: 1, magazine: parseMagazine(v.magazine), entries, overrides: parseOverrides(v.overrides) },
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
