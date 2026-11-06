import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { placedOn, placeLvPoint } from './cadDevices';
import { elvPlacedOn } from '../components/elv/elvCadDevices';
import { placeDevices } from '../elv/placed';
import {
  alongLine, arranged, circuitAfter, copyDevices, countBy, deleteDevices, editsFor, inWindow, matchDevice, moveDevices, onBoard,
  placeAlong, renameBoard, replaceDevices, replacements, toCircuit, typeOf
} from './deviceEdit';
import type { Project } from '../types';

type Pt = [number, number];
const gf = { building: 'V', level: 'GF' };
const base: Project = {
  ...sampleProject, lvPoints: undefined, cadWiring: undefined, cadSketch: undefined, elvDevices: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [] }
};
const B2 = 'DB-GF1-B2', Y2 = 'DB-GF1-Y2'; // 6 and 8 lighting points
const pts = (p: Project) => p.feeders.find((f) => f.id === B2)!.points!;
/** Five corridor lights a little out of line on B2, a socket on B2, and two smoke detectors. */
function corridor() {
  let p = base;
  for (const [x, y] of [[2.2, 5.6], [5.1, 5.9], [7.4, 5.5], [11.3, 6.1], [13.6, 5.7]] as Pt[]) p = placeLvPoint(p, gf, 'ltg', B2, x, y).project;
  p = placeLvPoint(p, gf, 's13', B2, 1, 1.2).project;
  p = placeDevices(p, 'V', 'GF', [{ type: 'smoke-detector', x: 4.5, y: 3.3 }, { type: 'smoke-detector', x: 12.5, y: 2.4 }]).project;
  const all = () => [...placedOn(p, gf), ...elvPlacedOn(p, gf)];
  return { p, all, lights: () => all().filter((d) => typeOf(p, d) === 'ltg') };
}

describe('Edit devices — picking and what the toolbar offers', () => {
  it('a window picks what is wholly inside; a crossing window also what it touches', () => {
    const { all } = corridor();
    expect(inWindow(all(), [2, 5], [13.7, 6.2], false, 0.2).map((d) => d.label)).toEqual(['Light', 'Light', 'Light']); // 2.2 and 13.6 stick out
    expect(inWindow(all(), [13.7, 6.2], [2, 5], true, 0.2)).toHaveLength(5);
  });

  it('offers edits by kind; several get Align and Space equally; a mixed set gets Filter, not Replace across kinds', () => {
    const { p, all, lights } = corridor();
    const [light] = lights(), socket = all().find((d) => typeOf(p, d) === 's13')!, smoke = all().find((d) => d.what === 'elv')!;
    expect(editsFor(p, [light])).toEqual(['array', 'replace', 'circuit', 'match', 'move', 'copy', 'delete']);
    expect(editsFor(p, [socket])).toEqual(['replace', 'circuit', 'match', 'move', 'copy', 'delete']);
    expect(editsFor(p, [smoke])).toEqual(['replace', 'coverage', 'match', 'move', 'copy', 'delete']);
    expect(editsFor(p, lights())).toEqual(['row', 'column', 'space', 'replace', 'circuit', 'match', 'move', 'copy', 'delete']);
    expect(editsFor(p, [light, socket])).toEqual(['filter', 'row', 'column', 'replace', 'circuit', 'match', 'move', 'copy', 'delete']);
    expect(editsFor(p, [light, smoke])).toEqual(['filter', 'row', 'column', 'match', 'move', 'copy', 'delete']);
    expect(replacements(p, [smoke]).map((x) => x.id)).toContain('heat-detector');
    expect(replacements(p, [smoke]).map((x) => x.id)).not.toContain('camera');
    expect(replacements(p, [light, smoke])).toEqual([]);
  });

  it('a board: Rename and Circuits (its devices on this level)', () => {
    const { p, all } = corridor();
    const withDb = { ...p, boards: p.boards.map((b) => (b.id === 'DB-GF1' ? { ...b, planPoint: { x: 14.8, y: 10.6 }, level: gf } : b)) };
    const db = placedOn(withDb, gf).find((d) => d.what === 'board')!;
    expect(editsFor(withDb, [db])).toEqual(['rename', 'circuits', 'move', 'delete']);
    expect(onBoard(withDb, all(), 'DB-GF1')).toHaveLength(6);
    expect(renameBoard(withDb, 'DB-GF1', ' Ground DB ').boards.find((b) => b.id === 'DB-GF1')!.name).toBe('Ground DB');
    expect(() => renameBoard(withDb, 'DB-GF1', ' ')).toThrow(/Type the new name/);
  });
});

describe('Edit devices — arranging', () => {
  it('in a row at the average Y, in a column at the average X', () => {
    const { lights } = corridor();
    const row = arranged(lights(), 'row');
    expect(new Set([...row.values()].map((q) => q[1].toFixed(2)))).toEqual(new Set(['5.76']));
    expect([...arranged(lights(), 'column').values()].every((q) => q[0].toFixed(2) === '7.92')).toBe(true);
  });

  it('space equally: the outer two stay, the rest are spread between them; moved as one change', () => {
    const { p, lights } = corridor();
    const to = arranged(lights(), 'space');
    const next = moveDevices(p, lights(), to, gf);
    const xs = placedOn(next, gf).filter((d) => d.label === 'Light').map((d) => d.x).sort((a, b) => a - b);
    expect(xs.map((x) => x.toFixed(2))).toEqual(['2.20', '5.05', '7.90', '10.75', '13.60']);
    expect(pts(next)).toEqual(pts(p)); // counts unchanged
  });
});

