import { describe, expect, it } from 'vitest';
import { hatchLines } from './cadDraw';
import { customLabel, defOf, dotsOnly, hatchDots, hatchStrokes, HATCH_IDS, mirroredY, parsePat, patternByName, patternOf, placedLines, specFromLines, specWith, validCustom, withPatterns, type HatchSpec } from './cadHatch';

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

  it('reads a .pat file: patterns rescaled to their first spacing, SOLID solid, bad patterns reported and left out', () => {
    const pat = [
      '\uFEFF;; Office patterns',
      '*MYBRICK, Brick courses ; a comment',
      '0, 0,0, 0,6.35',
      '90, 0,0, 6.35,-6.35, 6.35,-6.35',
      '*SOLID, Solid fill',
      '45, 0,0, 0,.125',
      '*BAD NAME!, x',
      '0, 0,0, 0,1',
      '*SHORT',
      '0, 0,0',
      '*FLAT',
      '0, 0,0, 1,0',
      '*mybrick, again',
      '0, 0,0, 0,1',
      '*EMPTY'
    ].join('\r\n');
    const { patterns, errors } = parsePat(pat);
    expect(patterns.map((p) => p.name)).toEqual(['MYBRICK', 'SOLID']);
    expect(patterns[0]).toEqual({ name: 'MYBRICK', label: 'Brick courses', lines: [{ angle: 0, base: [0, 0], offset: [0, 1], dashes: [] }, { angle: 90, base: [0, 0], offset: [1, -1], dashes: [1, -1] }] });
    expect(patterns[1]).toMatchObject({ name: 'SOLID', solid: true });
    expect(errors).toEqual([
      'Line 7: “BAD NAME!” is not a pattern name (letters, digits, _ $ . - up to 31).',
      'Line 10 (SHORT): not five numbers or more.',
      'Line 12 (FLAT): no distance between its lines (delta-y 0).',
      'Line 13: “mybrick” is in the file twice: the first is kept.',
      'Line 15: EMPTY has no pattern lines.'
    ]);
    expect(parsePat('0, 0,0, 0,1').errors).toEqual(['Line 1: a pattern line before any *NAME.']);
    expect(parsePat('x'.repeat(2_000_001)).errors[0]).toMatch(/larger than 2 MB/);
  });

  it('a hatch with its own pattern draws it at its spacing; one that is not valid draws as ANSI31', () => {
    const [mine] = parsePat('*MYBRICK\n0, 0,0, 0,6.35\n90, 0,0, 6.35,-6.35, 6.35,-6.35').patterns;
    const s = specWith(spec('ansi31', 0), mine);
    expect(s).toMatchObject({ pattern: 'MYBRICK', scale: 3, custom: mine });
    expect(defOf(s).label).toBe('MYBRICK');
    expect(placedLines(s, 1).map((l) => l.dashes)).toEqual([[], [3, -3]]);
    expect(placedLines(s, 1)).toEqual(placedLines(spec('brick'), 1)); // the same as the built-in brick
    const broken = { ...s, custom: { ...mine, lines: [{ ...mine.lines[0], offset: [0, NaN] as Pt }] } };
    expect(validCustom(broken.custom)).toBe(false);
    expect(defOf(broken)).toBe(patternOf('ansi31'));
    expect(validCustom({ ...mine, lines: Array(33).fill(mine.lines[0]) })).toBe(false);
  });

  it('the project\'s patterns: one of the same name (any case) is replaced', () => {
    const p = (name: string, label?: string) => ({ name, ...(label ? { label } : {}), lines: [{ angle: 0, base: [0, 0] as Pt, offset: [0, 1] as Pt, dashes: [] }] });
    expect(withPatterns([p('A'), p('B', 'old')], [p('b', 'new'), p('C')]).map((c) => customLabel(c))).toEqual(['A', 'b (new)', 'C']);
  });

  it('a drawing\'s hatch lines become the same pattern again at the same spacing', () => {
    const lines = placedLines(spec('earth', 30), 100);
    const s = specFromLines('EARTH', lines, 100)!;
    expect(s.scale).toBeCloseTo(1.5, 9); // its first lines are half a unit apart
    const again = placedLines(s, 100);
    again.forEach((l, i) => {
      expect(l.angle).toBeCloseTo(lines[i].angle, 9);
      [0, 1].forEach((k) => { expect(l.offset[k]).toBeCloseTo(lines[i].offset[k], 6); expect(l.base[k]).toBeCloseTo(lines[i].base[k] - lines[0].base[k], 6); });
      l.dashes.forEach((d, j) => expect(d).toBeCloseTo(lines[i].dashes[j], 6));
    });
    expect(specFromLines('X', [], 100)).toBeUndefined();
    expect(specFromLines('bad name!', lines, 100)!.pattern).toBe('DRAWING');
  });

  it('a drawing\'s pattern name finds the built-in one; unknown ids draw as ANSI31', () => {
    expect(patternByName(' BRICK ')).toBe('brick');
    expect(patternByName('SOLID')).toBe('solid');
    expect(patternByName('AR-HBONE')).toBeUndefined();
    expect(patternOf('nope')).toBe(patternOf('ansi31'));
  });
});
