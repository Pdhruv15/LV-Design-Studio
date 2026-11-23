import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { z } from 'zod';
import { sampleProject } from '../data/sampleProject';
import { issueRevision } from './revisions';
import { projectFingerprint } from './saveSafety';
import { mergePlan, PLAN_FIELDS, PlanError, planDrawing, planManifest, planZip, readManifest, readPlanZip, splitPlan, type PlanFiles } from './planPackage';
import { sha256Hex } from '../util/sha256';
import type { Project } from '../types';

/**
 * The contract files are made from the definitions in planPackage.ts. After changing them:
 *   UPDATE_CONTRACTS=1 npx vitest run src/model/planPackage.test.ts
 */

const line = (id: string, x: number) => ({ id, kind: 'line' as const, layer: 'E-POWR', pts: [[x, 0], [x + 1200.5, 15.25]] as [number, number][] });
const drawn: Partial<Project> = {
  cadSketch: [{ file: 'Plan-GF.dwg', items: [line('S1', 0), line('S2', 100)] }, { file: 'plan-l1.dwg', items: [line('S3', 0)] }],
  cadBlockDefs: [{ file: 'plan-gf.dwg', defs: [{ name: 'LAMP', items: [line('B1', 0)] }] } as never],
  cadErased: { 'plan-gf.dwg': ['1F3', '2A0'] },
  cadLayouts: { 'plan-l1.dwg': [{ name: 'Layout1' }] as never },
  cadPlanUnits: { 'plan-gf.dwg': 'mm' },
  cadLayerFile: { 'plan-gf.dwg': { current: 'E-POWR' } },
  cadTextStyles: { styles: [{ name: 'Standard', font: 'Arial', heightMm: 0 }], current: 'Standard' } as never,
  cadAnno: { textMm: 2.5, scale: 100 }
};
const base = (): Project => ({ ...sampleProject, ...drawn } as Project);
const viaText = (f: PlanFiles): PlanFiles => JSON.parse(JSON.stringify(f)) as PlanFiles;
/** JSON with object keys sorted at every depth: equal when the content is, whatever the key order. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

describe('.lvplan split and merge', () => {
  it('takes every drawing field off the project and puts it back as it was', async () => {
    const p = base();
    const { project, plan } = await splitPlan(p);
    expect(plan).toBeDefined();
    for (const f of PLAN_FIELDS) expect(project).not.toHaveProperty(f);
    expect(project.boards).toBe(p.boards);
    expect(project.feeders).toBe(p.feeders);
    const back = mergePlan(JSON.parse(JSON.stringify(project)) as Project, viaText(plan!));
    expect(canon(back)).toBe(canon(p));
  });

  it('keeps one part per drawing file, with the file name readable in the manifest', async () => {
    const { plan } = await splitPlan(base());
    expect(plan!.manifest.live!.drawings.map((d) => d.file)).toEqual(['plan-gf.dwg', 'plan-l1.dwg']);
    const gf = JSON.parse(plan!.parts[plan!.manifest.parts[plan!.manifest.live!.drawings[0].part].path]) as Record<string, unknown>;
    expect(Object.keys(gf).sort()).toEqual(['cadBlockDefs', 'cadErased', 'cadLayerFile', 'cadPlanUnits', 'cadSketch', 'file']);
    expect(planDrawing.safeParse(gf).success).toBe(true);
    expect(plan!.manifest.live!.shared).toBeDefined();
  });

  it('names each part by the SHA-256 of its text, the same with the app\'s own hash as with the system\'s', async () => {
    const { plan } = await splitPlan(base());
    for (const [h, { path, bytes }] of Object.entries(plan!.manifest.parts)) {
      expect(sha256Hex(plan!.parts[path])).toBe(h);
      expect(new TextEncoder().encode(plan!.parts[path]).length).toBe(bytes);
    }
  });

  it('stores a drawing once when issued revisions did not change it', async () => {
    let p = base();
    p = issueRevision(p, { description: 'A', date: '2026-11-23' });
    p = issueRevision(p, { description: 'B', date: '2026-11-23' });
    p = { ...p, cadSketch: [{ file: 'Plan-GF.dwg', items: [line('S1', 0)] }, p.cadSketch![1]] };
    const { project, plan } = await splitPlan(p);
    // Two drawings and the shared settings, plus the ground floor as it was before the last edit: 4 parts, not 9.
    expect(Object.keys(plan!.parts)).toHaveLength(4);
    expect(plan!.manifest.revisions.map((r) => r.id)).toEqual(['A', 'B']);
    for (const r of project.revisions!) for (const f of PLAN_FIELDS) expect(r.snapshot).not.toHaveProperty(f);
    expect(canon(mergePlan(project, viaText(plan!)))).toBe(canon(p));
  });

  it('gives the same fingerprint after every further save and load', async () => {
    const once = async (p: Project) => { const s = await splitPlan(p); return mergePlan(s.project, viaText(s.plan!)); };
    const a = await once(base());
    expect(projectFingerprint(await once(a))).toBe(projectFingerprint(a));
  });

  it('needs no .lvplan for a project with nothing drawn', async () => {
    const p = { ...sampleProject } as Project;
    const s = await splitPlan(p);
    expect(s.plan).toBeUndefined();
    expect(s.project).toBe(p);
  });

  it('keeps two entries of the same file apart, in their order, and map keys exactly as given', async () => {
    const p = { ...sampleProject, cadSketch: [{ file: 'A.dwg', items: [line('S1', 0)] }, { file: 'b.dwg', items: [] }, { file: 'a.DWG', items: [line('S2', 5)] }], cadErased: { 'A.dwg': ['10'], 'a.dwg': ['11'] } } as Project;
    const { project, plan } = await splitPlan(p);
    expect(plan!.manifest.live!.order.cadSketch).toEqual([0, 1, 2]);
    expect(canon(mergePlan(project, viaText(plan!)))).toBe(canon(p));
  });

  it('leaves a field the app would not have written in the project file, so nothing is lost', async () => {
    const p = { ...sampleProject, cadSketch: [{ items: [] }], cadErased: ['not', 'a', 'map'] } as unknown as Project;
    const { project, plan } = await splitPlan(p);
    expect(plan).toBeUndefined();
    expect(project).toBe(p);
  });

  it('refuses a package that does not match its project', async () => {
    let p = base();
    p = issueRevision(p, { description: 'A', date: '2026-11-23' });
    const { project, plan } = await splitPlan(p);
    const lost = { ...plan!, parts: {} };
    expect(() => mergePlan(project, lost)).toThrow(PlanError);
    expect(() => mergePlan({ ...project, revisions: [] }, plan!)).toThrow(/revisions/);
    expect(() => mergePlan(project, { ...plan!, manifest: { ...plan!.manifest, version: 2 } })).toThrow(/newer version/);
    expect(() => readManifest({ format: 'lvds.project' })).toThrow(PlanError);
  });
});

describe('.lvplan file', () => {
  it('zips and reads back to the same project, and the same drawn work gives the same bytes', async () => {
    const p = base();
    const { project, plan } = await splitPlan(p);
    const bytes = await planZip(plan!);
    expect(Buffer.from(await planZip((await splitPlan(p)).plan!)).equals(Buffer.from(bytes))).toBe(true);
    const back = mergePlan(project, await readPlanZip(bytes));
    expect(canon(back)).toBe(canon(p));
  });

  it('refuses a file that is not a .lvplan, or has lost a part', async () => {
    await expect(readPlanZip(new TextEncoder().encode('not a zip'))).rejects.toThrow(PlanError);
    const { plan } = await splitPlan(base());
    const first = Object.keys(plan!.parts)[0];
    const { [first]: _gone, ...rest } = plan!.parts;
    await expect(readPlanZip(await planZip({ ...plan!, parts: rest }))).rejects.toThrow(/missing/);
  });
});

describe('.lvplan contract', () => {
  it('sorts every CAD field of the project: to the .lvplan, or kept in the project on purpose', async () => {
    const types = fs.readFileSync('src/types.ts', 'utf-8');
    const project = types.slice(types.indexOf('export interface Project {'), types.indexOf('\n}\n', types.indexOf('export interface Project {')));
    const cad = [...project.matchAll(/^ {2}(cad\w+)\?:/gm)].map((m) => m[1]);
    // What blocks and layers mean electrically, devices, wiring, links and settings the calculations read (decision P1).
    const KEPT = ['cadBlocks', 'cadLength', 'cadRoomLayer', 'cadLayers', 'cadRoomTypes', 'cadPlans', 'cadWiring', 'cadAccessories', 'cadAccessorySeq', 'cadPlanLinks'];
    expect(cad.filter((f) => !(PLAN_FIELDS as readonly string[]).includes(f) && !KEPT.includes(f))).toEqual([]);
    expect([...PLAN_FIELDS].filter((f) => !cad.includes(f))).toEqual([]);
  });

  it('matches the JSON Schema files in contracts/', async () => {
    for (const [name, schema] of [['plan', planManifest], ['plan-drawing', planDrawing]] as const) {
      const text = `${JSON.stringify({ $id: `https://lv-design-studio/contracts/${name}.schema.json`, ...z.toJSONSchema(schema, { io: 'input' }) }, null, 2)}\n`;
      const file = `contracts/${name}.schema.json`;
      if (process.env.UPDATE_CONTRACTS) fs.writeFileSync(file, text);
      expect(fs.readFileSync(file, 'utf-8')).toBe(text);
    }
  });
});
