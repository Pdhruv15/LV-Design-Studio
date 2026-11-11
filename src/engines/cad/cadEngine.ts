import type { CadBlock } from '../../model/cadLoads';
import type { EngineAnswer, EngineOps } from './cadOps';
import type { RefGeometry } from '../../model/cadRefs';
import type { CadPiece } from '../../model/cadCrop';
import type { ErasedParts } from '../../model/cadErased';
import wasmUrl from '../../../electron/cad/lvds_cad_reader_bg.wasm?url';
import sampleGf from '../../../electron/samples/sample-villa-gf.dxf?url';
import sampleFf from '../../../electron/samples/sample-villa-ff.dxf?url';

/** The CAD view's engine: the Rust document (engines/cad-reader/src/doc.rs, WebAssembly) run in a worker of its own, in
 * the desktop app and the web version alike, or in the page if a worker cannot start. It opens DWG / DXF and gives the
 * drawing flattened for display (segments with layer and colour, texts) and snapping. Files come from the desktop app's
 * dialog, or the browser's file picker. */

export interface CadLayer { name: string; rgb: number; on: boolean; count: number }
/** A text of the drawing; `o` is the model-space object it belongs to (its index, as `CadObject.id`). */
export interface CadText { x: number; y: number; h: number; rot: number; s: string; layer: number; rgb: number; align: number; o?: number }
export interface CadInfo {
  format: 'DWG' | 'DXF';
  units: number; // INSUNITS
  origin: [number, number];
  extents: [number, number, number, number];
  layers: CadLayer[];
  texts: CadText[];
  segments: number;
  snaps: number;
  truncated: boolean;
  /** Dash patterns in drawing units (dash > 0, gap < 0, dot 0); the first is continuous (empty). */
  linetypes: number[][];
  /** Filled areas: solid hatches and 2D solids, or pattern hatches with their pattern lines (absolute drawing units). */
  fills: CadFill[];
  /** External references inside the drawing: block name, saved path, overlay or attach, and where model space inserts
   * them (drawing units; rotation in radians). Missing from an engine older than v2.046. */
  xrefs?: CadXref[];
}
export interface CadXref { name: string; path: string; overlay: boolean; unloaded: boolean; inserts: { x: number; y: number; sx: number; sy: number; rot: number }[] }
/** A filled area; its loops are ranges of drawn segments, each one closed boundary. */
export interface CadFill {
  layer: number;
  rgb: number;
  solid: boolean;
  loops: [number, number][];
  lines: { angle: number; base: [number, number]; offset: [number, number]; dashes: number[] }[];
}
/** One object of model space under a click: its kind, layer, handle, block and attributes, length / area (drawing
 * units), and the range of its drawn segments. */
export interface CadObject {
  id: number;
  kind: string;
  layer: number;
  handle: string;
  block?: string;
  attrs?: Record<string, string>;
  length?: number;
  area?: number;
  radius?: number;
  text?: string;
  vertices?: number;
  closed: boolean;
  seg_start: number;
  seg_end: number;
}
/** A viewport on a file's layout: its frame in paper-space units (lower left, size), and the model it shows: the view's
 * centre and height (drawing units). */
export interface FileViewport { x: number; y: number; w: number; h: number; cx: number; cy: number; vh: number; locked: boolean; on: boolean }
/** A paper-space layout of the drawing file (Layout1, A1 Lighting…), with what is drawn on its paper. */
export interface FileLayout {
  name: string;
  tab: number;
  /** The paper in mm as it lies (0 × 0: the file does not say). */
  paper: [number, number];
  /** The printer's unprintable edges in mm: left, bottom, right, top. */
  margins: [number, number, number, number];
  /** Where the layout's (0, 0) is, in mm from the paper's lower left corner. */
  at: [number, number];
  mm_per_unit: number;
  viewports: FileViewport[];
  /** Its paper space drawn: segments relative to `origin` (paper-space units), their colours, its texts. */
  origin: [number, number];
  segs: Float32Array;
  segColors: Uint32Array;
  segLayers: Uint16Array;
  texts: CadText[];
  layers: CadLayer[];
}
/** An open drawing. Segment coordinates are relative to `info.origin` (drawing units). */
export interface CadView {
  file: string;
  path?: string;
  /** The file as opened, for saving it again with the devices added. */
  bytes: Uint8Array;
  info: CadInfo;
  segs: Float32Array;
  segLayers: Uint16Array;
  segColors: Uint32Array;
  /** The dash pattern of each segment: an index into info.linetypes (0 continuous). */
  segLinetypes: Uint16Array;
  /** Where the engine runs: its own worker, or the page if a worker could not start. */
  engine: 'worker' | 'page';
  /** Nearest snap point within `r` of (x, y) (drawing units, absolute): [x, y, kind] or empty. Answered in the order
   * asked, and empty once the drawing is closed. */
  snap: (x: number, y: number, r: number, mask: number, layersOn: Uint8Array, from?: [number, number]) => Promise<Float64Array>;
  /** The object under (x, y) within `tol` (drawing units, absolute) on shown layers; null when none. `closedOnly`:
   * only objects with an area (as for AREA → Object). */
  pick: (x: number, y: number, tol: number, layersOn: Uint8Array, closedOnly?: boolean) => Promise<CadObject | null>;
  /** The file's own paper-space layouts, in tab order (none from an engine older than v2.092). */
  layouts: FileLayout[];
  /** Closed objects of model space (polylines, circles, hatches…), for rooms from outline layers. */
  outlines: () => CadObject[];
  /** Blocks inserted in model space with their attributes (fixtures with a CCT attribute: Loads from CAD). */
  blocks: () => (CadBlock & { layer: string; handle: string })[];
  /** Marks objects erased in the app (CROP), by handle, replacing the last list: they are no longer picked or snapped
   * to. Answers which objects (ids) and segment ranges the view leaves out (src/model/cadErased.ts). */
  erase: (handles: string[]) => Promise<ErasedParts>;
  /** Ends the drawing's engine and gives back its memory. What was read stays usable; `snap` and `pick` find nothing. */
  close: () => void;
}

