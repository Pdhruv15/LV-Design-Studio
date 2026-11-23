import { beforeEach, describe, expect, it } from 'vitest';
import { network } from '../../tests/fixtures/networks';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { CURRENT_SCHEMA, isFutureSchema, migrateProject } from './projectMigrate';
import { clearRecovery, loadProject, readRecoveries, saveProjectFile, writeRecovery } from './projectStore';
import { hasPackedRevisions, packRevisions, unpackRevisions } from './revisionStore';
import { issueRevision, restoreRevision } from './revisions';
import { projectFingerprint } from './saveSafety';

const edit = (p: Project, i: number): Project => {
  const id = p.feeders[(i * 37) % p.feeders.length].id;
  return { ...p, feeders: p.feeders.map((f) => (f.id === id ? { ...f, loadKw: f.loadKw + 0.1 } : f)) };
};
/** Ten revisions, an edit before each and one after the last. */
const issued = (base: Project, n = 10): Project => edit(Array.from({ length: n }).reduce<Project>((p, _, r) => issueRevision(edit(p, r), { description: `Rev ${r}` }), base), 99);
const throughFile = (p: Project): Project => unpackRevisions(JSON.parse(JSON.stringify(packRevisions(p))) as Project);

describe('revisions in the project file', () => {
  it('a project without revisions is written as it is', () => {
    expect(packRevisions(sampleProject)).toBe(sampleProject);
    expect(unpackRevisions(sampleProject)).toBe(sampleProject);
    expect(hasPackedRevisions(sampleProject)).toBe(false);
  });

  it('written and read again, every revision is exactly what was issued', () => {
    const p = issued(network(30, 'deep'));
    const back = throughFile(p);
    expect(back).toEqual(p);
    expect(JSON.stringify(back)).toBe(JSON.stringify(p)); // the same sections in the same order
    expect(projectFingerprint(back)).toBe(projectFingerprint(p));
    expect(back).not.toHaveProperty('revisionStore');
    expect(restoreRevision(back, 'C')).toEqual(restoreRevision(p, 'C'));
  });

  it('the file keeps each distinct panel and circuit once', () => {
    const base = network(100, 'deep'), p = issued(base);
    const plain = JSON.stringify(base).length, whole = JSON.stringify(p).length, packed = JSON.stringify(packRevisions(p)).length;
    expect(whole / plain).toBeGreaterThan(10); // eleven whole copies
    expect(packed / plain).toBeLessThan(1.5);
  });

  it('read again, what a revision shares with the design is the same object', () => {
    const p = issued(network(30, 'deep'), 3), back = throughFile(p);
    const snap = back.revisions![2].snapshot;
    const shared = snap.feeders.filter((f, i) => f === back.feeders[i]).length;
    expect(shared).toBeGreaterThan(snap.feeders.length - 3); // all but the circuits edited since
    expect(snap.boards.every((b, i) => b === back.boards[i])).toBe(true);
  });

  it('packing or unpacking twice changes nothing more', () => {
    const p = issued(network(10, 'shallow'), 2), packed = packRevisions(p);
    expect(packRevisions(packed)).toBe(packed);
    const back = unpackRevisions(packed);
    expect(unpackRevisions(back)).toBe(back);
  });

  it('a file from before version 4 (whole copies) opens as before and is version 4 from then on', () => {
    const old = { ...issued(network(10, 'shallow'), 2), schemaVersion: 3 };
    const text = JSON.stringify(old);
    const opened = migrateProject(JSON.parse(text) as Project, 'old.lvds');
    expect(opened.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(opened.revisions).toEqual(old.revisions);
    expect(hasPackedRevisions(packRevisions(opened))).toBe(true);
  });

  it('opening unpacks before anything else changes the design', () => {
    const p = migrateProject(issued(network(10, 'shallow'), 2));
    const opened = migrateProject(JSON.parse(JSON.stringify(packRevisions(p))) as Project);
    expect(opened).toEqual(p);
  });

  it('revisions with sections the design no longer has, short values and plain lists', () => {
    const base: Project = { ...network(5, 'shallow'), tags: ['a', 'b'], notes: 'x'.repeat(200), ties: [{ a: 'B1', b: 'B2' } as never] };
    const p: Project = { ...issueRevision(base, { description: 'A' }), notes: 'changed', ties: undefined, tags: ['a'] };
    const back = throughFile(p);
    expect(back).toEqual(JSON.parse(JSON.stringify(p)));
    expect(back.revisions![0].snapshot).toMatchObject({ notes: 'x'.repeat(200), tags: ['a', 'b'], ties: [{ a: 'B1', b: 'B2' }] });
  });

  it('a damaged or newer store is refused with a reason, not opened wrong', () => {
    const packed = JSON.parse(JSON.stringify(packRevisions(issued(network(5, 'shallow'), 2)))) as Record<string, unknown> & { revisionStore: { format: number; items: unknown[] }; feeders: unknown[] };
    expect(() => unpackRevisions({ ...packed, revisionStore: { ...packed.revisionStore, items: [] } })).toThrow(/revision history cannot be read/);
    expect(() => unpackRevisions({ ...packed, feeders: packed.feeders.slice(0, 1) })).toThrow(/revision history cannot be read/);
    expect(() => unpackRevisions({ ...packed, revisionStore: undefined })).toThrow(/revision history cannot be read/);
    expect(() => unpackRevisions({ ...packed, revisionStore: { ...packed.revisionStore, format: 2 } })).toThrow(/newer version/);
  });

  it('an app of the version before reads a version 4 file as newer (read-only)', () => {
    expect(isFutureSchema({ ...sampleProject, schemaVersion: CURRENT_SCHEMA + 1 })).toBe(true);
    expect(CURRENT_SCHEMA).toBeGreaterThanOrEqual(4); // 5: drawn work in name.lvplan (projectPlanFiles.test.ts)
  });
});

describe('where a project is stored (web version: this browser\'s storage)', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; }
    } as Storage;
  });

  it('saved packed, opened whole', async () => {
    const p = issued(network(20, 'deep'), 4);
    const { file } = await saveProjectFile(undefined, p);
    const stored = localStorage.getItem(`lvds.project.${file}`)!;
    expect(hasPackedRevisions(JSON.parse(stored))).toBe(true);
    expect(stored.length).toBeLessThan(JSON.stringify(p).length / 2);
    expect(await loadProject(file)).toEqual(p);
  });

  it('the recovery copy too', async () => {
    const p = { ...issued(network(20, 'deep'), 4), id: 'job' };
    expect(await writeRecovery({ at: 1, project: p })).toBe(true);
    expect(hasPackedRevisions((JSON.parse(localStorage.getItem('lvds.recovery.job')!) as { project: unknown }).project)).toBe(true);
    expect((await readRecoveries())[0].project).toEqual(p);
    await clearRecovery('job');
  });
});
