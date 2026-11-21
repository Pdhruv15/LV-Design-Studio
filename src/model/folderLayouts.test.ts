import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { buildingFolders, LAYOUTS, layoutTemplate, nameList, previewFolders, repeatSettings, sampleUnits, withRepeat } from './folderLayouts';
import { builtInTemplate } from './folderTemplateBuiltins';
import { expandTemplate, validateTemplate, walkNodes, type FolderTemplate, type ProjectFolder } from './folderTemplates';
import { outputBuilding, roleFolder, saveTarget } from './outputRoles';
import { folderBuildings, rememberedFolder, rememberFolder, SCOPE_FLAGS } from './projectFolderPlan';
import type { Project } from '../types';

const req = createRequire(import.meta.url);
const check = req('../../electron/ipcValidate.cjs') as { folderTemplate: (t: unknown) => FolderTemplate };
const vars = { ProjectNo: '2417', ProjectShort: 'AlBarsha-Villas' };
const multi = builtInTemplate('multi-building')!;
const buildingInfo = (...names: string[]): Project['building'] => ({ buildings: names.map((name, i) => ({ id: `bld-${i + 1}`, name, levels: [{ id: 'g', name: 'Ground', kind: 'ground', heightM: 4 }] })), rooms: [] } as unknown as Project['building']);
const tops = (t: FolderTemplate, units = sampleUnits({ source: 'buildings', phases: [] })) => expandTemplate(t, vars, SCOPE_FLAGS, units).folders.filter((f) => !f.path.includes('/')).map((f) => f.path);

describe('New template (C7): the six layouts', () => {
  it('has the six cards of the approved screen', () => {
    expect(LAYOUTS.map((l) => l.name)).toEqual(['Discipline-first', 'Stage-first', 'Building / phase-first', 'ISO 19650 containers', 'Flat & simple', 'Blank']);
  });

  it('each layout starts a new, unsaved template with no errors', () => {
    const taken = ['New template'];
    for (const l of LAYOUTS) {
      const t = layoutTemplate(l.id, taken);
      expect(t).toMatchObject({ layout: l.id, version: 0, name: 'New template 2' });
      expect(t.builtIn).toBeUndefined();
      expect(t.id).toMatch(/^user-/);
      expect(validateTemplate(t).filter((i) => i.level === 'error')).toEqual([]);
      expect(check.folderTemplate(t)).toEqual(t);
    }
  });

  it('discipline, ISO 19650, flat and building start from their built-ins; blank is the root only', () => {
    const names = (t: FolderTemplate) => { const out: string[] = []; walkNodes(t.folders, (n) => { out.push(n.name); }); return out; };
    expect(names(layoutTemplate('discipline', []))).toEqual(names(builtInTemplate('consultant-full')!));
    expect(names(layoutTemplate('iso19650', []))).toEqual(names(builtInTemplate('iso19650')!));
    expect(names(layoutTemplate('flat', []))).toEqual(names(builtInTemplate('villa-small')!));
    expect(layoutTemplate('building', []).repeat).toEqual(multi.repeat);
    expect(layoutTemplate('blank', []).folders).toEqual([]);
  });

  it('stage-first has the four stages, each with Calcs and Drawings; the working stage holds the roles', () => {
    const t = layoutTemplate('stage', []);
    expect(t.folders.map((n) => n.name)).toEqual(['Concept', 'Schematic', 'Detailed', 'IFC']);
    for (const n of t.folders) expect(n.children?.map((c) => c.name)).toEqual(['Calcs', 'Drawings']);
    expect(roleFolder({ templateId: t.id, version: 0, template: t }, 'calcVd', vars)?.path).toBe('Detailed/Calcs');
    expect(roleFolder({ templateId: t.id, version: 0, template: t }, 'drawingsIssued', vars)).toEqual({ path: 'IFC/Drawings', onUse: 'Rev-{Rev}' });
  });
});

