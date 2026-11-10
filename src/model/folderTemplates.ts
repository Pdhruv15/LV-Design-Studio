/** Project folder templates: a tree of folders, each carrying the roles of the outputs saved into it
 * (src/model/folderRoles.ts), plus a file-naming rule. Pure functions only; the disk is reached through
 * the Electron main process (electron/folderTemplates.cjs), which only ever creates folders.
 *
 * Proposal (spec Part B): docs/notes/Future development/UI UX proposals - 2026-11-09 - Project folders customisation.md */

import { ROLE_CATALOGUE, isRole, type DocType } from './folderRoles';

export type FolderWhen =
  | 'always' | 'scope:pv' | 'scope:standby' | 'scope:fire' | 'scope:elv'
  | 'stage:tender' | 'service:supervision' | 'building:each';
export const FOLDER_WHEN: readonly FolderWhen[] = ['always', 'scope:pv', 'scope:standby', 'scope:fire', 'scope:elv', 'stage:tender', 'service:supervision', 'building:each'];

export interface FolderNode {
  /** Stable inside the template (the editor and project overrides refer to it). */
  id: string;
  name: string;
  role?: string;
  /** A folder may hold several roles; a role belongs to one folder only. */
  roles?: string[];
  when?: FolderWhen;
  /** Subfolders made when an output is saved, e.g. "{Stage}/Rev-{Rev}". */
  onUse?: string;
  note?: string;
  children?: FolderNode[];
}

export type NamingPreset = 'office' | 'iso19650' | 'simple' | 'custom';
export interface NamingRule {
  preset: NamingPreset;
  /** e.g. "{ProjectNo}-{Discipline}-{Type}-{Seq:3}-{Rev}" */
  pattern: string;
  perType?: Partial<Record<DocType, string>>;
  separator: '-' | '_' | '.';
  upper?: boolean;
  /** Default "E". */
  discipline?: string;
}

export type FolderNumbering = '01_' | '1.' | 'A-' | 'none';
export type FolderLayout = 'discipline' | 'stage' | 'building' | 'iso19650' | 'flat' | 'blank';

export interface FolderTemplate {
  id: string;
  name: string;
  version: number;
  builtIn?: boolean;
  basedOn?: string;
  editedAt?: string;
  layout?: FolderLayout;
  /** The project's own folder, e.g. "{ProjectNo}_{ProjectShort}". */
  root: string;
  numbering?: FolderNumbering;
  /** Building/phase-first: the building:each node repeats; `shared` lists node ids kept once at the top. */
  repeat?: { source: 'buildings' | 'phases'; name: string; shared: string[] };
  naming: NamingRule;
  folders: FolderNode[];
}

/** A project's own changes to its template; the office template is never changed by them. */
export interface ProjectFolderOverrides {
  add: { parentId: string | null; node: FolderNode }[];
  rename: { id: string; name: string }[];
  /** Node ids not created for this project (with their subfolders). */
  hide: string[];
  /** role → node id; "" means ask where to save in this project. */
  roles: Record<string, string>;
}

/** Project.folder: a copy of the template, so the project opens the same on another PC. */
export interface ProjectFolder {
  templateId: string;
  version: number;
  template: FolderTemplate;
  overrides?: ProjectFolderOverrides;
}

export const FOLDER_LIMITS = Object.freeze({ maxFolders: 300, maxDepth: 6, maxPathChars: 200 });

/* ---------- tree helpers ---------- */

export const nodeRoles = (n: FolderNode): string[] => n.roles ?? (n.role ? [n.role] : []);

function withRoles(n: FolderNode, roles: string[]): FolderNode {
  const { role: _r, roles: _rs, ...rest } = n;
  return roles.length === 0 ? rest : roles.length === 1 ? { ...rest, role: roles[0] } : { ...rest, roles };
}

/** Visits every node, parents before children; `path` holds the ancestors. */
export function walkNodes(nodes: readonly FolderNode[], visit: (n: FolderNode, path: FolderNode[]) => void, path: FolderNode[] = []): void {
  for (const n of nodes) {
    visit(n, path);
    if (n.children?.length) walkNodes(n.children, visit, [...path, n]);
  }
}

