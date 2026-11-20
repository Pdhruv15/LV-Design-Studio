// A project's folders on disk (spec F1, F3, F4): making the folders a folder template asks for, and saying
// which of them exist. Plain Node, unit tested in a temporary folder (src/model/projectFoldersDisk.test.ts).
//
// The only things written here are new, empty folders and (saveCopy) the copy of a project file in the
// project folder's projectFile folder. Nothing else is deleted, moved or renamed, and no link is followed:
// a link, or a file, where a folder should be is reported and left alone.

const fs = require('node:fs');
const path = require('node:path');

const MAX = Object.freeze({ paths: 2000, depth: 12, nameChars: 120, rootChars: 400, pathChars: 240, looseFiles: 20, countFiles: 5000, countPaths: 200 });
const ILLEGAL = /[<>:"/\\|?*]/;
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
const fail = (what) => { throw new Error(`Refused: ${what}`); };

/** One folder name Windows accepts: no separator or reserved character, not "." or "..", no trailing dot or space. */
function segment(s) {
  if (typeof s !== 'string' || !s.trim() || s.length > MAX.nameChars) fail('folder name');
  if (s === '.' || s === '..' || ILLEGAL.test(s) || [...s].some((c) => c < ' ') || /[. ]$/.test(s) || RESERVED.test(s)) fail(`folder name "${s.slice(0, 40)}"`);
  return s;
}

/** { root, paths }: an absolute project folder and folder paths inside it ("03_Calcs/02_Volt_Drop"). */
function args(a) {
  if (typeof a !== 'object' || a === null) fail('project folders');
  const { root, paths } = a;
  if (typeof root !== 'string' || root.length > MAX.rootChars || !path.isAbsolute(root) || root.includes('\0')) fail('project folder');
  const clean = path.resolve(root);
  if (path.parse(clean).root === clean) fail('project folder: a drive or the top of the disk');
  segment(path.basename(clean));
  if (!Array.isArray(paths) || paths.length > MAX.paths) fail('folder list');
  const seen = new Set();
  const out = [];
  for (const p of paths) {
    if (typeof p !== 'string') fail('folder path');
    const parts = p.split('/');
    if (parts.length > MAX.depth) fail('folder path: too deep');
    parts.forEach(segment);
    const rel = parts.join('/');
    if (clean.length + 1 + rel.length > MAX.pathChars) fail(`folder path longer than ${MAX.pathChars} characters`);
    if (!seen.has(rel.toLowerCase())) { seen.add(rel.toLowerCase()); out.push(rel); }
  }
  return { root: clean, paths: out };
}

/** 'dir' for a real folder, 'none' when nothing is there, else why it cannot be used. */
function kind(full) {
  let st;
  try { st = fs.lstatSync(full); } catch (e) { if (e.code === 'ENOENT') return 'none'; throw e; }
  if (st.isSymbolicLink()) return 'a link';
  return st.isDirectory() ? 'dir' : 'a file';
}

/** Makes one folder if it is missing. True when made, false when it was there. */
function make(full, label) {
  const k = kind(full);
  if (k === 'dir') return false;
  if (k !== 'none') throw new Error(`${label} is ${k}, not a folder; it is left as it is.`);
  fs.mkdirSync(full);
  return true;
}

/** Creates the project folder (inside a folder that must already exist) and the folders in it that are
 * missing. Folders that exist are left alone, with whatever they hold. */
function create(a) {
  const { root, paths } = args(a);
  const parent = path.dirname(root);
  if (kind(parent) !== 'dir') throw new Error(`${parent} is not a folder on this computer.`);
  const rootMade = make(root, path.basename(root));
  let created = 0, existed = 0;
  const failed = [];
  const done = new Set();
  for (const rel of paths) {
    const parts = rel.split('/');
    try {
      for (let i = 1; i <= parts.length; i++) {
        const sub = parts.slice(0, i).join('/');
        const key = sub.toLowerCase();
        if (done.has(key)) continue;
        if (make(path.join(root, ...parts.slice(0, i)), sub)) created++; else existed++;
        done.add(key);
      }
    } catch (e) { failed.push({ path: rel, reason: e instanceof Error ? e.message : String(e) }); }
  }
  return { root, rootMade, created, existed, failed };
}

/** Which of the folders exist, and the files lying loose in the project folder (names only, the first few). */
function status(a) {
  const { root, paths } = args(a);
  if (kind(root) !== 'dir') return { root, exists: false, present: [], missing: paths, looseFiles: [], looseCount: 0 };
  const present = [], missing = [];
  for (const rel of paths) {
    const parts = rel.split('/');
    let ok = true;
    for (let i = 1; ok && i <= parts.length; i++) ok = kind(path.join(root, ...parts.slice(0, i))) === 'dir';
    (ok ? present : missing).push(rel);
  }
  const loose = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isFile() && !d.name.startsWith('.')).map((d) => d.name).sort();
  return { root, exists: true, present, missing, looseFiles: loose.slice(0, MAX.looseFiles), looseCount: loose.length };
}

