import type { SupplyMode } from '../../calc/scenario';
import { quickFixes } from '../../calc/quickFix';
import type { ColorBy } from '../../diagram/heatmap';
import type { ResultLayers } from '../../diagram/annotations';
import { renamePanels, renameProblems } from '../../model/renamePanels';
import type { DropResult, DropTarget, MoveItem, PaletteItem } from '../../model/sldEdit';
import { applyDrop } from '../../model/sldEdit';
import { faultPointResult, removeFaultPoint, updateFaultPoint } from '../../calc/faultPoints';
import type { SldTarget } from '../../model/sldMenu';
import { changeFeeder, changeFeeders, duplicateBoard, duplicateFeeder, duplicateMany, moveMany, orderTarget, pasteFeeders, type PickItem } from '../../model/sldMenuEdit';
import { addRmu, removeRmu } from '../../model/mvGrow';
import { newSubstationName, rmuConfig, rmuNormallyOpen, txRmu, txSubstation } from '../../model/substations';
import type { Feeder, Project } from '../../types';

/** What the SLD menus' rows do (sldMenu.ts lists them): each action calls the page through this interface, so the page
 * keeps its one way of doing each thing (the Panels tree, the ribbon and the hover card use the same functions). The
 * drawing does its own view actions (SLD_VIEW_ACTIONS) and is not asked for them here. */
export interface SldMenuCtx {
  project: Project;
  calcProject: Project;
  copiedBoard?: string;
  copiedLoads?: string[];
  status: (m: string) => void;
  /** One undo step, the result's selection and its message. */
  apply: (r: DropResult) => void;
  selectBoard: (id: string) => void;
  selectFeeder: (id: string) => void;
  editBoard: (id: string) => void;
  editFeeder: (id: string) => void;
  openSchedule: (boardId: string) => void;
  openBoardDiagram: (boardId: string) => void;
  addLoad: (boardId: string, preset: Partial<Feeder>) => void;
  addBoard: (boardId: string) => void;
  /** Add upstream board…: the board (or transformer) that feeds this first board, after asking. */
  addUpstream: (boardId: string) => void;
  /** Connect to…: joins this first board to a board already in the project, asking first when values are lost. */
  connectTo: (boardId: string, parentId: string) => void;
  copyBoard: (id: string) => void;
  copyLoad: (id: string) => void;
  /** Several loads on the clipboard, in order. */
  copyLoads: (ids: string[]) => void;
  /** Edit together…: the dialog for these loads. */
  openTogether: (ids: string[]) => void;
  /** Delete several: asks once, then one undo step. */
  deleteMany: (items: PickItem[]) => void;
  /** Today's paste dialog for a copied board. */
  pasteBoard: (boardId: string) => void;
  repeatBranch: (boardId: string) => void;
  moveItem: (item: MoveItem, target: DropTarget) => void;
  setCableType: (boardId: string, type: string) => void;
  lengthChecked: (boardId: string) => void;
  fixFeeder: (id: string, patch: Partial<Feeder>, label: string) => void;
  deleteBoard: (id: string) => void;
  deleteLoad: (id: string) => void;
  showOnPlan: (t: { board?: string; feeder?: string }) => void;
  zoomTo: (kind: 'board' | 'feeder', id: string) => void;
  properties: (kind: 'board' | 'feeder', id: string) => void;
  txSizing: () => void;
  hvSupply: () => void;
  dropItem: (item: PaletteItem, target: DropTarget) => void;
  setSupply: (m: SupplyMode) => void;
  toggleLayer: (k: keyof ResultLayers) => void;
  setColorBy: (c: ColorBy) => void;
  exportSld: () => void;
  undo: () => void;
  redo: () => void;
  setTie: (id: string, patch: { closed?: boolean; ratingA?: number }) => void;
  removeTie: (id: string) => void;
  /** Show (SLD ribbon → View → Show): draw this part of the network (mvShow.ts partKey). */
  showPart?: (key: string) => void;
  /** Asks for a name (New substation…): the typed name, or null when cancelled. */
  askName?: (title: string, initial: string) => Promise<string | null>;
  /** Add transformer and main board on an RMU: asks first when the RMU would grow, then one undo step. */
  addTxOnRmu: (name: string) => void;
}

/** An edit of the MV arrangement: one undo step, or only its message when nothing changed. */
function applyEdit(ctx: SldMenuCtx, r: DropResult): void {
  if (r.project === ctx.project) { if (r.message) ctx.status(r.message); } else ctx.apply({ ...r, message: `${r.message} (undo with ⌘Z)` });
}

/** The Add load menu of the SLD ribbon. */
const ADD_PRESETS: Record<string, Partial<Feeder>> = {
  load: { loadType: 'general' },
  motor: { loadType: 'motor', powerFactor: 0.86, demandFactor: 1 },
  pv: { loadType: 'pv', generation: true, powerFactor: 1, demandFactor: 1 },
  ev: { loadType: 'ev', powerFactor: 0.98 },
  cable: {}
};

