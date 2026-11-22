// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from './SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import type { Board, Project } from '../types';

const noop = () => {};
function drawn(project: Project, dewa = false): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={{ ...project, drawing: { ...project.drawing, sldStyle: dewa ? 'dewa' : 'standard' } } as Project} results={evaluateProject(project)} hideLegend selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />
  );
  return host;
}
const texts = (h: Element) => [...h.querySelectorAll('text')].map((t) => t.textContent);
const withBoard = (b: Board): Project => ({ ...sampleProject, boards: [b, ...sampleProject.boards] });
const group = (h: Element, id: string) => h.querySelector(`g.tx[data-lv-id="board:${id}"]`)!;
const base = { id: 'MDB-A', name: 'MDB-A', kind: 'MDB' as const, ratedCurrentA: 200 };

describe('SLD: the supply point of a first board', () => {
  it('the standard style: lower-case meter cabinet and the assumed fault level', () => {
    const t = texts(group(drawn(withBoard({ ...base, supply: {} })), 'MDB-A'));
    expect(t).toEqual(expect.arrayContaining(['meter cabinet', 'Ik″ 25.2 kA assumed']));
    expect(t).not.toContain('CABLE BY THE SUPPLIER');
  });
  it('a board fed from outside the project: a chevron marker and "From <name>"', () => {
    const h = drawn(withBoard({ ...base, supply: { fedBy: 'board', fedFrom: 'SMDB-3F', faultKa: 12 } }));
    const g = group(h, 'MDB-A');
    expect(g.classList.contains('from-up')).toBe(true);
    expect(g.querySelector('title')?.textContent).toBe('Fed from SMDB-3F outside this project — double-click to edit');
    expect(texts(g)).toEqual(expect.arrayContaining(['From SMDB-3F', 'not in this project', 'Ik″ 12 kA given']));
    expect(g.querySelector('path')?.getAttribute('d')).toMatch(/^M[\d.-]+ \d+ L[\d.-]+ \d+ L[\d.-]+ \d+$/);
    expect(g.querySelector('circle')).toBeNull();
  });

  it('an unset supply: a dashed stub, no transformer symbol and no 11 kV line over it', () => {
    const h = drawn(withBoard(base));
    const g = group(h, 'MDB-A');
    expect(texts(g)).toEqual(expect.arrayContaining(['Supply not set', 'Ik″ 25.2 kA assumed', 'checks: not verified']));
    expect(g.querySelector('[data-sym="tx"]')).toBeNull();
    expect(texts(g)).not.toContain('no source data');
    expect(g.querySelector('line.mv')).toBeNull();
    expect(g.querySelector('line[stroke-dasharray="5 3"]')).not.toBeNull();
    // The 11 kV line runs over the transformer boards only.
    const mv = h.querySelector('line.ln.mv[y1="50"]');
    const stub = Number(g.querySelector('line')!.getAttribute('x1'));
    const tx = Number(group(h, 'MDB-1').querySelector('[data-sym="tx"]')!.getAttribute('data-sym-x'));
    expect(mv).not.toBeNull();
    for (const l of h.querySelectorAll('line.ln.mv[y1="50"]')) expect(Math.max(Number(l.getAttribute('x1')), Number(l.getAttribute('x2')))).toBeLessThan(stub + 1);
    expect(stub).toBeGreaterThan(tx);
  });

  it('a generator source draws a G; a source with no name says "Source" and prints no supplier name', () => {
    const h = drawn(withBoard({ ...base, supply: { kind: 'generator', fedFrom: 'Genset 1' } }));
    const g = group(h, 'MDB-A');
    expect(texts(g)).toEqual(expect.arrayContaining(['G', 'Genset 1', 'kWh']));
    expect(g.querySelector('circle[r="11"]')).not.toBeNull();
    const plain = drawn(withBoard({ ...base, supply: {} }));
    expect(texts(group(plain, 'MDB-A'))).toEqual(expect.arrayContaining(['Source', 'kWh']));
    expect(texts(plain).join('|')).not.toMatch(/DEWA|AUTHORITY/);
    expect(texts(drawn(withBoard({ ...base, supply: {} }), true).querySelector('g.tx[data-lv-id="board:MDB-A"]')!)).toContain('CABLE BY THE SUPPLIER');
  });

  it('a pv source draws the converter square', () => {
    const g = group(drawn(withBoard({ ...base, supply: { kind: 'pv' } })), 'MDB-A');
    expect(g.querySelector('rect[width="22"]')).not.toBeNull();
  });

  it('the transformer block of the sample project is unchanged', () => {
    const h = drawn(sampleProject);
    expect(texts(group(h, 'MDB-1'))).toEqual(expect.arrayContaining([expect.stringMatching(/kVA · .*% Z$/)]));
    expect(texts(h)).toEqual(expect.arrayContaining(['MV source', '11 kV']));
  });
});
