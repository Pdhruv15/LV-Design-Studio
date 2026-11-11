import { describe, expect, it } from 'vitest';
import { CHANGEOVER_H, DEWA_EXTRA_Y, LEAF_W, LEVEL_H, ROOT_BUS_Y, layoutSystem } from './layout';
import { busbarReach, wayReach } from './panelLabels';
import { sampleProject } from '../data/sampleProject';
import type { Feeder, Project } from '../types';

function feeder(id: string, boardId: string, feedsBoardId?: string): Feeder {
  return {
    id, boardId, name: id, loadKw: 10, demandFactor: 1, powerFactor: 0.9, lengthM: 10,
    cableCsaMm2: 16, cores: 4, breakerRatingA: 63, breakerIcuKa: 36, feedsBoardId
  };
}

const base = { name: 'T', voltageV: 415, frequencyHz: 50, ambientC: 45, vdLimitPct: 4, updatedAt: '' };

describe('system layout', () => {
  it('places every board and feeder exactly once; final circuits go to their DB', () => {
    const l = layoutSystem(sampleProject);
    expect(l.boards.map((b) => b.board.id).sort()).toEqual(sampleProject.boards.map((b) => b.id).sort());
    const drawn = [...l.feeders.map((f) => f.feeder.id), ...l.boards.flatMap((b) => b.circuits.map((c) => c.id))];
    expect(drawn.sort()).toEqual(sampleProject.feeders.map((f) => f.id).sort());
  });

  it('puts sub-boards one level down, centred over their loads, under their incomer', () => {
    const p: Project = {
      ...base,
      boards: [{ id: 'MDB', name: 'M' }, { id: 'SUB', name: 'S', upstreamId: 'MDB' }],
      feeders: [feeder('INC', 'MDB', 'SUB'), feeder('A', 'SUB'), feeder('B', 'SUB'), feeder('C', 'MDB')]
    };
    const l = layoutSystem(p);
    const sub = l.boards.find((b) => b.board.id === 'SUB')!;
    const [a, b] = ['A', 'B'].map((id) => l.feeders.find((f) => f.feeder.id === id)!);
    const inc = l.feeders.find((f) => f.feeder.id === 'INC')!;
    expect(sub.busY).toBe(ROOT_BUS_Y + LEVEL_H);
    expect(sub.x).toBe((a.x + b.x) / 2);
    expect(inc.x).toBe(sub.x);
    expect(inc.childBoardId).toBe('SUB');
    expect(b.x - a.x).toBe(LEAF_W);
  });

  it('never puts two loads in the same slot', () => {
    const l = layoutSystem(sampleProject);
    const loads = l.feeders.filter((f) => !f.childBoardId).map((f) => `${f.x}:${f.busY}`);
    expect(new Set(loads).size).toBe(loads.length);
  });

  it('stops the SLD at the DB: final circuits are not drawn', () => {
    const circuits: Feeder[] = Array.from({ length: 4 }, (_, i) => ({
      ...feeder(`C${i}`, 'SUB'), phase: (['R', 'Y', 'B'] as const)[i % 3], way: Math.floor(i / 3) + 1, cores: 2 as const
    }));
    const p: Project = {
      ...base,
      boards: [{ id: 'MDB', name: 'M' }, { id: 'SUB', name: 'S', upstreamId: 'MDB' }],
      feeders: [feeder('INC', 'MDB', 'SUB'), feeder('PUMP', 'MDB'), ...circuits]
    };
    const l = layoutSystem(p);
    expect(l.feeders.map((f) => f.feeder.id).sort()).toEqual(['INC', 'PUMP']);
    const sub = l.boards.find((b) => b.board.id === 'SUB')!;
    const mdb = l.boards.find((b) => b.board.id === 'MDB')!;
    expect(sub.circuits.map((c) => c.id)).toEqual(['C0', 'C1', 'C2', 'C3']);
    expect(sub.terminal).toBe(true);
    expect(mdb.terminal).toBe(false);
    // The DB takes a single slot, next to the MDB's other load.
    expect(l.feeders.find((f) => f.feeder.id === 'PUMP')!.x - sub.x).toBe(LEAF_W);
  });

  it('keeps a DB\'s own non-schedule feeders on the SLD', () => {
    const p: Project = {
      ...base,
      boards: [{ id: 'MDB', name: 'M' }, { id: 'SUB', name: 'S', upstreamId: 'MDB' }],
      feeders: [
        feeder('INC', 'MDB', 'SUB'),
        feeder('MOTOR', 'SUB'),
        { ...feeder('C0', 'SUB'), phase: 'R', way: 1, cores: 2 }
      ]
    };
    const l = layoutSystem(p);
    expect(l.feeders.map((f) => f.feeder.id).sort()).toEqual(['INC', 'MOTOR']);
    const sub = l.boards.find((b) => b.board.id === 'SUB')!;
    expect(sub.terminal).toBe(false);
    expect(sub.circuits.map((c) => c.id)).toEqual(['C0']);
  });

  it('survives a cycle in the board hierarchy', () => {
    const p: Project = {
      ...base,
      boards: [{ id: 'A', name: 'A', upstreamId: 'B' }, { id: 'B', name: 'B', upstreamId: 'A' }],
      feeders: [feeder('AB', 'A', 'B'), feeder('BA', 'B', 'A')]
    };
    const l = layoutSystem(p);
    expect(l.boards).toHaveLength(2);
  });
});

