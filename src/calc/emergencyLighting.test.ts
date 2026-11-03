import { describe, expect, it } from 'vitest';
import { durationH, escapeRoute, needsOpenArea, openArea, pointAt, project, signViewingM, TYPICAL_FITTING } from './emergencyLighting';
import { inside } from '../model/cadMeasure';

type Pt = [number, number];
const f = TYPICAL_FITTING; // 12 m on the route, 4 m to the end wall, 9 m / 3.5 m open area

describe('emergency lighting — escape routes (BS 5266-1 / EN 1838)', () => {
  it('projects a point onto a route and finds the point at a chainage', () => {
    const route: Pt[] = [[0, 0], [20, 0], [20, 15]];
    expect(project(route, [10, 1])).toEqual({ s: 10, at: [10, 0], off: 1 });
    expect(project(route, [21, 5]).s).toBeCloseTo(25, 6);
    expect(pointAt(route, 27)).toEqual([20, 7]);
  });

  it('a straight 30 m corridor: a fitting within 4 m of each end, the gap split to 12 m or less', () => {
    const r = escapeRoute([[0, 0], [30, 0]], f);
    expect(r.lengthM).toBe(30);
    expect(r.fittings.map((x) => [x.at[0], x.why])).toEqual([[4, 'end'], [15, 'spacing'], [26, 'end']]);
    expect(r.maxGapM).toBe(11);
    expect(r.signs).toEqual([{ at: [26, 0], kind: 'exit' }]);
    expect(r.warnings).toEqual([]);
  });

  it('an L-shaped route: a fitting and a direction sign at the corner', () => {
    const r = escapeRoute([[0, 0], [20, 0], [20, 15]], f);
    expect(r.fittings.map((x) => x.why)).toEqual(['end', 'spacing', 'direction', 'end']);
    expect(r.fittings[2].at).toEqual([20, 0]);
    expect(r.signs).toContainEqual({ at: [20, 0], kind: 'direction' });
    expect(r.maxGapM).toBeLessThanOrEqual(12);
  });

  it('a slight bend is not a change of direction', () => {
    const r = escapeRoute([[0, 0], [10, 0], [20, 1.5]], f); // about 8.5°
    expect(r.fittings.some((x) => x.why === 'direction')).toBe(false);
  });

  it('points of emphasis: within 2 m lit from the route, further away an own fitting; close ones share a fitting', () => {
    const r = escapeRoute([[0, 0], [30, 0]], f, [{ at: [10, 1], kind: 'call-point' }, { at: [20, 5], kind: 'fire-equipment' }, { at: [4.3, 0.5], kind: 'exit' }]);
    expect(r.fittings).toContainEqual({ at: [10, 0], why: 'emphasis', note: 'Fire alarm call point' });
    expect(r.fittings).toContainEqual({ at: [20, 5], why: 'emphasis', note: 'Fire-fighting equipment — 5.0 m from the route: own fitting' });
    expect(r.fittings.filter((x) => Math.abs(x.at[0] - 4) < 0.5 && x.at[1] === 0)).toHaveLength(1); // the end fitting serves the door at 4.3 m
    expect(r.warnings).toContain('1 point is more than 2 m from the route and gets its own fitting.');
  });

  it('flags a route longer than the exit sign can be seen from', () => {
    expect(signViewingM(150)).toBe(30);
    expect(signViewingM(150, false)).toBe(15);
    const r = escapeRoute([[0, 0], [70, 0]], f, [], signViewingM(150));
    expect(r.warnings[0]).toMatch(/^A point on the route is 66\.0 m from the nearest exit sign, more than its 30 m viewing distance/);
  });

  it('rejects a route without length or a fitting without spacing', () => {
    expect(escapeRoute([[0, 0]], f).invalid).toMatch(/Draw the escape route/);
    expect(escapeRoute([[0, 0], [10, 0]], { ...f, routeSpacingM: 0 }).invalid).toMatch(/spacing table/);
  });
});

describe('emergency lighting — open areas, signs and duration', () => {
  it('open area lighting for rooms over 60 m², or on an escape route', () => {
    expect(needsOpenArea(60)).toBe(false);
    expect(needsOpenArea(61)).toBe(true);
    expect(needsOpenArea(20, true)).toBe(true);
  });

  it('a 12 × 10 m room: cells no larger than 7 m (twice the 3.5 m wall distance), walls within 3.5 m', () => {
    const r = openArea([[0, 0], [12, 0], [12, 10], [0, 10]], f);
    expect(r.areaM2).toBe(120);
    expect(r.fittings.map((x) => x.at)).toEqual([[3, 2.5], [9, 2.5], [3, 7.5], [9, 7.5]]);
    expect(Math.max(r.spacingXM, r.spacingYM) / 2).toBeLessThanOrEqual(3.5);
  });

  it('an L-shaped area keeps every fitting inside its outline', () => {
    const l: Pt[] = [[0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20]];
    const r = openArea(l, f);
    expect(r.fittings.length).toBeGreaterThan(0);
    expect(r.fittings.every((x) => inside(x.at, l))).toBe(true);
    expect(openArea([], f).invalid).toMatch(/no outline/);
  });

  it('3 h duration unless evacuation is immediate and no one sleeps there', () => {
    expect(durationH(true)).toBe(3);
    expect(durationH(false)).toBe(3);
    expect(durationH(false, true)).toBe(1);
    expect(durationH(true, true)).toBe(3);
  });
});
