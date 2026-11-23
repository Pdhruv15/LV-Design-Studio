// File handling for projects and recovery copies. Plain Node (no Electron), so
// it can be unit tested in a temporary folder (src/model/projectFiles.test.ts).
const fs = require('node:fs');
const path = require('node:path');
const { LIMITS, readTextFileLimited, readJsonLimited } = require('./limits.cjs');
const { isLink, assertNotLink, readFileNoFollow, writeNewFile, replaceFile, copyFileNoFollow, ensureRealDir, listFiles, tempNameFor, publicModeFor, PRIVATE_FILE } = require('./safeFs.cjs');

/** Whether a name exists in the folder at all (a link counts, even a broken one; nothing is followed). */
const lexists = (full) => { try { fs.lstatSync(full); return true; } catch { return false; } };
const crypto = require('node:crypto');

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

// ---- The project file: name.lvds ------------------------------------------------
// The native format is the project as JSON text with "format": "lvds.project" first (schemaVersion is its
// version). Projects saved before it are name.json with the same content: still listed and opened, and saved
// as name.lvds from then on.
const PROJECT_EXT = '.lvds';
const PROJECT_FORMAT = 'lvds.project';
const PROJECT_FILE = /\.(lvds|json)$/i;
const isProjectFile = (file) => PROJECT_FILE.test(file);
const stemOf = (file) => file.replace(PROJECT_FILE, '');
/** The text of a project file. */
const projectText = (data) => JSON.stringify(Object.assign({ format: PROJECT_FORMAT }, data, { format: PROJECT_FORMAT }), null, 2);
/** Whether a project file of either kind, or drawn work of one, has this name (without extension) in the folder. */
const stemTaken = (folder, stem) => lexists(path.join(folder, `${stem}${PROJECT_EXT}`)) || lexists(path.join(folder, `${stem}.json`)) || lexists(path.join(folder, `${stem}${PLAN_EXT}`));

