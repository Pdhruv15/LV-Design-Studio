// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { packPlan, PLAN_FIELDS } from '../model/planPackage';
import { packRevisions } from '../model/revisionStore';
import type { Project } from '../types';
import { openProjectFull } from './project';
import { callTool, toolByName, type ToolContext } from './tools';
import { commitProject, WriteRefused } from './write';

/** Phase 2 step 3 of the native drawing file: lvds (command line, MCP server, local API) reads a project with its drawn
 * work from name.lvplan, and writes it as the app saves it. The pair is made by the app's own save
 * (electron/projectFiles.cjs saveProjectPair), so the two sides are checked against each other. */

const pf = createRequire(import.meta.url)('../../electron/projectFiles.cjs') as {
  saveProjectPair: (full: string, data: unknown, plan: Uint8Array | undefined) => unknown;
  readPlanFor: (dir: string, file: string, link: { file: string; sha256: string }) => Buffer | undefined;
};
let root: string, folder: string;
let ctx: ToolContext;
const line = (id: string, x: number) => ({ id, kind: 'line' as const, layer: 'E-POWR', pts: [[x, 0], [x + 1200.5, 15.25]] as [number, number][] });
const drawn = {
  cadSketch: [{ file: 'plan-gf.dwg', items: [line('S1', 0), line('S2', 100)] }],
  cadErased: { 'plan-gf.dwg': ['1F3'] },
  cadPlanUnits: { 'plan-gf.dwg': 'mm' as const },
  cadAnno: { textMm: 2.5, scale: 100 }
};
const villa = { ...sampleProject, id: 'proj-villa', ...drawn } as Project;
const full = (f: string) => path.join(folder, f);
const lvds = () => JSON.parse(fs.readFileSync(full('Villa.lvds'), 'utf-8')) as Project & { plan?: { file: string; sha256: string } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are checked field by field
const run = async (name: string, args: Record<string, unknown>): Promise<Record<string, any>> => (await callTool(toolByName(name)!, args, ctx)) as Record<string, any>;
/** What the app would open: the project file with its drawn work put back. */
const inApp = () => openProjectFull({ ref: 'Villa', folder, anywhere: false });
async function savedByApp(p: Project) {
  const { project, bytes } = await packPlan(p);
  pf.saveProjectPair(full('Villa.lvds'), packRevisions(project), bytes);
}
const addPanel = (id: string) => run('add_panel', { project: 'Villa', kind: 'DB', id, fedFrom: 'SMDB-GF', mode: 'apply' });

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lvds-plan-'));
  process.env.LVDS_APP_DATA = path.join(root, 'app');
});
afterAll(() => { delete process.env.LVDS_APP_DATA; fs.rmSync(root, { recursive: true, force: true }); });
beforeEach(() => {
  folder = fs.mkdtempSync(path.join(root, 'projects-'));
  ctx = { folder, anywhere: false, write: true };
});

describe('lvds with name.lvplan', () => {
  it('reads a project with its drawn work, as the app opens it', async () => {
    await savedByApp(villa);
    const o = await inApp();
    expect(o.drawnWorkMissing).toBeUndefined();
    expect(o.project).not.toHaveProperty('plan');
    for (const [k, v] of Object.entries(drawn)) expect(o.project[k as keyof Project]).toEqual(v);
    const json = await run('export_project_json', { project: 'Villa' });
    expect(json.mode).toBe('preview');
  });

  it('a change leaves the drawn work file as it is, and the project still opens with it', async () => {
    await savedByApp(villa);
    const before = fs.readFileSync(full('Villa.lvplan'));
    const mtime = fs.statSync(full('Villa.lvplan')).mtimeMs;
    const link = lvds().plan;
    await addPanel('DB-T');
    expect(fs.statSync(full('Villa.lvplan')).mtimeMs).toBe(mtime);
    expect(fs.existsSync(full('Villa.lvplan.bak'))).toBe(false);
    expect(lvds().plan).toEqual(link);
    for (const f of PLAN_FIELDS) expect(lvds()).not.toHaveProperty(f);
    expect(pf.readPlanFor(folder, 'Villa.lvds', link!)!.equals(before)).toBe(true);
    const o = await inApp();
    expect(o.project.boards.some((b) => b.id === 'DB-T')).toBe(true);
    expect(o.project.cadSketch).toEqual(drawn.cadSketch);
  });

  it('moves the drawn work of an older .lvds into name.lvplan when it writes it, as the app does at its next save', async () => {
    fs.writeFileSync(full('Villa.lvds'), JSON.stringify(villa, null, 2));
    await addPanel('DB-T');
    expect(lvds().cadSketch).toBeUndefined();
    expect(lvds().plan!.file).toBe('Villa.lvplan');
    expect((await inApp()).project.cadSketch).toEqual(drawn.cadSketch);
    await run('undo_change', { project: 'Villa', mode: 'apply' });
    expect(lvds().cadSketch).toEqual(drawn.cadSketch); // the file before the change, drawn work inside
  });

  it('refuses to write when the drawn work file changed after the project was read', async () => {
    await savedByApp(villa);
    const o = await inApp();
    fs.writeFileSync(full('Villa.lvplan'), 'PK their drawn work, saved meanwhile');
    await expect(commitProject(folder, o.file, o.text, { ...o.project, name: 'Changed' }, 'test', 'rename', undefined, o.planSha)).rejects.toThrow(WriteRefused);
    await expect(commitProject(folder, o.file, o.text, { ...o.project, name: 'Changed' }, 'test', 'rename', undefined, o.planSha)).rejects.toThrow(/Villa\.lvplan \(the drawn work of Villa\.lvds\) changed while/);
    expect(lvds().name).toBe(villa.name);
  });

  it('with the drawn work file missing: works without the drawings, keeps the link and writes nothing over it', async () => {
    await savedByApp(villa);
    const link = lvds().plan;
    const theirs = Buffer.from('PK not the drawn work this project file links to');
    fs.writeFileSync(full('Villa.lvplan'), theirs);
    const o = await inApp();
    expect(o.drawnWorkMissing).toEqual(link);
    expect(o.project.cadSketch).toBeUndefined();
    await addPanel('DB-T');
    expect(lvds().plan).toEqual(link);
    expect(fs.readFileSync(full('Villa.lvplan')).equals(theirs)).toBe(true);
    const preview = await run('export_project_json', { project: 'Villa' });
    expect(preview.next).toMatch(/Villa\.lvplan\) is missing or out of date/);
  });

  it('an older .json project keeps its drawn work inside: it has no file beside it', async () => {
    fs.writeFileSync(full('Villa.json'), JSON.stringify(villa, null, 2));
    await addPanel('DB-T');
    const after = JSON.parse(fs.readFileSync(full('Villa.json'), 'utf-8')) as Project;
    expect(after.cadSketch).toEqual(drawn.cadSketch);
    expect(fs.readdirSync(folder).filter((f) => f.endsWith('.lvplan'))).toEqual([]);
  });
});
