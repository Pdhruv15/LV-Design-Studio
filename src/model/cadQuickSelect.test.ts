import { describe, expect, it } from 'vitest';
import type { SketchItem } from '../types';
import { qsFields, qsKinds, qsValues, quickSelect, selectSimilar, wildcard } from './cadQuickSelect';

const K = 0.001; // drawing units mm
const line = (id: string, layer: string, len: number, more: Partial<SketchItem> = {}): SketchItem => ({ id, kind: 'line', layer, pts: [[0, 0], [len, 0]], ...more });
const items: SketchItem[] = [
  line('l1', 'E-POWER', 3000), line('l2', 'E-POWER', 1500, { color: '#ff0000' }), line('l3', 'LV-SKETCH', 3000, { lt: 'dashed' }),
  { id: 'c1', kind: 'circle', layer: 'E-POWER', pts: [[0, 0]], r: 150 }, { id: 'c2', kind: 'circle', layer: 'E-LIGHT', pts: [[0, 0]], r: 600 },
  { id: 't1', kind: 'text', layer: 'E-POWER', pts: [[0, 0]], text: 'DB-1', h: 250 }, { id: 't2', kind: 'text', layer: 'E-POWER', pts: [[0, 0]], text: 'DB-12', h: 250 },
  { id: 'tr', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [5000, 0]], tray: { widthMm: 300, service: 'POWER' } }, { id: 'tr2', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [2000, 0]], tray: { widthMm: 300, service: 'POWER' } },
  { id: 'tr3', kind: 'pline', layer: 'E-TRAY', pts: [[0, 0], [2000, 0]], tray: { widthMm: 150, service: 'ELV' } }
];
const ids = (xs: SketchItem[]) => xs.map((x) => x.id);

describe('QSELECT', () => {
  it('offers the kinds present with their counts, and a kind\'s properties as the palette shows them', () => {
    expect(qsKinds(items).map((k) => `${k.label}:${k.n}`)).toEqual(['All:10', 'Line:3', 'Circle:2', 'Text:2', 'Cable tray:3']);
    expect(qsFields('', items).map((f) => f.key)).toEqual(['layer', 'color', 'lt', 'lw']);
    expect(qsFields('Circle', items).map((f) => f.label)).toEqual(['Layer', 'Colour', 'Linetype', 'Lineweight', 'Centre X', 'Centre Y', 'Radius']);
    expect(qsFields('Text', items).map((f) => f.key)).toContain('text');
    expect(qsValues(items, 'layer', K)).toEqual(['E-LIGHT', 'E-POWER', 'E-TRAY', 'LV-SKETCH']);
    expect(qsValues(items, 'color', K)).toEqual(['#ff0000', 'ByLayer']);
    expect(qsValues(items, 'lt', K)).toEqual(['ByLayer', 'dashed']);
  });
  it('compares text with =, ≠ and * (wildcards), case ignored', () => {
    expect(ids(quickSelect(items, { kind: '', key: 'layer', op: '=', value: 'e-power' }, K))).toEqual(['l1', 'l2', 'c1', 't1', 't2']);
    expect(ids(quickSelect(items, { kind: 'Line', key: 'layer', op: '≠', value: 'E-POWER' }, K))).toEqual(['l3']);
    expect(ids(quickSelect(items, { kind: 'Text', key: 'text', op: '*', value: 'DB-?' }, K))).toEqual(['t1']);
    expect(ids(quickSelect(items, { kind: '', key: 'layer', op: '*', value: 'E-*' }, K)).length).toBe(9);
    expect(wildcard('L?-*')('LV-SKETCH')).toBe(true); expect(wildcard('L?-*')('E-POWER')).toBe(false);
    expect(wildcard('a.b')('axb')).toBe(false); // a dot is a dot
  });
  it('compares numbers in metres and degrees, >, < and = within a millionth', () => {
    expect(ids(quickSelect(items, { kind: 'Circle', key: 'r', op: '=', value: '0.15' }, K))).toEqual(['c1']);
    expect(ids(quickSelect(items, { kind: 'Circle', key: 'r', op: '>', value: '0.15 m' }, K))).toEqual(['c2']);
    expect(ids(quickSelect(items, { kind: 'Line', key: 'len', op: '<', value: '3' }, K))).toEqual(['l2']);
    expect(ids(quickSelect(items, { kind: 'Line', key: 'len', op: '=', value: '3,0' }, K))).toEqual(['l1', 'l3']);
    expect(quickSelect(items, { kind: 'Line', key: 'len', op: '>', value: 'abc' }, K)).toEqual([]);
  });
  it('selects all of a kind, excludes instead of includes, and answers nothing when nothing matches', () => {
    expect(ids(quickSelect(items, { kind: 'Text', key: 'layer', op: 'all', value: '' }, K))).toEqual(['t1', 't2']);
    expect(ids(quickSelect(items, { kind: 'Line', key: 'layer', op: '=', value: 'E-POWER', exclude: true }, K))).toEqual(['l3']);
    expect(quickSelect(items, { kind: 'Text', key: 'layer', op: 'all', value: '', exclude: true }, K)).toEqual([]);
    expect(quickSelect(items, { kind: 'Circle', key: 'layer', op: '=', value: 'E-TRAY' }, K)).toEqual([]);
  });
});

describe('SELECTSIMILAR', () => {
  it('picks the same kind and layer; a tray its width and service too; colour and linetype only when asked', () => {
    expect(ids(selectSimilar(items, [items[0]]))).toEqual(['l1', 'l2']);
    expect(ids(selectSimilar(items, [items[0]], { colour: true, linetype: false }))).toEqual(['l1']);
    expect(ids(selectSimilar(items, [items[7]]))).toEqual(['tr', 'tr2']);
    expect(ids(selectSimilar(items, [items[3], items[5]]))).toEqual(['c1', 't1', 't2']);
    expect(selectSimilar(items, [])).toEqual([]);
  });
});
