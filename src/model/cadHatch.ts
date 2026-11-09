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

/** A pattern from a .pat file or from a drawing: its name, its description and its lines in pattern units (the first
 * family's lines are one unit apart, so the hatch's spacing means the same as for the built-in patterns). It is kept
 * with each hatch drawn with it, and in the project's list of patterns. */
export interface CustomPattern { name: string; label?: string; lines: PatternLine[]; solid?: boolean }

/** A hatch: pattern, line spacing (paper mm at the annotation scale) and angle (degrees); a pattern not built in
 * carries its lines. */
export interface HatchSpec { pattern: HatchPattern | (string & {}); scale: number; angle: number; custom?: CustomPattern }

/** Limits on a pattern read from a file or a project (more would be a mistake, and slow to draw). */
const MAX_LINES = 32, MAX_DASHES = 16, NAME = /^[A-Za-z0-9_$.\- ]{1,31}$/;
const finite = (...v: number[]) => v.every(Number.isFinite);
/** A pattern from a file or a project that can be drawn: a name, 1–32 line families with finite numbers, lines a
 * step apart, at most 16 dashes each. */
export function validCustom(c: CustomPattern | undefined): c is CustomPattern {
  if (!c || typeof c.name !== 'string' || !NAME.test(c.name) || !Array.isArray(c.lines)) return false;
  if (c.solid) return true;
  return c.lines.length > 0 && c.lines.length <= MAX_LINES && c.lines.every((l) => Array.isArray(l?.base) && Array.isArray(l.offset) && Array.isArray(l.dashes)
    && l.dashes.length <= MAX_DASHES && finite(l.angle, l.base[0], l.base[1], l.offset[0], l.offset[1], ...l.dashes) && Math.abs(l.offset[1]) > 1e-9);
}
/** What a hatch is drawn with: its own pattern when it carries a valid one, else the built-in (ANSI31 if unknown). */
export const defOf = (spec: Pick<HatchSpec, 'pattern' | 'custom'>): PatternDef =>
  (validCustom(spec.custom) ? { label: customLabel(spec.custom), lines: spec.custom.lines, ...(spec.custom.solid ? { solid: true } : {}) } : patternOf(spec.pattern));
/** A custom pattern as listed: "NAME (description)". */
export const customLabel = (c: CustomPattern) => (c.label ? `${c.name} (${c.label})` : c.name);

/** Pattern lines rescaled so the first family's lines are one unit apart, and that spacing; undefined without one. */
function normalised(lines: PatternLine[]): { lines: PatternLine[]; step: number } | undefined {
  const s = lines.map((l) => Math.abs(l.offset[1])).find((v) => v > 1e-12);
  if (!s) return undefined;
  const k = (v: number) => v / s;
  return { step: s, lines: lines.map((l) => ({ angle: l.angle, base: [k(l.base[0]), k(l.base[1])], offset: [k(l.offset[0]), k(l.offset[1])], dashes: l.dashes.map(k) })) };
}

/** The patterns of a .pat file (the text format of CAD programs' hatch pattern files):
 *
 *     *NAME, description
 *     angle, x-origin, y-origin, delta-x, delta-y [, dash, …]
 *
 * with `;` comments. Each pattern is rescaled to pattern units; SOLID is a solid fill. Lines that cannot be read are
 * reported (with their line number) and that pattern left out. */
