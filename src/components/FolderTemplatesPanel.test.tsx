// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES } from '../model/folderTemplateBuiltins';
import { webTemplatesClient, type TemplatesClient } from '../model/folderTemplatesClient';
import type { FolderScan } from '../model/folderLearn';
import type { FolderTemplate } from '../model/folderTemplates';
import FolderTemplatesPanel from './FolderTemplatesPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement, client: TemplatesClient, saved: FolderTemplate[];
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  const m = new Map<string, string>();
  const base = webTemplatesClient({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } });
  saved = [];
  client = { ...base, save: (t) => { saved.push(t); return base.save(t); } };
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
const names = () => [...host.querySelectorAll('[role=treeitem] .ft-name')].map((n) => n.textContent);
const render = async () => { act(() => root.render(<FolderTemplatesPanel client={client} />)); await flush(); };
const openCopy = async () => { await render(); click(button('Duplicate to edit')); };

describe('the template library (C1)', () => {
  it('lists the built-in templates as locked and offers a copy, not an edit', async () => {
    await render();
    for (const t of BUILT_IN_TEMPLATES) expect(host.textContent).toContain(t.name);
    expect(host.textContent).toContain('★ default');
    expect(button('Duplicate to edit')).toBeTruthy();
    expect(button('Edit')).toBeUndefined();
    expect(button('Delete')).toBeUndefined();
  });
  it('has no import or export buttons where the store cannot open a file dialog', async () => {
    await render();
    expect(button('Import…')).toBeUndefined();
    expect(button('Export…')).toBeUndefined();
  });
  it('sets the default template', async () => {
    await render();
    click([...host.querySelectorAll('.ft-item')].find((b) => b.textContent?.includes('Villa'))!);
    click(button('☆ Set as default'));
    await flush();
    expect((await client.list()).defaultId).toBe('villa-small');
    expect(button('★ Default for new projects').disabled).toBe(true);
  });
});

