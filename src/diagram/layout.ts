import type { Board, Feeder, Project, SpareWay } from '../types';
import { isDbBoard, spareWaysOf } from '../model/spareWays';
import { isScheduleCircuit } from '../calc/loadSchedule';
import { isInterlocked } from '../model/changeover';
import { boxedBoardIds } from './panelBox';
import { incomerReach, plainWayReach, spareReach, wayReach } from './panelLabels';
import { CO_GEN_REACH } from './ChangeoverSym';

/** Horizontal slot per load, vertical distance between board levels. */
export const LEAF_W = 132;
export const LEVEL_H = 270;
export const ROOT_BUS_Y = 210;
const MARGIN_X = 36;
/** A load symbol's centre below its board's busbar (where an end board's panel box goes). */
export const BOX_DY = 94;

export interface BoardNode {
  board: Board;
  /** The DB's final (load schedule) circuits. The SLD stops at the DB: they
   * are summarised on the board, not drawn; the board view and load
   * schedule list them. */
  circuits: Feeder[];
  /** No outgoing feeders drawn: the SLD ends at this board (no busbar). */
  terminal: boolean;
  /** End board drawn as one panel box in a load's slot on its parent's level (depth stays its own); x / busY are the box centre. */
  boxed?: boolean;
  depth: number;
  x: number; // centre of the board box / incomer drop
  busY: number;
  /** Where the board box and everything above the incomer hang from: the busbar, or higher on a
   * mains / generator changeover, whose two incomers and their instruments fill the space between. */
  headY: number;
  /** Generator incomer of an interlocked changeover: where it drops into the busbar. */
  genX?: number;
  busX1: number;
  busX2: number;
  /** The panel frame's left and right edges (DEWA style; standard style, a root panel), wide enough for every label inside it. */
  frame?: { x1: number; x2: number };
}

export interface FeederNode {
  feeder: Feeder;
  x: number;
  busY: number; // bus of the board it's connected to
  childBoardId?: string; // set for incomers to a sub-board
  panelBoardId?: string; // feeds a sub-board drawn as one panel box, in a load's slot
}

/** A spare breaker or a space on a panel's busbar (DB spares stay on the load schedule, like its circuits). */
export interface SpareNode {
  boardId: string;
  way: SpareWay;
  x: number;
  busY: number;
}

export interface SystemLayout {
  boards: BoardNode[];
  feeders: FeederNode[];
  spares: SpareNode[];
  roots: BoardNode[];
  utilityX: number;
  width: number;
  height: number;
  levelH: number; // vertical distance between board levels
  rootY: number; // busbar height of the main boards
}

/** Tree layout of the whole network: each load takes one LEAF_W slot, a
 * sub-board takes as many slots as it has loads (recursively, at least one),
 * and every board is centred over its own feeders. Final circuits of a DB
 * (lighting / power ways on its load schedule) are not drawn. Boards not reachable from a main
 * board are laid out as extra roots so nothing silently disappears. */
/** DEWA submission style: more room above each panel for its frame and summary box. */
export const DEWA_EXTRA_Y = 110;
/** Mains / generator changeover: height of its two incomers with instruments, and the slots
 * kept free beside its feeders (left for the mains instruments, right for the generator incomer). */
export const CHANGEOVER_H = 200;
const CHANGEOVER_LEFT = 1, CHANGEOVER_RIGHT = 2;
/** Half the busbar's reach past its outer ways, and the frame's margin past the busbar end. */
const BUS_HALF = LEAF_W * 0.38, FRAME_OUT = 7;
/** How far inside its slot a panel frame starts (≈ 9): neighbouring frames keep twice this between them. */
const FRAME_INSET = LEAF_W / 2 - BUS_HALF - FRAME_OUT;
/** Room between the end of a label and the frame line. */
const FRAME_PAD = 6;
/** Room between the end of a root's supply / earth labels and the next root's slot. */
const ROOT_LABEL_GAP = 12;

export interface LayoutOptions {
  /** DEWA style: a frame round each panel, as wide as its ways' and incomer's labels, and the room after it to match. */
  frames?: boolean;
  /** Standard style: a frame round each root panel with ways (no changeover), as wide as the labels inside it. */
  rootFrames?: boolean;
  /** Cable reference numbers instead of the cable text (shorter labels). */
  cableRefs?: boolean;
  /** Extra room above the root bus only (levels keep their spacing), e.g. for the
   * standard-style LV earth-pit detail under a root's transformer. */
  rootExtraY?: number;
  /** Extra room left of a root board (by id), e.g. for the DEWA-style LV earth pits drawn
   * outside its panel frame. */
  rootLeadX?: Map<string, number>;
  /** How far right of a root board's incomer line (by id) its supply and earth-pit labels reach, so the next
   * root starts clear of them. A new panel with no ways has only one slot, narrower than those labels. */
  rootReachX?: Map<string, number>;
}

