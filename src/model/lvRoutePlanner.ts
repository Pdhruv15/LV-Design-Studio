import type { Seg } from './cadBoundary';

type Pt = [number, number];

/** Hard stops keep route finding predictable on large or untidy architectural plans. */
export const LV_ROUTE_LIMITS = {
  maxOptions: 3,
  maxCells: 60_000,
  maxVisited: 60_000,
  maxWallSegments: 20_000,
  maxRasterSamples: 500_000
} as const;

export type LvRoutePrecision = 'fast' | 'balanced' | 'detailed';

export interface LvRouteSettings {
  options: number;
  precision: LvRoutePrecision;
  /** Clearance from a wall line, in metres. */
  clearanceM?: number;
  /** Search area beyond the start/end rectangle, in metres. */
  marginM?: number;
}

export interface LvRouteOption {
  points: Pt[];
  lengthM: number;
  bends: number;
  visited: number;
}

export interface LvRouteStats {
  cells: number;
  gridM: number;
  wallSegments: number;
  rasterSamples: number;
  visited: number;
  /** Main typed-array storage; route point arrays are small and excluded. */
  approxBytes: number;
}

export type LvRoutePlan =
  | { ok: true; routes: LvRouteOption[]; stats: LvRouteStats }
  | { ok: false; code: 'invalid' | 'limit' | 'no-route'; message: string; stats?: Partial<LvRouteStats> };

export interface LvRouteInput {
  start: Pt;
  end: Pt;
  /** Wall line segments. Only engineer-confirmed Wall layers should be supplied. */
  walls: Seg[];
  /** Metres per wall drawing unit; start and end are always metres. */
  metresPerUnit?: number;
  settings: LvRouteSettings;
}

const CELL_M: Record<LvRoutePrecision, number> = { fast: 0.5, balanced: 0.25, detailed: 0.15 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const finitePoint = (p: Pt) => Number.isFinite(p[0]) && Number.isFinite(p[1]);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function simplified(points: Pt[]): Pt[] {
  const clean = points.filter((p, i) => !i || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-7);
  if (clean.length < 3) return clean;
  const out: Pt[] = [clean[0]];
  for (let i = 1; i + 1 < clean.length; i += 1) {
    const a = out[out.length - 1], b = clean[i], c = clean[i + 1];
    const straight = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) <= 1e-7;
    if (!straight) out.push(b);
  }
  out.push(clean[clean.length - 1]);
  return out;
}

function routePoints(path: number[], cols: number, x0: number, y0: number, cell: number, start: Pt, end: Pt): Pt[] {
  const grid = path.map((i): Pt => [x0 + (i % cols) * cell, y0 + Math.floor(i / cols) * cell]);
  if (grid.length === 1) return [start, end];
  const first = grid[0], second = grid[1], before = grid[grid.length - 2], last = grid[grid.length - 1];
  const startJoin: Pt = Math.abs(second[0] - first[0]) > 1e-7 ? [start[0], first[1]] : [first[0], start[1]];
  const endJoin: Pt = Math.abs(last[0] - before[0]) > 1e-7 ? [end[0], last[1]] : [last[0], end[1]];
  return simplified([start, startJoin, ...grid, endJoin, end]);
}

const pathLength = (points: Pt[]) => points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);

/** Indexed binary min-heap: a cell occurs once, so the queue cannot grow beyond the bounded grid. */
class MinHeap {
  readonly nodes: Int32Array;
  readonly scores: Float32Array;
  readonly positions: Int32Array;
  size = 0;

  constructor(capacity: number) {
    this.nodes = new Int32Array(capacity);
    this.scores = new Float32Array(capacity);
    this.positions = new Int32Array(capacity);
    this.positions.fill(-1);
  }

  clear() { this.size = 0; this.positions.fill(-1); }

  set(node: number, score: number) {
    const at = this.positions[node];
    if (at >= 0) {
      if (score >= this.scores[at]) return;
      this.scores[at] = score;
      this.up(at);
      return;
    }
    const i = this.size++;
    this.nodes[i] = node; this.scores[i] = score; this.positions[node] = i;
    this.up(i);
  }

