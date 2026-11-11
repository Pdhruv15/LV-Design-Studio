import { describe, expect, it } from 'vitest';
import { addSelectedTool, blankMenu, commandMenu, countLine, measureOf, shownBy, SNAP_OVERRIDES, tidy, type CtxEntry, type CtxItem } from './cadContextMenu';
import { cadCommand } from './cadCommands';
import type { SketchItem } from '../../types';

const items = (list: CtxEntry[]): CtxItem[] => list.flatMap((x) => (x === '-' ? [] : [x, ...(x.sub ?? [])]));
const labels = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : x.label));
const blank = blankMenu({ recent: ['LINE', 'MOVE', 'GRID'], canPaste: false, canUndo: true, canRedo: false, objectsHidden: false });
const cmdMenu = commandMenu({ options: [{ option: 'Close', key: 'C' }, { option: 'Undo', key: 'U' }], inputs: ['2.5', '@1,0'], toggles: { ortho: true, polar: false, osnap: true }, snapOnce: 'midpoint' });

describe('right-click menus (phase 1)', () => {
  it('every entry runs a command the command line knows, or a page action: no entry without a tool behind it', () => {
    for (const x of [...items(blank), ...items(cmdMenu)]) {
      if (x.sub) continue;
      if (x.cmd) expect(cadCommand(x.cmd), x.cmd).toBeTruthy();
      else expect(x.act, x.label).toBeTruthy();
    }
  });

  it('the blank-canvas menu: Repeat and Recent commands ▸, Paste off with nothing to paste, Undo / Redo as the history has them', () => {
    expect(labels(blank)).toEqual(['Repeat LINE', 'Recent commands', '-', 'Paste', 'Paste to original coordinates', '-', 'Undo', 'Redo', '-', 'Isolate', 'Pan', 'Zoom window', 'Zoom previous', 'Zoom extents', '-',
      'Select all', 'Quick select…', 'Count', '-', 'Place device', 'Cable route', 'Cable tray', '-', 'Properties', 'Options…']);
    const by = (l: string) => items(blank).find((x) => x.label === l)!;
    expect(by('Recent commands').sub!.map((x) => [x.label, x.arg])).toEqual([['MOVE', '1'], ['GRID', '2']]);
    expect([by('Paste').off, by('Undo').off, by('Redo').off, by('End object isolation').off]).toEqual([true, false, true, true]);
    expect(labels(blankMenu({ recent: [], canPaste: true, canUndo: false, canRedo: false, objectsHidden: true })).slice(0, 2)).toEqual(['Paste', 'Paste to original coordinates']);
  });

  it('the command menu: Enter, Cancel, Recent input ▸, the prompt options, Snap overrides ▸ (the one chosen marked next) and the switches as they are', () => {
    expect(labels(cmdMenu)).toEqual(['Enter', 'Cancel', '-', 'Recent input', '-', 'Close', 'Undo', '-', 'Snap overrides', 'Object snap', 'Ortho', 'Polar tracking', '-', 'Zoom previous', 'Zoom extents']);
    const by = (l: string) => items(cmdMenu).find((x) => x.label === l)!;
    expect(by('Recent input').sub!.map((x) => x.arg)).toEqual(['2.5', '@1,0']);
    expect(by('Close')).toMatchObject({ act: 'option', arg: 'C', key: 'C' });
    expect(by('Snap overrides').sub!.map((x) => x.label)).toEqual(SNAP_OVERRIDES.map((m) => m.label));
    expect(by('Midpoint').key).toBe('next');
    expect([by('Ortho').key, by('Polar tracking').key]).toEqual(['F8 · on', 'F10']);
    // No values typed yet and no options: neither shows.
    expect(labels(commandMenu({ options: [], inputs: [], toggles: {} })).slice(0, 4)).toEqual(['Enter', 'Cancel', '-', 'Snap overrides']);
  });

  it('tidy: no separator first, last or twice, and no empty flyout', () => {
    expect(labels(tidy(['-', { label: 'A' }, '-', '-', { label: 'B', sub: [] }, { label: 'C' }, '-']))).toEqual(['A', '-', 'C']);
  });

  it('COUNT: by kind, most first; devices after', () => {
    expect(countLine(['Line', 'Polyline', 'Line', 'Circle'], 3)).toBe('2 Line · 1 Circle · 1 Polyline · 3 devices');
    expect(countLine([], 1)).toBe('1 device');
  });

  it('ISOLATEOBJECTS / HIDEOBJECTS: the keys hidden on their drawing only', () => {
    const f = shownBy({ file: 'a.dwg', mode: 'hide', keys: ['sk:1', 'dev:2'] }, 'a.dwg');
    expect([f('sk:1'), f('dev:2'), f('sk:3')]).toEqual([false, false, true]);
    expect(shownBy({ file: 'a.dwg', mode: 'hide', keys: ['sk:1'] }, 'b.dwg')('sk:1')).toBe(true);
    expect(shownBy(null, 'a.dwg')('sk:1')).toBe(true);
  });

  it('ADDSELECTED: the tool that draws the same kind', () => {
    const it0 = (x: Partial<SketchItem>) => ({ id: 'x', layer: '0', pts: [[0, 0], [1, 0]], kind: 'line', ...x }) as SketchItem;
    expect([it0({}), it0({ kind: 'pline' }), it0({ kind: 'pline', tray: { widthMm: 300 } }), it0({ kind: 'pline', cable: { feederId: 'F1' } }), it0({ kind: 'pline', closed: true, cloud: 5 }),
      it0({ kind: 'circle', r: 1 }), it0({ kind: 'text' }), it0({ kind: 'insert', block: 'B' }), it0({ kind: 'attdef' })].map(addSelectedTool))
      .toEqual(['line', 'pline', 'tray', 'cable', 'revcloud', 'circle', 'text', 'insert', null]);
  });

  it('QUICKMEASURE: total length, and the area inside closed polylines and circles; texts are not measured', () => {
    const sq = { id: 'a', layer: '0', kind: 'pline', closed: true, pts: [[0, 0], [2, 0], [2, 2], [0, 2]] } as SketchItem;
    const ln = { id: 'b', layer: '0', kind: 'line', pts: [[0, 0], [3, 4]] } as SketchItem;
    const c = { id: 'c', layer: '0', kind: 'circle', pts: [[0, 0]], r: 1 } as SketchItem;
    const t = { id: 'd', layer: '0', kind: 'text', pts: [[0, 0]], text: 'x' } as SketchItem;
    const q = measureOf([sq, ln, c, t]);
    expect([q.n, +q.length.toFixed(4), +q.area.toFixed(4)]).toEqual([3, +(8 + 5 + 2 * Math.PI).toFixed(4), +(4 + Math.PI).toFixed(4)]);
  });
});
