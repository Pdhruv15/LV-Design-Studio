import { describe, expect, it } from 'vitest';
import { ROLE_CATALOGUE, isRole } from './folderRoles';
import { BUILT_IN_TEMPLATES, builtInTemplate, fromOutline } from './folderTemplateBuiltins';
import {
  applyOverrides, assignedRoles, checkOverrides, countFolders, detectNumbering, diffTemplates, emptyOverrides, expandTemplate,
  fillName, readProjectFolder, renumber, resolveRole, validateTemplate, walkNodes,
  type FolderTemplate, type ProjectFolderOverrides
} from './folderTemplates';
import { migrateProject } from './projectMigrate';
import { sampleProject } from '../data/sampleProject';

const consultant = builtInTemplate('consultant-full')!;
const multi = builtInTemplate('multi-building')!;
const tpl = (folders: string, extra: Partial<FolderTemplate> = {}): FolderTemplate => ({
  id: 'user-t', name: 'T', version: 1, root: '{ProjectNo}_{ProjectShort}', naming: { preset: 'office', pattern: '{ProjectNo}', separator: '-' }, folders: fromOutline('t', folders), ...extra
});
const msgs = (t: FolderTemplate) => validateTemplate(t).filter((i) => i.level === 'error').map((i) => i.message);
const vars = { ProjectNo: '2417', ProjectShort: 'AlBarsha-Villas' };

describe('role catalogue', () => {
  it('has the 50 roles of the spec, each once', () => {
    const ids = ROLE_CATALOGUE.map((r) => r.id);
    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    expect(isRole('calcVd')).toBe(true);
    expect(isRole('constructor')).toBe(false);
  });
});

describe('built-in templates', () => {
  it('are the five of the spec, with no errors and unique node ids', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.id)).toEqual(['consultant-full', 'villa-small', 'contractor-shop', 'iso19650', 'multi-building']);
    for (const t of BUILT_IN_TEMPLATES) {
      expect(msgs(t)).toEqual([]);
      const ids: string[] = [];
      walkNodes(t.folders, (n) => ids.push(n.id));
      expect(new Set(ids).size).toBe(ids.length);
      walkNodes(t.folders, (n) => (n.roles ?? (n.role ? [n.role] : [])).forEach((r) => expect(isRole(r)).toBe(true)));
    }
  });

  it('the consultant template gives every role a folder', () => {
    expect(countFolders(consultant.folders)).toBe(62);
    expect(assignedRoles(consultant.folders).size).toBe(50);
    expect(validateTemplate(consultant)).toEqual([]);
  });

  it('cannot be changed', () => {
    expect(() => { (consultant.folders[0] as { name: string }).name = 'x'; }).toThrow();
  });

  it('outline ids skip the number, so renumbering keeps them', () => {
    const [admin] = fromOutline('p', '01_Admin [programme,minutes]\n  02_Minutes\n  02_Minutes');
    expect(admin).toMatchObject({ id: 'p.admin', name: '01_Admin', roles: ['programme', 'minutes'] });
    expect(admin.children!.map((c) => c.id)).toEqual(['p.admin.minutes', 'p.admin.minutesx']);
  });
});