export function countFolders(nodes: readonly FolderNode[]): number {
  let c = 0;
  walkNodes(nodes, () => { c++; });
  return c;
}

/** Roles the template gives a folder (catalogue roles only). */
export function assignedRoles(nodes: readonly FolderNode[]): Set<string> {
  const s = new Set<string>();
  walkNodes(nodes, (n) => nodeRoles(n).forEach((r) => { if (isRole(r)) s.add(r); }));
  return s;
}

const cloneNodes = (nodes: readonly FolderNode[]): FolderNode[] => nodes.map((n) => ({ ...n, ...(n.roles ? { roles: [...n.roles] } : {}), ...(n.children ? { children: cloneNodes(n.children) } : {}) }));

/* ---------- names ---------- */

/** Fields a folder name may use; filled from the project. */
export const NAME_TOKENS = ['ProjectNo', 'ProjectShort', 'Client', 'Plot', 'BuildingCode', 'BuildingName'] as const;
export type FolderVars = Partial<Record<(typeof NAME_TOKENS)[number], string>>;
/** Fields the "Subfolders on use" pattern may use; filled when an output is saved. */
export const ON_USE_TOKENS = ['Stage', 'Rev', 'BoqRev', 'TrNo', 'YYYYMMDD'] as const;

export const SAMPLE_VARS: FolderVars = { ProjectNo: '2417', ProjectShort: 'AlBarsha-Villas', Client: 'Sample Developments LLC', Plot: '345-0789', BuildingCode: 'B1', BuildingName: 'Villa-A' };

