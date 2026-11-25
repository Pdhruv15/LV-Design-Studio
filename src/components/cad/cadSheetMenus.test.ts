import { describe, expect, it } from 'vitest';
import { cadCommand } from './cadCommands';
import { allItems, isItem, type CtxEntry } from './cadContextMenu';
import { argOf, drawingObjectHead, drawingObjectMenu, drawingPaperMenu, paperMenu, REF_FADES, viewportHead, viewportMenu, xrefMenu } from './cadSheetMenus';
import { MENU_ICONS } from './cadMenuIcons';
import { SHEET_STATUSES } from '../../model/drawingSet';
import { VP_SCALES, type PlanViewport } from '../../model/planViewports';

const flat = allItems;
const labels = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : x.label));
const ref = { name: 'ARCH', fade: 50, print: true } as const;
const common = { canUndo: true, canRedo: false, propsOn: true, canPaste: false };
const vp: PlanViewport = { id: 'vp1', box: [10, 10, 200, 150], at: [5, 5], scale: 100 };

describe('right-click menus (phase 3): blocks, references and sheets', () => {
  it('every entry runs a typed command or a page action: none without a tool behind it', () => {
    const all = [drawingObjectMenu({ ...common, block: 'WC', picked: 1 }), drawingObjectMenu({ ...common, picked: 2 }), xrefMenu(ref), xrefMenu({ ...ref, clip: [[0, 0], [1, 0], [1, 1]], unloaded: true }), viewportMenu(vp), paperMenu({})];
    for (const x of all.flatMap(flat)) {
      if (x.icon) expect(MENU_ICONS[x.icon], x.icon).toBeTruthy();
      expect(x.label, x.label).not.toMatch(/[▸▾✓●]/);
      if (x.sub) continue;
      if (x.cmd) expect(cadCommand(x.cmd), x.cmd).toBeTruthy();
      else expect(x.act, x.label).toBeTruthy();
    }
  });

  it('an object of the opened drawing: Block tools (a block only), Undo, Redo, Erase, Pan, Zoom, Deselect all, Properties, Options', () => {
    expect(labels(drawingObjectMenu({ ...common, block: 'WC', picked: 1 }))).toEqual(['Block tools', '-', 'Undo', 'Redo', '-', 'Erase', '-', 'Pan', 'Zoom', '-', 'Deselect all', '-', 'Properties', 'Options…']);
    const tools = flat(drawingObjectMenu({ ...common, block: 'WC', picked: 1 })).find((x) => x.label === 'Block tools')!.sub!.filter(isItem);
    expect(tools.map((x) => x.label)).toEqual(['Count instances', 'Explode into drawn objects', 'Copy as a block of this drawing', 'Crop…']);
    expect(labels(drawingObjectMenu({ ...common, block: 'WC', picked: 3 }))).not.toContain('Block tools');
    expect(labels(drawingObjectMenu({ ...common, picked: 1 }))).not.toContain('Block tools');
    const m = flat(drawingObjectMenu({ ...common, picked: 1 }));
    expect([m.find((x) => x.label === 'Erase')!.bad, m.find((x) => x.label === 'Properties')!.on, m.find((x) => x.label === 'Redo')!.off]).toEqual([true, true, true]);
    // Zoom to selection only when the object's extents are known.
    expect(m.some((x) => x.label === 'Zoom to selection')).toBe(false);
    expect(flat(drawingObjectMenu({ ...common, picked: 1, zoomSel: true })).some((x) => x.label === 'Zoom to selection')).toBe(true);
  });

  it('the header of an object of the opened drawing: its kind and layer; several: how many', () => {
    expect(drawingObjectHead({ kind: 'Line', layer: 'A-WALL', picked: 1 })).toEqual({ icon: 'line', title: 'Line', detail: 'opened drawing · A-WALL' });
    expect(drawingObjectHead({ kind: 'Block', picked: 1 })).toMatchObject({ icon: 'insert', detail: 'opened drawing' });
    expect(drawingObjectHead({ kind: 'Line', picked: 3 })).toMatchObject({ icon: 'boxes', title: '3 picked' });
  });

  it('a reference: Open, Clip ▸, Fade ▸ (the fade now marked), Reload, Unload / Load, Detach, Bind, print, layers', () => {
    const m = xrefMenu(ref);
    expect(labels(m)).toEqual(['Open reference', '-', 'Clip', 'Fade', 'Compare with new revision…', 'Reload', 'Unload', 'Detach', 'Bind (save a copy)…', '-', 'Do not print on sheets', 'Reference layers…', '-', 'Properties (References palette)…']);
    const f = flat(m).find((x) => x.label === 'Fade')!.sub!.filter(isItem);
    expect(f.map((x) => [x.label, x.arg, !!x.off])).toEqual(REF_FADES.map((k) => [`${k} %`, `fade|${k}`, k === 50]));
    expect(flat(m).find((x) => x.label === 'Remove clip')!.off).toBe(true);
    expect(flat(m).find((x) => x.label === '50 %')).toMatchObject({ now: true, off: true });
    const u = xrefMenu({ ...ref, unloaded: true, print: false, clip: [[0, 0], [1, 0], [1, 1]] });
    expect(labels(u)).toContain('Load');
    expect(labels(u)).toContain('Print on sheets');
    expect(flat(u).find((x) => x.label === 'Remove clip')!.off).toBeUndefined();
  });

  it('a viewport: Activate, Show on the Model tab, Viewport scale ▸, Lock, Frame, layers, Erase, Plot, Page setup', () => {
    const m = viewportMenu(vp);
    expect(labels(m)).toEqual(['Activate (model space)', 'Show on the Model tab', '-', 'Viewport scale', 'Unlock display', 'Frame prints', 'Clip to an outline…', '-', 'Viewport layers…', '-', 'Erase viewport', '-', 'Plot this layout…', 'Page setup and title block…', '-', 'Properties']);
    expect(flat(m).find((x) => x.label === 'Viewport scale')!.sub!.filter(isItem).map((x) => [x.arg, !!x.off])).toEqual(VP_SCALES.map((k) => [`scale|${k}`, k === 100]));
    expect(flat(m).find((x) => x.label === 'Erase viewport')!.bad).toBe(true);
    expect(flat(viewportMenu(vp, VP_SCALES, true)).find((x) => x.label === 'Properties')!.on).toBe(true);
    expect(flat(m).find((x) => x.label === 'Properties')!.on).toBe(false);
    expect(viewportHead(vp)).toEqual({ icon: 'viewport', title: 'Viewport', detail: '1:100' });
    const mine = flat(viewportMenu(vp, [50, 75, 100])).find((x) => x.label === 'Viewport scale')!.sub!.filter(isItem).map((x) => x.label);
    expect(mine).toEqual(['1:50', '1:75', '1:100']);
    expect(flat(viewportMenu({ ...vp, scale: 250 }, [50, 100])).find((x) => x.label === 'Viewport scale')!.sub!.filter(isItem).map((x) => x.label)).toEqual(['1:50', '1:100', '1:250']); // a scale in use is listed
    const clipped = flat(viewportMenu({ ...vp, clip: [[0, 0], [1, 0], [0.5, 1]] })), off = flat(viewportMenu(vp)); // the outline can be taken off only when there is one
    expect(clipped.filter((x) => /outline/.test(x.label)).map((x) => [x.label, x.arg, x.key])).toEqual([['Clip to an outline…', 'clip', 'VPCLIP'], ['Remove the outline', 'unclip', undefined]]);
    expect(off.some((x) => x.label === 'Remove the outline')).toBe(false);
    expect(flat(drawingPaperMenu({ inside: true, editable: true, clipped: true })).filter((x) => /outline/.test(x.label)).map((x) => x.arg)).toEqual(['clip', 'unclip']);
    expect(flat(drawingPaperMenu({ inside: true, editable: true })).some((x) => x.label === 'Remove the outline')).toBe(false);
    expect(labels(viewportMenu({ ...vp, locked: false, frame: true }))).toEqual(expect.arrayContaining(['Lock display', 'Frame does not print']));
  });

  it('the paper: New viewport, Legend, Notes, Issue status ▸ (the sheet\'s marked), Sheet list, Plot, Page setup, Model tab', () => {
    const m = paperMenu({ status: 'FOR APPROVAL' });
    expect(labels(m)).toEqual(['New viewport', 'Arrange viewports', 'Legend table', 'Notes table', '-', 'Issue status', 'Sheet list', '-', 'Plot this layout…', 'Page setup and title block…', '-', 'Model tab']);
    const st = flat(m).find((x) => x.label === 'Issue status')!.sub!.filter(isItem);
    expect(st.map((x) => x.label)).toEqual(SHEET_STATUSES);
    expect(st.filter((x) => x.off).map((x) => x.label)).toEqual(['FOR APPROVAL']);
    expect(flat(m).find((x) => x.label === 'New viewport')!.arg).toBe('cmd|MV');
    const arr = flat(m).find((x) => x.label === 'Arrange viewports')!.sub!.filter(isItem);
    expect(arr).toHaveLength(9);
    expect(st.find((x) => x.label === 'FOR APPROVAL')).toMatchObject({ now: true });
    expect(arr.filter((x) => x.label === 'Two: side by side').map((x) => x.arg)).toEqual(['cmd|VPORTS 2V']);
  });

  it('a layout of the drawing, inside a viewport of one made here: activate, Model tab, scale ▸, lock, frame, erase, plot, page setup', () => {
    const m = drawingPaperMenu({ inside: true, editable: true, scale: 100, scales: [50, 100], locked: false, frame: false });
    expect(labels(m)).toEqual(['Activate (model space)', 'Show on the Model tab', '-', 'Viewport scale', 'Lock display', 'Frame prints', 'Clip to an outline…', '-', 'Erase viewport', '-', 'Plot this layout…', 'Page setup…']);
    expect(flat(m).find((x) => x.label === 'Activate (model space)')).toMatchObject({ act: 'fpaper', arg: 'ms', key: 'Dbl-click' });
    expect(flat(m).find((x) => x.label === 'Show on the Model tab')!.arg).toBe('max');
    expect(flat(m).find((x) => x.label === 'Viewport scale')!.sub!.filter(isItem).map((x) => [x.arg, !!x.off])).toEqual([['scale|50', false], ['scale|100', true]]);
    expect(flat(m).find((x) => x.label === 'Lock display')).toMatchObject({ arg: 'lock', key: 'VPLOCK' });
    expect(flat(m).find((x) => x.label === 'Erase viewport')).toMatchObject({ arg: 'erase', bad: true });
    expect(flat(m).find((x) => x.label === 'Plot this layout…')).toMatchObject({ arg: 'cmd|PLOT', key: 'PLOT' });
    expect(flat(m).find((x) => x.label === 'Page setup…')!.arg).toBe('cmd|PAGESETUP');
    const on = drawingPaperMenu({ inside: true, editable: true, locked: true, frame: true });
    expect(labels(on)).toEqual(expect.arrayContaining(['Unlock display', 'Frame does not print']));
    expect(flat(drawingPaperMenu({ inside: true, editable: true, scale: 250, scales: [50, 100] })).find((x) => x.label === 'Viewport scale')!.sub!.filter(isItem).map((x) => x.label)).toEqual(['1:50', '1:100', '1:250']); // a scale in use is listed
  });

  it('a layout of the drawing, inside a viewport of the file\'s own layout: only what shows it, plots it and gets away', () => {
    const m = drawingPaperMenu({ inside: true, editable: false });
    expect(labels(m)).toEqual(['Show on the Model tab', '-', 'Plot this layout…', '-', 'New layout', 'Model tab']);
  });

  it('a layout of the drawing, on the paper: one made here has New viewport, Arrange, Plot, Page setup, New layout, From another drawing…, Layout manager…, Rename, Copy, Delete; the file\'s own has Plot, New layout, From another drawing…, Layout manager…', () => {
    const m = drawingPaperMenu({ inside: false, editable: true });
    expect(labels(m)).toEqual(['New viewport', 'Arrange viewports', '-', 'Plot this layout…', 'Page setup…', '-', 'New layout', 'From another drawing…', 'Layout manager…', 'Rename layout…', 'Copy layout', 'Delete layout', '-', 'Model tab']);
    expect(flat(m).find((x) => x.label === 'New viewport')).toMatchObject({ arg: 'cmd|MV', key: 'MV' });
    expect(flat(m).find((x) => x.label === 'From another drawing…')!.arg).toBe('cmd|LAYOUT I');
    expect(flat(m).find((x) => x.label === 'Layout manager…')!.arg).toBe('cmd|LAYOUTMANAGER');
    expect(flat(m).find((x) => x.label === 'Arrange viewports')!.sub).toHaveLength(9);
    expect(flat(m).find((x) => x.label === 'Delete layout')).toMatchObject({ bad: true, icon: 'delete' });
    const own = drawingPaperMenu({ inside: false, editable: false });
    expect(labels(own)).toEqual(['Plot this layout…', '-', 'New layout', 'From another drawing…', 'Layout manager…', '-', 'Model tab']);
  });

  it('every entry of the layout menus runs a typed command or a page action', () => {
    for (const x of [true, false].flatMap((inside) => [true, false].flatMap((editable) => flat(drawingPaperMenu({ inside, editable }))))) {
      if (x.sub) continue;
      if (x.cmd) expect(cadCommand(x.cmd.split(' ')[0]), x.cmd).toBeTruthy();
      else expect(x.act, x.label).toBeTruthy();
    }
  });

  it('argOf: the action and its value back from the entry', () => {
    expect(argOf('status|FOR APPROVAL')).toEqual({ action: 'status', value: 'FOR APPROVAL' });
    expect(argOf('reload')).toEqual({ action: 'reload' });
  });
});
