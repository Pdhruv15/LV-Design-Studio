import type { Board, GridSource, Project } from '../types';
import { gridLabel, rmuRecord, rmuSource, rmuWays } from '../calc/hvSupply';
import { DM_TYPES } from '../calc/dmSubstation';
import { txTag } from '../model/transformers';
import { recordedText } from '../model/existing';
import { textWidth } from './panelLabels';

/** The 11 kV side of the system SLD once a main board names its RMU or substation (proposal 2026-11-18, part 1):
 * one ring per grid source through its RMUs, each RMU drawn with its ring switches and tee-offs, and a dash-dot
 * frame round each substation's RMUs and transformers. Without RMU or substation names the SLD keeps its one
 * 11 kV line. The plan comes from the whole project, so a sheet that draws only some main boards still shows each
 * RMU's other tee-offs, and the ring's ends, as stubs to what is drawn elsewhere. */

/** The ring line, and how much lower every main board's supply rows (transformer, meter cabinet) sit than without it. */
export const RING_Y = 64;
export const MV_DY = 108;
/** Rows of an RMU and of the substation frame (drawing units, from the top of the SLD). */
export const MV_ROWS = { frameTop: 8, title: 24, subtitle: 38, boxTop: 72, name: 89, config: 101, ringSw: 78, bus: 116, teeSw: 120, boxBottom: 160, stub: 167, jog: 174, txTop: 78 + MV_DY } as const;
/** Switch slot height at switch scale (24 units). */
export const MV_SLOT = 24;
/** RMU way pitch, and the box margin past its outer ways; the normally open switch's N/O stands NOP_GAP from it. */
const WAY = 32, BOX_PAD = 16, NOP_GAP = 10;
/** Gaps kept between neighbouring substation frames (or RMUs outside a frame), and between RMUs in one frame. */
const GAP_OUT = 20, GAP_IN = 14;
/** Room between a frame and what it holds. */
const FRAME_PAD = 12;
/** Text sizes on the SLD: `b` 12 px bold, `m` 11 px, small notes 9 px. */
const B = 12, M = 11, S = 9;

/** A main board on an authority LV supply (meter cabinet): its own source, off the 11 kV side. */
export const authoritySupplied = (b: Board) => !b.upstreamId && !b.sourceKva && !!b.supply;
/** A main board hanging from the 11 kV side: every main board but one on an authority LV supply. */
export const onMvSide = (b: Board) => !b.upstreamId && !authoritySupplied(b);
const clean = (s?: string) => s?.trim() || undefined;

/** The ring arrangement is drawn once a main board on the 11 kV side names its RMU or its substation. */
export const mvRingOn = (project: Project) => project.boards.some((b) => onMvSide(b) && (!!clean(b.rmu) || !!clean(b.substation)));

export interface RmuItem {
  kind: 'rmu';
  name: string;
  /** Configuration as recorded (upper case), e.g. "RRTT"; undefined when not entered. */
  config?: string;
  /** Tee-offs left to right: the main board each one feeds (its transformer), or undefined for a spare. */
  tees: (string | undefined)[];
  /** Ring switches: 1 (RT, the ring ends at it), 2, or more (a third and later are drawn as spare ring ways). */
  ringWays: number;
  tOff?: 'fuse' | 'vcb';
  fuseA?: number;
  substation?: string;
  /** The ring switch kept open (R1 where the ring comes in, R2 where it goes on); only on a unit with two ring switches. */
  normallyOpen?: 'R1' | 'R2';
}
/** A transformer with no RMU entered: teed straight off the ring, as before. */
export interface TapItem { kind: 'tap'; boardId: string; substation?: string }
export type RingItem = RmuItem | TapItem;
export interface Ring { source?: GridSource; items: RingItem[] }
export interface MvPlan {
  rings: Ring[];
  /** Main boards left to right: by ring, then substation, then RMU (inside a group in project order); main boards on
   * an authority LV supply last, so the 11 kV side never runs over them. */
  order: string[];
}

