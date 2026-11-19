import type { Board, Project } from '../types';
import { txTag } from '../model/transformers';
import { authoritySupplied, mvPlan, mvRingOn, onMvSide, substationTitle } from './mvArrangement';

/** Show (SLD ribbon → View → Show; proposal 2026-11-18, part 2): the part of the network the system diagram draws. The
 * whole network; the MV overview (the MV side only, each main board as its name); a substation, an RMU or a transformer
 * with everything its main boards feed; or a main board on an authority LV supply. Only the view changes: the
 * calculations, checks and results stay those of the whole network, and the drawing takes the ring, the RMUs' other
 * tee-offs and the transformer numbers from the whole project (stubs for what is not drawn). */
export type SldPart =
  | { kind: 'all' }
  | { kind: 'mv' }
  | { kind: 'substation'; name: string }
  | { kind: 'rmu'; name: string }
  | { kind: 'tx'; id: string }
  | { kind: 'supply'; id: string };

export const WHOLE_NETWORK: SldPart = { kind: 'all' };

/** A part as one string (menu rows, memo keys): "all", "mv", "ss:SS-1", "rmu:RMU-1", "tx:MDB-1", "supply:MDB-8". */
export function partKey(p: SldPart): string {
  switch (p.kind) {
    case 'all': return 'all';
    case 'mv': return 'mv';
    case 'substation': return `ss:${p.name}`;
    case 'rmu': return `rmu:${p.name}`;
    case 'tx': return `tx:${p.id}`;
    case 'supply': return `supply:${p.id}`;
  }
}

export function parsePart(key: string): SldPart | undefined {
  if (key === 'all') return WHOLE_NETWORK;
  if (key === 'mv') return { kind: 'mv' };
  const i = key.indexOf(':'), k = key.slice(0, i), v = key.slice(i + 1);
  if (i < 0 || !v) return undefined;
  if (k === 'ss') return { kind: 'substation', name: v };
  if (k === 'rmu') return { kind: 'rmu', name: v };
  if (k === 'tx') return { kind: 'tx', id: v };
  if (k === 'supply') return { kind: 'supply', id: v };
  return undefined;
}

/** One row of the supply tree: a substation holds RMUs and transformers teed straight off the ring, an RMU its
 * transformers (by main board id). Main boards on an authority LV supply follow at the top level. */
export interface SupplyNode { part: SldPart; children: SupplyNode[] }

/** The supply tree in ring order (mvPlan: by ring, then substation, then RMU). A transformer with no RMU and no
 * substation is a row of its own. */
export function supplyTree(project: Project): SupplyNode[] {
  const out: SupplyNode[] = [];
  const subs = new Map<string, SupplyNode>();
  for (const ring of mvPlan(project).rings) for (const it of ring.items) {
    const node: SupplyNode = it.kind === 'rmu'
      ? { part: { kind: 'rmu', name: it.name }, children: it.tees.filter((t): t is string => !!t).map((id) => ({ part: { kind: 'tx', id }, children: [] })) }
      : { part: { kind: 'tx', id: it.boardId }, children: [] };
    if (it.substation === undefined) { out.push(node); continue; }
    let ss = subs.get(it.substation);
    if (!ss) { ss = { part: { kind: 'substation', name: it.substation }, children: [] }; subs.set(it.substation, ss); out.push(ss); }
    ss.children.push(node);
  }
  for (const b of project.boards.filter(authoritySupplied)) out.push({ part: { kind: 'supply', id: b.id }, children: [] });
  return out;
}

const same = (a: SldPart, b: SldPart) => partKey(a) === partKey(b);
const flat = (nodes: SupplyNode[]): SupplyNode[] => nodes.flatMap((n) => [n, ...flat(n.children)]);
/** The main boards a node holds: its transformers' (or its own, for a transformer or an authority supply). */
const mainsOf = (n: SupplyNode): string[] => (n.part.kind === 'tx' || n.part.kind === 'supply' ? [n.part.id] : n.children.flatMap(mainsOf));

/** The main boards (no upstream board) a part draws; none when the part is gone (renamed or deleted). */
export function partMains(project: Project, part: SldPart): string[] {
  if (part.kind === 'all' || part.kind === 'mv') return project.boards.filter((b) => !b.upstreamId).map((b) => b.id);
  const node = flat(supplyTree(project)).find((n) => same(n.part, part));
  return node ? mainsOf(node) : [];
}

/** Children of each board, once, for the counts and the parts (`below` walks every board for each child). */
function childIndex(project: Project): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const b of project.boards) if (b.upstreamId) (m.get(b.upstreamId) ?? m.set(b.upstreamId, []).get(b.upstreamId)!).push(b.id);
  return m;
}
/** Each main board with everything below it. */
function withBelow(mains: string[], kids: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => { if (out.has(id)) return; out.add(id); for (const k of kids.get(id) ?? []) walk(k); };
  mains.forEach(walk);
  return out;
}

