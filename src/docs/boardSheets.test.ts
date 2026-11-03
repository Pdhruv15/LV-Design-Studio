import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { sampleProject } from '../data/sampleProject';
import { runCalculations } from '../calc/runs';
import { boardsInSupplyOrder } from '../calc/summary';
import { boardSheetSvg } from '../diagram/boardSheet';
import { earthSheetNo } from '../model/boardEarth';
import { onSld } from '../model/sldScope';
import { boardSheetHtml, boardSheetPages } from './boardSheets';
import { buildSheetDxfPages } from './sheetDxf';

const run = runCalculations(sampleProject);
const board = (id: string) => run.project.boards.find((b) => b.id === id)!;

describe('board sheet drawing', () => {
  it('is black and white: no colour anywhere in the drawing', () => {
    for (const b of run.project.boards) {
      const { svg } = boardSheetSvg(run.project, b, run.results);
      const colours = new Set([...svg.matchAll(/(?:stroke|fill)="([^"]+)"/g)].map((m) => m[1]));
      expect([...colours].every((c) => c === '#000' || c === 'none')).toBe(true);
    }
  });
  it('draws the board it is fed from as that board\'s panel symbol', () => {
    const { svg } = boardSheetSvg(run.project, board('DB-GF1'), run.results);
    expect(svg).toContain('>SMDB</text>'); // SMDB-GF above, as the SMDB panel symbol
    expect(svg).toContain('<rect x="221.6" y="4.4" width="16.8" height="19.2" fill="none"'); // legend scale, top of the sheet
    expect(boardSheetSvg(run.project, board('MDB-1'), run.results).svg).not.toContain('>MDB</text>'); // a main board: transformer
  });
  it('shows the supply, every circuit with its reference and phase, and the panel summary', () => {
    const { svg } = boardSheetSvg(run.project, board('DB-GF1'), run.results, { fromSheet: 'E-SLD-02' });
    expect(svg).toContain('FROM SMDB-GF (SHEET E-SLD-02)');
    for (const f of run.project.feeders.filter((x) => x.boardId === 'DB-GF1')) expect(svg).toContain(`>${f.id.replace('DB-GF1-', '')}<`);
    expect(svg).toContain('PH R');
    for (const t of ['PANEL SUMMARY', 'TCL / DF / MDL', 'R / Y / B LOAD', 'NEUTRAL CURRENT', 'CURRENT UNBALANCE', 'EARTH', 'CIRCUITS', 'TOTAL']) expect(svg).toContain(t);
  });
  it('writes the busbar as rating, 3φ 4W, frequency and material, with Icw when entered', () => {
    const plain = boardSheetSvg(run.project, board('SMDB-GF'), run.results).svg;
    expect(plain).toContain('SMDB-GF · 630 A, 3φ 4W, 50 Hz CU BUSBAR</text>');
    expect(plain).not.toContain('Icw');
    const p = { ...run.project, boards: run.project.boards.map((b) => (b.id === 'SMDB-GF' ? { ...b, busbarIcwKa: 50 } : b)) };
    const svg = boardSheetSvg(p, p.boards.find((b) => b.id === 'SMDB-GF')!, run.results).svg;
    // Too long to clear the incomer line on one line: stacked, every line clear of it.
    expect(svg).toContain('>SMDB-GF · 630 A CU BUSBAR · 3φ 4W, 50 Hz</text>');
    expect(svg).toContain('>Icw 50 kA / 1 s</text>');
    // On a narrow board every part gets its own line, all clear of the incomer line.
    const mcc = { ...p, boards: p.boards.map((b) => (b.id === 'MCC-1' ? { ...b, busbarIcwKa: 35 } : b)) };
    const narrow = boardSheetSvg(mcc, mcc.boards.find((b) => b.id === 'MCC-1')!, run.results).svg;
    for (const t of ['MCC-1 · 400 A CU BUSBAR', '3φ 4W, 50 Hz', 'Icw 35 kA / 1 s']) expect(narrow).toContain(`>${t}</text>`);
    expect(svg).toMatch(/Isc [\d.]+ kA ≤ Icw/);
    expect(svg).toContain('>BUSBAR Icw<');
    expect(svg).toContain('50 kA / 1 s — OK');
    const low = { ...p, boards: p.boards.map((b) => (b.id === 'SMDB-GF' ? { ...b, busbarIcwKa: 1.5 } : b)) };
    const lowSvg = boardSheetSvg(low, low.boards.find((b) => b.id === 'SMDB-GF')!, run.results).svg;
    expect(lowSvg).toContain('>Icw 1.5 kA / 1 s</text>');
    expect(lowSvg).toContain('&gt; Icw — CHECK');
    expect(lowSvg).toContain('CHECK (below the fault level)');
  });
  it('draws ticked panel sections as labelled strips and moves the summary clear of them', () => {
    const base = boardSheetSvg(run.project, board('SMDB-GF'), run.results).svg;
    const p = { ...run.project, boards: run.project.boards.map((b) => (b.id === 'SMDB-GF' ? { ...b, sections: ['bms', 'fireAlarm'] as ('bms' | 'fireAlarm')[] } : b)) };
    const svg = boardSheetSvg(p, p.boards.find((b) => b.id === 'SMDB-GF')!, run.results).svg;
    // In the fixed order: fire alarm interface first, whatever order they were ticked in.
    expect(svg.indexOf('>FIRE ALARM INTERFACE<')).toBeGreaterThan(0);
    expect(svg.indexOf('>FIRE ALARM INTERFACE<')).toBeLessThan(svg.indexOf('>BMS SECTION<'));
    expect(svg).not.toContain('CONTROL SECTION');
    expect(svg.match(/transform="rotate\(-90 /g)).toHaveLength(2);
    expect(svg).toContain('Fire alarm interface, BMS section');
    const sumX = (x: string) => Number(x.match(/<text x="([\d.]+)"[^>]*>PANEL SUMMARY</)![1]);
    expect(sumX(svg) - sumX(base)).toBe(64 + 2 * 26); // SMDB-GF's ways fill its busbar row
    expect(base).not.toContain('SECTIONS');
  });
  it('names a busway tap-off as the supply of a board on a riser', () => {
    const p = { ...run.project, busRisers: [{ id: 'R1', name: 'BB-T4-09', sourceBoardId: 'MDB-1', material: 'cu' as const, feedM: 5, floorHeightM: 4, offsetFloors: 0, elementM: 3, elbows: 2,
      floors: [{ id: 'f1', name: 'L1', boardId: 'SMDB-GF' }] }] };
    const svg = boardSheetSvg(p, p.boards.find((b) => b.id === 'SMDB-GF')!, run.results, { fromSheet: 'E-SLD-01' }).svg;
    expect(svg).toContain('FROM BB-T4-09 (TAP-OFF)');
    expect(svg).toContain('BUSWAY RISER FROM MDB-1 (SHEET E-SLD-01)');
    expect(svg).toContain('Tap-off from BB-T4-09 (MDB-1), sheet E-SLD-01');
    expect(boardSheetSvg(p, p.boards.find((b) => b.id === 'SMDB-FF')!, run.results).svg).toContain('FROM MDB-1');
  });
  it('stops at final circuits: one box refers to the schedule, the circuit table still lists every way', () => {
    const own = run.project.feeders.filter((x) => x.boardId === 'DB-GF1');
    const { svg } = boardSheetSvg(run.project, board('DB-GF1'), run.results);
    expect(svg).toContain('FINAL CIRCUITS');
    expect(svg).toContain('REFER DB LOAD');
    expect(svg).toContain(`${own.filter((f) => !onSld(f)).length} WAYS`);
    expect(svg.match(/data-dxf-layer="BUSBAR"/g)).toHaveLength(1);
  });
  it('wraps a long busbar onto more rows instead of one very wide drawing', () => {
    // Every way a dedicated equipment feeder, so each is drawn.
    const project = { ...run.project, feeders: run.project.feeders.map((f) => (f.boardId === 'DB-GF1' ? { ...f, breakerRatingA: 32 } : f)) };
    const many = project.feeders.filter((x) => x.boardId === 'DB-GF1').length;
    expect(many).toBeGreaterThan(12);
    const { svg, w } = boardSheetSvg(project, board('DB-GF1'), run.results);
    expect(svg).toContain('BUSBAR (CONTINUED)');
    expect(w).toBeLessThan(2200);
  });
  it('a main board starts at its transformer', () => {
    const { svg } = boardSheetSvg(run.project, board('MDB-1'), run.results);
    expect(svg).toMatch(/TRANSFORMER \d+ kVA/);
    expect(svg).toContain('MDB-1 MET → pits');
    expect(svg).toContain(`Earthing schematic: sheet ${earthSheetNo(run.project)}`);
  });
});

describe('board sheet set', () => {
  const pages = boardSheetPages(run.project, run.results);
  it('has one sheet per board in supply order, numbered from the SLD drawing number, each pointing to its supply', () => {
    expect(pages.map((p) => p.boardId)).toEqual(boardsInSupplyOrder(run.project).map((b) => b.id));
    expect(pages[0].info.no).toBe('E-DB-001');
    expect(pages[1].info.no).toBe('E-DB-002');
    expect(pages.every((p, i) => p.info.index === i + 1 && p.info.count === pages.length)).toBe(true);
    const gf1 = pages.find((p) => p.boardId === 'DB-GF1')!, up = pages.find((p) => p.boardId === 'SMDB-GF')!;
    expect(gf1.svg).toContain(`SHEET ${up.info.no}`);
    // Own prefix from the drawing set, with its digits and suffix.
    const set = { prefix: 'E-SLD-', sheets: [], register: true, dbPrefix: 'DB-', digits: 2, suffix: '-EL' };
    const numbered = boardSheetPages({ ...run.project, drawingSet: set }, run.results, ['MCC-1']);
    expect(numbered).toHaveLength(1);
    expect(numbered[0].info.no).toMatch(/^DB-\d\d-EL$/);
  });
  it('prints on the drawing sheet with the title block', () => {
    const html = boardSheetHtml(run.project, pages[1]);
    expect(html).toContain(pages[1].info.no);
    expect(html).toContain(`${pages[1].boardId} SINGLE LINE DIAGRAM`);
    expect(html).toContain('class="tb band"'); // the title block, in one band with the revision table
  });
  describe('DXF', () => {
    beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
    afterAll(() => vi.unstubAllGlobals());
    it('every board sheet converts to an A3 DXF with its text', () => {
      for (const p of pages) {
        const dxf = buildSheetDxfPages(run.project, p.svg, 'A3', p.info);
        expect(dxf.length).toBeGreaterThan(0);
        expect(dxf[0].data).toContain('PANEL SUMMARY');
        expect(dxf[0].data).toContain(p.boardId);
      }
    });
    it('keeps panel section labels as rotated text in the DXF', () => {
      const p = { ...run.project, boards: run.project.boards.map((b) => (b.id === 'SMDB-GF' ? { ...b, sections: ['fireAlarm'] as 'fireAlarm'[] } : b)) };
      const page = boardSheetPages(p, run.results).find((x) => x.boardId === 'SMDB-GF')!;
      const data = buildSheetDxfPages(p, page.svg, 'A3', page.info)[0].data;
      expect(data).toContain('\r\n1\r\nFIRE ALARM INTERFACE\r\n50\r\n90\r\n'); // TEXT, rotated 90°
    });
  });
});