const SUPPLY_ITEMS: Record<string, PaletteItem> = {
  generator: { kind: 'generator' }, 'generator-acb': { kind: 'generator', changeover: 'ACB' }, tie: { kind: 'tie' }, transformer: { kind: 'transformer' }, mc: { kind: 'board', board: 'MC' }
};

/** The rows of the several-picked menu (the drawing itself does Zoom, Deselect and the Move to list). */
function runSeveral(ctx: SldMenuCtx, items: PickItem[], action: string, value?: string): void {
  const { project } = ctx;
  const ids = items.filter((x) => x.kind === 'feeder').map((x) => x.id);
  switch (action) {
    case 'together': if (ids.length) ctx.openTogether(ids); return;
    case 'change': {
      if (value === undefined) return;
      const i = value.indexOf('|'), field = i < 0 ? value : value.slice(0, i), v = i < 0 ? undefined : value.slice(i + 1);
      const r = changeFeeders(project, ids, field, v);
      ctx.apply(r.project === project ? r : { ...r, message: `${r.message} (undo with ⌘Z)` });
      return;
    }
    case 'copy': if (ids.length && ids.length === items.length) ctx.copyLoads(ids); return;
    case 'duplicate': { const r = duplicateMany(project, items); ctx.apply(r.project === project ? r : { ...r, message: `${r.message} (undo with ⌘Z)` }); return; }
    case 'moveto': { if (value) { const r = moveMany(project, items, value); ctx.apply(r.project === project ? r : { ...r, message: `${r.message} (undo with ⌘Z)` }); } return; }
    case 'delete': ctx.deleteMany(items); return;
  }
}

