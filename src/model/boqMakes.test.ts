import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { sampleProject } from '../data/sampleProject';
import { buildBom } from '../calc/bom';
import { buildBoqHtml, buildBoqWorkbook } from '../docs/boqWorkbook';
import { workbookBytes } from '../docs/formWorkbook';
import { newPriceList, priceBom, type BoqCustom } from './priceList';
import { categoryOf, cleanMakes, lineMakes, makesText, MAKE_CATEGORIES, newMakeList, normalizeMakeList, preambleOf, type BoqMakeList } from './boqMakes';
import type { Project } from '../types';

const list = (over: Partial<BoqMakeList> = {}): BoqMakeList => ({
  ...newMakeList('Office'), preambles: { general: 'General text.', B: 'Breakers to IEC 60947-2.' },
  categories: { mccb: { makes: ['Make A', 'Make B', 'Make E'], specRef: '26 28 16 cl. 2.2' }, cable: { makes: ['Make G'] } }, ...over
});

describe('approved makes', () => {
  it('maps BOQ line keys to categories', () => {
    expect(categoryOf('mccb:250:4P:36')).toBe('mccb');
    expect(categoryOf('mcb:C:20:1P:10')).toBe('mcb');
    expect(categoryOf('cable:XLPE/PVC/SWA:4C:95')).toBe('cable');
    expect(categoryOf('cable:XLPE/PVC/SWA:4C:95:emg')).toBe('cable');
    expect(categoryOf('incomer:ACB:1600')).toBe('acb');
    expect(categoryOf('tie:MCCB:400:nc')).toBe('mccb');
    expect(categoryOf('luminaire:dl18:18')).toBe('luminaire');
    expect(categoryOf('em:exit-sign')).toBe('emergency');
    expect(categoryOf('manual:m1')).toBeUndefined();
    expect(categoryOf('point:socket:x')).toBeUndefined();
  });

  it('has one category per prefix', () => {
    const prefixes = MAKE_CATEGORIES.flatMap((c) => c.prefixes);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(new Set(MAKE_CATEGORIES.map((c) => c.id)).size).toBe(MAKE_CATEGORIES.length);
  });

  it('keeps up to three distinct makes', () => {
    expect(cleanMakes([' Make A ', '', 'make a', 'Make B', undefined, 'Make C', 'Make D'])).toEqual(['Make A', 'Make B', 'Make C']);
    expect(makesText(['Make A', 'Make B'])).toBe('Make A / Make B or approved equal');
    expect(makesText(['Make A'], false)).toBe('Make A');
    expect(makesText([])).toBe('');
  });

  it('takes the line override first, then the category', () => {
    const l = list();
    expect(lineMakes('mccb:250:4P:36', l)).toEqual({ makes: 'Make A / Make B / Make E or approved equal', specRef: '26 28 16 cl. 2.2' });
    expect(lineMakes('mccb:250:4P:36', l, { makes: ['Make X'] })).toEqual({ makes: 'Make X or approved equal', specRef: '26 28 16 cl. 2.2' });
    expect(lineMakes('mccb:250:4P:36', l, { specRef: ' 9.9 ' }).specRef).toBe('9.9');
    expect(lineMakes('acb:1600:4P:65', l)).toEqual({ makes: undefined, specRef: undefined });
    expect(lineMakes('mccb:250:4P:36', { ...l, orEqual: false }).makes).toBe('Make A / Make B / Make E');
    expect(lineMakes('mccb:250:4P:36', undefined)).toEqual({ makes: undefined, specRef: undefined });
  });

  it('reads a stored list safely', () => {
    expect(normalizeMakeList(null)).toBeUndefined();
    expect(normalizeMakeList({ name: 'x' })).toBeUndefined();
    const n = normalizeMakeList({ id: 'k', name: 'N', categories: { mccb: { makes: ['A', 3, ' ', 'B', 'C', 'D'] }, empty: { makes: [] } }, preambles: { A: 'a', B: 5 } });
    expect(n?.categories).toEqual({ mccb: { makes: ['A', 'B', 'C'] } });
    expect(n?.preambles).toEqual({ A: 'a' });
    expect(n?.orEqual).toBe(true);
    expect(preambleOf(n, 'A')).toBe('a');
    expect(preambleOf(n, 'B')).toBeUndefined();
  });

  it('starts a new list with generic preambles and no makes', () => {
    const l = newMakeList();
    expect(l.categories).toEqual({});
    expect(preambleOf(l, 'general')).toMatch(/approved makes/);
    expect(l.orEqual).toBe(true);
  });
});

