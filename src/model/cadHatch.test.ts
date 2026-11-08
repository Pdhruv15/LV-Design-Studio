import { describe, expect, it } from 'vitest';
import { hatchLines } from './cadDraw';
import { dotsOnly, hatchDots, hatchStrokes, HATCH_IDS, mirroredY, patternByName, patternOf, placedLines, type HatchSpec } from './cadHatch';

type Pt = [number, number];
const box: [number, number, number, number] = [0, 0, 60, 40];
const spec = (pattern: HatchSpec['pattern'], angle = 0): HatchSpec => ({ pattern, scale: 3, angle });
const r6 = (p: Pt) => p.map((v) => +v.toFixed(6));

describe('hatch patterns', () => {
  it('every pattern but Solid draws lines or dots in a box, all finite', () => {
    expect(HATCH_IDS.length).toBeGreaterThanOrEqual(18);
    for (const id of HATCH_IDS) {
      const ls = placedLines(spec(id, 30), 1);
      if (patternOf(id).solid) { expect(ls).toEqual([]); continue; }
      expect(ls.length, id).toBeGreaterThan(0);
      for (const l of ls) expect([l.angle, ...l.base, ...l.offset, ...l.dashes].every(Number.isFinite), id).toBe(true);
      const n = ls.reduce((t, l) => t + (dotsOnly(l) ? hatchDots(l, box, 0.2, 20000).length : hatchStrokes(l, box, 0.2, 4000, 0.2).lines.length), 0);
      expect(n, id).toBeGreaterThan(0);
    }
  });

  it('ANSI31, ANSI37 and Net draw the same lines as before: through the origin, spacing apart', () => {
    for (const [id, angles] of [['ansi31', [45]], ['ansi37', [45, 135]], ['net', [0, 90]]] as const) {
      const ls = placedLines(spec(id, 15), 100);
      expect(ls.map((l) => +((l.angle * 180) / Math.PI).toFixed(6))).toEqual(angles.map((a) => a + 15));
      for (const l of ls) {
        const step = 300, old = hatchLines({ angle: l.angle, base: [0, 0], offset: [-Math.sin(l.angle) * step, Math.cos(l.angle) * step] }, [0, 0, 6000, 4000], 3);
        expect(hatchStrokes(l, [0, 0, 6000, 4000], 3, 1500, 1).lines.map((x) => [r6(x.a), r6(x.b)])).toEqual(old.map((x) => [r6(x.a), r6(x.b)]));
      }
    }
  });

  it('Dots is a grid at the spacing from the origin, whatever the angle; Sand too ignores the angle', () => {
    const [d] = placedLines(spec('dots', 40), 1);
    const pts = hatchDots(d, [0, 0, 6, 6], 0.2, 1000).map(r6).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(pts).toEqual([0, 3, 6].flatMap((x) => [0, 3, 6].map((y) => [x, y])));
    expect(placedLines(spec('sand', 40), 1)).toEqual(placedLines(spec('sand', 0), 1));
    expect(hatchDots(d, [0, 0, 6, 6], 4, 1000)).toEqual([]); // closer than the smallest gap: none
    expect(hatchDots(d, [0, 0, 600, 600], 0.2, 1000)).toEqual([]); // too many: none
  });

  it('dashed lines start where their dashes start, so brick joints are staggered course to course', () => {
    const joints = placedLines(spec('brick'), 1)[1]; // vertical joints, 3 mm courses, bricks 6 mm long
    const { lines, dash } = hatchStrokes(joints, [0.5, 0.5, 9.5, 5.5], 0.2, 100, 0.2);
    expect(dash).toEqual([3, 3]);
    for (const l of lines) {
      // Each joint's dash starts on a course line (a multiple of 3 mm up), on alternate courses one joint to the next.
      expect(l.a[1] / 3).toBeCloseTo(Math.round(l.a[1] / 3), 6);
      expect(Math.abs((Math.round(l.a[1] / 3) - Math.round(l.a[0] / 3)) % 2)).toBe(0);
    }
    expect(new Set(lines.map((l) => +l.a[0].toFixed(6)))).toEqual(new Set([3, 6, 9]));
  });

  it('mirrored for paper (y down): the same lines upside down', () => {
    const [l] = placedLines(spec('ansi31'), 1), [m] = mirroredY([l]);
    const a = hatchLines(l, [-10, -10, 10, 10], 0.2).map((x) => r6(x.a)), b = hatchLines(m, [-10, -10, 10, 10], 0.2).map((x) => r6([x.a[0], -x.a[1]]));
    expect(a.length).toBe(b.length);
    // Each line on paper is the drawing's line reflected: its points reflected lie on a line of the family.
    const n: Pt = [-Math.sin(l.angle), Math.cos(l.angle)];
    for (const p of b) { const k = (p[0] * n[0] + p[1] * n[1]) / 3; expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6); }
  });

  it('a drawing\'s pattern name finds the built-in one; unknown ids draw as ANSI31', () => {
    expect(patternByName(' BRICK ')).toBe('brick');
    expect(patternByName('SOLID')).toBe('solid');
    expect(patternByName('AR-HBONE')).toBeUndefined();
    expect(patternOf('nope')).toBe(patternOf('ansi31'));
  });
});
