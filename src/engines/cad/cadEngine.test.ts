// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { drawingWithDevices, dxfToDwg, INK, openDrawing, readRefGeometry, SNAP, type CadView } from './cadEngine';
import { placeRefExtras, type CadRef } from '../../model/cadRefs';
import { buildSheetDxfPages } from '../../docs/sheetDxf';
import { sampleProject } from '../../data/sampleProject';
import { shapesOut } from '../../model/cadSketch';
import type { SketchItem } from '../../types';

const root = path.resolve(__dirname, '../../..');
const bytes = (rel: string) => new Uint8Array(readFileSync(path.join(root, rel)));
let gf: CadView;

beforeAll(async () => {
  // The desktop app hands the engine over; the same bytes the web version fetches.
  (window as { lvds?: unknown }).lvds = { cadFile: { engine: async () => bytes('electron/cad/lvds_cad_reader_bg.wasm') } };
  gf = await openDrawing('sample-villa-gf.dxf', bytes('electron/samples/sample-villa-gf.dxf'));
});

describe('CAD engine (Rust, WebAssembly)', () => {
  it('opens a DXF with its layers, colours and full extents', () => {
    expect(gf.info.format).toBe('DXF');
    expect(gf.info.units).toBe(4);
    const wall = gf.info.layers.find((l) => l.name === 'A-WALL')!;
    expect(wall.rgb).toBe(0x808080); // colour 8
    expect(gf.info.layers.find((l) => l.name === 'A-ROOM-NAME')!.rgb).toBe(INK); // colour 7
    expect(gf.info.extents.map(Math.round)).toEqual([-100, -1800, 16100, 12100]);
    expect(gf.segs.length).toBe(gf.info.segments * 4);
  });

  it('draws blocks as drawn: lights, sockets and boards expanded, attributes as texts', () => {
    const light = gf.info.layers.findIndex((l) => l.name === 'E-LIGHT');
    expect(gf.segLayers.filter((l) => l === light).length).toBeGreaterThan(1000);
    expect(gf.info.texts.some((t) => t.s === 'SMDB-GF')).toBe(true);
    expect(gf.info.texts.some((t) => t.s === 'MAJLIS' && t.h === 300)).toBe(true);
  });

  it('snaps to endpoints, midpoints, centres and intersections, on shown layers only', async () => {
    const on = new Uint8Array(gf.info.layers.length).fill(1);
    expect(Array.from(await gf.snap(110, 90, 50, SNAP.endpoint, on))).toEqual([100, 100, SNAP.endpoint]);
    // The inside face of the front wall runs 0–6200 mm (the entrance is at 6200): its midpoint is at 3100.
    expect(Array.from(await gf.snap(3120, 120, 60, SNAP.midpoint, on))).toEqual([3100, 100, SNAP.midpoint]);
    // The first living room light (a block) has its circle's centre at 6687.5, 7375.
    expect(Array.from(await gf.snap(6700, 7390, 100, SNAP.center, on))).toEqual([6687.5, 7375, SNAP.center]);
    const x = await gf.snap(5000 - 50, 4450, 30, SNAP.intersection, on);
    expect(x[2]).toBe(SNAP.intersection);
    const off = on.slice();
    off[gf.info.layers.findIndex((l) => l.name === 'A-WALL')] = 0;
    expect(Array.from(await gf.snap(-10, -90, 50, SNAP.endpoint, on))).toEqual([0, -100, SNAP.endpoint]);
    expect(Array.from(await gf.snap(-10, -90, 50, SNAP.endpoint, off))).toEqual([]); // the outside face of the wall: only on A-WALL
  });

  it('snaps to the nearest point on a line, and the perpendicular from the last point picked', async () => {
    const on = new Uint8Array(gf.info.layers.length).fill(1);
    // The inside face of the front wall (y = 100, x 0–6200).
    expect(Array.from(await gf.snap(2400, 130, 60, SNAP.nearest, on))).toEqual([2400, 100, SNAP.nearest]);
    expect(Array.from(await gf.snap(2450, 130, 60, SNAP.perpendicular, on, [2400, 2000]))).toEqual([2400, 100, SNAP.perpendicular]);
    expect(Array.from(await gf.snap(2450, 130, 60, SNAP.perpendicular, on))).toEqual([]); // no last point
  });

  it('opens a DWG and refuses a broken file with a clear message', async () => {
    const dwg = await openDrawing('plan.dwg', bytes('tests/fixtures/cad/plan-2018.dwg'));
    expect(dwg.info.format).toBe('DWG');
    expect(dwg.info.segments).toBeGreaterThan(100);
    await expect(openDrawing('x.dwg', new TextEncoder().encode('AC1032 broken'))).rejects.toThrow(/could not be read/);
    await expect(openDrawing('x.txt', new Uint8Array([1]))).rejects.toThrow(/not a DWG or DXF/);
  });

  it('lists the blocks inserted with their attributes, for Loads from CAD', () => {
    const blocks = gf.blocks();
    expect(blocks.filter((b) => b.block === 'L1' && b.attributes.CCT === 'DB-GF1/R1')).toHaveLength(8);
    expect(blocks.find((b) => b.block === 'DB-PANEL' && b.attributes.TAG === 'DB-GF1')).toMatchObject({ layer: 'E-BOARD' });
  });

  it('reads linetypes (with LTSCALE) and hatches: solid ones filled, pattern ones with their lines', async () => {
    const d = await openDrawing('linetypes-hatches.dxf', bytes('tests/fixtures/cad/linetypes-hatches.dxf'));
    expect(d.info.linetypes).toEqual([[], [20, -10]]);
    expect([...d.segLinetypes.slice(0, 2)]).toEqual([1, 0]); // the dashed line, then the plain one
    expect(d.segLinetypes.length).toBe(d.segLayers.length);
    expect(d.info.fills.map((f) => [f.solid, f.loops.length, f.lines.length])).toEqual([[true, 1, 0], [false, 1, 1]]);
    expect(d.info.fills[1].lines[0].angle).toBeCloseTo(Math.PI / 4);
    expect(gf.info.fills).toEqual([]); // the sample villa has none
  });

  it('keeps a reference\'s texts and fills, and Bind saves them into a copy of the plan as texts and hatches', async () => {
    const g = await readRefGeometry('linetypes-hatches.dxf', bytes('tests/fixtures/cad/linetypes-hatches.dxf'));
    expect(g.fills!.map((f) => [f.solid, f.loops[0].length, f.lines.length])).toEqual([[true, 4, 0], [false, 4, 1]]);
    expect(g.fills![1].loops[0]).toEqual([[20, 20], [30, 20], [30, 30], [20, 30]]);
    const ref: CadRef = { name: 'STR', file: 'linetypes-hatches.dxf', type: 'overlay', at: [1000, 0], scale: 1, rot: 0, fade: 50, print: true };
    const { fills } = placeRefExtras(g, ref);
    const shapes = [...fills.map((f) => ({ layer: 'STR$0$0', kind: 'hatch', pts: [], loops: f.loops, solid: f.solid, lines: f.lines })), { layer: 'STR$0$0', kind: 'text', pts: [[1000, 0]], text: 'GRID A', h: 2.5, rot: 0 }];
    const saved = await openDrawing('saved.dxf', await drawingWithDevices(gf, [], shapes));
    expect(saved.info.fills.map((f) => f.solid)).toEqual([true, false]);
    expect(saved.info.fills[1].lines[0].angle).toBeCloseTo(Math.PI / 4);
    expect(saved.info.texts.some((t) => t.s === 'GRID A')).toBe(true);
    saved.close();
  });

  it('saves justified texts with their alignment, and reads them back anchored on their baseline', async () => {
    const shapes = [
      { layer: 'LV-ANNO', kind: 'text', pts: [[1000, 500]], text: 'JUST-MC', h: 250, rot: 0, just: 'MC' },
      { layer: 'LV-ANNO', kind: 'text', pts: [[3000, 500]], text: 'JUST-TR', h: 250, rot: Math.PI / 2, just: 'TR' },
      { layer: 'LV-ANNO', kind: 'text', pts: [[5000, 500]], text: 'JUST-L', h: 250, rot: 0 }
    ];
    for (const as of ['dxf', 'dwg'] as const) {
      const saved = await openDrawing(`just.${as}`, await drawingWithDevices(gf, [], shapes, as));
      // Middle centre: read centred, half a height below the anchor.
      const mc = saved.info.texts.find((t) => t.s === 'JUST-MC')!;
      expect([mc.align, mc.x, mc.y, mc.h], as).toEqual([1, 1000, 375, 250]);
      // Top right, up the page: the baseline is a height to the right of the anchor.
      const tr = saved.info.texts.find((t) => t.s === 'JUST-TR')!;
      expect(tr.align, as).toBe(2); expect(tr.x, as).toBeCloseTo(3250, 6); expect(tr.y, as).toBeCloseTo(500, 6); expect(tr.rot, as).toBeCloseTo(Math.PI / 2, 6);
      const l = saved.info.texts.find((t) => t.s === 'JUST-L')!;
      expect([l.align, l.x, l.y], as).toEqual([0, 5000, 500]);
      saved.close();
    }
  });

  it('saves radius and angular dimensions as their lines, an arc and their text, in DXF and DWG', async () => {
    const look = { arrow: 'closed' as const, size: 90, off: 20, ext: 50, unit: 'm' as const, decimals: 2 };
    const items: SketchItem[] = [
      { id: 'r', kind: 'dim', dimKind: 'radius', layer: 'LV-ANNO', pts: [[1000, 1000], [1500, 1000], [1200, 1000]], h: 90, look },
      { id: 'a', kind: 'dim', dimKind: 'angular', layer: 'LV-ANNO', pts: [[3000, 3000], [4000, 3000], [3000, 4000], [3300, 3300]], h: 90, look }
    ];
    const shapes = shapesOut(items, 0.001);
    expect(shapes.filter((x) => x.kind === 'arc').length).toBe(1);
    for (const as of ['dxf', 'dwg'] as const) {
      const saved = await openDrawing(`dims.${as}`, await drawingWithDevices(gf, [], shapes, as));
      expect(saved.info.texts.map((t) => t.s), as).toEqual(expect.arrayContaining(['R0.50', '90.00°']));
      // Every line and the arc (stepped into segments) are read back on the annotation layer.
      const anno = saved.info.layers.findIndex((l) => l.name === 'LV-ANNO');
      let n = 0;
      for (let i = 0; i < saved.segLayers.length; i += 1) if (saved.segLayers[i] === anno) n += 1;
      expect(n, as).toBeGreaterThanOrEqual(shapes.filter((x) => x.kind === 'line').length + 8);
      saved.close();
    }
  });

  it('saves an SLD sheet as DWG with the same layers, texts and extents as its DXF', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500"><line x1="40" y1="60" x2="700" y2="60" stroke="#000000"/>'
      + '<rect x="100" y="120" width="80" height="40" fill="none" stroke="#000000"/><text x="110" y="200" font-size="12">MDB-01</text></svg>';
    const [page] = buildSheetDxfPages(sampleProject, svg, 'A3');
    const asDxf = await openDrawing('SLD.dxf', new TextEncoder().encode(page.data));
    const dwg = await dxfToDwg(page.data);
    expect(new TextDecoder().decode(dwg.slice(0, 6))).toBe('AC1032'); // the 2018 format
    const asDwg = await openDrawing('SLD.dwg', dwg);
    expect(asDwg.info.format).toBe('DWG');
    expect(asDwg.info.layers.map((l) => l.name)).toEqual(expect.arrayContaining(['E-FRAME', 'E-TITLE']));
    expect(asDwg.info.texts.map((t) => t.s)).toEqual(expect.arrayContaining(['MDB-01']));
    expect(asDwg.info.texts.length).toBe(asDxf.info.texts.length);
    expect(asDwg.info.extents.map(Math.round)).toEqual(asDxf.info.extents.map(Math.round));
  });
});

