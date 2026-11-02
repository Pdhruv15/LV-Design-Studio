import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkProjectShape } from '../model/projectValidate';
import { isFutureSchema, migrateProject } from '../model/projectMigrate';
import type { Project } from '../types';
import { confine, findFile, MAX_PROJECT_BYTES, readFileWithin } from './safeFiles';

/** Finding and opening project files without the app (command line, MCP server, local API).
 * Read only: nothing here writes a file. */

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

export interface ProjectRef {
  /** A file name in the projects folder (with or without .json), or a path. */
  ref: string;
  /** Where the project files are. */
  folder: string;
  /** false (MCP, local API): only files inside the projects folder can be opened. */
  anywhere: boolean;
}

const outsideFolder = (folder: string) => `Only projects inside the projects folder (${folder}) can be opened here.`;

/** The full path of a project file, or an error saying why it cannot be opened. */
export function resolveProject({ ref, folder, anywhere }: ProjectRef): string {
  const name = ref.trim();
  if (!name) throw new Error('Give a project: a file name in the projects folder, or a path.');
  const withExt = name.toLowerCase().endsWith('.json') ? name : `${name}.json`;
  const full = findFile(name, { folder, anywhere }, [withExt, name]);
  if (!full) throw new Error(`No project "${name}" in ${folder}. Use list_projects to see the project files.`);
  return confine(full, { folder, anywhere }, outsideFolder(folder));
}

export function openProject(r: ProjectRef): { project: Project; file: string; text: string } {
  const file = resolveProject(r);
  const bytes = readFileWithin(file, r, MAX_PROJECT_BYTES, outsideFolder(r.folder));
  if (!bytes) throw new Error(`${path.basename(file)} is larger than ${MAX_PROJECT_BYTES / 1024 / 1024} MB.`);
  const text = bytes.toString('utf-8');
  return { project: parseProject(text, path.basename(file)), file, text };
}

export interface ProjectListing { file: string; name: string; panels: number; circuits: number; status?: string; revision?: string; modified: string }

/** The project files in a folder, newest first. Files that are not projects are left out, and so are links on MCP and
 * the local API (anywhere false), as in the app. */
export function listProjects(folder: string, anywhere = false): ProjectListing[] {
  let names: string[] = [];
  try { names = fs.readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.json')); } catch { return []; }
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