describe('New template (C7): Repeat for', () => {
  const start = layoutTemplate('building', []);

  it('reads the settings of a building-first template', () => {
    expect(repeatSettings(start)).toEqual({ source: 'buildings', name: '{BuildingCode}_{BuildingName}', shared: ['00_Common'], phases: ['Phase-1', 'Phase-2'] });
    expect(nameList(' 00_Common, 01_Admin;; 00_Common ')).toEqual(['00_Common', '01_Admin']);
  });

  it('expands for 3 buildings: the shared folder once at the top, then a set per building', () => {
    const units = folderBuildings({ building: buildingInfo('Villa A', 'Villa B', 'Clubhouse') }, start);
    expect(units.map((u) => u.code)).toEqual(['B1', 'B2', 'B3']);
    const all = expandTemplate(start, vars, SCOPE_FLAGS, units).folders.map((f) => f.path);
    expect(all.filter((p) => !p.includes('/'))).toEqual(['00_Common', 'B1_Villa-A', 'B2_Villa-B', 'B3_Clubhouse']);
    expect(all).toContain('B3_Clubhouse/Schedules');
    expect(all.filter((p) => p.startsWith('00_Common'))).toEqual(['00_Common', '00_Common/Admin', '00_Common/DEWA', '00_Common/Transmittals']);
  });

  it('applies a name pattern and shared folders (one kept with its subfolders, a new one made empty)', () => {
    const t = withRepeat(start, { source: 'buildings', name: '{BuildingName}', shared: ['00_Common', '99_Archive'], phases: [] });
    expect(tops(t)).toEqual(['00_Common', '99_Archive', 'Villa-A', 'Villa-B']);
    expect(t.repeat).toEqual({ source: 'buildings', name: '{BuildingName}', shared: [t.folders[0].id, t.folders[1].id] });
    expect(t.folders[0].children?.length).toBe(3);
    expect(validateTemplate(t).filter((i) => i.level === 'error')).toEqual([]);
    expect(check.folderTemplate(t)).toEqual(t);
  });

  it('phases typed by the user repeat instead of the buildings, P1, P2…', () => {
    const t = withRepeat(start, { source: 'phases', name: '{BuildingCode}_{BuildingName}', shared: ['00_Common'], phases: ['Phase 1', 'Phase 2', 'Phase 3'] });
    expect(t.repeat?.phases).toEqual(['Phase 1', 'Phase 2', 'Phase 3']);
    const units = folderBuildings({ building: buildingInfo('Villa A') }, t);
    expect(units.map((u) => `${u.code}_${u.name}`)).toEqual(['P1_Phase-1', 'P2_Phase-2', 'P3_Phase-3']);
    expect(tops(t, units)).toEqual(['00_Common', 'P1_Phase-1', 'P2_Phase-2', 'P3_Phase-3']);
    expect(check.folderTemplate(t)).toEqual(t);
    expect(previewFolders(t, vars, sampleUnits(repeatSettings(t))).map((f) => f.path)).toContain('P3_Phase-3/Calcs');
  });
});

describe('Buildings on the Customise card (C6)', () => {
  const t = multi;
  const made = folderBuildings({ building: buildingInfo('Villa A', 'Villa B') }, t);

  it('a renamed building: its new folder is made and the old one is listed, left as it is', () => {
    const now = folderBuildings({ building: buildingInfo('Villa A', 'Villa C') }, t);
    const b = buildingFolders(t, undefined, vars, now, made);
    expect(b.map((x) => x.path)).toEqual(['B1_Villa-A', 'B2_Villa-C']);
    expect(b[0].renamedFrom).toBeUndefined();
    expect(b[1].renamedFrom).toEqual({ name: 'Villa-B', path: 'B2_Villa-B' });
    expect(b[1].count).toBe(5);
    // The old folder is not among the folders to create: nothing is moved or renamed on disk.
    expect(expandTemplate(t, vars, SCOPE_FLAGS, now).folders.map((f) => f.path).some((p) => p.startsWith('B2_Villa-B'))).toBe(false);
  });

  it('a building added later is listed with its folders; unticked folders are not counted', () => {
    const now = folderBuildings({ building: buildingInfo('Villa A', 'Villa B', 'Villa C') }, t);
    const b = buildingFolders(t, undefined, vars, now, made, ['mb.buildingcode-buildingname.boq']);
    expect(b[2]).toEqual({ unit: { code: 'B3', name: 'Villa-C', id: 'bld-3' }, path: 'B3_Villa-C', count: 4 });
    expect(buildingFolders(builtInTemplate('villa-small')!, undefined, vars, now, made)).toEqual([]);
  });

  it('remembers the buildings the folders were made for, on this computer', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
    rememberFolder('p1', { root: 'D:\\Jobs\\X', unticked: [], buildings: made }, s);
    expect(rememberedFolder('p1', s)?.buildings).toEqual(made);
    m.set('lvds.projectFolder.p2', JSON.stringify({ root: 'D:\\Y', unticked: [], buildings: [{ code: 1 }, { code: 'B1', name: 'A' }] }));
    expect(rememberedFolder('p2', s)?.buildings).toEqual([{ code: 'B1', name: 'A' }]);
  });
});

