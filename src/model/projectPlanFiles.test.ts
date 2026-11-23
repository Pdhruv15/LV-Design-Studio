import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import { copyProject, CURRENT_SCHEMA, migrateProject } from './projectMigrate';
import { packPlan, PLAN_FIELDS, PLAN_VERSION, planLinkOf, planMissingNote, unpackPlan } from './planPackage';
import { loadProjectStamped, pickProject, saveProjectFile } from './projectStore';
import type { FileStamp } from './saveSafety';
import type { Project } from '../types';

/** Phase 2 step 2 of the native drawing file: the desktop app saves the drawn work to name.lvplan beside name.lvds and
 * opens it back (docs/notes/Future development/Native drawing file - Phase 2 plan - 2026-11-22.md). The bridge below
 * does what electron/main.cjs does with the same functions of electron/projectFiles.cjs and the real IPC check, in a
 * temporary folder. */

type Stamp = FileStamp & { plan: string | null };
const require = createRequire(import.meta.url);
const pf = require('../../electron/projectFiles.cjs') as {
  sha: (b: Uint8Array | string) => string;
  PLAN_VERSION: number;
  planLinkOf: (d: unknown) => { file: string; sha256: string } | undefined;
  readPlanFor: (dir: string, file: string, link: { file: string; sha256: string }) => Buffer | undefined;
  projectStampOf: (full: string) => Stamp | null;
  decideSave: (e: unknown, d: unknown, next?: string) => 'write' | 'conflict';
  saveProjectPair: (full: string, data: unknown, plan: Uint8Array | undefined, o?: { keepTheirs?: boolean }) => Stamp;
  uniqueFileName: (dir: string, base: string) => string;
  nativeFileName: (dir: string, file: string) => string;
  projectText: (d: unknown) => string;
  writeFileSafe: (f: string, t: string | Uint8Array, o?: Record<string, boolean>) => unknown;
  pickedProject: (folder: string, full: string) => { file?: string; data?: Project; from?: string; plan?: Buffer };
  moveToTrash: (folder: string, file: string, now?: number) => string;
  restoreFromTrash: (folder: string, trashFile: string) => string;
  purgeTrash: (folder: string, days?: number, now?: number) => number;
};
const check = require('../../electron/ipcValidate.cjs') as { projectSaveArgs: (a: unknown) => { file?: string; data: Project; plan?: Buffer; expected?: Stamp; force: boolean } };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lvds-plan-'));
  vi.stubGlobal('window', { lvds: { projects: bridge(dir) }, alert: vi.fn() });
});
afterEach(() => { vi.unstubAllGlobals(); rmSync(dir, { recursive: true, force: true }); });

/** projects:read, projects:save and projects:pick as electron/main.cjs answers them. */
function bridge(folder: string) {
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    read: async (file: string) => {
      const full = join(folder, file);
      const project = JSON.parse(readFileSync(full, 'utf-8')) as Project;
      const link = pf.planLinkOf(project);
      const plan = link && pf.readPlanFor(folder, file, link);
      return clone(plan ? { project, stamp: pf.projectStampOf(full), plan: new Uint8Array(plan) } : { project, stamp: pf.projectStampOf(full) });
    },
    save: async (file: string | undefined, data: Project, expected?: FileStamp, force?: boolean, plan?: Uint8Array) => {
      const a = check.projectSaveArgs(clone({ file, data, expected, force, plan }));
      const name = a.file ?? pf.uniqueFileName(folder, a.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      let conflicted = false;
      if (a.file) {
        const disk = pf.projectStampOf(join(folder, name));
        if (pf.decideSave(a.expected, disk, a.plan && pf.sha(a.plan)) === 'conflict') {
          if (!a.force) return clone({ conflict: true, file: name, disk });
          conflicted = true;
        }
      }
      const native = pf.nativeFileName(folder, name);
      return clone({ file: native, stamp: pf.saveProjectPair(join(folder, native), a.data, a.plan, { keepTheirs: conflicted }) });
    },
    pick: async () => null,
    load: async () => { throw new Error('not used'); },
    list: async () => [],
    delete: async () => true
  };
}

