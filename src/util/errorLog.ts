/** What went wrong and when, kept on this computer so a problem can be traced afterwards: the last entries in this
 * browser's storage and, in the desktop app, also a file (logs/errors.log in its data folder). Nothing is ever sent
 * anywhere; Copy details and Copy error log are how an entry leaves. */

/** app: the whole app stopped; page: one page stopped or could not load; script, promise: an error nothing caught. */
export type ErrorKind = 'app' | 'page' | 'script' | 'promise';
export interface ErrorEntry { at: string; kind: ErrorKind; message: string; stack?: string; where?: string; version: string }

const KEY = 'lvds.errorLog';
const MAX_ENTRIES = 30, MAX_MESSAGE = 1000, MAX_TEXT = 4000;
/** The same error again within this is not written again: one on every mouse move would fill the log with it alone. */
const REPEAT_MS = 5000;
let lastWritten: { message: string; at: number } | null = null;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

export function readErrorLog(): ErrorEntry[] {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(all) ? all.filter((e): e is ErrorEntry => typeof (e as ErrorEntry | null)?.message === 'string') : [];
  } catch { return []; }
}

/** An entry as text, for copying and for the log file. */
export function errorText(e: ErrorEntry): string {
  return [
    `LV Design Studio ${e.version} (${window.lvds ? 'desktop' : 'web'}) · ${e.at} · ${e.kind}`,
    ...(e.stack?.includes(e.message) ? [] : [e.message]),
    ...(e.stack ? [e.stack] : []),
    ...(e.where ? [`In:${e.where}`] : []),
    navigator.userAgent
  ].join('\n');
}

export const errorLogText = () => readErrorLog().map(errorText).join('\n\n');

/** Records an error and returns its entry. Never throws: logging an error must not cause another. */
export function logError(kind: ErrorKind, error: unknown, where?: string): ErrorEntry {
  const e = error instanceof Error ? error : undefined;
  const message = clip(e?.message ?? String(error), MAX_MESSAGE);
  const entry: ErrorEntry = { at: new Date().toISOString(), kind, message, ...(e?.stack ? { stack: clip(e.stack, MAX_TEXT) } : {}), ...(where ? { where: clip(where, MAX_TEXT) } : {}), version: __APP_VERSION__ };
  const now = Date.now();
  if (lastWritten?.message === message && now - lastWritten.at < REPEAT_MS) return entry;
  lastWritten = { message, at: now };
  try { localStorage.setItem(KEY, JSON.stringify([...readErrorLog(), entry].slice(-MAX_ENTRIES))); } catch { /* storage full or blocked */ }
  try { void window.lvds?.log?.error(errorText(entry)).catch(() => { /* the file is the second copy */ }); } catch { /* an older desktop build */ }
  return entry;
}

/** Records what no part of the app caught. These do not stop the app, but they are often how a problem starts. */
export function watchForErrors() {
  window.addEventListener('error', (e) => { if (!/ResizeObserver loop/.test(e.message)) logError('script', e.error ?? e.message); });
  window.addEventListener('unhandledrejection', (e) => { logError('promise', e.reason); });
}
