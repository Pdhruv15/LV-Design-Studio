import { OSNAP_MODES, type OsnapMode } from '../../model/cadDraft';
import { itemLength } from '../../model/cadCrop';
import { polygonArea } from '../../model/cadBoundary';
import type { SketchItem } from '../../types';
import type { CadTool } from './cadState';

/** Design CAD: the right-click menus on the drawing (phase 1 of the context-menu plan, docs/notes/Future development/
 * UI UX proposals - 2026-11-11 - Context-aware right-click menus.md). Pure: each entry runs a typed command (`cmd`,
 * which must be one of CAD_COMMANDS, so every entry has a working tool behind it) or a page action (`act`); the page
 * turns them into clicks. */

export type CtxAct = 'repeat' | 'properties' | 'enter' | 'cancel' | 'option' | 'input' | 'snap' | 'deselect' | 'dev' | 'room' | 'dw' | 'xref' | 'vp' | 'paper' | 'grip' | 'fpaper';
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
  /** A flyout (▸). */
  sub?: CtxItem[];
}
/** An entry, or a separator. */
export type CtxEntry = CtxItem | '-';

/** No separator first, last or twice in a row; empty flyouts dropped. */
export function tidy(list: CtxEntry[]): CtxEntry[] {
  const out: CtxEntry[] = [];
  for (const x of list) {
    if (x === '-') { if (out.length && out[out.length - 1] !== '-') out.push(x); continue; }
    if (x.sub && !x.sub.length) continue;
    out.push(x);
  }
  while (out[out.length - 1] === '-') out.pop();
  return out;
}

/** Repeat (the last command) and Recent commands ▸ (the ones before it). */
function recentEntries(recent: readonly string[]): CtxEntry[] {
  if (!recent.length) return [];
  return [{ label: `Repeat ${recent[0]}`, key: 'Enter', act: 'repeat', arg: '0' },
    { label: 'Recent commands', sub: recent.slice(1, 7).map((r, i) => ({ label: r, act: 'repeat' as const, arg: String(i + 1) })) }];
}

export interface BlankState {
  /** The recent commands, newest first. */
  recent: readonly string[];
  canPaste: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Objects are isolated or hidden (End object isolation is then on). */
  objectsHidden: boolean;
}

/** Right-click on empty space, with no command and nothing picked. */
export function blankMenu(s: BlankState): CtxEntry[] {
  return tidy([
    ...recentEntries(s.recent), '-',
    { label: 'Paste', key: 'Ctrl+V', cmd: 'PASTECLIP', off: !s.canPaste },
    { label: 'Paste to original coordinates', cmd: 'PASTEORIG', off: !s.canPaste }, '-',
    { label: 'Undo', key: 'Ctrl+Z', cmd: 'UNDO', off: !s.canUndo },
    { label: 'Redo', key: 'Ctrl+Y', cmd: 'REDO', off: !s.canRedo }, '-',
    { label: 'Isolate', sub: [{ label: 'End object isolation', cmd: 'UNISOLATEOBJECTS', off: !s.objectsHidden }, { label: 'Layers back as before Isolate', cmd: 'LAYUNISO' }] },
    { label: 'Pan', key: 'P', cmd: 'PAN' },
    { label: 'Zoom window', key: 'Z W', cmd: 'Z W' },
    { label: 'Zoom previous', key: 'Z P', cmd: 'Z P' },
    { label: 'Zoom extents', key: 'ZE', cmd: 'ZE' }, '-',
    { label: 'Select all', key: 'Ctrl+A', cmd: 'SELECTALL' },
    { label: 'Quick select…', cmd: 'QSELECT' },
    { label: 'Count', cmd: 'COUNT' }, '-',
    { label: 'Place device', key: 'DEV', cmd: 'DEV' },
    { label: 'Cable route', key: 'CR', cmd: 'CR' },
    { label: 'Cable tray', key: 'CT', cmd: 'CT' }, '-',
    { label: 'Properties', key: 'Ctrl+1', act: 'properties' },
    { label: 'Options…', key: 'DS', cmd: 'DSETTINGS' }
  ]);
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
  const on = (b?: boolean) => (b ? ' · on' : '');
  return tidy([
    { label: 'Enter', key: 'Enter', act: 'enter' },
    { label: 'Cancel', key: 'Esc', act: 'cancel' }, '-',
    { label: 'Recent input', sub: s.inputs.slice(0, 8).map((v) => ({ label: v, act: 'input' as const, arg: v })) }, '-',
    ...s.options.map((o): CtxItem => ({ label: o.option, key: o.key, act: 'option', arg: o.key })), '-',
    { label: 'Snap overrides', sub: SNAP_OVERRIDES.map((m) => ({ label: m.label, act: 'snap' as const, arg: m.mode, key: s.snapOnce === m.mode ? 'next' : undefined })) },
    { label: 'Object snap', key: `F3${on(s.toggles.osnap)}`, cmd: 'OSNAP' },
    { label: 'Ortho', key: `F8${on(s.toggles.ortho)}`, cmd: 'ORTHO' },
    { label: 'Polar tracking', key: `F10${on(s.toggles.polar)}`, cmd: 'POLAR' }, '-',
    { label: 'Zoom previous', key: 'Z P', cmd: 'Z P' },
    { label: 'Zoom extents', key: 'ZE', cmd: 'ZE' }
  ]);
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
    if (it.kind === 'text' || it.kind === 'mtext' || it.kind === 'dim' || it.kind === 'insert' || it.kind === 'point' || it.kind === 'attdef') continue;
    const l = itemLength(it);
    if (it.kind === 'circle') area += Math.PI * (it.r ?? 0) ** 2;
    else if (it.closed && it.pts.length > 2) area += Math.abs(polygonArea(it.pts));
    if (l > 0 || it.closed) { length += l; n += 1; }
  }
  return { length, area, n };
}