// ---- The drawn work beside it: name.lvplan ------------------------------------------
// What is drawn in Design CAD is kept in name.lvplan beside name.lvds (src/model/planPackage.ts makes and reads it), and
// the project file links to it: "plan": { file, sha256, version }. Only a .lvds has one; an older .json never does.
const PLAN_EXT = '.lvplan';
const PLAN_VERSION = 1; // lvds.plan version, as PLAN_VERSION in src/model/planPackage.ts
const PLAN_NAME = /^[^\\/:*?"<>|]+\.lvplan$/i;
/** The drawn work file of a .lvds project file; undefined for an older .json. */
const planFileOf = (file) => (file.toLowerCase().endsWith(PROJECT_EXT) ? `${stemOf(file)}${PLAN_EXT}` : undefined);
/** The project file's link to its drawn work, when it has one this app wrote. */
function planLinkOf(data) {
  const l = data && data.plan;
  return l && typeof l === 'object' && typeof l.file === 'string' && typeof l.sha256 === 'string' && /^[0-9a-f]{64}$/.test(l.sha256) ? l : undefined;
}
/** A file's content when it is a plain file within the size limit; undefined when it is missing, a link or too large. */
const fileBytes = (full) => bestEffort(`read ${path.basename(full)}`, () => readFileNoFollow(full, { max: LIMITS.projectBytes }).buffer);
/** SHA-256 of a file's bytes; null when there is no such plain file. */
const fileSha = (full) => { const b = full && fileBytes(full); return b ? sha(b) : null; };

/** The drawn work a project file links to: whichever of name.lvplan and name.lvplan.bak (then the file the link names,
 * and its .bak) has the SHA-256 the link records. A save writes the .lvplan before the project file, so after a crash
 * or a sync tool that delivered one file but not the other, the .bak is the copy that matches. undefined when no copy
 * does: the app then opens the project without its drawings, and nothing is saved over them. */
function readPlanFor(dir, file, link) {
  const names = [planFileOf(file), PLAN_NAME.test(link.file) && !link.file.startsWith('.') ? link.file : undefined].filter(Boolean);
  for (const n of [...new Set(names)]) {
    for (const f of [n, `${n}.bak`]) {
      const b = fileBytes(path.join(dir, f));
      if (b && sha(b) === link.sha256) return b;
    }
  }
  return undefined;
}

/** stampOf the project file, with the SHA-256 of its drawn work file beside it (null when there is none). */
function projectStampOf(full) {
  const s = stampOf(full);
  const plan = planFileOf(path.basename(full));
  return s && { ...s, plan: plan ? fileSha(path.join(path.dirname(full), plan)) : null };
}

/** A step that may fail without stopping the operation it belongs to (a backup copy, a cache, a
 * cleanup). A file that is not there is expected and stays quiet; any other failure is logged with
 * what was being done, never swallowed. Returns the step's result, or undefined when it failed. */
function bestEffort(what, fn) {
  try {
    return fn();
  } catch (e) {
    if (!(e && e.code === 'ENOENT')) console.warn(`[projects] ${what}: ${e && e.message ? e.message : e}`);
    return undefined;
  }
}

/** What a file is right now: modified time, size and a hash of its content. null when it does not exist. */
function stampOf(full) {
  try {
    const st = fs.lstatSync(full);
    if (!st.isFile()) return null;
    return { mtimeMs: st.mtimeMs, size: st.size, hash: sha(readTextFileLimited(full, LIMITS.projectBytes, path.basename(full))) };
  } catch {
    return null;
  }
}

/** Whether a save may go ahead. `expected` is what the file was when this app opened or last saved it;
 * `disk` is what it is now. A file that is missing, or whose content is what we expect (even if a sync
 * tool touched its date), is safe to write. Anything else was changed by someone else: a conflict. */
function decideSave(expected, disk, nextPlan) {
  if (!disk || !expected) return 'write';
  if (expected.hash !== disk.hash) return 'conflict';
  // The drawn work beside it was changed by someone else (or a sync tool delivered it first): not written over either.
  // A stamp from before name.lvplan has no plan; a drawn work file that is gone is safe to write.
  if (expected.plan !== undefined && disk.plan != null && disk.plan !== expected.plan && disk.plan !== nextPlan) return 'conflict';
  return 'write';
}

/** Writes a file safely: to a temporary file first, flushed to disk, then renamed over the old one (a
 * crash or a sync mid-write never leaves a half-written file). The previous version is kept as
 * name.lvds.bak. With keepTheirs the previous version is also kept under its own timestamped name (an
 * overwrite after a conflict). The result is read back and checked before it is reported as saved. */
function writeFileSafe(full, text, opts = {}) {
  const { keepBackup = true, keepTheirs = false, verifyJson = false, mode = 'public' } = opts;
  assertNotLink(full); // never write through a link at the project's name
  // A new private temp file with a random name (created exclusively, so nothing planted there is used);
  // the finished file keeps the permissions the project file had (recovery copies stay private).
  const finalMode = mode === 'public' ? publicModeFor(full) : PRIVATE_FILE;
  const tmp = tempNameFor(full);
  writeNewFile(tmp, text);
  try {
    if (finalMode !== PRIVATE_FILE) fs.chmodSync(tmp, finalMode);
    if (lexists(full)) {
      // Backups are new files renamed into place: a link at name.lvds.bak is replaced, never written through.
      if (keepBackup) bestEffort(`backup copy of ${path.basename(full)}`, () => copyFileNoFollow(full, `${full}.bak`, LIMITS.projectBytes));
      if (keepTheirs) bestEffort(`copy of the other version of ${path.basename(full)}`, () => copyFileNoFollow(full, `${full}.theirs-${Date.now()}.bak`, LIMITS.projectBytes));
    }
    fs.renameSync(tmp, full);
  } catch (e) {
    bestEffort('remove the temporary file', () => fs.unlinkSync(tmp));
    throw e;
  }
  const back = readFileNoFollow(full).buffer;
  if (sha(back) !== sha(text)) throw new Error('The file was written but reading it back did not match; it may not have been saved correctly.');
  if (verifyJson) JSON.parse(back.toString('utf-8'));
  return stampOf(full);
}

/** Saves a project file with its drawn work: name.lvplan first (written only when it is not already what is on disk),
 * then the project file with the link to it, so a crash between the two leaves a pair that still opens (readPlanFor).
 * `plan` is the .lvplan's bytes. Without them the project is written as given: with no link, or with the link it kept
 * because its drawn work could not be read (nothing is written over that drawn work). Returns projectStampOf. */
function saveProjectPair(full, data, plan, { keepTheirs = false } = {}) {
  let out = data;
  const name = planFileOf(path.basename(full));
  const planFull = name && path.join(path.dirname(full), name);
  if (plan) {
    if (!planFull) throw new Error(`${path.basename(full)} is not a .lvds project file, so it cannot keep drawn work beside it.`);
    const sha256 = sha(plan);
    if (fileSha(planFull) !== sha256) writeFileSafe(planFull, plan, { keepTheirs });
    out = { ...data, plan: { file: name, sha256, version: PLAN_VERSION } };
  }
  writeFileSafe(full, projectText(out), { keepTheirs, verifyJson: true });
  return projectStampOf(full);
}

/** name.lvds, or name-2.lvds, name-3.lvds … when that name is taken (by a .lvds or an older .json). */
function uniqueFileName(folder, base) {
  let stem = base, n = 2;
  while (stemTaken(folder, stem)) stem = `${base}-${n++}`;
  return `${stem}${PROJECT_EXT}`;
}

/** The name a project file is saved under: its own when it is a .lvds, else the .lvds that takes its place. */
function nativeFileName(folder, file) {
  if (file.toLowerCase().endsWith(PROJECT_EXT)) return file;
  const stem = stemOf(file);
  return lexists(path.join(folder, `${stem}${PROJECT_EXT}`)) ? uniqueFileName(folder, stem) : `${stem}${PROJECT_EXT}`;
}

/** A project file chosen anywhere (Open project…, or opened from Explorer / Finder): inside the projects folder
 * it opens as that file; elsewhere its content opens as a new, unsaved project (Save then keeps it in the
 * projects folder). */
function pickedProject(folder, full) {
  const name = path.basename(full);
  if (path.dirname(path.resolve(full)) === path.resolve(folder)) return { file: name };
  let data;
  try { data = readJsonLimited(full, LIMITS.projectBytes, name, { follow: true }); } catch (e) { throw new Error(`${name} could not be read as a project (${e.message}).`); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.boards) || !Array.isArray(data.feeders)) throw new Error(`${name} is not an LV Design Studio project.`);
  const link = planLinkOf(data);
  const plan = link && readPlanFor(path.dirname(path.resolve(full)), name, link);
  return plan ? { data, from: full, plan } : { data, from: full };
}