/** Every board a part draws: its main boards and everything they feed (the MV overview: the main boards only). */
export function partBoards(project: Project, part: SldPart): Set<string> {
  if (part.kind === 'all') return new Set(project.boards.map((b) => b.id));
  const mains = partMains(project, part);
  return part.kind === 'mv' ? new Set(mains) : withBelow(mains, childIndex(project));
}

/** The part still exists in the project, else the whole network. */
export function validPart(project: Project, part: SldPart): SldPart {
  if (part.kind === 'all') return part;
  return partMains(project, part).length ? part : WHOLE_NETWORK;
}

/** The project as the system diagram draws a part: its boards, their loads and the bus couplers between them (the
 * whole project when the whole network is shown). The MV overview keeps only the main boards, with no ways, spares or
 * earth pits: each is drawn as its name under its transformer. */
export function partProject(project: Project, part: SldPart): Project {
  if (part.kind === 'all') return project;
  if (part.kind === 'mv') {
    const boards = project.boards.filter((b) => !b.upstreamId).map((b): Board => ({ ...b, spareWays: undefined, earthing: { ...b.earthing, show: false } }));
    return { ...project, boards, feeders: [], ties: [] };
  }
  const ids = partBoards(project, part);
  return {
    ...project,
    boards: project.boards.filter((b) => ids.has(b.id)),
    feeders: project.feeders.filter((f) => ids.has(f.boardId)),
    ties: (project.ties ?? []).filter((t) => ids.has(t.a) && ids.has(t.b))
  };
}

/** The part a board belongs to, for a board picked outside the shown part (panel tree, Check, Find; decision 4): its
 * main board's substation, else its RMU, else its transformer (or authority supply). */
export function partOfBoard(project: Project, boardId: string): SldPart {
  const byId = new Map(project.boards.map((b) => [b.id, b]));
  let b = byId.get(boardId);
  for (const seen = new Set<string>(); b?.upstreamId && !seen.has(b.id);) { seen.add(b.id); b = byId.get(b.upstreamId); }
  if (!b) return WHOLE_NETWORK;
  const root = b.id;
  const top = supplyTree(project).find((n) => mainsOf(n).includes(root));
  return top?.part ?? WHOLE_NETWORK;
}

/** The part on screen: the one chosen, unless the selection moved since to a board it does not draw; then that board's
 * part (decision 4). `chosenWith` is what was selected when the part was chosen. */
