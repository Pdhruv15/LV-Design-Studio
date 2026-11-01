import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import type { CrashKept } from '../model/projectStore';
import { errorText, logError, type ErrorEntry } from '../util/errorLog';

/** Keeps the app's unsaved work; the app gives it, because a crash takes the app's own state down with it. */
let keeper: (() => Promise<CrashKept>) | null = null;
export const setCrashKeeper = (keep: (() => Promise<CrashKept>) | null) => { keeper = keep; };
/** A crash screen does not wait for ever on a window that may be failing. */
const KEEP_WAIT_MS = 5000;

function keepUnsaved(): Promise<CrashKept> {
  if (!keeper) return Promise.resolve('nothing');
  return Promise.race([keeper().catch((): CrashKept => 'failed'), new Promise<CrashKept>((done) => { setTimeout(() => done('failed'), KEEP_WAIT_MS); })]);
}

function CopyDetails({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return <button className="chip" onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false))}>{copied ? 'Copied' : 'Copy details'}</button>;
}
const Details = ({ text }: { text: string }) => <details className="crash-details"><summary>Details</summary><pre>{text}</pre></details>;

const KEPT_TEXT: Record<CrashKept, string> = {
  kept: 'Your unsaved work has been kept. After reloading, choose Restore it in the bar at the top.',
  waiting: 'A recovery copy of this project is already waiting. After reloading, choose Restore it in the bar at the top.',
  nothing: 'There were no unsaved changes.',
  failed: 'Changes since your last save or recovery copy could not be kept.'
};

/** The whole app has stopped: nothing else can be clicked, so this is all there is on screen. */
export function CrashScreen({ text, kept }: { text: string; kept: CrashKept | null }) {
  return (
    <div className="crash-screen" role="alert">
      <div className="crash-box">
        <h1>Something went wrong</h1>
        <p>LV Design Studio hit an error and needs to reload. The details are saved on this computer.</p>
        <p>{kept ? KEPT_TEXT[kept] : 'Keeping your unsaved work…'}</p>
        <div className="crash-actions">
          <button className="chip primary" disabled={!kept} onClick={() => location.reload()}>Reload</button>
          <CopyDetails text={text} />
        </div>
        <Details text={text} />
      </div>
    </div>
  );
}

/** One page has stopped; the ribbon and the panels around it still work. */
export function PageError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="page-not-loaded" role="alert">
      <h3>This page hit an error</h3>
      <p>The rest of the app still works, so you can go to another page and save your project. The details are saved on this computer.</p>
      <div className="crash-actions">
        <button className="chip primary" onClick={onRetry}>Try again</button>
        <CopyDetails text={text} />
      </div>
      <Details text={text} />
    </div>
  );
}

interface Props { level: 'app' | 'page'; /** A page's error clears when this changes: another page, board or project was opened. */ resetKey?: unknown; children: ReactNode }
interface State { failed: boolean; entry: ErrorEntry | null; kept: CrashKept | null }

/** What stands between an error while drawing a screen and a dead window: without one, React takes the whole app down
 * and leaves an empty window where nothing can be clicked. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, entry: null, kept: null };

  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ entry: logError(this.props.level, error, info.componentStack ?? undefined) });
    if (this.props.level === 'app') void keepUnsaved().then((kept) => this.setState({ kept }));
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.retry();
  }

  retry = () => this.setState({ failed: false, entry: null });

  render() {
    if (!this.state.failed) return this.props.children;
    const text = this.state.entry ? errorText(this.state.entry) : '';
    return this.props.level === 'app' ? <CrashScreen text={text} kept={this.state.kept} /> : <PageError text={text} onRetry={this.retry} />;
  }
}
