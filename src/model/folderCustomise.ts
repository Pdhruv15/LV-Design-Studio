/** Customise for this project (spec C6) and Change template (spec C8): the project's own changes to its
 * folder template, kept in project.folder.overrides. Pure: nothing here reads or writes the disk, and
 * nothing here ever moves, renames or deletes a folder. A rename makes a new folder; the old one is listed. */

import {
  applyOverrides, checkOverrides, diffTemplates, emptyOverrides, expandTemplate, nodeRoles, walkNodes,
  type ExpandedFolder, type FolderBuilding, type FolderNode, type FolderTemplate, type FolderVars, type ProjectFolder,
  type ProjectFolderOverrides, type TemplateDiff
} from './folderTemplates';
import { SCOPE_FLAGS } from './projectFolderPlan';

type Ov = ProjectFolderOverrides;
const copy = (ov?: Ov): Ov => (ov ? { add: [...ov.add], rename: [...ov.rename], hide: [...ov.hide], roles: { ...ov.roles } } : emptyOverrides());

/** True when the overrides change nothing (the project then stores none). */
export const noOverrides = (ov?: Ov): boolean => !ov || (!ov.add.length && !ov.rename.length && !ov.hide.length && !Object.keys(ov.roles).length);

const templateIds = (t: FolderTemplate): Set<string> => { const s = new Set<string>(); walkNodes(t.folders, (n) => s.add(n.id)); return s; };

function findIn(nodes: readonly FolderNode[], id: string): FolderNode | undefined {
  let hit: FolderNode | undefined;
  walkNodes(nodes, (n) => { if (!hit && n.id === id) hit = n; });
  return hit;
}

/** Ids of the folders added for this project only (with the subfolders added inside them). */
export function addedIds(ov?: Ov): Set<string> {
  const s = new Set<string>();
  for (const a of ov?.add ?? []) walkNodes([a.node], (n) => s.add(n.id));
  return s;
}

/** A folder id that is not used in the template or the overrides yet. */
export function freeId(t: FolderTemplate, ov: Ov | undefined, base = 'p'): string {
  const used = new Set([...templateIds(t), ...addedIds(ov)]);
  let i = 1;
  while (used.has(`${base}.${i}`)) i++;
  return `${base}.${i}`;
}

/** Adds a folder for this project only, inside `parentId` (null: at the top). */
export function addHere(t: FolderTemplate, ov: Ov | undefined, parentId: string | null, name: string): { overrides: Ov; id: string } {
  const id = freeId(t, ov);
  const out = copy(ov);
  out.add.push({ parentId, node: { id, name } });
  return { overrides: out, id };
}

/** Renames a folder for this project. A folder added here is renamed in place; a template folder gets a
 * rename entry (none when the name goes back to the template's). */
export function renameHere(t: FolderTemplate, ov: Ov | undefined, id: string, name: string): Ov {
  const out = copy(ov);
  if (addedIds(ov).has(id)) {
    const rename = (n: FolderNode): FolderNode => (n.id === id ? { ...n, name } : n.children ? { ...n, children: n.children.map(rename) } : n);
    out.add = out.add.map((a) => ({ ...a, node: rename(a.node) }));
    return out;
  }
  const original = findIn(t.folders, id);
  if (!original) return out;
  out.rename = out.rename.filter((r) => r.id !== id);
  if (name !== original.name) out.rename.push({ id, name });
  return out;
}

/** Hides a template folder for this project, or shows it again. A folder added here is taken out of the
 * overrides instead (with what was added inside it). */
export function toggleHide(t: FolderTemplate, ov: Ov | undefined, id: string): Ov {
  const out = copy(ov);
  if (addedIds(ov).has(id)) {
    const gone = new Set<string>();
    const strip = (n: FolderNode): FolderNode | null => {
      if (n.id === id) { walkNodes([n], (x) => gone.add(x.id)); return null; }
      return n.children ? { ...n, children: n.children.map(strip).filter((x): x is FolderNode => !!x) } : n;
    };
    out.add = out.add.map((a) => ({ ...a, node: strip(a.node) })).filter((a): a is { parentId: string | null; node: FolderNode } => !!a.node);
    // Folders added later inside a removed one go too.
    for (let changed = true; changed;) {
      changed = false;
      out.add = out.add.filter((a) => { const keep = a.parentId === null || !gone.has(a.parentId); if (!keep) { changed = true; walkNodes([a.node], (x) => gone.add(x.id)); } return keep; });
    }
    for (const [r, at] of Object.entries(out.roles)) if (gone.has(at)) delete out.roles[r];
    return out;
  }
  if (!templateIds(t).has(id)) return out;
  out.hide = out.hide.includes(id) ? out.hide.filter((h) => h !== id) : [...out.hide, id];
  return out;
}

