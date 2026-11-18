import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Current time, refreshed on an interval (default: every 30s) so countdowns and week rollover stay live. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const REDUCED = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED).matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    prefersReducedMotion,
    () => false,
  );
}

/** Grow a textarea to fit its content. */
export function useAutosize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Global single-key shortcuts that never fire while the user is typing or holding a modifier
 * (except where the handler opts into modifier keys itself).
 */
export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true): void {
  const mapRef = useRef(map);
  mapRef.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const handler = mapRef.current[e.key];
      if (handler) {
        handler(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — AMAZEEN` : 'AMAZEEN';
  }, [title]);
}
