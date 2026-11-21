import { describe, expect, it } from 'vitest';
import { contrastRatio, cssRgb, dashArray, hatchLines, lineBatches, patternLength, screenColour, tileOf, type PathLike } from './cadDraw';

describe('drawing linetypes and hatches', () => {
  it('turns a linetype pattern into a canvas dash array', () => {
    expect(dashArray([20, -10], 1)).toEqual([20, 10]); // DASHED
    expect(dashArray([12.7, -6.35, 0, -6.35], 0.5)).toEqual([12.7, 6.35, 0.5, 6.35]); // DASHDOT: the dot one pixel
    expect(dashArray([-5, 10], 1)).toEqual([0, 5, 10]); // starts with a gap
    expect(dashArray([], 1)).toEqual([]); // continuous
    expect(dashArray([10, 5], 1)).toEqual([]); // no gap: continuous
    expect(patternLength([20, 10])).toBe(30);
  });

  it('lays a family of hatch lines across a box at their spacing, or none when too close or too many', () => {
    const lines = hatchLines({ angle: 0, base: [0, 0], offset: [0, 2] }, [0, 0, 10, 10], 0.5);
    expect(lines.map((l) => l.a[1])).toEqual([0, 2, 4, 6, 8, 10]);
    expect(lines[0]).toEqual({ a: [0, 0], b: [10, 0], phase: 0 });
    const diag = hatchLines({ angle: Math.PI / 4, base: [0, 0], offset: [-2, 2] }, [0, 0, 10, 10], 0.5);
    expect(diag.length).toBe(5); // 2.83 apart across the square's 14.1 diagonal
    expect(hatchLines({ angle: 0, base: [0, 0], offset: [0, 0.1] }, [0, 0, 10, 10], 0.5)).toEqual([]); // closer than half a unit
    expect(hatchLines({ angle: 0, base: [0, 0], offset: [0, 1] }, [0, 0, 10, 10000], 0.5)).toEqual([]); // over 1500 lines
  });

  it('puts segments in tiles of the drawing', () => {
    expect(tileOf(0, 0, [0, 0, 160, 160])).toBe(0);
    expect(tileOf(159, 0, [0, 0, 160, 160])).toBe(15);
    expect(tileOf(15, 25, [0, 0, 160, 160])).toBe(2 * 16 + 1);
    expect(tileOf(-50, 999, [0, 0, 160, 160])).toBe(15 * 16); // outside: the nearest tile
  });

  /** A path that records what is drawn on it. */
  class Rec implements PathLike {
    calls: string[] = [];
    moveTo(x: number, y: number) { this.calls.push(`M${x},${y}`); }
    lineTo(x: number, y: number) { this.calls.push(`L${x},${y}`); }
  }
  /** The batching as it was written before 2.189, a key looked up per segment: what lineBatches must still give. */
  function batchesPerSegment(segs: Float32Array, layers: Uint16Array, colors: Uint32Array, lts: Uint16Array, ext: [number, number, number, number], gone: Uint8Array) {
    const by = new Map<string, { layer: number; rgb: number; lt: number; path: Rec; box: number[]; end: number[] }>();
    for (let i = 0; i < layers.length; i += 1) {
      if (gone[i]) continue;
      const [x1, y1, x2, y2] = [segs[i * 4], segs[i * 4 + 1], segs[i * 4 + 2], segs[i * 4 + 3]];
      const key = `${layers[i]}:${colors[i]}:${lts[i]}:${tileOf((x1 + x2) / 2, (y1 + y2) / 2, ext)}`;
      let b = by.get(key);
      if (!b) { b = { layer: layers[i], rgb: colors[i], lt: lts[i], path: new Rec(), box: [x1, y1, x1, y1], end: [NaN, NaN] }; by.set(key, b); }
      if (b.end[0] !== x1 || b.end[1] !== y1) b.path.moveTo(x1, y1);
      b.path.lineTo(x2, y2);
      b.end = [x2, y2];
      b.box = [Math.min(b.box[0], x1, x2), Math.min(b.box[1], y1, y2), Math.max(b.box[2], x1, x2), Math.max(b.box[3], y1, y2)];
    }
    return [...by.values()];
  }

  it('batches lines per layer, colour, linetype and tile as a key per segment would', () => {
    // Objects of a few segments each, mostly end to end, over three layers, two colours and two linetypes; some
    // objects cross tiles, and some segments are left out (erased).
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = 4000, segs = new Float32Array(n * 4), layers = new Uint16Array(n), colors = new Uint32Array(n), lts = new Uint16Array(n), gone = new Uint8Array(n);
    let x = 0, y = 0, layer = 0, rgb = 0xff000007, lt = 0;
    for (let i = 0; i < n; i += 1) {
      if (rnd() < 0.2) { x = Math.round(rnd() * 1600); y = Math.round(rnd() * 1600); layer = Math.floor(rnd() * 3); rgb = rnd() < 0.5 ? 0xff000007 : 0xffff0000; lt = rnd() < 0.3 ? 1 : 0; }
      const nx = x + Math.round((rnd() - 0.5) * 200), ny = y + Math.round((rnd() - 0.5) * 200);
      segs.set(rnd() < 0.05 ? [nx, ny, x, y] : [x, y, nx, ny], i * 4);
      layers[i] = layer; colors[i] = rgb; lts[i] = lt; gone[i] = rnd() < 0.03 ? 1 : 0;
      [x, y] = [nx, ny];
    }
    const ext: [number, number, number, number] = [0, 0, 1600, 1600];
    const got = lineBatches(segs, layers, colors, lts, ext, () => new Rec(), gone);
    const want = batchesPerSegment(segs, layers, colors, lts, ext, gone);
    expect(got.length).toBeGreaterThan(50);
    expect(got.map((b) => [b.layer, b.rgb, b.lt, b.box, b.end, b.path.calls])).toEqual(want.map((b) => [b.layer, b.rgb, b.lt, b.box, b.end, b.path.calls]));
  });

  it('continues a batch\'s path from where its last segment ended, and leaves out what is gone', () => {
    const segs = new Float32Array([0, 0, 1, 0, 1, 0, 2, 0, 5, 5, 6, 5, 2, 0, 3, 0]);
    const one = new Uint16Array(4), ink = new Uint32Array(4).fill(7);
    const [b] = lineBatches(segs, one, ink, undefined, [0, 0, 1000, 1000], () => new Rec(), new Uint8Array([0, 0, 1, 0]));
    expect(b.path.calls).toEqual(['M0,0', 'L1,0', 'L2,0', 'L3,0']);
    expect(b.box).toEqual([0, 0, 3, 0]);
  });

  it('zoomed out (minLen): draws a run of short segments with fewer corners, keeping its last point and every run', () => {
    // A run of ten 1-unit steps, then a separate 0.5-unit piece, then a 5-unit line.
    const segs = new Float32Array([...Array.from({ length: 10 }, (_, i) => [i, 0, i + 1, 0]).flat(), 20, 0, 20.5, 0, 30, 0, 35, 0]);
    const n = segs.length / 4, one = new Uint16Array(n), ink = new Uint32Array(n).fill(7);
    const [b] = lineBatches(segs, one, ink, undefined, [0, 0, 1000, 1000], () => new Rec(), null, 3);
    expect(b.path.calls).toEqual(['M0,0', 'L3,0', 'L6,0', 'L9,0', 'L10,0', 'M20,0', 'L20.5,0', 'M30,0', 'L35,0']);
    expect(b.box).toEqual([0, 0, 35, 0]);
    // minLen 0 draws every segment, as before.
    expect(lineBatches(segs, one, ink, undefined, [0, 0, 1000, 1000], () => new Rec(), null, 0)[0].path.calls).toHaveLength(15); // 3 moves + 12 lines
  });
});

