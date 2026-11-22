import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { supplyMode } from '../diagram/supplyPoint';
import type { Board, Project } from '../types';
import { BUILT_IN_REFERENCES, applyReference, supplyNameSuggestion } from './designReference';
import { projectInputIssues } from './projectValidate';
import { fedFromOfBoard, losesValues, setFedFrom, setIncomerValue, setSupplyValue, suppliedFromText, type FedFrom } from './supplyEdit';

const project = (b: Board): Project => ({ ...sampleProject, voltageV: 415, designReference: undefined, boards: [b], feeders: [] });
const first = (more: Partial<Board> = {}): Board => ({ id: 'MDB-A', name: 'MDB-A', kind: 'MDB', ratedCurrentA: 200, ...more });
const tx = () => first({ sourceKva: 800, sourceImpedancePct: 5, sourceXr: 6, vectorGroup: 'Dyn11', supply: { cable: '2x185' } });
const src = () => first({ supply: { fedFrom: 'Grid', kind: 'generator', faultKa: 20 } });
const brd = () => first({ supply: { fedFrom: 'SMDB-3F', fedBy: 'board', faultKa: 10 } });
const unset = () => first();
const makers: Record<FedFrom, () => Board> = { transformer: tx, source: src, board: brd, unset };
const modes: FedFrom[] = ['transformer', 'source', 'board', 'unset'];

describe('setFedFrom', () => {
  for (const from of modes) for (const to of modes) {
    it(`${from} -> ${to}`, () => {
      const b = makers[from]();
      const p = project(b);
      const out = setFedFrom(p, b, to);
      expect(fedFromOfBoard(out)).toBe(to);
      expect(supplyMode(out)).toBe(to);
      if (from === to) expect(out).toBe(b);
      const after = projectInputIssues({ ...p, boards: [out] });
      expect(after.length).toBeLessThanOrEqual(projectInputIssues(p).length);
    });
  }

  it('to a transformer keeps the supply block and gives a new one the default size', () => {
    const b = src();
    const out = setFedFrom(project(b), b, 'transformer');
    expect(out.supply).toEqual(b.supply);
    expect(out.sourceKva).toBe(1000);
    expect(out.sourceImpedancePct).toBeGreaterThan(0);
  });
  it('to a source removes the kVA and impedance, keeps X/R and the vector group, and writes no fedBy', () => {
    const out = setFedFrom(project(tx()), tx(), 'source');
    expect(out.sourceKva).toBeUndefined();
    expect(out.sourceImpedancePct).toBeUndefined();
    expect(out.sourceXr).toBe(6);
    expect(out.vectorGroup).toBe('Dyn11');
    expect(out.supply).toEqual({ cable: '2x185' });
    expect('fedBy' in out.supply!).toBe(false);
    const fromBoard = setFedFrom(project(brd()), brd(), 'source');
    expect('fedBy' in fromBoard.supply!).toBe(false);
    expect(fromBoard.supply).toMatchObject({ fedFrom: 'SMDB-3F', faultKa: 10 });
  });
  it('to a board writes fedBy board', () => {
    expect(setFedFrom(project(src()), src(), 'board').supply).toEqual({ ...src().supply, fedBy: 'board' });
    expect(setFedFrom(project(unset()), unset(), 'board').supply).toEqual({ fedBy: 'board' });
  });
  it('to unset removes the transformer, supply, RMU and substation', () => {
    const b = first({ sourceKva: 500, sourceImpedancePct: 5, rmu: 'RMU-1', substation: 'SS-1', supply: { faultKa: 5 } });
    const out = setFedFrom(project(b), b, 'unset');
    expect(out.sourceKva).toBeUndefined();
    expect(out.rmu).toBeUndefined();
    expect(out.substation).toBeUndefined();
    expect(out.supply).toBeUndefined();
  });
  it('a new source takes the name of the applied design reference, when it has one', () => {
    const named = BUILT_IN_REFERENCES.map((r) => applyReference(project(unset()), r)).find((x) => supplyNameSuggestion(x))!;
    const out = setFedFrom(named, unset(), 'source');
    expect(out.supply).toEqual({ fedFrom: supplyNameSuggestion(named) });
  });
  it('a board with only an RMU named is a transformer; leaving it removes nothing silently', () => {
    const b = first({ rmu: 'RMU-1' });
    expect(fedFromOfBoard(b)).toBe('transformer');
    expect(losesValues(b, 'source')).toBe(false); // no rating or impedance goes
    expect(setFedFrom(project(b), b, 'source').rmu).toBe('RMU-1');
  });
  it('a transformer keeps the board rated current both ways', () => {
    const b = first({ ratedCurrentA: 250 });
    const t = setFedFrom(project(b), b, 'transformer');
    expect(t.ratedCurrentA).toBe(250);
    expect(setFedFrom(project(t), t, 'unset').ratedCurrentA).toBe(250);
    const s = src();
    expect(setFedFrom(project(s), setFedFrom(project(s), s, 'transformer'), 'source').ratedCurrentA).toBe(200);
  });
  it('a board outside the project takes no source name and drops the meter, asking first', () => {
    const named = BUILT_IN_REFERENCES.map((r) => applyReference(project(unset()), r)).find((x) => supplyNameSuggestion(x))!;
    expect(setFedFrom(named, unset(), 'board').supply).toEqual({ fedBy: 'board' });
    const m = first({ supply: { fedFrom: 'Grid', meter: 'CT', ratingA: 250 } });
    expect(losesValues(m, 'board')).toBe(true);
    expect(setFedFrom(project(m), m, 'board').supply).toEqual({ fedFrom: 'Grid', ratingA: 250, fedBy: 'board' });
    expect(losesValues(src(), 'board')).toBe(false);
  });
  it('the mode marker alone is not a typed value', () => {
    expect(losesValues(first({ supply: { fedBy: 'board' } }), 'unset')).toBe(false);
  });
});

