import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkProjectShape } from '../model/projectValidate';
import { isFutureSchema, migrateProject } from '../model/projectMigrate';
import { planLinkOf, type PlanLink } from '../model/planLink';
import { unpackPlan } from '../model/planPackage';
import type { Project } from '../types';
import { fileOfAlias } from './privacy';
import { confine, findFile, MAX_PROJECT_BYTES, readFileLimited, readFileWithin } from './safeFiles';

/** Finding and opening project files without the app (command line, MCP server, local API), with the drawn work kept
 * beside them. Read only: nothing here writes a file. */

/** A listing reads at most this many project files, and this much in all, newest first (far above real use: a project
 * file is ~20 KB), so a folder of large or crafted files cannot hold up the MCP server or the local API. */
const MAX_LISTED = 1000;
const MAX_LISTED_BYTES = 256 * 1024 * 1024;

/** The desktop app's data folder (Electron userData of "LV Design Studio"), per platform. LVDS_APP_DATA overrides it (tests). */
export function appDataDir(): string {
  if (process.env.LVDS_APP_DATA) return path.resolve(process.env.LVDS_APP_DATA);
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'LV Design Studio');
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'LV Design Studio');
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'LV Design Studio');
}
/** An error message without this computer's folders: the projects folder and the home folder are named, not shown. */
export function redactPaths(message: string, folder: string): string {
  let m = message;
  for (const [p, label] of [[path.resolve(folder), '<projects folder>'], [os.homedir(), '~']] as const) if (p && p !== path.sep) m = m.split(p).join(label);
  return m;
}

const appSettingsPath = () => path.join(appDataDir(), 'settings.json');

/** The app's recovery copy of unsaved work for a project (electron/projectFiles.cjs, same file name rule), if there is one:
 * the project is open in the app with changes that are not saved yet. */
export function unsavedCopyInApp(projectId: string | undefined): string | undefined {
  if (!projectId) return undefined;
  const file = path.join(appDataDir(), 'recovery', `${String(projectId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}.json`);
  return fs.existsSync(file) ? file : undefined;
}

/** The projects folder: LVDS_PROJECTS, else the one chosen in the app, else the app's default. */
export function projectsFolder(): string {
  if (process.env.LVDS_PROJECTS) return path.resolve(process.env.LVDS_PROJECTS);
  try {
    const s = JSON.parse(fs.readFileSync(appSettingsPath(), 'utf-8')) as { projectsFolder?: unknown };
    if (typeof s.projectsFolder === 'string' && s.projectsFolder) return s.projectsFolder;
  } catch { /* no settings yet: the default */ }
  return path.join(os.homedir(), 'LV Design Studio Projects');
}

/** A project from the text of its file: checked like the app checks it on opening, and brought up to the current format (in memory only). */
export function parseProject(text: string, name: string): Project {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { throw new Error(`${name} could not be read as a project (${(e as Error).message}).`); }
  const p = checkProjectShape(raw, name);
  if (isFutureSchema(p)) throw new Error(`${name} was saved by a newer version of LV Design Studio. Update the app to read it.`);
  return migrateProject(p, name);
}

/** A project file name: the native .lvds, or the older .json with the same content. */
export const PROJECT_FILE = /\.(lvds|json)$/i;

export interface ProjectRef {
  /** A file name in the projects folder (with or without .lvds; an older project is .json), or a path. */
  ref: string;
  /** Where the project files are. */
  folder: string;
  /** false (MCP, local API): only files inside the projects folder can be opened. */
  anywhere: boolean;
}

const outsideFolder = (folder: string) => `Only projects inside the projects folder (${folder}) can be opened here.`;

/** The full path of a project file, or an error saying why it cannot be opened. */
export function resolveProject({ ref, folder, anywhere }: ProjectRef): string {
  const given = ref.trim();
  if (!given) throw new Error('Give a project: a file name in the projects folder, or a path.');
  // The id an AI program was given in place of the file name (MCP with names hidden, src/headless/privacy.ts).
  const name = fileOfAlias(given, folder) ?? given;
  const full = findFile(name, { folder, anywhere }, PROJECT_FILE.test(name) ? [name] : [`${name}.lvds`, `${name}.json`, name]);
  if (!full) throw new Error(`No project "${name}" in ${folder}. Use list_projects to see the project files.`);
  return confine(full, { folder, anywhere }, outsideFolder(folder));
}

/** The project file as it is, without its drawn work: for what needs only the file (its name, the change log, undo).
 * A project that keeps its drawn work in name.lvplan has the link to it; openProjectFull puts the drawn work back. */
