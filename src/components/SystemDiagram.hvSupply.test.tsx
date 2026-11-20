// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import { MV_DY } from '../diagram/mvArrangement';
import { svgToDxf } from '../diagram/exportSvg';
import type { Board, Project } from '../types';

const noop = () => {};
function drawn(project: Project, wholeProject?: Project): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} wholeProject={wholeProject} results={evaluateProject(project)} hideLegend selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />
  );
  return host;
}
const texts = (h: Element) => [...h.querySelectorAll('text')].map((t) => t.textContent);
const num = (e: Element | null | undefined, a: string) => Number(e?.getAttribute(a));
const withRmu: Project = { ...sampleProject, boards: sampleProject.boards.map((b) => (b.id === 'MDB-1' ? { ...b, rmu: 'RMU-1' } : b)) };
const meterCabinet: Board = { id: 'MDB-A', name: 'MDB-A', kind: 'MDB', ratedCurrentA: 200, supply: { fedFrom: 'DEWA', ratingA: 200, device: 'MCCB' } };

describe('SLD: grid source and RMU', () => {
  it('draws one 11 kV line under the utility without RMU or substation names; a meter cabinet has its own source', () => {
    const h = drawn({ ...sampleProject, boards: [meterCabinet, ...sampleProject.boards] });
    expect(texts(h)).toEqual(expect.arrayContaining(['Utility', '11 kV', 'DEWA supply']));
    expect(h.querySelector('.mvRing-ring')).toBeNull();
    // The main board on the authority supply moves after the transformers, with its own source symbol.
    const sup = h.querySelector('g.tx[data-lv-id="board:MDB-A"]')!;
    const tx = h.querySelector('g.tx[data-lv-id="board:MDB-1"]')!;
    expect(num(sup.querySelector('rect'), 'x')).toBeGreaterThan(num(tx.querySelector('[data-sym="tx"]'), 'data-sym-x'));
    expect(sup.querySelector('circle[r="11"]')).not.toBeNull();
  });

  it('draws the ring through the RMU, its ways from the RMU record, and the transformer under its tee-off', () => {
    const p: Project = { ...withRmu, gridSources: [{ id: 'G', name: 'GRID-1', operator: 'DEWA', kv: 11, faultMva: 500 }], rmus: [{ name: 'RMU-1', config: 'RRT', ikKa: 21, ikDurationS: 3, tOff: 'fuse', fuseA: 80 }] };
    const h = drawn(p);
    expect(texts(h)).toEqual(expect.arrayContaining(['DEWA', '11 kV · 500 MVA', 'RMU-1', 'RRT', '80 A', 'ring continues']));
    const rmu = h.querySelector('g.rmu')!;
    expect(rmu.querySelector('title')?.textContent).toBe('RMU-1 · RRT · 11 kV: ring main unit feeding MDB-1 — 21 kA 3 s, T-off switch-fuse 80 A');
    // Two ring switches and the fuse-switch tee-off between them.
    expect([...rmu.querySelectorAll('[data-sym]')].map((s) => s.getAttribute('data-sym'))).toEqual(['isolator', 'fusesw', 'isolator']);
    // The transformer stands lower, under the RMU, straight below its tee-off.
    const sym = h.querySelector('g.tx [data-sym="tx"]')!;
    expect(num(sym, 'data-sym-y')).toBe(92 + MV_DY);
    expect(num(rmu.querySelectorAll('[data-sym]')[1], 'data-sym-x')).toBe(num(sym, 'data-sym-x'));
  });

  it('writes N/O beside the normally open ring switch, inside the RMU box', () => {
    const p: Project = { ...withRmu, rmus: [{ name: 'RMU-1', config: 'RRT', normallyOpen: 'R2' }] };
    const h = drawn(p), rmu = h.querySelector('g.rmu')!;
    // DXF and DWG get it as text, like the RMU's name.
    const dxf = svgToDxf(h.querySelector('.sysdiag > svg')!.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'), 1000);
    expect(dxf.filter((x) => x.type === 'text' && ['N/O', 'RMU-1'].includes(x.text)).map((x) => x.type === 'text' && [x.text, x.layer])).toEqual([['RMU-1', 'TEXT'], ['N/O', 'TEXT']]);
    const nop = rmu.querySelector('text[data-nop]')!;
    expect([nop.textContent, nop.getAttribute('data-nop'), nop.getAttribute('text-anchor'), nop.getAttribute('class')]).toEqual(['N/O', 'R2', 'start', 'b']);
    const ring = [...rmu.querySelectorAll('[data-sym="isolator"]')].map((s) => num(s, 'data-sym-x'));
    expect(num(nop, 'x')).toBe(ring[1] + 10);
    const box = rmu.querySelector('rect.rmu-box')!;
    expect(num(box, 'x') + num(box, 'width')).toBeGreaterThan(num(nop, 'x') + 20);
    expect(rmu.querySelector('title')?.textContent).toContain('R2 normally open');
    expect(drawn(withRmu).querySelector('text[data-nop]')).toBeNull();
  });

  it('frames a substation, titled with its type and building, and keeps a meter cabinet off the ring', () => {
    const p: Project = {
      ...withRmu,
      boards: [meterCabinet, ...withRmu.boards.map((b) => (b.id === 'MDB-1' ? { ...b, substation: 'SS-1' } : b))],
      substations: [{ id: 's', name: 'SS-1', type: 'conventional', transformers: 1, building: 'Ground floor' }]
    };
    const h = drawn(p);
    expect(texts(h.querySelector('.ss-frame')!)).toEqual(['SS-1', 'Conventional substation · Ground floor']);
    const ringEnd = Math.max(...[...h.querySelectorAll('.mvRing-run line')].map((l) => num(l, 'x2')));
    const sup = h.querySelector('g.tx[data-lv-id="board:MDB-A"]')!;
    expect(num(sup.querySelector('circle'), 'cx')).toBeGreaterThan(ringEnd);
    expect(num(sup.querySelector('circle'), 'cy')).toBe(22 + MV_DY);
  });

  it('on a sheet of one main board, draws a stub to the RMU’s other transformer and numbers its own as in the project', () => {
    const whole: Project = { ...withRmu, boards: [...withRmu.boards, { id: 'MDB-2', name: 'MDB-2', kind: 'MDB', sourceKva: 1000, sourceImpedancePct: 6, rmu: 'RMU-1' }], rmus: [{ name: 'RMU-1', config: 'RRTT' }] };
    const sheet: Project = { ...whole, boards: whole.boards.filter((b) => b.id === 'MDB-2'), feeders: [] };
    const t = texts(drawn(sheet, whole));
    expect(t).toEqual(expect.arrayContaining(['TX-2', 'to TX-1 · MDB-1']));
    expect(t).not.toContain('SPARE');
    // Without the whole project the sheet could only guess.
    expect(texts(drawn(sheet))).toContain('TX-1');
  });
});