/** Runs a picked row. `t` is what was right-clicked, `value` what follows the action in the row's arg. */
export function runSldMenu(ctx: SldMenuCtx, t: SldTarget, action: string, value?: string): void {
  const { project } = ctx;
  if (t.kind === 'several') { runSeveral(ctx, t.items, action, value); return; }
  const boardId = t.kind === 'board' ? t.id : t.kind === 'supply' ? t.boardId : undefined;
  const feederId = t.kind === 'feeder' ? t.id : undefined;
  const picked: { kind: 'board' | 'feeder'; id: string } | undefined = boardId ? { kind: 'board', id: boardId } : feederId ? { kind: 'feeder', id: feederId } : undefined;
  const item: MoveItem | undefined = picked;
  switch (action) {
    case 'edit':
      if (boardId) { ctx.selectBoard(boardId); ctx.editBoard(boardId); } else if (feederId) ctx.editFeeder(feederId);
      return;
    case 'schedule': if (boardId) ctx.openSchedule(boardId); return;
    case 'diagram': if (boardId) { ctx.selectBoard(boardId); ctx.openBoardDiagram(boardId); } return;
    case 'add':
      if (!boardId || !value) return;
      if (value === 'board') ctx.addBoard(boardId); else if (ADD_PRESETS[value]) ctx.addLoad(boardId, ADD_PRESETS[value]);
      return;
    case 'addupstream': if (t.kind === 'board') ctx.addUpstream(t.id); return;
    case 'connectto': if (t.kind === 'board' && value) ctx.connectTo(t.id, value); return;
    case 'copy': if (t.kind === 'board') ctx.copyBoard(t.id); else if (feederId) ctx.copyLoad(feederId); return;
    case 'paste':
      if (t.kind !== 'board') return;
      if (ctx.copiedBoard) ctx.pasteBoard(t.id); else if (ctx.copiedLoads?.length) ctx.apply(pasteFeeders(project, ctx.copiedLoads, { type: 'bus', boardId: t.id }));
      return;
    case 'duplicate':
      if (t.kind === 'board') ctx.apply(duplicateBoard(project, t.id)); else if (feederId) ctx.apply(duplicateFeeder(project, feederId));
      return;
    case 'repeat': if (t.kind === 'board') ctx.repeatBranch(t.id); return;
    case 'order': {
      const how = value as 'left' | 'right' | 'first' | 'last';
      if (!item || !['left', 'right', 'first', 'last'].includes(how)) return;
      const target = orderTarget(project, item, how);
      if (target) ctx.moveItem(item, target); else ctx.status(`${item.id} is already ${how === 'left' || how === 'first' ? 'first' : 'last'} on its busbar`);
      return;
    }
    case 'rename': {
      if (t.kind !== 'board') return;
      const to = (value ?? '').trim();
      if (!to || to === t.id) return;
      const problems = renameProblems(project, [{ from: t.id, to }]);
      if (problems.length) { ctx.status(problems[0]); return; }
      ctx.apply({ project: renamePanels(project, [{ from: t.id, to }]), select: { type: 'board', id: to }, message: `Renamed ${t.id} to ${to} (undo with ⌘Z)` });
      return;
    }
    case 'cabletype': if (t.kind === 'board' && value) ctx.setCableType(t.id, value); return;
    case 'lengthchecked': if (t.kind === 'board') ctx.lengthChecked(t.id); return;
    case 'change': {
      if (!feederId || value === undefined) return;
      const i = value.indexOf('|'), field = i < 0 ? value : value.slice(0, i), v = i < 0 ? undefined : value.slice(i + 1);
      const r = changeFeeder(project, feederId, field, v);
      ctx.apply(r.project === project ? r : { ...r, message: `${r.message} (undo with ⌘Z)` });
      return;
    }
    case 'quickfix': {
      const f = feederId ? project.feeders.find((x) => x.id === feederId) : undefined;
      const fix = f ? quickFixes(ctx.calcProject, f)[Number(value)] : undefined;
      if (f && fix) ctx.fixFeeder(f.id, fix.patch, fix.label);
      return;
    }
    case 'delete': if (t.kind === 'board') ctx.deleteBoard(t.id); else if (feederId) ctx.deleteLoad(feederId); return;
    case 'faultadd': if (picked) ctx.apply(applyDrop(project, { kind: 'faultPoint' }, picked.kind === 'board' ? { type: 'bus', boardId: picked.id } : { type: 'feeder', feederId: picked.id })); return;
    case 'faultremove': if (value) ctx.apply({ project: removeFaultPoint(project, value), message: `Fault point ${value} removed (undo with ⌘Z)` }); return;
    case 'faultat': {
      // value: "F1:0.5" — the mark and how far along the circuit's cable (0 = at the board, 1 = the far end).
      const [id, k] = (value ?? '').split(':'), f = feederId ? project.feeders.find((x) => x.id === feederId) : undefined;
      if (!id || !f || !Number.isFinite(Number(k))) return;
      const d = Number(k) >= 1 ? undefined : Math.round(f.lengthM * Number(k) * 10) / 10;
      const next = updateFaultPoint(project, id, { distanceM: d });
      const made = next.faultPoints?.find((p) => p.id === id);
      ctx.apply({ project: next, message: made ? `Fault point ${id}: ${faultPointResult(next, made).place}` : `Fault point ${id} is not on the drawing` });
      return;
    }
    case 'plan': if (picked) ctx.showOnPlan({ [picked.kind]: picked.id }); return;
    case 'zoom': if (picked) ctx.zoomTo(picked.kind, picked.id); return;
    case 'properties': if (picked) ctx.properties(picked.kind, picked.id); return;
    case 'txsizing': ctx.txSizing(); return;
    case 'hv': ctx.hvSupply(); return;
    case 'addsupply': {
      if (value === 'rmu' && t.kind === 'canvas') { applyEdit(ctx, addRmu(project)); return; }
      const what = value ? SUPPLY_ITEMS[value] : undefined;
      if (what && (t.kind === 'supply' || t.kind === 'canvas')) ctx.dropItem(what, t.kind === 'supply' ? { type: 'bus', boardId: t.boardId } : { type: 'canvas' });
      return;
    }
    case 'scenario': if (value) ctx.setSupply(value as SupplyMode); return;
    case 'values': if (value) ctx.toggleLayer(value as keyof ResultLayers); return;
    case 'colour': if (value) ctx.setColorBy(value as ColorBy); return;
    case 'export': ctx.exportSld(); return;
    case 'undo': ctx.undo(); return;
    case 'redo': ctx.redo(); return;
    case 'tieop': if (t.kind === 'tie' && (value === 'open' || value === 'closed')) ctx.setTie(t.id, { closed: value === 'closed' }); return;
    case 'tierating': if (t.kind === 'tie' && Number(value) > 0) ctx.setTie(t.id, { ratingA: Number(value) }); return;
    case 'tieremove': if (t.kind === 'tie') ctx.removeTie(t.id); return;
    case 'part': if (value) ctx.showPart?.(value); return;
    case 'txsubstation': {
      if (t.kind !== 'supply') return;
      if (value !== '+') { applyEdit(ctx, txSubstation(project, t.boardId, value ?? '')); return; }
      const asked = ctx.askName?.('New substation', newSubstationName(project));
      if (asked) void asked.then((name) => { if (name?.trim()) applyEdit(ctx, txSubstation(project, t.boardId, name)); });
      return;
    }
    case 'txrmu': if (t.kind === 'supply') applyEdit(ctx, txRmu(project, t.boardId, value ?? '')); return;
    case 'addtx': if (t.kind === 'rmu') ctx.addTxOnRmu(t.name); return;
    case 'rmuconfig': if (t.kind === 'rmu' && value) applyEdit(ctx, rmuConfig(project, t.name, value)); return;
    case 'rmuremove': if (t.kind === 'rmu') applyEdit(ctx, removeRmu(project, t.name)); return;
    case 'rmunop': if (t.kind === 'rmu') applyEdit(ctx, rmuNormallyOpen(project, t.name, value === 'R1' || value === 'R2' ? value : undefined)); return;
  }
}
