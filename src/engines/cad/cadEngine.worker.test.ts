// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerCall, engineOps, type EngineCall } from './cadOps';
import { drawingWithDevices, dxfToDwg, openDrawing, SNAP } from './cadEngine';

const root = path.resolve(__dirname, '../../..');
const bytes = (rel: string) => new Uint8Array(readFileSync(path.join(root, rel)));
const sample = () => bytes('electron/samples/sample-villa-gf.dxf');

/** A worker in all but its thread: the real engine and the real answers, delivered later as a worker's are. */
class FakeWorker {
  static made: FakeWorker[] = [];
  static failOn: 'construct' | 'load' | null = null;
  static hold = false;
  ops = engineOps();
  ended = false;
  calls: string[] = [];
  held: (() => void)[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor() {
    if (FakeWorker.failOn === 'construct') throw new Error('Workers are not allowed here');
    FakeWorker.made.push(this);
    if (FakeWorker.failOn === 'load') setTimeout(() => this.onerror?.({ message: 'The script did not load' }), 0);
  }
  postMessage(data: EngineCall) {
    if (FakeWorker.failOn === 'load') return;
    this.calls.push(data.op);
    const deliver = () => { if (!this.ended) this.onmessage?.({ data: answerCall(this.ops, data).answer }); };
    if (FakeWorker.hold && data.op !== 'init') this.held.push(deliver); else setTimeout(deliver, 0);
  }
  terminate() { this.ended = true; }
}
vi.mock('./cadWorker?worker&inline', () => ({ default: class { constructor() { return new FakeWorker(); } } }));

beforeEach(() => {
  FakeWorker.made = [];
  FakeWorker.failOn = null;
  FakeWorker.hold = false;
  vi.stubGlobal('Worker', FakeWorker);
  (window as { lvds?: unknown }).lvds = { cadFile: { engine: async () => bytes('electron/cad/lvds_cad_reader_bg.wasm') } };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { lvds?: unknown }).lvds;
});

