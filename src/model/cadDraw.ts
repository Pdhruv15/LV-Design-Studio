type Pt = [number, number];

/** How Design CAD draws a drawing's linetypes and hatches on screen (drawing units). */

/** A canvas dash array for a linetype pattern (dash > 0, gap < 0, dot 0): dashes and gaps alternate, starting with a
 * dash; a dot is `dot` long (one screen pixel in drawing units). Empty for continuous. */
export function dashArray(pattern: number[], dot: number): number[] {
  const out: number[] = [];
  for (const v of pattern) {
    const on = v >= 0, len = v === 0 ? dot : Math.abs(v);
    const wantOn = out.length % 2 === 0;
    if (on === wantOn) out.push(len);
    else if (out.length) out[out.length - 1] += len;
    else out.push(0, len); // starts with a gap
  }
  return out.length >= 2 && out.some((v, i) => i % 2 === 1 && v > 0) ? out : [];
}

/** The repeat length of a dash array. */
export const patternLength = (dash: number[]) => dash.reduce((t, v) => t + v, 0);

/** One family of hatch pattern lines across a box: each line's two ends and where along it the pattern starts (for
 * the dash phase). Empty when the lines would be closer than `minGap` apart, or more than `max` of them. */
export function hatchLines(line: { angle: number; base: Pt; offset: Pt }, box: [number, number, number, number], minGap: number, max = 1500): { a: Pt; b: Pt; phase: number }[] {
  const dir: Pt = [Math.cos(line.angle), Math.sin(line.angle)], n: Pt = [-dir[1], dir[0]];
  const step = line.offset[0] * n[0] + line.offset[1] * n[1]; // distance between the lines
  if (Math.abs(step) < minGap || !Number.isFinite(step)) return [];
  const [x0, y0, x1, y1] = box;
  const corners: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const dot = (p: Pt, v: Pt) => p[0] * v[0] + p[1] * v[1];
  const ds = corners.map((c) => dot(c, n)), d0 = dot(line.base, n);
  // The lines' numbers across the box (a negative step counts them the other way).
  const q0 = (Math.min(...ds) - d0) / step, q1 = (Math.max(...ds) - d0) / step;
  const k0 = Math.ceil(Math.min(q0, q1)), k1 = Math.floor(Math.max(q0, q1));
  if (k1 - k0 + 1 > max) return [];
  const out: { a: Pt; b: Pt; phase: number }[] = [];
  for (let k = k0; k <= k1; k += 1) {
    const p: Pt = [line.base[0] + k * line.offset[0], line.base[1] + k * line.offset[1]];
    const ts = corners.map((c) => dot([c[0] - p[0], c[1] - p[1]], dir));
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    out.push({ a: [p[0] + t0 * dir[0], p[1] + t0 * dir[1]], b: [p[0] + t1 * dir[0], p[1] + t1 * dir[1]], phase: t0 });
  }
  return out;
}

/** Square tiles over the drawing's extents for drawing only what is on screen: the tile a segment's midpoint is in. */
export function tileOf(x: number, y: number, extents: [number, number, number, number], n = 16): number {
  const [x0, y0, x1, y1] = extents;
  const cx = Math.min(n - 1, Math.max(0, Math.floor(((x - x0) / Math.max(1e-9, x1 - x0)) * n)));
  const cy = Math.min(n - 1, Math.max(0, Math.floor(((y - y0) / Math.max(1e-9, y1 - y0)) * n)));
  return cy * n + cx;
}

/** What a batch of lines is drawn with (a Path2D on screen). */
export interface PathLike { moveTo(x: number, y: number): void; lineTo(x: number, y: number): void }
/** The lines of one layer, colour, linetype and tile, with their box and where the last one ends. */
export interface LineBatch<P extends PathLike = PathLike> { layer: number; rgb: number; lt: number; path: P; box: [number, number, number, number]; end: [number, number] }

/** A drawing's segments (x1, y1, x2, y2 each, relative to its origin) batched per layer, colour, linetype and tile of
 * `extents` (so what is off screen is not drawn), in the order each batch first appears; a segment that goes on from
 * the last one of its batch continues its path (dashes run on). `gone`: segments left out (1). The segments of one
 * object follow each other and mostly share a batch, so the batch is looked up only when one of those changes: a
 * drawing of millions of segments is batched without a key per segment.
 * `minLen` (drawing units, 0 = every segment): a run of short segments is drawn as fewer, longer ones, each point kept
 * at least `minLen` from the last one drawn, and the run's last point always (the zoomed-out view of a large drawing:
 * nothing is left out, curves just have fewer corners). */
