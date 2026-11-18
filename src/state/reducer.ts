import type { AppData, Entry, IssueOverride, Magazine } from '../domain/types';

export type Action =
  | { type: 'magazine/set'; magazine: Magazine }
  | { type: 'entry/add'; entry: Entry }
  | { type: 'entry/update'; entry: Entry }
  | { type: 'entry/delete'; id: string }
  | { type: 'entry/toggleStar'; id: string; now: string }
  | { type: 'override/set'; key: string; override: IssueOverride | null }
  | { type: 'data/replace'; data: AppData }
  | { type: 'data/reset' };

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'magazine/set':
      return { ...state, magazine: action.magazine };
    case 'entry/add':
      if (state.entries.some((e) => e.id === action.entry.id)) return state;
      return { ...state, entries: [...state.entries, action.entry] };
    case 'entry/update':
      return { ...state, entries: state.entries.map((e) => (e.id === action.entry.id ? action.entry : e)) };
    case 'entry/delete':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
    case 'entry/toggleStar':
      return {
        ...state,
        entries: state.entries.map((e) => (e.id === action.id ? { ...e, starred: !e.starred, updatedAt: action.now } : e)),
      };
    case 'override/set': {
      const { [action.key]: _previous, ...rest } = state.overrides;
      return { ...state, overrides: action.override ? { ...rest, [action.key]: action.override } : rest };
    }
    case 'data/replace':
      return action.data;
    case 'data/reset':
      return { version: 1, magazine: null, entries: [], overrides: {} };
  }
}
