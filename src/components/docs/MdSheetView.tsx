import { ask, tell } from '../ConfirmDialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Board, Feeder, Project, SpareWay } from '../../types';
import { applyMdEdits, buildMdSheet } from '../../docs/mdSheet';
import { addOutgoingFeeder, deleteOutgoingFeeder, duplicateOutgoingFeeder, feederDeleteBlock } from '../../model/mdFeeders';
import { addSpareWay, deleteSpareWay, spareLabel, spareRef } from '../../model/spareWays';
import { revisionStamp } from '../../model/revisions';
import ClassicGrid, { type ClassicGridHandle } from '../grid/ClassicGrid';
import { txt } from '../../util/format';

/** What the ribbon's Load schedule tools do on this form, published while it is on screen. */
export interface MdTools {
  /** Label of the active row: an outgoing feeder (with the panel it feeds) or a spare / space way; none on the other rows. */
  row?: string;
  /** Why Delete / Duplicate can't act on that row. */
  rowBlock?: string; dupBlock?: string;
  /** The active row has cells to edit (Edit opens its dialog). */
  canEdit: boolean;
  addFeeder: () => void;
  addWay: (kind: 'spare' | 'space', phase?: 'one' | 'three') => void;
  fillDown: () => void;
  copy: () => boolean;
  paste: (text: string) => boolean;
  edit: () => void;
  remove: () => void;
  duplicate: () => void;
}

/** "Details of connected load, maximum demand & kWh metering" for one
 * board, drawn like the authority form: header, the sheet, then the demand
 * factor / maximum demand line and the meter legend. */
