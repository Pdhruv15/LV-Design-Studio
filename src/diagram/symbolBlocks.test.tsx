import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from '../components/SystemDiagram';
import { svgToDxf } from './exportSvg';
import { Sym, SYMBOLS, SYMBOL_IDS, symSvg, type SymbolId } from './symbolLibrary';
import { boardSheetSvg } from './boardSheet';
import { dxfBlockName, toDxf, type DxfPrimitive } from '../docs/dxf';
import { buildSheetDxf } from '../docs/sheetDxf';
import { dxfExportProject } from '../../tests/fixtures/dxfExport';

type Insert = Extract<DxfPrimitive, { type: 'insert' }>;
type Pt = [number, number];
const noop = () => {};
const inserts = (items: DxfPrimitive[]) => items.filter((i): i is Insert => i.type === 'insert');
const count = (text: string, part: string) => text.split(part).length - 1;

/** A block's items placed where the insert puts them. */
function expand(ins: Insert): DxfPrimitive[] {
  const k = ins.scale ?? 1, r = (ins.rotation ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const at = (x: number, y: number): Pt => [ins.x + k * (x * c - y * s), ins.y + k * (x * s + y * c)];
  return ins.block.items.map((i): DxfPrimitive => {
    if (i.type === 'line') { const [x1, y1] = at(i.x1, i.y1), [x2, y2] = at(i.x2, i.y2); return { ...i, x1, y1, x2, y2 }; }
    if (i.type === 'polyline') return { ...i, points: i.points.map(([x, y]) => at(x, y)) };
    if (i.type === 'circle') { const [x, y] = at(i.x, i.y); return { ...i, x, y, r: i.r * k }; }
    if (i.type === 'text') { const [x, y] = at(i.x, i.y); const { rotation: _r, ...rest } = i; const turn = (i.rotation ?? 0) + (ins.rotation ?? 0); return { ...rest, x, y, height: i.height * k, ...(Math.abs(turn) > 0.5 ? { rotation: turn } : {}) }; }
    return i;
  });
}
/** Geometry only: layers differ by design, text loses its fit width. */
const geometry = (items: DxfPrimitive[]) => items.map((i) => {
  const { layer: _l, tag: _t, ...rest } = i as DxfPrimitive & { width?: number };
  if (rest.type === 'text') delete (rest as { width?: number }).width;
  return rest;
});
function near(a: unknown, b: unknown, path = ''): void {
  if (typeof a === 'number' && typeof b === 'number') { expect(Math.abs(a - b), path).toBeLessThan(0.01); return; }
  if (Array.isArray(a) && Array.isArray(b)) { expect(a.length, path).toBe(b.length); a.forEach((v, i) => near(v, b[i], `${path}[${i}]`)); return; }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    expect(Object.keys(a).sort(), path).toEqual(Object.keys(b).sort());
    for (const key of Object.keys(a)) near((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    return;
  }
  expect(a, path).toEqual(b);
}
const stripped = (svg: string) => svg.replace(/ data-sym(?:-[a-z]+)?="[^"]*"/g, '');

describe('library symbols as CAD blocks', () => {
  beforeAll(() => vi.stubGlobal('DOMParser', DOMParser));
  afterAll(() => vi.unstubAllGlobals());

  it('gives every symbol and orientation its own block name', () => {
    const names = SYMBOL_IDS.flatMap((id) => [dxfBlockName(`LV-${id}`), dxfBlockName(`LV-${id}-UP`)]);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.startsWith('LV-'))).toBe(true);
  });

  // Expanded blocks equal the exploded symbol: breaker, RCD (ellipse), a dashed part, a flipped one; moved and turned.
  const cases: [SymbolId, boolean][] = [['cb', false], ['rcd', false], ['shunt', false], ['cb', true], ['rcbo', true]];
  it.each(cases)('expands %s (flipped: %s) to the exploded geometry', (id, flipped) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(40 25) rotate(30)">${symSvg(id, 12, 7, 1, flipped)}</g></svg>`;
    const got = svgToDxf(svg, 200);
    const list = inserts(got);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe(dxfBlockName(`LV-${id}${flipped ? '-UP' : ''}`));
    near(geometry(expand(list[0])), geometry(svgToDxf(stripped(svg), 200)));
  });

  it('scales a symbol drawn smaller', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(5 9)">${symSvg('cb', 20, 30, 0.5)}</g></svg>`;
    near(geometry(expand(inserts(svgToDxf(svg, 100))[0])), geometry(svgToDxf(stripped(svg), 100)));
  });

  it('keeps dash pieces in the block and the insert extent covers it', () => {
    const [ins] = inserts(svgToDxf(`<svg xmlns="http://www.w3.org/2000/svg">${symSvg('shunt', 0, 0)}</svg>`, 0));
    expect(ins.block.items.every((i) => i.layer === '0' && !('dashed' in i))).toBe(true);
    expect(ins.block.items.some((i) => i.type === 'polyline')).toBe(true);
    const pts = expand(ins).flatMap((i): Pt[] => i.type === 'line' ? [[i.x1, i.y1], [i.x2, i.y2]] : i.type === 'polyline' ? i.points : []);
    const [[x0, y0], [x1, y1]] = ins.extent!;
    for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(x0 - 1e-6); expect(x).toBeLessThanOrEqual(x1 + 1e-6); expect(y).toBeGreaterThanOrEqual(y0 - 1e-6); expect(y).toBeLessThanOrEqual(y1 + 1e-6); }
  });

  it('leaves side labels outside the block, as text', () => {
    const markup = renderToStaticMarkup(<svg><Sym id="rcbo" x={50} y={50} labels /></svg>);
    const items = svgToDxf(markup, 100);
    expect(inserts(items)).toHaveLength(1);
    expect(items.filter((i) => i.type === 'text').map((i) => (i as { text: string }).text)).toEqual(['IΔn']);
    expect(inserts(items)[0].block.items.some((i) => i.type === 'text' && i.text === 'IΔn')).toBe(false);
  });

  it('inserts every symbol of the exported SLD sheet, each block defined once', () => {
    const markup = renderToStaticMarkup(<SystemDiagram project={dxfExportProject} results={[]} selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />);
    const symbols = count(markup, ' data-sym="');
    expect(symbols).toBeGreaterThan(0);
    const dxf = buildSheetDxf(dxfExportProject, markup, 'A3');
    expect(count(dxf, '\r\nINSERT\r\n')).toBe(symbols);
    const blockNames = dxf.split('\r\nBLOCK\r\n').slice(1).map((b) => b.split('\r\n')[b.split('\r\n').indexOf('2') + 1]);
    expect(blockNames.length).toBeGreaterThan(0);
    expect(new Set(blockNames).size).toBe(blockNames.length);
    // Layer 0 is in the layer table for the block items.
    expect(dxf).toMatch(/\r\nLAYER\r\n2\r\n0\r\n/);
    if (process.env.LV_BLOCK_STATS) process.stderr.write(`inserts ${symbols}, blocks ${blockNames.length}\n`);
  });

  it('writes flipped symbols as a -UP block and the legend shares the blocks', () => {
    const up = svgToDxf(`<svg xmlns="http://www.w3.org/2000/svg">${symSvg('cb', 0, 0, 1, true)}${symSvg('cb', 9, 0, 1)}</svg>`, 50);
    const [a, b] = inserts(up);
    expect(a.name).toBe('LV-CB-UP');
    expect(b.name).toBe('LV-CB');
    const dxf = toDxf(up);
    expect(count(dxf, '\r\nBLOCK\r\n')).toBe(2);
    const live = inserts(svgToDxf(renderToStaticMarkup(<svg><Sym id="cb" x={1} y={2} /></svg>), 50))[0];
    expect(live.block).toBe(b.block);
    const sheet = boardSheetSvg(dxfExportProject, dxfExportProject.boards[0], []);
    const legend = inserts(svgToDxf(sheet.svg, sheet.h));
    expect(count(sheet.svg, ' data-sym="')).toBe(legend.length);
    for (const i of legend) expect(SYMBOLS[i.block.name.replace(/^LV-/, '').replace(/-UP$/, '').toLowerCase() as SymbolId]).toBeDefined();
  });
});
