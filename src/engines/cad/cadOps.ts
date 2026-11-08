import { CadDoc, explodeObjects, exportDwg, exportDxf, initSync } from '../../../electron/cad/lvds_cad_reader.js';

/** What the CAD engine does, wherever it runs: in a worker of its own (cadWorker.ts), or in the page when a worker
 * cannot start (cadEngine.ts). One set of these holds one open drawing. */
export function engineOps() {
  let doc: CadDoc | null = null;
  return {
    init(wasm: Uint8Array) { initSync({ module: wasm }); },
    open(bytes: Uint8Array) {
      doc = new CadDoc(bytes);
      return { info: doc.info(), segs: doc.segments(), segLayers: doc.segment_layers(), segColors: doc.segment_colors(), segLinetypes: doc.segment_linetypes(), outlines: doc.outlines(), blocks: doc.blocks() };
    },
    snap: (x: number, y: number, r: number, mask: number, layersOn: Uint8Array, fx = NaN, fy = NaN) => (doc ? doc.snap(x, y, r, mask, layersOn, fx, fy) : new Float64Array()),
    pick: (x: number, y: number, tol: number, layersOn: Uint8Array, closedOnly: boolean) => (doc ? doc.pick(x, y, tol, layersOn, closedOnly) : ''),
    save: (as: 'dxf' | 'dwg', bytes: Uint8Array, devices: string, shapes: string, erased = '[]', version = '') => (as === 'dwg' ? exportDwg : exportDxf)(bytes, devices, shapes, erased, version),
    /** Objects of the open drawing erased in the app (CROP): no longer picked or snapped to. */
    erase: (handles: string) => (doc ? doc.set_erased(handles) : '{"objects":[],"ranges":[]}'),
    /** The exact pieces of objects of a drawing (its bytes), by handle (CROP). */
    explode: (bytes: Uint8Array, handles: string) => explodeObjects(bytes, handles),
    free() { doc?.free(); doc = null; }
  };
}

export type EngineOps = ReturnType<typeof engineOps>;
export interface EngineCall { id: number; op: keyof EngineOps; args: unknown[] }
export type EngineAnswer = { id: number; value: unknown } | { id: number; error: string };

/** Answers one call. The typed arrays in the answer are the engine's own copies, so they are handed over, not copied. */
export function answerCall(ops: EngineOps, { id, op, args }: EngineCall): { answer: EngineAnswer; transfer: Transferable[] } {
  try {
    const value = (ops[op] as (...a: unknown[]) => unknown)(...args);
    const parts = ArrayBuffer.isView(value) ? [value] : value && typeof value === 'object' ? Object.values(value) : [];
    return { answer: { id, value }, transfer: parts.filter((p): p is ArrayBufferView => ArrayBuffer.isView(p)).map((p) => p.buffer as ArrayBuffer) };
  } catch (e) {
    return { answer: { id, error: e instanceof Error ? e.message : String(e) }, transfer: [] };
  }
}
