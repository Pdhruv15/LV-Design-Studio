import { useMemo, useState } from 'react';
import { Modal } from '../ui';
import { scheduleCircuits } from '../../calc/loadSchedule';
import { ELCB_SIZES, regroupPreview, type ElcbSize, type RegroupOptions } from '../../model/elcbs';
import type { Board, Project } from '../../types';

const elcbList = (sizes: number[]) => (sizes.length ? `${sizes.length} ELCB${sizes.length === 1 ? '' : 's'} (${sizes.join(' · ')} circuits)` : 'no ELCB');

/** Re-group all ELCBs: the whole DB cut again into ELCBs of one size, shown before and after it is applied. */
export default function RegroupDialog({ project, board, onApply, onClose }: {
  project: Project;
  board: Board;
  onApply: (o: RegroupOptions) => void;
  onClose: () => void;
}) {
  const [size, setSize] = useState<ElcbSize>((board.elcbGroupSize ?? 6) as ElcbSize);
  const [keepApart, setKeepApart] = useState(true);
  const [keepRcbos, setKeepRcbos] = useState(true);
  const hasRcbos = useMemo(() => scheduleCircuits(project, board.id).some((f) => f.rcbo), [project, board.id]);
  const preview = useMemo(() => regroupPreview(project, board.id, { size, keepApart, keepRcbos }), [project, board.id, size, keepApart, keepRcbos]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({ size, keepApart, keepRcbos });
    onClose();
  };
  const title = `Re-group all ELCBs — ${board.id}`;
  return (
    <Modal onClose={onClose} className="modal elcb-dialog" onSubmit={submit} label={title}>
      <h3>{title}</h3>
      <fieldset>
        <legend>Cut every way into</legend>
        {ELCB_SIZES.map((n) => (
          <label key={n} className="row"><input type="radio" name="regroup-size" checked={size === n} onChange={() => setSize(n)} /> ELCBs of {n} circuits ({n / 3} way{n > 3 ? 's' : ''})</label>
        ))}
        <label className="row"><input type="radio" name="regroup-size" checked={size === 0} onChange={() => setSize(0)} /> No ELCB</label>
      </fieldset>
      <label className="row"><input type="checkbox" checked={keepApart && size > 0} disabled={!size} onChange={(e) => setKeepApart(e.target.checked)} /> Keep lighting and power circuits apart (circuits move, so their numbers change)</label>
      {hasRcbos && <label className="row"><input type="checkbox" checked={keepRcbos} onChange={(e) => setKeepRcbos(e.target.checked)} /> Keep the RCBOs</label>}
      <p className="m">Now: {elcbList(preview.before)}.<br />After: {elcbList(preview.after)}{preview.moved ? `; ${preview.moved} circuit${preview.moved === 1 ? '' : 's'} change reference` : ''}.</p>
      <p className="m">Ratings, mA and the numbers ELCB-1, 2 … are worked out again. Undo puts it back.</p>
      <div className="modal-actions">
        <span className="sp" />
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
        <button type="submit" className="chip primary">Re-group</button>
      </div>
    </Modal>
  );
}
