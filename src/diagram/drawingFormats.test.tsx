// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sampleProject } from '../data/sampleProject';
import { newBuilding } from '../calc/building';
import { generateBuildingDbs } from '../calc/buildingDesign';
import { evaluateProject } from '../calc/electrical';
import { boardTotals } from '../calc/summary';
import SingleLineDiagram from '../components/SingleLineDiagram';
import SystemDiagram from '../components/SystemDiagram';
import { boardIncomerLabel } from '../docs/loadScheduleDoc';
import { buildSldSheetHtml, pageTitleBlock, sheetTitleBlock, titleBlockOf } from '../docs/sldSheet';
import { panelSummary } from '../docs/mdSheet';
import { fillParams } from '../model/params';
import { issueRevision, revisionStamp } from '../model/revisions';
import { standardTemplate, titleBlockHtml } from '../model/titleBlock';
import type { Project } from '../types';
import { fmtFixed } from '../util/format';
import { buildAnnotations } from './annotations';
import { boardSheetSvg } from './boardSheet';
import FeederRiserDiagram from './FeederRiserDiagram';
import RiserDiagram from './RiserDiagram';

const noop = () => {};
/** The sample with its loads ×40, so thousands show. */
const project: Project = { ...sampleProject, feeders: sampleProject.feeders.map((f) => ({ ...f, loadKw: f.loadKw * 40 })) };
const results = evaluateProject(project);
const LAYERS = { current: true, voltage: true, vd: true, fault: true, pf: true, loading: true };

