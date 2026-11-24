// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DisplayPreview, SelectionPreview } from './CadOptionsPreview';
import { DRAFT_DEFAULTS, type DraftSettings } from '../../model/cadDraft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const part = (name: string) => [...host.querySelectorAll(`[data-part="${name}"]`)];
const attr = (name: string, a: string) => part(name)[0]?.getAttribute(a);
const showDisplay = (p: Partial<DraftSettings> = {}, lwt = true) => act(() => root.render(<DisplayPreview draft={{ ...DRAFT_DEFAULTS, ...p }} lwt={lwt} />));
const showSelection = (p: Partial<DraftSettings> = {}) => act(() => root.render(<SelectionPreview draft={{ ...DRAFT_DEFAULTS, ...p }} />));
/** The numbers of the cross path's first move (the left arm's start) and its subpath count. */
const firstX = () => parseFloat(attr('cross', 'd')!.slice(1));
const subpaths = () => (attr('cross', 'd')!.match(/M/g) ?? []).length;

describe('DisplayPreview', () => {
  it('draws at 180 x 196 with a frame, and the walls are 2.2 wide with lineweights and 1 without', () => {
    showDisplay({}, true);
    const svg = host.querySelector('svg')!;
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['180', '196']);
    expect(svg.lastElementChild!.tagName).toBe('rect');
    expect(attr('wall', 'stroke-width')).toBe('2.2');
    showDisplay({}, false);
    expect(attr('wall', 'stroke-width')).toBe('1');
  });

  it('the outline is there only with the cursor outline on, and the cross colour follows the setting', () => {
    showDisplay({ cursorOutline: true });
    expect(part('outline')).toHaveLength(1);
    expect(attr('outline', 'stroke')).toBe('var(--cad-bg)');
    expect(attr('outline', 'd')).toBe(attr('cross', 'd'));
    showDisplay({ cursorOutline: false });
    expect(part('outline')).toHaveLength(0);
    showDisplay({ crossColor: 'ink' });
    expect(attr('cross', 'stroke')).toBe('var(--cad-cross)');
    showDisplay({ crossColor: 'accent' });
    expect(attr('cross', 'stroke')).toBe('var(--acc)');
    showDisplay({ crossColor: 'cyan' });
    expect(attr('cross', 'stroke')).toBe('var(--res-cur)');
  });

  it('the crosshair is across the picture at 100 %, shorter at 20 %, and only the pick box at 1 %', () => {
    showDisplay({ crossPct: 100 });
    expect(firstX()).toBe(0);
    expect(subpaths()).toBe(5);
    showDisplay({ crossPct: 20 });
    expect(firstX()).toBeCloseTo(112.5 - 19.6, 5);
    showDisplay({ crossPct: 1, pickBoxPx: 12 });
    expect(subpaths()).toBe(1);
  });

  it('the pick box follows its size', () => {
    showDisplay({ crossPct: 1, pickBoxPx: 20 });
    expect(attr('cross', 'd')).toBe('M102.5 106.5h20v20h-20Z');
    showDisplay({ crossPct: 1, pickBoxPx: 6 });
    expect(attr('cross', 'd')).toBe('M109.5 113.5h6v6h-6Z');
  });
});

describe('SelectionPreview', () => {
  it('the three looks: halo only for halo; thick is 3 wide in the selection colour and not dashed', () => {
    showSelection({ pickLook: 'halo', selColor: 'blue' });
    expect(part('halo')).toHaveLength(1);
    expect(attr('halo', 'stroke')).toBe('var(--cad-sel)');
    expect(attr('picked', 'stroke-dasharray')).toBe('6 4');
    expect(attr('picked', 'stroke')).toBe('var(--cad-ink)');
    showSelection({ pickLook: 'thick', selColor: 'green' });
    expect(part('halo')).toHaveLength(0);
    expect(attr('picked', 'stroke-width')).toBe('3');
    expect(attr('picked', 'stroke')).toBe('var(--cad-snap)');
    expect(attr('picked', 'stroke-dasharray')).toBeNull();
    showSelection({ pickLook: 'dash' });
    expect(part('halo')).toHaveLength(0);
    expect(attr('picked', 'stroke-dasharray')).toBe('6 4');
    expect(attr('picked', 'stroke-width')).toBe('1');
  });

  it('the grips follow the selection colour and size, and are absent with grips off', () => {
    showSelection({ grips: true, gripPx: 10, selColor: 'cyan' });
    const grips = part('grip');
    expect(grips).toHaveLength(8);
    expect(grips.every((g) => g.getAttribute('fill') === 'var(--res-cur)' && g.getAttribute('stroke') === 'var(--cad-bg)')).toBe(true);
    const sizes = grips.map((g) => `${g.getAttribute('width')}x${g.getAttribute('height')}`);
    expect(sizes.filter((s) => s === '10x10')).toHaveLength(4);
    expect(sizes.filter((s) => s === '14x6')).toHaveLength(2);
    expect(sizes.filter((s) => s === '6x14')).toHaveLength(2);
    showSelection({ grips: true, gripPx: 8, selColor: 'accent' });
    expect(attr('grip', 'fill')).toBe('var(--acc)');
    expect(part('grip').map((g) => `${g.getAttribute('width')}x${g.getAttribute('height')}`)).toContain('11x5');
    showSelection({ grips: false });
    expect(part('grip')).toHaveLength(0);
  });

  it('the hover highlight, the name tag and the window shading show only when on, and the pick box follows its setting', () => {
    showSelection({ hoverMark: true, hoverTag: true, windowFill: true, cursorOutline: true, pickBoxPx: 16, crossColor: 'accent' });
    expect(part('hover')).toHaveLength(1);
    expect(part('tag')).toHaveLength(1);
    expect(part('tag')[0].textContent).toBe('Line · WALLS');
    const box = part('tag')[0].querySelector('rect')!;
    expect(Number(box.getAttribute('x')) + Number(box.getAttribute('width'))).toBeLessThanOrEqual(180); // the tag stays inside the drawing
    expect(part('window-fill')).toHaveLength(1);
    expect(part('window')).toHaveLength(1);
    expect(part('outline')).toHaveLength(1);
    expect(attr('pickbox', 'd')).toBe('M76.5 132.5h16v16h-16Z'); // 16 px, centred on the cursor at (84.5, 140.5)
    expect(attr('pickbox', 'stroke')).toBe('var(--acc)');
    showSelection({ hoverMark: false, hoverTag: false, windowFill: false, cursorOutline: false });
    expect(part('hover')).toHaveLength(0);
    expect(part('tag')).toHaveLength(0);
    expect(part('window-fill')).toHaveLength(0);
    expect(part('window')).toHaveLength(1);
    expect(part('outline')).toHaveLength(0);
  });
});