export default function MdSheetView({ project, boardId, onChange, onStatus, onSettings, onTools }: {
  project: Project;
  boardId: string;
  onChange: (p: Project) => void;
  onStatus: (m: string) => void;
  onSettings: () => void;
  /** Tells the ribbon what its Load schedule tools can do now (undefined when this form goes away). */
  onTools?: (t: MdTools | undefined) => void;
}) {
  const sheet = useMemo(() => buildMdSheet(project, boardId), [project, boardId]);
  const f = sheet.form;
  const blank = (v: string) => v || <span className="md-blank" title="Set in Project settings">—</span>;
  const add = () => {
    const r = addOutgoingFeeder(project, boardId);
    if (r.project !== project) onChange(r.project);
    onStatus(r.message);
  };
  /** Delete control on each outgoing feeder row (not the incomer). A feeder
   * that supplies a panel can't be deleted here: it would leave that panel unfed. */
  const [singlePhase, setSinglePhase] = useState(false);
  const addWay = (kind: 'spare' | 'space', phase: 'one' | 'three' = singlePhase ? 'one' : 'three') => {
    const r = addSpareWay(project, boardId, kind, phase === 'one' ? 'R' : 'RYB');
    if (r.project !== project) onChange(r.project);
    onStatus(r.message);
  };
  const removeWay = async (w: SpareWay) => {
    const what = spareLabel(w).toLowerCase();
    if (!(await ask(`Delete this ${what} from ${boardId}?`))) return;
    const r = deleteSpareWay(project, boardId, w.id);
    onChange(r.project);
    onStatus(r.message);
  };
  const removeFeeder = async (f: Feeder, toBoard?: Board) => {
    const block = feederDeleteBlock(project, f.id);
    const label = toBoard ? toBoard.id : f.name || f.id;
    if (block) { onStatus(block); void tell(block); return; }
    if (!(await ask(`Delete outgoing feeder ${f.id} (${label}) from ${boardId}?`))) return;
    const r = deleteOutgoingFeeder(project, f.id);
    if (r.project !== project) onChange(r.project);
    onStatus(r.message);
  };
  const rowAction = (y: number) => {
    const row = sheet.rows[y];
    if (row.type === 'way') {
      const w = row.way;
      const what = spareLabel(w).toLowerCase();
      return (
        <button className="icon-btn" aria-label={`Delete ${what}`} title={`Delete this ${what}`} onClick={() => removeWay(w)}>
          <Trash2 size={14} />
        </button>
      );
    }
    if (row.type !== 'feeder') return null;
    const f = row.feeder;
    const block = feederDeleteBlock(project, f.id);
    const label = row.toBoard ? row.toBoard.id : f.name || f.id;
    return (
      <button className={`icon-btn${block ? ' md-del-blocked' : ''}`} aria-label={`Delete feeder ${f.id}`}
        title={block ?? `Delete feeder ${f.id} (${label})`}
        onClick={() => removeFeeder(f, row.toBoard)}>
        <Trash2 size={14} />
      </button>
    );
  };
  // The ribbon's tools act on the grid's active row.
  const grid = useRef<ClassicGridHandle | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const activeRow = active === null ? undefined : sheet.rows[active];
  let row: string | undefined, rowBlock: string | undefined, dupBlock: string | undefined;
  if (activeRow?.type === 'feeder') {
    const f = activeRow.feeder;
    row = activeRow.toBoard ? `${f.id} → ${activeRow.toBoard.id}` : f.id;
    rowBlock = feederDeleteBlock(project, f.id);
    dupBlock = activeRow.toBoard ? `${f.id} supplies ${activeRow.toBoard.id} — copy the board on the SLD tab` : undefined;
  } else if (activeRow?.type === 'way') {
    row = `${spareLabel(activeRow.way)}${spareRef(activeRow.way) ? ` ${spareRef(activeRow.way)}` : ''}`;
    dupBlock = 'Add another one from Spare';
  }
  const canEdit = active !== null && !!sheet.data[active]?.some((_, x) => sheet.editable(active, x));
  const now: MdTools = {
    row, rowBlock, dupBlock, canEdit, addFeeder: add, addWay,
    fillDown: () => grid.current?.cmds.fillDown(), copy: () => grid.current?.cmds.copy() ?? false, paste: (t) => grid.current?.cmds.paste(t) ?? false,
    edit: () => { if (active !== null && !grid.current?.edit(active)) onStatus(`${row ?? 'This row'}: nothing to edit on this form`); },
    remove: () => { if (activeRow?.type === 'feeder') void removeFeeder(activeRow.feeder, activeRow.toBoard); else if (activeRow?.type === 'way') void removeWay(activeRow.way); },
    duplicate: () => {
      if (activeRow?.type !== 'feeder' || dupBlock) return;
      const r = duplicateOutgoingFeeder(project, activeRow.feeder.id);
      if (r.project !== project) onChange(r.project);
      onStatus(r.message);
    }
  };
  // Published by value, handlers through a ref (an object built every render would loop).
  const tools = useRef(now);
  tools.current = now;
  const publish = useRef(onTools);
  publish.current = onTools;
  useEffect(() => {
    publish.current?.({
      row, rowBlock, dupBlock, canEdit,
      addFeeder: () => tools.current.addFeeder(), addWay: (k, p) => tools.current.addWay(k, p), fillDown: () => tools.current.fillDown(),
      copy: () => tools.current.copy(), paste: (t) => tools.current.paste(t), edit: () => tools.current.edit(), remove: () => tools.current.remove(), duplicate: () => tools.current.duplicate()
    });
  }, [row, rowBlock, dupBlock, canEdit]);
  useEffect(() => () => publish.current?.(undefined), []);
  return (
    <div className="md-form">
      <div className="md-head">
        <div><span>PROJECT:</span> <b>{f.project}</b></div>
        <div className="md-title">{f.title}</div>
        <div><span>AREA:</span> {blank(f.area)} <span className="md-rev">{revisionStamp(project)}</span></div>
        <div><span>PLANNED COMPLETION DATE:</span> {blank(f.completion)}</div>
        <div><span>OWNER:</span> {blank(f.owner)}</div>
        <div><span>PLOT NO:</span> {blank(f.plotNo)}</div>
        <div><b>{f.boardLine}</b></div>
        <div><span>CONSULTANT:</span> {blank(f.consultant)}</div>
        <div><span>LOCATION:</span> {blank(f.location)}</div>
      </div>
      <div className="ls-actions">
        <button className="chip" onClick={add} title="Adds an outgoing feeder (general load, sized by the app) to this panel — type its kW in the TCL column; feeders to panels are added by dropping a board on the SLD"><Plus size={14} /> Add feeder</button>
        <span className="seg ls-spare-add" title="A spare is a way with a breaker fitted and nothing connected; a space is an empty way kept for a future breaker. Neither carries load.">
          <button onClick={() => addWay('spare')}><Plus size={14} /> Spare</button>
          <button onClick={() => addWay('space')}><Plus size={14} /> Space</button>
          <label className="m"><input type="checkbox" checked={singlePhase} onChange={(e) => setSinglePhase(e.target.checked)} /> 1-phase (SP)</label>
        </span>
      </div>
      <ClassicGrid
        model={sheet}
        rowAction={rowAction}
        handle={grid}
        onActive={(y) => setActive((q) => (q === y ? q : y))}
        onStatus={onStatus}
        onEdits={(edits) => {
          const { project: next, rejected } = applyMdEdits(project, sheet, edits);
          if (next !== project) onChange(next);
          return { changed: next !== project, rejected };
        }}
      />
      <div className="md-foot">
        <div className="md-connected">{f.connectedTo.map((l) => <div key={l}>{l}</div>)}</div>
        <div className="md-demand">
          <span>DEMAND FACTOR: <b>{f.demandFactor.toFixed(2)}</b></span>
          <span>MAX. DEMAND: <b>{txt.power(f.maxDemandKw)} kW</b></span>
          <span>TOTAL CONNECTED LOAD: <b>{txt.power(f.totalConnectedKw)} kW</b></span>
          <span>TOTAL BUILD UP AREA (Sq. mtr): {blank(f.builtUpArea)}</span>
        </div>
        <div className="md-demand">
          <span>CONSULTANT/ CONTRACTOR: {blank(f.contractor)}</span>
          <span>TEL: {blank(f.tel)}</span>
          <span>FAX: {blank(f.fax)}</span>
          <button className="chip" onClick={onSettings}>Edit form details…</button>
        </div>
        <p className="m">
          {f.metering && <>Type of meter (rating of incomer): (1) up to 60 A, 1-phase · (2) up to 125 A, 3-phase · (3) LV CT / HV CT.
          Type 1 in a meter column to propose that meter. </>}An equipment feeder's load is typed in its TCL column (its breaker and cable are re-sized); a panel's load comes from the boards and load schedules below — edit them there.
        </p>
      </div>
    </div>
  );
}
