/** Design CAD drafting settings (DS / DSETTINGS): snap and grid, polar and object snap tracking, the snap modes, dynamic
 * input, selection, the cursor, and saving. Kept for the user on this computer (Preferences → app.cadDraft), not in the
 * project; anything missing or out of range uses the default. Pure: the canvas and the page read it. */

type Pt = [number, number];

/** Snap mode bits, as the engine has them (engines/cad-reader/src/doc.rs). */
export const OSNAP_BITS = { endpoint: 1, midpoint: 2, center: 4, intersection: 8, insertion: 16, node: 32, quadrant: 64, nearest: 128, perpendicular: 256 } as const;
export type OsnapMode = keyof typeof OSNAP_BITS;
/** The snap modes in the dialog's order, with their marker and name. */
export const OSNAP_MODES: { k: OsnapMode; mark: string; label: string }[] = [
  { k: 'endpoint', mark: '□', label: 'Endpoint' }, { k: 'midpoint', mark: '△', label: 'Midpoint' }, { k: 'center', mark: '○', label: 'Centre' },
  { k: 'quadrant', mark: '◇', label: 'Quadrant' }, { k: 'intersection', mark: '✕', label: 'Intersection' }, { k: 'node', mark: '⊙', label: 'Node' },
  { k: 'insertion', mark: '⊡', label: 'Insertion' }, { k: 'perpendicular', mark: '⊥', label: 'Perpendicular' }, { k: 'nearest', mark: '⧖', label: 'Nearest' }
];
const ALL_BITS = Object.values(OSNAP_BITS).reduce((a, b) => a | b, 0);
/** The modes on before this dialog existed: all but nearest and perpendicular. */
export const OSNAP_DEFAULT = ALL_BITS & ~(OSNAP_BITS.nearest | OSNAP_BITS.perpendicular);

/** Polar increment angles offered (degrees). */
export const POLAR_INCREMENTS = [5, 10, 15, 18, 22.5, 30, 45, 90] as const;
/** DWG / DXF versions Save As offers, newest first ('' = the drawing's own). DXF can also be R12. */
export const DWG_VERSIONS = ['2018', '2013', '2010', '2007', '2004', '2000'] as const;
export const DXF_VERSIONS = [...DWG_VERSIONS, 'R12'] as const;

export interface DraftSettings {
  /** Snap (F9) spacing in mm on the plan; 0 = the grid's step on screen (as before). */
  snapX: number;
  snapY: number;
  /** Grid (F7) spacing in mm; 0 = adapts to the zoom. */
  gridMm: number;
  /** A stronger grid line every this many. */
  gridMajor: number;
  /** Polar tracking increment (degrees) and extra angles. */
  polarInc: number;
  polarExtra: number[];
  /** Object snap tracking lines along every polar angle from an acquired point (else straight only: 0°, 90°…). */
  trackAllPolar: boolean;
  /** Snap modes (OSNAP_BITS). */
  osnap: number;
  /** Dynamic input: the length / angle boxes, the short prompt and its options list at the cursor. */
  dynBoxes: boolean;
  dynPrompt: boolean;
  dynOptions: boolean;
  /** A block with attributes inserted: its prompts asked in a dialog (else one by one on the command line). */
  attDialog: boolean;
  /** Selection: the selection window shaded, grips shown on what is picked, their size and the pick box (px). */
  windowFill: boolean;
  grips: boolean;
  gripPx: number;
  pickPx: number;
  /** Cursor: crosshair length as % of the view (100 = across it), snap aperture, snap marker size (px), the snap name. */
  crossPct: number;
  aperturePx: number;
  markerPx: number;
  snapTip: boolean;
  /** Saving: the format Save As starts with, and the previous copy kept as .bak when Save writes over it. */
  saveFormat: 'own' | 'dwg' | 'dxf';
  keepBak: boolean;
}

export const DRAFT_DEFAULTS: DraftSettings = {
  snapX: 0, snapY: 0, gridMm: 0, gridMajor: 5,
  polarInc: 45, polarExtra: [], trackAllPolar: false,
  osnap: OSNAP_DEFAULT,
  dynBoxes: true, dynPrompt: true, dynOptions: true, attDialog: false,
  windowFill: true, grips: true, gripPx: 8, pickPx: 9,
  crossPct: 100, aperturePx: 10, markerPx: 7, snapTip: true,
  saveFormat: 'own', keepBak: true
};

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** The settings as kept, checked: anything missing, of the wrong kind or out of range is the default. */
export function draftSettings(v: unknown): DraftSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DRAFT_DEFAULTS;
  const extra = Array.isArray(o.polarExtra) ? o.polarExtra.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 360).slice(0, 8) : d.polarExtra;
  return {
    snapX: num(o.snapX, 0, 1e6, d.snapX), snapY: num(o.snapY, 0, 1e6, d.snapY), gridMm: num(o.gridMm, 0, 1e6, d.gridMm), gridMajor: Math.round(num(o.gridMajor, 1, 100, d.gridMajor)),
    polarInc: num(o.polarInc, 1, 90, d.polarInc), polarExtra: extra, trackAllPolar: bool(o.trackAllPolar, d.trackAllPolar),
    osnap: typeof o.osnap === 'number' && Number.isInteger(o.osnap) ? o.osnap & ALL_BITS : d.osnap,
    dynBoxes: bool(o.dynBoxes, d.dynBoxes), dynPrompt: bool(o.dynPrompt, d.dynPrompt), dynOptions: bool(o.dynOptions, d.dynOptions), attDialog: bool(o.attDialog, d.attDialog),
    windowFill: bool(o.windowFill, d.windowFill), grips: bool(o.grips, d.grips), gripPx: Math.round(num(o.gripPx, 4, 20, d.gripPx)), pickPx: Math.round(num(o.pickPx, 3, 30, d.pickPx)),
    crossPct: Math.round(num(o.crossPct, 1, 100, d.crossPct)), aperturePx: Math.round(num(o.aperturePx, 2, 40, d.aperturePx)), markerPx: Math.round(num(o.markerPx, 3, 20, d.markerPx)), snapTip: bool(o.snapTip, d.snapTip),
    saveFormat: o.saveFormat === 'dwg' || o.saveFormat === 'dxf' ? o.saveFormat : 'own', keepBak: bool(o.keepBak, d.keepBak)
  };
}

