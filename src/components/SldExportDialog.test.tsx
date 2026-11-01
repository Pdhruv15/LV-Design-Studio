// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import SldExportDialog from './SldExportDialog';
import SystemDiagram, { canvasDrawing } from './SystemDiagram';
import { evaluateProject } from '../calc/electrical';
import { savePdf, saveText } from '../util/files';
import { network } from '../../tests/fixtures/networks';

vi.mock('../util/files', async (real) => ({ ...await real<typeof import('../util/files')>(), savePdf: vi.fn(async () => 'Saved'), saveText: vi.fn(async () => 'Saved') }));

const noop = () => {};
// With an id, as every real project has: the canvas opens zoomed in, once per project.
const project = { ...network(5, 'shallow'), id: 'zoomed' };
const results = evaluateProject(project);
const CIRCUIT = /class="fd[ "]/g;

describe('SLD Export dialog', () => {
  let host: HTMLDivElement, root: Root;
  /** The design canvas with the dialog open or closed, as in App.tsx. */
  const draw = (exporting: boolean) => flushSync(() => root.render(<>
    <SystemDiagram {...canvasDrawing(exporting)} project={project} calcProject={project} results={results} selectedFeederId={null} selectedBoardId={null}
      onSelectFeeder={noop} onSelectBoard={noop} onDrawing={noop} resizable fullScreen onToggleFullScreen={noop} />
    {exporting && <SldExportDialog project={project} onSave={noop} onStatus={noop} onClose={noop} />}
  </>));
  const circuitsDrawn = () => host.querySelectorAll('.sysdiag > svg .fd').length;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('SVGTextElement', class {}); // not in jsdom
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1400);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(800);
    vi.mocked(savePdf).mockClear();
    vi.mocked(saveText).mockClear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    draw(false);
  });
  afterEach(() => {
    root.unmount();
    host.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws only what is in view until the dialog opens, and again once it closes', () => {
    expect(host.querySelector('.sysdiag > svg')!.getAttribute('viewBox')).toMatch(/ 1400 800$/);
    expect(circuitsDrawn()).toBeLessThan(project.feeders.length);
    draw(true);
    expect(circuitsDrawn()).toBe(project.feeders.length);
    draw(false);
    expect(circuitsDrawn()).toBeLessThan(project.feeders.length);
  });

  it.each([['SVG', saveText], ['PDF A3', savePdf]])('exports the whole drawing as %s when the canvas is zoomed in', async (label, save) => {
    draw(true);
    [...document.querySelectorAll('button')].find((b) => b.textContent === label)!.click();
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    const out = String(vi.mocked(save).mock.calls[0][1]);
    expect(out.match(CIRCUIT)).toHaveLength(project.feeders.length);
    for (const b of project.boards) expect(out).toContain(`>${b.id}<`);
  });

  it('is how the App draws its canvas', () => {
    expect(readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8')).toContain('{...canvasDrawing(showExport)}');
  });
});
