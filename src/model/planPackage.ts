import { z } from 'zod';
import JSZip from 'jszip';
import { sha256Hex } from '../util/sha256';
import type { Project } from '../types';
import { planLinkOf, planMissingNote, withoutPlanLink } from './planLink';

export { planLinkOf, planMissingNote, withoutPlanLink, type PlanLink } from './planLink';

/** The native drawing file (.lvplan, contract lvds.plan version 1): what is drawn in Design CAD, kept beside the
 * project file instead of inside it (docs/notes/Future development/Native drawing file - Phase 2 plan - 2026-11-22.md).
 * Only storage changes: splitPlan takes the drawing fields off a project before it is written, and mergePlan puts
 * them back after it is read, so the project in memory is the same as before. Each drawing file's part is stored
 * once by its SHA-256, so issued revisions whose drawing did not change share it. The JSON Schema files in contracts/
 * are generated from the definitions here (planPackage.test.ts). */

export const PLAN_FORMAT = 'lvds.plan' as const;
export const PLAN_VERSION = 1 as const;
export const PLAN_EXT = '.lvplan';

/** Drawing fields kept per drawing file: lists of entries that name their file… */
const LISTS = ['cadSketch', 'cadBlockDefs'] as const;
/** …and maps keyed by the drawing file (lower case). */
const MAPS = ['cadErased', 'cadLayouts', 'cadRefs', 'cadLayerStyle', 'cadLayerFile', 'cadPlanUnits'] as const;
/** Drawing settings that belong to no single drawing. */
const SHARED = ['cadTextStyles', 'cadDimStyles', 'cadMleaderStyles', 'cadPointStyle', 'cadPatterns', 'cadAnno', 'cadRefEdit'] as const;
/** Every project field that goes to the .lvplan. Devices, wiring, routes and what blocks and layers mean
 * electrically stay in the project (decision P1): the calculations, revision compare, BOQ and MCP tools read them. */
export const PLAN_FIELDS = [...LISTS, ...MAPS, ...SHARED] as const;
export type PlanField = typeof PLAN_FIELDS[number];

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const index = z.number().int().nonnegative();
const tree = z.object({
  drawings: z.array(z.object({
    file: z.string().describe('The drawing file this part belongs to (lower case), for readers; the part holds it too'),
    part: hash.describe('SHA-256 of the part (its key in parts)')
  })),
  order: z.record(z.string(), z.array(index)).describe('Per project field, the drawings (indexes) that hold it, in the project\'s order'),
  shared: hash.optional().describe('The part with the drawing settings that belong to no single drawing')
});
export const planManifest = z.object({
  format: z.literal(PLAN_FORMAT),
  version: z.number().int().positive().describe('Format version: a reader refuses a newer one'),
  live: tree.optional().describe('The drawn work of the project as saved'),
  revisions: z.array(z.object({
    index: index.describe('Position of the revision in the project file\'s revisions'),
    id: z.string().describe('Its revision letter, checked against the project file'),
    tree
  })).describe('The drawn work as each issued revision recorded it'),
  parts: z.record(hash, z.object({ path: z.string(), bytes: index })).describe('Every part in the package by SHA-256 of its JSON text')
});
const field = z.unknown().optional();
/** One drawing file's part: the project fields of that drawing, each as the project holds it. */
export const planDrawing = z.object({
  file: z.string().describe('The drawing file (lower case unless the project used another key)'),
  cadSketch: z.object({ file: z.string(), items: z.array(z.object({ id: z.string(), kind: z.string(), layer: z.string(), pts: z.array(z.tuple([z.number(), z.number()])) }).loose()) }).optional().describe('What the engineer drew over this drawing'),
  cadBlockDefs: z.object({ file: z.string(), defs: z.array(z.object({ name: z.string() }).loose()) }).optional().describe('The drawing\'s own blocks'),
  cadErased: z.array(z.string()).optional().describe('Handles of the architect\'s objects erased in the app'),
  cadLayouts: field, cadRefs: field, cadLayerStyle: field, cadLayerFile: field, cadPlanUnits: field
}).loose();
export type PlanManifest = z.infer<typeof planManifest>;
type PlanTree = z.infer<typeof tree>;

