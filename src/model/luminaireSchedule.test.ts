import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { sampleProject } from '../data/sampleProject';
import { buildBom } from '../calc/bom';
import { buildBoqWorkbook } from '../docs/boqWorkbook';
import { workbookBytes } from '../docs/formWorkbook';
import { fallbackPriceEntry, newPriceList, priceBom } from './priceList';
import { placeLvPoint, type PointLuminaire } from './cadDevices';
import { placeRoomLights } from './roomLights';
import { luminaireSchedule } from './luminaireSchedule';
import type { Project } from '../types';

type Pt = [number, number];
const rect = (x0: number, y0: number, w: number, h: number): Pt[] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
const villa: Project = {
  ...sampleProject, lvPoints: undefined, elvDevices: undefined,
  building: {
    buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }] }],
    rooms: [
      { id: 'R1', buildingId: 'V', levelId: 'GF', name: 'Majlis', type: 'living', areaM2: 36, outline: rect(0, 6, 6, 6) },
      { id: 'R2', buildingId: 'V', levelId: 'GF', name: 'Kitchen', type: 'kitchen', areaM2: 16, outline: rect(10, 0, 4, 4) }
    ]
  }
};
const level = { building: 'V', level: 'GF' };
const circuit = villa.feeders.find((f) => f.id === 'DB-GF1-Y1')!;
const dl18: PointLuminaire = { id: 'dl18', label: 'Downlight 18 W · 1800 lm', watts: 18, lumens: 1800, manufacturer: 'Maker A' };
const pnl36: PointLuminaire = { id: 'pnl36', label: 'Panel 600 × 600 36 W · 3600 lm', watts: 36, lumens: 3600 };

/** Four downlights in the majlis, two panels in the kitchen, an emergency light and an exit sign; one untyped light. */
function lit(): Project {
  let p = placeRoomLights(villa, level, 'R1', circuit.id, [[1, 7], [4, 7], [1, 10], [4, 10]], false, dl18).project;
  p = placeRoomLights(p, level, 'R2', circuit.id, [[11, 1], [13, 3]], false, pnl36).project;
  p = placeLvPoint(p, level, 'ltg', circuit.id, 2, 2, 'fitting').project;
  p = placeLvPoint(p, level, 'ltg', circuit.id, 3, 2, 'exit-sign').project;
  return placeLvPoint(p, level, 'ltg', circuit.id, 5, 2).project;
}

describe('luminaire schedule', () => {
  it('keeps the placed luminaire on each light', () => {
    const p = lit();
    expect(p.lvPoints!.filter((d) => d.luminaire?.id === 'dl18')).toHaveLength(4);
    expect(p.lvPoints!.filter((d) => d.luminaire?.id === 'pnl36')).toHaveLength(2);
  });

  it('counts the lights by type, first placed first, then emergency fittings and signs', () => {
    const s = luminaireSchedule(lit());
    expect(s.map((t) => [t.code, t.count])).toEqual([['L1', 4], ['L2', 2], ['EM1', 1], ['EX1', 1]]);
    expect(s[0]).toMatchObject({ watts: 18, lumens: 1800, manufacturer: 'Maker A', byBoard: { [circuit.boardId]: 4 }, levels: ['Ground'] });
  });

  it('lists nothing for lights without a type, or on an existing circuit', () => {
    const plain = placeLvPoint(villa, level, 'ltg', circuit.id, 5, 2).project;
    expect(luminaireSchedule(plain)).toEqual([]);
    const old = { ...lit(), feeders: villa.feeders.map((f) => (f.id === circuit.id ? { ...f, existing: true } : f)) };
    expect(luminaireSchedule(old)).toEqual([]);
  });

  it('puts the types in section J of the BOQ, priced with starting rates', () => {
    const rows = buildBom(lit()).filter((x) => x.key.startsWith('luminaire:') || x.key.startsWith('em:'));
    expect(rows.every((x) => x.section === 'J')).toBe(true);
    expect(rows.find((x) => x.key === 'luminaire:dl18:18')).toMatchObject({ qty: 4, where: [circuit.boardId] });
    expect(rows.find((x) => x.key === 'luminaire:dl18:18')!.description).toMatch(/^Luminaire type L1: Downlight 18 W · 1800 lm, Maker A/);
    expect(rows.find((x) => x.key.startsWith('em:fitting'))!.qty).toBe(1);
    expect(rows.filter((x) => !fallbackPriceEntry(x.key))).toEqual([]);
    expect(buildBom(villa).some((x) => x.key.startsWith('luminaire:') || x.key.startsWith('em:'))).toBe(false);
  });

  it('adds a Luminaire schedule sheet to the BOQ workbook only when there are typed lights', async () => {
    const read = async (p: Project) => {
      const wb = new ExcelJS.Workbook();
      const bytes = await workbookBytes(buildBoqWorkbook(p, priceBom(buildBom(p), newPriceList())));
      await wb.xlsx.load(bytes.buffer as ArrayBuffer);
      return wb;
    };
    expect((await read(villa)).getWorksheet('Luminaire schedule')).toBeUndefined();
    const ws = (await read(lit())).getWorksheet('Luminaire schedule')!;
    expect(ws.getRow(5).values).toEqual(expect.arrayContaining(['L1', 'Maker A', 18, 1800, 4]));
    expect(ws.getRow(9).getCell(4).value).toBe(4 * 18 + 2 * 36);
    expect(ws.getRow(9).getCell(6).value).toBe(8);
  });
});