/** Where a substation stands in ring order: the place of its record (Panels → Transformers → Substations keeps the
 * records in the order it lists them), or after every recorded one when it has none. */
export function ssRank(project: Project): (name: string) => number {
  const recs = (project.substations ?? []).map((s) => s.name.trim().toLowerCase());
  return (name) => { const i = recs.indexOf(name.trim().toLowerCase()); return i < 0 ? recs.length : i; };
}

/** The rings, their RMUs and the main boards' order, from the whole project. A substation sits on the ring of its
 * first RMU; an RMU in the substation of its first transformer (else the one its record names); a transformer with no
 * RMU on the first ring. On a ring the substations follow their records' order; RMUs and transformers in no
 * substation keep their places. */
export function mvPlan(project: Project): MvPlan {
  const mains = project.boards.filter(onMvSide);
  const sources = project.gridSources ?? [];
  const ringOfRmu = (name: string) => { const s = rmuSource(project, name); return s ? Math.max(0, sources.indexOf(s)) : 0; };
  const rmuSs = new Map<string, string | undefined>();
  for (const b of mains) { const r = clean(b.rmu); if (r && !rmuSs.has(r)) rmuSs.set(r, clean(b.substation) ?? clean(rmuRecord(project, r)?.substation)); }
  const ssRing = new Map<string, number>();
  for (const [r, ss] of rmuSs) if (ss && !ssRing.has(ss)) ssRing.set(ss, ringOfRmu(r));
  interface Group { ss?: string; items: RingItem[] }
  const rings: { groups: Group[]; byKey: Map<string, Group> }[] = [];
  const rmus = new Map<string, RmuItem>();
  for (const b of mains) {
    const r = clean(b.rmu);
    const known = r ? rmus.get(r) : undefined;
    if (known) { known.tees.push(b.id); continue; }
    const ss = r ? rmuSs.get(r) : clean(b.substation);
    const ri = r ? ringOfRmu(r) : (ss !== undefined ? ssRing.get(ss) : undefined) ?? 0;
    const ring = (rings[ri] ??= { groups: [], byKey: new Map() });
    const key = ss !== undefined ? `ss:${ss}` : r ? `rmu:${r}` : `tx:${b.id}`;
    let g = ring.byKey.get(key);
    if (!g) { g = { ss, items: [] }; ring.byKey.set(key, g); ring.groups.push(g); }
    if (r) {
      const rec = rmuRecord(project, r);
      const config = rec?.config?.trim().toUpperCase() || undefined;
      const ringWays = config ? Math.max(1, rmuWays(config).ring) : 2;
      const item: RmuItem = { kind: 'rmu', name: r, config, tees: [b.id], ringWays, tOff: rec?.tOff, fuseA: rec?.fuseA, substation: ss, ...(ringWays >= 2 && rec?.normallyOpen ? { normallyOpen: rec.normallyOpen } : {}) };
      rmus.set(r, item);
      g.items.push(item);
    } else g.items.push({ kind: 'tap', boardId: b.id, substation: ss });
  }
  // Every tee-off of the configuration is drawn: the ones with no transformer are spares.
  for (const it of rmus.values()) if (it.config) for (let n = rmuWays(it.config).tOff; it.tees.length < n;) it.tees.push(undefined);
  // The substations in their records' order, in the places substations take on the ring.
  const rank = ssRank(project);
  for (const r of rings) {
    if (!r) continue;
    const slots = r.groups.flatMap((g, i) => (g.ss !== undefined ? [i] : []));
    const sorted = slots.map((i) => r.groups[i]).sort((a, b) => rank(a.ss!) - rank(b.ss!));
    slots.forEach((i, k) => { r.groups[i] = sorted[k]; });
  }
  const out: Ring[] = [];
  rings.forEach((r, i) => { if (r) out.push({ source: sources[i], items: r.groups.flatMap((g) => g.items) }); });
  const boardsOf = (it: RingItem) => (it.kind === 'tap' ? [it.boardId] : it.tees.filter((t): t is string => !!t));
  const order = [...out.flatMap((r) => r.items.flatMap(boardsOf)), ...project.boards.filter(authoritySupplied).map((b) => b.id)];
  return { rings: out, order };
}

