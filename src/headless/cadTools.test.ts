// @vitest-environment node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { parseProject } from './project';
import { packPlan } from '../model/planPackage';
import { callTool, toolByName, type ToolContext } from './tools';

let root: string, folder: string;
let ctx: ToolContext;
const villa: Project = {
  ...sampleProject, id: 'proj-villa', cadLayers: undefined, cadRoomTypes: undefined,
  building: {
    buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }] }],
    rooms: [{ id: 'R1', buildingId: 'V', levelId: 'GF', name: 'Majlis', type: 'living', areaM2: 40 }]
  }
};
const fixtures = path.resolve(__dirname, '../../tests/fixtures/cad');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are checked field by field
const run = async (name: string, args: Record<string, unknown>): Promise<Record<string, any>> => (await callTool(toolByName(name)!, args, ctx)) as Record<string, any>;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lvds-cad-'));
  process.env.LVDS_APP_DATA = path.join(root, 'app');
});
afterAll(() => { delete process.env.LVDS_APP_DATA; fs.rmSync(root, { recursive: true, force: true }); });
beforeEach(() => {
  folder = fs.mkdtempSync(path.join(root, 'projects-'));
  fs.writeFileSync(path.join(folder, 'Villa.json'), JSON.stringify(villa, null, 2));
  fs.copyFileSync(path.join(fixtures, 'plan-2018.dwg'), path.join(folder, 'GF plan.dwg'));
  ctx = { folder, anywhere: false, write: true };
});

describe('CAD tools (built-in DWG / DXF reader)', () => {
  it('reads a DWG plan: units, layers with their roles, rooms', async () => {
    const r = await run('cad_plan', { project: 'Villa', drawing: 'GF plan.dwg' });
    expect(r.file).toBe('GF plan.dwg');
    expect(r.units).toBe('drawing in mm');
    expect(r.rooms).toBeGreaterThan(5);
    expect(r.layers.find((l: { name: string }) => l.name === 'A-ROOM-NAME')).toBeDefined();
  });

  it('previews rooms into Building information, then applies them with their outline', async () => {
    const preview = await run('rooms_from_cad', { project: 'Villa', drawing: 'GF plan.dwg', building: 'Villa', level: 'Ground' });
    expect(preview.written).toBe(false);
    const majlis = preview.details.rooms.find((x: { name: string }) => /majlis/i.test(x.name));
    expect(majlis).toMatchObject({ status: 'changed', nowM2: 40 });
    const done = await run('rooms_from_cad', { project: 'Villa', drawing: 'GF plan.dwg', building: 'V', level: 'GF', mode: 'apply' });
    expect(done.written).toBe(true);
    const saved = parseProject(fs.readFileSync(path.join(folder, 'Villa.json'), 'utf-8'), 'Villa.json');
    const room = saved.building!.rooms.find((x) => x.id === 'R1')!;
    expect(room.areaM2).toBeCloseTo(majlis.areaM2, 0);
    expect(room.source).toMatchObject({ app: 'cad', file: 'GF plan.dwg' });
    const again = await run('rooms_from_cad', { project: 'Villa', drawing: 'GF plan.dwg', building: 'V', level: 'GF' });
    expect(again.details.rooms).toEqual([]);
  });

  it('takes layer roles from the call and refuses unknown layers', async () => {
    const r = await run('cad_plan', { project: 'Villa', drawing: 'GF plan.dwg', roles: { 'A-ROOM-NAME': 'ignore' } });
    expect(r.layers.find((l: { name: string }) => l.name === 'A-ROOM-NAME').role).toBe('ignore');
    await expect(run('cad_plan', { project: 'Villa', drawing: 'GF plan.dwg', roles: { NOPE: 'room' } })).rejects.toThrow(/no layer "NOPE"/);
  });

  it('reads only DWG / DXF files inside the projects folder on MCP', async () => {
    await expect(run('cad_plan', { project: 'Villa', drawing: path.join(fixtures, 'plan-2018.dwg') })).rejects.toThrow(/inside the projects folder/);
    fs.writeFileSync(path.join(folder, 'notes.txt'), 'x');
    await expect(run('cad_plan', { project: 'Villa', drawing: 'notes.txt' })).rejects.toThrow(/not a DWG or DXF/);
  });
});

describe('a project that keeps its drawn work in a .lvplan', () => {
  /** Villa as the desktop app saves it: Villa.lvds linked to Villa.lvplan, which holds the drawn work and its units. */
  async function savedAsPair(p: Project) {
    const { bytes, project: rest } = await packPlan(p);
    fs.writeFileSync(path.join(folder, 'Villa.lvplan'), bytes!);
    fs.writeFileSync(path.join(folder, 'Villa.lvds'), JSON.stringify({ ...rest, plan: { file: 'Villa.lvplan', sha256: crypto.createHash('sha256').update(bytes!).digest('hex'), version: 1 } }, null, 2));
    fs.rmSync(path.join(folder, 'Villa.json'));
  }
  const chosen = { ...villa, cadPlanUnits: { 'gf plan.dwg': 'cm' }, cadSketch: [{ file: 'gf plan.dwg', items: [] }] } as Project;

  it('reads the drawing units chosen in Design CAD from the .lvplan', async () => {
    fs.writeFileSync(path.join(folder, 'Villa.json'), JSON.stringify(chosen, null, 2));
    const inside = await run('cad_plan', { project: 'Villa', drawing: 'GF plan.dwg' });
    expect(inside.units).not.toBe('drawing in mm');
    await savedAsPair(chosen);
    expect((await run('cad_plan', { project: 'Villa', drawing: 'GF plan.dwg' })).units).toBe(inside.units);
  });

  it('refuses the plan when the .lvplan is missing or out of date, so it is never measured in the wrong units', async () => {
    await savedAsPair(chosen);
    fs.writeFileSync(path.join(folder, 'Villa.lvplan'), 'PK not the drawn work it links to');
    await expect(run('cad_plan', { project: 'Villa', drawing: 'GF plan.dwg' })).rejects.toThrow(/The drawn work for this project \(Villa\.lvplan\) is missing or out of date/);
  });
});
