import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { circuitLabel, circuitWay } from '../../model/cadDevices';
import { circuitRoom, nextWithRoom, type CircuitRoom } from '../../model/circuitRoom';
import { findFloor, floorLabel, type LevelRef } from '../../model/levels';
import type { Feeder, PointType, Project } from '../../types';

/** The Circuit field of Add device: the circuit in use with the room left on it; opened, a list with Find, the next
 * circuit with room when the one in use is full, the boards of this level, then the other boards (closed until clicked). */
export default function CircuitPicker({ project, circuits, value, onChange, placing, level }: {
  project: Project; circuits: Feeder[]; value: string; onChange: (id: string) => void;
  /** The point type Add device places (none for a switch that only names its circuit). */
  placing?: PointType;
  /** The level of the plan showing: its boards come first. */
  level?: LevelRef;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Boards of other levels opened (true) or closed (false) by a click on their heading. */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const chosen = circuits.find((f) => f.id === value);
  const room = chosen ? circuitRoom(chosen, placing) : undefined;
  const q = query.trim().toLowerCase();
  const next = !q ? nextWithRoom(circuits, chosen, placing) : undefined;
  const pick = (id: string) => { onChange(id); setOpen(false); setQuery(''); };
  /** The room used, as a bar (only where the circuit's points have a limit). */
  const bar = (r: CircuitRoom) => r.max !== undefined && <i className="cad-cir-bar" aria-hidden><b style={{ width: `${Math.min(100, Math.round((r.n / r.max) * 100))}%` }} /></i>;

  const ids: string[] = [];
  circuits.forEach((f) => { if (!ids.includes(f.boardId)) ids.push(f.boardId); });
  const board = (id: string) => project.boards.find((b) => b.id === id);
  const here = (id: string) => { const b = board(id); return !!level && !!b?.level && b.level.building === level.building && b.level.level === level.level; };
  const hasHere = ids.some(here);
  const heading = (id: string) => {
    const lv = board(id)?.level;
    const floor = findFloor(project.building, lv);
    return here(id) && hasHere ? `${id} · this level` : floor ? `${id} · ${floorLabel(project.building, floor)}` : id;
  };
  const ordered = hasHere ? [...ids.filter(here), ...ids.filter((id) => !here(id))] : ids;
  const blocks = ordered.map((id) => {
    const all = circuits.filter((f) => f.boardId === id);
    const rows = q ? all.filter((f) => circuitLabel(project, f).toLowerCase().includes(q)) : all;
    const canFold = hasHere && !here(id) && !q;
    const shown = !canFold || (opened[id] ?? id === chosen?.boardId);
    return { id, all, rows, canFold, shown };
  }).filter((b) => !q || b.rows.length > 0);

  return (
    <div className="cad-cir" ref={root}>
      <button type="button" className="cad-cir-field" aria-label="Circuit" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}>
        <span>{chosen ? circuitLabel(project, chosen) : 'Choose a circuit…'}</span>
        {chosen && room && <span className={`cad-cir-n${room.full ? ' full' : ''}`}>{room.text}</span>}
        <ChevronDown size={12} strokeWidth={1.8} aria-hidden />
      </button>
      {open && (
        <div className="cad-cir-list" role="listbox" aria-label="Circuits">
          <input type="search" aria-label="Find a circuit" placeholder="Find a circuit" autoFocus value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'Enter') { e.preventDefault(); const first = next ?? blocks.find((b) => b.shown && b.rows.length)?.rows[0]; if (first) pick(first.id); }
            }} />
          {next && (
            <>
              <span className="cad-cir-h">Next with room</span>
              <button type="button" role="option" aria-selected={false} className="cad-cir-row next" title="The next circuit that suits this device and has room" onClick={() => pick(next.id)}>
                <span className="w">{next.boardId === chosen?.boardId ? circuitWay(next) : circuitLabel(project, next)}</span><span className="n">{circuitRoom(next, placing).text}</span>{bar(circuitRoom(next, placing))}
              </button>
            </>
          )}
          {blocks.map((b) => (
            <div key={b.id} style={{ display: 'contents' }}>
              <button type="button" className="cad-cir-h" aria-expanded={b.shown} disabled={!b.canFold} onClick={() => setOpened({ ...opened, [b.id]: !b.shown })}>
                {b.canFold && (b.shown ? <ChevronDown size={10} strokeWidth={1.8} aria-hidden /> : <ChevronRight size={10} strokeWidth={1.8} aria-hidden />)}{heading(b.id)}{b.canFold && <span>{b.all.length}</span>}
              </button>
              {b.shown && b.rows.map((f) => {
                const r = circuitRoom(f, placing);
                return (
                  <button key={f.id} type="button" role="option" aria-selected={f.id === value} className={`cad-cir-row${r.full ? ' full' : ''}`} title={circuitLabel(project, f)} onClick={() => pick(f.id)}>
                    <span className="w">{circuitWay(f)}</span>
                    {r.full && <TriangleAlert size={12} strokeWidth={1.8} aria-hidden />}
                    <span className="n">{r.text}</span>
                    {bar(r)}
                  </button>
                );
              })}
            </div>
          ))}
          {q && blocks.length === 0 && <span className="cad-cir-none">No circuit matches</span>}
        </div>
      )}
    </div>
  );
}
