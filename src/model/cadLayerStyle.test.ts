import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { drawnLayers, effective, layerStylesOf, LINETYPES, matchedProps, styleOf, withLayerStyle, withProps } from './cadLayerStyle';
import type { Project, SketchItem } from '../types';

const p: Project = { ...sampleProject, cadLayerStyle: undefined };
const line: SketchItem = { id: 'S1', kind: 'line', layer: 'LV-SKETCH', pts: [[0, 0], [1, 0]] };

describe('layer manager styles', () => {
  it('a layer\'s style is kept per drawing file; blank fields drop out, an empty style is removed', () => {
    const a = withLayerStyle(p, 'Plan.DWG', 'LV-SKETCH', { color: '#ff3b30', lt: 'dashed', lw: 0.35 });
    expect(layerStylesOf(a, 'plan.dwg')).toEqual({ 'LV-SKETCH': { color: '#ff3b30', lt: 'dashed', lw: 0.35 } });
    expect(styleOf(layerStylesOf(a, 'plan.dwg'), 'lv-sketch').lt).toBe('dashed');
    const b = withLayerStyle(a, 'plan.dwg', 'lv-sketch', { color: undefined, lock: true });
    expect(layerStylesOf(b, 'plan.dwg')).toEqual({ 'lv-sketch': { lt: 'dashed', lw: 0.35, lock: true } });
    const c = withLayerStyle(b, 'plan.dwg', 'LV-SKETCH', { lt: undefined, lw: undefined, lock: false });
    expect(c.cadLayerStyle).toBeUndefined();
  });

  it('an object shows with its own colour, linetype and lineweight, else its layer\'s', () => {
    const styles = { 'LV-SKETCH': { color: '#34c759', lt: 'center' as const, lw: 0.5, lock: true } };
    expect(effective(line, styles)).toEqual({ color: '#34c759', dash: LINETYPES.center.dash, lw: 0.5, hidden: false, lock: true });
    const own = withProps(line, { color: '#ff3b30', lt: 'dot', lw: 0.18 });
    expect(effective(own, styles)).toMatchObject({ color: '#ff3b30', dash: LINETYPES.dot.dash, lw: 0.18 });
    expect(withProps(own, { color: undefined, lt: undefined })).toEqual({ ...line, lw: 0.18 }); // back to ByLayer
    expect(effective(line, {})).toEqual({ color: undefined, dash: [], lw: 0, hidden: false, lock: false });
  });

  it('match properties copies layer and properties; a tray keeps its own layer', () => {
    const from: SketchItem = { ...line, id: 'S2', layer: 'LV-ANNO', color: '#0a84ff', lt: 'hidden', lw: 0.25 };
    expect(matchedProps(from, line)).toEqual({ ...line, layer: 'LV-ANNO', color: '#0a84ff', lt: 'hidden', lw: 0.25 });
    const tray: SketchItem = { ...line, id: 'T1', kind: 'pline', layer: 'E-TRAY', tray: { widthMm: 300 } };
    expect(matchedProps(from, tray)).toMatchObject({ layer: 'E-TRAY', lt: 'hidden' });
    expect(drawnLayers([tray, line])).toEqual(['E-TRAY', 'LV-SKETCH', 'LV-ANNO', 'LV-HATCH']);
  });
});
