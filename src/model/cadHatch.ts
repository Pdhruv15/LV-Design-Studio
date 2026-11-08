import { dashArray, hatchLines, patternLength } from './cadDraw';

/** Design CAD → Hatch patterns: each pattern is one or more families of parallel lines, as a .pat file or a DXF hatch
 * keeps them. Pattern units: one unit is the hatch's spacing (paper mm at the annotation scale), so ANSI31 at spacing 3
 * is 45° lines 3 mm apart. The patterns are the app's own definitions. */

type Pt = [number, number];
type Box = [number, number, number, number];

/** One family of pattern lines: angle (degrees), a point the first line passes through, the step to the next line in
 * the line's own frame (along it, across it) and its dashes (+ dash, − gap, 0 dot; none: continuous). */
export interface PatternLine { angle: number; base: Pt; offset: Pt; dashes: number[] }
export interface PatternDef {
  label: string;
  lines: PatternLine[];
  solid?: boolean;
  /** Drawn the same at any angle (the hatch's angle is not offered). */
  noAngle?: boolean;
}

const L = (angle: number, base: Pt, offset: Pt, dashes: number[] = []): PatternLine => ({ angle, base, offset, dashes });
const R3 = Math.sqrt(3);

export const HATCH_PATTERNS = {
  solid: { label: 'Solid', lines: [], solid: true },
  ansi31: { label: 'ANSI31 (45° lines)', lines: [L(45, [0, 0], [0, 1])] },
  ansi37: { label: 'ANSI37 (cross 45°)', lines: [L(45, [0, 0], [0, 1]), L(135, [0, 0], [0, 1])] },
  net: { label: 'Net (square grid)', lines: [L(0, [0, 0], [0, 1]), L(90, [0, 0], [0, 1])] },
  dots: { label: 'Dots', lines: [L(0, [0, 0], [0, 1], [0, -1])], noAngle: true },
  horizontal: { label: 'Lines 0° (horizontal)', lines: [L(0, [0, 0], [0, 1])] },
  vertical: { label: 'Lines 90° (vertical)', lines: [L(90, [0, 0], [0, 1])] },
  dash45: { label: 'Dashed 45° (removed or existing)', lines: [L(45, [0, 0], [0.5, 1], [1, -0.5])] },
  steel: { label: 'Steel (double 45°)', lines: [L(45, [0, 0], [0, 1.5]), L(45, [-0.3 / Math.SQRT2, 0.3 / Math.SQRT2], [0, 1.5])] },
  hazard: { label: 'Hazard (45° bands, no-go zones)', lines: [0, 0.15, 0.3].map((d) => L(45, [-d / Math.SQRT2, d / Math.SQRT2], [0, 1.5])) },
  trench: { label: 'Dashed lines (cable trench)', lines: [L(0, [0, 0], [0.75, 1], [1, -0.5])] },
  brick: { label: 'Brick', lines: [L(0, [0, 0], [0, 1]), L(90, [0, 0], [1, -1], [1, -1])] },
  block: { label: 'Block work', lines: [L(0, [0, 0], [0, 1]), L(90, [0, 0], [1, -1.5], [1, -1])] },
  concrete: { label: 'Concrete', lines: [L(50, [0, 0], [0.6, 1.5], [0.4, -1.6]), L(140, [0.3, 0.2], [0.5, 1.7], [0.3, -1.9]), L(20, [0.1, 0.6], [1.1, 1.3], [0, -2.2])] },
  earth: { label: 'Earth', lines: [...[0, 0.15, 0.3].map((y) => L(0, [0, y], [0.5, 0.5], [0.5, -0.5])), ...[0.6, 0.75, 0.9].map((x) => L(90, [x, 0], [0.5, -0.5], [0.35, -0.65]))] },
  gravel: { label: 'Gravel', lines: [L(0, [0, 0], [0.5, 0.9], [0, -1.3]), L(30, [0.3, 0.4], [0.7, 1.1], [0, -0.9]), L(60, [0.6, 0.1], [0.9, 1.2], [0.2, -1.5])] },
  sand: { label: 'Sand', lines: [L(0, [0, 0], [0.25, 0.5], [0, -0.6]), L(0, [0.3, 0.25], [0.35, 0.5], [0, -0.8])], noAngle: true },
  insulation: { label: 'Insulation (zigzag)', lines: [L(60, [0, 0], [0.5, -R3 / 2], [1, -1]), L(120, [0, 0], [-0.5, -R3 / 2], [1, -1])] }
} satisfies Record<string, PatternDef>;

