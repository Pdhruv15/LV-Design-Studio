// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import SystemDiagram, { canvasDrawing } from './SystemDiagram';
import { evaluateProject } from '../calc/electrical';
import { network } from '../../tests/fixtures/networks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const project = { ...network(4, 'shallow'), id: 'fit' };
const results = evaluateProject(project);

// On a short window the drawing and the Design CAD page fit the page column under the ribbon. A taller floor made the
// column scroll, and its top (the SLD tabs and bar, the CAD properties palette) went under the ribbon.
describe('SLD drawing on a short window', () => {
  let page: HTMLElement, root: Root, room = 400;
  const draw = () => act(() => root.render(
    <SystemDiagram {...canvasDrawing(false)} project={project} calcProject={project} results={results} selectedFeederId={null} selectedBoardId={null}
      onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} resizable />
  ));
  const height = () => page.querySelector<HTMLElement>('.sysdiag')!.style.height;

  beforeEach(() => {
    localStorage.removeItem('sld.height');
    vi.stubGlobal('ResizeObserver', class { private fire: () => void; constructor(fire: () => void) { this.fire = fire; } observe() { this.fire(); } unobserve() {} disconnect() {} });
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) { return this.classList.contains('mid') ? room : 300; });
    page = document.createElement('main');
    page.className = 'mid';
    document.body.appendChild(page);
    root = createRoot(page);
  });
  afterEach(() => {
    act(() => root.unmount());
    page.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('takes the room left, below the old 420 px floor', () => {
    room = 400;
    draw();
    expect(height()).toBe('388px');
  });

  it('keeps a usable floor on a very short page', () => {
    room = 150;
    draw();
    expect(height()).toBe('240px');
  });
});

describe('Design CAD page on a short window', () => {
  it('fits the page column on desktop; only phones keep a minimum height', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css.match(/^\.cad\{([^}]*)\}/m)?.[1]).not.toContain('min-height');
    expect(css).toMatch(/@media \(max-width:600px\)\{\.cad\{min-height:520px\}\}/);
  });
});
