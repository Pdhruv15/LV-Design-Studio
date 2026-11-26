import { OSNAP_MODES, type OsnapMode } from '../../model/cadDraft';
import { closedArea, itemLength } from '../../model/cadCrop';
import { hatchArea } from '../../model/cadAnnotate';
import type { SketchItem } from '../../types';
import type { CadTool } from './cadState';

/** Design CAD: the right-click menus on the drawing (phase 1 of the context-menu plan, docs/notes/Future development/
 * UI UX proposals - 2026-11-11 - Context-aware right-click menus.md). Pure: each entry runs a typed command (`cmd`,
 * which must be one of CAD_COMMANDS, so every entry has a working tool behind it) or a page action (`act`); the page
 * turns them into clicks. */

export type CtxAct = 'repeat' | 'properties' | 'enter' | 'cancel' | 'option' | 'input' | 'snap' | 'deselect' | 'dev' | 'room' | 'dw' | 'xref' | 'vp' | 'paper' | 'grip' | 'fpaper' | 'sk' | 'sld';
/** The icons of the menus (cadMenuIcons.tsx): the ribbon's icon for the same tool. */
export type CtxIcon = 'repeat' | 'history' | 'tools' | 'clipboard' | 'cut' | 'copyclip' | 'paste' | 'undo' | 'redo' | 'erase' | 'move' | 'copy' | 'scale' | 'rotate' | 'mirror' | 'stretch' | 'array' | 'draworder' | 'isolate' | 'pan' | 'zoom' | 'similar' | 'invert' | 'deselect' | 'selectall' | 'qselect' | 'filter' | 'count' | 'properties' | 'options' | 'trim' | 'extend' | 'offset' | 'fillet' | 'chamfer' | 'break' | 'join' | 'explode' | 'reverse' | 'tocable' | 'room' | 'qmeasure' | 'addsel' | 'mkblock' | 'edtext' | 'find' | 'circuit' | 'swap' | 'sld' | 'schedule' | 'arrange' | 'samecircuit' | 'sametype' | 'device' | 'route' | 'tray' | 'enter' | 'cancel' | 'input' | 'snap' | 'boxes' | 'line' | 'pline' | 'circle' | 'arc' | 'rect' | 'text' | 'mtext' | 'dim' | 'hatch' | 'insert' | 'cloud' | 'point' | 'open' | 'crop' | 'reload' | 'unload' | 'detach' | 'bind' | 'layers' | 'print' | 'references' | 'activate' | 'expand' | 'lock' | 'unlock' | 'frame' | 'pagesetup' | 'plot' | 'viewport' | 'legend' | 'notes' | 'status' | 'sheets' | 'newlayout' | 'fromfile' | 'layouts' | 'rename' | 'delete' | 'arrangevp' | 'model' | 'plus' | 'minus' | 'save' | 'osnap' | 'ortho' | 'polar' | 'ellipse' | 'board' | 'transformer' | 'txsizing' | 'copyplus' | 'sliders' | 'textcursor' | 'locate' | 'shield' | 'shieldalert' | 'gauge' | 'waves' | 'power' | 'toggle' | 'fit' | 'grid' | 'tags' | 'palette' | 'export' | 'hv' | 'plug';
export interface CtxItem {
  label: string;
  /** The key shown on the right (a shortcut or alias). */
  key?: string;
  /** A typed command it runs, e.g. 'PASTECLIP'. */
  cmd?: string;
  /** Or a page action, with its argument (the recent command's index, the option's key, the value, the snap mode). */
  act?: CtxAct;
  arg?: string;
  /** Shown but not available now (e.g. Paste with nothing on the clipboard). */
  off?: boolean;
  /** The ribbon's icon for the same tool (cadMenuIcons.tsx); none keeps an empty slot so labels line up. */
  icon?: CtxIcon;
  /** A switch that is on (Object snap, the Properties palette): an amber check after the key; role menuitemcheckbox. */
  on?: boolean;
  /** In a list: the current choice (an amber check in the icon slot and the word "now"); usually with off. */
  now?: boolean;
  /** An electrical tool: its icon in the accent amber. */
  lv?: boolean;
  /** Erase: its icon in --bad. */
  bad?: boolean;
  /** A list beside the row; entries may be '-' and may have a list of their own (two levels at most). */
  sub?: CtxEntry[];
}
/** An entry, or a separator. */
export type CtxEntry = CtxItem | '-';
/** The line at the top of a menu: what is picked (or the command and its prompt). */
export interface CtxHead { icon?: CtxIcon; title: string; detail?: string; second?: string; secondTone?: 'bad' | 'warn' }

