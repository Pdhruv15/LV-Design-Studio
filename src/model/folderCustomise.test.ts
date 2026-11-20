import { describe, expect, it } from 'vitest';
import {
  addHere, changePlan, customiseCounts, customisePaths, customiseRows, noOverrides, renamedOldPaths, renameHere, roleHere, roleOff,
  templateWithOverrides, toggleHide, whereFilesGo, withOverrides
} from './folderCustomise';
import { builtInTemplate } from './folderTemplateBuiltins';
import { emptyOverrides, readProjectFolder, resolveRole, walkNodes, type ProjectFolder } from './folderTemplates';
import { roleFolder } from './outputRoles';
import { offByDefault } from './projectFolderPlan';

const consultant = builtInTemplate('consultant-full')!;
const villa = builtInTemplate('villa-small')!;
const vars = { ProjectNo: '2417', ProjectShort: 'AlBarsha-Villas' };
const folder = (overrides = emptyOverrides()): ProjectFolder => withOverrides({ templateId: consultant.id, version: 1, template: consultant }, overrides);

describe('Customise for this project (C6): the changes', () => {
  it('adds, renames and hides for this project only; the template does not change', () => {
    const before = JSON.stringify(consultant);
    const first = addHere(consultant, undefined, null, 'Phase-2-Annex');
    const sub = addHere(consultant, first.overrides, first.id, 'Calcs');
    let ov = renameHere(consultant, sub.overrides, sub.id, 'Annex-Calcs');
    ov = renameHere(consultant, ov, 'cf.drawings.issued', '02_Issued_for_Approval');
    ov = toggleHide(consultant, ov, 'cf.admin.timesheets');
    expect(JSON.stringify(consultant)).toBe(before);
    expect(ov.add).toEqual([{ parentId: null, node: { id: 'p.1', name: 'Phase-2-Annex' } }, { parentId: 'p.1', node: { id: 'p.2', name: 'Annex-Calcs' } }]);
    expect(ov.rename).toEqual([{ id: 'cf.drawings.issued', name: '02_Issued_for_Approval' }]);
    expect(ov.hide).toEqual(['cf.admin.timesheets']);
    // Back to the template's name: no rename kept. Hide twice: shown again.
    expect(renameHere(consultant, ov, 'cf.drawings.issued', '02_Issued').rename).toEqual([]);
    expect(toggleHide(consultant, ov, 'cf.admin.timesheets').hide).toEqual([]);
  });

  it('hiding a folder added here takes it out, with what was added inside it and roles moved there', () => {
    const a = addHere(consultant, undefined, null, 'Annex');
    const b = addHere(consultant, a.overrides, a.id, 'Inside');
    const ov = roleHere(consultant, b.overrides, 'boq', b.id);
    expect(ov.roles).toEqual({ boq: 'p.2' });
    const out = toggleHide(consultant, ov, a.id);
    expect(noOverrides(out)).toBe(true);
  });

  it('roles: moved to a folder, back to the template folder, or ask where to save', () => {
    let ov = roleHere(consultant, undefined, 'calcFault', 'cf.calcs.volt-drop');
    expect(ov.roles).toEqual({ calcFault: 'cf.calcs.volt-drop' });
    ov = roleOff(consultant, ov, 'calcFault', 'cf.calcs.volt-drop');
    expect(ov.roles).toEqual({});
    ov = roleOff(consultant, ov, 'calcVd', 'cf.calcs.volt-drop');
    expect(ov.roles).toEqual({ calcVd: '' });
    ov = roleHere(consultant, ov, 'calcVd', 'cf.calcs.volt-drop');
    expect(ov.roles).toEqual({});
  });
});