const ILLEGAL = /[<>:"/\\|?*&#%]/;
const ILLEGAL_ALL = /[<>:"/\\|?*&#%]/g;
const hasControl = (s: string): boolean => [...s].some((c) => c < ' ');
const MISSING = '\uE000'; // marks a field with no value while a name is filled
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
const TOKEN = /\{(\w+)\}/g;

/** A value typed by the user (a client "A/B", a building "Villa 1.") made safe inside a folder name. */
export const safeNamePart = (v: string): string => [...v].map((c) => (c < ' ' ? ' ' : c)).join('').replace(ILLEGAL_ALL, '-').replace(/\s+/g, ' ').trim();

/** The folder name with its fields filled. A missing field is left out, with the separator next to it. */
export function fillName(name: string, vars: FolderVars): string {
  const s = name.replace(TOKEN, (m, k: string) => {
    const v = (vars as Record<string, string | undefined>)[k];
    return v === undefined ? (NAME_TOKENS.includes(k as never) ? MISSING : m) : safeNamePart(v);
  });
  const SEP = '[_\\-. ]*';
  return s
    .replace(new RegExp(`^(?:${SEP}${MISSING})+${SEP}`), '')
    .replace(new RegExp(`(?:${SEP}${MISSING})+${SEP}$`), '')
    .replace(new RegExp(`(${SEP})(?:${MISSING}${SEP})+`, 'g'), (m: string, a: string) => (a || m.split(MISSING).join('')).slice(0, 1))
    .replace(/[. ]+$/, '')
    .trim();
}

/* ---------- validation (spec C2 checks) ---------- */

export interface TemplateIssue {
  level: 'error' | 'warn';
  nodeId?: string;
  message: string;
}

function nameIssues(raw: string, label: string, tokens: readonly string[]): string[] {
  const out: string[] = [];
  if (!raw.trim()) return ['A folder has no name'];
  const literal = raw.replace(TOKEN, '');
  const bad = literal.match(ILLEGAL);
  if (bad) out.push(`“${label}”: remove ${bad[0]} (not allowed in folder names)`);
  if (hasControl(literal)) out.push(`“${label}” has a control character`);
  for (const [, k] of raw.matchAll(TOKEN)) if (!tokens.includes(k)) out.push(`“${label}”: {${k}} is not a field this name can use`);
  if (RESERVED.test(raw.trim())) out.push(`“${label}” is a reserved Windows name`);
  if (/[. ]$/.test(raw)) out.push(`“${label}” ends with a dot or a space`);
  if (raw === '.' || raw === '..') out.push(`“${label}” is not a folder name`);
  return out;
}

/** Every C2 check: names Windows accepts, unique names among siblings, path length, depth, folder count,
 * one folder per role, known roles, and roles with no folder. */
export function validateTemplate(t: FolderTemplate, vars: FolderVars = SAMPLE_VARS): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const err = (message: string, nodeId?: string) => issues.push({ level: 'error', nodeId, message });
  const warn = (message: string, nodeId?: string) => issues.push({ level: 'warn', nodeId, message });
  for (const m of nameIssues(t.root, t.root, NAME_TOKENS)) err(`Project folder ${m}`);
  const root = fillName(t.root, vars);
  const ids = new Set<string>();
  const roleAt = new Map<string, string>();
  const check = (nodes: readonly FolderNode[], path: string[], depth: number, inBuilding: boolean) => {
    const seen = new Set<string>();
    for (const n of nodes) {
      if (ids.has(n.id)) err(`Two folders share the id ${n.id}`, n.id);
      ids.add(n.id);
      for (const m of nameIssues(n.name, n.name, NAME_TOKENS)) err(m, n.id);
      const filled = fillName(n.name, vars);
      const key = filled.toLowerCase();
      if (seen.has(key)) err(`Two folders named “${n.name}” in the same place`, n.id);
      seen.add(key);
      const full = [root, ...path, filled].join('\\');
      if (full.length > FOLDER_LIMITS.maxPathChars) warn(`“${n.name}”: the path is ${full.length} characters for the sample project (${FOLDER_LIMITS.maxPathChars} at most)`, n.id);
      if (depth > FOLDER_LIMITS.maxDepth) warn(`“${n.name}” is ${depth} levels deep (${FOLDER_LIMITS.maxDepth} at most)`, n.id);
      if (n.when && !FOLDER_WHEN.includes(n.when)) err(`“${n.name}”: unknown condition ${n.when}`, n.id);
      if (n.when === 'building:each' && inBuilding) err(`“${n.name}” repeats for each building inside a folder that already does`, n.id);
      if (n.onUse) {
        for (const seg of n.onUse.split('/')) for (const m of nameIssues(seg, `${n.name}: ${n.onUse}`, ON_USE_TOKENS)) err(m.replace('A folder has no name', `“${n.name}”: the subfolder pattern has an empty part`), n.id);
      }
      for (const r of nodeRoles(n)) {
        if (!isRole(r)) err(`“${n.name}”: unknown role ${r}`, n.id);
        else if (roleAt.has(r)) err(`The role ${r} is on “${roleAt.get(r)}” and “${n.name}”; a role saves to one folder`, n.id);
        else roleAt.set(r, n.name);
      }
      if (n.children?.length) check(n.children, [...path, filled], depth + 1, inBuilding || n.when === 'building:each');
    }
  };
  check(t.folders, [], 1, false);
  const total = countFolders(t.folders);
  if (total > FOLDER_LIMITS.maxFolders) err(`${total} folders (${FOLDER_LIMITS.maxFolders} at most)`);
  const missing = ROLE_CATALOGUE.length - roleAt.size;
  if (missing > 0) warn(`${missing} role${missing === 1 ? ' has' : 's have'} no folder; those outputs ask where to save`);
  return issues;
}

/* ---------- numbering ---------- */

const DIGITS = /^\d{1,3}(?:_|\.\s?)/;
const LETTER = /^([A-Z]{1,2})-/;
const letterFor = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

/** The numbering style the folders at one level use, when all of them use it ("A-" only as a run A, B, C…). */
export function detectNumbering(names: readonly string[]): FolderNumbering {
  if (!names.length) return 'none';
  if (names.every((n) => /^\d{1,3}_/.test(n))) return '01_';
  if (names.every((n) => /^\d{1,3}\./.test(n))) return '1.';
  const letters = names.map((n) => n.match(LETTER)?.[1]);
  if (letters.every((l, i) => l === letterFor(i))) return 'A-';
  return 'none';
}

/** The name without its number ("05_Calcs" → "Calcs"). Letters are only taken off when the level uses them. */
function stripNumber(name: string, letters: boolean): string {
  const s = name.replace(DIGITS, '');
  return (letters ? s.replace(LETTER, '') : s).trimStart() || name;
}

/** Numbers the folders at one level in their order, replacing the numbers they had. */
export function renumber(siblings: readonly FolderNode[], style: FolderNumbering): FolderNode[] {
  const letters = detectNumbering(siblings.map((n) => n.name)) === 'A-';
  return siblings.map((n, i) => {
    const base = stripNumber(n.name, letters);
    const prefix = style === '01_' ? `${String(i + 1).padStart(2, '0')}_` : style === '1.' ? `${i + 1}. ` : style === 'A-' ? `${letterFor(i)}-` : '';
    return { ...n, name: prefix + base };
  });
}

/* ---------- project overrides ---------- */

export const emptyOverrides = (): ProjectFolderOverrides => ({ add: [], rename: [], hide: [], roles: {} });

function findNode(nodes: readonly FolderNode[], id: string): FolderNode | undefined {
  let hit: FolderNode | undefined;
  walkNodes(nodes, (n) => { if (!hit && n.id === id) hit = n; });
  return hit;
}

/** The project's effective tree: the template with the project's renames, hidden folders, added folders
 * and role changes applied. The template itself is not changed. */
export function applyOverrides(t: FolderTemplate, ov?: ProjectFolderOverrides): FolderNode[] {
  if (!ov) return cloneNodes(t.folders);
  const hide = new Set(ov.hide);
  const names = new Map(ov.rename.map((r) => [r.id, r.name]));
  const prune = (nodes: FolderNode[]): FolderNode[] => nodes.filter((n) => !hide.has(n.id)).map((n) => ({
    ...n,
    ...(names.has(n.id) ? { name: names.get(n.id)! } : {}),
    ...(n.children ? { children: prune(n.children) } : {})
  }));
  const tree = prune(cloneNodes(t.folders));
  const ids = new Set<string>();
  walkNodes(tree, (n) => ids.add(n.id));
  for (const a of ov.add) {
    if (ids.has(a.node.id)) continue;
    const parent = a.parentId === null ? undefined : findNode(tree, a.parentId);
    if (a.parentId !== null && !parent) continue;
    const node = cloneNodes([a.node])[0];
    walkNodes([node], (n) => ids.add(n.id));
    if (parent) parent.children = [...(parent.children ?? []), node];
    else tree.push(node);
  }
  const roleEntries = Object.entries(ov.roles).filter(([r, id]) => isRole(r) && (id === '' || ids.has(id)));
  if (!roleEntries.length) return tree;
  const moved = new Set(roleEntries.map(([r]) => r));
  const target = new Map<string, string[]>();
  for (const [r, id] of roleEntries) if (id) target.set(id, [...(target.get(id) ?? []), r]);
  const reassign = (nodes: FolderNode[]): FolderNode[] => nodes.map((n) => {
    const roles = [...nodeRoles(n).filter((r) => !moved.has(r)), ...(target.get(n.id) ?? [])];
    const out = withRoles(n, roles);
    return n.children ? { ...out, children: reassign(n.children) } : out;
  });
  return reassign(tree);
}

/** Splits overrides into those that still apply to a template and those that do not (C8 lists them). */
export function checkOverrides(t: FolderTemplate, ov: ProjectFolderOverrides): { kept: ProjectFolderOverrides; dropped: string[] } {
  const ids = new Set<string>();
  walkNodes(t.folders, (n) => ids.add(n.id));
  const hidden = new Set(ov.hide.filter((id) => ids.has(id)));
  const dropped: string[] = [];
  const kept = emptyOverrides();
  for (const id of ov.hide) {
    if (ids.has(id)) kept.hide.push(id); else dropped.push(`Hide ${id}: not in the template`);
  }
  for (const r of ov.rename) {
    if (ids.has(r.id) && !hidden.has(r.id)) kept.rename.push(r); else dropped.push(`Rename ${r.id} to “${r.name}”: not in the template`);
  }
  const added = new Set<string>();
  for (const a of ov.add) {
    if (a.parentId === null || (ids.has(a.parentId) && !hidden.has(a.parentId)) || added.has(a.parentId)) {
      kept.add.push(a);
      walkNodes([a.node], (n) => added.add(n.id));
    } else dropped.push(`Add “${a.node.name}”: its parent folder is not in the template`);
  }
  for (const [r, id] of Object.entries(ov.roles)) {
    if (isRole(r) && (id === '' || (ids.has(id) && !hidden.has(id)) || added.has(id))) kept.roles[r] = id;
    else dropped.push(`Role ${r}: its folder is not in the template`);
  }
  return { kept, dropped };
}

/* ---------- expansion ---------- */

export interface FolderBuilding { code: string; name: string }

export interface ExpandedFolder {
  /** Relative to the project folder, "/" between folders. */
  path: string;
  nodeId: string;
  roles: string[];
  /** Code of the building this folder repeats for. */
  building?: string;
}

const active = (when: FolderWhen | undefined, flags: ReadonlySet<FolderWhen>): boolean => !when || when === 'always' || when === 'building:each' || flags.has(when);

/** The folders to create for a project: names filled, folders whose condition is off left out, and each
 * building:each folder repeated for every building (none when the project has no buildings). */
export function expandTemplate(t: FolderTemplate, vars: FolderVars, flags: Iterable<FolderWhen> = [], buildings: readonly FolderBuilding[] = []): { root: string; folders: ExpandedFolder[] } {
  const on = new Set(flags);
  const out: ExpandedFolder[] = [];
  const rec = (nodes: readonly FolderNode[], parent: string, v: FolderVars, building?: string) => {
    for (const n of nodes) {
      if (!active(n.when, on)) continue;
      const copies = n.when === 'building:each' && !building
        ? buildings.map((b) => ({ v: { ...v, BuildingCode: b.code, BuildingName: b.name }, building: b.code }))
        : [{ v, building }];
      for (const c of copies) {
        const name = fillName(n.name, c.v);
        if (!name) continue;
        const path = parent ? `${parent}/${name}` : name;
        out.push({ path, nodeId: n.id, roles: nodeRoles(n), ...(c.building ? { building: c.building } : {}) });
        if (n.children?.length) rec(n.children, path, c.v, c.building);
      }
    }
  };
  rec(t.folders, '', vars);
  return { root: fillName(t.root, vars), folders: out };
}

/** The folder an output with this role saves into, relative to the project folder; undefined means ask
 * where to save. The project's role change wins over the template's. A role inside a building:each folder
 * needs the building. */
export function resolveRole(t: FolderTemplate, ov: ProjectFolderOverrides | undefined, role: string, ctx: { vars?: FolderVars; flags?: Iterable<FolderWhen>; building?: FolderBuilding } = {}): string | undefined {
  if (!isRole(role) || ov?.roles[role] === '') return undefined;
  const tree = applyOverrides(t, ov);
  const flags = new Set(ctx.flags ?? FOLDER_WHEN);
  let hit: string | undefined;
  const rec = (nodes: readonly FolderNode[], parent: string, v: FolderVars, inBuilding: boolean) => {
    for (const n of nodes) {
      if (hit !== undefined || !active(n.when, flags)) continue;
      const each = n.when === 'building:each' && !inBuilding;
      if (each && !ctx.building) continue;
      const nv = each && ctx.building ? { ...v, BuildingCode: ctx.building.code, BuildingName: ctx.building.name } : v;
      const name = fillName(n.name, nv);
      const path = parent ? `${parent}/${name}` : name;
      if (nodeRoles(n).includes(role)) { hit = path; return; }
      if (n.children?.length) rec(n.children, path, nv, inBuilding || each);
    }
  };
  rec(tree, '', { ...SAMPLE_VARS, ...ctx.vars }, false);
  return hit;
}

/* ---------- change template (C8) ---------- */

export interface TemplateDiff {
  create: ExpandedFolder[];
  keep: ExpandedFolder[];
  /** Roles whose folder changes. */
  remap: { role: string; from?: string; to?: string }[];
  /** In the project now, not in the new template: left on disk as they are. */
  untouched: ExpandedFolder[];
}

/** Compares the project's folders now with those of another template (both from expandTemplate, so the
 * paths are concrete). Paths compare without case, as Windows and macOS do. */
export function diffTemplates(current: readonly ExpandedFolder[], next: readonly ExpandedFolder[]): TemplateDiff {
  const key = (p: string) => p.toLowerCase();
  const now = new Map(current.map((f) => [key(f.path), f]));
  const then = new Map(next.map((f) => [key(f.path), f]));
  const roleMap = (fs: readonly ExpandedFolder[]) => {
    const m = new Map<string, string>();
    for (const f of fs) for (const r of f.roles) if (!m.has(r)) m.set(r, f.path);
    return m;
  };
  const a = roleMap(current); const b = roleMap(next);
  const remap: TemplateDiff['remap'] = [];
  for (const r of new Set([...a.keys(), ...b.keys()])) {
    const from = a.get(r); const to = b.get(r);
    if (from === undefined || to === undefined || key(from) !== key(to)) remap.push({ role: r, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }
  return {
    create: next.filter((f) => !now.has(key(f.path))),
    keep: next.filter((f) => now.has(key(f.path))),
    remap,
    untouched: current.filter((f) => !then.has(key(f.path)))
  };
}

/* ---------- a project's stored copy ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isNode(v: unknown, depth = 0): v is FolderNode {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || depth > 32) return false;
  if (v.role !== undefined && typeof v.role !== 'string') return false;
  if (v.roles !== undefined && !(Array.isArray(v.roles) && v.roles.every((r) => typeof r === 'string'))) return false;
  if (v.when !== undefined && !FOLDER_WHEN.includes(v.when as FolderWhen)) return false;
  if (v.onUse !== undefined && typeof v.onUse !== 'string') return false;
  return v.children === undefined || (Array.isArray(v.children) && v.children.every((c) => isNode(c, depth + 1)));
}

export function isFolderTemplate(v: unknown): v is FolderTemplate {
  return isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.root === 'string'
    && isObj(v.naming) && typeof v.naming.pattern === 'string' && Array.isArray(v.folders) && v.folders.every((n) => isNode(n));
}

function isOverrides(v: unknown): v is ProjectFolderOverrides {
  return isObj(v) && Array.isArray(v.add) && v.add.every((a) => isObj(a) && (a.parentId === null || typeof a.parentId === 'string') && isNode(a.node))
    && Array.isArray(v.rename) && v.rename.every((r) => isObj(r) && typeof r.id === 'string' && typeof r.name === 'string')
    && Array.isArray(v.hide) && v.hide.every((h) => typeof h === 'string')
    && isObj(v.roles) && Object.values(v.roles).every((x) => typeof x === 'string');
}

/** A project's folder setting as read from a file: kept when it has the right shape, else dropped (the
 * project then asks where to save, as before). Overrides of the wrong shape are dropped on their own. */
export function readProjectFolder(v: unknown): ProjectFolder | undefined {
  if (!isObj(v) || typeof v.templateId !== 'string' || !isFolderTemplate(v.template)) return undefined;
  const version = typeof v.version === 'number' && Number.isFinite(v.version) ? v.version : v.template.version ?? 1;
  return { templateId: v.templateId, version, template: v.template, ...(isOverrides(v.overrides) ? { overrides: v.overrides } : {}) };
}
