import { Component, type ReactNode } from 'react';

/** Catches render crashes so a bug shows a message + reload button instead of a blank white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <p className="font-bold mb-1">Something went wrong on this screen</p>
          <p className="text-sm text-[var(--color-ink-muted)] mb-4">{this.state.error.message}</p>
          <button className="rounded-md bg-[var(--color-pitch)] text-white px-4 py-2 text-sm font-semibold" onClick={() => { window.location.href = '/coach'; }}>Back to dashboard</button>
        </div>
      </div>
    );
  }
}
