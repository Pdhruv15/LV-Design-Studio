import { describe, expect, it } from 'vitest';
import { builtInTemplate } from './folderTemplateBuiltins';
import { cleanFolderName, folderBuildings, folderFlags, folderVars, joinPath, offByDefault, planFolders, rememberedFolder, rememberFolder, suggestedRootName } from './projectFolderPlan';
import type { FolderTemplate } from './folderTemplates';
import type { Project } from '../types';

const consultant = builtInTemplate('consultant-full')!;
const t: FolderTemplate = {
  ...consultant, id: 'user-test', folders: [
    { id: 'a', name: '01_Admin', children: [{ id: 'a1', name: 'Minutes' }] },
    { id: 'c', name: '03_Calcs', children: [{ id: 'c1', name: 'VD' }, { id: 'c2', name: 'PV', when: 'scope:pv', children: [{ id: 'c2a', name: 'Yield' }] }] },
    { id: 't', name: '10_Tender', when: 'stage:tender' },
    { id: 'b', name: '{BuildingCode}_{BuildingName}', when: 'building:each', children: [{ id: 'b1', name: 'Drawings' }] }
  ]
};

describe('names and scope from the project', () => {
  it('reads the fields folder names use', () => {
    const p = { name: 'Villa Jumeirah', info: { owner: ' Sample LLC ', plotNo: '345' }, studyReport: { projectNo: 'P2611' } } as unknown as Project;
    expect(folderVars(p)).toEqual({ ProjectShort: 'Villa Jumeirah', ProjectNo: 'P2611', Client: 'Sample LLC', Plot: '345' });
    expect(folderVars({ name: 'X' } as Project)).toEqual({ ProjectShort: 'X' });
  });
  it('uses the project number of the project before the one typed for reports', () => {
    const p = { name: 'Villa', info: { projectNo: ' P2700 ' }, studyReport: { projectNo: 'P2611' } } as unknown as Project;
    expect(folderVars(p).ProjectNo).toBe('P2700');
    expect(folderVars({ name: 'Villa', info: { projectNo: '  ' }, studyReport: { projectNo: 'P2611' } } as unknown as Project).ProjectNo).toBe('P2611');
  });
  it('suggests the project folder name, leaving out a number that is not known', () => {
    expect(suggestedRootName(t, { ProjectNo: 'P2611', ProjectShort: 'Villa Jumeirah' })).toBe('P2611_Villa Jumeirah');
    expect(suggestedRootName(t, { ProjectShort: 'Villa: A/B.' })).toBe('Villa- A-B');
    expect(suggestedRootName(t, {})).toBe('Project');
    expect(cleanFolderName('  a?b.  ')).toBe('a-b');
  });
  it('switches on the conditions the brief knows', () => {
    expect(folderFlags({ brief: { scope: ['sld', 'solar', 'ups'] } } as unknown as Project)).toEqual(['scope:pv', 'scope:standby']);
    expect(folderFlags({} as Project)).toEqual([]);
  });
  it('switches on a folder condition for each of the four newer scope items, and none for a brief without them', () => {
    const flags = (scope: string[]) => folderFlags({ brief: { scope } } as unknown as Project);
    expect(flags(['fire'])).toEqual(['scope:fire']);
    expect(flags(['elv'])).toEqual(['scope:elv']);
    expect(flags(['tender'])).toEqual(['stage:tender']);
    expect(flags(['supervision'])).toEqual(['service:supervision']);
    expect(flags(['sld', 'loads', 'studies', 'earthing', 'pfc', 'containment', 'boq'])).toEqual([]);
    expect(flags(['supervision', 'ups', 'fire', 'solar'])).toEqual(['scope:pv', 'scope:standby', 'scope:fire', 'service:supervision']);
  });
  it('names the project\'s buildings B1, B2…', () => {
    const p = { building: { buildings: [{ id: 'x', name: 'Tower A', levels: [] }, { id: 'y', name: ' ', levels: [] }], rooms: [] } } as unknown as Project;
    expect(folderBuildings(p)).toEqual([{ code: 'B1', name: 'Tower-A', id: 'x' }, { code: 'B2', name: 'Building-2', id: 'y' }]);
  });
});