describe('drawing colours on screen', () => {
  const light = cssRgb('#f5f6f8')!, dark = cssRgb('#0a1120')!; // the drawing surface in each theme
  const ratio = (c: string, bg: [number, number, number]) => contrastRatio(cssRgb(c)!, bg);

  it('reads the colour forms the stylesheet gives', () => {
    expect(cssRgb('#0a1120')).toEqual([10, 17, 32]);
    expect(cssRgb(' #fff ')).toEqual([255, 255, 255]);
    expect(cssRgb('rgb(245, 246, 248)')).toEqual([245, 246, 248]);
    expect(cssRgb('color-mix(in srgb, red, blue)')).toBeNull();
  });

  it('keeps colours that already stand out', () => {
    expect(screenColour(0xff0000, light)).toBe('#ff0000');
    expect(screenColour(0xffff00, dark)).toBe('#ffff00');
    expect(screenColour(0x0000ff, light)).toBe('#0000ff');
  });

  it('turns yellow gold on the light surface, the shade chosen on 2026-10-29', () => {
    expect(screenColour(0xffff00, light)).toBe('#b28600');
    expect(ratio('#b28600', light)).toBeGreaterThanOrEqual(3);
  });

  it('darkens cyan, green and light grey on light, keeping their hue', () => {
    for (const rgb of [0x00ffff, 0x00ff00, 0xc0c0c0]) {
      const c = screenColour(rgb, light), [r, g, b] = cssRgb(c)!;
      expect(ratio(c, light), c).toBeGreaterThanOrEqual(3);
      if (rgb === 0x00ffff) expect([r, g === b]).toEqual([0, true]);
      if (rgb === 0x00ff00) expect([r, b]).toEqual([0, 0]);
      if (rgb === 0xc0c0c0) expect(r === g && g === b).toBe(true);
    }
  });

  it('lightens blue and dark grey on dark, keeping their hue', () => {
    const blue = cssRgb(screenColour(0x0000ff, dark))!;
    expect(contrastRatio(blue, dark)).toBeGreaterThanOrEqual(3);
    expect(blue[0] === blue[1] && blue[2] === 255).toBe(true);
    expect(ratio(screenColour(0x333333, dark), dark)).toBeGreaterThanOrEqual(3);
    expect(ratio(screenColour(0x000000, dark), dark)).toBeGreaterThanOrEqual(3);
  });
});
