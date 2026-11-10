// Checks on what the renderer sends over IPC. The renderer is the app's own code, but it shows content from
// project files and workbooks, so the main process does not trust payload shapes: each handler takes only
// the fields it needs, of the type it expects, and anything else is refused with a plain message.

const path = require('node:path');
const { LIMITS, assertTextWithin, assertJsonWithin } = require('./limits.cjs');

const LOG_ENTRY_CHARS = 32 * 1024;
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (what) => { throw new Error(`Refused: ${what}`); };

/** A file name for a save dialog's default: the last path part only, no control characters. */
function defaultFileName(v, fallback = 'export') {
  const s = typeof v === 'string' ? [...path.basename(v.replace(/\\/g, '/'))].filter((c) => c >= ' ' && !'<>:"|?*'.includes(c)).join('').trim() : '';
  return s && s !== '.' && s !== '..' ? s.slice(0, 200) : fallback;
}

/** Save-dialog filter: a short label and 1–10 plain extensions. */
function fileFilter(name, extensions) {
  if (!Array.isArray(extensions) || !extensions.length || extensions.length > 10 || !extensions.every((e) => typeof e === 'string' && /^[a-z0-9]{1,10}$/i.test(e))) fail('file type list');
  return { name: typeof name === 'string' && name.trim() ? name.slice(0, 80) : 'File', extensions };
}

function saveTextArgs(a) {
  if (!isObj(a) || typeof a.content !== 'string') fail('text export without text content');
  assertTextWithin(a.content, LIMITS.textExportBytes, 'The export');
  return { defaultName: defaultFileName(a.defaultName), content: a.content, filter: fileFilter(a.filterName, a.extensions) };
}

function saveBinaryArgs(a) {
  if (!isObj(a) || !(ArrayBuffer.isView(a.bytes) || a.bytes instanceof ArrayBuffer)) fail('binary export without bytes');
  if (a.bytes.byteLength === 0) fail('empty binary export');
  if (a.bytes.byteLength > LIMITS.binaryExportBytes) fail(`export larger than ${Math.round(LIMITS.binaryExportBytes / 1048576)} MB`);
  return { defaultName: defaultFileName(a.defaultName), bytes: Buffer.from(ArrayBuffer.isView(a.bytes) ? a.bytes.buffer.slice(a.bytes.byteOffset, a.bytes.byteOffset + a.bytes.byteLength) : a.bytes), filter: fileFilter(a.filterName, a.extensions) };
}

/** Design CAD Save over a copy saved earlier: an absolute DWG / DXF path, the bytes (as for saveBinary), and whether
 * the previous copy is kept as .bak. Whether the path may be written is the main process's (one the user chose). */
function overwriteBinaryArgs(a) {
  if (!isObj(a) || typeof a.file !== 'string' || !path.isAbsolute(a.file) || !/\.(dwg|dxf)$/i.test(a.file)) fail('overwrite without a drawing path');
  const { bytes } = saveBinaryArgs({ defaultName: 'x.dxf', bytes: a.bytes, filterName: 'Drawing', extensions: ['dxf'] });
  return { file: a.file, bytes, bak: !!a.bak };
}

const PAGE_SIZES = ['A4', 'A3', 'A3 portrait', 'A2', 'A1'];

/** HTML → PDF options: HTML text, a known sheet size, true/false flags. */
function pdfArgs(a) {
  if (!isObj(a) || typeof a.html !== 'string') fail('PDF without HTML content');
  if (!a.html.trim()) fail('PDF without HTML content');
  assertTextWithin(a.html, LIMITS.pdfHtmlBytes, 'The report');
  const pageSize = a.pageSize === undefined ? 'A4' : a.pageSize;
  if (!PAGE_SIZES.includes(pageSize)) fail(`PDF sheet size ${String(pageSize)}`);
  return { defaultName: defaultFileName(a.defaultName, 'report.pdf'), html: a.html, pageSize, landscape: a.landscape === undefined ? true : !!a.landscape, cssPages: !!a.cssPages };
}

/** Plot to a printer: the sheet's HTML, a printer name the system listed (checked again in main), 1–99 copies and a
 * known sheet size. */
function printArgs(a) {
  const { html, pageSize, landscape } = pdfArgs(a);
  if (typeof a.deviceName !== 'string' || !a.deviceName.trim() || a.deviceName.length > 256) fail('printing without a printer');
  const copies = Number.isInteger(a.copies) && a.copies >= 1 && a.copies <= 99 ? a.copies : fail('number of copies');
  return { html, pageSize, landscape, deviceName: a.deviceName, copies };
}

