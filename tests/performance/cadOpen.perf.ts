import { it, expect } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { engineOps } from '../../src/engines/cad/cadOps';
import { CadDoc, readDrawing } from '../../electron/cad/lvds_cad_reader.js';
import type { ShapeOut } from '../../src/model/cadSketch';

/** Where the time and size go when a large DWG / DXF is opened (design input for a cache of decoded drawings). */
type Pt = [number, number];
const ops = engineOps();
ops.init(new Uint8Array(fs.readFileSync('electron/cad/lvds_cad_reader_bg.wasm')));
const base = new Uint8Array(fs.readFileSync('tests/fixtures/cad/plan-2018.dwg'));

/** N rooms in a grid, 6000 apart, plus the one block FIX. */
function roomShapes(n: number): ShapeOut[] {
  const cols = Math.ceil(Math.sqrt(n));
  const out: ShapeOut[] = [{ layer: '', kind: 'blockdef', pts: [], name: 'FIX', units: 0, text: '', items: [
    { layer: '0', kind: 'circle', pts: [[0, 0]], r: 100 },
    { layer: '0', kind: 'line', pts: [[-150, 0], [150, 0]] },
    { layer: '0', kind: 'line', pts: [[0, -150], [0, 150]] }] }];
  for (let i = 0; i < n; i++) {
    const x = (i % cols) * 6000, y = Math.floor(i / cols) * 6000;
    const p = (dx: number, dy: number): Pt => [x + dx, y + dy];
    out.push(
      { layer: 'A-WALL', kind: 'pline', pts: [p(0, 0), p(5000, 0), p(5000, 4000), p(0, 4000)], closed: true },
      { layer: 'A-DOOR', kind: 'line', pts: [p(1000, 0), p(1900, 0)] },
      { layer: 'A-DOOR', kind: 'line', pts: [p(1000, 0), p(1000, 900)] },
      { layer: 'A-COLS', kind: 'circle', pts: [p(2500, 2000)], r: 200 },
      { layer: 'A-TEXT', kind: 'text', pts: [p(300, 300)], text: `Room ${i + 1}`, h: 250, rot: 0 },
      { layer: 'E-LIGHT', kind: 'insert', pts: [p(1500, 2000)], name: 'FIX', sc: 1, rot: 0, atts: [] },
      { layer: 'E-LIGHT', kind: 'insert', pts: [p(3500, 2000)], name: 'FIX', sc: 1, rot: 0, atts: [] });
  }
  return out;
}
const write = (as: 'dwg' | 'dxf', n: number) => ops.save(as, base, '[]', JSON.stringify(roomShapes(n)), '[]', '');

const median = (f: () => void, runs = 5) => {
  f();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) { const s = performance.now(); f(); t.push(performance.now() - s); }
  return t.sort((a, b) => a - b)[Math.floor(runs / 2)];
};
const mb = (b: number) => (b / 1048576).toFixed(2);
const kb = (b: number) => (b / 1024).toFixed(1);
const ms = (t: number) => t.toFixed(1);

interface Row { label: string; n: number; bytes: Uint8Array }
const log = (s: string) => process.stdout.write(s + '\n');

function openParts(bytes: Uint8Array) {
  const decode = median(() => new CadDoc(bytes).free());
  const doc = new CadDoc(bytes);
  try {
    const info = median(() => doc.info());
    const segs = median(() => { doc.segments(); doc.segment_layers(); doc.segment_colors(); doc.segment_linetypes(); });
    const outlines = median(() => doc.outlines());
    const blocks = median(() => doc.blocks());
    const layouts = median(() => { const l = doc.layouts(); (JSON.parse(l) as unknown[]).forEach((_, i) => doc.take_layout(i)?.free()); });
    const arrays = [doc.segments(), doc.segment_layers(), doc.segment_colors(), doc.segment_linetypes()];
    return { decode, info, segs, outlines, blocks, layouts, segBytes: arrays.reduce((s, a) => s + a.byteLength, 0), infoLen: doc.info().length, outLen: doc.outlines().length, blkLen: doc.blocks().length, segCount: arrays[0].length };
  } finally { doc.free(); }
}