export function shownPart(project: Project, chosen: SldPart, chosenWith: string | undefined, selected: string | undefined): SldPart {
  const p = validPart(project, chosen);
  if (p.kind === 'all' || !selected || selected === chosenWith || !project.boards.some((b) => b.id === selected)) return p;
  return partBoards(project, p).has(selected) ? p : partOfBoard(project, selected);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const txCount = (project: Project, mains: string[]) => mains.filter((id) => project.boards.find((b) => b.id === id)?.sourceKva).length;

/** How a part is named on the chip and in the menu: its name, what it is, and what it holds. */
export interface PartInfo { name: string; detail?: string; counts: string }

export function partInfo(project: Project, part: SldPart): PartInfo {
  const kids = childIndex(project);
  const mains = partMains(project, part);
  const boards = part.kind === 'all' ? project.boards.length : part.kind === 'mv' ? mains.length : withBelow(mains, kids).size;
  const tx = txCount(project, mains);
  const board = (id: string) => project.boards.find((b) => b.id === id);
  switch (part.kind) {
    case 'all': return { name: 'Whole network', counts: `${plural(tx, 'transformer')} · ${plural(boards, 'board')}` };
    case 'mv': {
      const ss = supplyTree(project).filter((n) => n.part.kind === 'substation').length;
      return { name: 'MV overview', counts: [ss ? plural(ss, 'substation') : '', plural(tx, 'transformer')].filter(Boolean).join(' · ') };
    }
    case 'substation': return { name: part.name, detail: substationTitle(project, part.name).sub, counts: `${plural(tx, 'transformer')} · ${plural(boards, 'board')}` };
    case 'rmu': {
      const it = rmuNode(project, part.name);
      const ss = mains.map((id) => board(id)?.substation?.trim()).find(Boolean);
      return { name: part.name, detail: [it?.config, ss].filter(Boolean).join(' · ') || undefined, counts: `${plural(tx, 'transformer')} · ${plural(boards, 'board')}` };
    }
    case 'tx': {
      const b = board(part.id);
      const where = [b?.substation?.trim(), b?.rmu?.trim()].filter(Boolean).join(' / ');
      return { name: txTag(project, part.id) ?? part.id, detail: [b?.sourceKva ? `${b.sourceKva} kVA` : '', where].filter(Boolean).join(' · ') || undefined, counts: plural(boards, 'board') };
    }
    case 'supply': return { name: part.id, detail: supplyText(board(part.id)), counts: plural(boards, 'board') };
  }
}

const supplyText = (b?: Board) => (b?.supply ? `meter cabinet${b.supply.ratingA ? ` ${b.supply.ratingA} A` : ''}` : undefined);
/** An RMU's configuration and its tee-offs with no transformer. */
function rmuNode(project: Project, name: string): { config?: string; spares: number } | undefined {
  for (const r of mvPlan(project).rings) for (const it of r.items) if (it.kind === 'rmu' && it.name === name) return { config: it.config, spares: it.tees.filter((t) => !t).length };
  return undefined;
}

/** The previous and next part of the same kind (substation, RMU, transformer or authority supply), in ring order;
 * undefined at the ends. The whole network and the MV overview have none. */
export function partSteps(project: Project, part: SldPart): { prev?: SldPart; next?: SldPart } {
  if (part.kind === 'all' || part.kind === 'mv') return {};
  const list = flat(supplyTree(project)).map((n) => n.part).filter((p) => p.kind === part.kind);
  const i = list.findIndex((p) => same(p, part));
  return i < 0 ? {} : { prev: list[i - 1], next: list[i + 1] };
}

/** A row of the Show menu: a part to pick, or a heading. `depth` indents RMUs and transformers under their substation. */
export interface ShowRow {
  /** Unique per row. */
  key: string;
  /** The part the row shows (partKey); none for a heading. */
  part?: string;
  label: string;
  detail?: string;
  note?: string;
  depth: 0 | 1 | 2;
  head?: boolean;
  sep?: boolean;
  /** The part shown (undefined for "Selection's substation", which is not one of the choices). */
  checked?: boolean;
  disabled?: boolean;
  title: string;
}

/** The Show menu: Whole network, MV overview, the supply tree (each substation, its RMUs and their transformers, with
 * kVA and main board and the boards each holds), the main boards on an authority LV supply, and the substation of the
 * board selected on the drawing. */
export function showRows(project: Project, current: SldPart, selected?: string): ShowRow[] {
  const kids = childIndex(project);
  const count = (mains: string[]) => withBelow(mains, kids).size;
  const now = partKey(current);
  const tree = supplyTree(project);
  const all = partInfo(project, WHOLE_NETWORK), mv = partInfo(project, { kind: 'mv' });
  const rows: ShowRow[] = [
    { key: 'all', part: 'all', label: 'Whole network', note: all.counts, depth: 0, checked: now === 'all', title: 'Draw the whole network' },
    { key: 'mv', part: 'mv', label: 'MV overview', note: mv.counts, depth: 0, checked: now === 'mv', disabled: !project.boards.some(onMvSide),
      title: 'Only the MV side: the source, the ring, the substations with their RMUs and transformers, and each main board as its name' }
  ];
  const named = tree.some((n) => n.part.kind === 'substation' || n.part.kind === 'rmu');
  const supply = tree.filter((n) => n.part.kind === 'supply');
  const walk = (n: SupplyNode, depth: 0 | 1 | 2) => {
    const p = n.part, key = partKey(p), mains = mainsOf(n), checked = key === now;
    if (p.kind === 'substation') {
      rows.push({ key, part: key, label: p.name, detail: substationTitle(project, p.name).sub, note: `${txCount(project, mains)} TX · ${plural(count(mains), 'board')}`, depth, checked, title: `Show ${p.name} only: its RMUs, transformers and main boards with everything they feed` });
    } else if (p.kind === 'rmu') {
      const it = rmuNode(project, p.name);
      const spare = it?.spares ? `${plural(it.spares, 'tee-off')} spare` : '';
      rows.push({ key, part: key, label: p.name, detail: [it?.config, spare].filter(Boolean).join(' · ') || undefined, depth, checked, title: `Show ${p.name} only: its transformers and their main boards` });
    } else if (p.kind === 'tx') {
      const b = project.boards.find((x) => x.id === p.id);
      rows.push({ key, part: key, label: txTag(project, p.id) ?? p.id, detail: `${b?.sourceKva ? `${b.sourceKva} kVA` : 'no source data'} → ${p.id}`, note: plural(count(mains), 'board'), depth, checked, title: `Show ${p.id}'s transformer only, with everything it feeds` });
    }
    for (const c of n.children) walk(c, Math.min(depth + 1, 2) as 1 | 2);
  };
  const mvNodes = tree.filter((n) => n.part.kind !== 'supply');
  if (mvNodes.length) {
    rows.push({ key: 'head:mv', label: named ? 'Substations, RMUs and transformers' : 'Transformers', depth: 0, head: true, sep: true, title: '' });
    for (const n of mvNodes) walk(n, 0);
  }
  if (supply.length) {
    rows.push({ key: 'head:supply', label: 'Authority LV supply', depth: 0, head: true, sep: true, title: '' });
    for (const n of supply) {
      const id = (n.part as { id: string }).id;
      rows.push({ key: partKey(n.part), part: partKey(n.part), label: id, detail: supplyText(project.boards.find((b) => b.id === id)), note: plural(count([id]), 'board'), depth: 1, checked: partKey(n.part) === now, title: `Show ${id} only, with everything it feeds` });
    }
  }
  const sel = selected && project.boards.some((b) => b.id === selected) ? partOfBoard(project, selected) : undefined;
  rows.push({ key: 'sel', part: sel && sel.kind !== 'all' ? partKey(sel) : undefined, label: 'Selection\'s substation', note: sel && sel.kind !== 'all' ? partInfo(project, sel).name : undefined, depth: 0, sep: true,
    disabled: !sel || sel.kind === 'all', title: sel && sel.kind !== 'all' ? `Show the part of ${selected}: ${partInfo(project, sel).name}` : 'Select a board on the drawing first' });
  return rows;
}

/** A group row of the panel tree by substation (proposal part 3): a substation, an RMU, "No substation" or "Authority
 * supply". Its items are RMUs and main boards (by id), in ring order. */
export interface TreeGroup {
  /** Unique: a substation's or an RMU's part key, else "none" or "supply". */
  key: string;
  /** The part the row shows on the SLD (a substation or an RMU). */
  part?: string;
  label: string;
  /** An RMU's configuration. */
  detail?: string;
  /** What it holds, e.g. "2 TX · 25 boards"; none on an RMU row, as the tree is narrow (its title says it). */
  note?: string;
  /** What it is and holds, for the row's tooltip. */
  title: string;
  items: TreeItem[];
}
/** A group, or a main board by id. */
export type TreeItem = TreeGroup | string;

/** The panel tree grouped by substation: each substation → its RMUs → their main boards, in ring order. RMUs and
 * transformers in no substation, and a board whose upstream board is gone, go under "No substation" (at the top level
 * when no substation is named); main boards on an authority LV supply under "Authority supply". Undefined when no main
 * board names an RMU or a substation: there is nothing to group, and the tree has no Group switch. */
export function treeGroups(project: Project): TreeItem[] | undefined {
  if (!mvRingOn(project)) return undefined;
  const kids = childIndex(project);
  const boards = (mains: string[]) => plural(withBelow(mains, kids).size, 'board');
  const holds = (mains: string[], short = false) => `${short ? `${txCount(project, mains)} TX` : plural(txCount(project, mains), 'transformer')} · ${boards(mains)}`;
  const mainsIn = (it: TreeItem): string[] => (typeof it === 'string' ? [it] : it.items.flatMap(mainsIn));
  const item = (n: SupplyNode): TreeItem => {
    const p = n.part, key = partKey(p), mains = mainsOf(n);
    if (p.kind === 'substation') {
      return { key, part: key, label: p.name, note: holds(mains, true), title: [p.name, substationTitle(project, p.name).sub, holds(mains)].filter(Boolean).join(' · '), items: n.children.map(item) };
    }
    if (p.kind === 'rmu') {
      const it = rmuNode(project, p.name);
      const spare = it?.spares ? `${plural(it.spares, 'tee-off')} spare` : '';
      return { key, part: key, label: p.name, detail: it?.config, title: [p.name, it?.config, spare, holds(mains)].filter(Boolean).join(' · '), items: n.children.map(item) };
    }
    return mains[0];
  };
  const tree = supplyTree(project);
  const ids = new Set(project.boards.map((b) => b.id));
  const top: TreeItem[] = [], loose: TreeItem[] = [];
  for (const n of tree) if (n.part.kind !== 'supply') (n.part.kind === 'substation' ? top : loose).push(item(n));
  loose.push(...project.boards.filter((b) => b.upstreamId && !ids.has(b.upstreamId)).map((b) => b.id));
  if (top.length && loose.length) {
    const mains = loose.flatMap(mainsIn);
    top.push({ key: 'none', label: 'No substation', note: holds(mains, true), title: `In no substation · ${holds(mains)}`, items: loose });
  } else top.push(...loose);
  const supply = tree.flatMap((n) => (n.part.kind === 'supply' ? [n.part.id] : []));
  if (supply.length) {
    top.push({ key: 'supply', label: 'Authority supply', note: boards(supply), title: `${plural(supply.length, 'main board')} on an authority LV supply (meter cabinet) · ${boards(supply)}`, items: supply });
  }
  return top;
}