export type WayKind = 'ring' | 'tee' | 'ring-spare';
export interface WayGeom { x: number; kind: WayKind; /** A tee-off's main board. */ boardId?: string }
export interface RmuGeom {
  item: RmuItem;
  /** Box. */
  x1: number;
  x2: number;
  ways: WayGeom[];
  /** Where the ring enters and leaves (the same point for an RT unit). */
  inX: number;
  outX: number;
  /** Name and configuration, centred between the ring switches. */
  textX: number;
  /** Fuse rating or relay functions, right of the last tee-off. */
  note?: { x: number; lines: string[] };
  /** N/O beside the normally open ring switch, on the side away from the other ways (inside the box). */
  nop?: { x: number; anchor: 'start' | 'end' };
  /** Tee-offs to a transformer drawn elsewhere. */
  stubs: { x: number; dir: -1 | 1; text: string }[];
  /** Where each drawn transformer it feeds stands (main board id → x). */
  txX: Map<string, number>;
}
export interface TapGeom { x: number; boardId: string }
export interface FrameGeom { name: string; sub?: string; x1: number; x2: number }
/** One drawn stretch of a ring: from its source (or a stub from the RMU before it) to its end (or a stub to the next). */
export interface RunGeom {
  source?: GridSource;
  head: { kind: 'source'; x: number } | { kind: 'from'; x: number; text: string };
  /** None where the ring ends at an RT unit. */
  tail?: { kind: 'end' | 'to'; x: number; text: string };
  /** Ring line pieces between the head, the RMUs and taps, and the tail. */
  segs: [number, number][];
  /** Junctions on the ring line: taps, and an RT unit's ring switch where the ring runs on. */
  dots: number[];
}
export interface MvGeom {
  frameBottom: number;
  runs: RunGeom[];
  rmus: RmuGeom[];
  taps: TapGeom[];
  frames: FrameGeom[];
  /** Right-hand end of everything drawn on the 11 kV side. */
  right: number;
}

export interface MvOptions {
  /** The transformer's neutral and body earth labels are drawn under it (the frame goes below them). */
  earth: boolean;
}

/** A substation frame's title: its name, then its DM-D-013 type and building from the Substation area page. */
export function substationTitle(project: Project, name: string): { name: string; sub?: string } {
  const room = project.substations?.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
  const type = room && DM_TYPES.find((t) => t.value === room.type)?.label;
  const sub = [type, room?.building?.trim()].filter(Boolean).join(' · ');
  return { name, sub: sub || undefined };
}

/** How far a transformer's text reaches right of its drop (as drawn beside it on the SLD). */
export function txLabelReach(project: Project, b: Board): number {
  const rows = [
    `${txTag(project, b.id) ?? 'Transformer'}${b.existing ? ' — EXISTING' : ''}`,
    b.sourceKva ? `${b.sourceKva} kVA · ${b.sourceImpedancePct ?? '—'}% Z` : 'no source data',
    ...(b.sourceKva ? [`${b.vectorGroup ?? 'Dyn11'} · 11 / ${(project.voltageV / 1000).toFixed(3)} kV`] : []),
    ...(b.existing ? [recordedText(project, b) ?? ''] : [])
  ];
  return 24 + Math.max(...rows.map((t, i) => textWidth(t, i ? M : B, !i)));
}

const itemName = (project: Project, it: RingItem) => (it.kind === 'rmu' ? it.name : `${txTag(project, it.boardId) ?? 'Transformer'} · ${it.boardId}`) + (it.substation ? ` · ${it.substation}` : '');

