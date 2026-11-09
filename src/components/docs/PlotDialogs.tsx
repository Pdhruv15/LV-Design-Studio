import { useRef, useState } from 'react';
import { Modal } from '../ui';
import { DEFAULT_PENS, newTableId, parseCtb, PEN_INKS, PEN_KEYS, PEN_LABEL, PEN_WIDTHS, plotOf, tableFromCtb, tablesOf, withDefaults, withTable, type PenKey, type PenTable, type PlotSetup } from '../../model/plotSetup';
import { drawnTextMm, planScale } from '../../docs/planLayout';
import { drawable, type DrawingSheet, type SheetSize } from '../../model/drawingSet';
import type { CalcRun } from '../../calc/runs';
import type { Project } from '../../types';
import { canPreviewSheetPdf, SheetPdfPreview } from './SheetPdfPreview';

/** Design CAD → Output: the page setup of a sheet and the project's pen tables. */

const SIZES: ('auto' | SheetSize)[] = ['auto', 'A4', 'A3', 'A3 portrait', 'A2', 'A1'];
const SCALES = [50, 100, 200, 500];

/** Page setup: the sheet's paper, scale (plan sheets), pen table, lineweights and plot stamp; or the set's default. */
export function PageSetupDialog({ project, sheet, run, onSave, onClose }: {
  project: Project;
  sheet: DrawingSheet;
  run?: CalcRun;
  /** The project with the sheet's setup (or the set's default) saved. */
  onSave: (next: Project, message: string) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState(sheet.size);
  const [scale, setScale] = useState(planScale(sheet.scale));
  const [setup, setSetup] = useState<PlotSetup>(() => ({ ...plotOf(project, sheet), named: undefined })); // edited here, the sheet's own
  const [preview, setPreview] = useState<Project>();
  const tables = tablesOf(project);
  const plan = sheet.kind === 'plan';
  const textAt = plan ? drawnTextMm(project, sheet) : undefined;
  const sheetWith = (p: Project, s: Partial<DrawingSheet>): Project => ({ ...p, drawingSet: { ...p.drawingSet!, sheets: p.drawingSet!.sheets.map((x) => (x.id === sheet.id ? { ...x, ...s } : x)) } });
  const own = { size, ...(plan ? { scale: `1:${scale}` } : {}) };
  return (<>
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 520 }} label="Page setup">
      <h3>Page setup <span className="m">{sheet.number} · {sheet.title}</span></h3>
      <div className="cad-devform">
        <label>Paper<select aria-label="Paper" value={size} onChange={(e) => setSize(e.target.value as DrawingSheet['size'])}>
          {SIZES.map((z) => <option key={z} value={z}>{z === 'auto' ? 'Auto (the smallest that fits)' : z}</option>)}
        </select></label>
        {plan && <label>Scale<select aria-label="Scale" value={scale} onChange={(e) => setScale(Number(e.target.value))}>{SCALES.map((k) => <option key={k} value={k}>1:{k}</option>)}</select></label>}
        <label>Pen table<select aria-label="Pen table" value={setup.pens ?? tables[0].id} onChange={(e) => setSetup({ ...setup, pens: e.target.value })}>
          {tables.map((t) => <option key={t.id} value={t.id}>{t.name}{t.ctb ? ' (CTB)' : ''}</option>)}
        </select></label>
        <label>Lineweights<select aria-label="Lineweights" value={setup.weights ?? 'pens'} onChange={(e) => setSetup({ ...setup, weights: e.target.value as PlotSetup['weights'] })}>
          <option value="pens">Print them (from the pen table)</option><option value="thin">All one thin line</option>
        </select></label>
        {plan && <label><input type="checkbox" checked={setup.drawn !== false} onChange={(e) => setSetup({ ...setup, drawn: e.target.checked ? undefined : false })} /> Print drawn work (lines, hatches, text)</label>}
        {plan && setup.drawn !== false && textAt && textAt.scale !== scale && <span className="m warn">⚠ Text was drawn for 1:{textAt.scale}; this sheet is 1:{scale}, so {textAt.mm} mm text prints {+(textAt.mm * textAt.scale / scale).toFixed(1)} mm.</span>}
        <label><input type="checkbox" checked={!!setup.stamp} onChange={(e) => setSetup({ ...setup, stamp: e.target.checked })} /> Plot stamp in the margin (sheet, date and time, revision, drawn by)</label>
        <span className="m">{plan ? 'A plan too big for the paper at its scale is split over sheets. ' : 'Diagrams are scaled to fit the paper. '}Printing is always black-and-white.</span>
      </div>
      <div className="modal-actions">
        <button className="chip" onClick={onClose}>Cancel</button>
        {canPreviewSheetPdf() && drawable(sheet) && <button className="chip" onClick={() => setPreview(sheetWith(project, { ...own, plot: setup }))}>Preview</button>}
        <span className="sp" />
        <button className="chip" onClick={() => { onSave(sheetWith(withDefaults(project, setup), { ...own, plot: undefined }), `Page setup: the set's default is now ${tables.find((t) => t.id === (setup.pens ?? tables[0].id))?.name} · ⌘Z to undo`); onClose(); }}>Save as the set's default</button>
        <button className="chip primary" onClick={() => { onSave(sheetWith(project, { ...own, plot: setup }), `Page setup of ${sheet.number} saved · ⌘Z to undo`); onClose(); }}>Save for this sheet</button>
      </div>
    </Modal>
    {preview && <SheetPdfPreview project={preview} sheet={sheet} run={run} onClose={() => setPreview(undefined)} />}
  </>);
}

