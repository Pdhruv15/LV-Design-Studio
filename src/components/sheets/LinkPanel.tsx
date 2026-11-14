import { Check, X } from 'lucide-react';
import { cellAt, cellName, colName } from '../../calc/sheetFormula';
import { linkBoards, linkFromPlaceholders, linkNeeds, LINK_FIELDS, linkToBoard, removeLink, setFirstRow, setLinkCell, setLinkColumn, sheetsForBoards, startLink, suggestLink } from '../../docs/sheetLink';
import { mergeAt, type Sheet } from '../../model/sheets';
import type { Project } from '../../types';

/** The Link columns panel of the Sheets page: which cells and columns of a sheet are linked to a DB of the project. */

const CSS = `
.shl { box-sizing: border-box; flex: none; width: 340px; max-height: 62vh; overflow: auto; border: 1px solid var(--line); border-radius: 9px; background: var(--panel); padding: 12px; font-size: 12.5px; color: var(--tx); display: flex; flex-direction: column; gap: 8px; }
.shl-head { display: flex; align-items: center; justify-content: space-between; }
.shl h4 { margin: 0; font-size: 14px; }
.shl h5 { margin: 6px 0 0; font-size: 12px; color: var(--mut); }
.shl p { margin: 0; }
.shl-mut { color: var(--mut); }
.shl-row { display: flex; align-items: center; gap: 6px; }
.shl-row > span:first-child { flex: none; width: 110px; color: var(--mut); }
.shl select, .shl input { box-sizing: border-box; min-width: 0; height: 30px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--p2); color: var(--tx); font: inherit; font-size: 12.5px; }
.shl-row select { flex: 1; }
.shl input[type="number"] { width: 70px; }
.shl-btn { box-sizing: border-box; height: 30px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--p2); color: var(--tx); font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.shl-btn.shl-go { background: var(--acc); color: var(--on-acc); border-color: var(--acc); }
.shl-btn:disabled { opacity: 0.45; cursor: default; }
.shl-x { flex: none; width: 30px; padding: 0; text-align: center; }
.shl-line { display: grid; grid-template-columns: 34px 62px 1fr 30px; align-items: center; gap: 6px; }
.shl-cols .shl-line { grid-template-columns: 22px 78px 1fr; }
.shl-cap { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--mut); }
.shl-own { color: var(--res-pf); }
.shl-needs { border: 1px solid var(--line); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.shl-need { display: flex; align-items: center; gap: 6px; }
.shl-note { font-size: 12px; color: var(--mut); }
`;

const cellFields = LINK_FIELDS.filter((f) => f.kind === 'cell'), rowFields = LINK_FIELDS.filter((f) => f.kind === 'row');

/** The heading of a column: the text above the first circuit row, or that of the merged area holding it, or the nearest text above (three rows). */
function headingOf(sheet: Sheet, col: number, first: number): string {
  for (let r = first - 1; r >= Math.max(1, first - 3); r--) {
    const m = mergeAt(sheet, r, col), t = (m ? sheet.cells[cellName(m.c0, m.r0)] : sheet.cells[cellName(col, r)]) ?? '';
    if (t.trim()) return t.trim();
  }
  return '';
}