export function lineBatches<P extends PathLike>(segs: ArrayLike<number>, segLayers: ArrayLike<number>, segColors: ArrayLike<number>, segLinetypes: ArrayLike<number> | undefined, extents: [number, number, number, number], newPath: () => P, gone?: ArrayLike<number> | null, minLen = 0): LineBatch<P>[] {
  // Each batch with the last point drawn and whether its run's end is still to draw (`held`).
  type Run = { b: LineBatch<P>; at: [number, number]; held: boolean };
  const by = new Map<string, Run>();
  let r: Run | undefined;
  let layer = -1, rgb = -1, lt = -1, tile = -1;
  const thin = minLen > 0, min2 = minLen * minLen;
  for (let i = 0; i < segLayers.length; i += 1) {
    if (gone?.[i]) continue;
    const x1 = segs[i * 4], y1 = segs[i * 4 + 1], x2 = segs[i * 4 + 2], y2 = segs[i * 4 + 3];
    const l = segLayers[i], c = segColors[i], t = segLinetypes?.[i] ?? 0, k = tileOf((x1 + x2) / 2, (y1 + y2) / 2, extents);
    if (!r || l !== layer || c !== rgb || t !== lt || k !== tile) {
      layer = l; rgb = c; lt = t; tile = k;
      const key = `${l}:${c}:${t}:${k}`;
      r = by.get(key);
      if (!r) { r = { b: { layer: l, rgb: c, lt: t, path: newPath(), box: [x1, y1, x1, y1], end: [NaN, NaN] }, at: [NaN, NaN], held: false }; by.set(key, r); }
    }
    const { b, at } = r, { box, end } = b;
    if (end[0] !== x1 || end[1] !== y1) {
      if (r.held) { b.path.lineTo(end[0], end[1]); r.held = false; }
      b.path.moveTo(x1, y1); at[0] = x1; at[1] = y1;
    }
    if (thin && (x2 - at[0]) ** 2 + (y2 - at[1]) ** 2 < min2) r.held = true;
    else { b.path.lineTo(x2, y2); at[0] = x2; at[1] = y2; r.held = false; }
    end[0] = x2; end[1] = y2;
    box[0] = Math.min(box[0], x1, x2); box[1] = Math.min(box[1], y1, y2); box[2] = Math.max(box[2], x1, x2); box[3] = Math.max(box[3], y1, y2);
  }
  const runs = [...by.values()];
  for (const x of runs) if (x.held) x.b.path.lineTo(x.b.end[0], x.b.end[1]);
  return runs.map((x) => x.b);
}

type Rgb = [number, number, number];

/** The channels (0–255) of a CSS colour written #rgb, #rrggbb or rgb(r, g, b); null for any other form. */
export function cssRgb(c: string): Rgb | null {
  const s = c.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((d) => parseInt(d + d, 16)) as Rgb;
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as Rgb;
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** `a` with `k` (0–1) of `b` mixed in, as #rrggbb; `a` itself when either is not a colour cssRgb reads. */
export function mixCss(a: string, b: string, k: number): string {
  const x = cssRgb(a), y = cssRgb(b);
  if (!x || !y) return a;
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

const luminance = (c: Rgb) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio of two colours. */
export const contrastRatio = (a: Rgb, b: Rgb) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255], mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): Rgb {
  const f = (n: number) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** A drawing colour (0xRRGGBB) as shown on a canvas of colour `bg`: one under 3:1 against it is made lighter on a dark
 * canvas or darker on a light one, keeping its hue, so yellow, cyan and green layers stay visible on white and blue on
 * navy. Yellows turn gold as they darken (a darker yellow reads as olive). Saved and exported drawings keep the stored
 * colour. */
export function screenColour(rgb: number, bg: Rgb): string {
  const c: Rgb = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
  if (contrastRatio(c, bg) >= 3) return hex(c);
  const dark = luminance(bg) < 0.18;
  const [hue, s, l0] = toHsl(c);
  const h = !dark && s > 0.3 && hue > 45 && hue <= 65 ? 45 : hue;
  let l = l0;
  let out = c;
  while (contrastRatio(out, bg) < 3 && (dark ? l < 1 : l > 0)) {
    l = dark ? Math.min(1, l + 0.005) : Math.max(0, l - 0.005);
    out = fromHsl(h, s, l);
  }
  return hex(out);
}
