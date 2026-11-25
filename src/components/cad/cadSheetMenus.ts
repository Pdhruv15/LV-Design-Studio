import { SHEET_STATUSES } from '../../model/drawingSet';
import { isLocked, VP_ARRANGEMENTS, VP_SCALES, type PlanViewport } from '../../model/planViewports';
import type { CadRef } from '../../model/cadRefs';
import { groups, paletteGroup, tidy, undoEntries, zoomList, type CtxAct, type CtxEntry, type CtxHead, type CtxIcon, type CtxItem, type MenuCommon } from './cadContextMenu';

/** Design CAD: the right-click menus of blocks, references and sheets (phase 3 of the context-menu plan, docs/notes/
 * Future development/UI UX proposals - 2026-11-11 - Context-aware right-click menus.md): a block of the opened drawing,
 * a reference drawing, a viewport and the paper of a layout. Pure, as cadContextMenu.ts: each entry is a typed command
 * (`cmd`) or a page action (`act`, its `arg` "action|value"). Blocks drawn here use the drawn-object menu
 * (SketchEditPanel.tsx). */

const item = (act: CtxAct, label: string, action: string, value?: string, key?: string, off?: boolean, more: Partial<CtxItem> = {}): CtxItem =>
  ({ label, act, arg: value === undefined ? action : `${action}|${value}`, ...(key ? { key } : {}), ...(off ? { off } : {}), ...more });
/** "action|value" back into the action and its value. */
export function argOf(arg: string): { action: string; value?: string } {
  const i = arg.indexOf('|');
  return i < 0 ? { action: arg } : { action: arg.slice(0, i), value: arg.slice(i + 1) };
}
/** A list's value: the current one is marked (and off, as it is chosen already). */
const val = (x: CtxItem, now: boolean): CtxItem => (now ? { ...x, now: true, off: true } : x);
const ICON_OF: Record<string, CtxIcon> = { Line: 'line', Polyline: 'pline', 'Closed polyline': 'pline', Circle: 'circle', Arc: 'arc', Ellipse: 'ellipse', Text: 'text', Note: 'mtext', Multileader: 'mtext', Block: 'insert', Hatch: 'hatch', Point: 'point', Dimension: 'dim' };

/** The header of an object of the opened drawing picked: its kind, and its layer. */
export function drawingObjectHead(s: { kind: string; layer?: string; picked: number }): CtxHead {
  if (s.picked !== 1) return { icon: 'boxes', title: `${s.picked} picked`, detail: 'opened drawing' };
  return { icon: ICON_OF[s.kind] ?? 'line', title: s.kind, detail: s.layer ? `opened drawing · ${s.layer}` : 'opened drawing' };
}

/** An object of the opened drawing (the architect's) picked: a block of it, or another object. Its own part of the
 * one order: Block tools, Undo and Redo, Erase, Pan and Zoom, Deselect all, Properties and Options. */
export function drawingObjectMenu(s: MenuCommon & { block?: string; picked: number; zoomSel?: boolean }): CtxEntry[] {
  const dw = (label: string, action: string, key?: string, icon?: CtxIcon) => item('dw', label, action, undefined, key, undefined, icon ? { icon } : {});
  return groups(
    s.block && s.picked === 1 ? [{ label: 'Block tools', icon: 'tools', sub: [dw('Count instances', 'count'), dw('Explode into drawn objects', 'explode', 'X'), dw('Copy as a block of this drawing', 'copyblock', 'INSERT'), dw('Crop…', 'crop', 'CROP')] }] : [],
    undoEntries(s),
    [{ label: 'Erase', key: 'Del', cmd: 'ERASE', bad: true, icon: 'erase' }],
    [{ label: 'Pan', key: 'P', cmd: 'PAN', icon: 'pan' }, zoomList(!!s.zoomSel)],
    [{ label: 'Deselect all', key: 'Esc', act: 'deselect', icon: 'deselect' }],
    paletteGroup(s)
  );
}

/** The fades offered (%), as the References palette has them. */
export const REF_FADES = [0, 25, 50, 70, 90];