describe('validateTemplate (C2 checks)', () => {
  it('refuses characters, reserved names, trailing dots and twin names', () => {
    expect(msgs(tpl('09_BOQ & Cost'))).toEqual(['“09_BOQ & Cost”: remove & (not allowed in folder names)']);
    expect(msgs(tpl('CON'))[0]).toContain('reserved Windows name');
    expect(msgs(tpl('com3.txt'))[0]).toContain('reserved Windows name');
    expect(msgs(tpl('Calcs.'))[0]).toContain('ends with a dot');
    expect(msgs(tpl('Calcs\ncalcs'))[0]).toContain('Two folders named');
    expect(msgs(tpl('A\n  Calcs\nB\n  Calcs'))).toEqual([]); // same name under different parents is fine
    expect(msgs(tpl('{Nope}'))[0]).toContain('{Nope} is not a field');
  });

  it('a role saves to one folder, and must be a known role', () => {
    expect(msgs(tpl('A [calcVd]\nB [calcVd]'))[0]).toContain('a role saves to one folder');
    expect(msgs(tpl('A [calcVolts]'))[0]).toContain('unknown role calcVolts');
  });

  it('warns about depth, path length and roles with no folder', () => {
    const deep = tpl(Array.from({ length: 7 }, (_, i) => `${'  '.repeat(i)}L${i}`).join('\n'));
    const w = validateTemplate(deep).filter((i) => i.level === 'warn').map((i) => i.message);
    expect(w).toContain('“L6” is 7 levels deep (6 at most)');
    expect(w).toContain('50 roles have no folder; those outputs ask where to save');
    const long = validateTemplate(tpl(`${'x'.repeat(100)}\n  ${'y'.repeat(100)}`)).find((i) => i.message.includes('characters for the sample project'));
    expect(long?.level).toBe('warn');
  });

  it('more than 300 folders is an error; nested building repeats and bad subfolder patterns too', () => {
    expect(msgs(tpl(Array.from({ length: 301 }, (_, i) => `F${i}`).join('\n')))).toContain('301 folders (300 at most)');
    expect(msgs(tpl('{BuildingCode} @building:each\n  {BuildingName} @building:each'))[0]).toContain('already does');
    expect(msgs(tpl('Issued >{Stage}/Rev-{Rev}'))).toEqual([]);
    expect(msgs(tpl('Issued >{Stage}//x'))[0]).toContain('empty part');
    expect(msgs(tpl('Issued >{Client}'))[0]).toContain('{Client} is not a field');
  });
});

describe('names and numbering', () => {
  it('fills fields, makes values safe and leaves out missing ones with their separator', () => {
    expect(fillName('{ProjectNo}_{ProjectShort}', vars)).toBe('2417_AlBarsha-Villas');
    expect(fillName('{ProjectNo}_{ProjectShort}', { ProjectNo: '2417' })).toBe('2417');
    expect(fillName('{ProjectNo}_{ProjectShort}', { ProjectShort: 'X' })).toBe('X');
    expect(fillName('{BuildingCode}_{BuildingName}', { BuildingCode: 'B1', BuildingName: 'Villa A/B.' })).toBe('B1_Villa A-B');
    expect(fillName('A_{Client}_{Plot}_Z', {})).toBe('A_Z');
  });

  it('detects and applies each numbering style', () => {
    const level = fromOutline('n', 'Admin\n05_Calcs\n1. Drawings');
    expect(renumber(level, '01_').map((n) => n.name)).toEqual(['01_Admin', '02_Calcs', '03_Drawings']);
    expect(renumber(level, '1.').map((n) => n.name)).toEqual(['1. Admin', '2. Calcs', '3. Drawings']);
    expect(renumber(level, 'A-').map((n) => n.name)).toEqual(['A-Admin', 'B-Calcs', 'C-Drawings']);
    expect(renumber(renumber(level, 'A-'), 'none').map((n) => n.name)).toEqual(['Admin', 'Calcs', 'Drawings']);
    expect(renumber(level, '01_')[1].id).toBe(level[1].id);
    expect(detectNumbering(['01_A', '02_B'])).toBe('01_');
    expect(detectNumbering(['1. A', '2.B'])).toBe('1.');
    expect(detectNumbering(['A-Admin', 'B-Received', 'C-Calc'])).toBe('A-');
    // ISO discipline codes are not a letter numbering: they are kept when renumbering
    const iso = fromOutline('i', 'E-Electrical\nA-Architectural');
    expect(detectNumbering(iso.map((n) => n.name))).toBe('none');
    expect(renumber(iso, '01_').map((n) => n.name)).toEqual(['01_E-Electrical', '02_A-Architectural']);
  });
});