/** The folder a role is in before the project's role changes: the template with the other changes applied. */
const templateRoleFolder = (t: FolderTemplate, ov: Ov, role: string): string | undefined => {
  let hit: string | undefined;
  walkNodes(applyOverrides(t, { ...ov, roles: {} }), (n) => { if (!hit && nodeRoles(n).includes(role)) hit = n.id; });
  return hit;
};

/** Gives a role to a folder for this project (it leaves the folder it had). */
export function roleHere(t: FolderTemplate, ov: Ov | undefined, role: string, id: string): Ov {
  const out = copy(ov);
  if (templateRoleFolder(t, out, role) === id) delete out.roles[role]; else out.roles[role] = id;
  return out;
}

/** Takes a role off a folder for this project: back to the template's folder when it was moved here, else
 * "ask where to save". */
export function roleOff(t: FolderTemplate, ov: Ov | undefined, role: string, id: string): Ov {
  const out = copy(ov);
  if (out.roles[role] === id && templateRoleFolder(t, out, role) !== id) delete out.roles[role]; else out.roles[role] = '';
  return out;
}

/* ---------- the C6 tree ---------- */

export type CustomiseStatus = 'present' | 'create' | 'hidden' | 'unticked';

export interface CustomiseRow {
  id: string;
  name: string;
  depth: number;
  status: CustomiseStatus;
  /** The template's name, when the folder is renamed here. */
  renamedFrom?: string;
  added: boolean;
  roles: string[];
  hasChildren: boolean;
  /** Folder paths it makes, relative to the project folder (several for a folder made for each building). */
  paths: string[];
}

/** Paths per folder id, as the folders would be made (every condition on; the ticks decide). */
function pathsById(t: FolderTemplate, nodes: FolderNode[], vars: FolderVars, buildings: readonly FolderBuilding[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const f of expandTemplate({ ...t, folders: nodes }, vars, SCOPE_FLAGS, buildings).folders) m.set(f.nodeId, [...(m.get(f.nodeId) ?? []), f.path]);
  return m;
}

const prune = (nodes: readonly FolderNode[], off: ReadonlySet<string>): FolderNode[] =>
  nodes.filter((n) => !off.has(n.id)).map((n) => (n.children ? { ...n, children: prune(n.children, off) } : n));

/** Every folder of the project's tree, hidden ones included, with its status. `present` holds the paths
 * found on disk (none known: everything that is made counts as to create). */
export function customiseRows(t: FolderTemplate, ov: Ov | undefined, vars: FolderVars, buildings: readonly FolderBuilding[], unticked: Iterable<string>, present: ReadonlySet<string> = new Set()): CustomiseRow[] {
  const o = ov ?? emptyOverrides();
  const hidden = new Set(o.hide);
  const off = new Set(unticked);
  const shown = applyOverrides(t, { ...o, hide: [] });
  const made = pathsById(t, prune(applyOverrides(t, o), off), vars, buildings);
  const original = new Map<string, string>();
  walkNodes(t.folders, (n) => original.set(n.id, n.name));
  const added = addedIds(o);
  const lower = new Set([...present].map((p) => p.toLowerCase()));
  const rows: CustomiseRow[] = [];
  const rec = (nodes: readonly FolderNode[], depth: number, hiddenAbove: boolean, offAbove: boolean) => {
    for (const n of nodes) {
      const isHidden = hiddenAbove || hidden.has(n.id);
      const isOff = offAbove || off.has(n.id);
      const paths = made.get(n.id) ?? [];
      const status: CustomiseStatus = isHidden ? 'hidden' : isOff ? 'unticked' : paths.length && paths.every((p) => lower.has(p.toLowerCase())) ? 'present' : 'create';
      const from = original.get(n.id);
      rows.push({
        id: n.id, name: n.name, depth, status, added: added.has(n.id), roles: nodeRoles(n), hasChildren: !!n.children?.length, paths,
        ...(from !== undefined && from !== n.name ? { renamedFrom: from } : {})
      });
      if (n.children?.length) rec(n.children, depth + 1, isHidden, isOff);
    }
  };
  rec(shown, 0, false, false);
  return rows;
}

/** The folders to make for the project (as planFolders: unticked folders left out). */
export const customisePaths = (rows: readonly CustomiseRow[]): string[] =>
  [...new Set(rows.filter((r) => r.status === 'present' || r.status === 'create').flatMap((r) => r.paths))];

/** Where each renamed folder was before its rename (the template's name): the old folder, left as it is. */
export function renamedOldPaths(t: FolderTemplate, ov: Ov | undefined, vars: FolderVars, buildings: readonly FolderBuilding[]): { id: string; from: string; to: string; paths: string[] }[] {
  if (!ov?.rename.length) return [];
  const before = pathsById(t, applyOverrides(t, { ...ov, rename: [] }), vars, buildings);
  const original = new Map<string, string>();
  walkNodes(t.folders, (n) => original.set(n.id, n.name));
  return ov.rename.filter((r) => before.has(r.id)).map((r) => ({ id: r.id, from: original.get(r.id) ?? '', to: r.name, paths: before.get(r.id)! }));
}

