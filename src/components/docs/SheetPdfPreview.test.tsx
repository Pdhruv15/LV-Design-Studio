// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { sampleProject } from '../../data/sampleProject';
import { autoSheets } from '../../model/drawingSet';
import { SheetPdfPreview } from './SheetPdfPreview';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(), renderDrawingSetPdf: vi.fn(), saveBinary: vi.fn()
}));
vi.mock('pdfjs-dist', () => ({ getDocument: mocks.getDocument, GlobalWorkerOptions: {} }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url&no-inline', () => ({ default: './pdf.worker.mjs' }));
vi.mock('./sheetRender', () => ({ renderDrawingSetPdf: mocks.renderDrawingSetPdf }));
vi.mock('../../util/files', () => ({ saveBinary: mocks.saveBinary }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('plots just the selected sheet and saves the bytes shown in the preview', async () => {
  const set = autoSheets(sampleProject, 'perMdb');
  const project = { ...sampleProject, drawingSet: set };
  const sheet = set.sheets[0];
  const bytes = Uint8Array.of(1, 2, 3);
  const toBytes = vi.fn();
  const destroy = vi.fn(async () => {});
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const getPage = vi.fn(async () => ({ getViewport: () => ({ width: 420, height: 297 }), render }));
  mocks.renderDrawingSetPdf.mockResolvedValue({ bytes, name: 'sheet.pdf' });
  mocks.getDocument.mockImplementation(({ data }: { data: Uint8Array }) => {
    data.fill(0); // Simulate ownership of the PDF.js buffer.
    return { promise: Promise.resolve({ getPage, numPages: 2 }), destroy };
  });
  mocks.saveBinary.mockResolvedValue('Saved sheet.pdf');
  vi.stubGlobal('lvds', { files: { pdfBytes: toBytes } });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;
  try {
    act(() => root.render(<SheetPdfPreview project={project} sheet={sheet} onClose={() => {}} />));
    await act(async () => { await vi.waitFor(() => expect(mocks.getDocument).toHaveBeenCalled()); });
    expect(mocks.renderDrawingSetPdf).toHaveBeenCalledWith(project, set, undefined, toBytes, [sheet.id]);
    expect(getPage).toHaveBeenCalledWith(1);
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ canvas: host.querySelector('canvas') }));
    await act(async () => button('Next page').click());
    expect(getPage).toHaveBeenLastCalledWith(2);
    await act(async () => button('Save PDF').click());
    expect(mocks.saveBinary).toHaveBeenCalledWith('sheet.pdf', Uint8Array.of(1, 2, 3), 'PDF', 'pdf', 'application/pdf');
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Saved sheet.pdf');
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
  expect(destroy).toHaveBeenCalledOnce();
});
