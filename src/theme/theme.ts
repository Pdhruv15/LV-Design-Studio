/** Screen colours: a palette (Graphite or Blueprint) in a dark or light mode. Only changes how
 * the app looks on screen: drawings, PDFs and DXF are always produced from the default
 * Graphite dark palette (see withPrintTheme). */

export type ThemePref = 'dark' | 'light' | 'system';
export type PalettePref = 'graphite' | 'blueprint';
type Resolved = 'dark' | 'light';

export const THEME_LABEL: Record<ThemePref, string> = { dark: 'Dark', light: 'Light', system: 'Match system' };
export const PALETTE_LABEL: Record<PalettePref, string> = { graphite: 'Graphite', blueprint: 'Blueprint' };

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null);

export function resolveTheme(pref: ThemePref | undefined): Resolved {
  if (pref === 'light') return 'light';
  if (pref === 'system') return media()?.matches ? 'light' : 'dark';
  return 'dark';
}

/* Switch instantly: hover transitions would otherwise fade every button between palettes. */
function swapInstantly(change: () => void) {
  const el = document.documentElement;
  el.classList.add('theme-switching');
  change();
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('theme-switching')));
}

/** Dark is the stylesheet default, so it is written as no attribute at all. */
function setResolved(t: Resolved) {
  const el = document.documentElement;
  if ((el.getAttribute('data-theme') === 'light') === (t === 'light')) return;
  swapInstantly(() => {
    if (t === 'light') el.setAttribute('data-theme', 'light');
    else el.removeAttribute('data-theme');
  });
}

let unwatch: (() => void) | null = null;

/** Apply a preference now and, for "Match system", follow later OS changes. */
export function applyTheme(pref: ThemePref | undefined) {
  if (typeof document === 'undefined') return;
  unwatch?.();
  unwatch = null;
  setResolved(resolveTheme(pref));
  const m = media();
  if (pref === 'system' && m) {
    const on = () => setResolved(resolveTheme('system'));
    m.addEventListener('change', on);
    unwatch = () => m.removeEventListener('change', on);
  }
}

/** Graphite is the stylesheet default, so it is written as no attribute at all. */
export function applyPalette(pref: PalettePref | undefined) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const blueprint = pref === 'blueprint';
  if ((el.getAttribute('data-palette') === 'blueprint') === blueprint) return;
  swapInstantly(() => {
    if (blueprint) el.setAttribute('data-palette', 'blueprint');
    else el.removeAttribute('data-palette');
  });
}

/** The mode on screen now. */
export function screenTheme(): Resolved {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** The palette and mode on screen now, e.g. "graphite-dark": changes exactly when the colours do. */
export function screenAppearance(): string {
  const palette = typeof document !== 'undefined' && document.documentElement.getAttribute('data-palette') === 'blueprint' ? 'blueprint' : 'graphite';
  return `${palette}-${screenTheme()}`;
}

/** Call `on` when the screen colours change (palette or mode, from Preferences or the OS under
 * "Match system"), for drawing that reads colours once instead of through CSS, such as a canvas.
 * withPrintTheme's switch and back is not a change. Returns the unsubscribe. */
export function onScreenThemeChange(on: (t: Resolved) => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  let last = screenAppearance();
  const mo = new MutationObserver(() => {
    const now = screenAppearance();
    if (now !== last) { last = now; on(screenTheme()); }
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  return () => mo.disconnect();
}

/** Run `read` with the default Graphite dark palette in force, then restore the screen theme.
 * Export code reads live computed colours and maps that palette to black-on-white print
 * colours; this keeps that mapping (and so every exported drawing) identical whichever theme
 * is on screen. Synchronous, so the switch is never painted. */
export function withPrintTheme<T>(read: () => T): T {
  if (typeof document === 'undefined') return read();
  const el = document.documentElement;
  const prevTheme = el.getAttribute('data-theme');
  const prevPalette = el.getAttribute('data-palette');
  if (prevTheme === null && prevPalette === null) return read();
  el.removeAttribute('data-theme');
  el.removeAttribute('data-palette');
  try {
    return read();
  } finally {
    if (prevTheme !== null) el.setAttribute('data-theme', prevTheme);
    if (prevPalette !== null) el.setAttribute('data-palette', prevPalette);
  }
}
