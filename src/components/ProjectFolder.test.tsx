// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewProjectWizard } from './BriefEditor';
import { ProjectFolderCard } from './ProjectFolder';
import { copyProjectFileToFolder, folderZip, splitPath, type FolderChoice, type FolderDisk } from './projectFolderActions';
import { builtInTemplate } from '../model/folderTemplateBuiltins';
import { webTemplatesClient } from '../model/folderTemplatesClient';
import { rememberedFolder, rememberFolder } from '../model/projectFolderPlan';
import { BUILT_IN_REFERENCES } from '../model/designReference';
import { newProject, type Project } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
const client = () => { const m = new Map<string, string>(); return webTemplatesClient({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } }); };
const fakeDisk = (have: string[] = [], exists = true) => {
  const made: { root: string; paths: string[] }[] = [];
  const disk: FolderDisk = {
    chooseParent: vi.fn(async () => 'D:\\Chosen'),
    create: vi.fn(async (r: string, paths: string[]) => { made.push({ root: r, paths }); return { root: r, rootMade: true, created: paths.length, existed: 0, failed: [] }; }),
    status: vi.fn(async (r: string, paths: string[]) => {
      const there = new Set([...have, ...made.flatMap((m) => m.paths)]);
      return { root: r, exists: exists || made.length > 0, present: paths.filter((p) => there.has(p)), missing: paths.filter((p) => !there.has(p)), looseFiles: ['plan.dwg'], looseCount: 1 };
    }),
    open: vi.fn(async () => null)
  };
  return { disk, made };
};
beforeEach(() => { localStorage.clear(); host = document.body.appendChild(document.createElement('div')); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; localStorage.clear(); });

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
const type = (el: HTMLInputElement, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
const field = (label: string) => [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector<HTMLInputElement>('input')!;
const text = () => document.body.textContent ?? '';

describe('New project: the Project folder step (F1)', () => {
  const onCreate = vi.fn();
  const show = async (disk?: FolderDisk) => {
    onCreate.mockClear();
    act(() => root.render(<NewProjectWizard initialName="Villa Jumeirah" references={BUILT_IN_REFERENCES} folderParent={disk ? 'D:\\Projects' : ''} folderClient={client()} folderDisk={disk} onQuick={() => {}} onCreate={onCreate} onCancel={() => {}} />));
    await flush();
    click(document.querySelector('.home-act')!);
    for (let i = 0; i < 4; i++) click(button('Next'));
  };
  it('offers the default template, the place, the name and the folders, with the count', async () => {
    const { disk } = fakeDisk();
    await show(disk);
    expect(text()).toContain('step 5 of 6: Project folder');
    expect(field('Folder name').value).toBe('Villa Jumeirah');
    expect(field('Location').value).toBe('D:\\Projects');
    expect(text()).toContain('D:\\Projects\\Villa Jumeirah');
    expect(text()).toMatch(/\d+ folders will be created\. Nothing existing is moved or deleted\./);
  });
  it('passes the choice to Create project as the sixth argument, with unticked folders left out', async () => {
    const { disk } = fakeDisk();
    await show(disk);
    const before = +text().match(/(\d+) folders will be created/)![1];
    click(document.querySelector('.pf-tree input[type=checkbox]')!);
    expect(+text().match(/(\d+) folders will be created/)![1]).toBeLessThan(before);
    click(button('Browse…'));
    await flush();
    expect(field('Location').value).toBe('D:\\Chosen');
    click(button('Next'));
    expect(text()).toContain('Project folder: Electrical consultant full, in D:\\Chosen\\Villa Jumeirah');
    click(button('Create project'));
    const choice = onCreate.mock.calls[0][5] as FolderChoice;
    expect(choice).toMatchObject({ parent: 'D:\\Chosen', name: 'Villa Jumeirah' });
    expect(choice.template.id).toBe('consultant-full');
    expect(choice.unticked.length).toBeGreaterThan(0);
  });
  it('puts the typed project number in the suggested folder name and passes it as the seventh argument', async () => {
    const { disk } = fakeDisk();
    onCreate.mockClear();
    act(() => root.render(<NewProjectWizard initialName="Villa Jumeirah" references={BUILT_IN_REFERENCES} folderParent="D:\\Projects" folderClient={client()} folderDisk={disk} onQuick={() => {}} onCreate={onCreate} onCancel={() => {}} />));
    await flush();
    type(field('Project number'), ' P2611 ');
    click(document.querySelector('.home-act')!);
    for (let i = 0; i < 4; i++) click(button('Next'));
    expect(field('Folder name').value).toBe('P2611_Villa Jumeirah');
    click(button('Next'));
    click(button('Create project'));
    expect(onCreate.mock.calls[0][6]).toBe('P2611');
    expect((onCreate.mock.calls[0][5] as FolderChoice).name).toBe('P2611_Villa Jumeirah');
  });
  it('Skip folders creates the project with no folder choice', async () => {
    const { disk } = fakeDisk();
    await show(disk);
    click(button('Skip folders'));
    expect(text()).toContain('Project folder: none');
    click(button('Create project'));
    expect(onCreate.mock.calls[0][5]).toBeUndefined();
  });
  it('needs a location on the desktop before the project can be created', async () => {
    const { disk } = fakeDisk();
    await show(disk);
    type(field('Location'), '');
    click(button('Next'));
    expect(button('Create project').disabled).toBe(true);
    expect(text()).toContain('choose its location on the Project folder step, or skip it');
  });
  it('in the web version says the folders come as a ZIP file', async () => {
    await show(undefined);
    expect(text()).toContain('The web version cannot make folders on your computer');
    expect([...document.querySelectorAll('label')].some((l) => l.textContent?.startsWith('Location'))).toBe(false);
  });
});

describe('Overview: the Project folder card (F3)', () => {
  const template = builtInTemplate('villa-small')!;
  const withFolder = (): Project => ({ ...newProject('Villa'), id: 'p1', folder: { templateId: template.id, version: 1, template } });
  const show = async (project: Project, disk: FolderDisk | undefined, onChange = vi.fn(), onStatus = vi.fn()) => {
    act(() => root.render(<ProjectFolderCard project={project} onChangeProject={onChange} onStatus={onStatus} client={client()} disk={disk} />));
    await flush();
    return { onChange, onStatus };
  };
  it('offers to create a folder for a project that has none, and makes it', async () => {
    const { disk, made } = fakeDisk();
    const project = { ...newProject('Villa'), id: 'p0' };
    const { onChange, onStatus } = await show(project, disk);
    expect(text()).toContain('No project folder');
    click(button('Create project folder…'));
    await flush();
    type(field('Location'), 'D:\\Projects');
    click(button('Create folders'));
    await flush();
    expect(made).toHaveLength(1);
    expect(made[0].root).toBe('D:\\Projects\\Villa');
    expect(made[0].paths.length).toBeGreaterThan(5);
    expect(onChange.mock.calls[0][0].folder.templateId).toBe('consultant-full');
    expect(onStatus.mock.calls[0][0]).toMatch(/^Created \d+ folders in D:\\Projects\\Villa\./);
    expect(rememberedFolder('p0')?.root).toBe('D:\\Projects\\Villa');
  });
  it('asks for the folder on a computer that has not seen the project', async () => {
    const { disk } = fakeDisk();
    await show(withFolder(), disk);
    expect(text()).toContain('its folder has not been chosen on this computer yet');
    expect(button('Choose the folder on this computer…')).toBeTruthy();
  });
  it('shows what is present and missing, creates only the missing folders, and opens the folder', async () => {
    const { disk, made } = fakeDisk(['01_Admin']);
    rememberFolder('p1', { root: 'D:\\Projects\\Villa', unticked: [] });
    const { onStatus, onChange } = await show(withFolder(), disk);
    expect(text()).toMatch(/1 of \d+ folders present · \d+ folders missing/);
    expect(text()).toContain('1 file in the project folder itself, not in a subfolder: plan.dwg. They are left where they are.');
    click(button('Create missing folders'));
    await flush();
    expect(made[0].root).toBe('D:\\Projects\\Villa');
    expect(made[0].paths).not.toContain('01_Admin');
    expect(onStatus).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(text()).toMatch(/All \d+ folders present/);
    click(button('Open'));
    await flush();
    expect(disk.open).toHaveBeenCalledWith('D:\\Projects\\Villa');
  });
  it('says so when the remembered folder is gone', async () => {
    const { disk } = fakeDisk([], false);
    rememberFolder('p1', { root: 'D:\\Gone\\Villa', unticked: [] });
    await show(withFolder(), disk);
    expect(text()).toContain('This folder is not on this computer.');
  });
  it('in the web version offers the ZIP file', async () => {
    await show(withFolder(), undefined);
    expect(button('Download as ZIP…')).toBeTruthy();
    expect(text()).toContain('The web version cannot make folders on your computer');
  });
});

describe('helpers', () => {
  it('splits a path into its folder and name', () => {
    expect(splitPath('D:\\Projects\\Villa')).toEqual({ parent: 'D:\\Projects', name: 'Villa' });
    expect(splitPath('/home/me/Villa/')).toEqual({ parent: '/home/me', name: 'Villa' });
    expect(splitPath('Villa')).toEqual({ parent: '', name: 'Villa' });
  });
  it('zips the empty folders under the project folder', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(await folderZip('P1_Villa', ['01_Admin', '03_Calcs/VD']));
    const dirs = Object.values(zip.files).filter((f) => f.dir).map((f) => f.name).sort();
    expect(dirs).toEqual(['P1_Villa/', 'P1_Villa/01_Admin/', 'P1_Villa/03_Calcs/', 'P1_Villa/03_Calcs/VD/']);
    expect(Object.values(zip.files).filter((f) => !f.dir)).toEqual([]);
  });
});

describe('a copy of the project file in the project folder on save (decision 1, option B)', () => {
  const folder = { templateId: 'consultant-full', version: 1, template: builtInTemplate('consultant-full')! };
  const p = { id: 'copy1', name: 'Villa', studyReport: { projectNo: 'P2611' }, folder } as unknown as Project;
  const diskWith = (saveCopy: FolderDisk['saveCopy']) => ({ chooseParent: vi.fn(), create: vi.fn(), status: vi.fn(), open: vi.fn(), saveCopy }) as unknown as FolderDisk;
  afterEach(() => { rememberFolder('copy1', undefined); });

  it('writes the copy into the projectFile folder, named as the project file', async () => {
    rememberFolder('copy1', { root: '/jobs/P2611_Villa', unticked: [] });
    const saveCopy = vi.fn(async () => ({ file: 'x' }));
    expect(await copyProjectFileToFolder(p, 'villa-copy1.lvds', diskWith(saveCopy))).toBeUndefined();
    expect(saveCopy).toHaveBeenCalledWith({ root: '/jobs/P2611_Villa', relDir: '03_Project_File', fileName: 'villa-copy1.lvds', sourceFile: 'villa-copy1.lvds' });
  });
  it('does nothing without a project folder on this computer', async () => {
    const saveCopy = vi.fn(async () => ({ file: 'x' }));
    expect(await copyProjectFileToFolder(p, 'villa-copy1.lvds', diskWith(saveCopy))).toBeUndefined();
    expect(saveCopy).not.toHaveBeenCalled();
  });
  it('reports a failed copy once, without failing the save', async () => {
    rememberFolder('copy1', { root: '/jobs/P2611_Villa', unticked: [] });
    const saveCopy = vi.fn(async () => { throw new Error("Error invoking remote method 'projectFolders:saveCopy': Error: The project folder is not on this computer."); });
    expect(await copyProjectFileToFolder(p, 'villa-copy1.lvds', diskWith(saveCopy))).toBe('The copy in the project folder was not saved: The project folder is not on this computer.');
    expect(await copyProjectFileToFolder(p, 'villa-copy1.lvds', diskWith(saveCopy))).toBeUndefined();
  });
});

describe('Overview: Customise for this project (C6) and Change template (C8)', () => {
  const villa = builtInTemplate('villa-small')!;
  const project = (): Project => ({ ...newProject('Villa'), id: 'p9', folder: { templateId: villa.id, version: 1, template: villa } });
  /** The disk bridge, recording every call by name: only status, fileCounts and create may be used. */
  const watched = (have: string[]) => {
    const { disk, made } = fakeDisk(have);
    const calls: string[] = [];
    const full: FolderDisk = { ...disk, fileCounts: vi.fn(async (_r: string, paths: string[]) => paths.map((p) => (have.includes(p) ? 23 : -1))) };
    const proxy = new Proxy(full, { get: (o, k) => { const v = (o as unknown as Record<string | symbol, unknown>)[k]; if (typeof v === 'function') calls.push(String(k)); return v; } });
    return { disk: proxy, made, calls };
  };
  const show = async (disk: FolderDisk, p = project()) => {
    rememberFolder('p9', { root: 'D:\\Jobs\\Villa', unticked: [] });
    const onChange = vi.fn(), onStatus = vi.fn();
    act(() => root.render(<ProjectFolderCard project={p} onChangeProject={onChange} onStatus={onStatus} client={client()} disk={disk} />));
    await flush();
    return { onChange, onStatus };
  };
  const rowOf = (name: string) => [...document.querySelectorAll('[role="treeitem"]')].find((r) => r.querySelector('.ft-name')?.textContent === name)!;

  it('adds, renames and hides for this project, lists the old folder, and only creates folders', async () => {
    const { disk, made, calls } = watched(['01_Admin', '04_Drawings', '04_Drawings/Issued']);
    const { onChange, onStatus } = await show(disk);
    click(button('Customise…'));
    await flush();
    expect(text()).toContain('Customise project folder: Villa');
    expect(rowOf('01_Admin').textContent).toContain('✓ present');
    // Rename 04_Drawings/Issued: the new name is created, the old folder is listed with its files.
    click(rowOf('Issued'));
    click(button('Rename'));
    const input = document.querySelector<HTMLInputElement>('input.ft-rename')!;
    type(input, 'Issued_for_Approval');
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await flush();
    expect(rowOf('Issued_for_Approval').textContent).toContain('renamed here');
    expect(text()).toContain('“Issued” → “Issued_for_Approval”. The new folder is created. The old one is left as it is:');
    expect(text()).toContain('04_Drawings\\Issued (23 files)');
    // Hide a template folder and add one of this project's own.
    click(rowOf('08_Transmittals'));
    click(button('Hide for this project'));
    expect(rowOf('08_Transmittals').textContent).toContain('hidden here');
    click(button('+ Folder'));
    const add = document.querySelector<HTMLInputElement>('input.ft-rename')!;
    type(add, 'Phase-2-Annex');
    act(() => { add.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await flush();
    expect(rowOf('Phase-2-Annex').textContent).toContain('＋ to create · added here');
    const create = [...document.querySelectorAll('button')].find((b) => /^Create \d+ folders$/.test(b.textContent ?? ''))!;
    click(create);
    await flush();
    expect(made[0].paths).toContain('Phase-2-Annex');
    expect(made[0].paths).toContain('04_Drawings/Issued_for_Approval');
    expect(made[0].paths).not.toContain('08_Transmittals');
    expect(made[0].paths).not.toContain('01_Admin');
    const ov = onChange.mock.calls[0][0].folder.overrides;
    expect(ov.hide).toEqual(['vs.transmittals']);
    expect(ov.rename).toEqual([{ id: 'vs.drawings.issued', name: 'Issued_for_Approval' }]);
    expect(ov.add.map((a: { node: { name: string } }) => a.node.name)).toEqual(['Phase-2-Annex']);
    expect(onChange.mock.calls[0][0].folder.template).toBe(villa);
    expect(onStatus.mock.calls[0][0]).toMatch(/^Created \d+ folders in D:\\Jobs\\Villa\./);
    expect(calls.filter((c) => /rename|move|delete|remove|trash|unlink/i.test(c))).toEqual([]);
    expect(new Set(calls)).toEqual(new Set(['status', 'fileCounts', 'create']));
  });

  it('Reset to template drops the project changes', async () => {
    const { disk } = watched([]);
    const p = project();
    const { onChange } = await show(disk, { ...p, folder: { ...p.folder!, overrides: { add: [], rename: [], hide: ['vs.transmittals'], roles: {} } } });
    click(button('Customise…'));
    await flush();
    click(button('Reset to template'));
    click([...document.querySelectorAll('button')].find((b) => /^Create \d+ folders$/.test(b.textContent ?? ''))!);
    await flush();
    expect(onChange.mock.calls[0][0].folder).not.toHaveProperty('overrides');
  });

  it('Change template: shows the diff, keeps what applies, lists what is dropped, and only creates folders', async () => {
    const { disk, made, calls } = watched(['01_Admin', '07_DEWA']);
    const p = project();
    const { onChange, onStatus } = await show(disk, { ...p, folder: { ...p.folder!, overrides: { add: [{ parentId: null, node: { id: 'p.1', name: 'Phase-2-Annex' } }], rename: [], hide: ['vs.dewa'], roles: {} } } });
    click(button('Change template…'));
    await flush();
    expect(text()).toContain('Change folder template: Villa');
    expect(field('From').value).toBe('Villa / small building v1');
    expect(text()).toContain('= kept');
    expect(text()).toContain('＋ to create');
    expect(text()).toContain('○ not in the new template, left as is');
    expect(text()).toContain('1 still applies. 1 no longer applies and is dropped: Hide vs.dewa: not in the template.');
    click(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(text()).toContain('Would go to');
    const apply = [...document.querySelectorAll('button')].find((b) => /^Apply: create \d+ folders$/.test(b.textContent ?? ''))!;
    click(apply);
    await flush();
    const f = onChange.mock.calls[0][0].folder;
    expect(f.templateId).toBe('consultant-full');
    expect(f.overrides.add[0].node.name).toBe('Phase-2-Annex');
    expect(f.overrides.hide).toEqual([]);
    expect(made[0].paths).not.toContain('01_Admin');
    expect(made[0].paths.length).toBeGreaterThan(20);
    expect(onStatus.mock.calls[0][0]).toMatch(/^The project now uses “Electrical consultant full”\. Created \d+ folders in D:\\Jobs\\Villa\. 1 project change no longer applied and was dropped\.$/);
    expect(calls.filter((c) => /rename|move|delete|remove|trash|unlink/i.test(c))).toEqual([]);
  });

  it('Buildings: a renamed building gets new folders and its old one is listed; an added one is offered', async () => {
    const multi = builtInTemplate('multi-building')!;
    const info = (...names: string[]) => ({ buildings: names.map((name, i) => ({ id: `bld-${i + 1}`, name, levels: [] })), rooms: [] }) as unknown as Project['building'];
    const old = ['00_Common', '00_Common/Admin', '00_Common/DEWA', '00_Common/Transmittals', 'B1_Villa-A', 'B1_Villa-A/Calcs', 'B1_Villa-A/Drawings', 'B1_Villa-A/Schedules', 'B1_Villa-A/BOQ', 'B2_Villa-B', 'B2_Villa-B/Calcs'];
    const { disk, made, calls } = watched(old);
    rememberFolder('p9', { root: 'D:\\Jobs\\Villa', unticked: [], buildings: [{ code: 'B1', name: 'Villa-A', id: 'bld-1' }, { code: 'B2', name: 'Villa-B', id: 'bld-2' }] });
    const p: Project = { ...newProject('Villa'), id: 'p9', building: info('Villa A', 'Villa C', 'Villa D'), folder: { templateId: multi.id, version: 1, template: multi } };
    const onChange = vi.fn(), onStatus = vi.fn();
    act(() => root.render(<ProjectFolderCard project={p} onChangeProject={onChange} onStatus={onStatus} client={client()} disk={disk} />));
    await flush();
    click(button('Customise…'));
    await flush();
    expect(text()).toContain('✓ B1_Villa-A');
    expect(text()).toContain('“B2_Villa-B” → “B2_Villa-C”: the building was renamed. Its new folders are created. The old one is left as it is:');
    expect(text()).toContain('B2_Villa-B (23 files)');
    expect(text()).toContain('＋ B3_Villa-D: 5 folders to create');
    click([...document.querySelectorAll('button')].find((b) => /^Create \d+ folders$/.test(b.textContent ?? ''))!);
    await flush();
    expect(made[0].paths).toEqual(expect.arrayContaining(['B2_Villa-C', 'B2_Villa-C/Calcs', 'B3_Villa-D', 'B3_Villa-D/BOQ']));
    expect(made[0].paths.some((x) => x.startsWith('B2_Villa-B') || x.startsWith('B1_Villa-A') || x.startsWith('00_Common'))).toBe(false);
    expect(rememberedFolder('p9')?.buildings?.map((b) => `${b.code}_${b.name}`)).toEqual(['B1_Villa-A', 'B2_Villa-C', 'B3_Villa-D']);
    expect(new Set(calls)).toEqual(new Set(['status', 'fileCounts', 'create']));
  });
});