/** A reference drawing under the cursor. */
export function xrefMenu(r: Pick<CadRef, 'name' | 'clip' | 'fade' | 'unloaded' | 'print'>): CtxEntry[] {
  const x = (label: string, action: string, value?: string, key?: string, off?: boolean, icon?: CtxIcon) => item('xref', label, action, value, key, off, icon ? { icon } : {});
  return tidy([
    x('Open reference', 'open', undefined, undefined, undefined, 'open'), '-',
    { label: 'Clip', icon: 'crop', sub: [x('New boundary', 'clip', undefined, 'XCLIP'), x('Remove clip', 'unclip', undefined, undefined, !r.clip)] },
    { label: 'Fade', sub: REF_FADES.map((f) => val(x(`${f} %`, 'fade', String(f)), r.fade === f)) },
    x('Compare with new revision…', 'compare', undefined, 'XCOMPARE'), x('Detect rooms from walls', 'rooms', undefined, 'DETECTROOMS'), x('Reload', 'reload', undefined, undefined, undefined, 'reload'),
     x(r.unloaded ? 'Load' : 'Unload', 'unload', undefined, undefined, undefined, 'unload'), x('Detach', 'detach', undefined, undefined, undefined, 'detach'), x('Bind (save a copy)…', 'bind', undefined, undefined, undefined, 'bind'), '-',
    x(r.print ? 'Do not print on sheets' : 'Print on sheets', 'print', undefined, undefined, undefined, 'print'), x('Reference layers…', 'layers', undefined, 'LM', undefined, 'layers'), '-',
    x('Properties (References palette)…', 'manager', undefined, 'XR', undefined, 'references')
  ]);
}

/** Right-click inside a viewport frame on a layout (on the paper, not working in it). */
export function viewportMenu(v: PlanViewport, scales: number[] = VP_SCALES, propsOn = false): CtxEntry[] {
  const vp = (label: string, action: string, value?: string, key?: string, off?: boolean, more: Partial<CtxItem> = {}) => item('vp', label, action, value, key, off, more);
  return tidy([
    vp('Activate (model space)', 'ms', undefined, 'Dbl-click', undefined, { icon: 'activate' }), vp('Show on the Model tab', 'max', undefined, undefined, undefined, { icon: 'expand' }), '-',
    { label: 'Viewport scale', icon: 'scale', sub: (scales.includes(v.scale) ? scales : [...scales, v.scale].sort((a, b) => a - b)).map((k) => val(vp(`1:${k}`, 'scale', String(k)), v.scale === k)) },
    isLocked(v) ? vp('Unlock display', 'lock', undefined, 'VPLOCK', undefined, { icon: 'unlock' }) : vp('Lock display', 'lock', undefined, 'VPLOCK', undefined, { icon: 'lock' }),
    vp(v.frame ? 'Frame does not print' : 'Frame prints', 'frame', undefined, undefined, undefined, { icon: 'frame' }), vp('Clip to an outline…', 'clip', undefined, 'VPCLIP', undefined, { icon: 'crop' }), ...(v.clip ? [vp('Remove the outline', 'unclip')] : []), '-',
    vp('Viewport layers…', 'layers', undefined, 'LM', undefined, { icon: 'layers' }), '-',
    vp('Erase viewport', 'erase', undefined, 'Del', undefined, { icon: 'erase', bad: true }), '-',
    item('paper', 'Plot this layout…', 'cmd', 'PLOT', 'PLOT', undefined, { icon: 'plot' }), item('paper', 'Page setup and title block…', 'cmd', 'PAGESETUP', undefined, undefined, { icon: 'pagesetup' }), '-',
    { label: 'Properties', key: 'Ctrl+1', act: 'properties', on: propsOn, icon: 'properties' }
  ]);
}

/** The header of the viewport under the cursor. */
export const viewportHead = (v: Pick<PlanViewport, 'scale'>): CtxHead => ({ icon: 'viewport', title: 'Viewport', detail: `1:${v.scale}` });

/** Right-click on the paper of a layout, outside the viewports: new viewport and tables, the sheet's issue status and the
 * sheet list, plot. Layout commands (MV, LEGEND, PLOT…) are read on the page, so they run as 'paper' actions. */
export function paperMenu(s: { status?: string }): CtxEntry[] {
  const pp = (label: string, action: string, value?: string, key?: string, off?: boolean, icon?: CtxIcon) => item('paper', label, action, value, key, off, icon ? { icon } : {});
  return tidy([
    pp('New viewport', 'cmd', 'MV', 'MV', undefined, 'plus'), { label: 'Arrange viewports', icon: 'arrangevp', sub: VP_ARRANGEMENTS.map((a) => pp(a.label, 'cmd', `VPORTS ${a.id}`)) }, pp('Legend table', 'cmd', 'LEGEND', 'LEGEND', undefined, 'legend'), pp('Notes table', 'cmd', 'NOTES', 'NOTES', undefined, 'notes'), '-',
    { label: 'Issue status', icon: 'status', sub: SHEET_STATUSES.map((st) => val(pp(st, 'status', st), s.status === st)) },
    pp('Sheet list', 'register', undefined, undefined, undefined, 'sheets'), '-',
    pp('Plot this layout…', 'cmd', 'PLOT', 'PLOT', undefined, 'plot'), pp('Page setup and title block…', 'cmd', 'PAGESETUP', undefined, undefined, 'pagesetup'), '-',
    pp('Model tab', 'cmd', 'MODEL', 'MODEL', undefined, 'model')
  ]);
}

