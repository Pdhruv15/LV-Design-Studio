/** Design CAD → Compare with new revision (XCOMPARE): a reference drawing's lines as it is on the plan beside a newer
 * revision of the same drawing placed the same way. Lines only in the new one are added, lines only in the old one
 * removed, the rest the same (within a tolerance, either way round). The changed lines are grouped into areas (lines
 * closer than a gap), for zooming to each in turn and for revision clouds round them. Pure: segments are drawing units,
 * four numbers a line (as placeRef gives them). */

type Box = [number, number, number, number];
export interface RefDiff {
  added: Float64Array;
  removed: Float64Array;
  same: number;
  /** The areas of change, largest first: boxes round changed lines that lie within `gap` of each other. */
  areas: Box[];
}

const key = (i: number, j: number) => `${i},${j}`;

/** Each line of `b` matched to a line of `a` with both ends within `tol` (either way round): those left over in each. */
function unmatched(a: Float64Array, b: Float64Array, tol: number): { onlyA: number[]; onlyB: number[] } {
  const cell = Math.max(tol, 1e-9) * 2, grid = new Map<string, number[]>(), used = new Uint8Array(a.length / 4);
  const at = (x: number) => Math.floor(x / cell);
  for (let i = 0; i < a.length / 4; i++) {
    const k = key(at((a[i * 4] + a[i * 4 + 2]) / 2), at((a[i * 4 + 1] + a[i * 4 + 3]) / 2));
    const l = grid.get(k); if (l) l.push(i); else grid.set(k, [i]);
  }
  const near = (x0: number, y0: number, x1: number, y1: number) => Math.abs(x0 - x1) <= tol && Math.abs(y0 - y1) <= tol;
  const onlyB: number[] = [];
  for (let j = 0; j < b.length / 4; j++) {
    const [bx0, by0, bx1, by1] = [b[j * 4], b[j * 4 + 1], b[j * 4 + 2], b[j * 4 + 3]];
    const cx = at((bx0 + bx1) / 2), cy = at((by0 + by1) / 2);
    let hit = -1;
    for (let dx = -1; dx <= 1 && hit < 0; dx++) for (let dy = -1; dy <= 1 && hit < 0; dy++) {
      for (const i of grid.get(key(cx + dx, cy + dy)) ?? []) {
        if (used[i]) continue;
        const [ax0, ay0, ax1, ay1] = [a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]];
        if ((near(ax0, ay0, bx0, by0) && near(ax1, ay1, bx1, by1)) || (near(ax0, ay0, bx1, by1) && near(ax1, ay1, bx0, by0))) { hit = i; break; }
      }
    }
    if (hit >= 0) used[hit] = 1; else onlyB.push(j);
  }
  const onlyA: number[] = [];
  for (let i = 0; i < used.length; i++) if (!used[i]) onlyA.push(i);
  return { onlyA, onlyB };
}

const pick = (s: Float64Array, idx: number[]) => { const out = new Float64Array(idx.length * 4); idx.forEach((i, n) => out.set(s.subarray(i * 4, i * 4 + 4), n * 4)); return out; };

/** The areas of change: the changed lines' ends on a grid of `gap`, neighbouring cells joined, a box round each group
 * (grown by half a gap), largest first. */
export function changeAreas(lines: Float64Array[], gap: number): Box[] {
  const g = Math.max(gap, 1e-9), cells = new Map<string, Box>();
  const add = (x: number, y: number) => {
    const k = key(Math.floor(x / g), Math.floor(y / g)), b = cells.get(k);
    if (b) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } else cells.set(k, [x, y, x, y]);
  };
  for (const s of lines) for (let i = 0; i < s.length; i += 4) { add(s[i], s[i + 1]); add(s[i + 2], s[i + 3]); add((s[i] + s[i + 2]) / 2, (s[i + 1] + s[i + 3]) / 2); }
  const seen = new Set<string>(), areas: Box[] = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    const box: Box = [Infinity, Infinity, -Infinity, -Infinity], todo = [start];
    seen.add(start);
    while (todo.length) {
      const k = todo.pop()!, b = cells.get(k)!, [i, j] = k.split(',').map(Number);
      box[0] = Math.min(box[0], b[0]); box[1] = Math.min(box[1], b[1]); box[2] = Math.max(box[2], b[2]); box[3] = Math.max(box[3], b[3]);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const n = key(i + dx, j + dy); if (cells.has(n) && !seen.has(n)) { seen.add(n); todo.push(n); } }
    }
    const pad = g / 2;
    areas.push([box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad]);
  }
  return areas.sort((p, q) => (q[2] - q[0]) * (q[3] - q[1]) - (p[2] - p[0]) * (p[3] - p[1]));
}

/** The lines of the reference as it is (`before`) and of the new revision (`after`), compared: lines within `tol` of
 * each other at both ends are the same; areas group changes within `gap`. */
export function compareRefLines(before: Float64Array, after: Float64Array, tol: number, gap: number): RefDiff {
  const { onlyA, onlyB } = unmatched(before, after, tol);
  const removed = pick(before, onlyA), added = pick(after, onlyB);
  return { added, removed, same: after.length / 4 - onlyB.length, areas: changeAreas([added, removed], gap) };
}

/** One line about it for the command line. */
export function compareLine(name: string, d: RefDiff): string {
  const a = d.added.length / 4, r = d.removed.length / 4, n = d.areas.length;
  if (!a && !r) return `XCOMPARE  ${name}: no change — every line of the new revision is where it was (${d.same.toLocaleString('en-GB')} line${d.same === 1 ? '' : 's'}).`;
  return `XCOMPARE  ${name}: ${a.toLocaleString('en-GB')} line${a === 1 ? '' : 's'} added (green), ${r.toLocaleString('en-GB')} removed (red), in ${n} area${n === 1 ? '' : 's'} · ${d.same.toLocaleString('en-GB')} the same`;
}
