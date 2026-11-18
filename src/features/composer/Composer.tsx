import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ConfirmDialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import ui from '../../components/ui.module.css';
import { KIND_INFO } from '../../domain/catalog';
import { formatDayMonth, weekKey } from '../../domain/dates';
import {
  createEntry,
  draftFromEntry,
  emptyDraft,
  hasErrors,
  isDraftBlank,
  sameDraft,
  updateEntry,
  validateDraft,
} from '../../domain/entries';
import type { DraftErrors } from '../../domain/entries';
import { ENTRY_KINDS } from '../../domain/types';
import type { Entry, EntryDraft, EntryKind, EntryMeta } from '../../domain/types';
import { paths, useRouter } from '../../router/router';
import { prefersReducedMotion, useDocumentTitle } from '../../state/hooks';
import { useStore } from '../../state/store';
import { NotFound } from '../NotFound';
import { clearDraft, loadDraft, saveDraft } from './drafts';
import { DraftFields } from './DraftFields';
import { FilingBar } from './FilingBar';
import styles from './Composer.module.css';

type Mode = { type: 'new'; kind: EntryKind } | { type: 'edit'; id: string };

const STAMP_MS = 720;

function defaultMeta(entries: readonly Entry[]): EntryMeta {
  // Carry today's mood forward: if you've already said it's a sunny day, it probably still is.
  const today = new Date().toDateString();
  const last = [...entries].reverse().find((e) => new Date(e.createdAt).toDateString() === today);
  return { section: 'life', mood: last?.mood ?? 3, starred: false };
}

export default function Composer({ mode }: { mode: Mode }) {
  const store = useStore();
  const existing = mode.type === 'edit' ? store.data.entries.find((e) => e.id === mode.id) : undefined;
  if (mode.type === 'edit' && !existing) {
    return (
      <div className={styles.missing}>
        <NotFound title="This piece isn’t in the archive." text="It may have been deleted, or the link is from another browser." />
      </div>
    );
  }
  return <ComposerForm mode={mode} existing={existing} />;
}