describe('the tree editor (C2)', () => {
  it('opens a copy of a built-in, saves it as the user\'s own template and returns to the library', async () => {
    await openCopy();
    expect(host.textContent).toContain('Unsaved changes');
    expect(names().length).toBeGreaterThan(5);
    click(button('Save template'));
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toMatch(/^user-/);
    expect(saved[0]).not.toHaveProperty('builtIn');
    expect(button('Edit')).toBeTruthy();
    expect(host.textContent).toContain(`${BUILT_IN_TEMPLATES[0].name} (copy)`);
  });
  it('moves the selected folder with the keyboard and undoes it', async () => {
    await openCopy();
    const before = names();
    const tree = host.querySelector('[role=tree]')!;
    key(tree, 'ArrowDown', { altKey: true });
    expect(names()).not.toEqual(before);
    key(tree, 'z', { ctrlKey: true });
    expect(names()).toEqual(before);
  });
  it('adds a folder, names it, and keeps Enter from submitting the form around it', async () => {
    await openCopy();
    click(button('+ Folder'));
    const input = host.querySelector<HTMLInputElement>('.ft-rename')!;
    expect(input).toBeTruthy();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => { input.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(names()).toContain('New folder');
  });
  it('shows a problem and blocks saving while a folder name is not allowed', async () => {
    await openCopy();
    const nameField = host.querySelector<HTMLInputElement>('.ft-insp label input')!;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => { set.call(nameField, 'Bad?Name'); nameField.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(host.querySelector('.ft-issues')!.textContent).toContain('not allowed in folder names');
    expect(button('Save template').disabled).toBe(true);
  });
  it('deletes from the template only, and previews the folders', async () => {
    await openCopy();
    const n = names().length;
    key(host.querySelector('[role=tree]')!, 'Delete');
    expect(names().length).toBeLessThan(n);
    click(button('Preview'));
    expect(host.querySelector('.ft-tree.preview')).toBeTruthy();
  });
});

const type = (el: HTMLInputElement | HTMLSelectElement, v: string) => act(() => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
});

describe('the Roles tab (C3)', () => {
  it('lists every role, moves a role to another folder and saves it', async () => {
    await openCopy();
    click(button('Roles'));
    expect(host.querySelectorAll('.ft-table tbody tr')).toHaveLength(50);
    const sel = host.querySelector<HTMLSelectElement>('select[aria-label="Folder for Voltage drop report"]')!;
    expect(sel.value).not.toBe('');
    type(sel, '');
    expect(host.textContent).toContain('Unassigned (1)');
    click(button('Unassigned (1)'));
    expect(host.querySelectorAll('.ft-table tbody tr')).toHaveLength(1);
    click(button('Auto-assign by name'));
    expect(host.textContent).toContain('1 role matched to a folder by name');
    expect(host.textContent).toContain('Unassigned (0)');
    click(button('Save template'));
    await flush();
    const vd = JSON.stringify(saved[0].folders).match(/"name":"02_Volt_Drop","role":"calcVd"/);
    expect(vd).toBeTruthy();
  });
});

describe('the File naming tab (C4)', () => {
  it('previews names, switches preset and blocks saving on a pattern that cannot be used', async () => {
    await openCopy();
    click(button('File naming'));
    const preview = () => host.querySelector('.ft-preview')!.textContent!;
    expect(preview()).toContain('2417-E-DWG-001-B.pdf');
    type(host.querySelector<HTMLSelectElement>('.grid2 select')!, 'simple');
    expect(preview()).toContain('AlBarsha-Villas_DWG_B.pdf');
    const raw = host.querySelector<HTMLInputElement>('input[spellcheck="false"]')!;
    type(raw, '{ProjectNo}-{Nope}');
    expect(host.textContent).toContain('{Nope} is not a field a file name can use');
    expect(button('Save template').disabled).toBe(true);
    type(raw, '{ProjectNo}-{Type}-{Rev}');
    expect(button('Save template').disabled).toBe(false);
    click(host.querySelector('button[aria-label="Remove Type"]')!);
    expect(host.textContent).toContain('Two document types get the same name');
    click([...host.querySelectorAll('.ft-chip.add')].find((b) => b.textContent === 'Seq')!);
    expect(preview()).toContain('2417-B-001.pdf');
    click(button('Save template'));
    await flush();
    expect(saved[0].naming).toMatchObject({ preset: 'custom', pattern: '{ProjectNo}-{Rev}-{Seq:3}' });
  });
});

describe('Learn from folder (C5)', () => {
  const JOB: FolderScan = {
    name: '2309_Jumeirah Park Villas', files: 1, count: 6, depth: 3, totalFiles: 40, truncated: false, deeper: false, skipped: 1, unreadable: 0,
    folders: [
      { name: 'A-Admin', files: 3, children: [{ name: 'Minutes', files: 14, children: [] }] },
      { name: 'B-Received', files: 0, children: [{ name: 'Arch', files: 0, children: [{ name: 'Rev A 12-03', files: 18, children: [] }] }] },
      { name: 'C-DEWA', files: 5, children: [] }
    ]
  };
  const learnWith = async (scanFolder?: () => Promise<FolderScan | null>) => {
    client = { ...client, scanFolder };
    await render();
  };

  it('is offered only where folders can be read', async () => {
    await learnWith(undefined);
    expect(button('Learn from folder…')).toBeUndefined();
  });

  it('reads a folder, suggests roles, leaves the revision folder out, saves and opens the editor', async () => {
    let asked = 0;
    await learnWith(async () => { asked++; return JOB; });
    click(button('Learn from folder…'));
    expect(button('Next').disabled).toBe(true);
    click(button('Choose…'));
    await flush();
    expect(asked).toBe(1);
    expect(host.textContent).toContain('✓ Read 6 folders, 3 levels. 41 files ignored.');
    click(button('Next'));
    expect(host.textContent).toContain('{ProjectNo}_{ProjectShort}');
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Role for C-DEWA"]')!.value).toBe('authDewa');
    expect(host.textContent).toContain('Leave out (revision / date folder)');
    act(() => {
      const sel = host.querySelector<HTMLSelectElement>('select[aria-label="Role for A-Admin"]')!;
      sel.value = 'programme';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click(button('Next'));
    expect(host.querySelector<HTMLInputElement>('.ft-title input')!.value).toBe('Jumeirah Park Villas layout (2309)');
    expect(host.textContent).toContain('5 folders · 4 roles assigned');
    click(host.querySelector('input[type=checkbox]')!);
    click(button('Save and edit'));
    await flush();
    expect(saved).toHaveLength(1);
    const t = saved[0];
    expect([t.root, t.numbering, t.id.startsWith('user-')]).toEqual(['{ProjectNo}_{ProjectShort}', 'A-', true]);
    expect(JSON.stringify(t)).not.toContain('Rev A');
    expect(t.folders[0].role).toBe('programme');
    expect((await client.list()).defaultId).toBe(t.id);
    expect(button('Save template')).toBeTruthy();
    expect(names()).toContain('A-Admin');
  });

  it('cancels back to the library, and shows why a folder could not be read', async () => {
    await learnWith(async () => { throw new Error('The chosen folder is a link; choose the folder itself.'); });
    click(button('Learn from folder…'));
    click(button('Choose…'));
    await flush();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('is a link');
    click(button('Cancel'));
    expect(button('Learn from folder…')).toBeTruthy();
    expect(saved).toHaveLength(0);
  });
});

describe('New template: layouts and Repeat for (C7)', () => {
  const type = (el: HTMLInputElement, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  const field = (label: string) => [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith(label))!.querySelector<HTMLInputElement>('input')!;
  const card = (name: string) => [...host.querySelectorAll('[role=radio].ft-card')].find((c) => c.querySelector('b')?.textContent === name)!;
  const preview = () => [...host.querySelectorAll('[aria-label=Preview] .ft-row:not(.root) .ft-name')].map((n) => n.textContent);

  it('+ New shows the six layouts; building/phase-first previews a project with 2 buildings', async () => {
    await render();
    click(button('+ New'));
    expect(host.textContent).toContain('New folder template');
    expect([...host.querySelectorAll('.ft-card b')].map((b) => b.textContent)).toEqual(['Discipline-first', 'Stage-first', 'Building / phase-first', 'ISO 19650 containers', 'Flat & simple', 'Blank']);
    expect(card('Building / phase-first').getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Preview: project with 2 buildings');
    expect(preview()).toEqual(expect.arrayContaining(['00_Common', 'B1_Villa-A', 'B2_Villa-B', 'Schedules']));
    expect(field('Shared folders, once at the top').value).toBe('00_Common');
    click(card('Stage-first'));
    expect(host.textContent).not.toContain('Repeat for');
    click(button('Cancel'));
    expect(button('+ New')).toBeTruthy();
  });

  it('phases I type repeat instead of buildings, and the template opens in the editor to save', async () => {
    await render();
    click(button('+ New'));
    click([...host.querySelectorAll<HTMLInputElement>('input[type=radio]')][1]);
    type(field('Phases'), 'Phase 1, Phase 2, Phase 3');
    type(field('Folder name'), '{BuildingName}');
    expect(host.textContent).toContain('Preview: project with 3 phases');
    expect(preview()).toEqual(expect.arrayContaining(['Phase-1', 'Phase-2', 'Phase-3']));
    click(button('Create and edit'));
    expect(names()).toContain('{BuildingName}');
    click(button('Save template'));
    await flush();
    expect(saved[0]).toMatchObject({ name: 'New template', layout: 'building', repeat: { source: 'phases', name: '{BuildingName}', phases: ['Phase 1', 'Phase 2', 'Phase 3'] } });
  });

  it('Blank starts with the root only', async () => {
    await render();
    click(button('+ New'));
    click(card('Blank'));
    click(button('Create and edit'));
    expect(names()).toEqual([]);
  });
});