export type HatchPattern = keyof typeof HATCH_PATTERNS;
export const HATCH_IDS = Object.keys(HATCH_PATTERNS) as HatchPattern[];
/** A pattern by id; ANSI31 for an id the app does not know. */
export const patternOf = (id: string): PatternDef => (HATCH_PATTERNS as Record<string, PatternDef>)[id] ?? HATCH_PATTERNS.ansi31;
/** The built-in pattern a drawing's pattern name stands for (SOLID, ANSI31, BRICK…), if any. */
export const patternByName = (name: string): HatchPattern | undefined => HATCH_IDS.find((id) => id === name.trim().toLowerCase());

/** A hatch: pattern, line spacing (paper mm at the annotation scale) and angle (degrees). */
export interface HatchSpec { pattern: HatchPattern; scale: number; angle: number }

/** A pattern line placed: angle (radians), base point, the step to the next line and dashes, in the units given. */
export interface PlacedLine { angle: number; base: Pt; offset: Pt; dashes: number[] }
const rot = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** A hatch's pattern lines at its spacing and angle, `unit` drawing units per paper mm (empty for Solid). The same
 * lines go to the screen, the plan sheets and SAVE (DXF / DWG). */
export function placedLines(spec: HatchSpec, unit: number): PlacedLine[] {
  const def = patternOf(spec.pattern);
  if (def.solid) return [];
  const s = Math.max(0.2, spec.scale) * unit, r = def.noAngle ? 0 : (spec.angle * Math.PI) / 180;
  return def.lines.map((l) => {
    const a = (l.angle * Math.PI) / 180 + r, b = rot(l.base, r), o = rot(l.offset, a);
    return { angle: a, base: [b[0] * s, b[1] * s], offset: [o[0] * s, o[1] * s], dashes: l.dashes.map((d) => d * s) };
  });
}
/** The lines mirrored top to bottom (paper, y down). */
export const mirroredY = (ls: PlacedLine[]): PlacedLine[] => ls.map((l) => ({ angle: -l.angle, base: [l.base[0], -l.base[1]], offset: [l.offset[0], -l.offset[1]], dashes: l.dashes }));

/** A family of dots only (every dash a dot or a gap). */
export const dotsOnly = (l: PlacedLine) => l.dashes.some((d) => d === 0) && l.dashes.every((d) => d <= 0);

/** The dots of a dots-only line family across a box; empty when closer than `minGap` or more than `max` of them. */
export function hatchDots(l: PlacedLine, box: Box, minGap: number, max: number): Pt[] {
  const len = l.dashes.reduce((t, v) => t + Math.abs(v), 0);
  if (!(len >= minGap)) return [];
  const marks: number[] = [];
  l.dashes.reduce((t, v) => { if (v === 0) marks.push(t); return t + Math.abs(v); }, 0);
  const dir: Pt = [Math.cos(l.angle), Math.sin(l.angle)], out: Pt[] = [];
  for (const s of hatchLines(l, box, minGap, max)) {
    const t1 = s.phase + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    for (const m of marks) {
      for (let j = Math.ceil((s.phase - m) / len - 1e-9); m + j * len <= t1 + 1e-9; j += 1) {
        const t = m + j * len - s.phase;
        out.push([s.a[0] + t * dir[0], s.a[1] + t * dir[1]]);
        if (out.length > max) return [];
      }
    }
  }
  return out;
}

/** The strokes of one dashed or continuous line family across a box, each started where its dash pattern starts so
 * the dashes line up from line to line; the dash array (`dot` long dots) and whether the family is too fine to draw. */
export function hatchStrokes(l: PlacedLine, box: Box, minGap: number, max: number, dot: number): { lines: { a: Pt; b: Pt }[]; dash: number[] } {
  const dash = dashArray(l.dashes, dot), len = patternLength(dash);
  const dir: Pt = [Math.cos(l.angle), Math.sin(l.angle)];
  const lines = hatchLines(l, box, minGap, max).map((s) => {
    const back = len ? ((s.phase % len) + len) % len : 0;
    return { a: [s.a[0] - back * dir[0], s.a[1] - back * dir[1]] as Pt, b: s.b };
  });
  return { lines, dash };
}