describe('company title block as a block with attributes (round trip through the engine)', () => {
  const drawn = {
    id: 'tb-d', name: 'ACME block', kind: 'drawn' as const, cols: [], rows: [], cells: [], size: { w: 180, h: 44 },
    shapes: [{ kind: 'line' as const, x1: 0, y1: 0, x2: 180, y2: 0 }, { kind: 'line' as const, x1: 0, y1: 44, x2: 180, y2: 44 }, { kind: 'circle' as const, cx: 10, cy: 10, r: 4 }],
    texts: [{ id: 't1', x: 5, y: 40, h: 2.5, text: 'ACME CONSULTANTS' }, { id: 't2', x: 100, y: 40, h: 3.5, text: '{SheetNo}', tag: 'DWG_NO', orig: 'E-000' }, { id: 't3', x: 150, y: 20, h: 2.5, text: '{Rev}' }]
  };
  it('the DXF the app writes opens with the block, its attributes read, and converts to DWG; exploding the insert gives the block back as a template', async () => {
    const { drawnTitleBlockDxf } = await import('../../docs/titleBlockDxf');
    const { toDxf } = await import('../../docs/dxf');
    const { drawnFromPieces } = await import('../../model/titleBlockImport');
    const { explodeObjects } = await import('./cadEngine');
    const items = drawnTitleBlockDxf(drawn, sampleProject, { x: 230, y: 10, w: 180, h: 44 }, { SheetNo: 'E-SLD-001', Rev: 'B' }).items;
    const dxf = toDxf([{ type: 'polyline', layer: 'E-FRAME', closed: true, points: [[0, 0], [420, 0], [420, 297], [0, 297]] }, ...items], { 'E-FRAME': 7, 'E-TITLE': 7 });
    for (const [name, data] of [['sheet.dxf', new TextEncoder().encode(dxf)], ['sheet.dwg', await dxfToDwg(dxf)]] as const) {
      const v = await openDrawing(name, data);
      const ins = v.blocks().find((b) => b.block === 'TB_ACME_BLOCK');
      expect(ins, name).toBeDefined();
      expect(ins!.attributes, name).toMatchObject({ DWG_NO: 'E-SLD-001', REV: 'B' });
      expect(v.info.texts.some((t) => t.s === 'ACME CONSULTANTS'), name).toBe(true);
      // Importing it again: the insert's pieces make a drawn template of the block's size, its attributes fields.
      const { pieces } = await explodeObjects(v, [ins!.handle]);
      const back = drawnFromPieces(pieces[ins!.handle] ?? Object.values(pieces).flat(), v.info.units, 'back');
      expect(back.size!.w, name).toBeCloseTo(180, 0);
      expect(back.texts!.find((t) => t.tag === 'DWG_NO'), name).toMatchObject({ text: '{SheetNo}', orig: 'E-SLD-001' });
      v.close();
    }
  });
});