/** A level-0 block (a frame, or an RMU or tap outside one) or a level-1 block (an RMU or tap inside a frame), and
 * the main board whose lead moves it. Used to keep them apart (mvLeads). */
interface Block { root: string; left: number; right: number; level: 0 | 1; frame?: number }

/** Where everything on the 11 kV side goes, for the main boards drawn at `x` (board id → incomer x). */
export function mvGeometry(project: Project, plan: MvPlan, x: Map<string, number>, opts: MvOptions): MvGeom & { blocks: Block[] } {
  const byId = new Map(project.boards.map((b) => [b.id, b]));
  const runs: RunGeom[] = [], rmus: RmuGeom[] = [], taps: TapGeom[] = [], frames: FrameGeom[] = [], blocks: Block[] = [];
  let right = -Infinity;
  const txLeft = (id: string) => x.get(id)! - (opts.earth ? 70 : 24);
  const txRight = (id: string) => x.get(id)! + txLabelReach(project, byId.get(id)!);
  for (const ring of plan.rings) {
    const drawn = (it: RingItem) => (it.kind === 'tap' ? x.has(it.boardId) : it.tees.some((t) => t && x.has(t)));
    // Stretches of consecutive drawn items: a gap (items drawn elsewhere) breaks the ring into stubs.
    const stretches: number[][] = [];
    ring.items.forEach((it, i) => { if (!drawn(it)) return; const last = stretches[stretches.length - 1]; if (last && last[last.length - 1] === i - 1) last.push(i); else stretches.push([i]); });
    for (const st of stretches) {
      // Each item: its geometry, extent and the board whose lead moves it.
      const items = st.map((i) => {
        const it = ring.items[i];
        if (it.kind === 'tap') {
          const tx = x.get(it.boardId)!;
          taps.push({ x: tx, boardId: it.boardId });
          return { it, root: it.boardId, left: tx - 8, right: tx + 8, inX: tx, outX: tx, dot: tx, txs: [it.boardId] };
        }
        const g = rmuGeom(project, it, x);
        rmus.push(g);
        const txs = it.tees.filter((t): t is string => !!t && x.has(t));
        const stubRight = Math.max(-Infinity, ...g.stubs.filter((s) => s.dir > 0).map((s) => s.x + 46 + textWidth(s.text, M)));
        const stubLeft = Math.min(Infinity, ...g.stubs.filter((s) => s.dir < 0).map((s) => s.x - 46 - textWidth(s.text, M)));
        return { it, root: txs[0], left: Math.min(g.x1, stubLeft), right: Math.max(g.x2, stubRight), inX: g.inX, outX: g.outX, dot: g.inX === g.outX ? g.inX : undefined, txs };
      });
      // Frames: consecutive items of one substation.
      const outer: { root: string; left: number; right: number }[] = [];
      for (let k = 0; k < items.length;) {
        const ss = items[k].it.substation;
        let e = k + 1;
        while (ss !== undefined && e < items.length && items[e].it.substation === ss) e++;
        const part = items.slice(k, e);
        if (ss === undefined) {
          blocks.push({ root: part[0].root, left: part[0].left, right: part[0].right, level: 0 });
          outer.push(part[0]);
        } else {
          const t = substationTitle(project, ss);
          const txs = part.flatMap((p) => p.txs);
          const x1 = Math.min(...part.map((p) => p.left), ...txs.map(txLeft)) - FRAME_PAD;
          const x2 = Math.max(...part.map((p) => p.right), ...txs.map(txRight), x1 + Math.max(textWidth(t.name, B, true), t.sub ? textWidth(t.sub, M) : 0) + 2 * 9) + FRAME_PAD;
          frames.push({ name: t.name, sub: t.sub, x1, x2 });
          blocks.push({ root: part[0].root, left: x1, right: x2, level: 0 });
          part.forEach((p) => blocks.push({ root: p.root, left: p.left, right: p.right, level: 1, frame: frames.length - 1 }));
          outer.push({ root: part[0].root, left: x1, right: x2 });
        }
        k = e;
      }
      // The head: the grid source with its labels, or a stub from the item before this stretch.
      const L = outer[0].left, R = outer[outer.length - 1].right;
      const first = st[0], last = st[st.length - 1];
      let head: RunGeom['head'], headLeft: number, start: number;
      if (first === 0) {
        const sx = L - Math.max(31, sourceLabelWidth(ring.source) - 3);
        head = { kind: 'source', x: sx };
        headLeft = sx - 13;
        start = sx + 11;
      } else {
        const text = `from ${itemName(project, ring.items[first - 1])}`;
        start = L - textWidth(text, M) - 20;
        head = { kind: 'from', x: start, text };
        headLeft = start - 4;
      }
      const atEnd = last === ring.items.length - 1;
      const lastItem = ring.items[last];
      // The ring stops at an RT unit at its end; otherwise it runs on, or to the item drawn elsewhere.
      const stops = atEnd && lastItem.kind === 'rmu' && lastItem.ringWays < 2;
      const tailText = atEnd ? 'ring continues' : `to ${itemName(project, ring.items[last + 1])}`;
      const end = stops ? R : R + Math.max(24, textWidth(tailText, M) + 10);
      const tail: RunGeom['tail'] = stops ? undefined : { kind: atEnd ? 'end' : 'to', x: end, text: tailText };
      // The head and tail widen the first and last level-0 blocks of the stretch.
      const firstBlock = blocks.find((b) => b.level === 0 && b.root === outer[0].root)!;
      firstBlock.left = headLeft;
      const lastBlock = [...blocks].reverse().find((b) => b.level === 0 && b.root === outer[outer.length - 1].root)!;
      lastBlock.right = end + 4;
      const segs: [number, number][] = [];
      let from = start;
      for (const p of items) { segs.push([from, p.inX]); from = p.outX; }
      if (tail) segs.push([from, end]);
      // Junctions: taps, and an RT unit's ring switch where the ring runs on past it.
      const dots = items.filter((p, k) => p.dot !== undefined && (p.it.kind === 'tap' || k < items.length - 1 || !!tail)).map((p) => p.dot!);
      runs.push({ source: ring.source, head, tail, segs: segs.filter(([a, b]) => b - a > 0.5), dots });
      right = Math.max(right, end + 4);
    }
  }
  return { frameBottom: MV_DY + (opts.earth ? 156 : 138), runs, rmus, taps, frames, right, blocks };
}

