import ExcelJS from 'exceljs';
import { Packer } from 'docx';
import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { LpsInputs } from '../calc/lightningProtection';
import type { Project } from '../types';
import { buildLightningReportHtml, lightningLayoutSvg, lightningReportBlocks, LPS_SECTIONS } from './lightningReport';
import { buildLightningDocx } from './lightningWord';
import { buildLightningWorkbook } from './lightningWorkbook';
import { lightningProtection } from '../calc/lightningProtection';

const lightning: LpsInputs = {
  lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', lpsClass: 'II', riskRef: 'RA-01', meshM: 10, sphereRadiusM: 30, downSpacingM: 10,
  rodHeightM: 3, angleDeg: 45, eseMastM: 5, eseDeltaTUs: 60, eseDownPerTerminal: 2, earthPitPerDown: true
};
const project: Project = { ...sampleProject, lightning };

describe('lightning protection report', () => {
  it('has the eight sections, in order, and only the ones asked for', () => {
    expect(lightningReportBlocks(project, lightning).map((b) => b.key)).toEqual(LPS_SECTIONS.map((s) => s.key));
    expect(lightningReportBlocks(project, lightning, ['checks', 'inputs']).map((b) => b.key)).toEqual(['inputs', 'checks']);
  });

  it('shows entries as entered and a missing one as Not entered — never a default', () => {
    const pairs = new Map(lightningReportBlocks(project, { ...lightning, sphereRadiusM: undefined }, ['inputs'])[0].pairs);
    expect(pairs.get('Mesh size')).toBe('10 m');
    expect(pairs.get('Rolling sphere radius')).toBe('Not entered');
    expect(pairs.get('Protection class')).toBe('Class II');
  });

  it('the methods table carries the working and DATA REQUIRED', () => {
    const rows = lightningReportBlocks(project, { ...lightning, eseDeltaTUs: undefined }, ['methods'])[0].table!.rows;
    expect(rows[0][0]).toBe('Mesh on flat roof (selected)');
    expect(rows[2][3]).toContain('2 · √(2rh − h²)');
    expect(rows[3][4]).toBe('DATA REQUIRED');
  });

  it('PDF sheet: black-and-white, escaped, with the roof layout drawing', () => {
    const html = buildLightningReportHtml({ ...project, name: 'Tower <A>' });
    expect(html).toContain('Tower &lt;A&gt;');
    expect(html).toContain('<svg');
    expect(html).toContain('not an IEC 62305 method');
    expect(html.match(/#[0-9a-f]{3,6}/gi)!.every((c) => /^#(000|fff|444|f2f2f2)$/i.test(c))).toBe(true);
    expect(buildLightningReportHtml(project, ['inputs'])).not.toContain('<svg');
  });

  it('roof layout drawing: 13 down conductors, 5 runs inside the edge', () => {
    const svg = lightningLayoutSvg(lightning, lightningProtection(lightning));
    expect(svg.match(/<circle /g)!.length).toBe(13 + 1); // + legend
    expect(svg.match(/<line /g)!.length).toBe(5 + 1);
    expect(lightningLayoutSvg({ ...lightning, widthM: 0 }, lightningProtection({ ...lightning, widthM: 0 }))).toBe('');
  });

  it('a project with no study still gives a sheet that says what is missing', () => {
    const html = buildLightningReportHtml(sampleProject);
    expect(html).toContain('Not entered');
    expect(html).toContain('Building size not set');
  });
});

describe('lightning protection workbook', () => {
  const cell = (ws: ExcelJS.Worksheet, label: string) => {
    let out: ExcelJS.Cell | undefined;
    ws.eachRow((row) => { if (row.getCell(1).value === label && !out) out = row.getCell(2); });
    return out!;
  };

  it('keeps live formulas with the app\'s results, and reads back', async () => {
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await buildLightningWorkbook(project).xlsx.writeBuffer());
    const inp = back.getWorksheet('Inputs')!, calc = back.getWorksheet('Calculation')!;
    expect(inp.getCell('B5').value).toBe(40);
    expect(inp.getCell('B11').value).toBe(10);
    expect(inp.getCell('B19').value).toBe('Yes');
    expect(cell(calc, 'Perimeter').value).toMatchObject({ formula: expect.stringContaining('2*(Inputs!$B$5+Inputs!$B$6)'), result: 130 });
    expect(cell(calc, 'Roof conductor').value).toMatchObject({ result: 285 });
    expect(cell(calc, 'Largest bay diagonal').value).toMatchObject({ result: 26.15 });
    expect(cell(calc, 'Protection radius Rp').value).toMatchObject({ result: 86.46 });
    expect(cell(calc, 'Down conductors').value).toMatchObject({ result: 13 });
    expect(cell(calc, 'Earth pits').value).toMatchObject({ result: 13 });
  });

  it('later formulas point at the right cells', () => {
    const calc = buildLightningWorkbook(project).getWorksheet('Calculation')!;
    const per = cell(calc, 'Perimeter').address, runs = cell(calc, 'Runs across the length').address;
    const f = (cell(calc, 'Roof conductor').value as ExcelJS.CellFormulaValue).formula;
    expect(f).toContain(per.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'));
    expect(f).toContain(runs.replace(/([A-Z]+)(\d+)/, '$$$1$$$2'));
  });

  it('a blank input is left blank and its results say DATA REQUIRED', () => {
    const wb = buildLightningWorkbook({ ...sampleProject, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh' } });
    expect(wb.getWorksheet('Inputs')!.getCell('B11').value).toBeNull();
    expect(cell(wb.getWorksheet('Calculation')!, 'Roof conductor').value).toMatchObject({ result: 'DATA REQUIRED' });
    expect(cell(wb.getWorksheet('Calculation')!, 'Down conductors').value).toMatchObject({ result: 'DATA REQUIRED' });
  });
});

describe('lightning protection Word file', () => {
  it('packs to a .docx with the chosen sections', async () => {
    const buf = await Packer.toBuffer(buildLightningDocx(project, ['inputs', 'notes']));
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    expect(buf.length).toBeGreaterThan(2000);
  });
});
