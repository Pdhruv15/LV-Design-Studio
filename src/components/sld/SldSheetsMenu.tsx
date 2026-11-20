import { setOf, sheetsOfView, statusText } from '../../model/drawingSet';
import type { Project } from '../../types';
import type { DrawingsTab } from '../docs/DrawingsView';

type Mode = 'system' | 'board' | 'earthing' | 'riser';

/** The building the Riser tab shows: its stored pick (RiserView keeps it as lvds.riser.building), else the first. */
const shownRiserBuilding = (p: Project) => {
  let pick = '';
  try { pick = JSON.parse(localStorage.getItem('lvds.riser.building') ?? '""') as string; } catch { /* none stored */ }
  const all = p.building?.buildings ?? [];
  return (all.find((b) => b.id === pick) ?? all[0])?.id;
};

const NONE: Record<Mode, string> = {
  system: 'No SLD sheet yet: + New sheet in Design CAD → Sheets',
  board: '',
  riser: 'No sheet of this riser yet: Add to sheet on the riser',
  earthing: 'No earthing sheet yet: Sheets on the earthing screen'
};

/** The SLD page's Sheets menu, after the four diagram tabs: the sheets of the diagram on screen, then the sheet set's
 * register tabs. Every item opens Design CAD → Sheets there; the sheets themselves stay in Design CAD. */
export default function SldSheetsMenu({ project, mode, boardId, close, onOpen, onTab, onMakeBoardSheet }: {
  project: Project; mode: Mode; boardId?: string; close: () => void;
  onOpen: (sheetId: string) => void; onTab: (tab: DrawingsTab) => void; onMakeBoardSheet: (boardId: string) => void;
}) {
  const set = setOf(project);
  const { sheets, own } = sheetsOfView(set, mode, boardId, mode === 'riser' ? shownRiserBuilding(project) : undefined);
  const head = mode === 'system' ? 'Sheets of the system diagram' : mode === 'board' ? `Sheets showing ${boardId}` : mode === 'riser' ? 'Sheets of this riser' : 'Earthing sheets';
  const go = (run: () => void) => () => { close(); run(); };
  return (
    <>
      <div className="mp-h">{head}</div>
      {sheets.map((s) => (
        <button key={s.id} onClick={go(() => onOpen(s.id))} title={`Open ${s.number} in Design CAD → Sheets`}>
          <b>{s.number}</b> {s.title}{(s.status ?? set.status) && <span className="m"> · {statusText(s.status ?? set.status)}</span>}
        </button>
      ))}
      {mode === 'board' && boardId && !own && (
        <button onClick={go(() => onMakeBoardSheet(boardId))} title={`Add ${boardId}'s circuit diagram as a sheet of its own to the drawing set, then open it`}>Make a sheet of {boardId} on its own…</button>
      )}
      {!sheets.length && mode !== 'board' && <button disabled>{NONE[mode]}</button>}
      <hr />
      <div className="mp-h">The sheet set</div>
      <button onClick={go(() => onTab('sheets'))}>All sheets<br /><span className="m">The register: filters, bulk changes, export</span></button>
      <button onClick={go(() => onTab('layout'))}>Sheet setup<br /><span className="m">How sheets are made: panels per sheet, values printed, legend</span></button>
      <button onClick={go(() => onTab('titleblock'))}>Title block and numbering</button>
      <button onClick={go(() => onTab('issues'))}>Issues and transmittals</button>
    </>
  );
}