describe('Outputs of one building save into its folder (C7)', () => {
  const folder: ProjectFolder = { templateId: multi.id, version: 1, template: multi };
  const units = folderBuildings({ building: buildingInfo('Villa A', 'Villa B') }, multi);
  const project = {
    ...({ name: 'Al Barsha Villas', info: { projectNo: '2417' } } as unknown as Pick<Project, 'name' | 'info' | 'studyReport' | 'stage' | 'revisions'>),
    folder, building: buildingInfo('Villa A', 'Villa B'),
    boards: [{ id: 'DB-B2-GF', level: { building: 'bld-2', level: 'g' } }, { id: 'DB-X' }] as unknown as Project['boards']
  };

  it('a role inside the building folder: that building, or the shared folder for the whole project', () => {
    expect(roleFolder(folder, 'loadSchedules', vars, [], units[1])?.path).toBe('B2_Villa-B/Schedules');
    expect(roleFolder(folder, 'loadSchedules', vars)?.path).toBe('00_Common');
    expect(roleFolder(folder, 'boq', vars, [], units[0])?.path).toBe('B1_Villa-A/BOQ');
    // A role outside the building folders is the same for every building.
    expect(roleFolder(folder, 'transmittals', vars, [], units[1])).toEqual({ path: '00_Common/Transmittals', onUse: 'TR-{TrNo}' });
    // A role nowhere in the template still asks where to save.
    expect(roleFolder(folder, 'rfis', vars)).toBeUndefined();
    expect(roleFolder(folder, 'loadSchedules', vars, ['mb.common'])).toBeUndefined();
  });

  it('the building comes from the board (its floor in Building information) or is named', () => {
    expect(outputBuilding(project, { Board: 'DB-B2-GF' })).toEqual(units[1]);
    expect(outputBuilding(project, { Board: 'DB-X' })).toBeUndefined();
    expect(outputBuilding(project, { Building: 'bld-1' })).toEqual(units[0]);
    expect(outputBuilding(project, {})).toBeUndefined();
  });

  it('the save dialog starts in the board\'s building folder; a schedule of every board in the shared folder', () => {
    const remembered = { root: 'D:\\Jobs\\2417', unticked: [] };
    const one = saveTarget({ project, output: 'loadSchedule', defaultName: 'x.pdf', ext: 'pdf', values: { Board: 'DB-B2-GF' }, remembered });
    expect(one.dir).toBe('D:\\Jobs\\2417\\B2_Villa-B\\Schedules');
    const all = saveTarget({ project, output: 'loadSchedule', defaultName: 'x.pdf', ext: 'pdf', remembered });
    expect(all.dir).toBe('D:\\Jobs\\2417\\00_Common');
    const boq = saveTarget({ project, output: 'boq', defaultName: 'b.xlsx', ext: 'xlsx', values: { Building: 'bld-1' }, remembered });
    expect(boq.dir).toBe('D:\\Jobs\\2417\\B1_Villa-A\\BOQ');
  });
});
