import { pushLibrary } from '../database/librarySync';
import type { Project } from '../types';
import { MAX_COLS, MAX_ROWS, SHEET_PAPERS, type Sheet } from './sheets';

/** Your office's schedule formats: a linked sheet layout saved once and reused for other boards and other projects. Kept like the
 * other libraries: a working copy in this computer's storage, synced through LV Database/Library.json. */

export const FORMATS_KEY = 'lvds.scheduleFormats';
export const SCHEDULE_FORMAT_FILE = 'lvds-schedule-format';
export const SCHEDULE_FORMAT_FILE_VERSION = 1;
export const SCHEDULE_FORMAT_FILE_EXT = 'lvds-format';
export const MAX_SCHEDULE_FORMAT_FILE_BYTES = 2_000_000;

/** A linked sheet layout saved for reuse: your office's own schedule format. Compatibility helps discovery only;
 * it never changes project rules or calculations. `defaultFor` is this office's choice and is not shared in packages. */
export interface ScheduleFormat {
  id: string; name: string; category: 'db' | 'md'; sheet: Sheet; updatedAt: string; version?: number; // updatedAt: yyyy-mm-dd
  country?: string; authorityId?: string; defaultFor?: PanelCategory[];
}

export const formatVersion = <T extends object>(format: T & { version?: number }): number => Number.isInteger(format.version) && format.version! > 0 ? format.version! : 1;

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const strings = (x: unknown): x is Record<string, string> => obj(x) && Object.values(x).every((v) => typeof v === 'string');
const validSheet = (sheet: unknown): sheet is Sheet => {
  if (!obj(sheet) || typeof sheet.id !== 'string' || typeof sheet.name !== 'string' || !strings(sheet.cells)) return false;
  if (!Number.isInteger(sheet.rows) || !Number.isInteger(sheet.cols) || Number(sheet.rows) < 1 || Number(sheet.rows) > MAX_ROWS || Number(sheet.cols) < 1 || Number(sheet.cols) > MAX_COLS) return false;
  const link = sheet.link;
  if (!obj(link) || !['db', 'md'].includes(String(link.category)) || !obj(link.cells) || !strings(link.columns) || !Number.isInteger(link.firstRow) || !Array.isArray(link.rows) || !link.rows.every((x) => typeof x === 'string')) return false;
  if (Number(link.firstRow) < 1 || Number(link.firstRow) > MAX_ROWS || link.rows.length > MAX_ROWS) return false;
  if (!Object.values(link.cells).every((v) => obj(v) && typeof v.field === 'string' && (v.before === undefined || typeof v.before === 'string') && (v.after === undefined || typeof v.after === 'string'))) return false;
  if (link.mode !== undefined && !['output', 'linked'].includes(String(link.mode))) return false;
  if (sheet.paper !== undefined && !SHEET_PAPERS.some((p) => p.key === sheet.paper)) return false;
  return true;
};

const isFormat = (x: unknown): x is ScheduleFormat => {
  const f = x as ScheduleFormat;
  const defaults = f?.defaultFor;
  return !!f && typeof f === 'object' && typeof f.id === 'string' && !!f.id && typeof f.name === 'string' && !!f.name
    && ['db', 'md'].includes(String(f.category ?? f.sheet?.link?.category))
    && (f.version === undefined || (Number.isInteger(f.version) && f.version > 0))
    && (f.country === undefined || (typeof f.country === 'string' && !!f.country.trim()))
    && (f.authorityId === undefined || (typeof f.authorityId === 'string' && !!f.authorityId.trim()))
    && !(f.country && f.authorityId)
    && (defaults === undefined || (Array.isArray(defaults) && defaults.every((c) => PANEL_CATEGORIES.some((p) => p.key === c && p.kind === (f.category ?? f.sheet?.link?.category)))))
    && validSheet(f.sheet);
};

