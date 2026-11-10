import { describe, expect, it } from 'vitest';
import { newDrawingDxf, newDrawingName } from './cadNewDrawing';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';

const p: Project = { ...sampleProject, cadSketch: undefined, cadPlans: undefined, cadLayerFile: undefined, cadLayerStyle: undefined, cadPlanUnits: undefined, cadRefs: undefined, cadErased: undefined };

describe('File → New: a blank drawing', () => {
  it('is Drawing1.dxf, then the first number free', () => {
    expect(newDrawingName(p, [])).toBe('Drawing1.dxf');
    expect(newDrawingName(p, ['drawing1.DXF', 'plan.dwg'])).toBe('Drawing2.dxf');
  });

  it('skips a name the project keeps drawn work, layers, units, plans or references for', () => {
    expect(newDrawingName({ ...p, cadSketch: [{ file: 'Drawing1.dxf', items: [] }] }, [])).toBe('Drawing2.dxf');
    expect(newDrawingName({ ...p, cadPlans: [{ building: 'V', level: 'GF', file: 'Drawing1.dxf' }] }, ['Drawing2.dxf'])).toBe('Drawing3.dxf');
    expect(newDrawingName({ ...p, cadLayerFile: { 'drawing1.dxf': {} as never }, cadPlanUnits: { 'drawing2.dxf': 'mm' }, cadRefs: { 'drawing3.dxf': [] }, cadErased: { 'drawing4.dxf': [] }, cadLayerStyle: { 'drawing5.dxf': {} } }, [])).toBe('Drawing6.dxf');
  });

  it('is in millimetres with layer 0 and nothing drawn', () => {
    const dxf = newDrawingDxf();
    expect(dxf).toMatch(/\$INSUNITS\r?\n\s*70\r?\n\s*4\r?\n/);
    expect(dxf).toMatch(/\n\s*2\r?\n0\r?\n\s*70\r?\n/);
    expect(dxf).not.toMatch(/\n\s*0\r?\n(LINE|POLYLINE|TEXT|CIRCLE|ARC|INSERT)\r?\n/);
  });
});
