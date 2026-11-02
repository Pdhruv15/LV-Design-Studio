// @vitest-environment node
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { callTool, toolByName, type ToolContext } from './tools';
import { listProjects, openProject, resolveProject } from './project';
import { readFile } from './exchangeTools';
import { MAX_PROJECT_BYTES } from './safeFiles';

/** MCP and the local API stay inside the projects folder, also when a link is planted there (a synced folder, another
 * user), and read nothing larger than the app opens. The command line keeps its any-path access. */

/** Symbolic links need permission on Windows; skip there when they cannot be made. */
const canLink = (() => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lvds-link-'));
  try { fs.symlinkSync(path.join(d, 'x'), path.join(d, 'y')); return true; } catch { return false; } finally { fs.rmSync(d, { recursive: true, force: true }); }
})();
const it_ = canLink ? it : it.skip;

let root: string, folder: string, outside: string;
let mcp: ToolContext, cli: ToolContext;
const villa: Project = { ...sampleProject, id: 'proj-villa' };
const secret: Project = { ...sampleProject, id: 'proj-secret', name: 'Outside the projects folder' };
const VICTIM = 'outside the projects folder — must never change';
const file = (n: string) => path.join(folder, n);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are checked field by field
const run = async (name: string, args: Record<string, unknown>, ctx = mcp): Promise<Record<string, any>> => (await callTool(toolByName(name)!, args, ctx)) as Record<string, any>;
const outsideFiles = () => fs.readdirSync(outside, { recursive: true }).map(String).sort();

beforeAll(() => {
  process.env.LVDS_ELECTRON = path.join(os.tmpdir(), 'lvds-no-electron'); // no renderer lookup (as exportTools.test.ts)
  vi.stubGlobal('DOMParser', DOMParser);
});
afterAll(() => { delete process.env.LVDS_ELECTRON; vi.unstubAllGlobals(); });
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lvds-confine-'));
  process.env.LVDS_APP_DATA = path.join(root, 'app');
  folder = path.join(root, 'projects');
  outside = path.join(root, 'outside');
  fs.mkdirSync(folder);
  fs.mkdirSync(outside);
  fs.writeFileSync(file('Villa.json'), JSON.stringify(villa, null, 2));
  fs.writeFileSync(path.join(outside, 'Secret.json'), JSON.stringify(secret));
  fs.writeFileSync(path.join(outside, 'victim.txt'), VICTIM);
  mcp = { folder, anywhere: false, write: true };
  cli = { folder, anywhere: true, write: true };
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LVDS_APP_DATA;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('MCP and the local API read only inside the projects folder', () => {
  it_('do not open, or list, a project file that is a link to a file outside', async () => {
    fs.symlinkSync(path.join(outside, 'Secret.json'), file('Linked.json'));
    expect(() => resolveProject({ ref: 'Linked', folder, anywhere: false })).toThrow(/inside the projects folder/);
    await expect(run('project_summary', { project: 'Linked' })).rejects.toThrow(/inside the projects folder/);
    expect(listProjects(folder).map((p) => p.file)).toEqual(['Villa.json']);
    expect((await run('list_projects', {})).projects.map((p: { file: string }) => p.file)).toEqual(['Villa.json']);
    // The command line follows the link the user chose, as before.
    expect(openProject({ ref: 'Linked', folder, anywhere: true }).project.name).toBe(secret.name);
    expect(listProjects(folder, true).map((p) => p.file).sort()).toEqual(['Linked.json', 'Villa.json']);
  });

  it_('do not read through a linked folder: projects, exchange packages, templates, drawings', async () => {
    fs.writeFileSync(path.join(outside, 'rooms.json'), JSON.stringify({ format: 'lvds-exchange' }));
    fs.writeFileSync(path.join(outside, 'Template.xlsx'), 'PK');
    fs.writeFileSync(path.join(outside, 'Plan.dxf'), '0\nEOF\n');
    fs.symlinkSync(outside, file('sub'), 'dir');
    await expect(run('project_summary', { project: 'sub/Secret' })).rejects.toThrow(/inside the projects folder/);
    expect(() => readFile('sub/rooms.json', mcp)).toThrow(/inside the projects folder/);
    await expect(run('export_schedule_template', { project: 'Villa', template: 'sub/Template.xlsx' })).rejects.toThrow(/inside the projects folder/);
    await expect(run('cad_plan', { project: 'Villa', drawing: 'sub/Plan.dxf' })).rejects.toThrow(/inside the projects folder/);
    expect(openProject({ ref: 'sub/Secret', folder, anywhere: true }).project.name).toBe(secret.name); // command line
  });

  it_('refuse a file swapped for one outside between the check and the open', async () => {
    fs.mkdirSync(file('sub'));
    fs.writeFileSync(file('sub/Swap.json'), JSON.stringify(villa));
    fs.mkdirSync(path.join(outside, 'sub'));
    fs.writeFileSync(path.join(outside, 'sub', 'Swap.json'), JSON.stringify(secret));
    expect((await run('project_summary', { project: 'sub/Swap' })).name).toBe(villa.name);
    // Just as the file is opened, sub/ becomes a link to a folder outside, and is put back right after.
    const open = fs.openSync;
    vi.spyOn(fs, 'openSync').mockImplementation((...args: Parameters<typeof fs.openSync>) => {
      if (args[0] !== file('sub/Swap.json')) return open(...args);
      fs.renameSync(file('sub'), file('sub-real'));
      fs.symlinkSync(path.join(outside, 'sub'), file('sub'), 'dir');
      try { return open(...args); } finally {
        fs.unlinkSync(file('sub'));
        fs.renameSync(file('sub-real'), file('sub'));
      }
    });
    await expect(run('project_summary', { project: 'sub/Swap' })).rejects.toThrow(/inside the projects folder/);
  });
});