it('large drawing open benchmark', () => {
  const info = (global as unknown as { process: NodeJS.Process }).process;
  log(`\nnode ${info.version} · ${info.platform}/${info.arch}`);
  // Calibrate: bytes per room from a small write, then scale to 1, 3 and 10 MB.
  const baseSize = write('dwg', 0).byteLength;
  const probe = 400, probeSize = write('dwg', probe).byteLength, per = (probeSize - baseSize) / probe;
  log(`base ${baseSize} B; ${probe} rooms ${probeSize} B; ${per.toFixed(1)} B/room`);
  const rows: Row[] = [];
  const writes: string[] = [];
  for (const target of [1, 3, 10]) {
    let n = Math.round(((target * 1048576) - baseSize) / per);
    let dwg: Uint8Array = new Uint8Array(0);
    for (let k = 0; k < 2; k++) {
      const s = performance.now();
      dwg = write('dwg', n);
      const t = performance.now() - s;
      if (k === 0) writes.push(`${target} MB target: N=${n} DWG ${mb(dwg.byteLength)} MB in ${ms(t)} ms`);
      n = Math.round(n * (target * 1048576) / dwg.byteLength);
      if (Math.abs(dwg.byteLength / (target * 1048576) - 1) < 0.05) break;
      if (t > 120000) break;
    }
    const s2 = performance.now();
    dwg = write('dwg', n);
    const tDwg = performance.now() - s2;
    const s3 = performance.now();
    const dxf = write('dxf', n);
    const tDxf = performance.now() - s3;
    writes.push(`final N=${n}: DWG ${mb(dwg.byteLength)} MB write ${ms(tDwg)} ms; DXF ${mb(dxf.byteLength)} MB write ${ms(tDxf)} ms`);
    rows.push({ label: `${target} MB DWG`, n, bytes: dwg }, { label: `${target} MB DXF`, n, bytes: dxf });
    // CAD_BENCH_DUMP=<folder>: keep the drawings, e.g. to time the engine's own steps natively.
    if (process.env.CAD_BENCH_DUMP) for (const [ext, b] of [['dwg', dwg], ['dxf', dxf]] as const) fs.writeFileSync(`${process.env.CAD_BENCH_DUMP}/${target}mb.${ext}`, b);
    if (tDwg > 120000) { writes.push('write over 2 minutes: stopped here'); break; }
  }
  log('\nWrite times\n' + writes.map((w) => '- ' + w).join('\n'));

  const head = rows.map((r) => r.label);
  const t1: Record<string, string[]> = {};
  const t2: Record<string, string[]> = {};
  const segCounts: Record<string, number> = {};
  for (const r of rows) {
    log('measuring ' + r.label);
    const p = openParts(r.bytes);
    log('parts done');
    segCounts[r.label] = p.segCount;
    const opener = engineOps();
    const open = median(() => { opener.open(r.bytes); opener.free(); });
    const result = opener.open(r.bytes);
    opener.free();
    const clone = median(() => { structuredClone(result); });
    const arrs = [result.segs, result.segLayers, result.segColors, result.segLinetypes] as ArrayBufferView[];
    const total = arrs.reduce((s, a) => s + a.byteLength, 0);
    const copy = median(() => {
      const buf = new ArrayBuffer(total); let off = 0;
      for (const a of arrs) { new Uint8Array(buf, off, a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)); off += a.byteLength; }
      off = 0;
      for (const a of arrs) { new Uint8Array(buf.slice(off, off + a.byteLength)); off += a.byteLength; }
    });
    const sha = median(() => { crypto.createHash('sha256').update(r.bytes).digest('hex'); });
    const rd = median(() => { readDrawing(r.bytes); });
    const json = readDrawing(r.bytes);
    const parse = median(() => { JSON.parse(json); });
    t1[r.label] = [mb(r.bytes.byteLength), String(r.n), String(p.segCount), ms(p.decode), ms(p.info), ms(p.segs), ms(p.outlines), ms(p.blocks), ms(p.layouts), ms(open), mb(p.segBytes), kb(p.infoLen), kb(p.outLen), kb(p.blkLen), ms(clone), ms(copy), ms(sha)];
    t2[r.label] = [mb(r.bytes.byteLength), ms(rd), ms(parse), mb(json.length)];
  }
  const rowNames1 = ['file MB', 'N rooms', 'segment count', 'new CadDoc (decode) ms', 'info ms', 'segments+layers+colors+linetypes ms', 'outlines ms', 'blocks ms', 'layouts+take_layout ms', 'ops.open (whole) ms', 'segment arrays MB', 'info JSON KB', 'outlines JSON KB', 'blocks JSON KB', 'structuredClone(open result) ms', 'segment arrays copy to one buffer and back ms', 'sha256 of file ms'];
  const table = (names: string[], data: Record<string, string[]>) => ['| step | ' + head.join(' | ') + ' |', '|---|' + head.map(() => '---:|').join(''), ...names.map((nm, i) => `| ${nm} | ` + head.map((h) => data[h][i]).join(' | ') + ' |')].join('\n');
  log('\nDesign CAD view path (ops.open as the worker does it)\n\n' + table(rowNames1, t1));
  log('\nMain-process path (readDrawing + JSON.parse)\n\n' + table(['file MB', 'readDrawing ms', 'JSON.parse ms', 'JSON length MB'], t2) + '\n');

  // Sanity: segments grow with N, and the DWG reopens.
  const dwgs = rows.filter((r) => r.label.endsWith('DWG'));
  for (let i = 1; i < dwgs.length; i++) expect(segCounts[dwgs[i].label]).toBeGreaterThanOrEqual(segCounts[dwgs[i - 1].label]); // reaches a ceiling (see the table)
  expect(segCounts[dwgs[1].label]).toBeGreaterThan(segCounts[dwgs[0].label]);
  const again = new CadDoc(dwgs[0].bytes);
  expect(again.segments().length).toBeGreaterThan(0);
  again.free();
});