/** No separator first, last or twice in a row; the lists tidied the same way, and empty lists dropped. */
export function tidy(list: CtxEntry[]): CtxEntry[] {
  const out: CtxEntry[] = [];
  for (const x of list) {
    if (x === '-') { if (out.length && out[out.length - 1] !== '-') out.push(x); continue; }
    if (x.sub) { const sub = tidy(x.sub); if (!sub.length) continue; out.push({ ...x, sub }); continue; }
    out.push(x);
  }
  while (out[out.length - 1] === '-') out.pop();
  return out;
}

/** The icon of the tool running, in the header of the command menu (the ribbon's icon for it). */
export const TOOL_MENU_ICON: Partial<Record<CadTool, CtxIcon>> = {
  line: 'line', xline: 'line', ray: 'line', pline: 'pline', rect: 'rect', polygon: 'rect', circle: 'circle', circle2p: 'circle', circle3p: 'circle', circled: 'circle', arc: 'arc', arcsce: 'arc', ellipse: 'ellipse', text: 'text', mtext: 'mtext',
  dim: 'dim', dimlin: 'dim', dimal: 'dim', dimcont: 'dim', dimbase: 'dim', qdim: 'dim', dimspace: 'dim', dimbreak: 'dim', dimtedit: 'dim', dimrad: 'dim', dimdia: 'dim', dimang: 'dim', dimarc: 'dim', dimjog: 'dim', dimord: 'dim', hatch: 'hatch', insert: 'insert', revcloud: 'cloud', point: 'point', tray: 'tray', cable: 'route', dev: 'device',
  move: 'move', copy: 'copy', rotate: 'rotate', mirror: 'mirror', scale: 'scale', stretch: 'stretch', array: 'array', offset: 'offset', trim: 'trim', extend: 'extend', fillet: 'fillet', chamfer: 'chamfer', break: 'break', join: 'join', explode: 'explode',
  pan: 'pan', zoom: 'zoom', zoomwin: 'zoom', zoomscale: 'zoom'
};

/** An entry that is not a separator. */
export const isItem = (e: CtxEntry): e is CtxItem => e !== '-';
/** Every entry of a menu and of its lists, depth first (separators left out). */
export function allItems(list: readonly CtxEntry[]): CtxItem[] {
  return list.flatMap((x) => (x === '-' ? [] : [x, ...(x.sub ? allItems(x.sub) : [])]));
}

/** The groups of an object menu, one order for all of them: the non-empty ones, a divider between. */
export function groups(...gs: CtxEntry[][]): CtxEntry[] {
  const out: CtxEntry[] = [];
  for (const g of gs) if (g.length) out.push(...(out.length ? ['-' as const] : []), ...g);
  return tidy(out);
}

/** What every menu needs to know of the page: the history, the Properties palette and the clipboard. */
export interface MenuCommon { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string; propsOn: boolean; canPaste: boolean }

/** Group 1: Repeat the last command. */
export const repeatGroup = (repeat?: string): CtxEntry[] => (repeat ? [{ label: `Repeat ${repeat}`, key: 'Enter', act: 'repeat', arg: '0', icon: 'repeat' }] : []);
/** Undo and Redo, each with the name of its step. */
export const undoEntries = (c: MenuCommon): CtxEntry[] => [
  { label: c.undoLabel ? `Undo ${c.undoLabel}` : 'Undo', key: 'Ctrl+Z', cmd: 'UNDO', off: !c.canUndo, icon: 'undo' },
  { label: c.redoLabel ? `Redo ${c.redoLabel}` : 'Redo', key: 'Ctrl+Y', cmd: 'REDO', off: !c.canRedo, icon: 'redo' }
];
/** Isolate ▸ of the objects picked. */
export const isolateList = (): CtxItem => ({ label: 'Isolate', icon: 'isolate', sub: [{ label: 'Isolate objects', cmd: 'ISOLATEOBJECTS' }, { label: 'Hide objects', cmd: 'HIDEOBJECTS' }, { label: 'End object isolation', cmd: 'UNISOLATEOBJECTS' }] });
/** Zoom ▸: window, to the selection (when something is picked), previous, extents. */
export const zoomList = (selection: boolean): CtxItem => ({ label: 'Zoom', icon: 'zoom', sub: [{ label: 'Zoom window', key: 'Z W', cmd: 'Z W' }, ...(selection ? [{ label: 'Zoom to selection', key: 'Z O', cmd: 'Z O' }] : []),
  { label: 'Zoom previous', key: 'Z P', cmd: 'Z P' }, { label: 'Zoom extents', key: 'ZE', cmd: 'ZE' }] });