/** Width of the grid source's labels (left-aligned 11 left of its symbol). */
function sourceLabelWidth(g?: GridSource): number {
  const rows = sourceLabels(g);
  return Math.max(...rows.map((r) => textWidth(r.text, r.b ? B : M, r.b)));
}

/** The grid source's labels: name or operator and voltage above the ring, primary substation and feeder below. */
export function sourceLabels(g?: GridSource): { text: string; b?: boolean; below?: boolean }[] {
  if (!g) return [{ text: 'Utility', b: true }, { text: '11 kV' }];
  return [
    { text: g.operator || g.name, b: true },
    { text: gridLabel(g) },
    ...(g.primarySubstation ? [{ text: g.primarySubstation, below: true }] : []),
    ...(g.feederRef ? [{ text: `feeder ${g.feederRef}`, below: true }] : [])
  ];
}

/** One RMU's ways and box: the ring switches at both ends, its tee-offs (and any third ring switch) between them. The
 * tee-off over a single drawn transformer stands right above it; over two or more the box is centred on them. The
 * name and configuration sit between the two ring switches, which move apart when the name needs more room (the
 * tee-offs start below the text, at the RMU's busbar). */
function rmuGeom(project: Project, it: RmuItem, x: Map<string, number>): RmuGeom {
  // A third ring switch (RRRT) stands next to the first, so the tee-offs (and their fuse or relay note) come last.
  const inner: WayKind[] = [...Array.from({ length: Math.max(0, it.ringWays - 2) }, (): WayKind => 'ring-spare'), ...it.tees.map((): WayKind => 'tee')];
  const twoRing = it.ringWays >= 2;
  const textW = Math.max(textWidth(it.name, B, true), it.config ? textWidth(it.config, M) : 0);
  // Ring switch to the first inner way (and last inner way to the second ring switch).
  const edge = twoRing ? Math.max(WAY, (textW + 18 - (inner.length - 1) * WAY) / 2) : WAY;
  const offs = [0, ...inner.map((_, i) => edge + i * WAY), ...(twoRing ? [2 * edge + (inner.length - 1) * WAY] : [])];
  const kinds: WayKind[] = ['ring', ...inner, ...(twoRing ? ['ring' as WayKind] : [])];
  const drawnTees = it.tees.map((t, i) => ({ t, i })).filter((d): d is { t: string; i: number } => !!d.t && x.has(d.t));
  const xs = drawnTees.map((d) => x.get(d.t)!);
  const span = offs[offs.length - 1];
  const x0 = drawnTees.length === 1 ? xs[0] - offs[1 + Math.max(0, it.ringWays - 2) + drawnTees[0].i] : (Math.min(...xs) + Math.max(...xs)) / 2 - span / 2;
  const spares = kinds.filter((k) => k === 'ring-spare').length;
  const ways: WayGeom[] = kinds.map((kind, i) => ({ x: x0 + offs[i], kind, boardId: kind === 'tee' ? it.tees[i - 1 - spares] : undefined }));
  const r1 = ways[0].x, r2 = twoRing ? ways[ways.length - 1].x : undefined;
  const tees = ways.filter((w) => w.kind === 'tee');
  const lastInner = tees[tees.length - 1]?.x ?? ways.filter((w) => w.kind !== 'ring').pop()?.x ?? r1;
  const lines = it.tOff === 'vcb' ? ['50/51', '50N/51N'] : it.fuseA ? [`${it.fuseA} A`] : [];
  const note = lines.length ? { x: lastInner + 7, lines } : undefined;
  // An RT unit has one ring switch: its text stands right of it.
  const textX = r2 === undefined ? r1 + 9 + textW / 2 : (r1 + r2) / 2;
  let x1 = r1 - BOX_PAD;
  let x2 = ways[ways.length - 1].x + BOX_PAD;
  if (r2 === undefined) x2 = Math.max(x2, r1 + 18 + textW);
  if (note) x2 = Math.max(x2, note.x + Math.max(...note.lines.map((t) => textWidth(t, S))) + 4);
  // The normally open ring switch: N/O outside it (clear of the R1 blade), the box widened to take it in.
  let nop: RmuGeom['nop'];
  if (it.normallyOpen && r2 !== undefined) {
    const w = textWidth('N/O', B, true);
    if (it.normallyOpen === 'R1') { nop = { x: r1 - NOP_GAP, anchor: 'end' }; x1 = Math.min(x1, r1 - NOP_GAP - w - 4); }
    else { nop = { x: r2 + NOP_GAP, anchor: 'start' }; x2 = Math.max(x2, r2 + NOP_GAP + w + 4); }
  }
  // A tee-off to a transformer drawn elsewhere: a stub away from the drawn ones.
  const firstDrawn = drawnTees[0]?.i ?? 0;
  const stubs = tees.flatMap((w, i) => (w.boardId && !x.has(w.boardId)
    ? [{ x: w.x, dir: (i < firstDrawn ? -1 : 1) as -1 | 1, text: `to ${txTag(project, w.boardId) ?? 'Transformer'} · ${w.boardId}` }]
    : []));
  return { item: it, x1, x2, ways, inX: r1, outX: r2 ?? r1, textX, note, ...(nop ? { nop } : {}), stubs, txX: new Map(drawnTees.map((d) => [d.t, x.get(d.t)!])) };
}