describe('Edit devices — changing', () => {
  it('replace keeps the circuit and moves the count to the new type; emergency lights keep theirs', () => {
    const { p, lights } = corridor();
    const em = placeLvPoint(p, gf, 'ltg', B2, 9, 9, 'fitting');
    const emItem = placedOn(em.project, gf).find((d) => d.id === em.id)!;
    const r = replaceDevices(em.project, [...lights().slice(0, 2), emItem], 'cfan');
    expect(r.changed).toBe(2);
    expect(pts(r.project)).toMatchObject({ ltg: pts(em.project).ltg! - 2, cfan: 2 });
    expect(editsFor(em.project, [emItem])).not.toContain('replace');
  });

  it('a smoke detector becomes a heat detector, not a camera', () => {
    const { p, all } = corridor();
    const smoke = all().filter((d) => d.what === 'elv');
    expect(replaceDevices(p, smoke, 'heat-detector').project.elvDevices!.map((d) => d.type)).toEqual(['heat-detector', 'heat-detector']);
    expect(replaceDevices(p, smoke, 'camera').changed).toBe(0);
  });

  it('to another circuit: off one count, onto the other; over the Rules limit is reported', () => {
    const { p, lights } = corridor();
    expect(circuitAfter(p, lights(), Y2)).toEqual({ points: 14, over: { type: 'ltg', n: 13, max: 10 } });
    expect(circuitAfter(p, lights().slice(0, 1), Y2)).toEqual({ points: 10 });
    const r = toCircuit(p, lights(), Y2);
    expect(r.changed).toBe(5);
    expect(pts(r.project).ltg).toBe(pts(p).ltg! - 5);
    expect(r.project.feeders.find((f) => f.id === Y2)!.points!.ltg).toBe(13);
    expect(() => toCircuit(p, lights(), 'nope')).toThrow(/Choose the circuit/);
  });

  it('match: the circuit (and type if asked) of the device clicked first', () => {
    const { p, lights, all } = corridor();
    const onY2 = toCircuit(p, lights().slice(0, 1), Y2).project;
    const [src] = placedOn(onY2, gf).filter((d) => d.label === 'Light');
    const socket = all().find((d) => typeOf(p, d) === 's13')!;
    const r = matchDevice(onY2, src, socket, { circuit: true, type: true });
    const d = r.lvPoints!.find((x) => x.id === socket.id)!;
    expect([d.type, d.feederId]).toEqual(['ltg', Y2]);
  });

  it('copy and delete several: counts follow', () => {
    const { p, lights, all } = corridor();
    const c = copyDevices(p, all(), 0, 3, gf);
    expect(c.copied).toBe(8);
    expect(pts(c.project)).toEqual({ ...pts(p), ltg: pts(p).ltg! + 5, s13: (pts(p).s13 ?? 0) + 1 });
    expect(c.project.elvDevices).toHaveLength(4);
    const d = deleteDevices(p, [...lights(), ...all().filter((x) => x.what === 'elv')]);
    expect(pts(d).ltg).toBe(pts(p).ltg! - 5);
    expect(d.elvDevices).toEqual([]);
    expect(countBy(all(), (x) => x.label)).toBe('5 × Light, 1 × Socket 13 A, 2 × Smoke detector');
  });
});

describe('Edit devices — array on line', () => {
  it('by number: half a spacing from each end, or on the ends', () => {
    expect(alongLine([0, 0], [10, 0], { count: 5 }, 'half').map((q) => q[0])).toEqual([1, 3, 5, 7, 9]);
    expect(alongLine([0, 0], [10, 0], { count: 5 }, 'on').map((q) => q[0])).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(alongLine([0, 0], [0, 0], { count: 3 }, 'on')).toEqual([]);
  });

  it('by spacing: as many as fit', () => {
    expect(alongLine([0, 0], [12, 0], { spacing: 3 }, 'half').map((q) => q[0])).toEqual([1.5, 4.5, 7.5, 10.5]);
    expect(alongLine([0, 0], [12, 0], { spacing: 3 }, 'on').map((q) => q[0])).toEqual([0, 3, 6, 9, 12]);
    expect(alongLine([0, 0], [12, 0], { spacing: 0 }, 'on')).toEqual([]);
  });

  it('places LV points on the circuit, or ELV devices', () => {
    const at = alongLine([0, 5], [12, 5], { count: 4 }, 'half');
    const r = placeAlong(base, gf, 'ltg', B2, at);
    expect(r.placed).toBe(4);
    expect(pts(r.project).ltg).toBe(pts(base).ltg! + 4);
    expect(placeAlong(base, gf, 'smoke-detector', '', at).project.elvDevices).toHaveLength(4);
    expect(() => placeAlong(base, gf, 'ltg', B2, [])).toThrow(/Draw the line/);
  });
});
