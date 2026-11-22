import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Board, Project } from '../types';
import { supplyLines, supplyReach } from './panelLabels';
import { supplyMode, supplyPoint } from './supplyPoint';
import { textWidth } from './panelLabels';

const project = (b: Board): Project => ({ ...sampleProject, voltageV: 415, boards: [b] });
const first = (supply?: Board['supply'], more: Partial<Board> = {}): Board => ({ id: 'MDB-A', name: 'MDB-A', kind: 'MDB', ratedCurrentA: 200, ...(supply ? { supply } : {}), ...more });
const point = (b: Board, dewa = false) => supplyPoint(project(b), b, dewa)!;

describe('supplyMode', () => {
  it('says how a first board is supplied; nothing for a board with a board above it', () => {
    expect(supplyMode(first(undefined, { sourceKva: 800 }))).toBe('transformer');
    expect(supplyMode(first(undefined, { rmu: ' RMU-1 ' }))).toBe('transformer');
    expect(supplyMode(first(undefined, { substation: 'SS-1' }))).toBe('transformer');
    expect(supplyMode(first({}))).toBe('source');
    expect(supplyMode(first({ fedBy: 'source' }))).toBe('source');
    expect(supplyMode(first({ fedBy: 'board' }))).toBe('board');
    expect(supplyMode(first())).toBe('unset');
    expect(supplyMode(first(undefined, { rmu: '  ', substation: '' }))).toBe('unset');
    expect(supplyMode(first({}, { upstreamId: 'X' }))).toBeUndefined();
  });
  it('a transformer wins over a supply block; no model for it', () => {
    const b = first({ fedFrom: 'X' }, { sourceKva: 500 });
    expect(supplyMode(b)).toBe('transformer');
    expect(supplyPoint(project(b), b, false)).toBeUndefined();
  });
});

describe('supplyPoint: source', () => {
  it('has no name: "Source", and never a supplier', () => {
    const p = point(first({}));
    expect(p.mode).toBe('source');
    expect(p.title).toBe('Source');
    expect(JSON.stringify(p)).not.toMatch(/DEWA|AUTHORITY/i);
    expect(point(first({ fedFrom: '   ' })).title).toBe('Source');
    expect(point(first({}), true).lines).toContain('CABLE BY THE SUPPLIER');
  });
  it('a named utility is "<name> supply"; any other kind is the name itself', () => {
    expect(point(first({ fedFrom: ' Grid ' })).title).toBe('Grid supply');
    expect(point(first({ fedFrom: 'Grid', kind: 'utility' })).title).toBe('Grid supply');
    expect(point(first({ fedFrom: 'Genset 1', kind: 'generator' }))).toMatchObject({ title: 'Genset 1', kind: 'generator', meter: true });
    expect(point(first({ kind: 'pv' })).title).toBe('Source');
    expect(point(first({})).kind).toBe('utility');
  });
  it('the legacy named case in the authority style keeps its four strings; the standard style its two', () => {
    const b = first({ fedFrom: 'DEWA', ratingA: 200, device: 'MCCB', faultKa: 36, ctRatio: '400/5A' });
    expect(point(b, true).lines).toEqual(['METER CABINET · CTM 400/5A', '200A TP MCCB 36 kA', 'CABLE BY DEWA · FED FROM DEWA']);
    expect([point(b, true).title, ...point(b, true).lines]).toEqual(['DEWA supply', 'METER CABINET · CTM 400/5A', '200A TP MCCB 36 kA', 'CABLE BY DEWA · FED FROM DEWA']);
    expect(point(b).lines).toEqual(['200 A MCCB', 'Ik″ 36 kA given']);
    expect(point(first({ fedFrom: 'X', meter: 'CT' })).lines[0]).toBe('meter cabinet · CT meter');
  });
  it('the authority style says the fault level when it is assumed or has no device line to stand on', () => {
    expect(point(first({ fedFrom: 'X' }), true).lines).toEqual(['METER CABINET', 'Ik″ 25.2 kA assumed', 'CABLE BY X · FED FROM X']);
    expect(point(first({ faultKa: 20 }), true).lines).toEqual(['METER CABINET', 'Ik″ 20 kA given', 'CABLE BY THE SUPPLIER']);
  });
  it('worked example: 12 kA given, drop used, Ze, device, cable and reference', () => {
    const b = first({ fedBy: 'source', fedFrom: 'Grid', faultKa: 12, vdUsedPct: 1.6, zeOhm: 0.06, ratingA: 63, device: 'MCCB', ref: 'L-12', incomer: { cableCsaMm2: 16, lengthM: 25 } });
    const p = point(b);
    expect(p.lines).toHaveLength(5);
    expect([p.lines[0], p.lines[1], p.lines[2], p.lines[4]]).toEqual(['63 A MCCB', 'Ik″ 12 kA given', 'Drop used 1.6 % · Ze 0.06 Ω', 'Ref. L-12']);
    expect(p.lines[3]).toMatch(/16 mm².* · 25 m$/);
    expect(p.brief).toEqual(['Ik″ 12 kA given', p.lines[3]]);
    expect(p.tooltip).toBe('Grid supply — double-click to edit');
  });
  it('no fault level: assumed from the placeholder source at the project voltage', () => {
    expect(point(first({})).lines).toContain('Ik″ 25.2 kA assumed');
  });
});