/** Project save: the project data must look like a project; file, expected and force as their types. */
function projectSaveArgs(a) {
  if (!isObj(a) || !isObj(a.data) || !Array.isArray(a.data.boards) || !Array.isArray(a.data.feeders)) fail('saving something that is not a project');
  if (a.file !== undefined && a.file !== null && typeof a.file !== 'string') fail('project file name');
  assertJsonWithin(a.data, LIMITS.projectBytes, 'The project');
  return { file: a.file || undefined, data: a.data, expected: a.expected, force: a.force === true };
}

/** An entry for the error log: text, cut to a sensible length. */
function logText(v) {
  if (typeof v !== 'string') fail('error log entry that is not text');
  return v.slice(0, LOG_ENTRY_CHARS);
}

function recoveryArgs(r) {
  if (!isObj(r) || !isObj(r.project) || !Array.isArray(r.project.boards)) fail('recovery copy without a project');
  assertJsonWithin(r, LIMITS.projectBytes, 'The recovery copy');
  return r;
}

const SCALAR = (v) => v === null || v === undefined || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'string';
const RESERVED = new Set(['__proto__', 'prototype', 'constructor']);

/** Workbook rows: at most 2,000 plain rows of plain values (text, numbers, true / false), each cell
 * and row of a sensible size. */
function workbookRows(bookId, rows) {
  if (typeof bookId !== 'string') fail('workbook name');
  if (!Array.isArray(rows) || !rows.every(isObj)) fail(`rows for ${bookId}`);
  if (rows.length > LIMITS.workbookRows) fail(`${rows.length} rows for ${bookId} (at most ${LIMITS.workbookRows})`);
  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length > LIMITS.workbookColumns) fail(`a row of ${bookId} with ${keys.length} fields`);
    for (const k of keys) {
      if (RESERVED.has(k) || k.length > 100) fail(`a field name in ${bookId}`);
      const v = row[k];
      if (!SCALAR(v)) fail(`a value in ${bookId} that is not text or a number`);
      if (typeof v === 'string' && v.length > LIMITS.workbookCellChars) fail(`a cell in ${bookId} longer than ${LIMITS.workbookCellChars} characters`);
    }
  }
  return rows;
}

function libraryData(d) {
  if (!isObj(d)) fail('library data');
  assertJsonWithin(d, LIMITS.libraryBytes, 'The library');
  return d;
}

/** External-engine request: one of the known engines, with what that engine needs. */
function engineRequest(r) {
  if (!isObj(r) || !['probe', 'opendss', 'pandapower'].includes(r.engine)) fail('unknown calculation engine');
  assertJsonWithin(r, LIMITS.engineRequestBytes, 'The engine request');
  if (r.engine !== 'probe' && !isObj(r.project)) fail('engine request without a project');
  if (r.engine === 'opendss' && typeof r.dss !== 'string') fail('OpenDSS request without a script');
  return r;
}

// ---- Folder templates (electron/folderTemplates.cjs) ----
// A template is rebuilt from the known fields only, so nothing else reaches the settings file. Folder names
// are single names: no path separators, no "." or "..", no control characters, so a template can never point
// outside the project folder. The "Subfolders on use" pattern may have "/" between parts, each a plain name.

const FT = Object.freeze({ maxFolders: 300, maxDepth: 16, nameChars: 120, idChars: 120, noteChars: 500, patternChars: 200, roles: 60 });
const WHEN = ['always', 'scope:pv', 'scope:standby', 'scope:fire', 'scope:elv', 'stage:tender', 'service:supervision', 'building:each'];
const DOC_TYPES = ['DWG', 'CAL', 'SCH', 'BOQ', 'SPC', 'TR', 'CRS', 'RFI', 'MOM'];
const str = (v, max, what) => (typeof v === 'string' && v.length <= max ? v : fail(what));
const optStr = (v, max, what) => (v === undefined ? undefined : str(v, max, what));
const oneOf = (v, list, what) => (v === undefined ? undefined : list.includes(v) ? v : fail(what));

/** One folder name: text, no separator, not "." / "..", no control character (other checks are the editor's). */
function folderName(v, what = 'folder name') {
  const s = str(v, FT.nameChars, what);
  if (!s.trim() || s === '.' || s === '..' || /[/\\]/.test(s) || [...s].some((c) => c < ' ')) fail(what);
  return s;
}

/** The id of a user template: "user-" and letters, digits and dashes (built-in ids are the app's own). */
function folderTemplateId(v) {
  if (typeof v !== 'string' || !/^user-[A-Za-z0-9-]{1,64}$/.test(v)) fail('folder template id');
  return v;
}