describe('the folders to make', () => {
  it('starts with the folders of a switched-off condition unticked, with what is inside them', () => {
    expect(offByDefault(t.folders, [])).toEqual(['c2', 'c2a', 't']);
    expect(offByDefault(t.folders, ['scope:pv'])).toEqual(['t']);
  });
  it('lists the ticked folders, parents first, repeating a building folder for each building', () => {
    const plan = planFolders(t, undefined, {}, [{ code: 'B1', name: 'Tower-A' }, { code: 'B2', name: 'Podium' }], ['c2', 'c2a', 't']);
    expect(plan.paths).toEqual(['01_Admin', '01_Admin/Minutes', '03_Calcs', '03_Calcs/VD', 'B1_Tower-A', 'B1_Tower-A/Drawings', 'B2_Podium', 'B2_Podium/Drawings']);
  });
  it('lets the ticks decide: a ticked folder is made even when its condition is off', () => {
    expect(planFolders(t, undefined, {}, [], []).paths).toContain('03_Calcs/PV/Yield');
    expect(planFolders(t, undefined, {}, [], ['c']).paths).toEqual(['01_Admin', '01_Admin/Minutes', '10_Tender']);
  });
  it('applies the project\'s own changes to the template', () => {
    const plan = planFolders(t, { add: [{ parentId: 'a', node: { id: 'x', name: 'Phase-2' } }], rename: [{ id: 'c1', name: 'Voltage-Drop' }], hide: ['t'], roles: {} }, {}, [], []);
    expect(plan.paths).toContain('01_Admin/Phase-2');
    expect(plan.paths).toContain('03_Calcs/Voltage-Drop');
    expect(plan.paths).not.toContain('10_Tender');
  });
  it('finds paths that are too long for the chosen place', () => {
    expect(planFolders(t, undefined, {}, [], [], 'D:\\Projects\\P1').tooLong).toEqual([]);
    expect(planFolders(t, undefined, {}, [], [], `D:\\${'x'.repeat(185)}`).tooLong).toContain('01_Admin/Minutes');
  });
  it('makes every folder of the built-in consultant template with no building needed', () => {
    const plan = planFolders(consultant, undefined, { ProjectNo: 'P1', ProjectShort: 'V' }, [], []);
    expect(plan.paths.length).toBeGreaterThan(60);
    expect(new Set(plan.paths.map((p) => p.toLowerCase())).size).toBe(plan.paths.length);
  });
  it('joins with the separator the folder uses', () => {
    expect(joinPath('D:\\Projects\\', 'P1')).toBe('D:\\Projects\\P1');
    expect(joinPath('/home/me/projects', 'P1')).toBe('/home/me/projects/P1');
  });
});

describe('the folder remembered on this computer', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };
  it('keeps the place and the unticked folders per project, and forgets them', () => {
    const s = mem();
    rememberFolder('p1', { root: 'D:\\Projects\\P1', unticked: ['t'] }, s);
    expect(rememberedFolder('p1', s)).toEqual({ root: 'D:\\Projects\\P1', unticked: ['t'] });
    expect(rememberedFolder('p2', s)).toBeUndefined();
    rememberFolder('p1', undefined, s);
    expect(rememberedFolder('p1', s)).toBeUndefined();
  });
  it('ignores stored content of the wrong shape and storage that fails', () => {
    const s = mem();
    s.m.set('lvds.projectFolder.p1', '{"root":5}');
    expect(rememberedFolder('p1', s)).toBeUndefined();
    s.m.set('lvds.projectFolder.p1', 'not json');
    expect(rememberedFolder('p1', s)).toBeUndefined();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(() => rememberFolder('p1', { root: 'x', unticked: [] }, broken)).not.toThrow();
    expect(rememberedFolder('p1', broken)).toBeUndefined();
  });
});
