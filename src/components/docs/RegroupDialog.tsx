import { useMemo, useState } from 'react';
import { Modal } from '../ui';
import { scheduleCircuits } from '../../calc/loadSchedule';
import { ELCB_SIZES, regroupPreview, type ElcbScheme, type ElcbSize, type RegroupOptions } from '../../model/elcbs';
import type { Board, Project } from '../../types';

const elcbList = (sizes: number[]) => (sizes.length ? `${sizes.length} ELCB${sizes.length === 1 ? '' : 's'} (${sizes.join(' · ')} circuits)` : 'no ELCB');
const rcboList = (n: number) => (n ? `, ${n} RCBO${n === 1 ? '' : 's'}` : '');

/** Re-group all ELCBs: the whole DB cut again into ELCBs of one size, or a whole-board scheme (one ELCB at the incomer,
 * an RCBO on every circuit), shown before and after it is applied. */
export default function RegroupDialog({ project, board, onApply, onClose }: {
  project: Project;
  board: Board;
  onApply: (o: RegroupOptions) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<ElcbSize | ElcbScheme>(board.elcbs?.some((e) => e.incomer) ? 'incomer' : board.rcboEveryCircuit ? 'rcbo' : (board.elcbGroupSize ?? 6) as ElcbSize);
  const [keepApart, setKeepApart] = useState(board.elcbKeepApart ?? true);
  const [keepRcbos, setKeepRcbos] = useState(true);
  const scheme = typeof choice === 'string' ? choice : undefined;
  const size: ElcbSize = typeof choice === 'number' ? choice : 0;
  const hasRcbos = useMemo(() => scheduleCircuits(project, board.id).some((f) => f.rcbo || f.noRcd), [project, board.id]);
  const options: RegroupOptions = { size, keepApart, keepRcbos, scheme };
  const preview = useMemo(() => regroupPreview(project, board.id, { size, keepApart, keepRcbos, scheme }), [project, board.id, size, keepApart, keepRcbos, scheme]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(options);
    onClose();
  };
  const title = `Re-group all ELCBs — ${board.id}`;
  const after = preview.incomer ? `${preview.incomer} at the incomer over every circuit${preview.rcbos ? `${rcboList(preview.rcbos)} below it` : ''}` : `${elcbList(preview.after)}${rcboList(preview.rcbos)}`;
  return (
    <Modal onClose={onClose} className="modal elcb-dialog" onSubmit={submit} label={title}>
      <h3>{title}</h3>
      <fieldset>
        <legend>Cut every way into</legend>
        {ELCB_SIZES.map((n) => (
          <label key={n} className="row"><input type="radio" name="regroup-size" checked={choice === n} onChange={() => setChoice(n)} /> ELCBs of {n} circuits ({n / 3} way{n > 3 ? 's' : ''})</label>
        ))}
        <label className="row"><input type="radio" name="regroup-size" checked={choice === 'incomer'} onChange={() => setChoice('incomer')} /> One ELCB at the incomer (S-type when 30 mA RCBOs sit below it)</label>
        <label className="row"><input type="radio" name="regroup-size" checked={choice === 'rcbo'} onChange={() => setChoice('rcbo')} /> RCBO on every circuit (new circuits too)</label>
        <label className="row"><input type="radio" name="regroup-size" checked={choice === 0} onChange={() => setChoice(0)} /> No ELCB</label>
      </fieldset>
      <label className="row"><input type="checkbox" checked={keepApart && size > 0} disabled={!size} onChange={(e) => setKeepApart(e.target.checked)} /> Keep lighting and power circuits apart (circuits move, so their numbers change)</label>
      {hasRcbos && <label className="row"><input type="checkbox" checked={keepRcbos} onChange={(e) => setKeepRcbos(e.target.checked)} /> Keep the RCBOs and No RCD circuits</label>}
      <p className="m">Now: {elcbList(preview.before)}.<br />After: {after}{preview.moved ? `; ${preview.moved} circuit${preview.moved === 1 ? '' : 's'} change reference` : ''}.</p>
      {preview.warning && <p className="warn" role="alert">{preview.warning}.</p>}
      <p className="m">Ratings, mA and the numbers ELCB-1, 2 … are worked out again. Undo puts it back.</p>
      <div className="modal-actions">
        <span className="sp" />
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
        <button type="submit" className="chip primary">Re-group</button>
      </div>
    </Modal>
  );
}
