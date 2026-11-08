import { describe, expect, it } from 'vitest';
import { DRAFT_DEFAULTS, draftSettings, OSNAP_BITS, OSNAP_DEFAULT, otrack, parseAngles, polarAngles, polarTrack, snapToSpacing } from './cadDraft';

describe('Design CAD drafting settings', () => {
  it('reads what was kept, and uses the default for anything missing, of the wrong kind or out of range', () => {
    expect(draftSettings(undefined)).toEqual(DRAFT_DEFAULTS);
    expect(draftSettings({ polarInc: 30, aperturePx: 500, gripPx: '9', osnap: 0xffff, polarExtra: [15, -3, 'x', 400], saveFormat: 'pdf', snapTip: false }))
      .toMatchObject({ polarInc: 30, aperturePx: DRAFT_DEFAULTS.aperturePx, gripPx: DRAFT_DEFAULTS.gripPx, osnap: 511, polarExtra: [15], saveFormat: 'own', snapTip: false });
    // The snap modes on before: all but nearest and perpendicular.
    expect(OSNAP_DEFAULT & OSNAP_BITS.nearest).toBe(0);
    expect(OSNAP_DEFAULT & OSNAP_BITS.endpoint).toBe(1);
  });

  it('polar angles: the increment and the extra angles, once each', () => {
    expect(polarAngles(90)).toEqual([0, 90, 180, 270]);
    expect(polarAngles(45, [30, 90])).toEqual([0, 30, 45, 90, 135, 180, 225, 270, 315]);
    expect(polarAngles(22.5).length).toBe(16);
    expect(parseAngles('60, 120; 400 x 0')).toEqual([60, 120]);
  });

  it('polar tracking holds the point on the nearest angle within the tolerance, at the same distance along it', () => {
    const t = polarTrack([0, 0], [100, 3], polarAngles(45), 1);
    expect(t!.angle).toBe(0);
    expect(t!.at.map((v) => +v.toFixed(2))).toEqual([100, 0]);
    expect(polarTrack([0, 0], [70, 72], polarAngles(45), 1)!.angle).toBe(45);
    expect(polarTrack([0, 0], [100, 30], polarAngles(45), 1)).toBeNull(); // between angles
    expect(polarTrack([0, 0], [2, 0], polarAngles(45), 1)).toBeNull(); // too near the point
  });

  it('object snap tracking: along a line from an acquired point, or where two lines cross', () => {
    const one = otrack([[0, 0]], [50, 4], [0, 90, 180, 270], 1)!;
    expect(one.at.map((v) => +v.toFixed(2))).toEqual([50, 0]);
    const two = otrack([[0, 0], [50, 100]], [48, 3], [0, 90, 180, 270], 1)!;
    expect(two.at.map((v) => +v.toFixed(2))).toEqual([50, 0]);
    expect(two.from).toHaveLength(2);
    expect(otrack([[0, 0]], [50, 40], [0, 90], 1)).toBeNull();
  });

  it('snap spacing rounds each coordinate; 0 leaves it', () => {
    expect(snapToSpacing([149, 251], 100, 100)).toEqual([100, 300]);
    expect(snapToSpacing([149, 251], 100, 0)).toEqual([100, 251]);
  });
});
