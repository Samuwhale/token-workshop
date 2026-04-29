import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  panelName?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.panelName ? `:${this.props.panelName}` : ''}]`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 gap-3 text-center">
          <p className="text-body font-medium text-[color:var(--color-figma-error)]">
            {this.props.panelName ? `${this.props.panelName} crashed` : 'Something went wrong'}
          </p>
          <p className="text-secondary text-[color:var(--color-figma-text-secondary)] font-mono break-all max-w-xs">
            {(this.state.error as Error).message}
          </p>
          <div className="flex gap-2">
            {this.props.onReset && (
              <button
                onClick={() => { this.setState({ error: null }); this.props.onReset?.(); }}
                className="px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-body font-medium hover:bg-[var(--color-figma-bg-hover)]"
              >
                Dismiss
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] text-body font-medium hover:bg-[var(--color-figma-action-bg-hover)]"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