describe('Customise for this project (C6): the tree and its status', () => {
  const ov = toggleHide(consultant, renameHere(consultant, addHere(consultant, undefined, null, 'Phase-2-Annex').overrides, 'cf.drawings.issued', '02_Issued_for_Approval'), 'cf.admin.timesheets');
  const present = new Set(['01_Admin', '01_Admin/01_Programme', '06_Drawings', '06_Drawings/02_Issued']);

  it('shows hidden folders too, with present / to create / hidden / unticked, renamed and added marks', () => {
    const rows = customiseRows(consultant, ov, vars, [], ['cf.calcs.pv'], present);
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row('cf.admin').status).toBe('present');
    expect(row('cf.admin.programme').status).toBe('present');
    expect(row('cf.admin.minutes').status).toBe('create');
    expect(row('cf.admin.timesheets').status).toBe('hidden');
    expect(row('cf.calcs.pv').status).toBe('unticked');
    expect(row('cf.drawings.issued')).toMatchObject({ name: '02_Issued_for_Approval', renamedFrom: '02_Issued', status: 'create', paths: ['06_Drawings/02_Issued_for_Approval'] });
    expect(row('p.1')).toMatchObject({ name: 'Phase-2-Annex', added: true, depth: 0, status: 'create' });
    expect(row('cf.calcs.volt-drop').roles).toEqual(['calcVd']);
    const paths = customisePaths(rows);
    expect(paths).toContain('Phase-2-Annex');
    expect(paths).not.toContain('01_Admin/03_Timesheets');
    expect(paths).not.toContain('05_Calcs/07_PV');
    expect(customiseCounts(rows, present)).toEqual({ present: 3, create: paths.length - 3, hidden: 1, added: 1 });
  });

  it('lists the old folder of a rename, which is left as it is', () => {
    expect(renamedOldPaths(consultant, ov, vars, [])).toEqual([{ id: 'cf.drawings.issued', from: '02_Issued', to: '02_Issued_for_Approval', paths: ['06_Drawings/02_Issued'] }]);
  });

  it('exports save by role with the project changes (project > template > ask)', () => {
    const o = roleHere(consultant, ov, 'boq', 'p.1');
    const f = folder(o);
    expect(roleFolder(f, 'drawingsIssued', vars)?.path).toBe('06_Drawings/02_Issued_for_Approval');
    expect(roleFolder(f, 'boq', vars)?.path).toBe('Phase-2-Annex');
    expect(resolveRole(consultant, o, 'boq', { vars })).toBe('Phase-2-Annex');
    expect(roleFolder(f, 'calcVd', vars)?.path).toBe('05_Calcs/02_Volt_Drop');
    expect(roleFolder(folder(roleOff(consultant, o, 'calcVd', 'cf.calcs.volt-drop')), 'calcVd', vars)).toBeUndefined();
  });

  it('the overrides round trip through the project file', () => {
    const f = folder(roleHere(consultant, ov, 'boq', 'p.1'));
    const back = readProjectFolder(JSON.parse(JSON.stringify(f)));
    expect(back).toEqual(f);
    expect(withOverrides(f, emptyOverrides())).not.toHaveProperty('overrides');
  });

  it('"Save these changes back to the template" gives the project tree as a template', () => {
    const t = templateWithOverrides(consultant, ov);
    const names: string[] = [];
    walkNodes(t.folders, (n) => names.push(n.name));
    expect(names).toContain('Phase-2-Annex');
    expect(names).toContain('02_Issued_for_Approval');
    expect(names).not.toContain('03_Timesheets');
    expect(t.id).toBe(consultant.id);
  });
});

describe('Change template (C8)', () => {
  const ov = toggleHide(consultant, renameHere(consultant, addHere(consultant, undefined, null, 'Phase-2-Annex').overrides, 'cf.calcs', '05_Calculations'), 'cf.admin.timesheets');
  const plan = changePlan(folder(ov), villa, vars, [], [], offByDefault(villa.folders, []));

  it('creates the new folders, keeps those with the same path, leaves the rest untouched', () => {
    const create = plan.rows.filter((r) => r.kind === 'create').map((r) => r.path);
    expect(create).toContain('03_Calcs');
    expect(create).toContain('04_Drawings');
    expect(plan.rows.find((r) => r.path === '04_Drawings')!.inside).toBe(2);
    expect(create).not.toContain('04_Drawings/Issued');
    expect(plan.rows.filter((r) => r.kind === 'keep').map((r) => r.path)).toEqual(['01_Admin', '02_Received', 'Phase-2-Annex']);
    const untouched = plan.rows.filter((r) => r.kind === 'untouched');
    expect(untouched.map((r) => r.path)).toContain('05_Calculations');
    expect(untouched.find((r) => r.path === '05_Calculations')!.inside).toBeGreaterThan(5);
    expect(plan.rows.findIndex((r) => r.kind === 'untouched')).toBeGreaterThan(plan.rows.findIndex((r) => r.kind === 'keep'));
  });

  it('notes the roles remapped onto a kept folder and where old files would go (list only)', () => {
    const admin = plan.rows.find((r) => r.path === '01_Admin')!;
    expect(admin.remapped).toEqual(expect.arrayContaining([{ role: 'programme', from: '01_Admin/01_Programme' }]));
    expect(whereFilesGo(plan.diff)).toEqual(expect.arrayContaining([{ role: 'calcVd', from: '05_Calculations/02_Volt_Drop', to: '03_Calcs' }]));
  });

  it('keeps the overrides that still apply and lists those dropped; Apply switches the copy', () => {
    expect(plan.kept.add.map((a) => a.node.name)).toEqual(['Phase-2-Annex']);
    expect(plan.dropped).toHaveLength(2);
    expect(plan.dropped.join(' ')).toMatch(/Rename cf\.calcs/);
    expect(plan.folder).toMatchObject({ templateId: 'villa-small', version: villa.version, template: villa, overrides: { add: plan.kept.add, rename: [], hide: [] } });
  });

  it('switching to the same tree creates nothing', () => {
    const same = changePlan(folder(), consultant, vars, [], [], []);
    expect(same.diff.create).toEqual([]);
    expect(same.diff.untouched).toEqual([]);
    expect(same.folder).not.toHaveProperty('overrides');
  });
});
