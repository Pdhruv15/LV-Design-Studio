import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { applyReference, BUILT_IN_REFERENCES } from './designReference';
import { addPanel, BOARD_RATING, buildPanel, connectPanel, panelKindOf } from './addPanel';

describe('addPanel', () => {
  it('makes a DB with exactly that id under an existing board, with its incomer feeder on the parent', () => {
    const p = addPanel(sampleProject, 'DB-NEW', 'DB', 'SMDB-GF');
    const b = p.boards.find((x) => x.id === 'DB-NEW')!;
    expect(b).toMatchObject({ id: 'DB-NEW', name: 'DB-NEW', kind: 'DB', upstreamId: 'SMDB-GF', ratedCurrentA: BOARD_RATING.DB });
    const inc = p.feeders.find((f) => f.feedsBoardId === 'DB-NEW')!;
    expect(inc).toMatchObject({ id: 'INC-DB-NEW', boardId: 'SMDB-GF', breakerRatingA: 63 });
    expect(inc.cableCsaMm2).toBeGreaterThan(0);
    expect(p.boards).toHaveLength(sampleProject.boards.length + 1);
    expect(sampleProject.boards.some((x) => x.id === 'DB-NEW')).toBe(false);
  });

  it('makes a new supply when there is no parent', () => {
    const { project, board, incomer } = buildPanel(sampleProject, 'MDB-2', 'MDB');
    expect(board.upstreamId).toBeUndefined();
    expect(board.supply).toBeDefined();
    expect(incomer).toBeUndefined();
    expect(project.feeders).toBe(sampleProject.feeders);
  });

  it('refuses an id that is taken or empty, and a parent that is not there', () => {
    expect(() => addPanel(sampleProject, 'MDB-1', 'MDB')).toThrow('already exists');
    expect(() => addPanel(sampleProject, 'INC-FF', 'DB')).toThrow('already exists');
    expect(() => addPanel(sampleProject, ' ', 'DB')).toThrow('empty');
    expect(() => addPanel(sampleProject, 'DB-X', 'DB', 'NOPE')).toThrow('not in the project');
  });
});

describe('panelKindOf', () => {
  it('reads the kind a panel number starts with, longest first, in any case', () => {
    const kinds = { 'LV-EMDB-1': 'LV-EMDB', LVEMDB2: 'LV-EMDB', 'lv-mdb': 'LV-MDB', LVMDB: 'LV-MDB', 'LV-ACB-1': 'LV-ACB', 'EMDB-1': 'EMDB', EMCC1: 'EMCC', 'EDB-1': 'EDB', 'ESMDB-1': 'ESMDB', 'SMDB-GF': 'SMDB', 'MDB-X': 'MDB', MCC1: 'MCC', 'mcc-2': 'MCC', 'DB-GF': 'DB', 'UPS-1': 'UPS', 'FP-1': 'FP', 'MC-9': 'MC', SMDB: 'SMDB', ' db-1 ': 'DB' };
    for (const [id, kind] of Object.entries(kinds)) expect(panelKindOf(id), id).toBe(kind);
  });

  it('is undefined when the prefix is followed by a letter, or there is none', () => {
    for (const id of ['DEWA', 'CHILLER-1', 'MCB-2', 'MCCB', 'MCCB-1', 'DBX', 'UPSX', '', 'TRANSFORMER TR-1']) expect(panelKindOf(id), id).toBeUndefined();
  });
});

describe('connectPanel', () => {
  const main = addPanel(sampleProject, 'SMDB-M', 'SMDB');

  it('feeds a main board from a parent: upstream set, supply gone, one incomer feeder on the parent at the rating given', () => {
    const p = connectPanel(main, 'SMDB-M', 'MDB-1', { ratedA: 160, lengthM: 40 });
    const b = p.boards.find((x) => x.id === 'SMDB-M')!;
    expect(b).toMatchObject({ upstreamId: 'MDB-1', ratedCurrentA: 160 });
    expect(b.supply).toBeUndefined();
    const inc = p.feeders.filter((f) => f.feedsBoardId === 'SMDB-M');
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ boardId: 'MDB-1', breakerRatingA: 160, lengthM: 40 });
    expect(main.boards.find((x) => x.id === 'SMDB-M')!.upstreamId).toBeUndefined();
    expect(connectPanel(main, 'SMDB-M', 'MDB-1').boards.find((x) => x.id === 'SMDB-M')!.ratedCurrentA).toBe(BOARD_RATING.SMDB);
  });

  it('refuses a board or parent that is not there, a board with an upstream or its own source, and a loop', () => {
    expect(() => connectPanel(main, 'NOPE', 'MDB-1')).toThrow('NOPE is not in the project');
    expect(() => connectPanel(main, 'SMDB-M', 'NOPE')).toThrow('NOPE is not in the project');
    expect(() => connectPanel(main, 'SMDB-GF', 'MDB-1')).toThrow('already fed from MDB-1');
    expect(() => connectPanel(main, 'MDB-1', 'SMDB-GF')).toThrow('own supply');
    expect(() => connectPanel(main, 'SMDB-M', 'SMDB-M')).toThrow('or below');
    expect(() => connectPanel(addPanel(main, 'DB-L', 'DB', 'SMDB-M'), 'SMDB-M', 'DB-L')).toThrow('or below');
  });
});

describe('a new first board’s supply name', () => {
  it('is left blank without a design reference, and the authority with one', () => {
    expect(buildPanel(sampleProject, 'MDB-2', 'MDB').board.supply).toEqual({});
    const p = applyReference({ ...sampleProject, designReference: undefined }, BUILT_IN_REFERENCES.find((r) => r.id === 'builtin-addc')!);
    expect(buildPanel(p, 'MDB-2', 'MDB').board.supply).toEqual({ fedFrom: 'ADDC' });
  });
});
