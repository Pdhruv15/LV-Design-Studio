/** Planning a project's folders from a folder template (spec F1, F3): the names, which folders the
 * project's scope switches on, the list to create, and where the project folder is on this computer.
 * Pure, except the last part, which reads and writes this computer's own storage. The folder's place on
 * disk is never written into the project file: it differs from computer to computer. */

import { applyOverrides, expandTemplate, fillName, FOLDER_LIMITS, FOLDER_WHEN, safeNamePart, walkNodes, type FolderBuilding, type FolderNode, type FolderTemplate, type FolderVars, type FolderWhen, type ProjectFolder } from './folderTemplates';
import type { Project } from '../types';
import type { ScopeId } from './brief';
import { projectNumber } from './projectNumber';

/** Conditions a folder can depend on that the user ticks: everything but "always" and "each building". */
export const SCOPE_FLAGS = FOLDER_WHEN.filter((w): w is FolderWhen => w !== 'always' && w !== 'building:each');

/** The fields folder names are filled from. The project number is the project's own, else the one typed for reports. */
export function folderVars(project: Pick<Project, 'name' | 'info' | 'studyReport'>): FolderVars {
  const v: FolderVars = { ProjectShort: project.name };
  const no = projectNumber(project);
  if (no) v.ProjectNo = no;
  if (project.info?.owner?.trim()) v.Client = project.info.owner.trim();
  if (project.info?.plotNo?.trim()) v.Plot = project.info.plotNo.trim();
  return v;
}

/** The brief's scope items that switch folders on, in the order the folders list them. */
const SCOPE_FLAG: [ScopeId, FolderWhen][] = [['solar', 'scope:pv'], ['ups', 'scope:standby'], ['fire', 'scope:fire'], ['elv', 'scope:elv'], ['tender', 'stage:tender'], ['supervision', 'service:supervision']];

/** Conditions the project brief switches on: Solar PV → scope:pv, UPS → scope:standby, Fire alarm → scope:fire,
 * ELV → scope:elv, Tender stage → stage:tender, Site supervision → service:supervision. */
export function folderFlags(project: Pick<Project, 'brief'>): FolderWhen[] {
  const scope = project.brief?.scope ?? [];
  return SCOPE_FLAG.filter(([id]) => scope.includes(id)).map(([, flag]) => flag);
}

/** The copies a "for each building" folder is made for: the project's buildings (B1, B2… and the building's
 * name), or, when the template repeats for phases, the phases typed in the template (P1, P2…). */
export function folderBuildings(project: Pick<Project, 'building'>, t?: Pick<FolderTemplate, 'repeat'>): FolderBuilding[] {
  const clean = (s: string, i: number, w: string) => safeNamePart(s).replace(/\s+/g, '-') || `${w}-${i + 1}`;
  if (t?.repeat?.source === 'phases') return (t.repeat.phases ?? []).map((p, i) => ({ code: `P${i + 1}`, name: clean(p, i, 'Phase'), id: `phase:${i + 1}` }));
  return (project.building?.buildings ?? []).map((b, i) => ({ code: `B${i + 1}`, name: clean(b.name, i, 'Building'), id: b.id }));
}

/** A folder name made safe for Windows as it is typed: reserved characters become "-", no trailing dot or space. */
export const cleanFolderName = (name: string): string => safeNamePart(name).replace(/[. ]+$/, '').slice(0, 120);

/** The project folder's suggested name: the template's root pattern filled; "Project" when nothing is known. */
export const suggestedRootName = (t: FolderTemplate, vars: FolderVars): string => cleanFolderName(fillName(t.root, vars)) || 'Project';

/** Ids of the folders that start unticked: those whose condition is off, with everything inside them. */
export function offByDefault(nodes: readonly FolderNode[], flags: Iterable<FolderWhen>): string[] {
  const on = new Set(flags);
  const out: string[] = [];
  walkNodes(nodes, (n, up) => {
    const off = (x: FolderNode) => !!x.when && x.when !== 'always' && x.when !== 'building:each' && !on.has(x.when);
    if (off(n) || up.some(off)) out.push(n.id);
  });
  return out;
}

export interface FolderPlan {
  /** Paths inside the project folder, "/" between folders, parents before children. */
  paths: string[];
  /** Folders whose full path is too long for Windows and synced drives. */
  tooLong: string[];
}

