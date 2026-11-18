import type { AppData, Entry } from './types';

const DAY_MS = 86_400_000;
export const BACKUP_INTERVAL_DAYS = 14;
export const REMINDER_SNOOZE_DAYS = 7;

function newestChange(entries: readonly Entry[]): string | null {
  return entries.reduce<string | null>((max, e) => (max === null || e.updatedAt > max ? e.updatedAt : max), null);
}

function oldestEntry(entries: readonly Entry[]): string | null {
  return entries.reduce<string | null>((min, e) => (min === null || e.createdAt < min ? e.createdAt : min), null);
}

export interface BackupStatus {
  /** Show the reminder now. */
  due: boolean;
  /** Days since the last export, or null if never exported. */
  daysSinceExport: number | null;
}

/**
 * A backup is due when there are changes the last export doesn't contain, and either it's been
 * BACKUP_INTERVAL_DAYS since that export or (never exported) the archive is that old.
 * A dismissed reminder stays quiet for REMINDER_SNOOZE_DAYS.
 */
export function backupStatus(data: AppData, now: Date, snoozedAt: string | null): BackupStatus {
  const last = data.lastExportedAt ?? null;
  const daysSinceExport = last ? Math.floor((now.getTime() - Date.parse(last)) / DAY_MS) : null;
  const changed = newestChange(data.entries);
  if (!changed || (last && changed <= last)) return { due: false, daysSinceExport };
  if (snoozedAt && now.getTime() - Date.parse(snoozedAt) < REMINDER_SNOOZE_DAYS * DAY_MS) return { due: false, daysSinceExport };
  const reference = last ?? oldestEntry(data.entries);
  const age = reference ? (now.getTime() - Date.parse(reference)) / DAY_MS : 0;
  return { due: age >= BACKUP_INTERVAL_DAYS, daysSinceExport };
}

export interface ArchiveSummary {
  entries: number;
  issues: number;
  first: string | null;
  last: string | null;
}

export function summarize(data: AppData, weekOf: (iso: string) => string): ArchiveSummary {
  const weeks = new Set(data.entries.map((e) => weekOf(e.createdAt)));
  const sorted = data.entries.map((e) => e.createdAt).toSorted();
  return { entries: data.entries.length, issues: weeks.size, first: sorted[0] ?? null, last: sorted.at(-1) ?? null };
}

export interface MergeResult {
  data: AppData;
  added: number;
  updated: number;
}

/**
 * Merge an imported archive into the current one. Entries match by id and the most recently
 * edited version wins; cover overrides from the import win per issue; the current masthead is kept.
 */
export function mergeData(current: AppData, incoming: AppData): MergeResult {
  const byId = new Map(current.entries.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  for (const entry of incoming.entries) {
    const existing = byId.get(entry.id);
    if (!existing) {
      byId.set(entry.id, entry);
      added += 1;
    } else if (entry.updatedAt > existing.updatedAt) {
      byId.set(entry.id, entry);
      updated += 1;
    }
  }
  return {
    data: {
      ...current,
      magazine: current.magazine ?? incoming.magazine,
      entries: [...byId.values()],
      overrides: { ...current.overrides, ...incoming.overrides },
    },
    added,
    updated,
  };
}