/** After an older name.json was saved as `native`: the .json becomes the backup of the new file (never a
 * second project in the list). */
function retireOldFile(folder, file, native) {
  if (file === native) return;
  assertNotLink(path.join(folder, file), file);
  bestEffort(`keep ${file} as the backup of ${native}`, () => fs.renameSync(path.join(folder, file), path.join(folder, `${native}.bak`)));
}

/** Files that look like a sync tool's conflicted copy of another project file in the same list
 * ("x (John's conflicted copy 2026-10-05).lvds", "x (1).lvds", "x.sync-conflict-….lvds"; .json alike).
 * Maps each such file to the file it conflicts with (which must exist). */
function conflictSiblings(files) {
  const have = new Set(files.map((f) => f.toLowerCase()));
  const out = {};
  const patterns = [/^(.+?) \([^)]*conflicted copy[^)]*\)$/i, /^(.+?)\.sync-conflict-[\w-]+$/i, /^(.+?) \(\d+\)$/];
  for (const f of files) {
    const name = stemOf(f), ext = f.slice(name.length);
    for (const re of patterns) {
      const m = name.match(re);
      const of = m && [`${m[1]}${ext}`, `${m[1]}${PROJECT_EXT}`, `${m[1]}.json`].find((o) => have.has(o.toLowerCase()) && o.toLowerCase() !== f.toLowerCase());
      if (of) { out[f] = of; break; }
    }
  }
  return out;
}

// ---- Recovery copies of unsaved work: one file per project -------------------

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
const recoveryFile = (dir, id) => path.join(dir, `${safeId(id)}.json`);

function writeRecovery(dir, r) {
  const id = r && (r.projectId || (r.project && r.project.id));
  if (!id) throw new Error('A recovery copy needs a project id');
  ensureRealDir(dir);
  writeFileSafe(recoveryFile(dir, id), JSON.stringify({ ...r, projectId: id }), { keepBackup: false, mode: 'private' });
  return true;
}

function clearRecovery(dir, id) {
  bestEffort('remove the recovery copy', () => fs.unlinkSync(recoveryFile(dir, id)));
  return true;
}

/** Every recovery copy, newest first. An older single-file recovery (before one per project) is moved
 * into the folder. A copy whose project file was changed after the copy was made is flagged
 * (fileChangedSince), never dropped: the user decides. */
