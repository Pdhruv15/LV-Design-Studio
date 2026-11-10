import { describe, expect, it } from 'vitest';
import { parseZoomScale, popView, pushView, sameView, scaledView, VIEW_HISTORY, windowView, type ViewT } from './cadView';

const size = { w: 800, h: 500 };
const centre = (v: ViewT) => [v.ox + size.w / 2 / v.scale, v.oy + size.h / 2 / v.scale];

describe('ZOOM Window', () => {
  it('fits the box in a canvas that is not square, centred, whichever corners are given', () => {
    const v = windowView([1000, 2000], [3000, 2500], size); // 2000 wide, 500 tall: the width limits on 800 × 500
    expect(v.scale).toBeCloseTo(0.4, 9);
    expect(centre(v)).toEqual([2000, 2250]);
    const tall = windowView([3000, 2500], [1000, 0], size); // 2000 × 2500: the height limits
    expect(tall.scale).toBeCloseTo(0.2, 9);
    expect(centre(tall)).toEqual([2000, 1250]);
  });
  it('zooms to the point of a flat box rather than dividing by zero', () => {
    const v = windowView([500, 500], [500, 900], size);
    expect(Number.isFinite(v.scale) && v.scale > 0).toBe(true);
    expect(centre(v)).toEqual([500, 700]);
  });
});

describe('ZOOM Scale', () => {
  it('keeps the middle while scaling', () => {
    const v: ViewT = { scale: 0.5, ox: 100, oy: 200 };
    const z = scaledView(v, 2, size);
    expect(z.scale).toBe(1);
    expect(centre(z)).toEqual(centre(v));
    expect(scaledView(v, 0.5, size).scale).toBe(0.25);
  });
  it('reads 2 and 0.5 as of the whole drawing, 2x and 0.5X as of the view now, and refuses the rest', () => {
    expect(parseZoomScale('2')).toEqual({ k: 2, relative: false });
    expect(parseZoomScale('0,5')).toEqual({ k: 0.5, relative: false });
    expect(parseZoomScale('2x')).toEqual({ k: 2, relative: true });
    expect(parseZoomScale(' 0.5 X ')).toEqual({ k: 0.5, relative: true });
    expect([parseZoomScale(''), parseZoomScale('0'), parseZoomScale('-1'), parseZoomScale('abc'), parseZoomScale('2xx')]).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe('view history (ZOOM Previous)', () => {
  const v = (scale: number): ViewT => ({ scale, ox: 0, oy: 0 });
  it('keeps the last 20 views in order, the same view once', () => {
    let h: ViewT[] = [];
    for (let i = 1; i <= 25; i += 1) h = pushView(h, v(i));
    expect(h.length).toBe(VIEW_HISTORY);
    expect(h[0].scale).toBe(6); expect(h[h.length - 1].scale).toBe(25);
    expect(pushView(h, { scale: 25, ox: 1e-9, oy: 0 })).toEqual(h); // the newest again: nothing added
    expect(sameView(v(1), { scale: 1, ox: 0.5, oy: 0 })).toBe(false); // half a pixel apart is another view
  });
  it('goes back one view at a time and stops at the start', () => {
    const h = pushView(pushView(pushView([], v(1)), v(2)), v(3));
    const back = popView(h)!;
    expect(back.view.scale).toBe(2); expect(back.hist.length).toBe(2);
    const again = popView(back.hist)!;
    expect(again.view.scale).toBe(1);
    expect(popView(again.hist)).toBeUndefined();
    expect(popView([])).toBeUndefined();
  });
});