/** The folders to make: the template (with the project's own changes), without the unticked folders and
 * what is inside them. Every condition counts as on, so the ticks alone decide. `rootPath` (the project
 * folder's full path) is used to find paths that are too long. */
export function planFolders(t: FolderTemplate, overrides: ProjectFolder['overrides'], vars: FolderVars, buildings: readonly FolderBuilding[], unticked: Iterable<string>, rootPath = ''): FolderPlan {
  const off = new Set(unticked);
  const prune = (nodes: readonly FolderNode[]): FolderNode[] => nodes.filter((n) => !off.has(n.id)).map((n) => (n.children ? { ...n, children: prune(n.children) } : n));
  const tree = prune(applyOverrides(t, overrides));
  const { folders } = expandTemplate({ ...t, folders: tree }, vars, SCOPE_FLAGS, buildings);
  const paths = [...new Set(folders.map((f) => f.path))];
  const tooLong = rootPath ? paths.filter((p) => rootPath.length + 1 + p.length > FOLDER_LIMITS.maxPathChars) : [];
  return { paths, tooLong };
}

/** Joins a folder and a name with the separator the folder already uses. */
export function joinPath(parent: string, name: string): string {
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${sep}${name}`;
}

/* ---------- where the project folder is, on this computer ---------- */

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** `buildings`: the copies folders were last made for here, to tell a renamed or new building (C6). */
export interface RememberedFolder { root: string; unticked: string[]; buildings?: FolderBuilding[] }
const KEY = (projectId: string | undefined) => `lvds.projectFolder.${projectId ?? 'new'}`;
const store = (s?: Store): Store | undefined => s ?? (typeof localStorage === 'undefined' ? undefined : localStorage);

/** The project folder chosen on this computer, and the folders left unticked there. */
export function rememberedFolder(projectId: string | undefined, s?: Store): RememberedFolder | undefined {
  try {
    const v = JSON.parse(store(s)?.getItem(KEY(projectId)) ?? 'null') as Partial<RememberedFolder> | null;
    if (!v || typeof v.root !== 'string' || !v.root) return undefined;
    const buildings = Array.isArray(v.buildings) ? v.buildings.filter((b): b is FolderBuilding => !!b && typeof b.code === 'string' && typeof b.name === 'string' && (b.id === undefined || typeof b.id === 'string')).slice(0, 500) : undefined;
    return { root: v.root, unticked: Array.isArray(v.unticked) ? v.unticked.filter((x): x is string => typeof x === 'string') : [], ...(buildings ? { buildings } : {}) };
  } catch { return undefined; }
}

export function rememberFolder(projectId: string | undefined, f: RememberedFolder | undefined, s?: Store): void {
  try {
    if (f) store(s)?.setItem(KEY(projectId), JSON.stringify(f)); else store(s)?.removeItem(KEY(projectId));
  } catch { /* not remembered on this computer */ }
}

/* ---------- where the user saved an output instead, on this computer (spec F2) ---------- */

const CHOICE_KEY = (projectId: string | undefined) => `lvds.projectFolderChoices.${projectId ?? 'new'}`;

function readChoices(projectId: string | undefined, s?: Store): Record<string, string> {
  try {
    const v = JSON.parse(store(s)?.getItem(CHOICE_KEY(projectId)) ?? 'null') as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, d]) => typeof d === 'string' && !!d)) as Record<string, string>;
  } catch { return {}; }
}

/** The folder the user saved this project's outputs of a role in, when it was not the role's own folder. */
export const rememberedChoice = (projectId: string | undefined, role: string, s?: Store): string | undefined => readChoices(projectId, s)[role];

/** Remembers (or, with '' or undefined, forgets) the folder chosen for a project and role. */
export function rememberChoice(projectId: string | undefined, role: string, dir: string | undefined, s?: Store): void {
  try {
    const all = readChoices(projectId, s);
    if (dir) all[role] = dir.slice(0, 1000); else delete all[role];
    if (Object.keys(all).length) store(s)?.setItem(CHOICE_KEY(projectId), JSON.stringify(all)); else store(s)?.removeItem(CHOICE_KEY(projectId));
  } catch { /* not remembered on this computer */ }
}