/** Snap kinds, as the engine numbers them. */
export const SNAP = { endpoint: 1, midpoint: 2, center: 4, intersection: 8, insertion: 16, node: 32, quadrant: 64, nearest: 128, perpendicular: 256 } as const;
export const SNAP_NAMES: Record<number, string> = { 1: 'Endpoint', 2: 'Midpoint', 4: 'Centre', 8: 'Intersection', 16: 'Insertion', 32: 'Node', 64: 'Quadrant', 128: 'Nearest', 256: 'Perpendicular' };
/** Colour of "foreground" lines (index 7): white on a dark model space, black on a light one. */
export const INK = 0xff000007;

const MAX_BYTES = 100 * 1024 * 1024;
const SAMPLES: Record<string, string> = { 'sample-villa-gf.dxf': sampleGf, 'sample-villa-ff.dxf': sampleFf };

/** How long a new worker may take to say it is ready before the engine runs in the page instead. */
const WORKER_START_MS = 15_000;

interface Engine {
  kind: CadView['engine'];
  call: <K extends keyof EngineOps>(op: K, ...args: Parameters<EngineOps[K]>) => Promise<ReturnType<EngineOps[K]>>;
  end: () => void;
}

async function engineBytes(): Promise<Uint8Array> {
  const desktop = window.lvds?.cadFile?.engine;
  return desktop ? desktop() : new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
}

async function engineInPage(wasm: Uint8Array): Promise<Engine> {
  const ops = (await import('./cadOps')).engineOps();
  ops.init(wasm);
  return { kind: 'page', call: async (op, ...args) => (ops[op] as (...a: unknown[]) => never)(...args), end: ops.free };
}

/** The engine in a worker of its own, or null if one cannot start here. Calls are answered in the order made. */
async function engineInWorker(wasm: Uint8Array): Promise<Engine | null> {
  if (typeof Worker === 'undefined') return null;
  let worker: Worker;
  try {
    worker = new (await import('./cadWorker?worker&inline')).default();
  } catch { return null; }
  const waiting = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>();
  let next = 1, stopped: string | null = null;
  const stop = (why: string) => {
    stopped ??= why;
    for (const w of waiting.values()) w.reject(new Error(why));
    waiting.clear();
  };
  worker.onmessage = ({ data }: MessageEvent<EngineAnswer>) => {
    const w = waiting.get(data.id);
    waiting.delete(data.id);
    if ('error' in data) w?.reject(new Error(data.error)); else w?.resolve(data.value as never);
  };
  worker.onerror = (e) => stop(e.message || 'The CAD engine stopped.');
  worker.onmessageerror = () => stop('The CAD engine stopped.');
  const engine: Engine = {
    kind: 'worker',
    call: (op, ...args) => new Promise((resolve, reject) => {
      if (stopped) { reject(new Error(stopped)); return; }
      const id = next;
      next += 1;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, op, args });
    }),
    end: () => { worker.terminate(); stop('The drawing was closed.'); }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([engine.call('init', wasm), new Promise((_, no) => { timer = setTimeout(() => no(new Error('The CAD engine did not start.')), WORKER_START_MS); })]);
    return engine;
  } catch {
    engine.end();
    return null;
  } finally { clearTimeout(timer); }
}

async function startEngine(): Promise<Engine> {
  const wasm = await engineBytes();
  return (await engineInWorker(wasm)) ?? engineInPage(wasm);
}

