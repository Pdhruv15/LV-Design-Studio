import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILT_IN_TEMPLATES, builtInTemplate } from './folderTemplateBuiltins';
import type { FolderTemplate } from './folderTemplates';

type State = { templates: FolderTemplate[]; defaultId: string | null; skipped: number; error?: string; added?: number };
const req = createRequire(import.meta.url);
const store = req('../../electron/folderTemplates.cjs') as {
  FILE: string;
  read: (dir: string) => State;
  save: (dir: string, t: unknown, now?: Date) => State;
  remove: (dir: string, id: unknown) => State;
  setDefault: (dir: string, id: unknown) => State;
  importText: (dir: string, text: unknown, now?: Date) => State;
  exportText: (args: unknown) => string;
};
const check = req('../../electron/ipcValidate.cjs') as { folderTemplate: (t: unknown) => FolderTemplate; folderTemplatesExportArgs: (a: unknown) => { templates: FolderTemplate[] } };

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lvds-ft-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const mine = (over: Partial<FolderTemplate> = {}): FolderTemplate => ({ ...JSON.parse(JSON.stringify(builtInTemplate('consultant-full'))), id: 'user-office', name: 'Office standard', builtIn: undefined, ...over });
const day = new Date('2026-11-10T08:00:00Z');

describe('folder template checks (ipcValidate.cjs)', () => {
  it('every built-in template passes and comes back the same', () => {
    for (const t of BUILT_IN_TEMPLATES) {
      const { builtIn: _b, ...plain } = JSON.parse(JSON.stringify(t));
      expect(check.folderTemplate(t)).toEqual(plain);
    }
  });

  it('keeps only known fields', () => {
    const t = check.folderTemplate({ ...mine(), extra: 1, folders: [{ id: 'a', name: 'A', evil: 'x', children: [] }] });
    expect('extra' in t).toBe(false);
    expect(t.folders[0]).toEqual({ id: 'a', name: 'A', children: [] });
  });

  it('refuses path tricks in folder names and subfolder patterns', () => {
    const bad = (folders: unknown[], what: string) => expect(() => check.folderTemplate({ ...mine(), folders })).toThrow(what);
    bad([{ id: 'a', name: '../escape' }], 'folder name');
    bad([{ id: 'a', name: 'a\\b' }], 'folder name');
    bad([{ id: 'a', name: '..' }], 'folder name');
    bad([{ id: 'a', name: 'tab\there' }], 'folder name');
    bad([{ id: 'a', name: 'A', onUse: '../x' }], 'subfolder pattern');
    bad([{ id: 'a', name: 'A', onUse: '{Stage}//x' }], 'subfolder pattern');
    bad([{ id: 'a b', name: 'A' }], 'folder id');
    bad([{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], 'folder id');
    expect(() => check.folderTemplate({ ...mine(), root: '/etc' })).toThrow('project folder name');
  });

  it('refuses too many folders, too deep, wrong types and oversize', () => {
    const many = Array.from({ length: 301 }, (_, i) => ({ id: `f${i}`, name: `F${i}` }));
    expect(() => check.folderTemplate({ ...mine(), folders: many })).toThrow('more than 300 folders');
    let deep: Record<string, unknown> = { id: 'd17', name: 'D' };
    for (let i = 16; i > 0; i--) deep = { id: `d${i}`, name: 'D', children: [deep] };
    expect(() => check.folderTemplate({ ...mine(), folders: [deep] })).toThrow('16 folders deep');
    expect(() => check.folderTemplate({ ...mine(), folders: [{ id: 'a', name: 'A', when: 'scope:moon' }] })).toThrow('folder condition');
    expect(() => check.folderTemplate({ ...mine(), naming: { pattern: 5 } })).toThrow('naming pattern');
    expect(() => check.folderTemplate({ ...mine(), note: 'x'.repeat(2 * 1024 * 1024) })).toThrow('too large');
    expect(() => check.folderTemplate('x')).toThrow('Refused');
  });
});

describe('folder-templates.json (electron/folderTemplates.cjs)', () => {
  it('starts empty, saves with a version and date, replaces by id', () => {
    expect(store.read(dir)).toEqual({ templates: [], defaultId: null, skipped: 0 });
    let s = store.save(dir, mine(), day);
    expect(s.templates.map((t) => [t.id, t.version, t.editedAt])).toEqual([['user-office', 1, '2026-11-10']]);
    s = store.save(dir, mine({ name: 'Office v2' }), day);
    expect(s.templates.map((t) => [t.name, t.version])).toEqual([['Office v2', 2]]);
    const raw = JSON.parse(readFileSync(join(dir, store.FILE), 'utf-8'));
    expect(raw.format).toBe('lv-folder-templates');
    if (process.platform !== 'win32') expect(statSync(join(dir, store.FILE)).mode & 0o777).toBe(0o600);
  });

  it('refuses built-in ids and saving over a built-in', () => {
    expect(() => store.save(dir, mine({ id: 'consultant-full' }))).toThrow('folder template id');
    expect(() => store.remove(dir, '../settings')).toThrow('folder template id');
    expect(existsSync(join(dir, store.FILE))).toBe(false);
  });

  it('deletes and keeps the default right', () => {
    store.save(dir, mine());
    store.save(dir, mine({ id: 'user-fitout', name: 'Fit-out' }));
    expect(store.setDefault(dir, 'user-office').defaultId).toBe('user-office');
    const s = store.remove(dir, 'user-office');
    expect([s.templates.map((t) => t.id), s.defaultId]).toEqual([['user-fitout'], null]);
    expect(store.setDefault(dir, 'villa-small').defaultId).toBe('villa-small');
    expect(() => store.setDefault(dir, '../x')).toThrow('default template id');
  });

  it('a damaged file is reported, kept as .damaged and replaced on the next save', () => {
    writeFileSync(join(dir, store.FILE), '{ not json');
    expect(store.read(dir).error).toContain('could not be read');
    store.save(dir, mine());
    expect(readFileSync(join(dir, `${store.FILE}.damaged`), 'utf-8')).toBe('{ not json');
    expect(store.read(dir).templates).toHaveLength(1);
  });

  it('templates edited by hand into something unsafe are left out on reading', () => {
    writeFileSync(join(dir, store.FILE), JSON.stringify({ format: 'lv-folder-templates', templates: [mine(), mine({ id: 'user-bad', folders: [{ id: 'a', name: '../../x' }] as never })] }));
    const s = store.read(dir);
    expect([s.templates.length, s.skipped]).toEqual([1, 1]);
  });

  it('does not follow a link planted at the file name', () => {
    if (process.platform === 'win32') return;
    const target = join(dir, 'elsewhere.json');
    writeFileSync(target, 'precious');
    symlinkSync(target, join(dir, store.FILE));
    expect(store.read(dir).error).toBeTruthy();
    store.save(dir, mine());
    expect(readFileSync(target, 'utf-8')).toBe('precious');
    expect(store.read(dir).templates).toHaveLength(1);
  });

  it('imports a file, a list or one template, always as new templates', () => {
    store.save(dir, mine());
    const text = store.exportText({ templates: [mine(), builtInTemplate('iso19650')] });
    const s = store.importText(dir, text, day);
    expect(s.added).toBe(2);
    expect(s.templates.map((t) => t.name)).toEqual(['Office standard', 'Office standard (imported)', 'ISO 19650']);
    expect(new Set(s.templates.map((t) => t.id)).size).toBe(3);
    expect(s.templates.every((t) => /^user-/.test(t.id) && !('builtIn' in t))).toBe(true);
    expect(store.importText(dir, JSON.stringify(mine({ name: 'Solo' }))).added).toBe(1);
  });

  it('refuses bad imports without changing the file', () => {
    store.save(dir, mine());
    const before = readFileSync(join(dir, store.FILE), 'utf-8');
    expect(() => store.importText(dir, 'nope')).toThrow('not JSON');
    expect(() => store.importText(dir, JSON.stringify({ templates: [{ id: 'x', folders: [{ id: 'a', name: '..' }] }] }))).toThrow('could be read');
    expect(() => store.importText(dir, ' '.repeat(9 * 1024 * 1024))).toThrow('too large');
    expect(() => store.importText(dir, 5)).toThrow('Refused');
    expect(readFileSync(join(dir, store.FILE), 'utf-8')).toBe(before);
  });

  it('export needs 1–200 templates', () => {
    expect(() => store.exportText({ templates: [] })).toThrow('templates to export');
    expect(() => check.folderTemplatesExportArgs({ templates: [{ ...mine(), folders: [{ id: 'a', name: 'a/b' }] }] })).toThrow('folder name');
  });
});