/** Right-click on a layout of the drawing (its own, from the file, or one made here with +): the model through a
 * viewport, its scale, display lock and frame (one made here), the layout itself, and the Model tab. The file's own
 * layouts are still shown as saved: their viewports are not changed here; layouts made here are. */
export function drawingPaperMenu(s: { inside: boolean; editable: boolean; scale?: number; scales?: number[]; locked?: boolean; frame?: boolean; clipped?: boolean }): CtxEntry[] {
  const scales = s.scales ?? VP_SCALES;
  const fp = (label: string, action: string, value?: string, key?: string, off?: boolean, more: Partial<CtxItem> = {}) => item('fpaper', label, action, value, key, off, more);
  if (s.inside && s.editable) {
    return tidy([
      fp('Activate (model space)', 'ms', undefined, 'Dbl-click', undefined, { icon: 'activate' }), fp('Show on the Model tab', 'max', undefined, undefined, undefined, { icon: 'expand' }), '-',
      { label: 'Viewport scale', icon: 'scale', sub: (s.scale && !scales.includes(s.scale) ? [...scales, s.scale].sort((a, b) => a - b) : scales).map((k) => val(fp(`1:${k}`, 'scale', String(k)), s.scale === k)) },
      s.locked ? fp('Unlock display', 'lock', undefined, 'VPLOCK', undefined, { icon: 'unlock' }) : fp('Lock display', 'lock', undefined, 'VPLOCK', undefined, { icon: 'lock' }),
      fp(s.frame ? 'Frame does not print' : 'Frame prints', 'frame', undefined, undefined, undefined, { icon: 'frame' }), fp('Clip to an outline…', 'clip', undefined, 'VPCLIP', undefined, { icon: 'crop' }), ...(s.clipped ? [fp('Remove the outline', 'unclip')] : []), '-',
      fp('Erase viewport', 'erase', undefined, undefined, undefined, { icon: 'erase', bad: true }), '-',
      fp('Plot this layout…', 'cmd', 'PLOT', 'PLOT', undefined, { icon: 'plot' }), fp('Page setup…', 'cmd', 'PAGESETUP', undefined, undefined, { icon: 'pagesetup' })
    ]);
  }
  if (s.inside) return tidy([fp('Show on the Model tab', 'max', undefined, undefined, undefined, { icon: 'expand' }), '-', fp('Plot this layout…', 'cmd', 'PLOT', 'PLOT', undefined, { icon: 'plot' }), '-', fp('New layout', 'cmd', 'LAYOUT', 'LAYOUT', undefined, { icon: 'newlayout' }), fp('Model tab', 'cmd', 'MODEL', 'MODEL', undefined, { icon: 'model' })]);
  if (s.editable) {
    return tidy([
      fp('New viewport', 'cmd', 'MV', 'MV', undefined, { icon: 'plus' }), { label: 'Arrange viewports', icon: 'arrangevp', sub: VP_ARRANGEMENTS.map((a) => fp(a.label, 'cmd', `VPORTS ${a.id}`)) }, '-',
      fp('Plot this layout…', 'cmd', 'PLOT', 'PLOT', undefined, { icon: 'plot' }), fp('Page setup…', 'cmd', 'PAGESETUP', 'PAGESETUP', undefined, { icon: 'pagesetup' }), '-',
      fp('New layout', 'cmd', 'LAYOUT', 'LAYOUT', undefined, { icon: 'newlayout' }), fp('From another drawing…', 'cmd', 'LAYOUT I', undefined, undefined, { icon: 'fromfile' }), fp('Layout manager…', 'cmd', 'LAYOUTMANAGER', undefined, undefined, { icon: 'layouts' }), fp('Rename layout…', 'rename', undefined, undefined, undefined, { icon: 'rename' }), fp('Copy layout', 'copy', undefined, undefined, undefined, { icon: 'copy' }), fp('Delete layout', 'delete', undefined, undefined, undefined, { icon: 'delete', bad: true }), '-',
      fp('Model tab', 'cmd', 'MODEL', 'MODEL', undefined, { icon: 'model' })
    ]);
  }
  return tidy([fp('Plot this layout…', 'cmd', 'PLOT', 'PLOT', undefined, { icon: 'plot' }), '-', fp('New layout', 'cmd', 'LAYOUT', 'LAYOUT', undefined, { icon: 'newlayout' }), fp('From another drawing…', 'cmd', 'LAYOUT I', undefined, undefined, { icon: 'fromfile' }), fp('Layout manager…', 'cmd', 'LAYOUTMANAGER', undefined, undefined, { icon: 'layouts' }), '-', fp('Model tab', 'cmd', 'MODEL', 'MODEL', undefined, { icon: 'model' })]);
}