describe('writes never go through a link planted in the projects folder', () => {
  const addPanel = { project: 'Villa', kind: 'DB', fedFrom: 'SMDB-GF', mode: 'apply' };

  it_('a linked .lvds-agent or change log: nothing is written', async () => {
    const before = fs.readFileSync(file('Villa.json'), 'utf-8');
    fs.symlinkSync(outside, file('.lvds-agent'), 'dir');
    await expect(run('add_panel', addPanel)).rejects.toThrow(/\.lvds-agent is not a real folder/);
    fs.unlinkSync(file('.lvds-agent'));
    fs.mkdirSync(file('.lvds-agent'));
    fs.symlinkSync(path.join(outside, 'victim.txt'), file('.lvds-agent/log.jsonl'));
    await expect(run('add_panel', addPanel)).rejects.toThrow(/log\.jsonl is a link/);
    await expect(run('add_panel', addPanel, cli)).rejects.toThrow(/log\.jsonl is a link/); // the tools' own folder, also from the command line
    expect(fs.readFileSync(file('Villa.json'), 'utf-8')).toBe(before); // the log is checked before the project is written
    expect(fs.readFileSync(path.join(outside, 'victim.txt'), 'utf-8')).toBe(VICTIM);
    expect(outsideFiles()).toEqual(['Secret.json', 'victim.txt']);
  });

  it_('a linked Exports folder or export log: no export file is written outside', async () => {
    const exp = { project: 'Villa', mode: 'export', approvedBy: 'A. Engineer' };
    fs.symlinkSync(outside, file('Exports'), 'dir');
    await expect(run('export_forms_xlsx', exp)).rejects.toThrow(/Exports is not a real folder/);
    fs.unlinkSync(file('Exports'));
    fs.mkdirSync(file('.lvds-agent'));
    fs.symlinkSync(path.join(outside, 'victim.txt'), file('.lvds-agent/exports.jsonl'));
    await expect(run('export_forms_xlsx', exp)).rejects.toThrow(/exports\.jsonl is a link/);
    expect(fs.readdirSync(file('Exports'), { recursive: true }).map(String).filter((f) => f.endsWith('.xlsx'))).toEqual([]);
    expect(fs.readFileSync(path.join(outside, 'victim.txt'), 'utf-8')).toBe(VICTIM);
    expect(outsideFiles()).toEqual(['Secret.json', 'victim.txt']);
  });

  it_('a link at an export file name is not written through: the next free name is used', async () => {
    const pre = await run('export_forms_xlsx', { project: 'Villa' });
    fs.mkdirSync(pre.folder, { recursive: true });
    const name: string = pre.files[0].file;
    fs.symlinkSync(path.join(outside, 'planted.xlsx'), path.join(pre.folder, name)); // dangling: would create the file outside
    const done = await run('export_forms_xlsx', { project: 'Villa', mode: 'export', approvedBy: 'A. Engineer' });
    expect(done.files).toEqual([path.join(pre.folder, name.replace(/\.xlsx$/, ' (2).xlsx'))]);
    expect(outsideFiles()).toEqual(['Secret.json', 'victim.txt']);
  });
});

describe('project files larger than the app opens', () => {
  const require = createRequire(import.meta.url);

  it('use the desktop app\'s limit', () => {
    expect(MAX_PROJECT_BYTES).toBe((require('../../electron/limits.cjs') as { LIMITS: { projectBytes: number } }).LIMITS.projectBytes);
  });

  it('are left out of the listing unopened, and refused unread when opened', () => {
    const big = file('Big.json');
    fs.writeFileSync(big, '{');
    fs.truncateSync(big, MAX_PROJECT_BYTES + 1); // sparse: no disk used
    const opened = vi.spyOn(fs, 'openSync');
    const reads = vi.spyOn(fs, 'readSync');
    expect(listProjects(folder).map((p) => p.file)).toEqual(['Villa.json']);
    expect(opened.mock.calls.map((c) => c[0])).not.toContain(big);
    reads.mockClear();
    expect(() => openProject({ ref: 'Big', folder, anywhere: false })).toThrow(/Big\.json is larger than 50 MB/);
    expect(() => openProject({ ref: big, folder, anywhere: true })).toThrow(/Big\.json is larger than 50 MB/); // the command line too
    expect(reads).not.toHaveBeenCalled();
  });

  it('a listing reads at most 1000 files', () => {
    for (let i = 0; i < 1005; i++) fs.writeFileSync(file(`n${String(i).padStart(4, '0')}.json`), '{}');
    const opened = vi.spyOn(fs, 'openSync');
    listProjects(folder);
    expect(opened.mock.calls.filter((c) => String(c[0]).startsWith(folder)).length).toBe(1000);
  });
});
