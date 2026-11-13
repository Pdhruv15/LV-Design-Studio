import { describe, expect, it } from 'vitest';
import { eseRadiusM, lightningProtection, lpsLayout, type LpsInputs } from './lightningProtection';

// A 40 × 25 m flat roof, 18 m high. The class values are the engineer's own entries, as in a project.
const base: LpsInputs = {
  lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', lpsClass: 'II', riskRef: 'RA-01',
  meshM: 10, sphereRadiusM: 30, downSpacingM: 10, rodHeightM: 3, angleDeg: 45,
  eseMastM: 5, eseDeltaTUs: 60, eseDownPerTerminal: 2, earthPitPerDown: true
};
const method = (i: LpsInputs, id: LpsInputs['method']) => lightningProtection(i).methods.find((m) => m.method === id)!;

describe('lightning protection — concept (IEC 62305-3 methods; NFC 17-102 for ESE)', () => {
  it('building figures: perimeter, roof area and the centre-to-corner distance', () => {
    const r = lightningProtection(base);
    expect([r.perimeterM, r.roofAreaM2, r.halfDiagonalM]).toEqual([130, 1000, 23.58]);
  });

  it('mesh: runs inside the roof edge so that no mesh is larger than the size entered', () => {
    const m = method(base, 'mesh');
    // 40 m in four 10 m bays → 3 runs of 25 m; 25 m in three bays → 2 runs of 40 m; plus the 130 m edge.
    expect(m).toMatchObject({ status: 'ok', meshRuns: 5, roofConductorM: 285, terminals: 0 });
  });

  it('mesh: a roof that is a whole number of meshes gets no extra run', () => {
    expect(method({ ...base, lengthM: 30, widthM: 20 }, 'mesh')).toMatchObject({ meshRuns: 3, roofConductorM: 100 + 2 * 20 + 1 * 30 });
  });

  it('protection angle: radius h · tan α, one rod at the centre of each bay it covers', () => {
    const m = method(base, 'angle');
    expect(m.radiusM).toBe(3);
    // A 3 m radius covers a 4.24 m square: 10 bays along 40 m, 6 across 25 m.
    expect(m.terminals).toBe(60);
    expect(m.gridM).toEqual([4, 4.17]);
  });

  it('rolling sphere: the sphere resting on four rod tips must stay off the roof', () => {
    const m = method(base, 'sphere');
    // 2·√(2 × 30 × 3 − 3²) = 26.15 m diagonal → 18.49 m squares → 4 × 3 rods.
    expect(m.terminals).toBe(12);
    expect(m.gridM).toEqual([13.33, 12.5]);
    expect(m.radiusM).toBe(13.08);
    const [gx, gy] = m.gridM!;
    const sag = 30 - Math.sqrt(30 * 30 - (Math.hypot(gx, gy) / 2) ** 2);
    expect(sag).toBeLessThan(3);
  });

  it('rolling sphere: a rod as tall as the sphere radius is refused', () => {
    expect(method({ ...base, rodHeightM: 30 }, 'sphere').status).toBe('data');
  });

  it('ESE: protection radius, in proportion to the height below 5 m, not applicable below 2 m', () => {
    expect(eseRadiusM(5, 30, 60)).toBeCloseTo(Math.sqrt(7475), 10); // 300 − 25 + 60 × 120
    expect(eseRadiusM(4, 30, 60)).toBeCloseTo((4 * Math.sqrt(7475)) / 5, 10);
    expect(eseRadiusM(1.9, 30, 60)).toBeNaN();
  });

  it('ESE: one terminal when its radius reaches the far corner, flagged as not an IEC method', () => {
    const m = method(base, 'ese');
    expect(m).toMatchObject({ status: 'warn', terminals: 1, radiusM: 86.46 });
    expect(m.note).toMatch(/not an IEC 62305 method/);
  });

  it('ESE: a small radius needs several terminals', () => {
    const m = method({ ...base, lengthM: 200, widthM: 150, eseDeltaTUs: 10, sphereRadiusM: 20 }, 'ese');
    // Rp = √(200 − 25 + 10 × 50) = 25.98 m → 36.74 m squares → 6 × 5.
    expect(m.radiusM).toBe(25.98);
    expect(m.terminals).toBe(30);
  });

  it('down conductors: the perimeter over the spacing entered, rounded up, at least two', () => {
    const r = lightningProtection(base);
    expect(r).toMatchObject({ downConductors: 13, downSpacingM: 10, downConductorM: 234, earthPits: 13, testJoints: 13, ringConductorM: 130 });
    expect(lightningProtection({ ...base, lengthM: 3, widthM: 2 }).downConductors).toBe(2);
    expect(lightningProtection({ ...base, earthPitPerDown: false }).earthPits).toBe(0);
  });

  it('down conductors for ESE come from the number entered for each terminal', () => {
    expect(lightningProtection({ ...base, method: 'ese' }).downConductors).toBe(2);
    const r = lightningProtection({ ...base, method: 'ese', eseDownPerTerminal: undefined });
    expect(r.downConductors).toBe(0);
    expect(r.checks.some((c) => c.status === 'bad' && /DATA REQUIRED/.test(c.text))).toBe(true);
  });

  it('nothing is assumed: a missing value gives DATA REQUIRED for the method that needs it only', () => {
    const r = lightningProtection({ lengthM: 40, widthM: 25, heightM: 18, method: 'mesh' });
    expect(r.methods.map((m) => m.status)).toEqual(['data', 'data', 'data', 'data']);
    expect(r.selected.missing).toEqual(['mesh size']);
    expect(r.downConductors).toBe(0);
    expect(r.checks.filter((c) => c.status === 'bad').length).toBe(2); // class, air termination
    const partial = lightningProtection({ ...base, sphereRadiusM: undefined });
    expect(partial.methods.map((m) => m.status)).toEqual(['ok', 'ok', 'data', 'data']);
  });

  it('checks: class and risk assessment reference', () => {
    expect(lightningProtection(base).checks.every((c) => c.status === 'ok')).toBe(true);
    expect(lightningProtection({ ...base, riskRef: ' ' }).checks.find((c) => /risk assessment/.test(c.text))?.status).toBe('warn');
  });

  it('a building with no size is invalid', () => {
    expect(lightningProtection({ ...base, widthM: 0 }).invalid).toBeDefined();
    expect(lightningProtection({ ...base, heightM: NaN }).invalid).toBeDefined();
  });

  it('roof plan layout: mesh lines, rods and down conductors', () => {
    const m = lpsLayout(base, lightningProtection(base));
    expect([m.meshX, m.meshY, m.terminals]).toEqual([[10, 20, 30], [8.33, 16.67], []]);
    expect(m.downs.length).toBe(13);
    expect(m.downs.slice(0, 6)).toEqual([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [40, 10]]);
    expect(m.downs[12]).toEqual([0, 10]);
    const s = lpsLayout(base, lightningProtection({ ...base, method: 'sphere' }));
    expect(s.terminals.length).toBe(12);
    expect(s.terminals[0]).toEqual([0, 0]);
    expect(lpsLayout(base, lightningProtection({ ...base, method: 'ese' })).terminals).toEqual([[20, 12.5]]);
    expect(lpsLayout(base, lightningProtection({ ...base, method: 'angle' })).terminals.length).toBe(60);
    expect(lpsLayout(base, lightningProtection({ ...base, meshM: undefined }))).toMatchObject({ meshX: [], terminals: [], downs: [] });
  });
});