function ComposerForm({ mode, existing }: { mode: Mode; existing: Entry | undefined }) {
  const store = useStore();
  const { navigate, back } = useRouter();
  const toast = useToast();
  const kind: EntryKind = existing?.kind ?? (mode.type === 'new' ? mode.kind : 'story');

  const [restored] = useState(() => (existing ? null : loadDraft(kind)));
  const initial = useMemo(
    () => ({
      draft: existing ? draftFromEntry(existing) : (restored?.draft ?? emptyDraft(kind)),
      meta: existing
        ? { section: existing.section, mood: existing.mood, starred: existing.starred }
        : (restored?.meta ?? defaultMeta(store.data.entries)),
    }),
    // Initial values are computed once per mount; later store changes must not reset the form.
    [],
  );
  const [draft, setDraft] = useState<EntryDraft>(initial.draft);
  const [meta, setMeta] = useState<EntryMeta>(initial.meta);
  const [showErrors, setShowErrors] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>(restored ? 'saved' : 'idle');
  const [showRestored, setShowRestored] = useState(Boolean(restored && !isDraftBlank(restored.draft)));
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [stamping, setStamping] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [attempt, setAttempt] = useState(0);

  // After a failed submit, move focus to the first invalid field (runs once errors are in the DOM).
  useEffect(() => {
    if (attempt > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [attempt]);

  const errors: DraftErrors = useMemo(() => validateDraft(draft), [draft]);
  const visibleErrors = showErrors ? errors : {};
  const dirty = existing
    ? !sameDraft(draft, initial.draft) ||
      meta.section !== initial.meta.section ||
      meta.mood !== initial.meta.mood ||
      meta.starred !== initial.meta.starred
    : false;

  useDocumentTitle(existing ? 'Editing' : KIND_INFO[kind].verb);

  // Autosave new-entry drafts (debounced). Edits are only saved explicitly.
  useEffect(() => {
    if (existing || stamping) return;
    if (isDraftBlank(draft)) {
      clearDraft(kind);
      setSaveState('idle');
      return;
    }
    setSaveState('saving');
    const id = window.setTimeout(() => {
      setSaveState(saveDraft(kind, { draft, meta, savedAt: new Date().toISOString() }) ? 'saved' : 'failed');
    }, 450);
    return () => window.clearTimeout(id);
  }, [draft, meta, kind, existing, stamping]);

  // Guard against closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const leave = useCallback(() => {
    if (dirty) setConfirmLeave(true);
    else back(paths.desk());
  }, [dirty, back]);

  const submit = (e?: FormEvent): void => {
    e?.preventDefault();
    if (stamping) return;
    if (hasErrors(errors)) {
      setShowErrors(true);
      setAttempt((n) => n + 1);
      return;
    }

    const now = new Date();
    if (existing) {
      store.updateEntry(updateEntry(existing, draft, meta, now));
      toast.push({ message: 'Changes saved.' });
      back(paths.desk());
      return;
    }

    const entry = createEntry(draft, meta, now);
    store.addEntry(entry);
    clearDraft(kind);
    const key = weekKey(now);
    const number = store.current.key === key ? store.current.number : store.current.number + 1;
    const finish = (): void => {
      navigate(paths.desk(), { replace: true, transition: false });
      toast.push({
        message: `Filed to No. ${number}.`,
        action: { label: 'See the proof', onAction: () => navigate(paths.issue(key)) },
      });
    };
    if (prefersReducedMotion()) {
      finish();
    } else {
      setStamping(true);
      window.setTimeout(finish, STAMP_MS);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      leave();
    }
  };

  const issueLabel = existing
    ? `No. ${store.issueForEntry(existing)?.number ?? '?'} · filed ${formatDayMonth(new Date(existing.createdAt))}`
    : `For No. ${store.current.number}`;

  return (
    <div className={styles.page} onKeyDown={onKeyDown}>
      <header className={styles.bar}>
        <button type="button" className={`${ui.btn} ${ui.quiet} ${styles.back}`} onClick={leave}>
          <Icon name="left" size={18} />
          <span>Desk</span>
        </button>

        {existing ? (
          <p className={styles.editing}>
            <span className="kicker">Editing {KIND_INFO[kind].label}</span>
            <span className={styles.editingMeta}>{issueLabel}</span>
          </p>
        ) : (
          <nav className={styles.kinds} aria-label="Kind of piece">
            {ENTRY_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={styles.kindTab}
                aria-current={k === kind ? 'page' : undefined}
                onClick={() => k !== kind && navigate(paths.write(k), { replace: true, transition: false })}
              >
                {KIND_INFO[k].label}
              </button>
            ))}
          </nav>
        )}

        <span className={styles.saveState} aria-live="polite">
          {saveState === 'saving' && 'Saving draft…'}
          {saveState === 'saved' && 'Draft saved'}
          {saveState === 'failed' && <span className={styles.saveFailed}>Draft not saved</span>}
          {existing && dirty && 'Unsaved changes'}
        </span>
      </header>

      {showRestored && (
        <div className={styles.restored} role="status">
          <span>Picked up where you left off.</span>
          <button
            type="button"
            className={styles.restoredBtn}
            onClick={() => {
              setDraft(emptyDraft(kind));
              clearDraft(kind);
              setShowRestored(false);
            }}
          >
            Start fresh
          </button>
          <button type="button" className={styles.restoredBtn} onClick={() => setShowRestored(false)}>
            Dismiss
          </button>
        </div>
      )}

      <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-label={existing ? 'Edit piece' : KIND_INFO[kind].verb}>
        <div className={styles.sheet} data-kind={kind}>
          <p className={styles.sheetKicker}>
            <span>{KIND_INFO[kind].label}</span>
            <span aria-hidden="true">·</span>
            <span>{issueLabel}</span>
          </p>
          <DraftFields draft={draft} errors={visibleErrors} onChange={setDraft} autoFocus={!existing} />
        </div>

        <FilingBar
          meta={meta}
          onChange={setMeta}
          submitLabel={existing ? 'Save changes' : `File to No. ${store.current.number}`}
          disabled={stamping}
          errorCount={Object.keys(visibleErrors).length}
        />
      </form>

      {stamping && (
        <div className={styles.stampLayer} aria-hidden="true">
          <div className={styles.stamp}>Filed</div>
        </div>
      )}

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without saving?"
        message="Your edits to this piece haven’t been saved."
        confirmLabel="Discard edits"
        tone="danger"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          back(paths.desk());
        }}
      />
    </div>
  );
}
