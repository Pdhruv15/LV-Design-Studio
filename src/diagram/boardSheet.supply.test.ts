import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../calc/electrical';
import { sampleProject } from '../data/sampleProject';
import type { Board, Project } from '../types';
import { boardSheetSvg } from './boardSheet';
import { sourceSymSvg } from './sourceSymbol';
import { textWidth } from './panelLabels';

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
    expect(svg).toContain('>Genset<'); // the typed name keeps its case
    expect(svg).toContain('>Ik″ 25.2 kA assumed<');
    expect(svg).toContain('>Genset, L-7<');
    expect(svg).toContain('>G</text>');
  });
  it('a board outside the project: a chevron and "From <name> (not in this project)"', () => {
    const svg = sheet({ ...base, supply: { fedBy: 'board', fedFrom: 'SMDB-3F', ref: 'R1' } });
    expect(svg).toContain('>FROM SMDB-3F<');
    expect(sheet({ ...base, supply: { fedBy: 'board', fedFrom: 'smdb-3f' } })).toContain('>FROM smdb-3f<');
    expect(sheet({ ...base, supply: { fedBy: 'board' } })).toContain('>FROM A BOARD NOT NAMED<');
    expect(svg).toContain('>From SMDB-3F (not in this project), R1<');
  });
  it('titles: a named utility "<name> SUPPLY" as typed, a blank source "SOURCE"', () => {
    expect(sheet({ ...base, supply: { fedFrom: 'Grid North' } })).toContain('>Grid North SUPPLY<');
    expect(sheet({ ...base, supply: {} })).toContain('>SOURCE<');
    expect(sheet({ ...base, supply: { kind: 'pv' } })).toContain('>SOURCE<');
  });
  it('worked example: six rows without the reference, the last 12 or more above the incomer label', () => {
    const svg = sheet({ ...base, incomerDevice: 'MCCB', supply: { fedBy: 'board', fedFrom: 'SMDB-3F', faultKa: 12, vdUsedPct: 1.6, zeOhm: 0.06, ratingA: 63, device: 'MCCB', ref: 'E-301 rev B', incomer: { cableCsaMm2: 16, lengthM: 25 } } });
    const row = (re: RegExp) => Number(svg.match(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>${re.source}`))![1]);
    const ys = [/FROM SMDB-3F</, /not in this project</, /Ik″ 12 kA given</, /Drop used 1\.6 % · Ze 0\.06 Ω</, /63 A MCCB at SMDB-3F</, /[^<]*16 mm² · 25 m</].map(row);
    expect(ys).toEqual([14, 27, 40, 53, 66, 79]);
    expect(svg).not.toMatch(/>Ref\. E-301/); // the reference is in the SUPPLY row instead
    expect(svg).toContain('>From SMDB-3F (not in this project), E-301 rev B<');
    const incomerY = row(/INCOMER /);
    expect(incomerY - ys[5]).toBeGreaterThanOrEqual(12);
  });
  it('up to five rows keep the 15 pitch', () => {
    const svg = sheet({ ...base, supply: { fedFrom: 'Grid', ratingA: 63, device: 'MCCB', faultKa: 12, vdUsedPct: 1.6 } });
    const ys = [...svg.matchAll(/<text x="250" y="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys).toEqual([14, 29, 44, 59]);
  });
  it('unset: a dashed stub, "SUPPLY NOT SET" and "Not set"', () => {
    const svg = sheet(base);
    expect(svg).toContain('>SUPPLY NOT SET<');
    expect(svg).toContain('stroke-dasharray="5 3"');
    expect(svg).toContain('>Not set<');
  });
  it('the summary table starts beyond the longest supply row', () => {
    const svg = sheet({ ...base, supply: { fedBy: 'board', fedFrom: 'MDB-TOWER-A', ratingA: 63, device: 'MCCB', meter: '3-PH' } });
    const row = svg.match(/<text x="([\d.]+)"[^>]*>63 A MCCB at MDB-TOWER-A/)!;
    const table = svg.match(/<text x="([\d.]+)"[^>]*>PANEL SUMMARY/)!;
    expect(Number(table[1])).toBeGreaterThanOrEqual(Number(row[1]) + textWidth('63 A MCCB at MDB-TOWER-A · 3-PH meter', 11));
  });
  it('is black only, and no supplier name appears', () => {
    for (const kind of ['utility', 'generator', 'pv', 'wind', 'battery', 'other'] as const) {
      const s = sourceSymSvg(kind, 10, 30);
      expect(s).not.toMatch(/#(?!000)[0-9a-f]{3,6}|rgb|currentColor/i);
    }
    expect(sheet({ ...base, supply: {} })).not.toMatch(/DEWA|AUTHORITY/);
  });
});