describe('losesValues', () => {
  it('is true for unset over typed values, and for a transformer going to a source or board', () => {
    expect(losesValues(tx(), 'unset')).toBe(true);
    expect(losesValues(src(), 'unset')).toBe(true);
    expect(losesValues(first({ rmu: 'RMU-1' }), 'unset')).toBe(true);
    expect(losesValues(first({ substation: 'SS-1' }), 'unset')).toBe(true);
    expect(losesValues(tx(), 'source')).toBe(true);
    expect(losesValues(tx(), 'board')).toBe(true);
  });
  it('is false otherwise', () => {
    expect(losesValues(unset(), 'unset')).toBe(false);
    expect(losesValues(first({ supply: {} }), 'unset')).toBe(false);
    expect(losesValues(unset(), 'source')).toBe(false);
    expect(losesValues(unset(), 'transformer')).toBe(false);
    expect(losesValues(src(), 'board')).toBe(false);
    expect(losesValues(brd(), 'source')).toBe(false);
    expect(losesValues(src(), 'transformer')).toBe(false);
    expect(losesValues(tx(), 'transformer')).toBe(false);
  });
});

describe('setSupplyValue', () => {
  it('sets, clears and keeps a typed zero', () => {
    let b = setSupplyValue(unset(), 'faultKa', 25);
    expect(b.supply).toEqual({ faultKa: 25 });
    b = setSupplyValue(b, 'vdUsedPct', 0);
    expect(b.supply).toEqual({ faultKa: 25, vdUsedPct: 0 });
    b = setSupplyValue(b, 'faultKa', undefined);
    expect(b.supply).toEqual({ vdUsedPct: 0 });
    b = setSupplyValue(b, 'ref', '');
    b = setSupplyValue(b, 'xr', NaN);
    expect(b.supply).toEqual({ vdUsedPct: 0 });
  });
  it('never drops the block of an LV-supplied board', () => {
    const b = setSupplyValue(first({ supply: { faultKa: 5 } }), 'faultKa', undefined);
    expect(b.supply).toEqual({});
    expect(supplyMode(b)).toBe('source');
  });
});

describe('setIncomerValue', () => {
  it('a half-typed cable stores 0 for the missing value', () => {
    const a = setIncomerValue(src(), 'cableCsaMm2', 120);
    expect(a.supply!.incomer).toEqual({ cableCsaMm2: 120, lengthM: 0 });
    const b = setIncomerValue(src(), 'lengthM', 30);
    expect(b.supply!.incomer).toEqual({ cableCsaMm2: 0, lengthM: 30 });
    expect(setIncomerValue(a, 'lengthM', 30).supply!.incomer).toEqual({ cableCsaMm2: 120, lengthM: 30 });
  });
  it('parallel runs and the protective conductor that are not above 0 are cleared', () => {
    const a = setIncomerValue(setIncomerValue(src(), 'cableCsaMm2', 95), 'cpcMm2', 16);
    expect(a.supply!.incomer!.cpcMm2).toBe(16);
    expect(setIncomerValue(a, 'cpcMm2', 0).supply!.incomer).toEqual({ cableCsaMm2: 95, lengthM: 0 });
    expect(setIncomerValue(a, 'parallel', 0).supply!.incomer!.parallel).toBeUndefined();
    expect(setIncomerValue(src(), 'parallel', 0).supply!.incomer).toBeUndefined();
  });
  it('removes the cable when size and length are both blank or 0 and nothing else is set', () => {
    let b = setIncomerValue(src(), 'cableCsaMm2', 120);
    b = setIncomerValue(b, 'cableCsaMm2', undefined);
    expect(b.supply!.incomer).toBeUndefined();
    expect('incomer' in b.supply!).toBe(false);
    b = setIncomerValue(setIncomerValue(src(), 'lengthM', 30), 'lengthM', 0);
    expect(b.supply!.incomer).toBeUndefined();
    expect(b.supply).toMatchObject({ fedFrom: 'Grid' });
  });
  it('keeps the cable while another value is set', () => {
    let b = setIncomerValue(src(), 'parallel', 2);
    expect(b.supply!.incomer).toEqual({ cableCsaMm2: 0, lengthM: 0, parallel: 2 });
    b = setIncomerValue(b, 'cores', 3);
    b = setIncomerValue(b, 'installMethod', 'D2');
    expect(b.supply!.incomer).toMatchObject({ cores: 3, installMethod: 'D2' });
    expect(setIncomerValue(b, 'installMethod', undefined).supply!.incomer!.installMethod).toBeUndefined();
  });
});

describe('suppliedFromText', () => {
  it('names the board above, or what feeds a first board', () => {
    expect(suppliedFromText(project(first()), first({ upstreamId: 'MDB-1' }))).toBe('MDB-1');
    expect(suppliedFromText(project(tx()), tx())).toBe('Transformer');
    expect(suppliedFromText(project(unset()), unset())).toBe('Not set');
    expect(suppliedFromText(project(src()), src())).toBe('Grid');
    const plain = first({ supply: {} });
    expect(suppliedFromText(project(plain), plain)).toBe('Source');
    const utility = first({ supply: { fedFrom: 'Grid', kind: 'utility' } });
    expect(suppliedFromText(project(utility), utility)).toBe('Grid supply');
    expect(suppliedFromText(project(brd()), brd())).toBe('SMDB-3F (not in this project)');
    const unnamed = first({ supply: { fedBy: 'board' } });
    expect(suppliedFromText(project(unnamed), unnamed)).toBe('A board not in this project');
  });
});
