/** Design CAD's view arithmetic (S2 of the 2D gap plan): a view is the drawing point (relative to the drawing's origin)
 * at the canvas's lower-left corner and how many pixels a drawing unit takes. ZOOM Window, ZOOM Scale and the view
 * history (ZOOM Previous) work on it without the canvas, so they can be tested alone. */

type Pt = [number, number];
export interface ViewT { scale: number; ox: number; oy: number }
export interface ViewSize { w: number; h: number }
/** Views kept per drawing for ZOOM Previous. */
export const VIEW_HISTORY = 20;

const clampScale = (s: number) => Math.min(1e6, Math.max(1e-6, s));

/** The view with the box from corner a to corner b (origin-relative drawing units) as large as the canvas allows, in
 * the middle. A flat or empty box zooms to its point. */
export function windowView(a: Pt, b: Pt, size: ViewSize): ViewT {
  const w = Math.max(1e-9, Math.abs(b[0] - a[0])), h = Math.max(1e-9, Math.abs(b[1] - a[1]));
  const scale = clampScale(Math.min(size.w / w, size.h / h));
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  return { scale, ox: cx - size.w / 2 / scale, oy: cy - size.h / 2 / scale };
}

/** The view zoomed k times about its middle. */
export function scaledView(v: ViewT, k: number, size: ViewSize): ViewT {
  const cx = v.ox + size.w / 2 / v.scale, cy = v.oy + size.h / 2 / v.scale;
  const scale = clampScale(v.scale * k);
  return { scale, ox: cx - size.w / 2 / scale, oy: cy - size.h / 2 / scale };
}

/** A factor typed at ZOOM Scale: "2" or "0.5" is relative to the whole drawing in view (the fit), "2x" or "0.5X" to the
 * view as it is; undefined when it is not a positive number. */
export function parseZoomScale(text: string): { k: number; relative: boolean } | undefined {
  const m = /^(\d*\.?\d+)\s*(x)?$/i.exec(text.trim().replace(',', '.'));
  if (!m) return undefined;
  const k = Number(m[1]);
  return k > 0 ? { k, relative: !!m[2] } : undefined;
}

/** The same view within a hundredth of a pixel. */
export const sameView = (a: ViewT, b: ViewT) => Math.abs(a.scale - b.scale) <= 1e-9 * a.scale && Math.abs(a.ox - b.ox) * a.scale < 0.01 && Math.abs(a.oy - b.oy) * a.scale < 0.01;

/** The history with v as its newest view: as it was when v is the newest already; the oldest dropped past VIEW_HISTORY. */
export function pushView(hist: readonly ViewT[], v: ViewT): ViewT[] {
  const last = hist[hist.length - 1];
  if (last && sameView(last, v)) return [...hist];
  return [...hist, v].slice(-VIEW_HISTORY);
}

/** The view before the newest, which is dropped; undefined at the start of the history. */
export function popView(hist: readonly ViewT[]): { hist: ViewT[]; view: ViewT } | undefined {
  if (hist.length < 2) return undefined;
  const h = hist.slice(0, -1);
  return { hist: h, view: h[h.length - 1] };
}
