import crypto from 'node:crypto';
import { packRevisions } from '../model/revisionStore';
import fs from 'node:fs';
import path from 'node:path';
import type { Project } from '../types';
import { withUids } from '../model/stableIds';
import { packPlan, PLAN_VERSION, PlanError } from '../model/planPackage';
import { planFileOf, planShaOf, PROJECT_FILE, sha256Of, unsavedCopyInApp } from './project';
import { areRealDirs, MAX_PROJECT_BYTES, openToAppend, readFileLimited, realDirs } from './safeFiles';

/** Writing a project file from outside the app (Stage 2), safely:
 * - never while the project has unsaved changes open in the app (its recovery copy exists);
 * - never over a file that changed since it was read (another save in between);
 * - written like the app writes it: a temporary file, flushed, then renamed over the old one, and read back;
 * - the previous version kept as a backup, and every change logged, so undo_change can put it back.
 * Backups and the log live in <projects folder>/.lvds-agent/, which must be a real folder (not a link). Anyone with
 * the folder (or a sync) can change the log, so each line is checked, and undo reads only the backup that change made,
 * found by the change's id: never a path written in the log. */

const sha = sha256Of;
const AGENT = '.lvds-agent';
export const agentDir = (folder: string) => path.join(folder, AGENT);
/** .lvds-agent, or a folder in it, made when missing; each must be a real folder, not a link. */
export const realAgentDir = (folder: string, ...sub: string[]) => realDirs(folder, AGENT, ...sub);
const logFile = (folder: string) => path.join(agentDir(folder), 'log.jsonl');
const stemOf = (name: string) => name.replace(PROJECT_FILE, '');
/** Where a change to the project file `name` keeps the version from before it. */
const backupPath = (folder: string, name: string, id: string) => path.join(agentDir(folder), 'backups', stemOf(name), `${id}.json`);
/** Backups kept per project file (the oldest go first). */
export const MAX_BACKUPS = 50;
/** The change log is read up to this size (a change is ~300 bytes). */
const MAX_LOG_BYTES = 64 * 1024 * 1024;

export interface ChangeEntry {
  id: string; // C-<time>-<random>
  at: string;
  file: string; // file name in the projects folder
  tool: string;
  summary: string;
  /** Content hash of the file before and after the change. */
  beforeHash: string;
  afterHash: string;
  /** The previous version, relative to the projects folder. */
  backup: string;
  /** For an undo: the change it reversed. */
  undoes?: string;
  /** The AI client that made the change (MCP), as it named itself. */
  client?: string;
}

export class WriteRefused extends Error {}