export function layoutSystem(project: Project, extraY = 0, opts: LayoutOptions = {}): SystemLayout {
  const rootY = ROOT_BUS_Y + extraY + (opts.rootExtraY ?? 0);
  const levelH = LEVEL_H + extraY;
  const byId = new Map(project.boards.map((b) => [b.id, b]));
  // Feeders of each board, split once (the layout asks for them many times).
  const sched = new Map<string, Feeder[]>(), kids = new Map<string, Feeder[]>();
  for (const f of project.feeders) { const m = isScheduleCircuit(f) ? sched : kids; (m.get(f.boardId) ?? m.set(f.boardId, []).get(f.boardId)!).push(f); }
  const scheduled = (boardId: string) => sched.get(boardId) ?? [];
  const children = (boardId: string) => kids.get(boardId) ?? [];
  const subBoard = (f: Feeder) => (f.feedsBoardId ? byId.get(f.feedsBoardId) : undefined);
  // End boards drawn as one box take a load's slot on their parent's level.
  const boxed = boxedBoardIds(project);
  const busSpares = (boardId: string) => { const b = byId.get(boardId); return b && !isDbBoard(b) ? spareWaysOf(b) : []; };

  // Ammeter / voltmeter and lamps sit inside the panel left of its incomer: a panel with a single way
  // has no room there, so it keeps a slot free on its left (as a changeover does for its mains instruments).
  const instrumentSlot = (b: Board) => (b.instruments ?? !b.upstreamId) && !isInterlocked(b) && children(b.id).length + busSpares(b.id).length === 1;

  const unitsCache = new Map<string, number>();
  const units = (boardId: string, path: Set<string>): number => {
    if (unitsCache.has(boardId)) return unitsCache.get(boardId)!;
    if (path.has(boardId)) return 1; // cycle guard
    path.add(boardId);
    const n = children(boardId).reduce((sum, f) => {
      const child = subBoard(f);
      return sum + (child && !boxed.has(child.id) ? units(child.id, path) : 1);
    }, busSpares(boardId).length);
    path.delete(boardId);
    const b = byId.get(boardId);
    const u = Math.max(1, n) + (b && isInterlocked(b) ? CHANGEOVER_LEFT + CHANGEOVER_RIGHT : 0) + (b && instrumentSlot(b) ? 1 : 0);
    unitsCache.set(boardId, u);
    return u;
  };

  const boards: BoardNode[] = [];
  const feeders: FeederNode[] = [];
  const spares: SpareNode[] = [];
  const placed = new Set<string>();

  /** Places a board and everything below it from `left`; returns the board and where the next one may start. */
  const place = (board: Board, left: number, depth: number): { node: BoardNode; right: number } => {
    placed.add(board.id);
    const busY = rootY + depth * levelH;
    const co = isInterlocked(board), inst = instrumentSlot(board);
    const framed = !!opts.frames || (!!opts.rootFrames && depth === 0 && !co);
    const labelReach = (f: Feeder, load: boolean) => (opts.frames ? wayReach(project, f, load, opts.cableRefs) : plainWayReach(f));
    let cursor = left + (co ? CHANGEOVER_LEFT * LEAF_W : 0) + (inst ? LEAF_W : 0);
    const xs: number[] = [];
    // Right-hand end of the labels on this panel's ways (DEWA frames only).
    let reach = -Infinity;
    for (const f of children(board.id)) {
      const child = subBoard(f);
      if (child && boxed.has(child.id) && !placed.has(child.id)) {
        placed.add(child.id);
        const x = cursor + LEAF_W / 2;
        feeders.push({ feeder: f, x, busY, panelBoardId: child.id });
        boards.push({ board: child, circuits: scheduled(child.id), terminal: true, boxed: true, depth: depth + 1, x, busY: busY + BOX_DY, headY: busY + BOX_DY, busX1: x, busX2: x });
        xs.push(x);
        if (framed) reach = Math.max(reach, x + labelReach(f, true));
        cursor += LEAF_W;
      } else if (child && !placed.has(child.id)) {
        const w = units(child.id, new Set());
        const { node, right } = place(child, cursor, depth + 1);
        feeders.push({ feeder: f, x: node.x, busY, childBoardId: child.id });
        xs.push(node.x);
        if (framed) reach = Math.max(reach, node.x + labelReach(f, false));
        // A sub-board whose frame needed more room than its slots takes it.
        cursor = Math.max(cursor + w * LEAF_W, right);
      } else {
        const x = cursor + LEAF_W / 2;
        feeders.push({ feeder: f, x, busY });
        xs.push(x);
        if (framed) reach = Math.max(reach, x + labelReach(f, true));
        cursor += LEAF_W;
      }
    }
    for (const w of busSpares(board.id)) {
      const x = cursor + LEAF_W / 2;
      spares.push({ boardId: board.id, way: w, x, busY });
      xs.push(x);
      if (framed) reach = Math.max(reach, x + spareReach(w));
      cursor += LEAF_W;
    }
    const x = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : cursor + LEAF_W / 2;
    const half = BUS_HALF;
    // The generator incomer drops in beyond the last way, with room on its right for its instruments.
    const genX = co ? Math.max(cursor, x + half) + LEAF_W * 0.6 : undefined;
    const node: BoardNode = {
      board,
      circuits: scheduled(board.id),
      terminal: xs.length === 0 && !co,
      depth,
      x,
      busY,
      headY: busY,
      genX,
      // A changeover's busbar runs under its mains instruments too, as on DEWA drawings.
      busX1: co || inst ? left + 12 : Math.min(x - half, xs.length ? Math.min(...xs) - half : x - half),
      busX2: Math.max(x + half, xs.length ? Math.max(...xs) + half : x + half, genX !== undefined ? genX + 14 : -Infinity)
    };
    boards.push(node);
    // Its slots (more when a sub-board below took more), and with a frame, room for the frame before the next panel.
    let right = Math.max(left + units(board.id, new Set()) * LEAF_W, cursor + (co ? CHANGEOVER_RIGHT * LEAF_W : 0));
    if (framed && !node.terminal) {
      const x2 = Math.max(node.busX2 + FRAME_OUT, genX !== undefined ? genX + CO_GEN_REACH : -Infinity, reach + FRAME_PAD, x + incomerReach(project, board) + FRAME_PAD);
      node.frame = { x1: node.busX1 - FRAME_OUT, x2 };
      right = Math.max(right, x2 + FRAME_INSET);
    }
    return { node, right };
  };

  const roots: BoardNode[] = [];
  let left = MARGIN_X;
  const rootBoards = [...project.boards.filter((b) => !b.upstreamId), ...project.boards.filter((b) => b.upstreamId && !byId.has(b.upstreamId))];
  for (const b of rootBoards) {
    if (placed.has(b.id)) continue;
    left += opts.rootLeadX?.get(b.id) ?? 0;
    const { node, right } = place(b, left, 0);
    roots.push(node);
    const reach = opts.rootReachX?.get(b.id);
    left = reach === undefined ? right : Math.max(right, node.x + reach + ROOT_LABEL_GAP);
  }
  // Anything still unplaced (e.g. a board whose incomer feeder is missing).
  for (const b of project.boards) {
    if (placed.has(b.id)) continue;
    const { node, right } = place(b, left, 0);
    roots.push(node);
    left = right;
  }

  const maxDepth = boards.reduce((m, b) => (b.boxed ? m : Math.max(m, b.depth)), 0);
  const level = (b: BoardNode) => (b.boxed ? b.depth - 1 : b.depth);
  // A level with a changeover board is taller by CHANGEOVER_H; the levels below move down with it.
  const shift: number[] = [];
  for (let d = 0, sum = 0; d <= maxDepth; d++) {
    sum += boards.some((b) => b.depth === d && isInterlocked(b.board)) ? CHANGEOVER_H : 0;
    shift[d] = sum;
  }
  if (shift[maxDepth]) {
    const depthOf = new Map(boards.map((b) => [b.board.id, b.depth]));
    for (const b of boards) {
      b.busY += shift[level(b)];
      b.headY = b.busY - (!b.boxed && isInterlocked(b.board) ? CHANGEOVER_H : 0);
    }
    for (const f of feeders) f.busY += shift[depthOf.get(f.feeder.boardId) ?? 0];
    for (const w of spares) w.busY += shift[depthOf.get(w.boardId) ?? 0];
  }
  const utilityX = roots.length ? (roots[0].x + roots[roots.length - 1].x) / 2 : MARGIN_X + LEAF_W / 2;
  return {
    boards,
    feeders,
    spares,
    roots,
    utilityX,
    width: Math.max(left + MARGIN_X, 480),
    height: rootY + maxDepth * levelH + (shift[maxDepth] ?? 0) + 250, // room for load labels and result tags
    levelH,
    rootY
  };
}
