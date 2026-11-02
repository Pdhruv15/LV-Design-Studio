// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SystemDiagram from '../components/SystemDiagram';
import { sampleProject } from '../data/sampleProject';
import { evaluateProject } from '../calc/electrical';
import { buildAnnotations, SHEET_LAYERS } from './annotations';
import { DEWA_EXTRA_Y, layoutSystem } from './layout';
import { textWidth } from './panelLabels';
import { SYM_SCALE, SYMBOLS, type SymPrim } from './symbolLibrary';
import type { Project } from '../types';

const noop = () => {};
/** The SLD as a drawing sheet draws it (DEWA style, results shown), parsed. */
function drawn(project: Project, cableRefs = false): HTMLElement {
  const results = evaluateProject(project);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <SystemDiagram project={project} calcProject={project} results={results} annotations={buildAnnotations(project, results)} layers={SHEET_LAYERS} cableRefs={cableRefs}
      hideLegend selectedFeederId={null} selectedBoardId={null} onSelectFeeder={noop} onSelectBoard={noop} />
  );
  return host;
}

/** A text's size (px) and weight as the SLD's stylesheet sets them. */
function fontOf(t: Element): [number, boolean] {
  const c = t.classList, inline = Number(t.getAttribute('style')?.match(/font-size:\s*([\d.]+)/)?.[1]);
  const size = inline || (c.contains('dev') ? 11 : c.contains('dev-k') ? 10 : c.contains('res') ? 10.5 : c.contains('iec-t') ? (c.contains('b') ? 11 : c.contains('s') ? 7.5 : 9)
    : c.contains('acc-t') && t.closest('.acc') ? (c.contains('b') ? 8 : 9) : c.contains('b') ? 12 : 11);
  return [size, c.contains('dev') || c.contains('b') || c.contains('res')];
}
interface Box { x1: number; x2: number; y1: number; y2: number }
/** The room a text takes: its width from the shared estimate, cap height above the baseline and descenders below. */
function boxOf(t: Element): Box {
  const [size, bold] = fontOf(t);
  const w = textWidth(t.textContent ?? '', size, bold), x = Number(t.getAttribute('x')), y = Number(t.getAttribute('y'));
  const a = t.getAttribute('text-anchor'), x1 = a === 'middle' ? x - w / 2 : a === 'end' ? x - w : x;
  return { x1, x2: x1 + w, y1: y - size * 0.75, y2: y + size * 0.25 };
}
const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
const inside = (a: Box, b: Box) => a.x1 >= b.x1 && a.x2 <= b.x2 && a.y1 >= b.y1 && a.y2 <= b.y2;
const rectOf = (r: Element): Box => {
  const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((k) => Number(r.getAttribute(k)));
  return { x1: x, x2: x + w, y1: y, y2: y + h };
};

describe('DEWA panel frames on the SLD', () => {
  const host = drawn(sampleProject);
  const frames = [...host.querySelectorAll('g.bd')].flatMap((g) => {
    const r = g.querySelector('.panel-frame rect.frame-ln');
    return r ? [{ id: g.getAttribute('data-lv-id')!.slice('board:'.length), box: rectOf(r), group: g }] : [];
  });
  /** A panel's labels: its own (name box, incomer, busbar) and those of the ways on its busbar. */
  const labelsOf = (id: string) => [
    ...frames.find((f) => f.id === id)!.group.querySelectorAll('text'),
    ...sampleProject.feeders.filter((f) => f.boardId === id).flatMap((f) => [...host.querySelectorAll(`[data-lv-id="feeder:${f.id}"] text`)])
  ].filter((t) => t.textContent?.trim());

  it('draws a frame round every panel with ways', () => {
    expect(frames.map((f) => f.id).sort()).toEqual(['MCC-1', 'MDB-1', 'SMDB-FF', 'SMDB-GF']);
  });

  it('no label crosses a panel outline', () => {
    for (const p of frames) for (const t of labelsOf(p.id)) {
      const b = boxOf(t);
      for (const f of frames) expect(overlaps(b, f.box) && !inside(b, f.box), `${p.id}: "${t.textContent}" crosses the frame of ${f.id}`).toBe(false);
    }
  });

  it('keeps every label beside a way within its own panel, above and below the frame', () => {
    for (const p of frames) for (const f of sampleProject.feeders.filter((x) => x.boardId === p.id)) {
      for (const t of host.querySelectorAll(`[data-lv-id="feeder:${f.id}"] text:not([text-anchor])`)) {
        const b = boxOf(t);
        expect(b.x1 >= p.box.x1 && b.x2 <= p.box.x2, `${f.id}: "${t.textContent}" outside ${p.id}`).toBe(true);
      }
    }
  });

  it('the reported case: the last way of SMDB-FF stays inside its frame, clear of MCC-1 beside it', () => {
    const ff = frames.find((f) => f.id === 'SMDB-FF')!.box, mcc = frames.find((f) => f.id === 'MCC-1')!.box;
    const texts = [...host.querySelectorAll('[data-lv-id="feeder:FF-LTG"] text')].map((t) => [t.textContent, boxOf(t)] as const);
    for (const s of ['25A SPN MCB', '25 kA', '2C 6mm² CU/XLPE/SWA', '+1C 6mm² ECC · 35m']) {
      const b = texts.find(([x]) => x === s)?.[1];
      expect(b, s).toBeDefined();
      expect(b!.x2, s).toBeLessThan(ff.x2);
    }
    expect(mcc.x1 - ff.x2).toBeGreaterThanOrEqual(15);
  });

  it('with cable reference numbers too', () => {
    const refs = drawn(sampleProject, true);
    const ff = rectOf(refs.querySelector('[data-lv-id="board:SMDB-FF"] .panel-frame rect.frame-ln')!);
    for (const t of refs.querySelectorAll('[data-lv-id="feeder:FF-LTG"] text:not([text-anchor])')) expect(boxOf(t).x2, t.textContent ?? '').toBeLessThan(ff.x2);
  });
});

