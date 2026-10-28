import { Component, type ReactNode } from 'react';
import { reportCrash, useCrashState } from '../lib/crashRecovery';
import { CrashScreen } from './CrashScreen';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { reportCrash(error, 'react'); }
  render() { return this.state.failed ? <CrashScreen /> : this.props.children; }
}

/** A new generation remounts the failed tree; the game store survives outside React. */
export function CrashGuard({ children }: { children: ReactNode }) {
  const incident = useCrashState((s) => s.incident);
  const generation = useCrashState((s) => s.generation);
  return <ErrorBoundary key={generation}>{incident ? <CrashScreen /> : children}</ErrorBoundary>;
}