/** Group 5 of the object menus: Isolate, Pan, Zoom. */
export const viewGroup = (): CtxEntry[] => [isolateList(), { label: 'Pan', key: 'P', cmd: 'PAN', icon: 'pan' }, zoomList(true)];
/** Group 7: Properties (a check when the palette shows) and Options. */
export const paletteGroup = (c: MenuCommon): CtxEntry[] => [{ label: 'Properties', key: 'Ctrl+1', act: 'properties', on: c.propsOn, icon: 'properties' }, { label: 'Options…', key: 'OP', cmd: 'OPTIONS', icon: 'options' }];
/** Repeat (the last command) and Recent commands ▸ (the ones before it). */
function recentEntries(recent: readonly string[]): CtxEntry[] {
  if (!recent.length) return [];
  return [...repeatGroup(recent[0]),
    { label: 'Recent commands', icon: 'history', sub: recent.slice(1, 7).map((r, i) => ({ label: r, act: 'repeat' as const, arg: String(i + 1) })) }];
}

export interface BlankState extends MenuCommon {
  /** The recent commands, newest first. */
  recent: readonly string[];
  /** Objects are isolated or hidden (End object isolation is then on). */
  objectsHidden: boolean;
}

/** Right-click on empty space, with no command and nothing picked. */
export function blankMenu(s: BlankState): CtxEntry[] {
  return groups(
    recentEntries(s.recent),
    [{ label: 'Paste', key: 'Ctrl+V', cmd: 'PASTECLIP', off: !s.canPaste, icon: 'paste' }, { label: 'Paste to original coordinates', cmd: 'PASTEORIG', off: !s.canPaste }, ...undoEntries(s)],
    [{ label: 'Isolate', icon: 'isolate', sub: [{ label: 'End object isolation', cmd: 'UNISOLATEOBJECTS', off: !s.objectsHidden }, { label: 'Layers back as before Isolate', cmd: 'LAYUNISO' }] },
      { label: 'Pan', key: 'P', cmd: 'PAN', icon: 'pan' }, zoomList(false)],
    [{ label: 'Select all', key: 'Ctrl+A', cmd: 'SELECTALL', icon: 'selectall' }, { label: 'Quick select…', key: 'QS', cmd: 'QSELECT', icon: 'qselect' }, { label: 'Count', cmd: 'COUNT', icon: 'count' }],
    [{ label: 'Place device', key: 'DEV', cmd: 'DEV', icon: 'device', lv: true }, { label: 'Cable route', key: 'CR', cmd: 'CR', icon: 'route', lv: true }, { label: 'Cable tray', key: 'CT', cmd: 'CT', icon: 'tray', lv: true }],
    paletteGroup(s)
  );
}

export interface CommandState {
  /** The options of the prompt now ([Close/Undo] → Close C, Undo U). */
  options: readonly { option: string; key: string }[];
  /** Values typed at prompts lately, newest first. */
  inputs: readonly string[];
  toggles: { ortho?: boolean; polar?: boolean; osnap?: boolean };
  /** The one-shot snap chosen, if any. */
  snapOnce?: OsnapMode | null;
}

/** The one-shot snap modes (Snap overrides ▸), with None (no snap for the next point). */
export const SNAP_OVERRIDES: { mode: OsnapMode | 'none'; label: string }[] = [...OSNAP_MODES.map((m) => ({ mode: m.k, label: m.label })), { mode: 'none', label: 'None' }];