function folderTemplate(t) {
  if (!isObj(t)) fail('folder template');
  assertJsonWithin(t, LIMITS.folderTemplateBytes, 'The folder template');
  const ids = new Set();
  let count = 0;
  const node = (n, depth) => {
    if (!isObj(n)) fail('folder in the template');
    if (++count > FT.maxFolders) fail(`template with more than ${FT.maxFolders} folders`);
    if (depth > FT.maxDepth) fail(`template more than ${FT.maxDepth} folders deep`);
    const id = str(n.id, FT.idChars, 'folder id');
    if (!/^[A-Za-z0-9._-]+$/.test(id) || ids.has(id)) fail('folder id');
    ids.add(id);
    const out = { id, name: folderName(n.name) };
    if (n.role !== undefined) out.role = str(n.role, 40, 'folder role');
    if (n.roles !== undefined) {
      if (!Array.isArray(n.roles) || n.roles.length > FT.roles) fail('folder roles');
      out.roles = n.roles.map((r) => str(r, 40, 'folder role'));
    }
    if ([out.role, ...(out.roles ?? [])].some((r) => r !== undefined && !/^[A-Za-z][A-Za-z0-9]*$/.test(r))) fail('folder role');
    if (n.when !== undefined) out.when = oneOf(n.when, WHEN, 'folder condition');
    if (n.onUse !== undefined) {
      out.onUse = str(n.onUse, FT.patternChars, 'subfolder pattern');
      out.onUse.split('/').forEach((p) => folderName(p, 'subfolder pattern'));
    }
    if (n.note !== undefined) out.note = str(n.note, FT.noteChars, 'folder note');
    if (n.children !== undefined) {
      if (!Array.isArray(n.children)) fail('subfolders');
      out.children = n.children.map((c) => node(c, depth + 1));
    }
    return out;
  };
  if (!Array.isArray(t.folders)) fail('template without folders');
  const folders = t.folders.map((n) => node(n, 1));
  const g = isObj(t.naming) ? t.naming : fail('template without file naming');
  const naming = {
    preset: oneOf(g.preset, ['office', 'iso19650', 'simple', 'custom'], 'naming preset') ?? 'custom',
    pattern: str(g.pattern, FT.patternChars, 'naming pattern'),
    separator: oneOf(g.separator, ['-', '_', '.'], 'naming separator') ?? '-'
  };
  if (g.perType !== undefined) {
    if (!isObj(g.perType)) fail('naming per type');
    naming.perType = {};
    for (const [k, v] of Object.entries(g.perType)) {
      if (!DOC_TYPES.includes(k)) fail('naming document type');
      naming.perType[k] = str(v, FT.patternChars, 'naming pattern');
    }
  }
  if (g.upper !== undefined) naming.upper = !!g.upper;
  if (g.discipline !== undefined) naming.discipline = str(g.discipline, 10, 'discipline code');
  const out = {
    id: str(t.id, 80, 'template id'),
    name: str(t.name, FT.nameChars, 'template name').trim() || fail('template name'),
    version: Number.isInteger(t.version) && t.version >= 0 ? t.version : 1,
    root: folderName(t.root, 'project folder name'),
    naming,
    folders
  };
  if (!/^[A-Za-z0-9._-]+$/.test(out.id)) fail('template id');
  const opt = {
    basedOn: optStr(t.basedOn, FT.nameChars, 'based on'),
    editedAt: optStr(t.editedAt, 40, 'edited date'),
    layout: oneOf(t.layout, ['discipline', 'stage', 'building', 'iso19650', 'flat', 'blank'], 'template layout'),
    numbering: oneOf(t.numbering, ['01_', '1.', 'A-', 'none'], 'numbering style')
  };
  for (const [k, v] of Object.entries(opt)) if (v !== undefined) out[k] = v;
  if (t.repeat !== undefined) {
    const r = isObj(t.repeat) ? t.repeat : fail('repeat for');
    if (!Array.isArray(r.shared) || r.shared.length > 50) fail('shared folders');
    out.repeat = { source: oneOf(r.source, ['buildings', 'phases'], 'repeat source') ?? fail('repeat source'), name: folderName(r.name, 'repeated folder name'), shared: r.shared.map((s) => str(s, FT.idChars, 'shared folder')) };
  }
  return out;
}

/** Export: 1–200 templates (built-in ones too) and a default file name. */
function folderTemplatesExportArgs(a) {
  if (!isObj(a) || !Array.isArray(a.templates) || !a.templates.length || a.templates.length > LIMITS.folderTemplatesCount) fail('templates to export');
  return { templates: a.templates.map(folderTemplate), defaultName: defaultFileName(a.defaultName, 'folder-templates.json') };
}

/** Permissions the app's pages may be granted (everything else, e.g. camera, location, notifications, is denied). */
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write']);

module.exports = { defaultFileName, fileFilter, saveTextArgs, saveBinaryArgs, overwriteBinaryArgs, pdfArgs, printArgs, projectSaveArgs, recoveryArgs, logText, workbookRows, libraryData, engineRequest, folderTemplate, folderTemplateId, folderTemplatesExportArgs, ALLOWED_PERMISSIONS, PAGE_SIZES };
