import { describe, expect, it } from 'vitest';
import { sampleProject } from '../data/sampleProject';
import type { Project } from '../types';
import { CURRENT_SCHEMA, isFutureSchema, migrateProject } from './projectMigrate';
import { renamePanels } from './renamePanels';
import { withUids } from './stableIds';

const strip = (p: Project): Project => ({ ...p, schemaVersion: 1, boards: p.boards.map(({ uid: _b, ...b }) => b), feeders: p.feeders.map(({ uid: _f, ...f }) => f) });
const v1 = (): Project => strip({ ...sampleProject, id: 'p-1', createdAt: '2026-01-01T00:00:00.000Z' });
const uids = (p: Project) => [...p.boards.map((b) => b.uid), ...p.feeders.map((f) => f.uid)];

describe('permanent IDs for boards and circuits', () => {
  it('opening a version 1 file gives every board and circuit a unique uid and raises the file version', () => {
    const p = migrateProject(v1(), 'job.json');
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA);
    expect(CURRENT_SCHEMA).toBe(2);
    const all = uids(p);
    expect(all.every((u) => typeof u === 'string' && u.length > 10)).toBe(true);
    expect(new Set(all).size).toBe(all.length);
  });

  it('two opens of the same file before a save agree', () => {
    expect(uids(migrateProject(v1(), 'job.json'))).toEqual(uids(migrateProject(v1(), 'job.json')));
  });

  it('a project that already has them comes back as the same object', () => {
    const p = migrateProject(v1(), 'job.json');
    expect(withUids(p, p)).toBe(p);
    expect(migrateProject(p, 'job.json')).toBe(p);
  });

  it('renaming a panel keeps the uid of the panel and of its circuits', () => {
    const p = migrateProject(v1(), 'job.json');
    const b = p.boards.find((x) => p.feeders.some((f) => f.boardId === x.id))!;
    const before = new Map(p.feeders.filter((f) => f.boardId === b.id).map((f) => [f.uid, f.id]));
    const r = withUids(renamePanels(p, [{ from: b.id, to: 'DB-RENAMED' }]), p);
    const nb = r.boards.find((x) => x.id === 'DB-RENAMED')!;
    expect(nb.uid).toBe(b.uid);
    const after = r.feeders.filter((f) => f.boardId === 'DB-RENAMED');
    expect(after.map((f) => f.uid).sort()).toEqual([...before.keys()].sort());
  });

  it('a copy gets a new uid; the original keeps its own, wherever the copy lands in the list', () => {
    const p = migrateProject(v1(), 'job.json');
    const f = p.feeders[2];
    const copy = { ...f, id: `${f.id}-copy` };
    const atEnd = withUids({ ...p, feeders: [...p.feeders, copy] }, p);
    const atStart = withUids({ ...p, feeders: [copy, ...p.feeders] }, p);
    for (const r of [atEnd, atStart]) {
      expect(r.feeders.find((x) => x.id === f.id)!.uid).toBe(f.uid);
      const c = r.feeders.find((x) => x.id === copy.id)!.uid;
      expect(c).toBeTruthy();
      expect(c).not.toBe(f.uid);
      expect(new Set(uids(r)).size).toBe(uids(r).length);
    }
  });

  it('a new board added in the app gets a uid that no other object has', () => {
    const p = migrateProject(v1(), 'job.json');
    const { uid: _u, ...b } = p.boards[0];
    const r = withUids({ ...p, boards: [...p.boards, { ...b, id: 'DB-NEW' }] }, p);
    const n = r.boards.find((x) => x.id === 'DB-NEW')!.uid;
    expect(n).toBeTruthy();
    expect(uids(p)).not.toContain(n);
  });

  it('an older app sees a version 2 file as newer (it opens it read-only)', () => {
    expect(isFutureSchema({ ...v1(), schemaVersion: CURRENT_SCHEMA + 1 })).toBe(true);
    expect(isFutureSchema(migrateProject(v1(), 'job.json'))).toBe(false);
  });
});
