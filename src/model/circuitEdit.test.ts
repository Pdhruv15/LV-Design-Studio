import { describe, expect, it } from 'vitest';
import { fitColumns, previewCircuit, roomPresets, sameAsOptions, tabOfField } from './circuitEdit';
import { pointColumns } from '../calc/loadSchedule';
import { sampleProject } from '../data/sampleProject';
import type { PointType } from '../types';

const board = sampleProject.boards.find((b) => b.id === 'DB-GF1')!;
const columns = pointColumns(sampleProject, board);
const feeder = (id: string) => sampleProject.feeders.find((f) => f.id === id)!;
const label = (t: PointType) => t.toUpperCase();

describe('Edit circuit dialog helpers', () => {
  it('opens on the tab of the double-clicked field', () => {
    expect(['mcb', 'wire', 'ecc', 'check'].map(tabOfField)).toEqual(['protection', 'protection', 'protection', 'protection']);
    expect(['room', 'length', 'remarks'].map(tabOfField)).toEqual(['general', 'general', 'general']);
    expect([undefined, 'ref', 'pt:ltg', 'R'].map(tabOfField)).toEqual(['loads', 'loads', 'loads', 'loads']);
  });

  it('shows the columns that fit a lighting or a power circuit, or all of them for a circuit with no points', () => {
    expect(fitColumns(columns, { ltg: 6 }).map((c) => c.value).sort()).toEqual(['cfan', 'exfan', 'ltg', 'shaver']);
    const power = fitColumns(columns, { wh: 1 }).map((c) => c.value);
    expect(power).toContain('wh');
    expect(power).toContain('s13');
    expect(power).not.toContain('ltg');
    expect(fitColumns(columns, {})).toEqual(columns);
  });

  it('offers typical room points, lighting or power from the room name', () => {
    const f = feeder('DB-GF1-B2'); // Dining lighting, 6 LTG
    expect(roomPresets(sampleProject, f, 'Dining lighting', f.points!, label).map((p) => p.label)).toEqual([]); // already 6 LTG
    expect(roomPresets(sampleProject, f, 'Bathroom lighting', {}, label)).toEqual([{ label: 'Bathroom lighting: 2 LTG · 1 EXFAN · 1 SHAVER', points: { ltg: 2, exfan: 1, shaver: 1 } }]);
    expect(roomPresets(sampleProject, f, 'Bedroom', {}, label).map((p) => p.label)).toEqual(['Bedroom lighting: 4 LTG · 1 CFAN', 'Bedroom power: 4 S13']);
    expect(roomPresets(sampleProject, f, '', {}, label)).toEqual([]);
  });

  it('offers the same room on another DB first', () => {
    const p = { ...sampleProject, feeders: [...sampleProject.feeders, { ...feeder('DB-GF1-B2'), id: 'X-B2', boardId: 'DB-X', points: { ltg: 9 } }] };
    expect(roomPresets(p, feeder('DB-GF1-B2'), 'Dining lighting', { ltg: 6 }, label)[0]).toEqual({ label: 'As DB-X B2: 9 LTG', points: { ltg: 9 } });
  });

  it('lists the other circuits of the DB with points for "Same as…"', () => {
    const o = sameAsOptions(sampleProject, feeder('DB-GF1-B2'), label);
    expect(o).toHaveLength(20);
    expect(o.find((x) => x.id === 'DB-GF1-Y2')).toEqual({ id: 'DB-GF1-Y2', label: 'Y2 Kitchen lighting (8 LTG · 1 EXFAN)', points: { ltg: 8, exfan: 1 } });
  });

  it('previews the circuit after Save: sized again from the load, with its results and ELCB', () => {
    const now = previewCircuit(sampleProject, board, 'DB-GF1-B2', {})!;
    expect(now.feeder.breakerRatingA).toBe(6);
    expect(now.status).toBe('ok');
    expect(now.elcb?.circuits.some((c) => c.id === 'DB-GF1-B2')).toBe(true);
    const more = previewCircuit(sampleProject, board, 'DB-GF1-B2', { points: { ltg: 30 } })!;
    expect(more.feeder.breakerRatingA).toBeGreaterThan(6);
    expect(more.result.ib).toBeGreaterThan(now.result.ib * 4);
    expect(sampleProject.feeders.find((f) => f.id === 'DB-GF1-B2')!.breakerRatingA).toBe(6); // the project is untouched
  });
});