describe('the CAD engine in a worker', () => {
  it('opens a drawing there, and answers snaps and picks from it', async () => {
    const v = await openDrawing('sample-villa-gf.dxf', sample());
    expect(v.engine).toBe('worker');
    expect(FakeWorker.made).toHaveLength(1);
    expect(v.info.format).toBe('DXF');
    expect(v.segs.length).toBe(v.info.segments * 4);
    const on = new Uint8Array(v.info.layers.length).fill(1);
    expect(Array.from(await v.snap(110, 90, 50, SNAP.endpoint, on))).toEqual([100, 100, SNAP.endpoint]);
    expect((await v.pick(6687.5 + 190, 7375, 30, on))?.block).toBe('L1');
    expect(await v.pick(-90000, -90000, 1, on)).toBeNull();
    expect(v.blocks().some((b) => b.block === 'L1')).toBe(true);
    expect(Array.isArray(v.outlines())).toBe(true);
    v.close();
  });

  it('answers in the order asked', async () => {
    const v = await openDrawing('sample-villa-gf.dxf', sample());
    const on = new Uint8Array(v.info.layers.length).fill(1), order: number[] = [];
    await Promise.all([1, 2, 3].map((i) => v.snap(110, 90, 50, SNAP.endpoint, on).then(() => order.push(i))));
    expect(order).toEqual([1, 2, 3]);
    v.close();
  });

  it('ends the worker when closed, finds nothing afterwards, and keeps what was read', async () => {
    const v = await openDrawing('sample-villa-gf.dxf', sample());
    const on = new Uint8Array(v.info.layers.length).fill(1), w = FakeWorker.made[0];
    FakeWorker.hold = true;
    const waiting = v.snap(110, 90, 50, SNAP.endpoint, on); // asked just before the close: answered, not left hanging
    v.close();
    expect(w.ended).toBe(true);
    expect(Array.from(await waiting)).toEqual([]);
    expect(Array.from(await v.snap(110, 90, 50, SNAP.endpoint, on))).toEqual([]);
    expect(await v.pick(6877.5, 7375, 30, on)).toBeNull();
    expect(v.segs.length).toBeGreaterThan(0);
    expect(v.blocks().length).toBeGreaterThan(0);
  });

  it('gives a bad file the same message, and ends its worker', async () => {
    await expect(openDrawing('x.dwg', new TextEncoder().encode('AC1032 broken'))).rejects.toThrow(/x\.dwg could not be read/);
    expect(FakeWorker.made[0].ended).toBe(true);
  });

  it('saves in a worker of its own, shared by saves that overlap, and ended after the last', async () => {
    const v = await openDrawing('sample-villa-gf.dxf', sample());
    const [drawing, dwg] = await Promise.all([drawingWithDevices(v, [], [], 'dxf'), dxfToDwg(new TextDecoder().decode(sample()))]);
    expect(new TextDecoder().decode(drawing)).toContain('SECTION');
    expect(new TextDecoder().decode(dwg.slice(0, 6))).toBe('AC1032');
    const [view, saver] = FakeWorker.made;
    expect(FakeWorker.made).toHaveLength(2);
    expect(saver.calls.filter((c) => c === 'save')).toHaveLength(2);
    await vi.waitFor(() => expect(saver.ended).toBe(true));
    expect(view.ended).toBe(false);
    v.close();
  });

  it('runs in the page when a worker cannot be made', async () => {
    FakeWorker.failOn = 'construct';
    const v = await openDrawing('sample-villa-gf.dxf', sample());
    expect(v.engine).toBe('page');
    const on = new Uint8Array(v.info.layers.length).fill(1);
    expect(Array.from(await v.snap(110, 90, 50, SNAP.endpoint, on))).toEqual([100, 100, SNAP.endpoint]);
    v.close();
    expect(Array.from(await v.snap(110, 90, 50, SNAP.endpoint, on))).toEqual([]);
  });

  it('runs in the page when a worker cannot load', async () => {
    FakeWorker.failOn = 'load';
    const v = await openDrawing('sample-villa-gf.dxf', sample());
    expect(v.engine).toBe('page');
    expect(FakeWorker.made[0].ended).toBe(true);
    expect(v.info.format).toBe('DXF');
    v.close();
  });

  it('runs in the page when a worker never says it is ready', async () => {
    const real = FakeWorker.prototype.postMessage;
    FakeWorker.prototype.postMessage = () => {};
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => { queueMicrotask(fn); return 0; }) as unknown as typeof setTimeout);
    try {
      const v = await openDrawing('sample-villa-gf.dxf', sample());
      expect(v.engine).toBe('page');
      expect(FakeWorker.made[0].ended).toBe(true);
      v.close();
    } finally {
      FakeWorker.prototype.postMessage = real;
      timer.mockRestore();
    }
  });

  it('finds nothing, rather than hanging, when the worker stops by itself', async () => {
    const v = await openDrawing('sample-villa-gf.dxf', sample());
    const on = new Uint8Array(v.info.layers.length).fill(1), w = FakeWorker.made[0];
    FakeWorker.hold = true;
    const waiting = v.pick(6877.5, 7375, 30, on);
    w.onerror?.({ message: 'Out of memory' });
    expect(await waiting).toBeNull();
    expect(Array.from(await v.snap(110, 90, 50, SNAP.endpoint, on))).toEqual([]);
    v.close();
  });

  it('hands the drawing over from the worker rather than copying it', () => {
    const ops = engineOps();
    ops.init(bytes('electron/cad/lvds_cad_reader_bg.wasm'));
    const { answer, transfer } = answerCall(ops, { id: 1, op: 'open', args: [sample()] });
    expect('error' in answer).toBe(false);
    expect(transfer).toHaveLength(4);
    expect(answerCall(ops, { id: 2, op: 'snap', args: [110, 90, 50, SNAP.endpoint, new Uint8Array(40).fill(1)] }).transfer).toHaveLength(1);
    expect(answerCall(ops, { id: 3, op: 'pick', args: [-90000, -90000, 1, new Uint8Array(40).fill(1), false] }).transfer).toEqual([]);
    expect(answerCall(ops, { id: 4, op: 'open', args: [new TextEncoder().encode('AC1032 broken')] }).answer).toMatchObject({ id: 4, error: expect.any(String) });
    ops.free();
  });
});