function writeAtomic(full: string, data: string | Buffer): void {
  const tmp = `${full}.tmp-lvds-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tmp, 'wx'); // a new file: never through a link planted at that name
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, full);
  const back = readFileLimited(full, typeof data === 'string' ? Buffer.byteLength(data, 'utf-8') : data.length);
  if (!back || sha(back) !== sha(data)) throw new Error('The file was written but reading it back did not match; it may not have been saved correctly.');
}

/** The drawn work of a write: the .lvplan bytes to keep beside the project file (none: it is left as it is), and the
 * SHA-256 of the .lvplan there when the project was read. */
export interface DrawnWork { bytes?: Buffer; readSha: string | null }

/** Why the drawn work beside the project cannot be written over now, or undefined: it changed since it was read, and
 * not into what this write would make it. A .lvplan that is gone is written again. */
function drawnWorkBlocked(file: string, d: DrawnWork): string | undefined {
  const now = planShaOf(file);
  if (now === null || now === d.readSha || (d.bytes && now === sha(d.bytes))) return undefined;
  return `${path.basename(planFileOf(file)!)} (the drawn work of ${path.basename(file)}) changed while this was being prepared (saved from the app or a sync). Run it again on the current file.`;
}

/** name.lvplan as the app writes it: only when it is not already that, with the one before kept as name.lvplan.bak. */
function writeDrawnWork(file: string, bytes: Buffer): void {
  const full = planFileOf(file)!;
  if (planShaOf(file) === sha(bytes)) return;
  let old: Buffer | undefined;
  try { old = readFileLimited(full, MAX_PROJECT_BYTES); } catch { /* none yet */ }
  if (old) writeAtomic(`${full}.bak`, old); // renamed into place: a link at the .bak name is replaced, never written through
  writeAtomic(full, bytes);
}

/** Why the project cannot be written now, or undefined. */
export function writeBlocked(project: Project, file: string, readText: string): string | undefined {
  if (unsavedCopyInApp(project.id)) return `${path.basename(file)} is open in LV Design Studio with unsaved changes. Save (or discard) them in the app first, then try again.`;
  let now: Buffer | undefined;
  try { now = readFileLimited(file, MAX_PROJECT_BYTES, true); } catch { return `${path.basename(file)} can no longer be read.`; }
  if (!now || sha(now.toString('utf-8')) !== sha(readText)) return `${path.basename(file)} changed while this was being prepared (saved from the app or a sync). Run it again on the current file.`;
  return undefined;
}

const ID = /^C-\d{14}-[0-9a-f]{4}$/;
const HASH = /^[0-9a-f]{64}$/;
const sameRelPath = (a: string, b: string) => a.split(/[\\/]/).join('/') === b.split(/[\\/]/).join('/');

/** A line of the log as a change, or undefined unless it is one these tools write: a change id, hashes, a plain file
 * name, and the backup where that change keeps it. */
function changeEntry(folder: string, line: string): ChangeEntry | undefined {
  let e: Partial<Record<keyof ChangeEntry, unknown>>;
  try { e = JSON.parse(line); } catch { return undefined; }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return undefined;
  const { id, at, file, tool, summary, beforeHash, afterHash, backup, undoes, client } = e;
  if (typeof id !== 'string' || !ID.test(id) || typeof file !== 'string' || !file || /[\\/]/.test(file)) return undefined;
  if (typeof at !== 'string' || typeof tool !== 'string' || typeof summary !== 'string') return undefined;
  if (typeof beforeHash !== 'string' || !HASH.test(beforeHash) || typeof afterHash !== 'string' || !HASH.test(afterHash)) return undefined;
  if (typeof backup !== 'string' || !sameRelPath(backup, path.relative(folder, backupPath(folder, file, id)))) return undefined;
  if (undoes !== undefined && (typeof undoes !== 'string' || !ID.test(undoes))) return undefined;
  return { id, at, file, tool, summary, beforeHash, afterHash, backup, ...(undoes ? { undoes } : {}), ...(typeof client === 'string' && client ? { client: client.slice(0, 100) } : {}) };
}

/** The changes in the log, oldest first; lines that are not changes these tools wrote are left out. */
export function readLog(folder: string): ChangeEntry[] {
  let bytes: Buffer | undefined;
  try {
    if (!areRealDirs(folder, AGENT)) return [];
    bytes = readFileLimited(logFile(folder), MAX_LOG_BYTES);
  } catch { return []; }
  if (!bytes) throw new Error(`The change log (${AGENT}/log.jsonl) is larger than ${MAX_LOG_BYTES / 1024 / 1024} MB. Move it out of the projects folder to start a new one.`);
  return bytes.toString('utf-8').split('\n').filter((l) => l.trim()).flatMap((l) => {
    const e = changeEntry(folder, l);
    return e ? [e] : [];
  });
}

function pruneBackups(dir: string): void {
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) fs.unlinkSync(path.join(dir, f));
  } catch { /* best effort */ }
}

/** Writes `text` over the project file that was read as `readText`, keeping a backup and logging the change. With
 * `drawn`, its .lvplan is written first (when it changed), as the app saves: the project file then links to it. */
export function commitText(folder: string, file: string, readText: string, text: string, tool: string, summary: string, project: Project, undoes?: string, client?: string, drawn?: DrawnWork): ChangeEntry {
  const blocked = writeBlocked(project, file, readText) ?? (drawn ? drawnWorkBlocked(file, drawn) : undefined);
  if (blocked) throw new WriteRefused(blocked);
  const name = path.basename(file);
  const at = new Date();
  const id = `C-${at.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${crypto.randomBytes(2).toString('hex')}`;
  const dir = realAgentDir(folder, 'backups', stemOf(name));
  const log = openToAppend(logFile(folder)); // checked before anything is written
  try {
    const backupFull = backupPath(folder, name, id);
    fs.writeFileSync(backupFull, readText, { encoding: 'utf-8', flag: 'wx' });
    if (drawn?.bytes) writeDrawnWork(file, drawn.bytes);
    writeAtomic(file, text);
    const entry: ChangeEntry = { id, at: at.toISOString(), file: name, tool, summary, beforeHash: sha(readText), afterHash: sha(text), backup: path.relative(folder, backupFull), ...(undoes ? { undoes } : {}), ...(client ? { client } : {}) };
    fs.writeFileSync(log, JSON.stringify(entry) + '\n', 'utf-8');
    pruneBackups(dir);
    return entry;
  } finally {
    fs.closeSync(log);
  }
}

/** Writes the project as the app does (2-space JSON), with a uid on every new or copied board and circuit. A .lvds keeps
 * its drawn work in name.lvplan beside it, linked by SHA-256, as the app saves it (model/planPackage packPlan): written
 * only when it changed. One whose drawn work could not be read keeps its link, and the .lvplan is left as it is. An
 * older .json keeps its drawn work inside, as before (the app moves it when it saves the project as .lvds).
 * `readPlanSha` is what the .lvplan was when the project was read (openProjectFull). */
export async function commitProject(folder: string, file: string, readText: string, next0: Project, tool: string, summary: string, client?: string, readPlanSha: string | null = null) {
  const next = withUids(next0);
  if (!planFileOf(file)) return commitText(folder, file, readText, JSON.stringify(packRevisions(next), null, 2), tool, summary, next, undefined, client);
  let packed: Awaited<ReturnType<typeof packPlan>>;
  try { packed = await packPlan(next); } catch (e) { throw e instanceof PlanError ? new WriteRefused(e.message) : e; }
  const bytes = packed.bytes && Buffer.from(packed.bytes);
  const out = bytes ? { ...packed.project, plan: { file: path.basename(planFileOf(file)!), sha256: sha(bytes), version: PLAN_VERSION } } : packed.project;
  return commitText(folder, file, readText, JSON.stringify(packRevisions(out), null, 2), tool, summary, next, undefined, client, { bytes, readSha: readPlanSha });
}

/** Puts back the version from before a change. Only when the file is still exactly what that change wrote, and the
 * backup that change kept is still what it was. */
export function undoChange(folder: string, file: string, readText: string, project: Project, changeId?: string, client?: string): ChangeEntry {
  const name = path.basename(file);
  const mine = readLog(folder).filter((e) => e.file === name);
  const undone = new Set(mine.map((e) => e.undoes).filter(Boolean));
  const target = changeId ? mine.find((e) => e.id === changeId) : [...mine].reverse().find((e) => !e.undoes && !undone.has(e.id));
  if (!target) throw new WriteRefused(changeId ? `No change ${changeId} for ${name}.` : `No change to undo for ${name}.`);
  if (undone.has(target.id)) throw new WriteRefused(`${target.id} has already been undone.`);
  const kept = backupPath(folder, name, target.id);
  if (sha(readText) !== target.afterHash) {
    throw new WriteRefused(`${name} has changed since ${target.id} (${target.summary}), so it is not put back automatically. Its earlier version is kept at ${kept}.`);
  }
  let before: string | undefined;
  try { if (areRealDirs(folder, AGENT, 'backups', stemOf(name))) before = readFileLimited(kept, MAX_PROJECT_BYTES)?.toString('utf-8'); } catch { /* missing or not a file */ }
  if (before === undefined || sha(before) !== target.beforeHash) throw new WriteRefused(`The earlier version of ${name} kept by ${target.id} is missing or was changed, so it is not put back.`);
  return commitText(folder, file, readText, before, 'undo_change', `Undo ${target.id}: ${target.summary}`, project, target.id, client);
}