describe('project overrides', () => {
  const ov = (o: Partial<ProjectFolderOverrides>): ProjectFolderOverrides => ({ ...emptyOverrides(), ...o });

  it('renames, hides, adds and moves roles without changing the template', () => {
    const before = JSON.stringify(consultant);
    const tree = applyOverrides(consultant, ov({
      rename: [{ id: 'cf.drawings.issued', name: '02_Issued_for_Approval' }],
      hide: ['cf.tender', 'cf.admin.timesheets'],
      add: [{ parentId: null, node: { id: 'p.annex', name: 'Phase-2-Annex' } }, { parentId: 'cf.calcs', node: { id: 'p.calcs.ext', name: '10_External', role: 'calcPv' } }],
      roles: { calcFault: 'cf.calcs.volt-drop', boq: '' }
    }));
    expect(JSON.stringify(consultant)).toBe(before);
    const ids: string[] = [];
    walkNodes(tree, (n) => ids.push(n.id));
    expect(ids).not.toContain('cf.tender');
    expect(ids).not.toContain('cf.tender.bids');
    expect(ids).not.toContain('cf.admin.timesheets');
    expect(ids).toContain('p.annex');
    expect(tree.find((n) => n.id === 'cf.drawings')!.children!.find((n) => n.id === 'cf.drawings.issued')!.name).toBe('02_Issued_for_Approval');
    const calcs = tree.find((n) => n.id === 'cf.calcs')!.children!;
    expect(calcs.find((n) => n.id === 'cf.calcs.volt-drop')!.roles).toEqual(['calcVd', 'calcFault']);
    expect(calcs.find((n) => n.id === 'cf.calcs.fault')!.role).toBeUndefined();
    expect(assignedRoles(tree).has('boq')).toBe(false);
  });

  it('resolveRole: the project wins, then the template, else ask', () => {
    expect(resolveRole(consultant, undefined, 'calcVd', { vars })).toBe('05_Calcs/02_Volt_Drop');
    expect(resolveRole(consultant, ov({ roles: { calcVd: 'cf.calcs' } }), 'calcVd')).toBe('05_Calcs');
    expect(resolveRole(consultant, ov({ roles: { calcVd: '' } }), 'calcVd')).toBeUndefined();
    expect(resolveRole(consultant, ov({ hide: ['cf.calcs'] }), 'calcVd')).toBeUndefined();
    expect(resolveRole(consultant, ov({ rename: [{ id: 'cf.calcs', name: '05_Calculations' }] }), 'calcVd')).toBe('05_Calculations/02_Volt_Drop');
    expect(resolveRole(consultant, undefined, 'calcPv', { flags: [] })).toBeUndefined(); // no PV in this project
    expect(resolveRole(consultant, undefined, 'calcPv', { flags: ['scope:pv'] })).toBe('05_Calcs/07_PV');
    expect(resolveRole(consultant, undefined, 'notARole')).toBeUndefined();
  });

  it('resolveRole inside a building folder needs the building', () => {
    expect(resolveRole(multi, undefined, 'loadSchedules')).toBeUndefined();
    expect(resolveRole(multi, undefined, 'loadSchedules', { building: { code: 'B2', name: 'Villa-B' } })).toBe('B2_Villa-B/Schedules');
    expect(resolveRole(multi, undefined, 'transmittals', { building: { code: 'B2', name: 'Villa-B' } })).toBe('00_Common/Transmittals');
  });

  it('checkOverrides keeps what still applies and lists the rest', () => {
    const { kept, dropped } = checkOverrides(builtInTemplate('villa-small')!, ov({
      hide: ['vs.admin', 'cf.tender'],
      rename: [{ id: 'vs.calcs', name: 'Calcs' }, { id: 'cf.calcs', name: 'x' }],
      add: [{ parentId: 'vs.boq', node: { id: 'p.a', name: 'A' } }, { parentId: 'p.a', node: { id: 'p.b', name: 'B' } }, { parentId: 'cf.admin', node: { id: 'p.c', name: 'C' } }],
      roles: { boq: 'vs.drawings', calcVd: 'cf.calcs.volt-drop', specs: 'p.a' }
    }));
    expect(kept.hide).toEqual(['vs.admin']);
    expect(kept.rename).toEqual([{ id: 'vs.calcs', name: 'Calcs' }]);
    expect(kept.add.map((a) => a.node.id)).toEqual(['p.a', 'p.b']);
    expect(kept.roles).toEqual({ boq: 'vs.drawings', specs: 'p.a' });
    expect(dropped).toHaveLength(4);
  });
});