function readRecoveries(dir, projectsFolder, legacyFile) {
  if (legacyFile && lexists(legacyFile) && !isLink(legacyFile)) {
    bestEffort('move the older recovery copy', () => {
      const old = readJsonLimited(legacyFile, LIMITS.projectBytes, 'the older recovery copy');
      if (old && old.project) writeRecovery(dir, { ...old, projectId: (old.project && old.project.id) || 'legacy-single' });
    });
    bestEffort('remove the older recovery copy', () => fs.unlinkSync(legacyFile));
  }
  let names = [];
  if (isLink(dir)) return []; // not the app's recovery folder
  try { names = listFiles(dir, (f) => f.endsWith('.json')); } catch { return []; }
  const list = [];
  for (const f of names) {
    const r = bestEffort(`read recovery copy ${f}`, () => readJsonLimited(path.join(dir, f), LIMITS.projectBytes, f));
    if (!r || !r.project || !Array.isArray(r.project.boards)) continue;
    // The project file may be gone (moved or deleted): then it has not changed since.
    const st = r.file && projectsFolder ? bestEffort(`check ${r.file}`, () => fs.lstatSync(path.join(projectsFolder, path.basename(String(r.file))))) : undefined;
    list.push({ ...r, fileChangedSince: st ? st.mtimeMs > r.at : false });
  }
  return list.sort((a, b) => b.at - a.at);
}

// ---- The projects list (what the dashboard shows), with a cache --------------

/** What the dashboard shows about a project file. Keep in step with metaOf in src/model/projectStore.ts
 * (a test compares them). */
function metaFromProject(file, p, updatedAt) {
  const revs = Array.isArray(p.revisions) ? p.revisions : [];
  return {
    file,
    id: p.id,
    name: p.name || stemOf(file),
    updatedAt,
    status: p.status,
    owner: p.info && p.info.owner,
    consultant: p.info && p.info.consultant,
    contractor: p.info && p.info.contractor,
    plotNo: p.info && p.info.plotNo,
    area: p.info && p.info.area,
    revision: revs.length ? revs[revs.length - 1].id : undefined,
    updatedBy: p.updatedBy,
    boards: Array.isArray(p.boards) ? p.boards.length : undefined,
    createdAt: p.createdAt,
    archivedAt: p.archivedAt,
    tags: Array.isArray(p.tags) && p.tags.length ? p.tags : undefined
  };
}

/** The list of project files with their details. Each file is read and parsed only when its modified time or
 * size changed since the cache (a JSON file next to the app's data) was written, so a long list of large
 * projects opens quickly. Returns { list, parsed } (parsed = how many files were actually read). */
function listProjectsMeta(folder, cachePath) {
  let cache = {};
  cache = bestEffort('read the project list cache', () => readJsonLimited(cachePath, LIMITS.settingsBytes * 16, 'the project list cache')) || {};
  const files = listFiles(folder, isProjectFile); // regular files only: links are not listed
  const next = {};
  let parsed = 0;
  const list = files.map((f) => {
    const st = fs.lstatSync(path.join(folder, f));
    const c = cache[f];
    if (c && c.mtimeMs === st.mtimeMs && c.size === st.size) { next[f] = c; return { ...c.meta, updatedAt: st.mtimeMs }; }
    // A file that cannot be read is still listed, under its file name.
    let meta = bestEffort(`read ${f}`, () => metaFromProject(f, readJsonLimited(path.join(folder, f), LIMITS.projectBytes, f), st.mtimeMs));
    if (meta) parsed++;
    else meta = { file: f, name: stemOf(f), updatedAt: st.mtimeMs };
    next[f] = { mtimeMs: st.mtimeMs, size: st.size, meta };
    return { ...meta };
  });
  const siblings = conflictSiblings(files);
  for (const m of list) if (siblings[m.file]) m.conflictOf = siblings[m.file];
  if (JSON.stringify(Object.keys(next).sort()) !== JSON.stringify(Object.keys(cache).sort()) || parsed) bestEffort('write the project list cache', () => replaceFile(cachePath, JSON.stringify(next)));
  return { list: list.sort((a, b) => b.updatedAt - a.updatedAt), parsed };
}

// ---- Trash: a deleted project stays recoverable for a while -------------------

const TRASH = '.trash';
const TRASH_DAYS = 30;
const trashDir = (folder) => path.join(folder, TRASH);
const trashName = (file, at) => `${at}__${file}`;
const splitTrashName = (name) => { const m = name.match(/^(\d+)__(.+)$/); return m ? { deletedAt: Number(m[1]), file: m[2] } : null; };

