import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { readRaw, safeStorage, STORAGE_KEY } from '../domain/storage';
import { downloadText } from '../lib/download';
import ui from './ui.module.css';

export function PressLoader({ label = 'Warming up the press…' }: { label?: string }) {
  return (
    <div className={ui.loader} role="status" aria-live="polite">
      <div className={ui.rollers} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <span>{label}</span>
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

/** Last line of defence: keeps the user's archive recoverable even when rendering fails. */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('AMAZEEN crashed', error, info.componentStack);
  }

  private rescue = (): void => {
    const raw = readRaw(safeStorage(), STORAGE_KEY);
    if (raw) downloadText(raw, 'amazeen-rescue.json');
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className={ui.statePage}>
        <p className="kicker">Something jammed</p>
        <h1 className={ui.stateTitle}>
          Stop the <em>presses.</em>
        </h1>
        <p className={ui.stateText}>
          Something went wrong while laying out this page. Your writing is safe in this browser. Reloading usually clears the jam.
        </p>
        <div className={ui.stateActions}>
          <button type="button" className={`${ui.btn} ${ui.dark}`} onClick={() => window.location.assign('/')}>
            Reload AMAZEEN
          </button>
          <button type="button" className={ui.btn} onClick={this.rescue}>
            Download a rescue copy
          </button>
        </div>
      </main>
    );
  }
}
