import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { sampleProject } from '../data/sampleProject';
import { placeBoard, placeLvPoint } from '../model/cadDevices';
import { wireLevel } from '../model/cadWiring';
import { issueSheets, renumber, setOf, sheetChecks, sheetHash, sheetType, type DrawingSheet, type PlanType } from '../model/drawingSet';
import type { Project, SketchItem } from '../types';
import { addPlanSheets, drawingAreaMm, planDrawing, planLevels, planNotes, planScale } from './planLayout';
import { buildSheetDxfPages } from './sheetDxf';
import { buildSldSheetHtml } from './sldSheet';
import { abbreviationsIn } from './sldNotes';

const gf = { building: 'V', level: 'GF' };
const box = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** A villa ground floor: a 20 × 12 m majlis with the DB at its corner, three lights 4 m apart (lighting circuit) and a
 * socket (power circuit). */
function villa(width = 20): Project {
  let p: Project = {
    ...sampleProject, lvPoints: undefined, cadWiring: undefined, cadSketch: undefined, cadLength: undefined, elvDevices: undefined, drawingSet: undefined,
    building: {
      buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground floor', kind: 'ground', heightM: 4 }, { id: 'FF', name: 'First floor', kind: 'typical', heightM: 4 }] }],
      rooms: [{ id: 'r1', buildingId: 'V', levelId: 'GF', name: 'Majlis', type: 'living', areaM2: width * 12, outline: box(0, 0, width, 12) }]
    }
  };
  p = placeBoard(p, 'DB-GF1', gf, 1, 1);
  for (const x of [6, 10, 14]) p = placeLvPoint(p, gf, 'ltg', 'DB-GF1-Y1', x, 6).project;
  p = placeLvPoint(p, gf, 's13', 'DB-GF1-B6', width - 1, 1).project;
  return wireLevel(p, gf).project;
}
const sheetOf = (p: Project, type: PlanType = 'lighting') => {
  const r = addPlanSheets(setOf(p), p, type);
  return { set: r.set, sheets: r.set.sheets.filter((s) => r.ids.includes(s.id)) };
};
/** The centres of the circles drawn (paper mm). */
const circles = (svg: string) => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="1.8"/g)].map((m) => [Number(m[1]), Number(m[2])]);