describe('mains / generator changeover layout', () => {
  const p: Project = {
    ...base,
    boards: [{ id: 'MDB', name: 'M' }, { id: 'EMDB', name: 'E', upstreamId: 'MDB', standby: { kva: 200, changeover: 'ACB' } }, { id: 'EDB', name: 'D', upstreamId: 'EMDB' }],
    feeders: [feeder('INC', 'MDB', 'EMDB'), feeder('A', 'EMDB'), feeder('INC2', 'EMDB', 'EDB'), feeder('L', 'EDB'), feeder('C', 'MDB')]
  };
  const l = layoutSystem(p);
  const at = (id: string) => l.boards.find((b) => b.board.id === id)!;

  it('raises the board box above the two incomers and moves the levels below down with it', () => {
    const e = at('EMDB');
    expect(e.busY).toBe(ROOT_BUS_Y + LEVEL_H + CHANGEOVER_H);
    expect(e.headY).toBe(e.busY - CHANGEOVER_H);
    expect(at('EDB').busY).toBe(ROOT_BUS_Y + 2 * LEVEL_H + CHANGEOVER_H);
    expect(at('MDB').headY).toBe(at('MDB').busY);
    expect(l.feeders.find((f) => f.feeder.id === 'L')!.busY).toBe(at('EDB').busY);
  });

  it('drops the generator incomer in beyond the last way, on the busbar, with room before the next board', () => {
    const e = at('EMDB');
    const ways = l.feeders.filter((f) => f.feeder.boardId === 'EMDB').map((f) => f.x);
    expect(e.genX!).toBeGreaterThan(Math.max(...ways));
    expect(e.busX2).toBeGreaterThanOrEqual(e.genX!);
    const next = l.feeders.find((f) => f.feeder.id === 'C')!;
    expect(next.x - e.genX!).toBeGreaterThan(135);
  });
});

describe('room for the panel instruments', () => {
  const two = (instruments?: boolean, ways = 1): Project => ({
    ...base,
    boards: [{ id: 'A', name: 'A', ...(instruments === undefined ? {} : { instruments }) }, { id: 'B', name: 'B' }],
    feeders: [...Array.from({ length: ways }, (_, i) => feeder(`A${i}`, 'A')), feeder('B1', 'B'), feeder('B2', 'B')]
  });

  it('keeps a slot free left of the incomer on a main board with a single way, inside its own busbar', () => {
    const l = layoutSystem(two());
    const a = l.boards.find((b) => b.board.id === 'A')!, b = l.boards.find((x) => x.board.id === 'B')!;
    expect(a.x - 66 - a.busX1).toBeGreaterThanOrEqual(50); // the meters and lamps fit left of the board box
    expect(a.busX2).toBeLessThan(b.busX1); // and stay clear of the next panel
    expect(l.feeders.find((f) => f.feeder.id === 'A0')!.x - a.busX1).toBeGreaterThan(LEAF_W);
  });

  it('adds no slot with instruments off, or with two ways (room already there)', () => {
    const off = layoutSystem(two(false)), wide = layoutSystem(two(undefined, 2)), one = layoutSystem(two());
    const bx = (l: typeof one) => l.boards.find((b) => b.board.id === 'B')!.x;
    expect(bx(off)).toBe(bx(one) - LEAF_W);
    const a = wide.boards.find((b) => b.board.id === 'A')!;
    expect(a.x - 66 - a.busX1).toBeGreaterThanOrEqual(50);
    expect(bx(wide)).toBe(bx(one)); // two ways take the same two slots
  });
});

