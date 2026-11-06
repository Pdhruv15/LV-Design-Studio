import { Fragment, useState } from 'react';
import { circuitLabel, type PlacedItem } from '../../model/cadDevices';
import { circuitAfter, replacements, typeOf, type DeviceEdit } from '../../model/deviceEdit';
import type { Feeder, Project } from '../../types';

const LABEL: Record<DeviceEdit, string> = {
  filter: 'Filter ▾', row: 'Align row', column: 'Align column', space: 'Space equally', array: 'Array on line…', replace: 'Replace ▾', circuit: 'Circuit ▾',
  coverage: 'Coverage', match: 'Match', move: 'Move', copy: 'Copy', delete: 'Delete', rename: 'Rename', circuits: 'Circuits'
};
const TITLE: Partial<Record<DeviceEdit, string>> = {
  filter: 'Keep only one type of what is picked', row: 'Line them up at their average height (Y)', column: 'Line them up at their average X',
  space: 'Keep the two outer ones; spread the rest evenly between them', array: 'Draw a line: devices like this one evenly along it',
  coverage: 'Show what this system\'s devices cover on the level', match: 'Then click each device to take its circuit (and type if chosen)',
  rename: 'Type the board\'s new name on the command line', circuits: 'Pick every device on this board\'s circuits on this level'
};
const LISTS: DeviceEdit[] = ['filter', 'replace', 'circuit'];

/** The toolbar beside the devices picked (or a menu at the cursor on a right click): the edits that suit them; Replace,
 * Circuit and Filter open a short list there. */
export default function DeviceToolbar({ project, items, edits, circuits, left, top, place, onEdit }: {
  project: Project;
  items: PlacedItem[];
  edits: DeviceEdit[];
  circuits: Feeder[];
  left: number;
  top: number;
  /** Above the devices, below them (near the top edge), or a menu at the cursor. */
  place: 'above' | 'below' | 'menu';
  onEdit: (e: DeviceEdit, arg?: string) => void;
}) {
  const [open, setOpen] = useState<DeviceEdit | null>(null);
  const one = items.length === 1 ? items[0] : undefined;
  const list = (): { id: string; label: string; note: string; now?: boolean }[] => {
    if (open === 'replace') {
      const types = new Set(items.map((it) => typeOf(project, it)));
      return replacements(project, items).map((x) => ({ id: x.id, label: x.label, note: types.size === 1 && types.has(x.id) ? 'now' : '', now: types.size === 1 && types.has(x.id) }));
    }
    if (open === 'circuit') {
      const on = new Set(items.map((it) => (project.lvPoints ?? []).find((d) => d.id === it.id)?.feederId));
      return circuits.map((f) => {
        const now = on.size === 1 && on.has(f.id);
        const before = Object.values(f.points ?? {}).reduce((t, n) => t + (n ?? 0), 0);
        const after = circuitAfter(project, items, f.id);
        return { id: f.id, label: circuitLabel(project, f), note: now ? 'now' : `${before} → ${after.points} pts${after.over ? ' ⚠' : ''}`, now };
      });
    }
    if (open === 'filter') {
      const n = new Map<string, { label: string; count: number }>();
      for (const it of items) { const t = typeOf(project, it); n.set(t, { label: it.label, count: (n.get(t)?.count ?? 0) + 1 }); }
      return [...n].map(([id, v]) => ({ id, label: `${v.label} only`, note: String(v.count) }));
    }
    return [];
  };
  return (
    <div className={`cad-ctx${place === 'above' ? ' above' : ''}${place === 'menu' ? ' vert' : ''}`} role={place === 'menu' ? 'menu' : 'toolbar'} aria-label="Edit devices" style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <span className="cad-ctx-what">{one ? `${one.label}${one.detail ? ` · ${one.detail.split(' · ')[0]}` : ''}` : `${items.length} selected`}</span>
      <span className="cad-ctx-bar" />
      {edits.map((e) => (
        <Fragment key={e}>
          {e === 'move' && <span className="cad-ctx-bar" />}
          <button title={TITLE[e]} aria-expanded={LISTS.includes(e) ? open === e : undefined} onClick={() => (LISTS.includes(e) ? setOpen(open === e ? null : e) : onEdit(e))}>{LABEL[e]}</button>
        </Fragment>
      ))}
      {open && (
        <div className="cad-ctx-list" role="listbox" aria-label={LABEL[open].replace(' ▾', '')}>
          {list().map((x) => (
            <button key={x.id} role="option" aria-selected={!!x.now} disabled={x.now} onClick={() => { setOpen(null); onEdit(open, x.id); }}>
              <span>{x.label}</span><small>{x.note}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
