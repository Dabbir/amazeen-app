import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { weekKey } from '../domain/dates';
import { compileIssues, weeklyStreak } from '../domain/issues';
import { loadData, saveData } from '../domain/storage';
import type { LoadOutcome, SaveOutcome } from '../domain/storage';
import type { AppData, Entry, Issue, IssueOverride, Magazine } from '../domain/types';
import { useNow } from './hooks';
import { reducer } from './reducer';

export interface Store {
  data: AppData;
  /** All issues, newest first. `issues[0]` is always the current week's issue. */
  issues: readonly Issue[];
  current: Issue;
  streak: number;
  now: Date;
  loadStatus: LoadOutcome['status'];
  saveStatus: SaveOutcome;
  setMagazine: (magazine: Magazine) => void;
  addEntry: (entry: Entry) => void;
  updateEntry: (entry: Entry) => void;
  deleteEntry: (id: string) => Entry | undefined;
  toggleStar: (id: string) => void;
  setOverride: (key: string, override: IssueOverride | null) => void;
  replaceData: (data: AppData) => void;
  resetData: () => void;
  findIssue: (key: string) => Issue | undefined;
  issueForEntry: (entry: Entry) => Issue | undefined;
}

const StoreContext = createContext<Store | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Inject initial data (tests). Defaults to localStorage. */
  initial?: LoadOutcome;
}

export function StoreProvider({ children, initial }: ProviderProps) {
  const [boot] = useState<LoadOutcome>(() => initial ?? loadData());
  const [data, dispatch] = useReducer(reducer, boot.data);
  const [loadStatus, setLoadStatus] = useState(boot.status);
  const [saveStatus, setSaveStatus] = useState<SaveOutcome>({ ok: true });
  const now = useNow();
  const dataRef = useRef(data);
  dataRef.current = data;

  // Persist on change. Corrupt storage is left untouched until the user acts, so it can still be recovered.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveStatus(saveData(data));
    setLoadStatus((s) => (s === 'corrupt' ? 'ok' : s));
  }, [data]);

  const currentKey = weekKey(now);
  // Recompile only when content changes or the week rolls over, not on every clock tick.
  const issues = useMemo(
    () => compileIssues(data, now),
    [data.entries, data.overrides, currentKey],
  );
  const streak = useMemo(() => weeklyStreak(data.entries, now), [data.entries, currentKey]);

  const findIssue = useCallback((key: string) => issues.find((i) => i.key === key), [issues]);
  const issueForEntry = useCallback((entry: Entry) => findIssue(weekKey(new Date(entry.createdAt))), [findIssue]);

  const deleteEntry = useCallback((id: string) => {
    const existing = dataRef.current.entries.find((e) => e.id === id);
    dispatch({ type: 'entry/delete', id });
    return existing;
  }, []);

  const store = useMemo<Store>(() => {
    const current = issues[0];
    if (!current) throw new Error('Invariant: the current issue always exists.');
    return {
      data,
      issues,
      current,
      streak,
      now,
      loadStatus,
      saveStatus,
      setMagazine: (magazine) => dispatch({ type: 'magazine/set', magazine }),
      addEntry: (entry) => dispatch({ type: 'entry/add', entry }),
      updateEntry: (entry) => dispatch({ type: 'entry/update', entry }),
      deleteEntry,
      toggleStar: (id) => dispatch({ type: 'entry/toggleStar', id, now: new Date().toISOString() }),
      setOverride: (key, override) => dispatch({ type: 'override/set', key, override }),
      replaceData: (next) => dispatch({ type: 'data/replace', data: next }),
      resetData: () => dispatch({ type: 'data/reset' }),
      findIssue,
      issueForEntry,
    };
  }, [data, issues, streak, now, loadStatus, saveStatus, deleteEntry, findIssue, issueForEntry]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>.');
  return store;
}
