import fs from 'node:fs';
import path from 'node:path';

/** Reading and writing files for the command line, the MCP server and the local API, in one place (the desktop app's
 * rules are in electron/safeFs.cjs):
 * - MCP and the local API stay inside the projects folder. A file there is opened without following a link at its own
 *   name (O_NOFOLLOW where the OS has it), and the file that was opened must be the one at its real path inside the
 *   projects folder's real path: a linked file or folder, or a file swapped in after the check, cannot lead outside.
 *   The projects folder itself may be a link (e.g. into a cloud-sync folder); that is the user's choice.
 * - The command line may name any path (links followed): the user chose it.
 * - Every read checks the size on the open handle and reads no more than that.
 * - Folders the tools make inside the projects folder must be real folders, and new files are created exclusively,
 *   so a link planted there cannot redirect a write. */

const MB = 1024 * 1024;
/** The largest project file read: the desktop app's limit (electron/limits.cjs projectBytes). */
export const MAX_PROJECT_BYTES = 50 * MB;
const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
// A FIFO planted under a file's name must not hold up the open.
const NONBLOCK = fs.constants.O_NONBLOCK || 0;

/** Where files may be: only in the projects folder (MCP, local API), or anywhere (command line). */
export interface Scope { folder: string; anywhere: boolean }

/** `p` is `dir` or inside it, by whole path components ("/a/bc" is not inside "/a/b"). */
export function isInside(dir: string, p: string): boolean {
  const rel = path.relative(dir, p);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

const isLink = (full: string) => { try { return fs.lstatSync(full).isSymbolicLink(); } catch { return false; } };
const isLinkError = (e: unknown) => ['ELOOP', 'EMLINK'].includes((e as NodeJS.ErrnoException).code ?? '');

/** The first of `ref` (a path), or of `names` in the projects folder (the command line also tries the current folder),
 * that is a file. */
export function findFile(ref: string, scope: Scope, names: string[] = [ref]): string | undefined {
  const candidates = path.isAbsolute(ref) ? [ref] : [...names.map((n) => path.resolve(scope.folder, n)), ...(scope.anywhere ? [path.resolve(ref)] : [])];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

/** MCP and the local API: `full`, if it is inside the projects folder and reached without a link, else throws
 * `outside`. The command line: `full` as it is. */
export function confine(full: string, scope: Scope, outside: string): string {
  if (scope.anywhere) return full;
  if (!isInside(path.resolve(scope.folder), path.resolve(full)) || isLink(full)) throw new Error(outside);
  if (!isInside(fs.realpathSync(scope.folder), fs.realpathSync(full))) throw new Error(outside);
  return full;
}

/** At most `size` bytes of an open file (a file that grows meanwhile is not read past what was checked). */
function readOpen(fd: number, size: number): Buffer {
  const buf = Buffer.alloc(size);
  let n = 0;
  while (n < size) {
    const r = fs.readSync(fd, buf, n, size - n, n);
    if (!r) break;
    n += r;
  }
  return n < size ? buf.subarray(0, n) : buf;
}

/** A whole file read on one open handle, or undefined when it is larger than `max` (nothing is read). follow false: a
 * link at the file's own name is refused. MCP and the local API: only the very file at its real path inside the
 * projects folder (else throws `outside`). */
function readOnHandle(full: string, scope: Scope, max: number, outside: string, follow: boolean): Buffer | undefined {
  const linkRefused = () => new Error(outside || `${path.basename(full)} is a link, not a file; it is not opened.`);
  confine(full, scope, outside);
  if (!follow && isLink(full)) throw linkRefused(); // also where the OS has no O_NOFOLLOW
  let fd: number;
  try { fd = fs.openSync(full, fs.constants.O_RDONLY | NONBLOCK | (follow ? 0 : NOFOLLOW)); } catch (e) {
    if (!follow && isLinkError(e)) throw linkRefused();
    throw e;
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile()) throw new Error(`${path.basename(full)} is not a file.`);
    if (!scope.anywhere) {
      // No linked folder on the way, and no other file swapped in between the check and the open.
      const real = fs.realpathSync(full);
      const now = fs.statSync(real);
      if (!isInside(fs.realpathSync(scope.folder), real) || now.dev !== st.dev || now.ino !== st.ino) throw new Error(outside);
    }
    return st.size > max ? undefined : readOpen(fd, st.size);
  } finally {
    fs.closeSync(fd);
  }
}

/** A file a tool was given (project, exchange package, template, drawing), or undefined when it is larger than `max`.
 * MCP and the local API: only from inside the projects folder, else throws `outside`. */
export const readFileWithin = (full: string, scope: Scope, max: number, outside: string) => readOnHandle(full, scope, max, outside, scope.anywhere);

/** A file the tools keep or wrote themselves, or undefined when it is larger than `max`. follow false (the default): a
 * link at its name is refused. */
export const readFileLimited = (full: string, max: number, follow = false) => readOnHandle(full, { folder: path.dirname(full), anywhere: true }, max, '', follow);

/** Makes each folder of `names` in turn inside `root` (Exports, .lvds-agent…), each a real folder and not a link, so
 * nothing is made or written outside `root`. `root` itself may be a link (the projects folder), and is made when
 * missing. Returns the last one. */
export function realDirs(root: string, ...names: string[]): string {
  fs.mkdirSync(root, { recursive: true });
  let dir = root;
  for (const n of names) {
    dir = path.join(dir, n);
    try { fs.mkdirSync(dir); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    const st = fs.lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`${path.basename(dir)} is not a real folder; nothing is written there.`);
  }
  return dir;
}

/** True when each folder of `names` in turn inside `root` exists and is a real folder (nothing is made). */
export function areRealDirs(root: string, ...names: string[]): boolean {
  let dir = root;
  for (const n of names) {
    dir = path.join(dir, n);
    try {
      const st = fs.lstatSync(dir);
      if (st.isSymbolicLink() || !st.isDirectory()) return false;
    } catch { return false; }
  }
  return true;
}

/** Writes a new file `name` in `dir`, else "x (2).xlsx" …: never over an existing file or through a link. Returns its
 * full path. */
export function writeNewFile(dir: string, name: string, data: string | Uint8Array): string {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let n = 1; ; n++) {
    const full = path.join(dir, n === 1 ? name : `${base} (${n})${ext}`);
    try {
      fs.writeFileSync(full, data, { flag: 'wx' });
      return full;
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  }
}

/** Opens a log file the tools keep, to add lines at its end (made when missing); never through a link at its name. */
export function openToAppend(full: string): number {
  const linkRefused = () => new Error(`${path.basename(full)} is a link, not a file; nothing is written there.`);
  if (isLink(full)) throw linkRefused();
  let fd: number;
  try { fd = fs.openSync(full, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | NONBLOCK | NOFOLLOW); } catch (e) {
    if (isLinkError(e)) throw linkRefused();
    throw e;
  }
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error(`${path.basename(full)} is not a file.`);
  } catch (e) {
    fs.closeSync(fd);
    throw e;
  }
  return fd;
}
