import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import type { CalcRun } from '../../calc/runs';
import { setOf, type DrawingSheet } from '../../model/drawingSet';
import type { Project } from '../../types';
import { saveBinary } from '../../util/files';
import { Modal } from '../ui';
import { renderDrawingSetPdf } from './sheetRender';

export const canPreviewSheetPdf = () => !!window.lvds?.files?.pdfBytes;
const CSS_PIXELS_PER_POINT = 96 / 72;

export function SheetPdfPreview(props: { project: Project; sheet: DrawingSheet; run?: CalcRun; onClose: () => void }) {
  const [{ project, sheet, run }] = useState(() => ({ project: props.project, sheet: props.sheet, run: props.run }));
  const { onClose } = props;
  const [pdf, setPdf] = useState<{ document: PDFDocumentProxy; bytes: Uint8Array; name: string }>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(0);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let closed = false;
    let task: PDFDocumentLoadingTask | undefined;
    const load = async () => {
      try {
        const toBytes = window.lvds?.files?.pdfBytes;
        if (!toBytes) throw new Error('PDF preview requires the desktop app');
        const [pdfjs, worker, file] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url&no-inline'),
          renderDrawingSetPdf(project, setOf(project), run, toBytes, [sheet.id])
        ]);
        if (closed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        // PDF.js transfers ownership of its input buffer to the worker.
        task = pdfjs.getDocument({ data: file.bytes.slice(), useWasm: false });
        const document = await task.promise;
        if (!closed) setPdf({ document, bytes: file.bytes, name: file.name });
      } catch (e) {
        if (!closed) setError(e instanceof Error ? e.message : String(e));
      }
    };
    // Sheet preparation may synchronously render an offscreen SVG in a separate React root.
    const timer = setTimeout(() => { void load(); }, 0);
    return () => {
      closed = true;
      clearTimeout(timer);
      void task?.destroy().catch(() => {});
    };
  }, [project, run, sheet.id]);

  useEffect(() => {
    if (!pdf) return;
    let closed = false;
    let render: RenderTask | undefined;
    const draw = async () => {
      try {
        const p = await pdf.document.getPage(page);
        const el = canvas.current;
        if (closed || !el) return;
        const points = p.getViewport({ scale: 1 });
        const scale = zoom ? zoom / 100 * CSS_PIXELS_PER_POINT : Math.min(1000 / points.width, 650 / points.height);
        const viewport = p.getViewport({ scale });
        el.width = Math.ceil(viewport.width);
        el.height = Math.ceil(viewport.height);
        render = p.render({ canvas: el, viewport });
        await render.promise;
      } catch (e) {
        if (!closed) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void draw();
    return () => { closed = true; render?.cancel(); };
  }, [pdf, page, zoom]);

  async function save() {
    if (!pdf || saving) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const message = await saveBinary(pdf.name, pdf.bytes, 'PDF', 'pdf', 'application/pdf');
      if (message) setSaveMessage(message);
    } catch (e) {
      setSaveMessage(`PDF save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setSaving(false); }
  }

  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 1120 }} label="PDF preview">
      <h3>PDF preview <span className="m">{sheet.number} · {sheet.title}</span></h3>
      {error ? <p role="alert">PDF preview failed: {error}</p> : !pdf ? <p role="status">Preparing PDF…</p> : <>
        <div className="modal-actions">
          {pdf.document.numPages > 1 && <>
            <button className="chip" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous page</button>
            <span className="m">Page {page} of {pdf.document.numPages}</span>
            <button className="chip" disabled={page === pdf.document.numPages} onClick={() => setPage(page + 1)}>Next page</button>
          </>}
          <label>Zoom <select aria-label="Preview zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            <option value={0}>Fit page</option><option value={100}>100%</option><option value={150}>150%</option>
          </select></label>
        </div>
        <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
          <canvas ref={canvas} role="img" aria-label={`PDF page ${page}`} style={{ display: 'block', margin: '0 auto', maxWidth: zoom ? undefined : '100%', maxHeight: zoom ? undefined : '60vh', objectFit: 'contain' }} />
        </div>
      </>}
      {saveMessage && <p role="status">{saveMessage}</p>}
      <div className="modal-actions">
        <button className="chip" onClick={onClose}>Close</button>
        <button className="chip primary" disabled={!pdf || saving || !!error} onClick={() => void save()}>{saving ? 'Saving…' : 'Save PDF'}</button>
      </div>
    </Modal>
  );
}
