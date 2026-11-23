import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Created = { root: string; rootMade: boolean; created: number; existed: number; failed: { path: string; reason: string }[] };
type Status = { root: string; exists: boolean; present: string[]; missing: string[]; looseFiles: string[]; looseCount: number };
const disk = createRequire(import.meta.url)('../../electron/projectFolders.cjs') as {
  create: (a: unknown) => Created; status: (a: unknown) => Status; fileCounts: (a: unknown) => number[]; openable: (root: unknown) => string; args: (a: unknown) => { root: string; paths: string[] };
  startDir: (dir: unknown) => string | undefined; saveCopy: (a: unknown, source: unknown) => { file: string };
};

let base: string;
beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'lvds-folders-')); });
afterEach(() => { rmSync(base, { recursive: true, force: true }); });
const root = () => join(base, '2417_Villas');
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

describe('creating a project\'s folders', () => {
  it('makes the project folder and the folders in it, parents included', () => {
    const r = disk.create({ root: root(), paths: ['03_Calcs/02_Volt_Drop', '01_Admin', '03_Calcs'] });
    expect(r).toMatchObject({ rootMade: true, created: 3, existed: 0, failed: [] });
    expect(isDir(join(root(), '03_Calcs', '02_Volt_Drop'))).toBe(true);
    expect(isDir(join(root(), '01_Admin'))).toBe(true);
  });
  it('leaves existing folders and their files alone, and only adds what is missing', () => {
    mkdirSync(join(root(), '01_Admin'), { recursive: true });
    writeFileSync(join(root(), '01_Admin', 'contract.txt'), 'keep me');
    writeFileSync(join(root(), 'notes.txt'), 'loose');
    const r = disk.create({ root: root(), paths: ['01_Admin', '02_Inputs'] });
    expect(r).toMatchObject({ rootMade: false, created: 1, existed: 1 });
    expect(readFileSync(join(root(), '01_Admin', 'contract.txt'), 'utf-8')).toBe('keep me');
    expect(readFileSync(join(root(), 'notes.txt'), 'utf-8')).toBe('loose');
    expect(disk.create({ root: root(), paths: ['01_Admin', '02_Inputs'] })).toMatchObject({ created: 0, existed: 2 });
  });
  it('does not make the folder that should hold the project folder', () => {
    expect(() => disk.create({ root: join(base, 'nowhere', '2417_Villas'), paths: ['A'] })).toThrow(/not a folder on this computer/);
    expect(existsSync(join(base, 'nowhere'))).toBe(false);
  });
  it('reports a file or a link where a folder should be, and goes on with the rest', () => {
    if (process.platform === 'win32') return;
    mkdirSync(root());
    writeFileSync(join(root(), '01_Admin'), 'a file');
    const outside = mkdtempSync(join(tmpdir(), 'lvds-outside-'));
    try {
      symlinkSync(outside, join(root(), '02_Inputs'), 'dir');
      const r = disk.create({ root: root(), paths: ['01_Admin/Minutes', '02_Inputs/Arch', '03_Calcs'] });
      expect(r.created).toBe(1);
      expect(r.failed.map((f) => f.path)).toEqual(['01_Admin/Minutes', '02_Inputs/Arch']);
      expect(r.failed[0].reason).toMatch(/a file, not a folder/);
      expect(r.failed[1].reason).toMatch(/a link, not a folder/);
      expect(readdirSync(outside)).toEqual([]);
      expect(readFileSync(join(root(), '01_Admin'), 'utf-8')).toBe('a file');
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
  it('refuses a project folder that is itself a link', () => {
    if (process.platform === 'win32') return;
    const outside = mkdtempSync(join(tmpdir(), 'lvds-outside-'));
    try {
      symlinkSync(outside, root(), 'dir');
      expect(() => disk.create({ root: root(), paths: ['A'] })).toThrow(/a link, not a folder/);
      expect(readdirSync(outside)).toEqual([]);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});

describe('what is refused', () => {
  const bad = (paths: unknown, r: unknown = root()) => () => disk.args({ root: r, paths });
  it('paths that leave the project folder or are not folder names', () => {
    for (const p of ['../x', 'a/../../x', '/etc', 'a//b', 'a\\b', 'C:x', 'a/..', '.', 'CON', 'a/nul.txt', 'name.', 'name ', 'a?b', 'a\u0001b', '']) expect(bad([p]), p).toThrow(/Refused/);
    expect(bad(['ok', 5])).toThrow(/Refused/);
    expect(bad('a')).toThrow(/Refused/);
  });
  it('a project folder that is relative, a drive, or badly named', () => {
    expect(bad([], 'relative/folder')).toThrow(/Refused/);
    expect(bad([], '/')).toThrow(/Refused/);
    expect(bad([], join(base, 'bad?name'))).toThrow(/Refused/);
    expect(bad([], 7)).toThrow(/Refused/);
  });
  it('too many folders, too deep, or too long', () => {
    expect(bad(Array.from({ length: 2001 }, (_, i) => `f${i}`))).toThrow(/Refused/);
    expect(bad([Array.from({ length: 13 }, () => 'a').join('/')])).toThrow(/too deep/);
    expect(bad([`${'x'.repeat(110)}/${'y'.repeat(110)}/${'z'.repeat(110)}`])).toThrow(/longer than/);
  });
  it('keeps one of two paths that differ only by case', () => {
    expect(disk.args({ root: root(), paths: ['Admin', 'admin', 'Admin/A'] }).paths).toEqual(['Admin', 'Admin/A']);
  });
});

describe('the status of a project\'s folders', () => {
  it('says the project folder is not there', () => {
    expect(disk.status({ root: root(), paths: ['A', 'B'] })).toMatchObject({ exists: false, present: [], missing: ['A', 'B'] });
  });
  it('lists present and missing folders and the files lying loose, without touching anything', () => {
    disk.create({ root: root(), paths: ['A/A1', 'B'] });
    writeFileSync(join(root(), 'plan.dwg'), 'x');
    writeFileSync(join(root(), '.hidden'), 'x');
    writeFileSync(join(root(), 'C'), 'a file named like a folder');
    const s = disk.status({ root: root(), paths: ['A', 'A/A1', 'A/A2', 'B', 'C'] });
    expect(s).toMatchObject({ exists: true, present: ['A', 'A/A1', 'B'], missing: ['A/A2', 'C'], looseFiles: ['C', 'plan.dwg'], looseCount: 2 });
    expect(existsSync(join(root(), 'A', 'A2'))).toBe(false);
  });
  it('opens only a real folder', () => {
    expect(() => disk.openable(root())).toThrow(/not on this computer/);
    mkdirSync(root());
    expect(disk.openable(root())).toBe(root());
    expect(() => disk.openable('relative')).toThrow(/Refused/);
  });
});

describe('where a save dialog starts (spec F2)', () => {
  it('is the folder only when it is a real folder', () => {
    expect(disk.startDir(root())).toBeUndefined();
    mkdirSync(root());
    expect(disk.startDir(root())).toBe(root());
    writeFileSync(join(base, 'file.txt'), 'x');
    expect(disk.startDir(join(base, 'file.txt'))).toBeUndefined();
    expect(disk.startDir('relative/dir')).toBeUndefined();
    expect(disk.startDir(42)).toBeUndefined();
  });
  it('is not a link to a folder', () => {
    if (process.platform === 'win32') return;
    mkdirSync(join(base, 'real'));
    symlinkSync(join(base, 'real'), join(base, 'link'));
    expect(disk.startDir(join(base, 'link'))).toBeUndefined();
  });
});

describe('the copy of the project file in the project folder (decision 1, option B)', () => {
  const source = () => { const f = join(base, 'projects', 'villa-p1.lvds'); mkdirSync(join(base, 'projects'), { recursive: true }); writeFileSync(f, '{"name":"v2"}'); return f; };
  const copy = (extra: Record<string, unknown> = {}, src = source()) => disk.saveCopy({ root: root(), relDir: '03_Project_File', fileName: 'villa-p1.lvds', ...extra }, src);
  it('writes the copy, making the folder inside the project folder, and replaces an older copy of that name only', () => {
    mkdirSync(root());
    const r = copy();
    expect(r.file).toBe(join(root(), '03_Project_File', 'villa-p1.lvds'));
    expect(readFileSync(r.file, 'utf8')).toBe('{"name":"v2"}');
    writeFileSync(join(root(), '03_Project_File', 'other.lvds'), 'keep');
    writeFileSync(r.file, 'old');
    copy();
    expect(readFileSync(r.file, 'utf8')).toBe('{"name":"v2"}');
    expect(readFileSync(join(root(), '03_Project_File', 'other.lvds'), 'utf8')).toBe('keep');
    expect(readdirSync(join(root(), '03_Project_File')).sort()).toEqual(['other.lvds', 'villa-p1.lvds']); // no temporary file left
  });
  it('copies the drawn work beside it (name.lvplan) under the copy\'s name, and nothing when there is none', () => {
    mkdirSync(root());
    copy();
    expect(readdirSync(join(root(), '03_Project_File'))).toEqual(['villa-p1.lvds']);
    const src = source();
    writeFileSync(src.replace(/\.lvds$/, '.lvplan'), 'PK drawn work');
    copy({ fileName: 'villa.lvds' }, src);
    expect(readFileSync(join(root(), '03_Project_File', 'villa.lvplan'), 'utf8')).toBe('PK drawn work');
  });
  it('never makes the project folder itself', () => {
    expect(() => copy()).toThrow(/not on this computer/);
    expect(existsSync(root())).toBe(false);
  });
  it('refuses names and paths that leave the folder, and files that are not project files', () => {
    mkdirSync(root());
    expect(() => copy({ fileName: '../x.lvds' })).toThrow(/Refused/);
    expect(() => copy({ fileName: 'notes.txt' })).toThrow(/Refused/);
    expect(() => copy({ relDir: '../outside' })).toThrow(/Refused/);
    expect(() => copy({ root: 'relative' })).toThrow(/Refused/);
    expect(() => disk.saveCopy(null, source())).toThrow(/Refused/);
    expect(() => copy({}, 'relative.lvds')).toThrow(/Refused/);
  });
  it('leaves a folder where the copy would go alone', () => {
    mkdirSync(join(root(), '03_Project_File', 'villa-p1.lvds'), { recursive: true });
    expect(() => copy()).toThrow(/left as it is/);
  });
  it('follows no link: not for the folder, the copy or the file copied', () => {
    if (process.platform === 'win32') return;
    mkdirSync(root());
    mkdirSync(join(base, 'outside'));
    symlinkSync(join(base, 'outside'), join(root(), '03_Project_File'));
    expect(() => copy()).toThrow(/a link/);
    expect(readdirSync(join(base, 'outside'))).toEqual([]);
    rmSync(join(root(), '03_Project_File'));
    mkdirSync(join(root(), '03_Project_File'));
    writeFileSync(join(base, 'outside', 'target.lvds'), 'theirs');
    symlinkSync(join(base, 'outside', 'target.lvds'), join(root(), '03_Project_File', 'villa-p1.lvds'));
    expect(() => copy()).toThrow(/a link/);
    expect(readFileSync(join(base, 'outside', 'target.lvds'), 'utf8')).toBe('theirs');
    const src = source();
    symlinkSync(src, join(base, 'linked.lvds'));
    expect(() => copy({ fileName: 'linked.lvds' }, join(base, 'linked.lvds'))).toThrow(/Refused/);
  });
});

describe('counting the files in folders (C6 renamed, C8 left untouched)', () => {
  it('counts files with their subfolders, -1 for a folder that is not there, and changes nothing', () => {
    mkdirSync(join(root(), '06_Drawings', '02_Issued', 'Rev-A'), { recursive: true });
    writeFileSync(join(root(), '06_Drawings', '02_Issued', 'E-101.pdf'), 'x');
    writeFileSync(join(root(), '06_Drawings', '02_Issued', 'Rev-A', 'E-101.pdf'), 'x');
    const before = readdirSync(root(), { recursive: true }).sort();
    expect(disk.fileCounts({ root: root(), paths: ['06_Drawings/02_Issued', '06_Drawings', 'E-DEWA'] })).toEqual([2, 2, -1]);
    expect(readdirSync(root(), { recursive: true }).sort()).toEqual(before);
    expect(disk.fileCounts({ root: join(base, 'missing'), paths: ['A'] })).toEqual([-1]);
  });
  it('does not follow links and refuses paths outside the project folder', () => {
    if (process.platform === 'win32') return;
    mkdirSync(join(base, 'Elsewhere'), { recursive: true });
    writeFileSync(join(base, 'Elsewhere', 'private.txt'), 'x');
    mkdirSync(join(root(), 'A'), { recursive: true });
    symlinkSync(join(base, 'Elsewhere'), join(root(), 'A', 'Linked'));
    symlinkSync(join(base, 'Elsewhere'), join(root(), 'L'));
    expect(disk.fileCounts({ root: root(), paths: ['A', 'L'] })).toEqual([0, -1]);
    expect(() => disk.fileCounts({ root: root(), paths: ['../Elsewhere'] })).toThrow(/Refused/);
  });
});