/** Pen tables: each kind of line's width and ink; a CTB file can be imported as a table. */
export function PenTableDialog({ project, onSave, onClose }: { project: Project; onSave: (next: Project, message: string) => void; onClose: () => void }) {
  const tables = tablesOf(project);
  const [id, setId] = useState(plotOf(project).pens ?? tables[0].id);
  const [draft, setDraft] = useState<PenTable>(tables.find((t) => t.id === id) ?? tables[0]);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const pick = (next: string) => { setId(next); setDraft(tablesOf(project).find((t) => t.id === next) ?? tables[0]); };
  const setPen = (k: PenKey, f: 'w' | 'grey', v: number) => setDraft({ ...draft, pens: { ...draft.pens, [k]: { ...draft.pens[k], [f]: v } } });
  async function importCtb(f: File) {
    setError('');
    try {
      const t = tableFromCtb(newTableId(project), f.name.replace(/\.ctb$/i, ''), await parseCtb(new Uint8Array(await f.arrayBuffer())));
      onSave(withTable(project, { ...t, ctb: f.name }), `${f.name} imported as a pen table · ⌘Z to undo`);
      setId(t.id); setDraft({ ...t, ctb: f.name });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 640 }} label="Pen tables">
      <h3>Pen tables</h3>
      <div className="cad-devform">
        <label>Table<select aria-label="Table" value={id} onChange={(e) => pick(e.target.value)}>{tablesOf(project).map((t) => <option key={t.id} value={t.id}>{t.name}{t.ctb ? ` (from ${t.ctb})` : ''}</option>)}</select></label>
        <label>Name<input aria-label="Table name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      </div>
      <table className="sched" aria-label="Pens">
        <thead><tr><th>Line</th><th>Width (mm)</th><th>Ink</th></tr></thead>
        <tbody>{PEN_KEYS.map((k) => (
          <tr key={k}>
            <td>{PEN_LABEL[k]}</td>
            <td><select aria-label={`${PEN_LABEL[k]} width`} value={draft.pens[k].w} onChange={(e) => setPen(k, 'w', Number(e.target.value))}>
              {(k === 'sld' || k === 'bus' ? [0, ...PEN_WIDTHS] : PEN_WIDTHS).map((w) => <option key={w} value={w}>{w ? w.toFixed(2) : 'As drawn'}</option>)}
            </select></td>
            <td><select aria-label={`${PEN_LABEL[k]} ink`} value={draft.pens[k].grey} onChange={(e) => setPen(k, 'grey', Number(e.target.value))}>
              {[...new Set([...PEN_INKS, draft.pens[k].grey])].sort((a, b) => b - a).map((g) => <option key={g} value={g}>{g >= 100 ? 'Black' : `${g} % grey`}</option>)}
            </select></td>
          </tr>
        ))}</tbody>
      </table>
      <p className="m">The architect's lines on plan sheets are the room outlines. A CTB file (from your CAD program's plot styles folder) gives each kind of line the width and screening of the colour of its DXF layer: frame, title and cables colour 7, devices and trays 3, busbars 1, the architect's plan 8.</p>
      {error && <p className="m" role="alert">⚠ {error}</p>}
      <input ref={file} type="file" accept=".ctb" hidden aria-label="CTB file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCtb(f); e.target.value = ''; }} />
      <div className="modal-actions">
        <button className="chip" onClick={onClose}>Close</button>
        <button className="chip" onClick={() => file.current?.click()}>Import CTB…</button>
        <span className="sp" />
        {draft.id === DEFAULT_PENS.id && <button className="chip" onClick={() => { setDraft(DEFAULT_PENS); onSave(withTable(project, DEFAULT_PENS), 'Pen table LVDS Electrical reset · ⌘Z to undo'); }}>Reset</button>}
        <button className="chip" onClick={() => { const t = { ...draft, id: newTableId(project), name: `${draft.name} (copy)`, ctb: undefined }; onSave(withTable(project, t), `Pen table ${t.name} added · ⌘Z to undo`); setId(t.id); setDraft(t); }}>Save as new</button>
        <button className="chip primary" onClick={() => onSave(withTable(project, draft), `Pen table ${draft.name} saved · ⌘Z to undo`)}>Save</button>
      </div>
    </Modal>
  );
}