describe('approved makes in the BOQ', () => {
  const items = buildBom(sampleProject);
  const firstMccb = items.find((it) => categoryOf(it.key) === 'mccb')!;
  const project = (boq: BoqCustom): Project => ({ ...sampleProject, boq: { ...sampleProject.boq, ...boq } });

  it('puts makes and spec reference on priced lines, with the line override', () => {
    const custom: BoqCustom = { makes: list(), overrides: { [firstMccb.key]: { makes: ['Make Z'], specRef: 'X.1' } }, manual: [{ id: 'm1', section: 'K', description: 'Testing', unit: 'LS', qty: 1, makes: ['Lab A'] }] };
    const bom = priceBom(items, newPriceList(), custom);
    expect(bom.items.find((x) => x.key === firstMccb.key)).toMatchObject({ makes: 'Make Z or approved equal', specRef: 'X.1' });
    const other = bom.items.find((x) => categoryOf(x.key) === 'mccb' && x.key !== firstMccb.key);
    if (other) expect(other.makes).toBe('Make A / Make B / Make E or approved equal');
    expect(bom.items.find((x) => categoryOf(x.key) === 'cable')?.makes).toBe('Make G or approved equal');
    expect(bom.items.find((x) => x.manualId === 'm1')?.makes).toBe('Lab A or approved equal');
    expect(priceBom(items, newPriceList()).items.some((x) => x.makes || x.specRef)).toBe(false);
  });

  it('adds spec ref and makes columns and preamble rows to the Excel BOQ', async () => {
    const p = project({ makes: list() });
    const bom = priceBom(items, newPriceList(), p.boq);
    const xlsx = new ExcelJS.Workbook();
    await xlsx.xlsx.load((await workbookBytes(buildBoqWorkbook(p, bom))).buffer as ArrayBuffer);
    const ws = xlsx.getWorksheet('BOQ')!;
    const head = ws.getRow(4).values as unknown[];
    expect(head.slice(1, 9)).toEqual(['Item', 'Description', 'Unit', 'Qty', expect.stringMatching(/^Supply rate/), expect.stringMatching(/^Install rate/), expect.stringMatching(/^Amount/), 'Location']);
    expect(head.slice(9)).toEqual(['Spec ref.', 'Approved makes']);
    expect(String(ws.getCell(5, 2).value)).toBe('GENERAL PREAMBLE — General text.');
    const rows: unknown[][] = [];
    ws.eachRow((row) => rows.push(row.values as unknown[]));
    const mccb = rows.find((v) => typeof v[2] === 'string' && (v[2] as string).startsWith('MCCB'))!;
    expect(mccb.slice(9)).toEqual(['26 28 16 cl. 2.2', 'Make A / Make B / Make E or approved equal']);
    const bHead = rows.findIndex((v) => v[1] === 'B');
    expect(rows[bHead + 1][2]).toBe('Preamble — Breakers to IEC 60947-2.');
  });

  it('leaves the Excel BOQ columns as they were without makes', async () => {
    const bom = priceBom(items, newPriceList(), sampleProject.boq);
    const xlsx = new ExcelJS.Workbook();
    await xlsx.xlsx.load((await workbookBytes(buildBoqWorkbook(sampleProject, bom))).buffer as ArrayBuffer);
    expect((xlsx.getWorksheet('BOQ')!.getRow(4).values as unknown[]).length).toBe(9);
  });

  it('prints makes under the description and the preambles in the PDF BOQ', () => {
    const p = project({ makes: list() });
    const html = buildBoqHtml(p, priceBom(items, newPriceList(), p.boq));
    expect(html).toContain('Spec 26 28 16 cl. 2.2 · Makes: Make A / Make B / Make E or approved equal');
    expect(html).toContain('<h3>General preamble</h3><p class="pre">General text.</p>');
    expect(html).toContain('Breakers to IEC 60947-2.');
    expect(buildBoqHtml(sampleProject, priceBom(items, newPriceList(), sampleProject.boq))).not.toContain('General preamble');
  });
});