/** An engine for saving, shared while saves overlap (a set of sheets) and ended after the last, so its memory comes back. */
let saving: { engine: Promise<Engine>; uses: number } | null = null;
async function withSavingEngine<T>(run: (e: Engine) => Promise<T>): Promise<T> {
  const s = (saving ??= { engine: startEngine(), uses: 0 });
  s.uses += 1;
  try {
    return await run(await s.engine);
  } finally {
    s.uses -= 1;
    if (!s.uses) {
      if (saving === s) saving = null;
      void s.engine.then((e) => e.end(), () => {});
    }
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NO_SNAP = new Float64Array();

/** Opens a drawing from its bytes. */
export async function openDrawing(file: string, bytes: Uint8Array, path?: string): Promise<CadView> {
  if (!/\.(dwg|dxf)$/i.test(file)) throw new Error(`${file} is not a DWG or DXF file.`);
  if (!bytes.length) throw new Error(`${file} is empty.`);
  if (bytes.length > MAX_BYTES) throw new Error(`${file} is larger than ${MAX_BYTES / 1024 / 1024} MB.`);
  const engine = await startEngine();
  let doc: ReturnType<EngineOps['open']>;
  try {
    doc = await engine.call('open', bytes);
  } catch (e) {
    engine.end();
    throw new Error(`${file} could not be read (${message(e)}).`);
  }
  const info = JSON.parse(doc.info) as CadInfo;
  let outlines: CadObject[] | undefined;
  return {
    file, path, info, bytes, engine: engine.kind, layouts: fileLayouts(doc.layouts, doc.papers),
    segs: doc.segs, segLayers: doc.segLayers, segColors: doc.segColors, segLinetypes: doc.segLinetypes,
    snap: (x, y, r, mask, layersOn, from) => engine.call('snap', x, y, r, mask, layersOn, from?.[0] ?? NaN, from?.[1] ?? NaN).catch(() => NO_SNAP),
    pick: (x, y, tol, layersOn, closedOnly = false) => engine.call('pick', x, y, tol, layersOn, closedOnly).then((j) => (j ? (JSON.parse(j) as CadObject) : null), () => null),
    outlines: () => (outlines ??= JSON.parse(doc.outlines) as CadObject[]),
    blocks: () => JSON.parse(doc.blocks) as (CadBlock & { layer: string; handle: string })[],
    erase: (handles) => engine.call('erase', JSON.stringify(handles)).then((j) => JSON.parse(j) as ErasedParts),
    close: () => engine.end()
  };
}

/** The engine's layouts and their papers as the view keeps them; a layout whose paper could not be read is left out. */
function fileLayouts(json: string | undefined, papers: ({ info: string; segs: Float32Array; segColors: Uint32Array; segLayers: Uint16Array } | null)[] | undefined): FileLayout[] {
  if (!json || !papers) return [];
  const list = JSON.parse(json) as Omit<FileLayout, 'origin' | 'segs' | 'segColors' | 'segLayers' | 'texts' | 'layers'>[];
  return list.flatMap((l, i) => {
    const p = papers[i];
    if (!p) return [];
    const info = JSON.parse(p.info) as CadInfo;
    return [{ ...l, origin: info.origin, segs: p.segs, segColors: p.segColors, segLayers: p.segLayers, texts: info.texts, layers: info.layers }];
  });
}

/** The browser's file picker for one DWG / DXF; null when cancelled. */
function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dwg,.dxf';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Asks for a drawing (desktop dialog or browser picker) and opens it; null when cancelled. */
export async function chooseDrawing(): Promise<CadView | null> {
  const desktop = window.lvds?.cadFile?.openBytes;
  if (desktop) {
    const r = await desktop();
    return r ? openDrawing(r.file, r.bytes, r.path) : null;
  }
  const f = await pickFile();
  return f ? openDrawing(f.name, new Uint8Array(await f.arrayBuffer())) : null;
}

/** Reopens a drawing opened before (desktop only: by its path); null when it is no longer there. */
export async function reopenDrawing(path: string): Promise<CadView | null> {
  const r = await window.lvds?.cadFile?.readBytes?.(path);
  return r ? openDrawing(r.file, r.bytes, r.path) : null;
}

/** One of the sample plans shipped with the app (a test aid). */
export async function sampleDrawing(name: string): Promise<CadView | null> {
  const desktop = window.lvds?.cadFile?.sampleBytes;
  if (desktop) {
    const r = await desktop(name);
    return r ? openDrawing(r.file, r.bytes) : null;
  }
  const url = SAMPLES[name];
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The sample plan ${name} could not be loaded.`);
  return openDrawing(name, new Uint8Array(await res.arrayBuffer()));
}

/** A drawing's lines made absolute, with its layers, units, texts and fills, as a reference under a plan (src/model/cadRefs.ts). */
export function refGeometryOf(v: CadView, stamp?: string): RefGeometry {
  const [ox, oy] = v.info.origin, n = v.segLayers.length, segs = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) { segs[i * 4] = v.segs[i * 4] + ox; segs[i * 4 + 1] = v.segs[i * 4 + 1] + oy; segs[i * 4 + 2] = v.segs[i * 4 + 2] + ox; segs[i * 4 + 3] = v.segs[i * 4 + 3] + oy; }
  const texts = v.info.texts.map((t) => ({ x: t.x, y: t.y, h: t.h, rot: t.rot, s: t.s, layer: t.layer }));
  const fills = (v.info.fills ?? []).map((f) => ({
    layer: f.layer, solid: f.solid,
    loops: f.loops.map(([a, z]) => Array.from({ length: z - a }, (_, k): [number, number] => [segs[(a + k) * 4], segs[(a + k) * 4 + 1]])),
    lines: f.lines.map((l) => ({ angle: l.angle, base: l.base, offset: l.offset, dashes: l.dashes }))
  }));
  return { file: v.file, units: v.info.units, segs, segLayers: Uint16Array.from(v.segLayers), layers: v.info.layers.map((l) => ({ name: l.name, rgb: l.rgb })), stamp: stamp ?? `${v.bytes.length}`, texts, fills };
}
/** A reference drawing read from its bytes. Its engine is ended once read, so a reference keeps only its lines, texts and fills. */
export async function readRefGeometry(file: string, bytes: Uint8Array, stamp?: string): Promise<RefGeometry> {
  const v = await openDrawing(file, bytes);
  try { return refGeometryOf(v, stamp); } finally { v.close(); }
}

/** When a drawing file was last changed (desktop app only); undefined when it cannot tell, null when the file is gone. */
export async function fileStamp(path: string | undefined): Promise<string | null | undefined> {
  const stat = path ? window.lvds?.cadFile?.stat : undefined;
  if (!stat || !path) return undefined;
  const s = await stat(path).catch(() => undefined);
  return s === undefined ? undefined : s ? `${s.mtimeMs}:${s.size}` : null;
}

/** A device written into the saved drawing: position (drawing units), radius, the letters inside and its label. */
export interface DeviceOut { layer: string; x: number; y: number; r: number; text: string; label: string }

/** The drawing saved as DXF with the devices and what was drawn in the app added on their own layers (the architect's
 * entities kept as read). */
/** `version`: the file version by year ('2018' … '2000', 'R12' for DXF), or '' for the drawing's own. */
export async function drawingWithDevices(view: Pick<CadView, 'bytes'>, devices: DeviceOut[], shapes: unknown[] = [], as: 'dxf' | 'dwg' = 'dxf', erased: string[] = [], version = ''): Promise<Uint8Array> {
  return withSavingEngine(async (engine) => {
    try {
      // DWG: in the version the drawing came in, else the 2018 format (engines/cad-reader/src/doc.rs dwg_bytes).
      // Objects erased in the app (CROP) are left out of the copy saved; the drawing file itself is never changed.
      return await engine.call('save', as, view.bytes, JSON.stringify(devices), JSON.stringify(shapes), JSON.stringify(erased), version);
    } catch (e) {
      throw new Error(`The drawing could not be saved (${message(e)}).`);
    }
  });
}

/** The exact pieces of objects of a drawing, by handle (CROP): a block insert gives what it draws, nested blocks and
 * arrays expanded (engines/cad-reader/src/doc/explode.rs). Read from the drawing's bytes by the saving engine. */
export async function explodeObjects(view: Pick<CadView, 'bytes'>, handles: string[]): Promise<{ pieces: Record<string, CadPiece[]>; truncated: boolean }> {
  return withSavingEngine(async (engine) => {
    try {
      return JSON.parse(await engine.call('explode', view.bytes, JSON.stringify(handles))) as { pieces: Record<string, CadPiece[]>; truncated: boolean };
    } catch (e) {
      throw new Error(`The block could not be read (${message(e)}).`);
    }
  });
}

/** A DXF the app made (an SLD sheet) saved as DWG by the same engine, in the 2018 format, as it writes a drawing older than
 * 2000. Layers, title block and texts are kept as in the DXF. */
export async function dxfToDwg(dxf: string): Promise<Uint8Array> {
  return withSavingEngine(async (engine) => {
    try {
      return await engine.call('save', 'dwg', new TextEncoder().encode(dxf), '[]', '[]');
    } catch (e) {
      throw new Error(`The DWG could not be made (${message(e)}).`);
    }
  });
}
