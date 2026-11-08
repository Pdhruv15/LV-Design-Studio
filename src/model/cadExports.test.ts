import { describe, expect, it } from 'vitest';
import { cableRows, deviceRows } from './cadExports';
import type { PlacedItem } from './cadDevices';
import type { SketchItem } from '../types';

describe('Design CAD export lists', () => {
  it('devices: by kind, circuit and name, positions in metres to two decimals', () => {
    const d = (what: PlacedItem['what'], label: string, detail: string, x: number): PlacedItem => ({ key: label, id: label, what, x, y: 1.234, label, detail, symbol: { shape: 'circle', text: '' }, room: 'Majlis' });
    expect(deviceRows([d('lv', 'Downlight', 'DB-GF1/L2 · 6 A', 2.005), d('board', 'DB-GF1', 'Ground floor DB', 0), d('lv', 'Downlight', 'DB-GF1/L1 · 6 A', 1)])).toEqual([
      ['Board', 'DB-GF1', 'Ground floor DB', 'Majlis', 0, 1.23],
      ['LV point', 'Downlight', 'DB-GF1/L1', 'Majlis', 1, 1.23],
      ['LV point', 'Downlight', 'DB-GF1/L2', 'Majlis', 2.01, 1.23]
    ]);
  });

  it('cable routes: per cable, the routes drawn and their length on the plan (m)', () => {
    const r = (id: string, feederId: string, pts: [number, number][]): SketchItem => ({ id, layer: 'E-CABLE', kind: 'pline', pts, cable: { feederId } });
    const sketch = [r('a', 'F1', [[0, 0], [3000, 0], [3000, 4000]]), r('b', 'F1', [[0, 0], [1000, 0]]), r('c', 'F2', [[0, 0], [0, 2500]]), { id: 'x', layer: 'LV-SKETCH', kind: 'line', pts: [[0, 0], [9, 9]] } as SketchItem];
    expect(cableRows(sketch, (id) => (id === 'c' ? 'C-10' : 'C-2'), 0.001)).toEqual([['C-2', 2, 8], ['C-10', 1, 2.5]]);
  });
});
