import { describe, expect, it } from 'vitest';
import { attributeRows, attributesCsv, cleanTag, feederFor } from './cadAttributes';
import { askedAttdefs, attdefsOf, attributePlacements, attrValue, expandInsert, insertPlainText, type CadBlockDef } from './cadBlocks';
import type { SketchItem } from '../types';

/** Block attributes (S11 of the Design CAD 2D gap plan): values on inserts, what an insert shows, the table. */

const def: CadBlockDef = { name: 'LIGHT', items: [
  { id: 'c', kind: 'circle', layer: '0', pts: [[0, 0]], r: 100 },
  { id: 'a1', kind: 'attdef', layer: '0', pts: [[150, 0]], tag: 'CIRCUIT', prompt: 'Circuit', text: 'L1', h: 50 },
  { id: 'a2', kind: 'attdef', layer: 'LV-ANNO', pts: [[150, -80]], tag: 'WATTS', prompt: 'Load (W)', text: '36', h: 40, att: { invisible: true } },
  { id: 'a3', kind: 'attdef', layer: '0', pts: [[0, 150]], tag: 'TYPE', text: 'LED', h: 40, att: { constant: true } },
  { id: 'a4', kind: 'attdef', layer: '0', pts: [[0, -150]], tag: 'MOUNT', text: 'CEILING', h: 40, att: { preset: true } }
] };
const ins: SketchItem = { id: 'S1', kind: 'insert', layer: 'E-LIGHTING', pts: [[5000, 3000]], block: 'LIGHT', attrs: { CIRCUIT: 'DB1/L3', WATTS: '18', TYPE: 'IGNORED' } };

describe('attributes on inserts', () => {
  it('lists a block\'s attribute definitions, those asked on insert, and the value an insert has for each', () => {
    expect(attdefsOf(def).map((a) => a.tag)).toEqual(['CIRCUIT', 'WATTS', 'TYPE', 'MOUNT']);
    expect(askedAttdefs(def).map((a) => a.tag)).toEqual(['CIRCUIT', 'WATTS']);
    expect(attdefsOf(def).map((a) => attrValue(ins, a))).toEqual(['DB1/L3', '18', 'LED', 'CEILING']); // constant: always its default
    expect(attdefsOf(def).map((a) => attrValue({}, a))).toEqual(['L1', '36', 'LED', 'CEILING']);
    expect(insertPlainText(ins, def)).toBe('DB1/L3\n18\nLED\nCEILING');
  });

  it('shows the values as texts where the definitions sit, invisible ones left out; the DXF gets every attribute placed', () => {
    const shown = expandInsert(ins, [def]);
    expect(shown.map((x) => [x.kind, x.text, x.layer])).toEqual([['circle', undefined, 'E-LIGHTING'], ['text', 'DB1/L3', 'E-LIGHTING'], ['text', 'LED', 'E-LIGHTING'], ['text', 'CEILING', 'E-LIGHTING']]);
    expect(shown[1].pts).toEqual([[5150, 3000]]);
    const placed = attributePlacements({ ...ins, sc: 2 }, [def]);
    expect(placed.map((p) => [p.ad.tag, p.value, p.at.pts[0], p.at.h])).toEqual([['CIRCUIT', 'DB1/L3', [5300, 3000], 100], ['WATTS', '18', [5300, 2840], 80], ['TYPE', 'LED', [5000, 3300], 80], ['MOUNT', 'CEILING', [5000, 2700], 80]]);
    expect(attributePlacements({ ...ins, block: 'NOPE' }, [def])).toEqual([]);
  });

  it('tabulates every attribute of every insert, matches CIRCUIT values to feeders, and writes CSV', () => {
    const items: SketchItem[] = [ins, { ...ins, id: 'S2', pts: [[6000, 3000]], attrs: { CIRCUIT: 'Lights kitchen' } }, { id: 'L', kind: 'line', layer: '0', pts: [[0, 0], [1, 1]] }];
    const feeders = [{ id: 'DB1/L3', name: 'Lights hall' }, { id: 'DB1/L4', name: 'Lights kitchen' }];
    const rows = attributeRows(items, [def], 0.001, feeders);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ block: 'LIGHT', tag: 'CIRCUIT', value: 'DB1/L3', layer: 'E-LIGHTING', x: 5, y: 3, feeder: 'DB1/L3' });
    expect(rows[4]).toMatchObject({ tag: 'CIRCUIT', value: 'Lights kitchen', feeder: 'DB1/L4', x: 6 });
    expect(rows[1].feeder).toBeUndefined();
    expect(attributeRows(items, [def], 0.001)[0].feeder).toBeUndefined(); // the matching is asked for
    expect(feederFor('db1/l3', feeders)).toBe('DB1/L3');
    expect(feederFor('', feeders)).toBeUndefined();
    const csv = attributesCsv(rows.slice(0, 2));
    expect(csv.split('\r\n')[0]).toBe('Block,Tag,Value,Layer,X (m),Y (m),Feeder');
    expect(csv.split('\r\n')[1]).toBe('LIGHT,CIRCUIT,DB1/L3,E-LIGHTING,5.000,3.000,DB1/L3');
    expect(attributesCsv([{ block: 'B', tag: 'NOTE', value: 'say "hi", twice', layer: '0', x: 0, y: 0 }]).split('\r\n')[1]).toBe('B,NOTE,"say ""hi"", twice",0,0.000,0.000');
    expect(cleanTag(' load watts ')).toBe('LOAD_WATTS');
    expect(cleanTag('a/b:c')).toBe('ABC');
  });
});