/** A package before it is zipped, or after it is read: the manifest and every part's JSON text by its path. */
export interface PlanFiles { manifest: PlanManifest; parts: Record<string, string> }

/** A .lvplan that cannot be used with its project file. The message is the reason, for the person. */
export class PlanError extends Error {}

type Obj = Record<string, unknown>;
// A value's JSON text. Nothing in the app changes a project in place (undo relies on that, and revisionStore.ts),
// so the same object always has the same text: saving again turns only what was edited since into text.
const texts = new WeakMap<object, string>();
function textOf(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return JSON.stringify(v);
  let t = texts.get(v);
  if (t === undefined) { t = JSON.stringify(v); texts.set(v, t); }
  return t;
}
/** JSON.stringify of a part, from the texts of its values. */
const partText = (o: Obj): string => `{${Object.entries(o).flatMap(([k, v]) => { const t = textOf(v); return t === undefined ? [] : [`${JSON.stringify(k)}:${t}`]; }).join(',')}}`;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const named = (v: unknown): v is { file: string }[] => Array.isArray(v) && v.every((e) => isObj(e) && typeof e.file === 'string');

/** Takes the drawing fields off one project (or revision snapshot). A field the app would not have written (a list
 * entry without a file name, a map that is not an object) stays where it is, so nothing is ever lost. */
function splitTree(src: Obj, put: (dir: 'drawings' | 'shared', value: Obj) => string): { rest: Obj; tree?: PlanTree } {
  const rest = { ...src };
  const groups: Obj[] = [];
  const order: Record<string, number[]> = {};
  /** The drawing a field's entry goes to: the first one of that file that has no such field yet. */
  const slot = (f: string, file: string) => {
    let i = groups.findIndex((g) => g.file === file && !(f in g));
    if (i < 0) i = groups.push({ file }) - 1;
    return i;
  };
  for (const f of LISTS) {
    const v = rest[f];
    if (!named(v)) continue;
    delete rest[f];
    order[f] = v.map((e) => { const i = slot(f, e.file.toLowerCase()); groups[i][f] = e; return i; });
  }
  for (const f of MAPS) {
    const v = rest[f];
    if (!isObj(v)) continue;
    delete rest[f];
    order[f] = Object.entries(v).map(([k, x]) => { const i = slot(f, k); groups[i][f] = x; return i; });
  }
  const shared: Obj = {};
  for (const f of SHARED) if (f in rest) { if (rest[f] !== undefined) shared[f] = rest[f]; delete rest[f]; }
  const has = Object.keys(order).length > 0 || Object.keys(shared).length > 0;
  if (!has) return { rest };
  return { rest, tree: {
    drawings: groups.map((g) => ({ file: g.file as string, part: put('drawings', g) })),
    order,
    ...(Object.keys(shared).length ? { shared: put('shared', shared) } : {})
  } };
}

/** SHA-256 as lowercase hex: the system's own where the page may use it (desktop, headless, a secure page), else the
 * app's (src/util/sha256.ts), which is about 25 times slower. */
