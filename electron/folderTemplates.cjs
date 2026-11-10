// The user's folder templates: folder-templates.json in the app's settings folder. Plain Node, unit tested
// in a temporary folder (src/model/folderTemplatesStore.test.ts). Built-in templates are in the app's code
// and never stored here. Every template is checked field by field (ipcValidate.cjs) on the way in and when
// the file is read; the file is replaced atomically and never followed through a link.
//
// File: { format: 'lv-folder-templates', formatVersion: 1, defaultId?: string, templates: FolderTemplate[] }

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const check = require('./ipcValidate.cjs');
const { LIMITS, readJsonLimited, assertTextWithin } = require('./limits.cjs');
const { replaceFile, copyFileNoFollow } = require('./safeFs.cjs');

const FILE = 'folder-templates.json';
const FORMAT = 'lv-folder-templates';
const fileIn = (dir) => path.join(dir, FILE);
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const newId = () => `user-${crypto.randomBytes(8).toString('hex')}`;

/** Templates from a parsed file; ones that fail the checks are left out and counted. */
function cleanList(list, { reId = false } = {}) {
  const templates = [];
  let skipped = 0;
  for (const t of Array.isArray(list) ? list : []) {
    try {
      const c = check.folderTemplate(t);
      if (reId) c.id = newId();
      else check.folderTemplateId(c.id);
      templates.push(c);
    } catch { skipped++; }
  }
  return { templates, skipped };
}

/** What the file holds. A missing file is an empty list; a damaged one is reported, not overwritten blindly. */
function read(dir) {
  const file = fileIn(dir);
  if (!fs.existsSync(file)) return { templates: [], defaultId: null, skipped: 0 };
  let data;
  try {
    data = readJsonLimited(file, LIMITS.folderTemplatesBytes, 'The folder templates file');
  } catch (e) {
    return { templates: [], defaultId: null, skipped: 0, error: `${FILE} could not be read: ${e.message}`, damaged: true };
  }
  if (!isObj(data) || data.format !== FORMAT) return { templates: [], defaultId: null, skipped: 0, error: `${FILE} is not a folder templates file.`, damaged: true };
  const { templates, skipped } = cleanList(data.templates);
  const defaultId = typeof data.defaultId === 'string' && data.defaultId.length <= 80 ? data.defaultId : null;
  return { templates, defaultId, skipped };
}

function write(dir, state) {
  const file = fileIn(dir);
  const cur = read(dir);
  if (cur.damaged) {
    // Kept for the user; a link or an oversized file is not copied (the link itself is replaced below).
    try { copyFileNoFollow(file, `${file}.damaged`, LIMITS.folderTemplatesBytes, { mode: 'private' }); } catch { /* nothing to keep */ }
  }
  const text = `${JSON.stringify({ format: FORMAT, formatVersion: 1, ...(state.defaultId ? { defaultId: state.defaultId } : {}), templates: state.templates }, null, 2)}\n`;
  assertTextWithin(text, LIMITS.folderTemplatesBytes, 'The folder templates file');
  replaceFile(file, text);
  return read(dir);
}

/** Saves a user template (new or changed): its version goes up by one and it gets today's date. */
function save(dir, template, now = new Date()) {
  const t = check.folderTemplate(template);
  check.folderTemplateId(t.id);
  const cur = read(dir);
  const old = cur.templates.find((x) => x.id === t.id);
  const saved = { ...t, version: (old?.version ?? 0) + 1, editedAt: now.toISOString().slice(0, 10) };
  const templates = old ? cur.templates.map((x) => (x.id === t.id ? saved : x)) : [...cur.templates, saved];
  if (templates.length > LIMITS.folderTemplatesCount) throw new Error(`Refused: more than ${LIMITS.folderTemplatesCount} folder templates`);
  return write(dir, { ...cur, templates });
}

/** Removes a user template (projects keep their own copy). Clears the default when it was the default. */
function remove(dir, id) {
  check.folderTemplateId(id);
  const cur = read(dir);
  return write(dir, { templates: cur.templates.filter((x) => x.id !== id), defaultId: cur.defaultId === id ? null : cur.defaultId });
}

/** The template new projects start from: a user template's id or a built-in's; null for the app's default. */
function setDefault(dir, id) {
  if (id !== null && (typeof id !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(id))) throw new Error('Refused: default template id');
  return write(dir, { ...read(dir), defaultId: id });
}

/** Adds the templates in a JSON text: a templates file, a list, or one template. Each gets a new id (so an
 * import never replaces a template) and "(imported)" when its name is taken. */
function importText(dir, text, now = new Date()) {
  if (typeof text !== 'string') throw new Error('Refused: templates to import');
  assertTextWithin(text, LIMITS.folderTemplatesBytes, 'The templates file');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('The file is not JSON.'); }
  const list = isObj(data) && Array.isArray(data.templates) ? data.templates : Array.isArray(data) ? data : [data];
  const { templates, skipped } = cleanList(list, { reId: true });
  if (!templates.length) throw new Error(skipped ? `None of the ${skipped} templates in the file could be read.` : 'The file has no folder templates.');
  const cur = read(dir);
  const names = new Set(cur.templates.map((x) => x.name.toLowerCase()));
  const day = now.toISOString().slice(0, 10);
  const added = templates.map((t) => {
    const name = names.has(t.name.toLowerCase()) ? `${t.name} (imported)`.slice(0, 120) : t.name;
    names.add(name.toLowerCase());
    return { ...t, name, editedAt: day };
  });
  if (cur.templates.length + added.length > LIMITS.folderTemplatesCount) throw new Error(`Refused: more than ${LIMITS.folderTemplatesCount} folder templates`);
  return { ...write(dir, { ...cur, templates: [...cur.templates, ...added] }), added: added.length, skipped };
}

/** The JSON text of templates to share (built-in ones included, as plain templates). */
function exportText(args) {
  const { templates } = check.folderTemplatesExportArgs(args);
  return `${JSON.stringify({ format: FORMAT, formatVersion: 1, templates }, null, 2)}\n`;
}

module.exports = { FILE, FORMAT, read, save, remove, setDefault, importText, exportText };
