import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { addPlanSheets, planDrawing } from '../docs/planLayout';
import { buildSldSheetHtml } from '../docs/sldSheet';
import { placeLvPoint } from './cadDevices';
import { setOf, type DrawingSheet } from './drawingSet';
import {
  DEFAULT_PENS, diagramPenCss, inkOf, newTableId, parseCtb, pensFor, plotOf, plotStamp, tableFromCtb, tablesOf, withDefaults, withTable
} from './plotSetup';
import type { Project } from '../types';

const gf = { building: 'V', level: 'GF' };
const villa: Project = {
  ...sampleProject, lvPoints: undefined, cadWiring: undefined, cadSketch: undefined, elvDevices: undefined, drawingSet: undefined, plot: undefined,
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }] }], rooms: [{ id: 'r1', buildingId: 'V', levelId: 'GF', name: 'Hall', type: 'lobby', areaM2: 120, outline: [[0, 0], [12, 0], [12, 10], [0, 10]] }] }
};
/** A CTB file as CAD programs write it: a text header, then the plot styles compressed with zlib. */
function ctbFile(styles: Record<number, { lw?: number; scr?: number }>): Uint8Array {
  const body = Array.from({ length: 255 }, (_, i) => {
    const c = styles[i + 1] ?? {};
    return ` ${i}{\n  name="Color_${i + 1}\n  color=-1006632961\n  screening=${c.scr ?? 100}\n  lineweight=${c.lw ?? 255}\n }`;
  }).join('\n');
  const text = `description=\naci_table_available=TRUE\nplot_style{\n${body}\n}\ncustom_lineweight_table{\n 0=0.0\n 4=0.13\n 6=0.18\n 8=0.25\n 10=0.35\n 13=0.5\n 17=0.7\n}\n`;
  const head = new TextEncoder().encode('PIAFILEVERSION_2.0,CTBVER1,compress\r\npmzlibcodec');
  const pad = new Uint8Array(60);
  pad.set(head);
  const z = deflateSync(Buffer.from(text, 'latin1'));
  const out = new Uint8Array(60 + z.length);
  out.set(pad); out.set(z, 60);
  return out;
}

describe('pen tables and page setup', () => {
  it('the default table prints as the sheets always have; an edited default is kept, saved unchanged it drops out', () => {
    expect(tablesOf(villa)).toEqual([DEFAULT_PENS]);
    const heavy = { ...DEFAULT_PENS, pens: { ...DEFAULT_PENS.pens, trays: { w: 0.7, grey: 100 } } };
    const p = withTable(villa, heavy);
    expect(tablesOf(p)[0].pens.trays.w).toBe(0.7);
    expect(withTable(p, DEFAULT_PENS).plot!.tables).toEqual([]);
    expect(newTableId(withTable(villa, { ...heavy, id: 'pt3' }))).toBe('pt4');
  });

  it('a sheet takes its own setup over the set\'s default; "all one thin line" thins every pen', () => {
    const p = withDefaults(withTable(villa, { ...DEFAULT_PENS, id: 'pt1', name: 'Heavy', pens: { ...DEFAULT_PENS.pens, frame: { w: 1, grey: 100 } } }), { pens: 'pt1', stamp: true });
    const s: Pick<DrawingSheet, 'plot'> = { plot: { weights: 'thin' } };
    expect(plotOf(p, s)).toEqual({ pens: 'pt1', stamp: true, weights: 'thin' });
    expect(pensFor(p, {}).frame.w).toBe(1);
    expect(Object.values(pensFor(p, s)).every((x) => x.w === 0.13)).toBe(true);
  });

  it('inks are black or a grey; diagram pens hold their width on paper; the stamp names the sheet', () => {
    expect(inkOf({ w: 0.25, grey: 100 })).toBe('#000');
    expect(inkOf({ w: 0.25, grey: 45 })).toBe('#8c8c8c');
    expect(diagramPenCss(DEFAULT_PENS.pens)).toBe(''); // as drawn
    expect(diagramPenCss({ ...DEFAULT_PENS.pens, bus: { w: 1, grey: 100 } })).toBe('.drawing svg .bus{stroke-width:3.78px!important;vector-effect:non-scaling-stroke;}');
    expect(plotStamp({ number: 'E-LTG-101', title: 'Lighting GF' }, 'B', 'PG', new Date(2026, 10, 6, 9, 5))).toBe('E-LTG-101 - Lighting GF · 2026-11-06 09:05 · Rev B · PG');
  });
});