async function sha256(bytes: Uint8Array, text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return sha256Hex(text);
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  let hex = '';
  for (const b of d) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** The project without its drawn work, and the .lvplan files that hold it; no plan when there is nothing drawn. */
export async function splitPlan(project: Project): Promise<{ project: Project; plan?: PlanFiles }> {
  // Each different part is hashed once: issued revisions mostly repeat the drawings as they are.
  const seen = new Map<string, number>();
  const pending: { dir: 'drawings' | 'shared'; text: string }[] = [];
  const put = (dir: 'drawings' | 'shared', value: Obj) => {
    const text = partText(value);
    let n = seen.get(text);
    if (n === undefined) { n = pending.push({ dir, text }) - 1; seen.set(text, n); }
    return String(n);
  };
  const live = splitTree(project as unknown as Obj, put);
  const revisions: PlanManifest['revisions'] = [];
  const revs = (project.revisions ?? []).map((r, i) => {
    const s = splitTree(r.snapshot as unknown as Obj, put);
    if (!s.tree) return r;
    revisions.push({ index: i, id: r.id, tree: s.tree });
    return { ...r, snapshot: s.rest as unknown as typeof r.snapshot };
  });
  if (!live.tree && revisions.length === 0) return { project };
  const parts: Record<string, string> = {};
  const index: PlanManifest['parts'] = {};
  const sizes: number[] = [];
  const hashes = await Promise.all(pending.map(({ text }, i) => {
    const bytes = new TextEncoder().encode(text);
    sizes[i] = bytes.length;
    return sha256(bytes, text);
  }));
  // Listed in the order the parts were met, not the order the hashes finished: the same drawn work, the same manifest.
  pending.forEach(({ dir, text }, i) => {
    const h = hashes[i];
    index[h] = { path: `${dir}/${h}.json`, bytes: sizes[i] };
    parts[index[h].path] = text;
  });
  const named = (t: PlanTree): PlanTree => ({ ...t, drawings: t.drawings.map((d) => ({ ...d, part: hashes[Number(d.part)] })), ...(t.shared ? { shared: hashes[Number(t.shared)] } : {}) });
  const rest = (revisions.length ? { ...live.rest, revisions: revs } : live.rest) as unknown as Project;
  const manifest: PlanManifest = { format: PLAN_FORMAT, version: PLAN_VERSION, ...(live.tree ? { live: named(live.tree) } : {}), revisions: revisions.map((r) => ({ ...r, tree: named(r.tree) })), parts: index };
  return { project: rest, plan: { manifest, parts } };
}

/** Checks a manifest read from a file: its format and version, and that it is complete. */
export function readManifest(v: unknown): PlanManifest {
  if (isObj(v) && v.format === PLAN_FORMAT && typeof v.version === 'number' && v.version > PLAN_VERSION) {
    throw new PlanError('The drawn work was saved by a newer version of LV Design Studio. Update the app to open it.');
  }
  const r = planManifest.safeParse(v);
  if (!r.success) throw new PlanError('The drawn work file is not a drawing file of LV Design Studio, or it is damaged.');
  return r.data;
}

/** The project with its drawn work put back, as it was before splitPlan. */
export function mergePlan(project: Project, plan: PlanFiles): Project {
  const manifest = readManifest(plan.manifest);
  // A part is read once: the project and the revisions that share a drawing share its objects, as unpackRevisions
  // does, which is safe because nothing in the app changes a project in place.
  const parsed = new Map<string, Obj>();
  const read = (h: string): Obj => {
    let o = parsed.get(h);
    if (o) return o;
    const p = manifest.parts[h];
    const text = p ? plan.parts[p.path] : undefined;
    if (text === undefined) throw new PlanError('Part of the drawn work is missing from its file.');
    o = JSON.parse(text) as Obj;
    parsed.set(h, o);
    return o;
  };
  const mergeTree = (src: Obj, t: PlanTree): Obj => {
    const out = { ...src };
    const groups = t.drawings.map((d) => read(d.part));
    const at = (i: number) => {
      if (!groups[i]) throw new PlanError('The drawn work file is damaged: a drawing it lists is not in it.');
      return groups[i];
    };
    for (const f of LISTS) if (t.order[f]) out[f] = t.order[f].map((i) => at(i)[f]);
    for (const f of MAPS) if (t.order[f]) out[f] = Object.fromEntries(t.order[f].map((i) => [at(i).file, at(i)[f]]));
    if (t.shared) Object.assign(out, read(t.shared));
    return out;
  };
  const merged = manifest.live ? mergeTree(project as unknown as Obj, manifest.live) as unknown as Project : { ...project };
  if (manifest.revisions.length) {
    const revs = [...(project.revisions ?? [])];
    for (const r of manifest.revisions) {
      const rev = revs[r.index];
      if (!rev || rev.id !== r.id) throw new PlanError('The drawn work file does not match the project\'s revisions.');
      revs[r.index] = { ...rev, snapshot: mergeTree(rev.snapshot as unknown as Obj, r.tree) as unknown as typeof rev.snapshot };
    }
    merged.revisions = revs;
  }
  return merged;
}

/** One date for every entry, so the same drawn work always gives the same file (and the same SHA-256). */
const FIXED_DATE = new Date(Date.UTC(2026, 0, 1));

/** The .lvplan file: a zip of manifest.json and the parts, compressed (about 6.7 times smaller, step 0). */
export function planZip(plan: PlanFiles): Promise<Uint8Array> {
  const zip = new JSZip();
  // No folder entries: the zip would date them now, and the same drawn work would not give the same file.
  zip.file('manifest.json', `${JSON.stringify(plan.manifest, null, 2)}\n`, { date: FIXED_DATE, createFolders: false });
  for (const path of Object.keys(plan.parts).sort()) zip.file(path, plan.parts[path], { date: FIXED_DATE, createFolders: false });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 1 } });
}