  pop(): number {
    const node = this.nodes[0], last = --this.size;
    this.positions[node] = -1;
    if (last > 0) {
      this.nodes[0] = this.nodes[last]; this.scores[0] = this.scores[last]; this.positions[this.nodes[0]] = 0;
      this.down(0);
    }
    return node;
  }

  private swap(a: number, b: number) {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b], this.nodes[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
    this.positions[this.nodes[a]] = a; this.positions[this.nodes[b]] = b;
  }

  private up(from: number) {
    for (let i = from; i > 0;) {
      const p = (i - 1) >> 1;
      if (this.scores[p] <= this.scores[i]) break;
      this.swap(i, p); i = p;
    }
  }

  private down(from: number) {
    for (let i = from;;) {
      const l = i * 2 + 1;
      if (l >= this.size) break;
      const r = l + 1, k = r < this.size && this.scores[r] < this.scores[l] ? r : l;
      if (this.scores[i] <= this.scores[k]) break;
      this.swap(i, k); i = k;
    }
  }
}

/** Finds the shortest orthogonal LV route first, then up to two bounded alternatives. All geometry is in metres. */
export function planLvRoutes({ start, end, walls, metresPerUnit = 1, settings }: LvRouteInput): LvRoutePlan {
  if (!finitePoint(start) || !finitePoint(end) || !(metresPerUnit > 0) || !Number.isFinite(metresPerUnit) || Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.05) {
    return { ok: false, code: 'invalid', message: 'Choose two different route points.' };
  }
  const options = clamp(Math.floor(settings.options || 1), 1, LV_ROUTE_LIMITS.maxOptions);
  const desiredCell = CELL_M[settings.precision] ?? CELL_M.balanced;
  const clearance = clamp(settings.clearanceM ?? 0.2, 0, 2);
  const margin = clamp(settings.marginM ?? 10, 2, 50);
  const minX = Math.min(start[0], end[0]) - margin, maxX = Math.max(start[0], end[0]) + margin;
  const minY = Math.min(start[1], end[1]) - margin, maxY = Math.max(start[1], end[1]) + margin;
  const width = Math.max(maxX - minX, desiredCell), height = Math.max(maxY - minY, desiredCell);
  let cell = Math.max(desiredCell, Math.sqrt((width * height) / (LV_ROUTE_LIMITS.maxCells * 0.96)));
  let cols = Math.floor(width / cell) + 1, rows = Math.floor(height / cell) + 1;
  while (cols * rows > LV_ROUTE_LIMITS.maxCells) {
    cell *= 1.02;
    cols = Math.floor(width / cell) + 1; rows = Math.floor(height / cell) + 1;
  }
  const cells = cols * rows;
  const x0 = minX, y0 = minY;
  const insideBounds = ([a, b]: Seg) => Math.max(a[0], b[0]) * metresPerUnit >= minX && Math.min(a[0], b[0]) * metresPerUnit <= maxX && Math.max(a[1], b[1]) * metresPerUnit >= minY && Math.min(a[1], b[1]) * metresPerUnit <= maxY;
  let wallSegments = 0, rasterSamples = 0;
  for (const wall of walls) {
    if (!insideBounds(wall)) continue;
    wallSegments += 1;
    rasterSamples += Math.max(1, Math.ceil((Math.hypot(wall[1][0] - wall[0][0], wall[1][1] - wall[0][1]) * metresPerUnit / cell) * 2)) + 1;
    if (wallSegments > LV_ROUTE_LIMITS.maxWallSegments) return { ok: false, code: 'limit', message: `The route area has more than ${LV_ROUTE_LIMITS.maxWallSegments.toLocaleString()} wall segments. Isolate or simplify the Wall layers, then try again.`, stats: { cells, gridM: cell, wallSegments, rasterSamples } };
    if (rasterSamples > LV_ROUTE_LIMITS.maxRasterSamples) return { ok: false, code: 'limit', message: 'The Wall layers are too detailed for the bounded route search. Use Fast precision, isolate the required wall layers, or shorten the route area.', stats: { cells, gridM: cell, wallSegments, rasterSamples } };
  }

  const blocked = new Uint8Array(cells), penalty = new Float32Array(cells), cost = new Float32Array(cells);
  const parent = new Int32Array(cells), closed = new Uint8Array(cells);
  const heap = new MinHeap(cells);
  const approxBytes = blocked.byteLength + penalty.byteLength + cost.byteLength + parent.byteLength + closed.byteLength + heap.nodes.byteLength + heap.scores.byteLength + heap.positions.byteLength;
  const gx = (x: number) => clamp(Math.round((x - x0) / cell), 0, cols - 1);
  const gy = (y: number) => clamp(Math.round((y - y0) / cell), 0, rows - 1);
  const radius = Math.ceil(clearance / cell);
  const mark = (x: number, y: number) => {
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) blocked[yy * cols + xx] = 1;
    }
  };
  for (const [a, b] of walls) {
    if (!insideBounds([a, b])) continue;
    const am: Pt = [a[0] * metresPerUnit, a[1] * metresPerUnit], bm: Pt = [b[0] * metresPerUnit, b[1] * metresPerUnit];
    const steps = Math.max(1, Math.ceil((Math.hypot(bm[0] - am[0], bm[1] - am[1]) / cell) * 2));
    for (let s = 0; s <= steps; s += 1) mark(gx(am[0] + ((bm[0] - am[0]) * s) / steps), gy(am[1] + ((bm[1] - am[1]) * s) / steps));
  }
  const source = gy(start[1]) * cols + gx(start[0]), target = gy(end[1]) * cols + gx(end[0]);
  const clearEnd = (i: number) => {
    const x = i % cols, y = Math.floor(i / cols);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (x + dx >= 0 && x + dx < cols && y + dy >= 0 && y + dy < rows) blocked[(y + dy) * cols + x + dx] = 0;
  };
  clearEnd(source); clearEnd(target);

  const search = (): { path?: number[]; visited: number } => {
    cost.fill(Infinity); parent.fill(-1); closed.fill(0); heap.clear();
    cost[source] = 0; heap.set(source, 0);
    let visited = 0;
    while (heap.size) {
      const i = heap.pop();
      if (closed[i]) continue;
      closed[i] = 1; visited += 1;
      if (i === target) {
        const path: number[] = [];
        for (let at = i, guard = 0; at >= 0 && guard <= cells; at = parent[at], guard += 1) path.push(at);
        path.reverse();
        return { path, visited };
      }
      if (visited >= LV_ROUTE_LIMITS.maxVisited) return { visited };
      const x = i % cols, y = Math.floor(i / cols);
      for (let d = 0; d < DIRS.length; d += 1) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const j = ny * cols + nx;
        if (blocked[j] || closed[j]) continue;
        const next = cost[i] + cell + penalty[j];
        if (next >= cost[j]) continue;
        cost[j] = next; parent[j] = i;
        const heuristic = (Math.abs(nx - (target % cols)) + Math.abs(ny - Math.floor(target / cols))) * cell;
        heap.set(j, next + heuristic);
      }
    }
    return { visited };
  };

  const routes: LvRouteOption[] = [];
  const hashes = new Set<number>();
  let totalVisited = 0;
  for (let option = 0; option < options; option += 1) {
    const found = search(); totalVisited += found.visited;
    if (!found.path) break;
    let hash = 2166136261;
    for (const i of found.path) hash = Math.imul(hash ^ i, 16777619);
    if (!hashes.has(hash)) {
      hashes.add(hash);
      const points = routePoints(found.path, cols, x0, y0, cell, start, end);
      routes.push({ points, lengthM: pathLength(points), bends: Math.max(0, points.length - 2), visited: found.visited });
    }
    // Alternatives reuse all arrays; a local penalty encourages a genuinely different corridor without blocking it.
    for (const i of found.path) {
      const x = i % cols, y = Math.floor(i / cols);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) penalty[yy * cols + xx] += cell * (dx || dy ? 1.5 : 3);
      }
    }
  }
  const stats: LvRouteStats = { cells, gridM: cell, wallSegments, rasterSamples, visited: totalVisited, approxBytes };
  if (!routes.length) return { ok: false, code: 'no-route', message: 'No route was found inside the bounded search area. Check the Wall layers or choose endpoints in connected spaces.', stats };
  return { ok: true, routes, stats };
}