/** Extra room before main boards (by id) so that frames, RMUs and the ring's labels keep apart, for the main boards
 * laid out at `roots` (left to right). Room added before a board moves it and every board after it; the leftmost
 * clash is cleared first, so no room is added that a later move makes unnecessary. */
export function mvLeads(project: Project, plan: MvPlan, roots: { id: string; x: number }[], opts: MvOptions): Map<string, number> {
  const lead = new Map<string, number>();
  const at = new Map(roots.map((r, i) => [r.id, i]));
  const xs = roots.map((r) => r.x);
  const onSide = new Set(project.boards.filter(onMvSide).map((b) => b.id));
  for (let guard = 0; guard < 400; guard++) {
    const g = mvGeometry(project, plan, new Map(roots.filter((r) => onSide.has(r.id)).map((r) => [r.id, xs[at.get(r.id)!]])), opts);
    // Boards drawn after the 11 kV side (authority supplies, parts fed from elsewhere) keep clear of it too.
    const others: Block[] = roots.filter((r) => !onSide.has(r.id)).map((r) => ({ root: r.id, left: xs[at.get(r.id)!] - 20, right: xs[at.get(r.id)!] + 20, level: 0 }));
    const outer = [...g.blocks.filter((b) => b.level === 0), ...others].sort((a, b) => at.get(a.root)! - at.get(b.root)! || a.left - b.left);
    const clashes: { root: string; need: number }[] = [];
    let prev = 8 - GAP_OUT;
    for (const b of outer) { const d = prev + GAP_OUT - b.left; if (d > 0.5) { clashes.push({ root: b.root, need: d }); break; } prev = Math.max(prev, b.right); }
    const inner = g.blocks.filter((b) => b.level === 1);
    for (let i = 1; i < inner.length; i++) {
      const a = inner[i - 1], b = inner[i];
      const d = a.frame === b.frame ? a.right + GAP_IN - b.left : 0;
      if (d > 0.5) { clashes.push({ root: b.root, need: d }); break; }
    }
    if (!clashes.length) break;
    const c = clashes.reduce((m, k) => (at.get(k.root)! < at.get(m.root)! ? k : m));
    lead.set(c.root, (lead.get(c.root) ?? 0) + c.need);
    for (let i = at.get(c.root)!; i < xs.length; i++) xs[i] += c.need;
  }
  return lead;
}