/** Parses typed extra polar angles ("60, 120"), keeping those between 0 and 360°. */
export const parseAngles = (s: string): number[] => s.split(/[,;\s]+/).map(Number).filter((x) => Number.isFinite(x) && x > 0 && x < 360).slice(0, 8);

/** Every polar tracking angle (degrees, 0 ≤ a < 360): the multiples of the increment and the extra angles. */
export function polarAngles(inc: number, extra: number[] = []): number[] {
  const out = new Set<number>();
  for (let a = 0; a < 360 - 1e-9; a += inc) out.add(Math.round(a * 1e6) / 1e6);
  for (const e of extra) out.add(e % 360);
  return [...out].sort((a, b) => a - b);
}

/** Polar tracking from `from`: when the cursor is within `tolPx` of a ray at one of the angles, the point on that ray
 * (same distance along it) and the angle; else null. `pixel` is one screen pixel in drawing units. */
export function polarTrack(from: Pt, at: Pt, angles: number[], pixel: number, tolPx = 8): { at: Pt; angle: number } | null {
  const dx = at[0] - from[0], dy = at[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < pixel * 4) return null;
  let best: { at: Pt; angle: number; off: number } | null = null;
  for (const a of angles) {
    const r = (a * Math.PI) / 180, ux = Math.cos(r), uy = Math.sin(r);
    const along = dx * ux + dy * uy;
    if (along <= 0) continue;
    const off = Math.abs(-dx * uy + dy * ux);
    if (off <= tolPx * pixel && (!best || off < best.off)) best = { at: [from[0] + along * ux, from[1] + along * uy], angle: a, off };
  }
  return best && { at: best.at, angle: best.angle };
}

/** Object snap tracking: from points acquired (snap points the cursor rested on), the alignment lines (0° and 90°, or
 * every polar angle) the cursor is near. Near two lines from different points: where they cross. Returns the point and
 * the lines' starts, or null. */
export function otrack(acquired: Pt[], at: Pt, angles: number[], pixel: number, tolPx = 8): { at: Pt; from: Pt[] } | null {
  type Hit = { p: Pt; from: Pt; u: Pt; off: number };
  const hits: Hit[] = [];
  for (const q of acquired) {
    let best: Hit | null = null;
    for (const a of angles) {
      const r = (a * Math.PI) / 180, u: Pt = [Math.cos(r), Math.sin(r)];
      const dx = at[0] - q[0], dy = at[1] - q[1];
      const along = dx * u[0] + dy * u[1];
      if (along <= pixel * 4) continue;
      const off = Math.abs(-dx * u[1] + dy * u[0]);
      if (off <= tolPx * pixel && (!best || off < best.off)) best = { p: [q[0] + along * u[0], q[1] + along * u[1]], from: q, u, off };
    }
    if (best) hits.push(best);
  }
  if (!hits.length) return null;
  hits.sort((a, b) => a.off - b.off);
  const [h1, h2] = hits;
  if (h2) {
    const d = h1.u[0] * h2.u[1] - h1.u[1] * h2.u[0];
    if (Math.abs(d) > 1e-9) {
      const t = ((h2.from[0] - h1.from[0]) * h2.u[1] - (h2.from[1] - h1.from[1]) * h2.u[0]) / d;
      const p: Pt = [h1.from[0] + t * h1.u[0], h1.from[1] + t * h1.u[1]];
      if (Math.hypot(p[0] - at[0], p[1] - at[1]) <= tolPx * pixel * 1.5) return { at: p, from: [h1.from, h2.from] };
    }
  }
  return { at: h1.p, from: [h1.from] };
}

/** A point on the snap spacing (drawing units); a spacing of 0 leaves that coordinate as it is. */
export function snapToSpacing(at: Pt, sx: number, sy: number): Pt {
  return [sx > 0 ? Math.round(at[0] / sx) * sx : at[0], sy > 0 ? Math.round(at[1] / sy) * sy : at[1]];
}