const sld = (p = project) => renderToStaticMarkup(createElement(SystemDiagram, {
  project: p, calcProject: p, results, annotations: buildAnnotations(p, results), layers: LAYERS,
  selectedFeederId: null, selectedBoardId: null, onSelectFeeder: noop, onSelectBoard: noop
}));
const textsOf = (markup: string) => [...markup.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const board = (id: string) => project.boards.find((b) => b.id === id)!;

describe('SLD labels', () => {
  const texts = textsOf(sld());
  const gf = panelSummary(project, board('SMDB-GF'));
  const db = panelSummary(project, board('DB-GF1'));

  it('add the comma and keep their compact decimals', () => {
    expect(gf.tclKw).toBeGreaterThan(1000);
    expect(texts).toContain(`TCL = ${fmtFixed(gf.tclKw, 2)} kW`);
    expect(texts).toContain(`MDL = ${fmtFixed(gf.mdlKw, 2)} kW`);
    const f = project.feeders.find((x) => x.id === 'GF-LTG')!;
    expect(texts).toContain(`TCL : ${fmtFixed(f.loadKw, 2)} kW`);
    const r = results.find((x) => x.feeder.id === 'GF-LTG')!;
    expect(r.ib).toBeGreaterThan(1000);
    expect(texts).toContain(`${fmtFixed(r.ib, 0)} A`);
    expect(texts).toContain(`${fmtFixed(r.loadingPct, 0)}% of In`);
    expect(texts.some((t) => /^\d{1,3}(,\d{3})+% loaded$/.test(t))).toBe(true);
  });

  it('a board label under its symbol matches the circuit labels', () => {
    expect(db.tclKw).toBeGreaterThan(1000);
    expect(texts).toContain(`TCL ${fmtFixed(db.tclKw, 2)} · MDL ${fmtFixed(db.mdlKw, 2)} kW`);
  });

  it('never print a large calculated value without its comma', () => {
    const labels = texts.filter((t) => /\b(TCL|MDL|kW|% of In|% loaded)\b|^\d+ A$/.test(t));
    expect(labels.length).toBeGreaterThan(20);
    for (const t of labels) expect(t, t).not.toMatch(/(?<![\d,.-])\d{4,}(\.\d+)?(?! kVA)/);
  });

  it('keep ratings as written', () => {
    expect(texts.join(' ')).toMatch(/1600 A TP/);
    expect(texts.join(' ')).toContain('1000 kVA');
    expect(texts.join(' ')).not.toMatch(/1,600 A|1,000 kVA/);
  });

  it('do not change where anything is drawn', () => {
    // Only the words differ between a project and its copy with far smaller loads: the same boxes, lines and text positions.
    const small = sld(sampleProject);
    const big = sld();
    const shape = (m: string) => m.replace(/<text([^>]*)>[^<]*<\/text>/g, '<text$1>').replace(/ class="[^"]*"/g, '').replace(/<title>[^<]*<\/title>/g, '').replace(/ stroke="[^"]*"/g, '');
    expect(shape(big).length).toBeGreaterThan(1000);
    expect(shape(big).match(/<(line|path|rect|circle)\b/g)!.length).toBe(shape(small).match(/<(line|path|rect|circle)\b/g)!.length);
    expect([...shape(big).matchAll(/<text[^>]* x="([\d.-]+)" y="([\d.-]+)"/g)].slice(0, 60).map((m) => m.slice(1))).toEqual([...shape(small).matchAll(/<text[^>]* x="([\d.-]+)" y="([\d.-]+)"/g)].slice(0, 60).map((m) => m.slice(1)));
  });
});

describe('board sheets', () => {
  it('write loads and currents with a comma in the one-line drawing', () => {
    const b = board('MDB-1');
    const here = results.filter((r) => r.feeder.boardId === b.id);
    const summary = panelSummary(project, b);
    const svg = renderToStaticMarkup(createElement(SingleLineDiagram, { board: b, voltageV: project.voltageV, incomerLabel: boardIncomerLabel(project, b), project, results: here, selected: null, onSelect: noop, summary: { ...summary, loc: 'Room' } }));
    const s = panelSummary(project, board('SMDB-GF'));
    expect(svg).toContain(`>TCL ${fmtFixed(s.tclKw, 2)} kW<`);
    expect(svg).toContain(`>TCL : ${fmtFixed(summary.tclKw, 2)} kW<`);
    const r = here.find((x) => x.feeder.id === 'INC-GF')!;
    expect(svg).toContain(`>${fmtFixed(r.loadingPct, 0)}% of ${r.feeder.breakerRatingA} A<`);
  });

  it('write the summary and the circuit table the same way', () => {
    const b = board('SMDB-GF');
    const { svg } = boardSheetSvg(project, b, results);
    const s = panelSummary(project, b);
    expect(svg).toContain(`${fmtFixed(s.tclKw, 2)} kW / ${s.df.toFixed(2)} / ${fmtFixed(s.mdlKw, 2)} kW`);
    const r = results.find((x) => x.feeder.id === 'GF-LTG')!;
    expect(svg).toContain(`>${fmtFixed(r.ib, 1)}<`);
    expect(svg).toContain(`>${fmtFixed(r.feeder.loadKw * r.feeder.demandFactor, 2)} kW<`);
  });
});

describe('risers', () => {
  const b = { ...newBuilding('T1', 'Tower'), riser: { horizontalM: 20, perDbM: 10 } };
  b.levels = [{ id: 'G', name: 'Ground', kind: 'ground', heightM: 4.5 }, { id: 'T', name: 'Typical', kind: 'typical', heightM: 3.5, count: 2 }];
  const withBuilding = { ...project, building: { buildings: [b], rooms: [{ id: 'R1', buildingId: 'T1', levelId: 'G', name: 'Lobby', type: 'lobby', areaM2: 200 }], unitTypes: [] } } as unknown as Project;
  const p = generateBuildingDbs(withBuilding, 'T1', 'MDB-1').project;

  it('write loads with a comma', () => {
    const riser = renderToStaticMarkup(createElement(RiserDiagram, { project: p, buildingId: 'T1' }));
    expect(riser).toMatch(/>[^<]*\d{1,3},\d{3} kW</);
    const feeders = renderToStaticMarkup(createElement(FeederRiserDiagram, { project: p, buildingId: 'T1' }));
    expect(feeders).toContain(`TCL ${fmtFixed(boardTotals(p, 'MDB-1').connectedKw, 1)} kW`);
  });
});

describe('title block dates', () => {
  const issued = issueRevision(sampleProject, { description: 'First', date: '2026-10-15', by: 'QA' });
  const info = { no: 'E-1', title: 'SLD', index: 1, count: 1, rev: 'B', date: '2026-11-01', history: [{ id: 'B', date: '2026-11-01', description: 'Second' }] };

  it('the project title block and its history', () => {
    const t = titleBlockOf(issued);
    expect(t.date).toBe('15 Oct 2026');
    expect(t.history[0].date).toBe('15 Oct 2026');
    expect(titleBlockOf(sampleProject, '2026-11-01').date).toBe('1 Nov 2026');
  });

  it('a sheet of a set, with its own date and history', () => {
    const t = sheetTitleBlock(issued, info);
    expect(t.date).toBe('1 Nov 2026');
    expect(t.history[0].date).toBe('1 Nov 2026');
    const html = buildSldSheetHtml(issued, '<svg></svg>', 'A3', info);
    expect(html).toContain('1 Nov 2026');
    expect(html).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(pageTitleBlock(issued, info, 'A3').html).toContain('1 Nov 2026');
  });

  it('a date typed as text stays as typed', () => {
    expect(sheetTitleBlock(issued, { ...info, date: 'Mid November' }).date).toBe('Mid November');
  });

  it('a template and its {RevDate} field', () => {
    expect(fillParams('{RevDate}', issued)).toBe('15 Oct 2026');
    expect(fillParams('{RevDate}', sampleProject)).toBe('');
    const template = standardTemplate();
    const html = titleBlockHtml(template, { ...issued, titleTemplates: [template] }, {});
    expect(html).toContain('15 Oct 2026');
    expect(html).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
    expect(revisionStamp(issued)).toBe('REV A · 15 Oct 2026');
  });
});