describe('DEWA panel frames sized to their labels', () => {
  const framed = (p: Project, cableRefs = false) => layoutSystem(p, DEWA_EXTRA_Y, { frames: true, cableRefs });
  const x = (l: ReturnType<typeof layoutSystem>, id: string) => l.feeders.find((f) => f.feeder.id === id)!.x;

  it('reach past every label of their ways, and keep neighbouring panels apart', () => {
    const l = framed(sampleProject);
    const boards = l.boards.filter((b) => b.frame);
    expect(boards.map((b) => b.board.id).sort()).toEqual(['MCC-1', 'MDB-1', 'SMDB-FF', 'SMDB-GF']);
    for (const b of boards) {
      for (const f of l.feeders.filter((n) => n.feeder.boardId === b.board.id)) expect(f.x + wayReach(sampleProject, f.feeder, !f.childBoardId), f.feeder.id).toBeLessThan(b.frame!.x2);
      expect(b.frame!.x1).toBe(b.busX1 - 7);
    }
    for (const level of new Set(boards.map((b) => b.busY))) {
      const row = boards.filter((b) => b.busY === level).sort((a, b) => a.frame!.x1 - b.frame!.x1);
      for (let i = 1; i < row.length; i++) expect(row[i].frame!.x1 - row[i - 1].frame!.x2, row[i].board.id).toBeGreaterThanOrEqual(17);
    }
  });

  it('take room only where a frame needs it: ways stay one slot apart, the standard style keeps its slots', () => {
    const plain = layoutSystem(sampleProject), l = framed(sampleProject);
    expect(plain.boards.some((b) => b.frame)).toBe(false);
    expect(x(plain, 'MCC-WP') - x(plain, 'FF-LTG')).toBe(LEAF_W);
    expect(x(l, 'MCC-WP') - x(l, 'FF-LTG')).toBeGreaterThan(LEAF_W); // SMDB-FF's last way, then MCC-1's first
    expect(x(l, 'MCC-FP') - x(l, 'MCC-WP')).toBe(LEAF_W);
    expect(x(l, 'FF-IT') - x(l, 'FF-OFF')).toBe(LEAF_W);
    // The standard style draws exactly as before: every load in its own slot from the left margin.
    for (const f of plain.feeders.filter((n) => !n.childBoardId)) expect(((f.x - 36 - LEAF_W / 2) / LEAF_W) % 1, f.feeder.id).toBe(0);
  });

  it('follow the cable text actually printed: longer cable, wider frame; cable numbers, narrower', () => {
    const p: Project = {
      ...base,
      boards: [{ id: 'MDB', name: 'M' }, { id: 'S1', name: 'S1', upstreamId: 'MDB' }, { id: 'S2', name: 'S2', upstreamId: 'MDB' }],
      feeders: [feeder('I1', 'MDB', 'S1'), feeder('I2', 'MDB', 'S2'), feeder('A', 'S1'), feeder('B', 'S2')]
    };
    const long: Project = { ...p, feeders: p.feeders.map((f) => (f.id === 'A' ? { ...f, parallel: 4, cableCsaMm2: 240 } : f)) };
    const frame = (l: ReturnType<typeof layoutSystem>, id: string) => l.boards.find((b) => b.board.id === id)!.frame!;
    const [short, wide, refs] = [framed(p), framed(long), framed(long, true)];
    expect(frame(wide, 'S1').x2 - x(wide, 'A')).toBeGreaterThan(frame(short, 'S1').x2 - x(short, 'A'));
    expect(frame(refs, 'S1').x2).toBeLessThan(frame(wide, 'S1').x2);
    expect(frame(wide, 'S2').x1 - frame(wide, 'S1').x2).toBeGreaterThanOrEqual(17);
  });
});

describe('room for the busbar description', () => {
  const twoBoards = (frames: boolean): ReturnType<typeof layoutSystem> => layoutSystem({
    ...base,
    boards: [{ id: 'A', name: 'A', ratedCurrentA: 2500 }, { id: 'B', name: 'B', ratedCurrentA: 630 }],
    feeders: [feeder('A1', 'A'), feeder('B1', 'B'), feeder('B2', 'B')]
  }, frames ? DEWA_EXTRA_Y : undefined, { frames });

  it('runs a single-way busbar far enough right that "2500 A TPN+E" clears the incoming line', () => {
    for (const frames of [false, true]) {
      const l = twoBoards(frames);
      const a = l.boards.find((b) => b.board.id === 'A')!, b = l.boards.find((x) => x.board.id === 'B')!;
      expect(a.busX2 - a.x).toBeGreaterThanOrEqual(busbarReach(a.board));
      expect(busbarReach(a.board)).toBeGreaterThan(LEAF_W * 0.38); // longer than the usual half busbar
      expect(a.busX2).toBeLessThan(b.busX1); // and the next panel moves clear of it
      if (frames) expect(a.frame!.x2).toBeLessThan(b.frame!.x1);
    }
  });

  it('leaves a board with no busbar rating as it was', () => {
    const l = layoutSystem({ ...base, boards: [{ id: 'A', name: 'A' }], feeders: [feeder('A1', 'A')] });
    const a = l.boards[0];
    expect(a.busX2 - a.x).toBeCloseTo(LEAF_W * 0.38);
  });
});
