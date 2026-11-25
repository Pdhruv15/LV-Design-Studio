/** Design CAD → Detect rooms from walls (DETECTROOMS): every room of a plan found at once from its wall lines. Each
 * text that reads like a room name is a seed; the closed space round it (doors bridged, as RA does for one click) is
 * its room, named by that text. Two texts in one room give it once. Pure: the room search is passed in. */

type Pt = [number, number];
export interface SeedText { x: number; y: number; s: string }
export interface FoundRoom { name: string; points: Pt[]; area: number }

/** At most this many seeds are tried (a plan's room names; dimension and note texts are left out first). */
export const MAX_SEEDS = 400;

/** Whether a text reads like a room name: a letter in it, not a dimension, a level or a long note. */
export function roomLike(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 40 || !/[A-Za-z]/.test(t)) return false;
  if (/^[+-]?\d+([.,]\d+)?\s*(m|mm|cm|m²|m2|sqm)?$/i.test(t)) return false; // 3.50, 1200 mm, 12 m²
  if (/^(FFL|SSL|TOS|TOC|EL\.?|LVL)\b/i.test(t) || /^[A-Z]?\d+[A-Z]?$/.test(t)) return false; // levels, grid marks
  return true;
}

/** The seeds: room-like texts, those on room-name layers first, up to MAX_SEEDS. */
export function seedsOf(texts: readonly (SeedText & { layer?: string })[]): { seeds: SeedText[]; capped: boolean } {
  const like = texts.filter((t) => roomLike(t.s));
  const named = (l?: string) => !!l && /ROOM|RM|NAME|SPACE|AREA-?TXT|TAG/i.test(l);
  const sorted = [...like.filter((t) => named(t.layer)), ...like.filter((t) => !named(t.layer))];
  return { seeds: sorted.slice(0, MAX_SEEDS), capped: sorted.length > MAX_SEEDS };
}

/** The rooms round the seeds: each found once (a room whose outline holds an earlier seed's room's centre and has the
 * same area within 1 % is the same room), smaller than `minArea` left out, named by the first seed in it. */
export function detectRooms(seeds: readonly SeedText[], find: (at: Pt) => { points: Pt[]; area: number } | undefined, minArea = 0): FoundRoom[] {
  const out: FoundRoom[] = [];
  const centre = (pts: Pt[]): Pt => [pts.reduce((t, p) => t + p[0], 0) / pts.length, pts.reduce((t, p) => t + p[1], 0) / pts.length];
  const box = (pts: Pt[]) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  for (const s of seeds) {
    // A seed inside a room found already is that room's (its second label, a number under the name).
    if (out.some((r) => { const [x0, y0, x1, y1] = box(r.points); return s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1 && inside([s.x, s.y], r.points); })) continue;
    const r = find([s.x, s.y]);
    if (!r || r.area <= minArea) continue;
    const c = centre(r.points);
    if (out.some((o) => Math.abs(o.area - r.area) <= 0.01 * Math.max(o.area, r.area) && inside(c, o.points))) continue;
    out.push({ name: s.s.trim(), points: r.points, area: r.area });
  }
  return out;
}

function inside([x, y]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