/** Your formats on this computer (synced from Library.json). */
export function loadFormats(): ScheduleFormat[] {
  try {
    const v = JSON.parse(localStorage.getItem(FORMATS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isFormat).map((f) => ({ ...f, category: f.sheet.link!.category ?? f.category ?? 'db', version: formatVersion(f) })) : [];
  } catch { return []; }
}
export function saveFormats(list: ScheduleFormat[]): void {
  try { localStorage.setItem(FORMATS_KEY, JSON.stringify(list)); void pushLibrary(); } catch { /* storage full or blocked */ }
}

/** Why a format name is not accepted (the format `exceptId` is not counted as another). */
export function formatNameError(name: string, list: ScheduleFormat[], exceptId?: string): string | undefined {
  const t = name.trim();
  if (!t) return 'Give the format a name.';
  if (t.length > 60) return 'Keep the name to 60 characters.';
  if (list.some((f) => f.id !== exceptId && f.name.trim().toLowerCase() === t.toLowerCase())) return 'Another format has this name.';
  return undefined;
}

const newId = () => `fmt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The list with the format saved: one of that name (case ignored) gets the new sheet and date, else a new one is added. */
export function withFormat(list: ScheduleFormat[], name: string, template: Sheet, at = new Date()): { list: ScheduleFormat[]; updated: boolean } {
  const t = name.trim(), updatedAt = at.toISOString().slice(0, 10), same = list.find((f) => f.name.trim().toLowerCase() === t.toLowerCase());
  const category = template.link?.category ?? 'db';
  if (same) return { list: list.map((f) => (f === same ? { ...f, category, sheet: template, updatedAt, version: formatVersion(f) + 1 } : f)), updated: true };
  return { list: [...list, { id: newId(), name: t, category, sheet: template, updatedAt, version: 1 }], updated: false };
}
export const renameFormat = (list: ScheduleFormat[], id: string, name: string): ScheduleFormat[] => list.map((f) => (f.id === id ? { ...f, name: name.trim() } : f));
export const removeFormat = (list: ScheduleFormat[], id: string): ScheduleFormat[] => list.filter((f) => f.id !== id);

// ---- discovery and office defaults

export interface ScheduleFormatContext { country?: string; authorityId?: string }

/** How closely a format fits a project: authority, then country, then a General format. Zero means another context. */
export function formatMatchRank(format: ScheduleFormat, context: ScheduleFormatContext): number {
  if (format.authorityId) return format.authorityId === context.authorityId ? 3 : 0;
  if (format.country) return format.country === context.country ? 2 : 0;
  return 1;
}

/** This office's most specific default, or undefined so the app's General form remains the fallback. */
export function defaultFormatFor(list: ScheduleFormat[], category: PanelCategory, context: ScheduleFormatContext): ScheduleFormat | undefined {
  const kind = PANEL_CATEGORIES.find((c) => c.key === category)?.kind;
  return list.filter((f) => f.category === kind && f.defaultFor?.includes(category) && formatMatchRank(f, context) > 0)
    .sort((a, b) => formatMatchRank(b, context) - formatMatchRank(a, context))[0];
}

export function defaultFormatIds(list: ScheduleFormat[], context: ScheduleFormatContext): Record<PanelCategory, string> {
  return Object.fromEntries(PANEL_CATEGORIES.map((c) => [c.key, defaultFormatFor(list, c.key, context)?.id ?? ''])) as Record<PanelCategory, string>;
}

const scopeKey = (f: Pick<ScheduleFormat, 'country' | 'authorityId'>) => f.authorityId ? `authority:${f.authorityId}` : f.country ? `country:${f.country}` : 'general';

/** Changes where a format is recommended. A default is cleared so it cannot silently move to another authority. */
export function withFormatCompatibility(list: ScheduleFormat[], id: string, context: ScheduleFormatContext, at = new Date()): ScheduleFormat[] {
  return list.map((f) => {
    if (f.id !== id) return f;
    const authorityId = context.authorityId?.trim() || undefined, country = authorityId ? undefined : context.country?.trim() || undefined;
    if (f.authorityId === authorityId && f.country === country) return f;
    const { authorityId: _oldAuthority, country: _oldCountry, defaultFor: _oldDefaults, ...rest } = f;
    return { ...rest, ...(country && { country }), ...(authorityId && { authorityId }), updatedAt: at.toISOString().slice(0, 10), version: formatVersion(f) + 1 };
  });
}

/** Marks one format as this office's default for its compatibility scope and panel category. */
export function withFormatDefault(list: ScheduleFormat[], id: string, category: PanelCategory, on = true): ScheduleFormat[] {
  const target = list.find((f) => f.id === id), kind = PANEL_CATEGORIES.find((c) => c.key === category)?.kind;
  if (!target || target.category !== kind) return list;
  const scope = scopeKey(target);
  return list.map((f) => {
    const drop = on && f.id !== id && scopeKey(f) === scope;
    const next = (f.defaultFor ?? []).filter((c) => c !== category);
    if (f.id === id && on) next.push(category);
    if (!drop && f.id !== id) return f;
    const { defaultFor: _old, ...rest } = f;
    return next.length ? { ...rest, defaultFor: next } : rest;
  });
}

// ---- one portable, versioned format file

/** A format safe to share: never carries a board target or pending project edits, and imports as output-only. */
function portable(format: ScheduleFormat): ScheduleFormat {
  const { boardId: _boardId, pending: _pending, added: _added, ...link } = format.sheet.link!;
  const { defaultFor: _defaultFor, ...shared } = format;
  return { ...shared, version: formatVersion(format), sheet: { ...format.sheet, link: { ...link, mode: 'output', rows: [] } } };
}

/** One schedule format as its portable JSON file. */
export function scheduleFormatFileText(format: ScheduleFormat, at = new Date()): string {
  return `${JSON.stringify({ format: SCHEDULE_FORMAT_FILE, version: SCHEDULE_FORMAT_FILE_VERSION, exportedAt: at.toISOString(), scheduleFormat: portable(format) }, null, 2)}\n`;
}

/** Reads one portable format. Imported packages are output-only until the user deliberately enables linked editing. */
export function scheduleFormatFromFileText(text: string): ScheduleFormat {
  if (new TextEncoder().encode(text).byteLength > MAX_SCHEDULE_FORMAT_FILE_BYTES) throw new Error('The schedule-format file is larger than 2 MB.');
  let file: unknown;
  try { file = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (!obj(file) || file.format !== SCHEDULE_FORMAT_FILE) throw new Error('The file is not an LV Design Studio schedule format.');
  if (typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) throw new Error('The schedule-format file version is invalid.');
  if (file.version > SCHEDULE_FORMAT_FILE_VERSION) throw new Error('The schedule format was made by a newer LV Design Studio version.');
  if (!isFormat(file.scheduleFormat)) throw new Error('The schedule-format file is incomplete or damaged.');
  return portable(file.scheduleFormat);
}

const uniqueImportedName = (list: ScheduleFormat[], name: string): string => {
  const taken = new Set(list.map((f) => f.name.trim().toLowerCase()));
  if (!taken.has(name.trim().toLowerCase())) return name.trim();
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? ' (imported)' : ` (imported ${n})`, candidate = `${name.trim().slice(0, 60 - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
};

/** Adds an imported format, updates the same stable ID, or keeps it as a separate copy when requested. */
export function withImportedFormat(list: ScheduleFormat[], incoming: ScheduleFormat, copy = false): { list: ScheduleFormat[]; format: ScheduleFormat; action: 'added' | 'updated' | 'copied' } {
  const same = list.find((f) => f.id === incoming.id);
  if (same && !copy) {
    const keepDefaults = scopeKey(same) === scopeKey(incoming) ? same.defaultFor : undefined;
    const others = list.filter((f) => f.id !== same.id), format = { ...portable(incoming), name: uniqueImportedName(others, incoming.name), ...(keepDefaults?.length && { defaultFor: keepDefaults }) };
    return { list: list.map((f) => (f.id === same.id ? format : f)), format, action: 'updated' };
  }
  const format = { ...portable(incoming), ...(same ? { id: newId() } : {}), name: uniqueImportedName(list, incoming.name) };
  return { list: [...list, format], format, action: same ? 'copied' : 'added' };
}

// ---- the format a project uses

/** The panel categories a project can have a format for: a DB format is for DBs, a panel format for SMDBs, MDBs and MCCs. */
export type PanelCategory = 'db' | 'smdb' | 'mdb' | 'mcc';
export const PANEL_CATEGORIES: { key: PanelCategory; label: string; plural: string; kind: 'db' | 'md' }[] = [
  { key: 'db', label: 'DB', plural: 'DBs', kind: 'db' }, { key: 'smdb', label: 'SMDB', plural: 'SMDBs', kind: 'md' },
  { key: 'mdb', label: 'MDB', plural: 'MDBs', kind: 'md' }, { key: 'mcc', label: 'MCC', plural: 'MCCs', kind: 'md' }
];

/** The format the project's panels of this category use in Sheets: its own copy of one of My formats. */
export const projectFormat = (project: Project, category: PanelCategory = 'db') => project.scheduleFormats?.[category];

/** The project with a copy of a format as the format of a category, or (undefined) without one; no empty object is left behind.
 * A format is only set for a category of its own kind; otherwise the project is returned unchanged. */
export function withProjectFormat(project: Project, category: PanelCategory, format: ScheduleFormat | undefined, at = new Date()): Project {
  if (format && PANEL_CATEGORIES.find((c) => c.key === category)?.kind !== format.category) return project;
  const { scheduleFormats: old, ...rest } = project;
  const { [category]: _gone, ...others } = old ?? {};
  const next = format ? { ...others, [category]: { id: format.id, name: format.name, version: formatVersion(format), sheet: format.sheet, appliedAt: at.toISOString().slice(0, 10) } } : others;
  return Object.keys(next).length ? { ...rest, scheduleFormats: next } : rest;
}

/** My formats holds a format with the project's format's id whose sheet differs from the project's copy. */
export function projectFormatStale(project: Project, category: PanelCategory, list: ScheduleFormat[]): boolean {
  const own = projectFormat(project, category), now = own && list.find((f) => f.id === own.id);
  return !!own && !!now && (formatVersion(now) !== (own.version ?? 1) || JSON.stringify(now.sheet) !== JSON.stringify(own.sheet));
}