describe('expandTemplate', () => {
  it('fills names and leaves out folders whose condition is off', () => {
    const { root, folders } = expandTemplate(consultant, vars);
    expect(root).toBe('2417_AlBarsha-Villas');
    const paths = folders.map((f) => f.path);
    expect(paths).toContain('05_Calcs/02_Volt_Drop');
    expect(paths).not.toContain('05_Calcs/07_PV');
    expect(paths.some((p) => p.startsWith('13_Tender'))).toBe(false);
    const all = expandTemplate(consultant, vars, ['scope:pv', 'scope:standby', 'scope:fire', 'scope:elv', 'stage:tender', 'service:supervision']);
    expect(all.folders).toHaveLength(62);
    expect(all.folders.find((f) => f.path === '05_Calcs/07_PV')!.roles).toEqual(['calcPv']);
  });

  it('repeats building:each folders for every building', () => {
    const b = [{ code: 'B1', name: 'Villa-A' }, { code: 'B2', name: 'Villa-B' }, { code: 'B3', name: 'Club/House' }];
    const { folders } = expandTemplate(multi, vars, [], b);
    expect(folders.filter((f) => f.nodeId === 'mb.buildingcode-buildingname').map((f) => f.path)).toEqual(['B1_Villa-A', 'B2_Villa-B', 'B3_Club-House']);
    expect(folders.filter((f) => f.path.startsWith('B3_')).map((f) => f.building)).toEqual(['B3', 'B3', 'B3', 'B3', 'B3']);
    expect(folders).toHaveLength(4 + 3 * 5);
    expect(expandTemplate(multi, vars).folders.map((f) => f.path)).toEqual(['00_Common', '00_Common/Admin', '00_Common/DEWA', '00_Common/Transmittals']);
  });
});

describe('diffTemplates (C8)', () => {
  it('lists folders to create, kept, untouched and roles that move', () => {
    const old = expandTemplate(builtInTemplate('villa-small')!, vars).folders;
    const next = expandTemplate(consultant, vars).folders;
    const d = diffTemplates(old, next);
    expect(d.keep.map((f) => f.path)).toEqual(['01_Admin', '02_Received']);
    expect(d.create).toHaveLength(next.length - 2);
    expect(d.untouched.map((f) => f.path)).not.toContain('01_Admin');
    expect(d.untouched).toHaveLength(old.length - 2);
    expect(d.remap.find((r) => r.role === 'calcVd')).toEqual({ role: 'calcVd', from: '03_Calcs', to: '05_Calcs/02_Volt_Drop' });
    const same = diffTemplates(next, next.map((f) => ({ ...f, path: f.path.toUpperCase() })));
    expect([same.create.length, same.untouched.length, same.remap.length, same.keep.length]).toEqual([0, 0, 0, next.length]);
  });
});

describe('the project keeps a copy of its template', () => {
  const folder = { templateId: 'consultant-full', version: 1, template: consultant, overrides: emptyOverrides() };

  it('round-trips through JSON and survives opening', () => {
    const p = { ...sampleProject, folder: JSON.parse(JSON.stringify(folder)) };
    const m = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(m.folder).toEqual(JSON.parse(JSON.stringify(folder)));
    expect(resolveRole(m.folder!.template, m.folder!.overrides, 'boq')).toBe('09_BOQ_Cost/01_BOQ');
  });

  it('a project without a folder opens unchanged', () => {
    const p = migrateProject(sampleProject);
    expect(migrateProject(p)).toBe(p);
    expect('folder' in p).toBe(false);
  });

  it('a damaged folder setting is dropped; damaged overrides alone are dropped', () => {
    expect(readProjectFolder({ templateId: 'x', template: { id: 'x' } })).toBeUndefined();
    expect(migrateProject({ ...sampleProject, folder: { bad: true } as never }).folder).toBeUndefined();
    const f = readProjectFolder({ ...folder, overrides: { add: 'no' } });
    expect(f?.template.id).toBe('consultant-full');
    expect(f && 'overrides' in f).toBe(false);
  });
});