export function parsePat(text: string): { patterns: CustomPattern[]; errors: string[] } {
  const patterns: CustomPattern[] = [], errors: string[] = [];
  if (text.length > 2_000_000) return { patterns, errors: ['The file is larger than 2 MB: not a hatch pattern file.'] };
  let cur: { name: string; label?: string; lines: PatternLine[]; bad: boolean; at: number } | undefined;
  const flush = () => {
    if (!cur || cur.bad) return;
    if (cur.name.toUpperCase() === 'SOLID') { patterns.push({ name: cur.name, ...(cur.label ? { label: cur.label } : {}), lines: [], solid: true }); return; }
    const n = normalised(cur.lines);
    if (!cur.lines.length || !n) { errors.push(`Line ${cur.at}: ${cur.name} has no pattern lines.`); return; }
    if (cur.lines.length > MAX_LINES) { errors.push(`Line ${cur.at}: ${cur.name} has more than ${MAX_LINES} line families.`); return; }
    patterns.push({ name: cur.name, ...(cur.label ? { label: cur.label } : {}), lines: n.lines });
  };
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/;.*$/, '').trim(), at = i + 1;
    if (!line) return;
    if (line.startsWith('*')) {
      flush();
      const comma = line.indexOf(','), name = (comma < 0 ? line.slice(1) : line.slice(1, comma)).trim(), label = comma < 0 ? '' : line.slice(comma + 1).trim();
      const bad = !NAME.test(name) || patterns.some((p) => p.name.toUpperCase() === name.toUpperCase());
      if (bad) errors.push(`Line ${at}: “${name.slice(0, 40)}” ${NAME.test(name) ? 'is in the file twice: the first is kept' : 'is not a pattern name (letters, digits, _ $ . - up to 31)'}.`);
      cur = { name, ...(label ? { label: label.slice(0, 80) } : {}), lines: [], bad, at };
      return;
    }
    if (!cur) { errors.push(`Line ${at}: a pattern line before any *NAME.`); return; }
    if (cur.bad) return;
    const v = line.split(',').map((s) => Number(s.trim()));
    if (v.length < 5 || !finite(...v)) { errors.push(`Line ${at} (${cur.name}): not five numbers or more.`); cur.bad = true; return; }
    if (v.length - 5 > MAX_DASHES) { errors.push(`Line ${at} (${cur.name}): more than ${MAX_DASHES} dashes.`); cur.bad = true; return; }
    if (Math.abs(v[4]) < 1e-12 && cur.name.toUpperCase() !== 'SOLID') { errors.push(`Line ${at} (${cur.name}): no distance between its lines (delta-y 0).`); cur.bad = true; return; }
    cur.lines.push({ angle: v[0], base: [v[1], v[2]], offset: [v[3], v[4]], dashes: v.slice(5) });
  });
  flush();
  return { patterns, errors };
}

/** A project's patterns with these added; one of the same name (any case) is replaced. At most 500. */
export function withPatterns(list: CustomPattern[] | undefined, add: CustomPattern[]): CustomPattern[] {
  const key = (c: CustomPattern) => c.name.toUpperCase(), names = new Set(add.map(key));
  return [...(list ?? []).filter((c) => !names.has(key(c))), ...add].slice(0, 500);
}
/** A hatch spec for a project pattern, keeping the spacing and angle. */
export const specWith = (spec: HatchSpec, c: CustomPattern): HatchSpec => ({ ...spec, pattern: c.name, custom: c });

/** A pattern line placed: angle (radians), base point, the step to the next line and dashes, in the units given. */
export interface PlacedLine { angle: number; base: Pt; offset: Pt; dashes: number[] }
const rot = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** A drawing's hatch (pattern lines placed in drawing units, as the drawing keeps them) as a hatch spec with its own
 * pattern, its spacing in paper mm at `unit` drawing units per paper mm; undefined when its lines cannot be drawn. */
export function specFromLines(name: string, lines: PlacedLine[], unit: number): HatchSpec | undefined {
  if (!lines.length || !(unit > 0)) return undefined;
  const b0 = lines[0].base;
  const frame = lines.map((l): PatternLine => ({ angle: (l.angle * 180) / Math.PI, base: [l.base[0] - b0[0], l.base[1] - b0[1]], offset: rot(l.offset, -l.angle), dashes: l.dashes }));
  const n = normalised(frame);
  const custom: CustomPattern = { name: NAME.test(name.trim()) ? name.trim() : 'DRAWING', lines: n?.lines ?? [] };
  return n && validCustom(custom) ? { pattern: custom.name, scale: n.step / unit, angle: 0, custom } : undefined;
}

/** A hatch's pattern lines at its spacing and angle, `unit` drawing units per paper mm (empty for Solid). The same
 * lines go to the screen, the plan sheets and SAVE (DXF / DWG). */
export function placedLines(spec: HatchSpec, unit: number): PlacedLine[] {
  const def = defOf(spec);
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
