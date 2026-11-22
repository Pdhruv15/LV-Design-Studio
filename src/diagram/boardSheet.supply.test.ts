import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import type { Board, Project } from '../types';
import { boardSheetSvg } from './boardSheet';
import { sourceSymSvg } from './sourceSymbol';

const sheet = (board: Board) => {
  const project: Project = { ...sampleProject, boards: [board, ...sampleProject.boards.filter((b) => b.id !== board.id)] };
  return boardSheetSvg(project, board, evaluateProject(project).filter((r) => r.feeder.boardId === board.id)).svg;
};
const base: Board = { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', ratedCurrentA: 200 };

describe('the printed board sheet: the supply point', () => {
  it('a transformer keeps its drawing and SUPPLY row', () => {
    const svg = sheet(sampleProject.boards.find((b) => b.id === 'MDB-1')!);
    expect(svg).toContain('TRANSFORMER ');
    expect(svg).toContain('>Transformer ');
  });
  it('a source: its symbol, the title in capitals and the first lines; the SUPPLY row names it with its reference', () => {
    const svg = sheet({ ...base, supply: { fedFrom: 'Genset', kind: 'generator', ref: 'L-7' } });
    expect(svg).not.toContain('TRANSFORMER');
    expect(svg).toContain('>GENSET<');
    expect(svg).toContain('>Ik″ 25.2 kA assumed<');
    expect(svg).toContain('>Genset, L-7<');
    expect(svg).toContain('>G</text>');
  });
  it('a board outside the project: a chevron and "From <name> (not in this project)"', () => {
    const svg = sheet({ ...base, supply: { fedBy: 'board', fedFrom: 'SMDB-3F', ref: 'R1' } });
    expect(svg).toContain('>FROM SMDB-3F<');
    expect(svg).toContain('>From SMDB-3F (not in this project), R1<');
  });
  it('unset: a dashed stub, "SUPPLY NOT SET" and "Not set"', () => {
    const svg = sheet(base);
    expect(svg).toContain('>SUPPLY NOT SET<');
    expect(svg).toContain('stroke-dasharray="5 3"');
    expect(svg).toContain('>Not set<');
  });
  it('is black only, and no supplier name appears', () => {
    for (const kind of ['utility', 'generator', 'pv', 'wind', 'battery', 'other'] as const) {
      const s = sourceSymSvg(kind, 10, 30);
      expect(s).not.toMatch(/#(?!000)[0-9a-f]{3,6}|rgb|currentColor/i);
    }
    expect(sheet({ ...base, supply: {} })).not.toMatch(/DEWA|AUTHORITY/);
  });
});