describe('supplyPoint: board outside the project', () => {
  it('names the board, says it is not in the project and lists what is given', () => {
    const b = first({ fedBy: 'board', fedFrom: 'SMDB-3F', faultKa: 12, vdUsedPct: 1.6, zeOhm: 0.06, ratingA: 63, device: 'MCCB', meter: 'CT', ref: 'R1', incomer: { cableCsaMm2: 16, lengthM: 25 } });
    const p = point(b);
    expect(p).toMatchObject({ mode: 'board', title: 'From SMDB-3F', meter: false, tooltip: 'Fed from SMDB-3F outside this project — double-click to edit' });
    expect(p.lines[0]).toBe('not in this project');
    expect(p.lines[1]).toBe('Ik″ 12 kA given');
    expect(p.lines[2]).toBe('Drop used 1.6 % · Ze 0.06 Ω');
    expect(p.lines[3]).toBe('63 A MCCB at SMDB-3F · CT meter');
    expect(p.lines[5]).toBe('Ref. R1');
    expect(point(b, true).lines).toEqual(p.lines);
  });
  it('blank name', () => {
    const p = point(first({ fedBy: 'board' }));
    expect(p.title).toBe('From a board not named');
    expect(p.tooltip).toBe('Fed from a board outside this project — double-click to edit');
    expect(p.lines).toEqual(['not in this project', 'Ik″ 25.2 kA assumed']);
  });
});

describe('supplyPoint: unset', () => {
  it('a stub that says so', () => {
    const p = point(first());
    expect(p).toEqual({ mode: 'unset', kind: 'utility', title: 'Supply not set', lines: ['Ik″ 25.2 kA assumed', 'checks: not verified'], brief: ['Ik″ 25.2 kA assumed'], meter: false, tooltip: 'Supply not set — double-click to edit' });
  });
});

describe('supplyLines and supplyReach follow the model', () => {
  it('title first; nothing for a transformer', () => {
    const b = first({ fedFrom: 'Grid' });
    expect(supplyLines(project(b), b, false)).toEqual(['Grid supply', 'meter cabinet', 'Ik″ 25.2 kA assumed']);
    const t = first(undefined, { sourceKva: 500 });
    expect(supplyLines(project(t), t, false)).toEqual([]);
    expect(supplyReach(project(t), t, false)).toBe(0);
  });
  it('reaches by each mode’s own offsets and font sizes', () => {
    const src = first({ fedFrom: 'Grid' });
    expect(supplyReach(project(src), src, false)).toBeCloseTo(Math.max(18 + textWidth('Grid supply', 12, true), 24 + textWidth('Ik″ 25.2 kA assumed', 11)));
    const brd = first({ fedBy: 'board', fedFrom: 'SMDB-3F' });
    expect(supplyReach(project(brd), brd, false)).toBeCloseTo(Math.max(14 + textWidth('From SMDB-3F', 11, true), 14 + textWidth('Ik″ 25.2 kA assumed', 11)));
    const uns = first();
    expect(supplyReach(project(uns), uns, false)).toBeCloseTo(Math.max(14 + textWidth('Supply not set', 12, true), 14 + textWidth('checks: not verified', 11), 14 + textWidth('Ik″ 25.2 kA assumed', 11)));
    expect(supplyReach(project(uns), uns, false)).toBeGreaterThan(60);
  });
});
