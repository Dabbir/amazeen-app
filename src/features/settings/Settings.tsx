import { useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ConfirmDialog, Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import ui from '../../components/ui.module.css';
import { LIMITS } from '../../domain/entries';
import { sampleEntries } from '../../domain/sample';
import { DataFormatError, MAX_IMPORT_BYTES, parseAppData, readRaw, safeStorage, serializeForExport, STORAGE_KEY } from '../../domain/storage';
import type { AppData } from '../../domain/types';
import { downloadText } from '../../lib/download';
import { useDocumentTitle } from '../../state/hooks';
import { useStore } from '../../state/store';
import styles from './Settings.module.css';

const ERASE_WORD = 'ERASE';

function MastheadForm() {
  const { data, setMagazine } = useStore();
  const toast = useToast();
  const magazine = data.magazine;
  const [title, setTitle] = useState(magazine?.title ?? '');
  const [editor, setEditor] = useState(magazine?.editor ?? '');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const editorId = useId();
  const changed = title.trim() !== magazine?.title || editor.trim() !== magazine?.editor;

  const save = (e: FormEvent): void => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setError('Your magazine needs a name.');
    if (t.length > LIMITS.magazineTitle) return setError(`Keep it under ${LIMITS.magazineTitle} characters.`);
    if (!magazine) return;
    setMagazine({ ...magazine, title: t, editor: editor.trim().slice(0, LIMITS.editor) || 'The Editor' });
    toast.push({ message: 'Masthead updated.' });
  };

  return (
    <form className={styles.form} onSubmit={save} noValidate>
      <div className={styles.mastPreview} aria-hidden="true">
        {title.trim() || 'Untitled'}
      </div>
      <div className={styles.fields}>
        <div>
          <label className={ui.label} htmlFor={titleId}>
            Magazine name
          </label>
          <input
            id={titleId}
            className={ui.input}
            value={title}
            maxLength={LIMITS.magazineTitle + 8}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${titleId}-err` : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p id={`${titleId}-err`} className={ui.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div>
          <label className={ui.label} htmlFor={editorId}>
            Byline
          </label>
          <input id={editorId} className={ui.input} value={editor} maxLength={LIMITS.editor} onChange={(e) => setEditor(e.target.value)} />
        </div>
      </div>
      <div>
        <button type="submit" className={`${ui.btn} ${ui.dark}`} disabled={!changed}>
          Save masthead
        </button>
      </div>
    </form>
  );
}

export default function Settings() {
  useDocumentTitle('Settings');
  const { data, replaceData, resetData, loadStatus } = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [pending, setPending] = useState<{ data: AppData; skipped: number; name: string } | null>(null);
  const [confirmSample, setConfirmSample] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [eraseText, setEraseText] = useState('');
  const eraseId = useId();

  const exportArchive = (): void => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(serializeForExport(data), `amazeen-archive-${stamp}.json`);
    toast.push({ message: `Exported ${data.entries.length} pieces.` });
  };

  const exportRescue = (): void => {
    const raw = readRaw(safeStorage(), STORAGE_KEY);
    if (raw) downloadText(raw, 'amazeen-rescue.json');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast.push({ tone: 'error', message: 'That file is over 5 MB, which is too big to be an AMAZEEN archive.' });
      return;
    }
    setImporting(true);
    try {
      const parsed = parseAppData(JSON.parse(await file.text()));
      if (parsed.data.entries.length === 0) throw new DataFormatError('That archive has no pieces in it.');
      setPending({ ...parsed, name: file.name });
    } catch (err) {
      toast.push({
        tone: 'error',
        message: err instanceof DataFormatError ? err.message : 'That file isn’t valid JSON. Is it an AMAZEEN export?',
      });
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = (): void => {
    if (!pending) return;
    replaceData({ ...pending.data, magazine: pending.data.magazine ?? data.magazine });
    toast.push({
      message: `Imported ${pending.data.entries.length} pieces${pending.skipped ? `, skipped ${pending.skipped} damaged` : ''}.`,
    });
    setPending(null);
  };

  return (
    <div className={styles.settings}>
      <header className={styles.head}>
        <p className="kicker">Editorial office</p>
        <h1 className={styles.title}>Settings</h1>
      </header>

      <section className={styles.section} aria-labelledby="s-masthead">
        <div className={styles.sectionIntro}>
          <h2 id="s-masthead">Masthead</h2>
          <p>The name printed across every cover, and the byline on your features.</p>
        </div>
        <MastheadForm />
      </section>

      <section className={styles.section} aria-labelledby="s-archive">
        <div className={styles.sectionIntro}>
          <h2 id="s-archive">Archive</h2>
          <p>Everything lives in this browser only. Export regularly to keep a copy, or to move to another device.</p>
        </div>
        <div className={styles.actions}>
          <div className={styles.action}>
            <div>
              <h3>Export archive</h3>
              <p>A JSON file with every piece, cover setting and your masthead.</p>
            </div>
            <button type="button" className={ui.btn} onClick={exportArchive} disabled={data.entries.length === 0}>
              <Icon name="download" size={16} /> Export
            </button>
          </div>
          <div className={styles.action}>
            <div>
              <h3>Import archive</h3>
              <p>Replace what’s here with a previously exported file. It’s validated before anything changes.</p>
            </div>
            <button type="button" className={ui.btn} onClick={() => fileRef.current?.click()} disabled={importing} aria-busy={importing}>
              <Icon name="upload" size={16} /> {importing ? 'Reading…' : 'Import'}
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e)} />
          </div>
          <div className={styles.action}>
            <div>
              <h3>Sample archive</h3>
              <p>Six weeks of example issues, handy for seeing what AMAZEEN can do.</p>
            </div>
            <button type="button" className={ui.btn} onClick={() => (data.entries.length ? setConfirmSample(true) : replaceData({ ...data, entries: sampleEntries(), overrides: {} }))}>
              Load sample
            </button>
          </div>
          {loadStatus === 'corrupt' && (
            <div className={styles.action}>
              <div>
                <h3>Rescue unreadable data</h3>
                <p>Download the raw saved data that couldn’t be opened, before it’s overwritten.</p>
              </div>
              <button type="button" className={`${ui.btn} ${ui.danger}`} onClick={exportRescue}>
                Download raw data
              </button>
            </div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.danger}`} aria-labelledby="s-danger">
        <div className={styles.sectionIntro}>
          <h2 id="s-danger">Stop the presses</h2>
          <p>Permanently erase every issue, piece and setting from this browser.</p>
        </div>
        <div>
          <button type="button" className={`${ui.btn} ${ui.danger}`} onClick={() => setErasing(true)}>
            <Icon name="trash" size={16} /> Erase everything
          </button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="s-keys">
        <div className={styles.sectionIntro}>
          <h2 id="s-keys">Shortcuts</h2>
          <p>For editors in a hurry.</p>
        </div>
        <dl className={styles.keys}>
          <div><dt><kbd>W</kbd></dt><dd>Write a story</dd></div>
          <div><dt><kbd>N</kbd></dt><dd>Jot a note</dd></div>
          <div><dt><kbd>/</kbd></dt><dd>Search the shelf</dd></div>
          <div><dt><kbd>⌘</kbd> <kbd>↵</kbd></dt><dd>File the piece you’re writing</dd></div>
          <div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Turn pages while reading</dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd>Close the reader or composer</dd></div>
        </dl>
      </section>

      <ConfirmDialog
        open={pending !== null}
        title="Replace your archive?"
        message={
          pending
            ? `“${pending.name}” has ${pending.data.entries.length} pieces${pending.skipped ? ` (${pending.skipped} damaged ones will be skipped)` : ''}. It will replace the ${data.entries.length} pieces currently here.`
            : ''
        }
        confirmLabel="Replace archive"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={confirmImport}
      />

      <ConfirmDialog
        open={confirmSample}
        title="Replace with sample issues?"
        message={`This swaps your ${data.entries.length} pieces for the sample archive. Export first if you want to keep them.`}
        confirmLabel="Load sample"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setConfirmSample(false)}
        onConfirm={() => {
          replaceData({ ...data, entries: sampleEntries(), overrides: {} });
          setConfirmSample(false);
          toast.push({ message: 'Sample archive loaded.' });
        }}
      />

      <Dialog
        open={erasing}
        onClose={() => {
          setErasing(false);
          setEraseText('');
        }}
        title="Erase everything?"
        actions={
          <>
            <button
              type="button"
              className={`${ui.btn} ${ui.quiet}`}
              onClick={() => {
                setErasing(false);
                setEraseText('');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.danger}`}
              disabled={eraseText.trim().toUpperCase() !== ERASE_WORD}
              onClick={() => {
                resetData();
                setErasing(false);
              }}
            >
              Erase permanently
            </button>
          </>
        }
      >
        <p className={ui.dialogText}>
          This deletes {data.entries.length} pieces across every issue. It can’t be undone. Type <strong>{ERASE_WORD}</strong> to confirm.
        </p>
        <label className="visually-hidden" htmlFor={eraseId}>
          Type {ERASE_WORD} to confirm
        </label>
        <input
          id={eraseId}
          className={`${ui.input} ${styles.eraseInput}`}
          value={eraseText}
          autoComplete="off"
          autoFocus
          onChange={(e) => setEraseText(e.target.value)}
        />
      </Dialog>
    </div>
  );
}