describe('CTB import', () => {
  it('reads each colour\'s lineweight and screening, and the pens take those of their layer colours', async () => {
    const ctb = await parseCtb(ctbFile({ 1: { lw: 17 }, 3: { lw: 10 }, 7: { lw: 8 }, 8: { lw: 4, scr: 50 } }));
    expect(ctb.colours[1]).toEqual({ w: 0.7, grey: 100 });
    expect(ctb.colours[2]).toEqual({ grey: 100 }); // the object's own lineweight
    const t = tableFromCtb('pt1', 'ABC', ctb);
    expect(t.pens).toMatchObject({ bus: { w: 0.7 }, devices: { w: 0.35 }, trays: { w: 0.35 }, frame: { w: 0.25 }, routes: { w: 0.25 }, arch: { w: 0.13, grey: 45 } });
    expect(t.pens.sld).toEqual({ w: 0.25, grey: 100 });
  });

  it('a file that is not a CTB says so', async () => {
    await expect(parseCtb(new TextEncoder().encode('PIAFILEVERSION_2.0,STBVER1,compress'))).rejects.toThrow(/Not a CTB/);
    await expect(parseCtb(new TextEncoder().encode('hello'))).rejects.toThrow(/Not a CTB/);
  });
});

describe('pens on the printed sheets', () => {
  const plan = () => {
    const p = placeLvPoint(villa, gf, 'ltg', 'DB-GF1-Y1', 6, 5).project;
    const { set, ids } = addPlanSheets(setOf(p), p, 'lighting');
    return { p: { ...p, drawingSet: set }, s: set.sheets.find((x) => x.id === ids[0])! };
  };

  it('a plan sheet with the default pens draws as before', () => {
    const { p, s } = plan();
    const d = planDrawing(p, s)!;
    expect(d.svg).toContain('stroke="#8c8c8c" stroke-width="0.18"');
    expect(d.svg).toContain('stroke="#000" stroke-width="0.25"');
  });

  it('edited pens change the architect\'s outline and the devices', () => {
    const { p, s } = plan();
    const q = withTable(p, { ...DEFAULT_PENS, pens: { ...DEFAULT_PENS.pens, arch: { w: 0.35, grey: 60 }, devices: { w: 0.5, grey: 100 } } });
    const d = planDrawing(q, s)!;
    expect(d.svg).toContain('stroke="#666666" stroke-width="0.35"');
    expect(d.svg).toContain('<g fill="#fff" stroke="#000" stroke-width="0.5"><circle'); // the light
  });

  it('the sheet frame, its table lines and the plot stamp follow the setup', () => {
    const plain = buildSldSheetHtml(villa, '<svg/>', 'A3');
    expect(plain).toContain('border: 0.7mm solid #000');
    expect(plain).not.toContain('class="stamp"');
    const html = buildSldSheetHtml(villa, '<svg/>', 'A3', { no: 'E-1', title: 'T', count: 1, index: 1, plot: { frame: 1, lines: 0.5, stamp: 'E-1 - T · 2026-11-06 09:05' } });
    expect(html).toContain('border: 1mm solid #000');
    expect(html).toMatch(/\.tb td\.t \{ border: 0\.\d+mm solid #000/);
    expect(html).toContain('<div class="stamp">E-1 - T · 2026-11-06 09:05</div>');
  });
});