/** What a system sheet drawing these main boards prints of the MV side, without positions: its rings' ends, its RMUs
 * with their tee-offs and stubs, its substation titles and transformer numbers. The sheet's fingerprint (drawingSet
 * sheetHash, version 4) follows it, so a change elsewhere in the project that the sheet shows flags it as changed.
 * Undefined when the ring arrangement is not drawn. */
export function mvSheetKey(project: Project, drawn: Board[]): unknown {
  if (!mvRingOn(project)) return undefined;
  const plan = mvPlan(project);
  const ids = new Set(drawn.filter(onMvSide).map((b) => b.id));
  const order = plan.order.filter((id) => ids.has(id));
  if (!order.length) return undefined;
  const g = mvGeometry(project, plan, new Map(order.map((id, i) => [id, i * 1000])), { earth: false });
  return [
    g.runs.map((r) => [r.source?.id ?? null, r.head.kind === 'from' ? r.head.text : 'source', r.tail?.text ?? null]),
    // The normally open switch only where one is entered: sheets issued before it keep their fingerprint.
    g.rmus.map((m) => [m.item.name, m.item.config ?? null, m.item.ringWays, m.item.tOff ?? null, m.item.fuseA ?? null, m.item.tees.map((t) => t ?? null), m.stubs.map((t) => t.text), ...(m.item.normallyOpen ? [m.item.normallyOpen] : [])]),
    g.frames.map((f) => [f.name, f.sub ?? null]),
    g.taps.map((t) => t.boardId),
    order.map((id) => txTag(project, id) ?? null)
  ];
}