/** An existing real folder to show in the file manager; throws otherwise. */
/** How many files each folder holds, its subfolders included (C6 renamed, C8 left untouched): counted only,
 * never opened, and their names are not returned. No link is followed. -1 when the folder is not there;
 * at most MAX.countFiles per folder (the count then reads as "at least"). */
function fileCounts(a) {
  const { root, paths } = args(a);
  if (paths.length > MAX.countPaths) fail('folder list');
  if (kind(root) !== 'dir') return paths.map(() => -1);
  return paths.map((rel) => {
    const top = path.join(root, ...rel.split('/'));
    let ok = true;
    const parts = rel.split('/');
    for (let i = 1; ok && i <= parts.length; i++) ok = kind(path.join(root, ...parts.slice(0, i))) === 'dir';
    if (!ok) return -1;
    let n = 0;
    const queue = [top];
    while (queue.length && n < MAX.countFiles) {
      const dir = queue.shift();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const d of entries) {
        if (d.isSymbolicLink()) continue;
        if (d.isFile()) { if (++n >= MAX.countFiles) break; } else if (d.isDirectory()) queue.push(path.join(dir, d.name));
      }
    }
    return n;
  });
}

function openable(root) {
  if (typeof root !== 'string' || root.length > MAX.rootChars || !path.isAbsolute(root)) fail('folder to open');
  const full = path.resolve(root);
  if (kind(full) !== 'dir') throw new Error('The project folder is not on this computer.');
  return full;
}

/** A save dialog's starting folder (spec F2): the folder when it is a real folder (not a link), else undefined. */
function startDir(dir) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) return undefined;
  try { return kind(path.resolve(dir)) === 'dir' ? path.resolve(dir) : undefined; } catch { return undefined; }
}

const PROJECT_FILE = /^[^\\/:*?"<>|]+\.(lvds|json)$/i;

/** Copies a saved project file into a folder inside the project folder (decision 1, option B):
 * { root, relDir, fileName } as for create, and the full path of the file to copy. The project folder must
 * exist; missing folders inside it are made. The copy is written to a new temporary file beside it and then
 * renamed over the old copy, so a copy is never half written; only a file of exactly that name in that
 * folder is ever replaced, and never a link or a folder. */
function saveCopy(a, sourceFile) {
  if (typeof a !== 'object' || a === null) fail('project file copy');
  const { root, paths } = args({ root: a.root, paths: [a.relDir] });
  const rel = paths[0];
  const fileName = segment(a.fileName);
  if (!PROJECT_FILE.test(fileName) || fileName.startsWith('.')) fail(`project file name "${String(a.fileName).slice(0, 40)}"`);
  if (root.length + 1 + rel.length + 1 + fileName.length > MAX.pathChars) fail(`file path longer than ${MAX.pathChars} characters`);
  if (typeof sourceFile !== 'string' || !path.isAbsolute(sourceFile)) fail('project file to copy');
  const st = fs.lstatSync(sourceFile);
  if (!st.isFile()) fail('project file to copy: not a plain file');
  if (kind(root) !== 'dir') throw new Error('The project folder is not on this computer.');
  const parts = rel.split('/');
  for (let i = 1; i <= parts.length; i++) make(path.join(root, ...parts.slice(0, i)), parts.slice(0, i).join('/'));
  const dir = path.join(root, ...parts);
  const target = path.join(dir, fileName);
  const there = kind(target);
  if (there !== 'none' && there !== 'a file') throw new Error(`${rel}/${fileName} is ${there}; it is left as it is.`);
  const tmp = path.join(dir, `.${fileName}.${process.pid}.${Date.now().toString(36)}.tmp`);
  const data = fs.readFileSync(sourceFile);
  try {
    fs.writeFileSync(tmp, data, { flag: 'wx' });
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* not made */ }
    throw e;
  }
  return { file: target };
}

module.exports = { MAX, args, create, status, fileCounts, openable, startDir, saveCopy };
