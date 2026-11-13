import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { LpsInputs } from '../calc/lightningProtection';
import type { Project } from '../types';
import { blockDefsOf } from './cadBlocks';
import { lightningPlanFiles, lightningRoofBlock, LP_BLOCK, LP_LAYER, withLightningBlock } from './lightningCad';

const study: LpsInputs = { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', meshM: 10, sphereRadiusM: 30, rodHeightM: 3, downSpacingM: 10 };

describe('lightning protection roof layout block', () => {
  it('mesh: roof edge, runs and numbered down conductors, in the drawing\'s units, base at a roof corner', () => {
    const def = lightningRoofBlock(study, 0.001)!;
    expect(def.name).toBe(LP_BLOCK);
    expect(def.items.every((x) => x.layer === LP_LAYER)).toBe(true);
    expect(new Set(def.items.map((x) => x.id)).size).toBe(def.items.length);
    expect(def.items[0]).toMatchObject({ kind: 'pline', closed: true, pts: [[0, 0], [40000, 0], [40000, 25000], [0, 25000]] });
    expect(def.items.filter((x) => x.kind === 'line').length).toBe(5);
    expect(def.items.find((x) => x.kind === 'line')!.pts).toEqual([[10000, 0], [10000, 25000]]);
    const downs = def.items.filter((x) => x.kind === 'circle');
    expect(downs.length).toBe(13);
    expect(downs[0]).toMatchObject({ pts: [[0, 0]], r: 250 });
    expect(def.items.filter((x) => x.kind === 'text').map((x) => x.text)).toEqual(Array.from({ length: 13 }, (_, k) => `DC${k + 1}`));
  });

  it('follows the drawing\'s units', () => {
    const m = lightningRoofBlock(study, 1)!;
    expect(m.items[0].pts[2]).toEqual([40, 25]);
    expect(m.items.find((x) => x.kind === 'text')!.h).toBe(0.4);
  });

  it('rods: one square each', () => {
    const def = lightningRoofBlock({ ...study, method: 'sphere' }, 1)!;
    expect(def.items.filter((x) => x.kind === 'pline').length).toBe(1 + 12);
  });

  it('nothing to draw while the study has data missing', () => {
    expect(lightningRoofBlock({ ...study, meshM: undefined }, 0.001)).toBeUndefined();
    expect(lightningRoofBlock({ ...study, lengthM: 0 }, 0.001)).toBeUndefined();
    expect(lightningRoofBlock(study, 0)).toBeUndefined();
  });

  it('is defined in the chosen drawing, and redefined when the study changes', () => {
    const p: Project = { ...sampleProject, lightning: study, cadPlanUnits: { 'roof.dwg': 'm' } };
    const a = withLightningBlock(p, 'ROOF.dwg')!;
    expect(a.unit).toBe('m');
    expect(a.assumed).toBe(false);
    expect(blockDefsOf(a.project, 'roof.dwg').map((d) => d.name)).toEqual([LP_BLOCK]);
    const b = withLightningBlock({ ...a.project, lightning: { ...study, downSpacingM: 30 } }, 'ROOF.dwg')!;
    const defs = blockDefsOf(b.project, 'ROOF.dwg');
    expect(defs.length).toBe(1);
    expect(defs[0].items.filter((x) => x.kind === 'circle').length).toBe(5);
    expect(withLightningBlock(sampleProject, 'ROOF.dwg')).toBeUndefined();
    expect(withLightningBlock({ ...sampleProject, lightning: study }, 'other.dwg')).toMatchObject({ unit: 'mm', assumed: true });
  });

  it('lists the level plans, none when no drawing is a plan yet', () => {
    expect(lightningPlanFiles({ ...sampleProject, cadPlans: [] })).toEqual([]);
    const building = { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground' as const, heightM: 4 }, { id: 'RF', name: 'Roof', kind: 'roof' as const, heightM: 3 }] }], rooms: [] };
    const files = lightningPlanFiles({ ...sampleProject, building, cadPlans: [{ building: 'V', level: 'GF', file: 'gf.dwg' }, { building: 'V', level: 'RF', file: 'roof.dwg' }] } as Project);
    expect(files.map((x) => x.file)).toEqual(['roof.dwg', 'gf.dwg']);
  });
});
