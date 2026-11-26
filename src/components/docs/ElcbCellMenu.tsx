import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ElcbGroup } from '../../calc/loadSchedule';
import { ELCB_SIZES } from '../../model/elcbs';

export const elcbWaysText = (ways: number[]) => (ways.length === 1 ? `way ${ways[0]}` : `ways ${ways[0]}–${ways[ways.length - 1]}`);

/** The sizes one ELCB can take — 3, 6, 9 or 12 circuits from its first way — with the one it has now pressed. */
export function ElcbSizes({ group, onPick }: { group: ElcbGroup; onPick: (circuits: number) => void }) {
  const first = group.ways[0];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '2px 10px 6px' }}>
      {ELCB_SIZES.map((n) => {
        const now = group.ways.length * 3 === n;
        const ways = Array.from({ length: n / 3 }, (_, i) => first + i);
        return (
          <button key={n} type="button" className={`chip${now ? ' on' : ''}`} aria-pressed={now}
            title={now ? `ELCB-${group.index} covers ${elcbWaysText(ways)} now` : `ELCB-${group.index} over ${elcbWaysText(ways)}; only the ELCB next to it changes`}
            onClick={() => onPick(n)}>{n} circuits</button>
        );
      })}
    </div>
  );
}

/** The menu of one ELCB cell on the schedule: its size, Edit, Remove and Re-group all. Placed on the page body so the
 * grid's scroll box does not clip it; closes on a click outside, Escape, scroll or resize. */
export default function ElcbCellMenu({ group, at, onResize, onEdit, onRemove, onRegroup, onClose }: {
  group: ElcbGroup;
  at: DOMRect;
  onResize: (circuits: number) => void;
  onEdit: () => void;
  onRemove: () => void;
  onRegroup: () => void;
  onClose: () => void;
}) {
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!pop.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  const style: CSSProperties = { position: 'fixed', top: Math.max(8, Math.min(at.bottom + 4, window.innerHeight - 240)), left: Math.max(8, Math.min(at.left, window.innerWidth - 300)), zIndex: 80 };
  const run = (f: () => void) => () => { onClose(); f(); };
  return createPortal(
    <div ref={pop} className="menu-pop" role="menu" aria-label={`ELCB-${group.index}`} style={style}>
      <div className="mp-h">ELCB-{group.index} · {elcbWaysText(group.ways)} · {group.label}</div>
      {!group.incomer && <ElcbSizes group={group} onPick={(n) => { onClose(); onResize(n); }} />}
      <button onClick={run(onEdit)}>Edit ELCB-{group.index}…</button>
      <button title="Its ways take the New ELCBs size" onClick={run(onRemove)}>Remove ELCB-{group.index}</button>
      <hr />
      <button title="Cut the whole DB again into ELCBs of one size, after showing what changes" onClick={run(onRegroup)}>Re-group all ELCBs…</button>
    </div>,
    document.body
  );
}