export default function LinkPanel({ project, sheet, sheets, active, onSheet, onAddSheets, onStatus, onClose }: {
  project: Project; sheet: Sheet; sheets: Sheet[]; active: { r: number; c: number }; onSheet: (next: Sheet) => void; onAddSheets: (made: Sheet[]) => void; onStatus?: (m: string) => void; onClose: () => void;
}) {
  const link = sheet.link, name = cellName(active.c, active.r);
  const head = (
    <div className="shl-head"><h4>Link columns</h4><button type="button" className="shl-btn shl-x" aria-label="Close" onClick={onClose}><X size={16} aria-hidden /></button></div>
  );
  if (!link) {
    const holders = linkFromPlaceholders(sheet);
    return (
      <aside className="shl" aria-label="Link columns">
        <style>{CSS}</style>
        {head}
        <p>This sheet is not linked to the project.</p>
        <button type="button" className="shl-btn shl-go" onClick={() => { const s = suggestLink(sheet); if (s) onSheet(s); else onStatus?.('No heading row found. Start with no links and pick the first circuit row.'); }}>Suggest links from the headings</button>
        {holders && <button type="button" className="shl-btn" onClick={() => { onSheet(holders.sheet); if (holders.unknown.length) onStatus?.(`Not linked: ${holders.unknown.join(', ')}`); }}>Use the placeholders in this sheet</button>}
        <button type="button" className="shl-btn" onClick={() => onSheet(startLink(sheet, active.r))}>Start with no links</button>
      </aside>
    );
  }
  const boards = linkBoards(project), needs = linkNeeds(link), ready = needs.every((n) => n.ok);
  const lastRow = link.firstRow + Math.max(1, link.rows.length) - 1;
  const used = new Set(Object.values(link.cells).map((c) => c.field));
  const free = cellFields.find((f) => !used.has(f.key));
  const cellList = Object.entries(link.cells).sort(([a], [b]) => { const p = cellAt(a)!, q = cellAt(b)!; return p.row - q.row || p.col - q.col; });
  const columns = Array.from({ length: sheet.cols }, (_, i) => i + 1).map((c) => ({ letters: colName(c), heading: headingOf(sheet, c, link.firstRow) })).filter((c) => c.heading || link.columns[c.letters]);
  const others = boards.filter((b) => !sheets.some((s) => s.link?.boardId === b.id));
  return (
    <aside className="shl" aria-label="Link columns">
      <style>{CSS}</style>
      {head}
      <label className="shl-row"><span>This sheet is a</span><select disabled value="db" aria-label="This sheet is a"><option value="db">DB schedule</option></select></label>
      <label className="shl-row"><span>Board</span>
        <select aria-label="Board" value={link.boardId ?? ''} onChange={(e) => { if (e.target.value) onSheet(linkToBoard(sheet, e.target.value)); }}>
          <option value="">Choose a board</option>
          {boards.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
        </select></label>
      <div className="shl-row"><span>First circuit row</span>
        <input type="number" min={1} aria-label="First circuit row" key={link.firstRow} defaultValue={link.firstRow} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          onBlur={(e) => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && n !== link.firstRow) onSheet(setFirstRow(sheet, n)); else e.target.value = String(link.firstRow); }} />
        <button type="button" className="shl-btn" onClick={() => onSheet(setFirstRow(sheet, active.r))} disabled={active.r === link.firstRow}>Use row {active.r}</button></div>

      <h5>Cells of the sheet</h5>
      {cellList.map(([k, c]) => {
        const at = cellAt(k)!, caption = c.before?.replace(/\s*:\s*$/, '').trim() || (at.col > 1 ? sheet.cells[cellName(at.col - 1, at.row)] ?? '' : '');
        return (
          <div className="shl-line" key={k}>
            <span>{k}</span><span className="shl-cap" title={caption}>{caption}</span>
            <select aria-label={`Field of ${k}`} value={c.field} onChange={(e) => onSheet(setLinkCell(sheet, k, e.target.value))}>
              {!cellFields.some((f) => f.key === c.field) && <option value={c.field}>{c.field}</option>}
              {cellFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <button type="button" className="shl-btn shl-x" aria-label={`Unlink ${k}`} onClick={() => onSheet(setLinkCell(sheet, k, undefined))}><X size={14} aria-hidden /></button>
          </div>
        );
      })}
      <button type="button" className="shl-btn" disabled={!!link.cells[name] || (active.r >= link.firstRow && active.r <= lastRow) || !free} onClick={() => free && onSheet(setLinkCell(sheet, name, free.key))}>Link cell {name}</button>

      <h5>Columns — row {link.firstRow} repeats for every circuit</h5>
      <div className="shl-cols" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {columns.map(({ letters, heading }) => {
          const f = link.columns[letters] ?? '';
          return (
            <div className="shl-line" key={letters}>
              <span>{letters}</span><span className="shl-cap" title={heading}>{heading}</span>
              <select aria-label={`Link of column ${letters}`} className={f === 'own' ? 'shl-own' : undefined} value={f} onChange={(e) => onSheet(setLinkColumn(sheet, letters, e.target.value || undefined))}>
                <option value="">Not linked</option>
                {rowFields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </div>
          );
        })}
      </div>

      <div className="shl-needs" aria-label="Needed to build the board and the SLD">
        <strong>Needed to build the board and the SLD</strong>
        {needs.map((n) => <div className="shl-need" key={n.key}>{n.ok ? <Check size={14} color="var(--ok)" aria-label="done" /> : <X size={14} color="var(--bad)" aria-label="missing" />}<span>{n.label}</span></div>)}
        <span className="shl-mut">Optional: MCB and cable. Left blank, the app sizes them by the rules.</span>
      </div>
      <p style={{ color: ready ? 'var(--ok)' : 'var(--mut)' }}>{ready ? 'Ready — this sheet can build boards, circuits and the SLD.' : 'Not ready — link what is marked above.'}</p>
      {link.boardId && <button type="button" className="shl-btn shl-go" disabled={!others.length} onClick={() => onAddSheets(sheetsForBoards(sheets, sheet, others.map((b) => b.id)))}>Add a sheet for every other DB ({others.length})</button>}
      <button type="button" className="shl-btn" onClick={() => onSheet(removeLink(sheet))}>Remove the link</button>
      <p className="shl-note">Linked cells are filled from the project. Typing in them comes with Apply to project.</p>
    </aside>
  );
}