type Pt = [number, number];
const tray = (id: string, pts: Pt[], widthMm = 300, service = 'Power', route = 'A'): SketchItem => ({ id, kind: 'pline', layer: 'E-TRAY', pts, tray: { widthMm, service, route } });
const route = (id: string, pts: Pt[], feederId: string): SketchItem => ({ id, kind: 'pline', layer: 'E-CABLE', pts, cable: { feederId } });
/** The project with `items` drawn on the ground floor's plan, a file in millimetres (INSUNITS 4) unless told otherwise. */
const drawn = (p: Project, items: SketchItem[], units = 4): Project => ({ ...p, cadPlans: [{ building: 'V', level: 'GF', file: 'GF.dwg', units }], cadSketch: [{ file: 'gf.DWG', items }] });
/** The numbers of a path's M and L points (paper mm): [x, y] pairs in order. */
const pathPts = (d: string) => [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const heavy = (svg: string) => /<path d="([^"]+)" fill="none" stroke="#000" stroke-width="0.5"\/>/.exec(svg)?.[1] ?? '';
const dashed = (svg: string) => /<path class="ln" d="([^"]+)" fill="none" stroke="#000" stroke-width="0.25" stroke-dasharray="2 1"\/>/.exec(svg)?.[1] ?? '';
/** The text elements with this text: position and rotation (paper mm, degrees). */
const textsOf = (svg: string, text: string) => [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" transform="rotate\(([\d.-]+) [^"]+" font-size="2.5"[^>]*>([^<]*)</g)]
  .filter((m) => m[4] === text).map((m) => ({ x: Number(m[1]), y: Number(m[2]), rot: Number(m[3]) }));

describe('plan sheets (Design CAD → Sheets → Plans)', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());

  it('reads the scale and finds the levels with something on each layout', () => {
    expect([planScale('1:50'), planScale('1 : 200'), planScale(undefined), planScale('NTS')]).toEqual([50, 200, 100, 100]);
    const p = villa();
    expect(planLevels(p, 'lighting').map((l) => l.name)).toEqual(['Ground floor']);
    expect(planLevels(p, 'power').map((l) => l.levelId)).toEqual(['GF']);
    expect(planLevels(p, 'elv')).toEqual([]);
  });

  it('adds a sheet per level, numbered per layout, at 1:100, and only once', () => {
    const p = villa();
    const { set, sheets } = sheetOf(p);
    expect(sheets.map((s) => [s.number, s.title, s.scale, s.size, s.kind])).toEqual([['E-LTG-001', 'Ground floor · Lighting layout', '1:100', 'auto', 'plan']]);
    expect(sheetType(sheets[0])).toBe('plan');
    const both = addPlanSheets(set, p, 'power').set;
    expect(both.sheets.map((s) => s.number)).toEqual(['E-LTG-001', 'E-PWR-001']);
    expect(addPlanSheets(both, p, 'lighting').ids).toEqual([]);
    expect(renumber(both, true).sheets.map((s) => s.number)).toEqual(['E-LTG-001', 'E-PWR-001']);
  });

  it('draws the level at its true scale on the paper it needs, the architect plan grey and the design black', () => {
    const p = villa();
    const s = sheetOf(p).sheets[0];
    const d = planDrawing(p, s)!;
    expect(d.size).toBe('A3');
    const area = drawingAreaMm(p, 'A3');
    expect(area).toEqual({ w: 292, h: 230 });
    expect(d.svg).toContain(`viewBox="0 0 ${area.w} ${area.h}"`);
    // Lights 4 m apart are 40 mm apart at 1:100.
    const lights = circles(d.svg).sort((a, b) => a[0] - b[0]);
    expect(lights).toHaveLength(3);
    expect(lights[1][0] - lights[0][0]).toBeCloseTo(40, 1);
    expect(d.svg).toMatch(/stroke="#8c8c8c"/);
    expect(d.svg).toContain('MAJLIS');
    expect(d.svg).toMatch(/DB-GF1\/Y1 · \dC × [\d.]+ mm² · \d+ m/); // the home run's tag
    expect(d.svg).toContain('GROUND FLOOR · LIGHTING LAYOUT');
    expect(d.svg).toContain('SCALE 1:100 AT A3');
    expect(d.svg).not.toContain('B6'); // the socket circuit is on the power layout
    expect(d.legendSvg).toMatch(/>Light<\/text>.*>3<\/text>/s);
    expect(d.legendSvg).not.toContain('KEY PLAN');
    // Black and white only.
    expect([...d.svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,6})"/gi)].every((m) => /^#(000|fff|8c8c8c)$/i.test(m[1]))).toBe(true);
    // At 1:50 the lights are 80 mm apart.
    expect((() => { const l = circles(planDrawing(p, { ...s, scale: '1:50' })!.svg).sort((a, b) => a[0] - b[0]); return l[1][0] - l[0][0]; })()).toBeCloseTo(80, 1);
  });

  it('keeps the north arrow and scale bar clear of the notes box, on every paper', () => {
    // The notes box lies over the drawing area's bottom right, 180 mm wide from the frame's right edge.
    for (const [scale, size, width] of [['1:100', 'A3', 420], ['1:50', 'A2', 594], ['1:50', 'A1', 841]] as const) {
      const p = villa(size === 'A1' ? 40 : 20); // A1: too wide for A2 at 1:50
      const d = planDrawing(p, { ...sheetOf(p).sheets[0], scale })!;
      expect(d.size).toBe(size);
      const [, cx] = /<circle cx="([\d.]+)" cy="[\d.]+" r="4.5"/.exec(d.svg)!;
      const notesLeft = width - 33 - 180;
      expect(Number(cx) + 4.5).toBeLessThanOrEqual(notesLeft);
      const bar = [...d.svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="10" height="1.6"/g)].map((m) => Number(m[1]));
      expect(bar).toHaveLength(5);
      expect(bar[4] + 10).toBeLessThanOrEqual(Number(cx) - 4.5);
    }
  });

  it('keeps the scale in the DXF sheet', () => {
    const p = villa();
    const d = planDrawing(p, sheetOf(p).sheets[0])!;
    const [page] = buildSheetDxfPages(p, d.svg, d.size, { no: 'E-LTG-001', title: 'Ground floor · Lighting layout', index: 1, count: 1, legendSvg: d.legendSvg, scale: '1:100' });
    // CIRCLE entities: centre x (10) and radius (40); the light symbols have r 1.8.
    const xs: number[] = [];
    const lines = page.data.split(/\r?\n/);
    for (let i = 0; i < lines.length - 1; i += 2) {
      if (lines[i].trim() !== '0' || lines[i + 1] !== 'CIRCLE') continue;
      let x = 0, r = 0;
      for (let j = i + 2; j < lines.length - 1 && lines[j].trim() !== '0'; j += 2) { if (lines[j].trim() === '10') x = Number(lines[j + 1]); if (lines[j].trim() === '40') r = Number(lines[j + 1]); }
      if (Math.abs(r - 1.8) < 0.1) xs.push(x);
    }
    xs.sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThanOrEqual(3);
    expect(xs[1] - xs[0]).toBeGreaterThan(38);
    expect(xs[1] - xs[0]).toBeLessThan(42);
  });

  it('splits a level too big for A1 into parts with a key plan and match lines', () => {
    const p = villa(200); // 202 m with the margin: 2 020 mm at 1:100, three A1 drawing areas wide
    const { set, sheets } = sheetOf(p);
    expect(sheets.map((s) => [s.number, s.title, s.part])).toEqual([
      ['E-LTG-001', 'Ground floor · Lighting layout · part 1 of 3', 0],
      ['E-LTG-002', 'Ground floor · Lighting layout · part 2 of 3', 1],
      ['E-LTG-003', 'Ground floor · Lighting layout · part 3 of 3', 2]
    ]);
    const numberOf = (part: number) => set.sheets.find((x: DrawingSheet) => x.part === part)?.number;
    const mid = planDrawing(p, sheets[1], numberOf)!;
    expect(mid.size).toBe('A1');
    expect(mid.svg).toContain('MATCH LINE · SEE E-LTG-001');
    expect(mid.svg).toContain('MATCH LINE · SEE E-LTG-003');
    expect(mid.svg).toContain('PART 2 OF 3');
    expect(mid.legendSvg).toContain('KEY PLAN');
    // The lights at 6–14 m are on part 1 only.
    expect(circles(planDrawing(p, sheets[0], numberOf)!.svg)).toHaveLength(3);
    expect(circles(mid.svg)).toHaveLength(0);
    expect(planDrawing(p, { ...sheets[0], part: 5 })).toBeUndefined();
  });

  it('notes what the sheet shows and that it is a design-stage layout', () => {
    const p = villa();
    const notes = planNotes(p, sheetOf(p).sheets[0]);
    expect(notes.some((n) => /grey/.test(n))).toBe(true);
    expect(notes.some((n) => /not for construction/.test(n))).toBe(true);
    expect(notes.some((n) => /Circuit tags/.test(n))).toBe(true);
    expect(notes.some((n) => /Cable trays/.test(n))).toBe(false);
  });

  describe('containment layout', () => {
    const run = tray('S1', [[2000, 3000], [18000, 3000]]);

    it('is offered only for levels with trays or cable routes drawn, numbered in its own series', () => {
      const p = villa();
      expect(planLevels(p, 'containment')).toEqual([]); // a DB is placed, but no containment is drawn
      expect(addPlanSheets(setOf(p), p, 'containment').ids).toEqual([]);
      expect(planLevels(drawn(p, [{ id: 'S9', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [5000, 0]] }]), 'containment')).toEqual([]); // nor a plain line
      const q = drawn(p, [run]);
      expect(planLevels(q, 'containment').map((l) => l.name)).toEqual(['Ground floor']);
      const { set, sheets } = sheetOf(q, 'containment');
      expect(sheets.map((s) => [s.number, s.title, s.scale, sheetType(s)])).toEqual([['E-CNT-001', 'Ground floor · Containment layout', '1:100', 'plan']]);
      const both = addPlanSheets(set, q, 'lighting').set;
      expect(both.sheets.map((s) => s.number)).toEqual(['E-CNT-001', 'E-LTG-001']);
      expect(addPlanSheets(both, q, 'containment').ids).toEqual([]);
    });

    it('draws a tray at its true scale, a heavy line broken for its label', () => {
      const p = drawn(villa(), [run]);
      const d = planDrawing(p, sheetOf(p, 'containment').sheets[0])!;
      expect(d.size).toBe('A3');
      expect(d.svg).toContain('GROUND FLOOR · CONTAINMENT LAYOUT');
      expect(d.svg).toContain('DB-GF1'); // the DB it runs to
      expect(d.svg).not.toMatch(/<circle cx="[\d.]+" cy="[\d.]+" r="1.8"/); // no lights or sockets
      // 16 m at 1:100 is 160 mm, broken in the middle for 16 characters of text.
      const pts = pathPts(heavy(d.svg));
      expect(pts).toHaveLength(4);
      expect(pts[3][0] - pts[0][0]).toBeCloseTo(160, 1);
      expect(pts[2][0] - pts[1][0]).toBeCloseTo(0.6 * 2.5 * 16 + 2.5, 1);
      const [label] = textsOf(d.svg, 'CT 300 POWER · A');
      expect(label.x).toBeCloseTo((pts[0][0] + pts[3][0]) / 2, 1);
      expect(label.rot).toBeCloseTo(0, 5);
      expect(label.y).toBeGreaterThan(pts[0][1]); // the baseline below the line, so the text is centred on it
      expect(d.legendSvg).toMatch(/LEGEND · CONTAINMENT LAYOUT/);
      expect(d.legendSvg).toMatch(/>CT 300 POWER · A<\/text>.*>16\.0 m<\/text>/s);
      expect(d.legendSvg).toContain('Distribution board');
      expect(d.legendSvg).not.toContain('Cable route');
      // Black and white only.
      expect([...d.svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,6})"/gi)].every((m) => /^#(000|fff|8c8c8c)$/i.test(m[1]))).toBe(true);
      // At 1:50 it is 320 mm, too long for A3, and the paper follows.
      const big = planDrawing(p, { ...sheetOf(p, 'containment').sheets[0], scale: '1:50' })!;
      const at50 = pathPts(heavy(big.svg));
      expect(at50[3][0] - at50[0][0]).toBeCloseTo(320, 1);
      expect(big.size).toBe('A2');
    });

    it('reads the drawing in the units of its plan file', () => {
      const inMetres = drawn(villa(), [tray('S1', [[2, 3], [18, 3]])], 6);
      const pts = pathPts(heavy(planDrawing(inMetres, sheetOf(inMetres, 'containment').sheets[0])!.svg));
      expect(pts[3][0] - pts[0][0]).toBeCloseTo(160, 1);
      // The engineer's choice for the file wins over what the drawing says.
      const chosen = { ...inMetres, cadPlanUnits: { 'gf.dwg': 'mm' as const } };
      const small = pathPts(heavy(planDrawing(chosen, sheetOf(chosen, 'containment').sheets[0])!.svg));
      expect(small[small.length - 1][0] - small[0][0]).toBeCloseTo(0.16, 1);
    });

    it('takes the paper from the runs as well as the rooms', () => {
      const p = drawn(villa(), [tray('S1', [[2000, 3000], [40000, 3000]])]); // past the 20 m room: 42 m wide, 420 mm at 1:100
      expect(planDrawing(p, sheetOf(p, 'containment').sheets[0])!.size).toBe('A2');
    });

    it('turns a label with its run, never upside down', () => {
      const p = drawn(villa(), [tray('S1', [[3000, 11000], [3000, 1000]])]); // drawn downward
      const d = planDrawing(p, sheetOf(p, 'containment').sheets[0])!;
      expect(textsOf(d.svg, 'CT 300 POWER · A')[0].rot).toBeCloseTo(-90, 1); // reads up the sheet
      const [page] = buildSheetDxfPages(p, d.svg, d.size, { no: 'E-CNT-001', title: 'Containment', index: 1, count: 1, legendSvg: d.legendSvg, scale: '1:100' });
      expect(page.data).toMatch(/CT 300 POWER - A/);
      expect(page.data).toMatch(/\n50\r?\n90\r?\n/); // the same turn in the DXF
    });

    it('tags cable routes with their cable and size, stacking the tags of routes on one path', () => {
      const path: Pt[] = [[2000, 5000], [18000, 5000]];
      const p = drawn(villa(), [route('S1', path, 'DB-GF1-Y1'), route('S2', path, 'INC-DBGF1'), route('S3', path, 'GONE')]);
      const d = planDrawing(p, sheetOf(p, 'containment').sheets[0])!;
      expect(pathPts(dashed(d.svg))).toHaveLength(4); // two routes; the one whose circuit is gone is left off
      const texts = [...d.svg.matchAll(/transform="rotate[^>]*>([^<]+)</g)].map((m) => m[1]);
      expect(texts).toHaveLength(2);
      expect(texts[0]).toMatch(/^DB-GF1\/Y1 · \dC × [\d.]+ mm²$/);
      expect(texts[1]).toMatch(/→ DB-GF1 · /);
      expect(d.svg).not.toContain('GONE');
      const [a] = textsOf(d.svg, texts[0]), [b] = textsOf(d.svg, texts[1]);
      expect(a.x).toBeCloseTo(b.x, 1);
      expect(a.y - b.y).toBeCloseTo(3, 1);
      expect(d.legendSvg).toContain('Cable route, with its cable and size');
      // Only the plan's bits of text survive into R12: the arrow is spelled out.
      const [page] = buildSheetDxfPages(p, d.svg, d.size, { no: 'E-CNT-001', title: 'Containment', index: 1, count: 1, legendSvg: d.legendSvg, scale: '1:100' });
      expect(page.data).toMatch(/ -> DB-GF1 - /);
    });

    it('does not stack tags that do not meet', () => {
      const p = drawn(villa(), [route('S1', [[2000, 5000], [18000, 5000]], 'DB-GF1-Y1'), route('S2', [[2000, 9000], [18000, 9000]], 'DB-GF1-B6')]);
      const d = planDrawing(p, sheetOf(p, 'containment').sheets[0])!;
      const y = [...d.svg.matchAll(/<text x="[\d.-]+" y="([\d.-]+)" transform="rotate/g)].map((m) => Number(m[1]));
      expect(y[0] - y[1]).toBeCloseTo(40, 1); // 4 m apart at 1:100, each its own distance above its line
    });

    it('moves a route\'s tag off a tray label beside it, and never the tray label', () => {
      const p = drawn(villa(), [tray('S1', [[2000, 5000], [18000, 5000]]), route('S2', [[2000, 5300], [18000, 5300]], 'DB-GF1-Y1')]);
      const d = planDrawing(p, sheetOf(p, 'containment').sheets[0])!;
      const line = pathPts(heavy(d.svg))[0][1];
      const [label] = textsOf(d.svg, 'CT 300 POWER · A');
      expect(label.y).toBeCloseTo(line + 0.35 * 2.5, 1);
      const tag = [...d.svg.matchAll(/<text x="[\d.-]+" y="([\d.-]+)" transform="rotate[^>]*>(DB-GF1[^<]*)</g)][0];
      expect(Number(tag[1])).toBeLessThan(label.y - 2.5);
    });

    it('leaves a route out of a tray label it runs through, but not one running beside it', () => {
      const along = drawn(villa(), [tray('S1', [[2000, 5000], [18000, 5000]]), route('S2', [[2000, 5000], [18000, 5000]], 'DB-GF1-Y1')]);
      const d = planDrawing(along, sheetOf(along, 'containment').sheets[0])!;
      const t = pathPts(heavy(d.svg)), r = pathPts(dashed(d.svg));
      expect(r).toHaveLength(4);
      expect(r[1][0]).toBeCloseTo(t[1][0], 1); // the route stops where the tray's line stops for its label
      expect(r[2][0]).toBeCloseTo(t[2][0], 1);
      // Across a label too, whichever way the label runs.
      const across = drawn(villa(), [tray('S1', [[10000, 2000], [10000, 10000]]), route('S2', [[6000, 6000], [14000, 6000]], 'DB-GF1-Y1')]);
      const cut = pathPts(dashed(planDrawing(across, sheetOf(across, 'containment').sheets[0])!.svg));
      expect(cut).toHaveLength(4);
      expect(cut[2][0] - cut[1][0]).toBeCloseTo(2.5, 1); // the label's height on paper
      // A route a metre to the side is whole.
      const beside = drawn(villa(), [tray('S1', [[2000, 5000], [18000, 5000]]), route('S2', [[2000, 6000], [18000, 6000]], 'DB-GF1-Y1')]);
      expect(pathPts(dashed(planDrawing(beside, sheetOf(beside, 'containment').sheets[0])!.svg))).toHaveLength(2);
    });

    it('counts the fittings on the sheet in the legend', () => {
      const p = drawn(villa(), [tray('S1', [[2000, 2000], [10000, 2000], [10000, 10000]])]);
      const d = planDrawing(p, sheetOf(p, 'containment').sheets[0])!;
      expect(d.legendSvg).toMatch(/>Bend 90° 300<\/text>.*>1<\/text>/s);
      expect(d.legendSvg).toMatch(/>16\.0 m<\/text>/);
    });

    it('labels a run on every part of a split level, except a piece too short for its label', () => {
      // 202 m wide: three A1 parts of 67.3 m, split at x = 66.3 and 133.7 m.
      const p = drawn(villa(200), [tray('S1', [[5000, 3000], [195000, 3000]]), tray('S2', [[10000, 8000], [66800, 8000]], 150, 'ELV', 'B')]);
      const { set, sheets } = sheetOf(p, 'containment');
      expect(sheets.map((s) => s.number)).toEqual(['E-CNT-001', 'E-CNT-002', 'E-CNT-003']);
      const numberOf = (part: number) => set.sheets.find((x) => x.part === part)?.number;
      const [a, b, c] = sheets.map((s) => planDrawing(p, s, numberOf)!);
      for (const d of [a, b, c]) expect(textsOf(d.svg, 'CT 300 POWER · A')).toHaveLength(1);
      expect(b.svg).toContain('MATCH LINE · SEE E-CNT-001');
      // The second tray ends 0.5 m into part 2: its label stays on part 1, but the piece is drawn and counted.
      expect(textsOf(a.svg, 'CT 150 ELV · B')).toHaveLength(1);
      expect(textsOf(b.svg, 'CT 150 ELV · B')).toHaveLength(0);
      expect(b.legendSvg).toMatch(/>CT 150 ELV · B<\/text>.*>0\.5 m<\/text>/s);
      // The tray's lengths on the three sheets add up to the run.
      const shown = [a, b, c].map((d) => Number(new RegExp('>CT 300 POWER · A</text>.*?>([\\d.]+) m</text>', 's').exec(d.legendSvg)![1]));
      expect(shown.reduce((t, m) => t + m, 0)).toBeCloseTo(190, 0);
    });

    it('keeps a short run\'s label when the whole run shows', () => {
      const p = drawn(villa(200), [tray('S1', [[10000, 3000], [11000, 3000]])]); // 1 m, shorter than its label
      const parts = sheetOf(p, 'containment').sheets.map((s) => planDrawing(p, s)!);
      expect(parts.flatMap((d) => textsOf(d.svg, 'CT 300 POWER · A'))).toHaveLength(1);
    });

    it('explains CT as a cable tray, on the sheet and in its DXF', () => {
      const p = drawn(villa(), [run]);
      const d = planDrawing(p, sheetOf(p, 'containment').sheets[0])!;
      expect(abbreviationsIn(d.svg)).toContainEqual(['CT', 'Cable tray']);
      const html = buildSldSheetHtml(p, d.svg, d.size, { no: 'E-CNT-001', title: 'Containment', index: 1, count: 1, legendSvg: d.legendSvg, scale: '1:100' });
      expect(html).toContain('Cable tray');
      expect(html).not.toContain('Current transformer');
      const [page] = buildSheetDxfPages(p, d.svg, d.size, { no: 'E-CNT-001', title: 'Containment', index: 1, count: 1, legendSvg: d.legendSvg, scale: '1:100' });
      expect(page.data).toContain('Cable tray');
      expect(page.data).not.toContain('Current transformer');
      // The other layouts give it no meaning of their own.
      expect(planDrawing(p, sheetOf(p, 'lighting').sheets[0])!.svg).not.toContain('data-abbr');
    });

    it('notes how to read the sheet', () => {
      const p = drawn(villa(), [run]);
      const notes = planNotes(p, sheetOf(p, 'containment').sheets[0]);
      expect(notes.some((n) => /Cable trays as a single line/.test(n))).toBe(true);
      expect(notes.some((n) => /Circuit tags/.test(n))).toBe(false);
      expect(notes.some((n) => /not for construction/.test(n))).toBe(true);
    });
  });

  describe('fingerprint: an issued plan sheet is changed when what it draws changes', () => {
    const lightsMoved = (p: Project): Project => ({ ...p, lvPoints: p.lvPoints!.map((d) => (d.type === 'ltg' ? { ...d, x: d.x + 1 } : d)) });
    const socketMoved = (p: Project): Project => ({ ...p, lvPoints: p.lvPoints!.map((d) => (d.type === 's13' ? { ...d, x: d.x - 1 } : d)) });
    const hashOf = (p: Project, type: PlanType) => { const { set, sheets } = sheetOf(p, type); return (q: Project) => sheetHash(q, set, sheets[0]); };

    it('a device changes its own layout only', () => {
      const p = villa();
      const lighting = hashOf(p, 'lighting'), power = hashOf(p, 'power');
      expect(lighting(lightsMoved(p))).not.toBe(lighting(p));
      expect(power(lightsMoved(p))).toBe(power(p));
      expect(power(socketMoved(p))).not.toBe(power(p));
      expect(lighting(socketMoved(p))).toBe(lighting(p));
    });

    it('the DB, the rooms, the wiring tag and the scale change it; another level does not', () => {
      const p = villa();
      const { set, sheets: [s] } = sheetOf(p);
      const h = sheetHash(p, set, s);
      const hash = (q: Project) => sheetHash(q, set, s);
      expect(hash({ ...p, boards: p.boards.map((b) => (b.id === 'DB-GF1' ? { ...b, planPoint: { x: 2, y: 2 } } : b)) })).not.toBe(h);
      expect(hash({ ...p, building: { ...p.building!, rooms: p.building!.rooms!.map((r) => ({ ...r, name: 'Hall' })) } })).not.toBe(h);
      expect(hash({ ...p, feeders: p.feeders.map((f) => (f.id === 'DB-GF1-Y1' ? { ...f, cableCsaMm2: 4 } : f)) })).not.toBe(h);
      expect(hash({ ...p, feeders: p.feeders.map((f) => (f.id === 'DB-GF1-Y1' ? { ...f, breakerRatingA: 32 } : f)) })).toBe(h); // not printed here
      expect(hash({ ...p, cadLength: { dropM: 3 } })).not.toBe(h); // the tag's length
      expect(sheetHash(p, set, { ...s, scale: '1:50' })).not.toBe(h);
      const ff = placeLvPoint(p, { building: 'V', level: 'FF' }, 'ltg', 'DB-GF1-R3', 5, 5).project;
      expect(hash(ff)).toBe(h);
      // A wired circuit's points on another level do change it: its length is on the tag.
      expect(hash(placeLvPoint(p, { building: 'V', level: 'FF' }, 'ltg', 'DB-GF1-Y1', 5, 5).project)).not.toBe(h);
    });

    it('the runs drawn, and the cable a route is tagged with, change a containment sheet', () => {
      const p = drawn(villa(), [tray('S1', [[2000, 3000], [18000, 3000]]), route('S2', [[2000, 5000], [18000, 5000]], 'DB-GF1-Y1')]);
      const { set, sheets: [s] } = sheetOf(p, 'containment');
      const h = sheetHash(p, set, s);
      const items = p.cadSketch![0].items;
      const hash = (q: Project) => sheetHash(q, set, s);
      expect(hash(drawn(p, [{ ...items[0], pts: [[2000, 3000], [19000, 3000]] }, items[1]]))).not.toBe(h);
      expect(hash(drawn(p, [{ ...items[0], tray: { widthMm: 450, service: 'Power', route: 'A' } }, items[1]]))).not.toBe(h);
      expect(hash(drawn(p, [items[0]]))).not.toBe(h);
      expect(hash({ ...p, feeders: p.feeders.map((f) => (f.id === 'DB-GF1-Y1' ? { ...f, cableCsaMm2: 4 } : f)) })).not.toBe(h);
      expect(hash(drawn(p, items, 6))).not.toBe(h); // the plan now reads in metres
      // What the sheet does not draw: another drawn line, and the lights.
      expect(hash(drawn(p, [...items, { id: 'S9', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [5, 5]] }]))).toBe(h);
      expect(hash(lightsMoved(p))).toBe(h);
    });

    it('an ELV sheet follows its devices', () => {
      const device = { id: 'E1', type: 'smoke-detector' as const, buildingId: 'V', levelId: 'GF', x: 5, y: 5 };
      const p: Project = { ...villa(), elvDevices: [device] };
      const elv = hashOf(p, 'elv');
      expect(elv({ ...p, elvDevices: [{ ...device, x: 6 }] })).not.toBe(elv(p));
      expect(elv(lightsMoved(p))).toBe(elv(p));
    });

    it('flags a sheet issued now; one issued before keeps its fingerprint', () => {
      const p = villa();
      const { set, sheets: [s] } = sheetOf(p);
      const issued = issueSheets(set, [s.id], { date: '2026-11-01', purpose: 'FOR APPROVAL', description: '', bump: true }, undefined, (x) => sheetHash(p, set, x)).set;
      expect(sheetChecks(p, issued).some((c) => c.text.includes('changed since'))).toBe(false);
      expect(sheetChecks(lightsMoved(p), issued).some((c) => c.text.includes(`${s.number} changed since`))).toBe(true);
      const before: DrawingSheet = { ...s, issuedHash: 'x', issuedHashV: 2 };
      expect(sheetHash(lightsMoved(p), set, before)).toBe(sheetHash(p, set, before));
    });
  });
});