describe('DOL starter on the SLD', () => {
  const host = drawn(sampleProject);
  const layout = layoutSystem(sampleProject, DEWA_EXTRA_Y, { frames: true });
  const way = (id: string) => layout.feeders.find((f) => f.feeder.id === id)!;
  const starter = (id: string) => [...host.querySelectorAll(`[data-lv-id="feeder:${id}"] .acc`)].find((g) => g.querySelector('text')?.textContent === 'DOL')!;

  it('keeps the code clear of its box on every side', () => {
    for (const id of ['dol', 'sd'] as const) {
      const prims = SYMBOLS[id].prims as SymPrim[];
      const r = prims.find((q) => q.k === 'r')!, code = prims.find((q) => q.k === 't')!;
      if (r.k !== 'r' || code.k !== 't') throw new Error('box and code expected');
      expect((r.w * SYM_SCALE.starter - textWidth(code.s, 7.5)) / 2, id).toBeGreaterThanOrEqual(2.5);
      expect((r.h * SYM_SCALE.starter - 7.5 * 0.72) / 2, id).toBeGreaterThanOrEqual(2.5);
    }
    for (const id of ['MCC-WP', 'MCC-FP']) {
      const g = starter(id), t = g.querySelector('text')!, box = rectOf(g.querySelector('rect')!), code = boxOf(t);
      // Capitals only: from their cap height down to the baseline.
      const base = Number(t.getAttribute('y'));
      expect(code.x1 - box.x1, id).toBeGreaterThanOrEqual(2.5);
      expect(box.x2 - code.x2, id).toBeGreaterThanOrEqual(2.5);
      expect(base - 7.5 * 0.72 - box.y1, id).toBeGreaterThanOrEqual(2.5);
      expect(box.y2 - base, id).toBeGreaterThanOrEqual(2.5);
    }
  });

  it('hangs below the breaker, clear of its blade, linked to the cable under it', () => {
    for (const id of ['MCC-WP', 'MCC-FP']) {
      const { x, busY: y } = way(id), g = starter(id), box = rectOf(g.querySelector('rect')!), link = g.querySelector('line')!;
      // The breaker's blade runs from its pivot on the cable (x, y + 34) up to its open tip (x − 5.5, y + 21).
      const gap = Math.min(...Array.from({ length: 101 }, (_, i) => {
        const px = x - 5.5 * i / 100, py = y + 34 - 13 * i / 100;
        return Math.hypot(Math.max(box.x1 - px, 0, px - box.x2), Math.max(box.y1 - py, 0, py - box.y2));
      }));
      expect(gap, id).toBeGreaterThanOrEqual(4);
      expect(Number(link.getAttribute('y1')), id).toBeGreaterThan(y + 34);
      expect(Number(link.getAttribute('x2')), id).toBe(x);
      expect(box.y2, id).toBeLessThanOrEqual(y + 47 - 2); // above the frame's foot
    }
    // Clear of the breaker text of the way before it.
    const prev = [...host.querySelectorAll('[data-lv-id="feeder:MCC-WP"] text.dev')].map(boxOf);
    expect(prev.length).toBeGreaterThan(0);
    for (const b of prev) expect(overlaps(b, rectOf(starter('MCC-FP').querySelector('rect')!))).toBe(false);
  });
});