/** Moves a project file (and its .bak) to the trash folder. */
function moveToTrash(folder, file, now = Date.now()) {
  assertNotLink(path.join(folder, file));
  const dir = ensureRealDir(trashDir(folder));
  const name = trashName(file, now);
  fs.renameSync(path.join(folder, file), path.join(dir, name));
  bestEffort(`move ${file}.bak to the trash`, () => fs.renameSync(path.join(folder, `${file}.bak`), path.join(dir, `${name}.bak`)));
  const plan = planFileOf(file); // its drawn work goes with it, under the same time
  if (plan) for (const f of [plan, `${plan}.bak`]) moveIfPlain(path.join(folder, f), path.join(dir, trashName(f, now)), `move ${f} to the trash`);
  return name;
}

/** Renames a file that is there and is not a link (a link is never moved, opened or deleted). */
function moveIfPlain(from, to, what) {
  bestEffort(what, () => { if (lexists(from)) { assertNotLink(from, path.basename(from)); fs.renameSync(from, to); } });
}

/** Deleted projects, newest first, with their name and when they will be removed for good. */
function listTrash(folder, now = Date.now()) {
  let names = [];
  if (isLink(trashDir(folder))) return []; // not the app's trash folder
  try { names = listFiles(trashDir(folder), isProjectFile); } catch { return []; }
  const out = [];
  for (const n of names) {
    const parts = splitTrashName(n);
    if (!parts) continue;
    let name = stemOf(parts.file), id;
    const p = bestEffort(`read deleted project ${n}`, () => readJsonLimited(path.join(trashDir(folder), n), LIMITS.projectBytes, n));
    if (p) { if (p.name) name = p.name; id = p.id; }
    out.push({ trashFile: n, file: parts.file, name, id, deletedAt: parts.deletedAt, daysLeft: Math.max(0, Math.ceil(TRASH_DAYS - (now - parts.deletedAt) / 86400000)) });
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Puts a deleted project back in the projects folder (under a new name if the old one is taken). */
function restoreFromTrash(folder, trashFile) {
  const parts = splitTrashName(path.basename(trashFile));
  if (!parts) throw new Error(`Not a deleted project: ${trashFile}`);
  if (isLink(trashDir(folder))) throw new Error('The trash folder is a link; nothing is restored from it.');
  const src = path.join(trashDir(folder), path.basename(trashFile));
  assertNotLink(src, path.basename(trashFile));
  if (!lexists(src)) throw new Error(`Not a deleted project: ${trashFile}`);
  const file = stemTaken(folder, stemOf(parts.file)) ? uniqueFileName(folder, stemOf(parts.file)) : parts.file;
  fs.renameSync(src, path.join(folder, file));
  bestEffort(`restore ${file}.bak`, () => fs.renameSync(`${src}.bak`, path.join(folder, `${file}.bak`)));
  // Its drawn work under the name the project now has (its link names the old one; readPlanFor looks here first).
  const from = planFileOf(parts.file), to = planFileOf(file);
  if (from && to) for (const [a, b] of [[from, to], [`${from}.bak`, `${to}.bak`]]) moveIfPlain(path.join(trashDir(folder), trashName(a, parts.deletedAt)), path.join(folder, b), `restore ${b}`);
  return file;
}

/** Removes what has been in the trash longer than `days` (all of it when days is 0). Returns how many. */
function purgeTrash(folder, days = TRASH_DAYS, now = Date.now()) {
  let n = 0;
  let names = [];
  // A trash folder that is a link is left alone: removing files through it would delete them elsewhere.
  if (isLink(trashDir(folder))) return 0;
  try { names = fs.readdirSync(trashDir(folder)); } catch { return 0; }
  for (const f of names) {
    const parts = splitTrashName(f.replace(/\.bak$/, ''));
    if (!parts) continue;
    if (days === 0 || now - parts.deletedAt > days * 86400000) {
      if (bestEffort(`remove ${f} from the trash`, () => { fs.unlinkSync(path.join(trashDir(folder), f)); return true; }) && isProjectFile(f)) n++;
    }
  }
  return n;
}

module.exports = { bestEffort, metaFromProject, PLAN_EXT, PLAN_VERSION, planFileOf, planLinkOf, readPlanFor, projectStampOf, saveProjectPair, fileSha, listProjectsMeta, moveToTrash, listTrash, restoreFromTrash, purgeTrash, TRASH_DAYS, sha, stampOf, decideSave, writeFileSafe, uniqueFileName, nativeFileName, retireOldFile, pickedProject, isProjectFile, stemOf, projectText, PROJECT_EXT, PROJECT_FORMAT, conflictSiblings, writeRecovery, clearRecovery, readRecoveries, recoveryFile };