/** Reads a .lvplan file. Throws PlanError when it is not one, is damaged, or was written by a newer version. */
export async function readPlanZip(bytes: Uint8Array | ArrayBuffer): Promise<PlanFiles> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new PlanError('The drawn work file is not a drawing file of LV Design Studio, or it is damaged.'); }
  const m = zip.file('manifest.json');
  if (!m) throw new PlanError('The drawn work file is not a drawing file of LV Design Studio, or it is damaged.');
  let raw: unknown;
  try { raw = JSON.parse(await m.async('string')); } catch { throw new PlanError('The drawn work file is not a drawing file of LV Design Studio, or it is damaged.'); }
  const manifest = readManifest(raw);
  const parts: Record<string, string> = {};
  for (const { path } of Object.values(manifest.parts)) {
    const f = zip.file(path);
    if (!f) throw new PlanError('Part of the drawn work is missing from its file.');
    parts[path] = await f.async('string');
  }
  return { manifest, parts };
}

// The .lvplan made last. The manifest names every part by its SHA-256, so the same manifest is the same file: a save
// whose drawn work did not change sends the same bytes again without compressing them, and nothing is written.
let lastZip: { manifest: string; bytes: Uint8Array } | undefined;

/** What a project file is written as: the project without its drawn work, and the .lvplan bytes (none when nothing is
 * drawn). A project that kept its link keeps it, with no .lvplan; if it was drawn on as well, it is refused, because its
 * own drawn work could not be read and would be written over. */
export async function packPlan(project: Project): Promise<{ project: Project; bytes?: Uint8Array }> {
  const { project: rest, plan } = await splitPlan(project);
  if (!plan) return { project: rest };
  const link = planLinkOf(project);
  if (link) throw new PlanError(planMissingNote(link));
  const manifest = JSON.stringify(plan.manifest);
  if (lastZip?.manifest !== manifest) lastZip = { manifest, bytes: await planZip(plan) };
  return { project: rest, bytes: lastZip.bytes };
}

/** A project read from its file with its drawn work put back. The bytes are the .lvplan whose SHA-256 the link records
 * (the main process checks it). Without them, or when they cannot be used, the project keeps its link: it opens
 * without its drawings, read-only (planMissingNote). */
export async function unpackPlan(project: Project, bytes?: Uint8Array): Promise<Project> {
  if (!bytes || !planLinkOf(project)) return project;
  try {
    return withoutPlanLink(mergePlan(project, await readPlanZip(bytes)));
  } catch {
    return project;
  }
}