export interface CustomiseCounts { present: number; create: number; hidden: number; added: number }

/** The side panel's counts: folders (paths) present and to create, template folders hidden, folders added. */
export function customiseCounts(rows: readonly CustomiseRow[], present: ReadonlySet<string>): CustomiseCounts {
  const paths = customisePaths(rows);
  const lower = new Set([...present].map((p) => p.toLowerCase()));
  const there = paths.filter((p) => lower.has(p.toLowerCase())).length;
  return { present: there, create: paths.length - there, hidden: rows.filter((r) => r.status === 'hidden' && !r.added).length, added: rows.filter((r) => r.added).length };
}

/** The project's tree as a template of its own ("Save these changes back to the template…"). */
export const templateWithOverrides = (t: FolderTemplate, ov: Ov | undefined): FolderTemplate => ({ ...t, folders: applyOverrides(t, ov) });

/** The project's folder setting with these overrides (none stored when they change nothing). */
export function withOverrides(folder: ProjectFolder, ov: Ov | undefined): ProjectFolder {
  const { overrides: _o, ...rest } = folder;
  return noOverrides(ov) ? rest : { ...rest, overrides: ov };
}

/* ---------- change template (C8) ---------- */

export interface ChangeRow {
  kind: 'create' | 'keep' | 'untouched';
  path: string;
  /** Subfolders of this row with the same change, folded into it. */
  inside: number;
  /** Roles whose folder moves here, with the folder they were in. */
  remapped: { role: string; from: string }[];
}

export interface ChangePlan {
  diff: TemplateDiff;
  rows: ChangeRow[];
  kept: Ov;
  dropped: string[];
  /** The project's folder setting after Apply. */
  folder: ProjectFolder;
}

/** The project's folders now: its template, its changes, without the unticked folders. */
export function currentFolders(folder: ProjectFolder, vars: FolderVars, buildings: readonly FolderBuilding[], unticked: Iterable<string>): ExpandedFolder[] {
  const t = folder.template;
  return expandTemplate({ ...t, folders: prune(applyOverrides(t, folder.overrides), new Set(unticked)) }, vars, SCOPE_FLAGS, buildings).folders;
}

/** What switching the project to `next` does: the folders to create, those kept, those left untouched,
 * the overrides that still apply and those dropped. `nextUnticked` are the new template's folders that
 * start unticked (their condition is off). Apply only creates folders. */
export function changePlan(folder: ProjectFolder, next: FolderTemplate, vars: FolderVars, buildings: readonly FolderBuilding[], unticked: Iterable<string>, nextUnticked: Iterable<string>, nextBuildings: readonly FolderBuilding[] = buildings): ChangePlan {
  const { kept, dropped } = folder.overrides ? checkOverrides(next, folder.overrides) : { kept: emptyOverrides(), dropped: [] };
  const now = currentFolders(folder, vars, buildings, unticked);
  const then = expandTemplate({ ...next, folders: prune(applyOverrides(next, kept), new Set(nextUnticked)) }, vars, SCOPE_FLAGS, nextBuildings).folders;
  const diff = diffTemplates(now, then);
  const fold = (kind: ChangeRow['kind'], list: readonly ExpandedFolder[]): ChangeRow[] => {
    const paths = [...new Set(list.map((f) => f.path))];
    const set = new Set(paths.map((p) => p.toLowerCase()));
    const top = (p: string) => { const parts = p.split('/'); for (let i = 1; i < parts.length; i++) if (set.has(parts.slice(0, i).join('/').toLowerCase())) return false; return true; };
    if (kind === 'keep') return paths.map((path) => ({ kind, path, inside: 0, remapped: [] }));
    return paths.filter(top).map((path) => ({ kind, path, inside: paths.filter((p) => p.toLowerCase().startsWith(`${path.toLowerCase()}/`)).length, remapped: [] }));
  };
  const rows = [...fold('create', diff.create), ...fold('keep', diff.keep), ...fold('untouched', diff.untouched)];
  for (const m of diff.remap) {
    if (!m.from || !m.to) continue;
    const row = rows.find((r) => r.kind !== 'untouched' && r.path.toLowerCase() === m.to!.toLowerCase());
    if (row) row.remapped.push({ role: m.role, from: m.from });
  }
  const order = (r: ChangeRow) => (r.kind === 'untouched' ? 1 : 0);
  rows.sort((a, b) => order(a) - order(b) || a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  return { diff, rows, kept, dropped, folder: withOverrides({ templateId: next.id, version: next.version, template: next }, kept) };
}

/** "Show where old files would go": each role whose folder changes, from where to where (list only). */
export const whereFilesGo = (diff: TemplateDiff): { role: string; from: string; to?: string }[] =>
  diff.remap.filter((m) => m.from).map((m) => ({ role: m.role, from: m.from!, ...(m.to ? { to: m.to } : {}) }));
