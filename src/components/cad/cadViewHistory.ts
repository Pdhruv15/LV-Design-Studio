import { popView, pushView, type ViewT } from '../../model/cadView';

/** The last views of each open drawing (S2 of the 2D gap plan: ZOOM Previous), kept while the drawing is open. The
 * canvas remembers each view once it rests; the page asks whether there is one to go back to. */
const histOf = new WeakMap<object, ViewT[]>();

export function rememberView(drawing: object, v: ViewT): void { histOf.set(drawing, pushView(histOf.get(drawing) ?? [], v)); }
/** The view before the one now, which is dropped; undefined when there is none. */
export function previousView(drawing: object): ViewT | undefined {
  const r = popView(histOf.get(drawing) ?? []);
  if (!r) return undefined;
  histOf.set(drawing, r.hist);
  return r.view;
}
export const hasPreviousView = (drawing: object) => (histOf.get(drawing)?.length ?? 0) > 1;