const line = (id: string, x: number) => ({ id, kind: 'line' as const, layer: 'E-POWR', pts: [[x, 0], [x + 1200.5, 15.25]] as [number, number][] });
const villa = (): Project => migrateProject({
  ...sampleProject, name: 'Villa',
  cadSketch: [{ file: 'plan-gf.dwg', items: [line('S1', 0), line('S2', 100)] }, { file: 'plan-l1.dwg', items: [line('S3', 0)] }],
  cadErased: { 'plan-gf.dwg': ['1F3'] },
  cadPlanUnits: { 'plan-gf.dwg': 'mm' },
  cadAnno: { textMm: 2.5, scale: 100 }
} as Project);
/** JSON with object keys sorted at every depth, without the format name every project file has (projectText). */
const canon = (v: unknown): string => JSON.stringify({ ...(v as object), format: undefined }, (_k, x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const onDisk = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf-8')) as Project & { plan?: { file: string; sha256: string; version: number } };
const planOf = (file: string) => file.replace(/\.lvds$/, '.lvplan');
async function saved(p: Project, file?: string, expected?: FileStamp | null) {
  const out = await saveProjectFile(file, p, { expected });
  if (out.conflict) throw new Error('unexpected conflict');
  return out as { file: string; stamp: Stamp };
}

describe('desktop save and load with name.lvplan', () => {
  it('saves the drawn work beside the project file, linked by SHA-256, and opens it back as it was', async () => {
    const p = villa();
    const { file, stamp } = await saved(p);
    expect(readdirSync(dir).sort()).toEqual([file, planOf(file)].sort());
    const lvds = onDisk(file);
    for (const f of PLAN_FIELDS) expect(lvds).not.toHaveProperty(f);
    expect(lvds.plan).toEqual({ file: planOf(file), sha256: pf.sha(readFileSync(join(dir, planOf(file)))), version: PLAN_VERSION });
    expect(stamp.plan).toBe(lvds.plan!.sha256);
    const back = await loadProjectStamped(file);
    expect(back.project).not.toHaveProperty('plan');
    expect(canon(back.project)).toBe(canon(p));
    expect(back.stamp).toEqual(stamp);
  });

  it('writes the .lvplan only when the drawn work changed, keeping the one before as .lvplan.bak', async () => {
    const p = villa();
    const { file, stamp } = await saved(p);
    const before = statSync(join(dir, planOf(file))).mtimeMs;
    const again = await saved({ ...p, updatedAt: '2026-11-23T10:00:00.000Z' }, file, stamp);
    expect(statSync(join(dir, planOf(file))).mtimeMs).toBe(before);
    expect(existsSync(join(dir, `${planOf(file)}.bak`))).toBe(false);
    const old = readFileSync(join(dir, planOf(file)));
    await saved({ ...p, cadSketch: [{ file: 'plan-gf.dwg', items: [line('S1', 0)] }, p.cadSketch![1]] }, file, again.stamp);
    expect(readFileSync(join(dir, `${planOf(file)}.bak`)).equals(old)).toBe(true);
  });

  it('opens the last saved pair after a crash between the two writes (the .lvplan.bak matches)', async () => {
    const p = villa();
    const { file } = await saved(p);
    // The next save got as far as the new .lvplan, then stopped before the project file.
    const { bytes } = await packPlan({ ...p, cadSketch: [p.cadSketch![1]] });
    pf.writeFileSafe(join(dir, planOf(file)), bytes!);
    expect(canon((await loadProjectStamped(file)).project)).toBe(canon(p));
  });

  it('opens without drawings and read-only when no copy of the .lvplan matches, and never saves over it', async () => {
    const p = villa();
    const { file } = await saved(p);
    const theirs = Buffer.from('PK not the drawn work this project file links to');
    writeFileSync(join(dir, planOf(file)), theirs);
    const { project, stamp } = await loadProjectStamped(file);
    const link = planLinkOf(project)!;
    expect(link.file).toBe(planOf(file));
    expect(planMissingNote(link)).toBe(`The drawn work for this project (${planOf(file)}) is missing or out of date. Drawings open without it, and nothing is saved over it.`);
    expect(project.cadSketch).toBeUndefined();
    // A change to the file elsewhere (status, archive) keeps the link, and the .lvplan is left as it is.
    await saved({ ...project, archivedAt: '2026-11-23T11:00:00.000Z' }, file, stamp);
    expect(onDisk(file).plan).toEqual(link);
    expect(readFileSync(join(dir, planOf(file))).equals(theirs)).toBe(true);
    // New drawings on it are refused: they would be written over the drawn work that could not be read.
    await expect(saveProjectFile(file, { ...project, cadSketch: [{ file: 'plan-gf.dwg', items: [line('N1', 0)] }] }, { expected: pf.projectStampOf(join(dir, file)) })).rejects.toThrow(/is missing or out of date/);
    // Save as: its own project, with its own drawn work file.
    const copy = await saved(copyProject({ ...project, cadSketch: [{ file: 'plan-gf.dwg', items: [line('N1', 0)] }] }, 'save-as', 'Villa copy'));
    expect(onDisk(copy.file).plan!.file).toBe(planOf(copy.file));
    expect((await loadProjectStamped(copy.file)).project.cadSketch).toEqual([{ file: 'plan-gf.dwg', items: [line('N1', 0)] }]);
  });

  it('moves the drawings of an older project into name.lvplan at its next save, as a version an older app opens read-only', async () => {
    const old = { ...villa(), schemaVersion: 4 };
    writeFileSync(join(dir, 'villa.lvds'), pf.projectText(old));
    const opened = migrateProject((await loadProjectStamped('villa.lvds')).project, 'villa.lvds');
    expect(opened.cadSketch).toEqual(old.cadSketch);
    expect(opened.schemaVersion).toBe(CURRENT_SCHEMA);
    await saved(opened, 'villa.lvds', pf.projectStampOf(join(dir, 'villa.lvds')));
    const lvds = onDisk('villa.lvds');
    expect(lvds.cadSketch).toBeUndefined();
    expect(lvds.plan!.file).toBe('villa.lvplan');
    expect(lvds.schemaVersion).toBeGreaterThan(4); // the app before .lvplan (version 4) opens it read-only
    expect(canon((await loadProjectStamped('villa.lvds')).project)).toBe(canon(opened));
  });

  it('is a conflict when someone else changed the drawn work beside it; overwriting keeps theirs', async () => {
    const p = villa();
    const { file, stamp } = await saved(p);
    const theirs = Buffer.from('PK their drawn work, delivered by a sync tool first');
    writeFileSync(join(dir, planOf(file)), theirs);
    const next = { ...p, cadSketch: [p.cadSketch![1]] };
    expect(await saveProjectFile(file, next, { expected: stamp })).toMatchObject({ conflict: true });
    await saveProjectFile(file, next, { expected: stamp, force: true });
    const kept = readdirSync(dir).find((n) => n.startsWith(`${planOf(file)}.theirs-`))!;
    expect(readFileSync(join(dir, kept)).equals(theirs)).toBe(true);
    // A .lvplan that is gone is written again, with no question.
    const now = pf.projectStampOf(join(dir, file))!;
    unlinkSync(join(dir, planOf(file)));
    expect(await saveProjectFile(file, p, { expected: now })).not.toHaveProperty('conflict', true);
    expect(existsSync(join(dir, planOf(file)))).toBe(true);
  });
});

describe('name.lvplan with the other project file operations', () => {
  it('goes to the trash with its project and comes back under the name the project is restored as', async () => {
    const p = villa();
    const { file } = await saved(p);
    await saved({ ...p, cadSketch: [p.cadSketch![1]] }, file, pf.projectStampOf(join(dir, file))); // a .lvplan.bak too
    const t = pf.moveToTrash(dir, file, 7);
    expect(readdirSync(dir).filter((n) => n !== '.trash')).toEqual([]);
    writeFileSync(join(dir, file), pf.projectText({ ...sampleProject, name: 'Another' })); // its name is taken meanwhile
    const back = pf.restoreFromTrash(dir, t);
    expect(back).not.toBe(file);
    expect(existsSync(join(dir, planOf(back)))).toBe(true);
    expect(existsSync(join(dir, `${planOf(back)}.bak`))).toBe(true);
    expect((await loadProjectStamped(back)).project.cadSketch).toEqual([p.cadSketch![1]]);
    pf.moveToTrash(dir, back, 8);
    pf.purgeTrash(dir, 0);
    expect(readdirSync(join(dir, '.trash'))).toEqual([]);
  });

  it('a deleted older .json project never takes the .lvplan of the .lvds of the same name', async () => {
    const { file } = await saved(villa());
    const stem = file.replace(/\.lvds$/, '');
    writeFileSync(join(dir, `${stem}.json`), JSON.stringify(sampleProject));
    pf.moveToTrash(dir, `${stem}.json`, 9);
    expect(existsSync(join(dir, planOf(file)))).toBe(true);
  });

  it('a new project never takes the name of a .lvplan left on its own', () => {
    writeFileSync(join(dir, 'villa.lvplan'), 'PK');
    expect(pf.uniqueFileName(dir, 'villa')).toBe('villa-2.lvds');
  });

  it('a project opened from another folder brings its drawn work along', async () => {
    const away = join(dir, 'away');
    mkdirSync(away);
    const p = villa();
    const { file } = await saved(p);
    for (const f of [file, planOf(file)]) writeFileSync(join(away, f), readFileSync(join(dir, f)));
    const r = pf.pickedProject(join(dir, 'projects'), join(away, file));
    expect(r.plan).toBeDefined();
    vi.stubGlobal('window', { lvds: { projects: { ...bridge(dir), pick: async () => structuredClone({ ...r, plan: new Uint8Array(r.plan!) }) } } });
    const picked = await pickProject();
    expect(picked).not.toHaveProperty('plan');
    expect(canon(picked!.data)).toBe(canon(p));
  });

  it('never opens the drawn work through a link at its name', async () => {
    const { file } = await saved(villa());
    const real = join(dir, 'elsewhere.bin');
    writeFileSync(real, readFileSync(join(dir, planOf(file))));
    unlinkSync(join(dir, planOf(file)));
    symlinkSync(real, join(dir, planOf(file)));
    expect(pf.readPlanFor(dir, file, onDisk(file).plan!)).toBeUndefined();
  });

  it('the IPC check takes only .lvplan bytes; both sides agree on the package version', () => {
    const data = { boards: [], feeders: [] };
    expect(check.projectSaveArgs({ data, plan: new Uint8Array([0x50, 0x4b, 3, 4]) }).plan).toBeInstanceOf(Buffer);
    expect(() => check.projectSaveArgs({ data, plan: new Uint8Array([1, 2, 3, 4]) })).toThrow(/not a \.lvplan/);
    expect(() => check.projectSaveArgs({ data, plan: 'PK..' })).toThrow(/not a \.lvplan/);
    expect(pf.PLAN_VERSION).toBe(PLAN_VERSION);
  });
});

describe('packPlan and unpackPlan', () => {
  it('sends the same bytes again, without compressing, when the drawn work did not change', async () => {
    const p = villa();
    const a = await packPlan(p);
    expect((await packPlan({ ...p, updatedAt: 'later' })).bytes).toBe(a.bytes);
    expect((await packPlan({ ...p, cadSketch: [p.cadSketch![1]] })).bytes).not.toBe(a.bytes);
    expect((await packPlan({ ...sampleProject } as Project)).bytes).toBeUndefined();
  });

  it('keeps the link when the bytes are missing or cannot be read', async () => {
    const linked = { ...sampleProject, plan: { file: 'x.lvplan', sha256: 'a'.repeat(64), version: 1 } } as Project;
    expect(await unpackPlan(linked)).toBe(linked);
    expect(await unpackPlan(linked, new Uint8Array([0x50, 0x4b, 0, 0]))).toBe(linked);
    expect(copyProject(linked, 'duplicate', 'Copy')).not.toHaveProperty('plan');
    expect(migrateProject(linked)).toHaveProperty('plan', planLinkOf(linked));
  });
});
