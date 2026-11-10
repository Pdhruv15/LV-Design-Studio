/** Where Design CAD's copied objects are kept (src/model/cadClipboard.ts): in memory for every drawing tab of this
 * window, and on the system clipboard when the page may write to it. The desktop app does not let pages read the
 * system clipboard, so paste takes the copy in memory, and the system clipboard only when there is none (the web
 * version, copied in another window). */

let held: string | null = null;

export function putClip(text: string): void {
  held = text;
  try { void navigator.clipboard?.writeText(text).catch(() => undefined); } catch { /* the copy in memory is enough */ }
}

/** Something copied in this window. */
export const hasClip = () => held !== null;

/** The copy in memory at once; else what the system clipboard holds, if the page may read it. */
export function getClip(): string | Promise<string | null> {
  if (held !== null) return held;
  try {
    const read = navigator.clipboard?.readText?.();
    return read ? read.catch(() => null) : Promise.resolve(null);
  } catch { return Promise.resolve(null); }
}

/** For tests: forget what was copied. */
export function clearClip(): void { held = null; }
