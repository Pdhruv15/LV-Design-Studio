import { useEffect, useMemo, useRef, useState } from 'react';
import { copyLvToLevels, boardChoices, boardsToMap, defaultBoard, type CopyTarget } from '../../model/copyLevels';
import { plansOf } from '../../model/cadPlans';
import { floorLabel, type Floor } from '../../model/levels';
import type { Project } from '../../types';
import type { ElvSystem } from '../../elv/defaults';
import { copySystems, systemCounts } from '../../components/elv/elvPlan';

/** Copy to levels (CL): choose what of this level to copy (its lights, sockets and equipment, its switches and boxes,
 * each ELV system), the levels to copy to, and for each board of this level the board that takes its devices on every
 * other level. The run is worked out on the project as it changes, so the foot, the notes and Copy agree. */

const s = (n: number) => (n === 1 ? '' : 's');
const onLevel = (x: { buildingId: string; levelId: string }, f: Floor) => x.buildingId === f.ref.building && x.levelId === f.ref.level;

export function CopyLevelsDialog({ project, from, file, onCopy, onClose }: {
  project: Project; from: Floor; file?: string; onCopy: (next: Project, message: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const fromLevel = { building: from.ref.building, level: from.ref.level };
  const nPoints = (project.lvPoints ?? []).filter((d) => onLevel(d, from)).length;
  const nAcc = (project.cadAccessories ?? []).filter((d) => onLevel(d, from)).length;
  const elv = systemCounts(project, fromLevel);
  const others = useMemo(() => plansOf(project).filter((x) => x.floor.key !== from.key), [project, from.key]);

  const [pts, setPts] = useState(nPoints > 0), [acc, setAcc] = useState(nAcc > 0);
  const [systems, setSystems] = useState<ElvSystem[]>(() => elv.filter((x) => x.n > 0).map((x) => x.system));
  const [levels, setLevels] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, string>>({}); // `${level key}|${board}` → board chosen ('' leaves it out)
  const [replace, setReplace] = useState(false);

  const ticked = others.filter((x) => levels.includes(x.floor.key));
  const map = useMemo(() => boardsToMap(project, from.ref), [project, from.ref]);
  const choice = (to: Floor, boardId: string): string | undefined => {
    const k = `${to.key}|${boardId}`;
    return k in picked ? picked[k] || undefined : defaultBoard(project, from.ref, boardId, to.ref);
  };
  const showMap = pts && ticked.length > 0 && map.length > 0;

  const run = useMemo(() => {
    const targets: CopyTarget[] = ticked.map((x) => ({ level: x.floor.ref, label: x.label, boards: Object.fromEntries(showMap ? map.map((m) => [m.boardId, choice(x.floor, m.boardId)]) : []) }));
    const lv = copyLvToLevels(project, from.ref, targets, { points: pts, acc }, replace);
    let next = lv.project;
    const rows = ticked.map((x, i) => {
      const r = lv.levels[i];
      let copied = r.points + r.acc, removed = r.removed;
      if (systems.length) {
        const e = copySystems(next, fromLevel, { building: x.floor.ref.building, level: x.floor.ref.level }, systems, replace);
        next = e.next; copied += e.copied; removed += e.removed;
      }
      return { label: x.label, copied, removed, leftOut: r.leftOut };
    });
    return { project: next, rows, notes: lv.notes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, from, levels, pts, acc, systems, replace, picked, showMap]);

  const total = run.rows.reduce((t, r) => t + r.copied, 0), left = run.rows.reduce((t, r) => t + r.leftOut, 0), removed = run.rows.reduce((t, r) => t + r.removed, 0);
  const already = replace ? [] : ticked.map((x) => {
    const lvl = x.floor;
    const n = (pts ? (project.lvPoints ?? []).filter((d) => onLevel(d, lvl)).length : 0) + (acc ? (project.cadAccessories ?? []).filter((d) => onLevel(d, lvl)).length : 0)
      + systemCounts(project, { building: lvl.ref.building, level: lvl.ref.level }).filter((c) => systems.includes(c.system)).reduce((t, c) => t + c.n, 0);
    return { label: x.label, n };
  }).filter((x) => x.n > 0);
  const why = !ticked.length ? 'Choose a level first' : total === 0 ? 'Nothing to copy' : undefined;
  const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));
  const copy = () => {
    if (why) return;
    onCopy(run.project, `CL  ${total} device${s(total)} copied to ${ticked.length} level${s(ticked.length)}${left ? ` — ${left} left out` : ''}${removed ? ` · ${removed} taken off first` : ''} · ⌘Z to undo`);
  };

  return (
    <div ref={ref} tabIndex={-1} className="cad-dlg cad-cl" role="dialog" aria-label="Copy to levels" style={{ left: 60, top: 40 }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}
      onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      <div className="cad-dlg-t"><b>Copy to levels</b><i className="sp" /><button type="button" aria-label="Close" onClick={onClose}>×</button></div>
      <div className="cad-dlg-rows">
        <p className="cad-cl-from">From {floorLabel(project.building, from)}{file ? ` · ${file}` : ''}</p>
        <b className="cad-cl-h">What</b>
        <div className="cad-cl-what">
          <label><input type="checkbox" checked={pts} disabled={!nPoints} onChange={(e) => setPts(e.target.checked)} /> Lights, sockets and equipment — {nPoints}</label>
          <label><input type="checkbox" checked={acc} disabled={!nAcc} onChange={(e) => setAcc(e.target.checked)} /> Switches and boxes — {nAcc}</label>
          {elv.map((x) => (
            <label key={x.system}><input type="checkbox" checked={systems.includes(x.system)} disabled={!x.n} onChange={(e) => setSystems(toggle(systems, x.system, e.target.checked))} /> {x.label} — {x.n}</label>
          ))}
        </div>
        <b className="cad-cl-h">To levels</b>
        <div className="cad-cl-levels">
          {others.map((x) => (
            <label key={x.floor.key}><input type="checkbox" checked={levels.includes(x.floor.key)} onChange={(e) => setLevels(toggle(levels, x.floor.key, e.target.checked))} /> {x.label}</label>
          ))}
        </div>
        {showMap && (
          <>
            <b className="cad-cl-h">Circuits on each level</b>
            <table className="cad-cl-map">
              <thead><tr><th>From this level</th>{ticked.map((x) => <th key={x.floor.key}>{x.label}</th>)}</tr></thead>
              <tbody>
                {map.map((m) => (
                  <tr key={m.boardId}>
                    <td>{m.boardId} · {m.n} device{s(m.n)}</td>
                    {ticked.map((x) => {
                      const c = boardChoices(project, x.floor.ref);
                      return (
                        <td key={x.floor.key}>
                          <select aria-label={`${m.boardId} on ${x.label}`} value={choice(x.floor, m.boardId) ?? ''} onChange={(e) => setPicked({ ...picked, [`${x.floor.key}|${m.boardId}`]: e.target.value })}>
                            <option value="">Leave out</option>
                            <optgroup label="On this level">{c.here.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}</optgroup>
                            <optgroup label="Other boards">{c.others.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}</optgroup>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="cad-cl-muted">A device goes on the same way of the board chosen (R1 → R1) and counts on that circuit. Where the way is missing, its devices are listed and left out.</p>
          </>
        )}
        {run.notes.length > 0 && <ul className="cad-cl-notes" aria-label="Notes">{run.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        {already.length > 0 && <p className="cad-cl-muted">Already there: {already.map((x) => `${x.n} on ${x.label}`).join(', ')}. They stay unless Replace is ticked.</p>}
        <label className="cad-cl-replace"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace the devices of these kinds already on those levels</label>
      </div>
      <div className="cad-dlg-ft cad-cl-ft">
        <span className="cad-cl-sum">{run.rows.map((r) => `${r.copied} device${s(r.copied)} to ${r.label}`).join(' · ')}</span>
        <button type="button" className="chip primary" disabled={!!why} title={why} onClick={copy}>Copy</button>
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