/** Right-click while a command waits for input (with options), or Shift+right-click at any prompt. */
export function commandMenu(s: CommandState): CtxEntry[] {
  return groups(
    [{ label: 'Enter', key: 'Enter', act: 'enter', icon: 'enter' }, { label: 'Cancel', key: 'Esc', act: 'cancel', icon: 'cancel' }],
    s.options.map((o): CtxItem => ({ label: o.option, key: o.key, act: 'option', arg: o.key })),
    [{ label: 'Recent input', icon: 'input', sub: s.inputs.slice(0, 8).map((v) => ({ label: v, act: 'input' as const, arg: v })) },
      { label: 'Snap overrides', icon: 'snap', sub: SNAP_OVERRIDES.map((m): CtxItem => ({ label: m.label, act: 'snap', arg: m.mode, ...(s.snapOnce === m.mode ? { now: true, key: 'next' } : {}) })) }],
    [{ label: 'Object snap', key: 'F3', cmd: 'OSNAP', on: !!s.toggles.osnap, icon: 'osnap' }, { label: 'Ortho', key: 'F8', cmd: 'ORTHO', on: !!s.toggles.ortho, icon: 'ortho' }, { label: 'Polar tracking', key: 'F10', cmd: 'POLAR', on: !!s.toggles.polar, icon: 'polar' }],
    [{ label: 'Zoom', icon: 'zoom', sub: [{ label: 'Zoom previous', key: 'Z P', cmd: 'Z P' }, { label: 'Zoom extents', key: 'ZE', cmd: 'ZE' }] }]
  );
}

/** The drawn objects (by kind label) and devices picked, counted: "3 Line · 2 Polyline · 4 devices". */
export function countLine(kinds: readonly string[], devices: number): string {
  const n = new Map<string, number>();
  for (const k of kinds) n.set(k, (n.get(k) ?? 0) + 1);
  const parts = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, c]) => `${c} ${k}`);
  if (devices) parts.push(`${devices} device${devices === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** ISOLATEOBJECTS / HIDEOBJECTS on a drawing: the keys hidden (Isolate hides every other object there was then, so what
 * is drawn afterwards shows). */
export interface ObjectHide { file: string; mode: 'isolate' | 'hide'; keys: readonly string[] }
export function shownBy(h: ObjectHide | null, file: string | undefined): (key: string) => boolean {
  if (!h || h.file !== file) return () => true;
  const set = new Set(h.keys);
  return (k) => !set.has(k);
}

/** ADDSELECTED: the tool that draws a new object like this one (a block is inserted by the page); none for an
 * attribute definition. */
export function addSelectedTool(it: SketchItem): CadTool | null {
  if (it.tray) return 'tray';
  if (it.cable) return 'cable';
  if (it.hatch) return 'hatch';
  if (it.cloud) return 'revcloud';
  if (it.infinite) return it.infinite;
  switch (it.kind) {
    case 'line': return 'line';
    case 'pline': return 'pline';
    case 'circle': return 'circle';
    case 'arc': return 'arc';
    case 'ellipse': return 'ellipse';
    case 'text': return 'text';
    case 'mtext': return 'mtext';
    case 'dim': return 'dim';
    case 'point': return 'point';
    case 'insert': return 'insert';
    default: return null;
  }
}

/** QUICKMEASURE: the total length of the objects picked (lines, polylines, arcs, circles) and the area inside the
 * closed ones (closed polylines and circles), in drawing units; `n` counts those measured. */
export function measureOf(items: readonly SketchItem[]): { length: number; area: number; n: number } {
  let length = 0, area = 0, n = 0;
  for (const it of items) {
    if (it.infinite || it.kind === 'text' || it.kind === 'mtext' || it.kind === 'dim' || it.kind === 'insert' || it.kind === 'point' || it.kind === 'attdef') continue;
    const l = itemLength(it);
    if (it.hatch) area += hatchArea(it); // its net area, islands taken out
    else area += closedArea(it); // a circle, or a closed polyline with its arc segments
    if (l > 0 || it.closed) { length += l; n += 1; }
  }
  return { length, area, n };
}
