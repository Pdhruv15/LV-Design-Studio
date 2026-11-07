import type { Project } from '../types';

/** Permanent IDs for panels and circuits.
 *
 * `Board.id` and `Feeder.id` are the tags the engineer sees (DB-037, DB-037-R3) and
 * change on rename. `uid` never changes: it survives rename, move and undo, so data
 * read by other programs (exports, add-ins, AI clients) can follow the same panel or
 * circuit. A copy (paste, duplicate, import) gets a new one: when two objects share a
 * uid, the one that held it before keeps it, else the first in the list.
 *
 * Without a previous project (a file being opened) missing uids are derived from the
 * project and the object's tag, so two opens before a save agree. */

type WithUid = { id: string; uid?: string };

const hash = (s: string, seed: number): string => {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const random = (): string => {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  return c && 'randomUUID' in c ? c.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
};
const derived = (key: string): string => `${hash(key, 2166136261)}-${hash(key, 0x811c9dc5 ^ 0x5bd1e995)}-${hash(`${key.length}:${key}`, 0x27d4eb2d)}`;

function withListUids<T extends WithUid>(list: T[], prev: T[] | undefined, keyOf: (x: T) => string): T[] {
  const count = new Map<string, number>();
  for (const x of list) if (x.uid) count.set(x.uid, (count.get(x.uid) ?? 0) + 1);
  if (list.every((x) => x.uid && count.get(x.uid) === 1)) return list; // the usual case: nothing to do
  const owner = new Map<string, string>(); // uid → the tag that held it before
  for (const x of prev ?? []) if (x.uid) owner.set(x.uid, x.id);
  const keeper = new Map<string, number>(); // shared uid → index of the object that keeps it
  list.forEach((x, i) => { if (x.uid && (count.get(x.uid) ?? 0) > 1 && owner.get(x.uid) === x.id && !keeper.has(x.uid)) keeper.set(x.uid, i); });
  list.forEach((x, i) => { if (x.uid && (count.get(x.uid) ?? 0) > 1 && !keeper.has(x.uid)) keeper.set(x.uid, i); });
  const used = new Set(count.keys());
  const fresh = (x: T): string => {
    let uid = prev ? random() : derived(keyOf(x));
    for (let n = 1; used.has(uid); n++) uid = prev ? random() : derived(`${keyOf(x)}#${n}`);
    used.add(uid);
    return uid;
  };
  return list.map((x, i) => (x.uid && (count.get(x.uid) === 1 || keeper.get(x.uid) === i) ? x : { ...x, uid: fresh(x) }));
}

/** The project with a unique uid on every board and circuit (the same object when it already has them). */
export function withUids(project: Project, previous?: Project): Project {
  const pid = project.id ?? '';
  const boards = withListUids(project.boards, previous?.boards, (b) => `${pid}|board|${b.id}`);
  const feeders = withListUids(project.feeders, previous?.feeders, (f) => `${pid}|feeder|${f.id}`);
  return boards === project.boards && feeders === project.feeders ? project : { ...project, boards, feeders };
}
