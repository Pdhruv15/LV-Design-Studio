// @vitest-environment jsdom
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { drawingWithDevices, explodeObjects, openDrawing, type CadView } from './cadEngine';
import { cropPieces, type CropBoundary } from '../../model/cadCrop';
import { shapesOut } from '../../model/cadSketch';
import type { SketchItem } from '../../types';

/** CROP end to end on tests/fixtures/cad/crop-block.dxf (engines/cad-reader/examples/crop_fixture.rs): a DB symbol
 * block inserted plain, rotated, scaled, mirrored, nested and as an array, each with a CCT attribute. Each insert is
 * cropped, saved with the app's SAVE (the insert left out, the pieces added) and read back. With LVDS_CROP_OUT set,
 * the before / after drawings are written there to open in another CAD program. */

const root = path.resolve(__dirname, '../../..');
const bytes = (rel: string) => new Uint8Array(readFileSync(path.join(root, rel)));
let view: CadView;
const KINDS = ['plain', 'rotated 30°', 'scaled 2×', 'non-uniform 2 × 1', 'mirrored', 'rotated 30° + scaled 1.5×', 'nested 2 deep', 'MINSERT 2 × 3', 'green (ByBlock)'];

beforeAll(async () => {
  (window as { lvds?: unknown }).lvds = { cadFile: { engine: async () => bytes('electron/cad/lvds_cad_reader_bg.wasm') } };
  view = await openDrawing('crop-block.dxf', bytes('tests/fixtures/cad/crop-block.dxf'));
});

/** The inserts by position (x = 1000 k), from the engine's block list and a pick at each. */
async function inserts(): Promise<{ k: number; handle: string }[]> {
  const on = new Uint8Array(view.info.layers.length).fill(1);
  return Promise.all(KINDS.map(async (_, k) => ({ k, handle: (await view.pick(1000 * k, 0, 1, on))!.handle })));
}
const rectAt = (k: number): CropBoundary => ({ kind: 'polygon', pts: [[1000 * k - 60, -45], [1000 * k + 60, -45], [1000 * k + 60, 30], [1000 * k - 60, 30]] });
const circleAt = (k: number): CropBoundary => ({ kind: 'circle', c: [1000 * k, 0], r: 55 });

async function cropAll(outline: (k: number) => CropBoundary) {
  const list = await inserts();
  const { pieces } = await explodeObjects(view, list.map((x) => x.handle));
  const items: SketchItem[] = [];
  for (const { k, handle } of list) {
    const r = cropPieces(pieces[handle], outline(k), 'inside');
    expect(r.error, KINDS[k]).toBeUndefined();
    expect(r.items!.length, KINDS[k]).toBeGreaterThan(0);
    items.push(...r.items!.map((it, i) => ({ ...it, id: `S${k}-${i}` }) as SketchItem));
  }
  const saved = await drawingWithDevices(view, [], shapesOut(items, 0.001), 'dxf', list.map((x) => x.handle));
  return { list, items, saved, after: await openDrawing('after.dxf', saved) };
}

describe('CROP on a drawing (engine)', () => {
  it('finds the nine inserts, each counted on its circuit', async () => {
    const list = await inserts();
    expect(new Set(list.map((x) => x.handle)).size).toBe(9);
    expect(view.blocks().filter((b) => b.attributes.CCT)).toHaveLength(9);
  });

  for (const [name, outline] of [['rectangle', rectAt], ['circle', circleAt]] as const) {
    it(`crops every insert with a ${name}: the inserts gone, the pieces on their layers, no loads counted`, async () => {
      const { list, items, saved, after } = await cropAll(outline);
      expect(after.blocks()).toEqual([]);
      expect(after.blocks().filter((b) => b.attributes.CCT)).toHaveLength(0);
      // The symbol's layer-0 lines on the insert's layer, the arc and line on their own layer E-SYM.
      const count = (n: string) => after.info.layers.find((l) => l.name === n)?.count ?? 0;
      expect(count('E-LIGHT')).toBeGreaterThan(0);
      expect(count('E-SYM')).toBeGreaterThan(0);
      expect(new Set(items.map((it) => it.layer))).toEqual(new Set(['E-LIGHT', 'E-SYM']));
      // Nothing kept beyond the outline: every kept point within it (a little tolerance for arcs' ends).
      for (const it of items.filter((x) => x.kind === 'line' || x.kind === 'pline' || x.kind === 'text')) {
        const k = Math.round(it.pts[0][0] / 1000), b = outline(k);
        for (const [x, y] of it.pts) expect(b.kind === 'circle' ? Math.hypot(x - b.c[0], y - b.c[1]) <= b.r + 1e-6 : Math.abs(x - 1000 * k) <= 60 + 1e-6 && y >= -45 - 1e-6 && y <= 30 + 1e-6).toBe(true);
      }
      // The attributes are kept as plain texts where they are inside (they sit 70 above the insert: outside here).
      expect(after.info.texts.some((t) => /^L1-/.test(t.s))).toBe(false);
      expect(after.info.texts.filter((t) => t.s === 'DB').length).toBeGreaterThan(0);
      expect(list).toHaveLength(9);
      const out = process.env.LVDS_CROP_OUT;
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(path.join(out, 'crop-block - before.dxf'), bytes('tests/fixtures/cad/crop-block.dxf'));
        writeFileSync(path.join(out, `crop-block - after ${name}.dxf`), saved);
      }
    });
  }

  it('a non-uniform scale gives the circle as an ellipse (a polyline), and the mirrored arc stays over the top', async () => {
    const list = await inserts();
    const { pieces } = await explodeObjects(view, [list[3].handle, list[4].handle]);
    expect(pieces[list[3].handle].some((p) => p.kind === 'circle')).toBe(false);
    const arc = pieces[list[4].handle].find((p) => p.kind === 'arc');
    expect(arc && arc.kind === 'arc' && Math.sin((arc.a0 + arc.a1) / 2)).toBeGreaterThan(0.99);
  });

  it('an erased insert is no longer picked', async () => {
    const [first] = await inserts();
    const on = new Uint8Array(view.info.layers.length).fill(1);
    const parts = await view.erase([first.handle]);
    expect(parts.objects).toHaveLength(1);
    expect(await view.pick(0, 0, 1, on)).toBeNull();
    await view.erase([]);
    expect((await view.pick(0, 0, 1, on))?.handle).toBe(first.handle);
  });
});