export function openProject(r: ProjectRef): { project: Project; file: string; text: string } {
  const file = resolveProject(r);
  const bytes = readFileWithin(file, r, MAX_PROJECT_BYTES, outsideFolder(r.folder));
  if (!bytes) throw new Error(`${path.basename(file)} is larger than ${MAX_PROJECT_BYTES / 1024 / 1024} MB.`);
  const text = bytes.toString('utf-8');
  return { project: parseProject(text, path.basename(file)), file, text };
}

// ---- The drawn work beside it: name.lvplan (src/model/planPackage.ts), as the desktop app keeps it ----

/** The drawn work file of a .lvds project file; undefined for an older .json, which never has one. */
export const planFileOf = (file: string): string | undefined => (/\.lvds$/i.test(file) ? file.replace(/\.lvds$/i, '.lvplan') : undefined);
export const sha256Of = (data: string | Buffer): string => crypto.createHash('sha256').update(data).digest('hex');
/** A plain file's bytes; undefined when it is missing, a link (never followed) or too large. */
const plainBytes = (full: string): Buffer | undefined => { try { return readFileLimited(full, MAX_PROJECT_BYTES); } catch { return undefined; } };
/** SHA-256 of the drawn work file beside a project file; null when there is none. */
export function planShaOf(file: string): string | null {
  const f = planFileOf(file);
  const b = f ? plainBytes(f) : undefined;
  return b ? sha256Of(b) : null;
}

/** The drawn work a project file links to: the copy whose SHA-256 the link records, tried in the desktop app's order
 * (electron/projectFiles.cjs readPlanFor): name.lvplan, its .bak, then the file the link names and its .bak. */
export function planBytesFor(file: string, link: PlanLink): Buffer | undefined {
  const named = /^[^\\/:*?"<>|]+\.lvplan$/i.test(link.file) && !link.file.startsWith('.') ? path.join(path.dirname(file), link.file) : undefined;
  for (const n of new Set([planFileOf(file), named].filter((x): x is string => !!x))) {
    for (const f of [n, `${n}.bak`]) {
      const b = plainBytes(f);
      if (b && sha256Of(b) === link.sha256) return b;
    }
  }
  return undefined;
}

export interface OpenedProject {
  project: Project; file: string; text: string;
  /** SHA-256 of name.lvplan beside it when it was read (null: none), to notice a change before writing. */
  planSha: string | null;
  /** Its drawn work file is missing or does not match: the project has no drawings, and keeps this link. */
  drawnWorkMissing?: PlanLink;
}

/** A project as the app opens it: with its drawn work (name.lvplan) put back. When that cannot be read, the project
 * keeps the link (drawnWorkMissing), and a write leaves the drawn work as it is (write.ts commitProject). */
export async function openProjectFull(r: ProjectRef): Promise<OpenedProject> {
  const o = openProject(r);
  const planSha = planShaOf(o.file);
  const link = planLinkOf(o.project);
  if (!link) return { ...o, planSha };
  const project = await unpackPlan(o.project, planBytesFor(o.file, link));
  const missing = planLinkOf(project);
  return { ...o, project, planSha, ...(missing ? { drawnWorkMissing: missing } : {}) };
}

export interface ProjectListing { file: string; name: string; panels: number; circuits: number; status?: string; revision?: string; modified: string }

/** The project files in a folder, newest first. Files that are not projects are left out, and so are links on MCP and
 * the local API (anywhere false), as in the app. */
export function listProjects(folder: string, anywhere = false): ProjectListing[] {
  let names: string[] = [];
  try { names = fs.readdirSync(folder).filter((f) => PROJECT_FILE.test(f)); } catch { return []; }
  const files = names.flatMap((f) => {
    try {
      const st = (anywhere ? fs.statSync : fs.lstatSync)(path.join(folder, f));
      return st.isFile() ? [{ f, t: st.mtimeMs, size: st.size }] : [];
    } catch { return []; }
  }).sort((a, b) => b.t - a.t);
  const out: ProjectListing[] = [];
  let opened = 0, bytesRead = 0;
  for (const { f, t, size } of files) {
    if (opened >= MAX_LISTED || bytesRead >= MAX_LISTED_BYTES) break;
    if (size > MAX_PROJECT_BYTES) continue; // too large to open: left out unread
    opened++;
    try {
      const bytes = readFileWithin(path.join(folder, f), { folder, anywhere }, MAX_PROJECT_BYTES, outsideFolder(folder));
      if (!bytes) continue;
      bytesRead += bytes.length;
      const p = parseProject(bytes.toString('utf-8'), f);
      const rev = p.revisions?.[p.revisions.length - 1];
      out.push({ file: f, name: p.name, panels: p.boards.length, circuits: p.feeders.length, status: p.status, revision: rev?.id, modified: new Date(t).toISOString() });
    } catch { /* not a project file */ }
  }
  return out;
}
