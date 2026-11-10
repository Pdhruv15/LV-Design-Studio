import { describe, expect, it } from 'vitest';
import { above, sameOrder, textToFront, toBack, toFront, under } from './cadDrawOrder';
import type { SketchItem } from '../types';

/** Draw order (S7 of the Design CAD 2D gap plan): the list order is the paint order; moved objects keep theirs. */

const it_ = (id: string, more: Partial<SketchItem> = {}): SketchItem => ({ id, kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [1, 0]], ...more });
const H = it_('H', { kind: 'pline', closed: true, pts: [[0, 0], [5, 0], [5, 5]], hatch: { pattern: 'solid', scale: 3, angle: 0 } });
const A = it_('A'), B = it_('B'), T = it_('T', { kind: 'text', text: 'DB', h: 1, pts: [[1, 1]] }), D = it_('D', { kind: 'dim', pts: [[0, 0], [4, 0], [2, 1]], text: '4' });
const L = it_('L', { kind: 'pline', leader: true, pts: [[0, 0], [2, 2]] }), N = it_('N', { kind: 'mtext', note: [{ runs: [{ s: 'x' }] }], h: 1, pts: [[3, 3]] });
const items = [T, A, H, B, D, L, N];
const ids = (list: SketchItem[]) => list.map((x) => x.id).join('');

describe('DRAWORDER', () => {
  it('brings objects to the front or sends them to the back, keeping their order among themselves', () => {
    expect(ids(toFront(items, ['A', 'T']))).toBe('HBDLNTA');
    expect(ids(toBack(items, ['N', 'B']))).toBe('BNTAHDL');
    expect(ids(toFront(items, []))).toBe(ids(items));
    expect(ids(toFront(items, ['zz']))).toBe(ids(items));
  });

  it('puts objects just above or under a reference, after the last or before the first of several', () => {
    expect(ids(above(items, ['T'], ['H']))).toBe('AHTBDLN');
    expect(ids(under(items, ['N', 'D'], ['A']))).toBe('TDNAHBL');
    expect(ids(above(items, ['T', 'A'], ['B', 'D']))).toBe('HBDTALN');
    expect(ids(under(items, ['N'], ['B', 'L']))).toBe('TAHNBDL');
    // A reference that is also picked stays; a reference that is not there changes nothing.
    expect(ids(above(items, ['T', 'H'], ['H']))).toBe('AHTBDLN');
    expect(above(items, ['T'], ['zz'])).toBe(items);
  });

  it('TEXTTOFRONT lifts texts and notes, dimensions, leaders, or all three', () => {
    expect(ids(textToFront(items, 'text'))).toBe('AHBDLTN');
    expect(ids(textToFront(items, 'dims'))).toBe('TAHBLND');
    expect(ids(textToFront(items, 'leaders'))).toBe('TAHBDNL');
    expect(ids(textToFront(items))).toBe('AHBTDLN');
    expect(sameOrder(items, textToFront(items, 'dims'))).toBe(false);
    expect(sameOrder(items, toFront(items, ['N']))).toBe(true);
  });
});
