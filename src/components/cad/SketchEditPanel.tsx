import { Fragment, useState } from 'react';
import { isPath } from '../../model/cadEdit';
import { TRAY_WIDTHS } from '../../model/cadSketch';
import { toolAlias } from './cadCommands';
import type { SketchItem } from '../../types';

/** Design CAD → Draw → Modify / Edit: the toolbar beside drawn objects picked, the side panel of several, and the
 * settings of the edit tools (distances typed in metres). */

export type SketchEdit = 'filter' | 'trim' | 'extend' | 'offset' | 'break' | 'fillet' | 'mirror' | 'scale' | 'array' | 'join' | 'width' | 'move' | 'copy' | 'rotate' | 'erase';
export type EditTool = 'trim' | 'extend' | 'offset' | 'fillet' | 'chamfer' | 'break' | 'join' | 'explode' | 'mirror' | 'scale' | 'stretch' | 'array';
export interface EditSettings { offset: string; radius: string; d1: string; d2: string; keep: boolean; factor: string; polar: boolean; rows: string; cols: string; dx: string; dy: string; n: string; angle: string }
export const ED_START: EditSettings = { offset: '0.3', radius: '0', d1: '0.5', d2: '0.5', keep: true, factor: '2', polar: false, rows: '2', cols: '3', dx: '1', dy: '1', n: '6', angle: '360' };

const LABEL: Record<SketchEdit, string> = {
  filter: 'Filter ▾', trim: 'Trim', extend: 'Extend', offset: 'Offset', break: 'Break', fillet: 'Fillet', mirror: 'Mirror', scale: 'Scale', array: 'Array',
  join: 'Join', width: 'Width ▾', move: 'Move', copy: 'Copy', rotate: 'Rotate', erase: 'Erase'
};
export const kindOf = (it: SketchItem) => (it.tray ? 'Cable tray' : it.cable ? 'Cable route' : { line: 'Line', pline: it.closed ? 'Closed polyline' : 'Polyline', circle: 'Circle', arc: 'Arc', text: 'Text', dim: 'Dimension' }[it.kind]);

/** What the toolbar offers for the drawn objects picked (and devices with them: then only Filter, Move, Copy, Erase). */
export function sketchEditsFor(items: SketchItem[], devices: number): SketchEdit[] {
  if (devices) return ['filter', 'move', 'copy', 'erase'];
  if (items.length > 1) return [...(new Set(items.map(kindOf)).size > 1 ? ['filter' as const] : []), ...(items.every((it) => isPath(it) && !it.closed) ? ['join' as const] : []), 'mirror', 'scale', 'array', 'move', 'copy', 'erase'];
  const it = items[0];
  if (it.tray) return ['offset', 'break', 'fillet', 'width', 'move', 'copy', 'erase'];
  if (isPath(it)) return ['trim', 'extend', 'offset', 'break', 'fillet', 'mirror', 'move', 'copy', 'rotate', 'erase'];
  if (it.kind === 'circle' || it.kind === 'arc') return ['offset', 'mirror', 'scale', 'move', 'copy', 'rotate', 'erase'];
  return ['move', 'copy', 'rotate', 'erase'];
}

/** The toolbar beside the drawn objects picked (or the menu at the cursor). */
export function SketchToolbar({ items, devices, lengthM, left, top, place, onEdit }: {
  items: SketchItem[];
  /** Devices picked with them. */
  devices: number;
  /** One path picked: its length in metres. */
  lengthM?: number;
  left: number;
  top: number;
  place: 'above' | 'below' | 'menu';
  onEdit: (e: SketchEdit, arg?: string) => void;
}) {
  const [open, setOpen] = useState<'filter' | 'width' | null>(null);
  const edits = sketchEditsFor(items, devices);
  const one = items.length === 1 && !devices ? items[0] : undefined;
  const list: { id: string; label: string; now?: boolean }[] = open === 'width'
    ? TRAY_WIDTHS.map((w) => ({ id: String(w), label: `${w} mm`, now: one?.tray?.widthMm === w }))
    : open === 'filter' ? (devices ? [{ id: 'devices', label: 'Devices only' }, { id: 'drawn', label: 'Drawn only' }]
      : [...new Set(items.map(kindOf))].map((k) => ({ id: k, label: `${k} only` }))) : [];
  return (
    <div className={`cad-ctx${place === 'above' ? ' above' : ''}${place === 'menu' ? ' vert' : ''}`} role={place === 'menu' ? 'menu' : 'toolbar'} aria-label="Edit drawn objects" style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <span className="cad-ctx-what">{one ? `${kindOf(one)}${one.tray ? ` · ${one.tray.widthMm} mm` : lengthM !== undefined ? ` · ${lengthM.toFixed(2)} m` : ''}` : `${items.length + devices} selected`}</span>
      <span className="cad-ctx-bar" />
      {edits.map((e) => (
        <Fragment key={e}>
          {e === 'move' && <span className="cad-ctx-bar" />}
          <button aria-expanded={e === 'filter' || e === 'width' ? open === e : undefined} onClick={() => (e === 'filter' || e === 'width' ? setOpen(open === e ? null : e) : onEdit(e))}>{LABEL[e]}</button>
        </Fragment>
      ))}
      {open && (
        <div className="cad-ctx-list" role="listbox" aria-label={open === 'width' ? 'Width' : 'Filter'}>
          {list.map((x) => <button key={x.id} role="option" aria-selected={!!x.now} disabled={x.now} onClick={() => { setOpen(null); onEdit(open, x.id); }}><span>{x.label}</span><small>{x.now ? 'now' : ''}</small></button>)}
        </div>
      )}
    </div>
  );
}

/** Several objects picked with drawn ones among them: what they are, and the edits for them all. */
export function DrawnSelectionPanel({ items, devices, onEdit }: { items: SketchItem[]; devices: number; onEdit: (e: SketchEdit) => void }) {
  const n = new Map<string, number>();
  for (const it of items) n.set(kindOf(it), (n.get(kindOf(it)) ?? 0) + 1);
  const edits = sketchEditsFor(items, devices).filter((e) => e !== 'filter' && e !== 'width');
  return (
    <>
      <div><b>{items.length + devices} objects selected</b></div>
      <dl className="cad-props" aria-label="Objects selected">
        <dt>Drawn</dt><dd>{[...n].map(([k, c]) => `${c} × ${k}`).join(', ')}</dd>
        {devices > 0 && <><dt>Devices</dt><dd>{devices}</dd></>}
      </dl>
      <div className="cad-devbtns">{edits.map((e) => <button key={e} className="chip" onClick={() => onEdit(e)}>{LABEL[e]}</button>)}</div>
    </>
  );
}

const TITLE: Record<EditTool, string> = {
  trim: 'Trim', extend: 'Extend', offset: 'Offset', fillet: 'Fillet', chamfer: 'Chamfer', break: 'Break', join: 'Join', explode: 'Explode',
  mirror: 'Mirror', scale: 'Scale', stretch: 'Stretch', array: 'Array'
};
const HELP: Record<EditTool, string> = {
  trim: 'Click the part to cut away: it is cut at the nearest lines crossing it, drawn or the architect\'s (shown layers), which are never changed. Shift-click extends instead.',
  extend: 'Click near the end to lengthen: it runs on to the next line ahead, drawn or the architect\'s. Shift-click trims instead.',
  offset: 'Click the object, then the side for the copy. A tray is copied as a tray of the same width and route; a cable route as a plain line.',
  fillet: 'Click the two lines near the ends that make the corner. 0 joins them in a sharp corner; two trays always meet in a sharp corner (the bend fitting).',
  chamfer: 'Click the two lines: the corner is cut at the distances along each.',
  break: 'Click the object where it breaks, then the second point (the part between is taken out), or Enter to split it at the first point.',
  join: 'Click the lines and polylines that meet end to end (or pick them first), then Enter: they become one.',
  explode: 'Click a polyline or rectangle: it becomes separate lines.',
  mirror: 'Pick the objects (click them, then Enter), then two points of the mirror line.',
  scale: 'Pick the objects (click them, then Enter), then the base point.',
  stretch: 'Drag a window round the points to move (right to left), then the base point and the second point. A tray end moves, its far end stays.',
  array: 'Pick the objects (click them, then Enter); rectangular copies go with Apply, polar ones round the centre clicked.'
};

/** The side panel of an edit tool: what it does, its distances, and what has been picked so far. */
export function EditToolPanel({ tool, settings, onSettings, step, picked, onApply }: {
  tool: EditTool;
  settings: EditSettings;
  onSettings: (s: EditSettings) => void;
  /** What the tool is waiting for, shown under the help. */
  step?: string;
  picked: number;
  onApply?: () => void;
}) {
  const set = (k: keyof EditSettings) => (e: { target: { value: string } }) => onSettings({ ...settings, [k]: e.target.value });
  const field = (k: keyof EditSettings, label: string, step = 0.05) => <label>{label}<input aria-label={label} type="number" step={step} value={String(settings[k])} onChange={set(k)} /></label>;
  return (
    <>
      <h4>{TITLE[tool]} <span className="m">{toolAlias(tool)}</span></h4>
      <div className="cad-devform">
        {tool === 'offset' && field('offset', 'Distance (m)')}
        {tool === 'fillet' && field('radius', 'Radius (m)')}
        {tool === 'chamfer' && <>{field('d1', 'First distance (m)')}{field('d2', 'Second distance (m)')}</>}
        {tool === 'mirror' && <label><input type="checkbox" checked={settings.keep} onChange={(e) => onSettings({ ...settings, keep: e.target.checked })} /> Keep the originals</label>}
        {tool === 'scale' && field('factor', 'Factor', 0.1)}
        {tool === 'array' && (
          <>
            <label>Kind<select aria-label="Array kind" value={settings.polar ? 'polar' : 'rect'} onChange={(e) => onSettings({ ...settings, polar: e.target.value === 'polar' })}><option value="rect">Rectangular</option><option value="polar">Polar</option></select></label>
            {settings.polar ? <>{field('n', 'Number in all', 1)}{field('angle', 'Angle to fill (°)', 15)}</> : <>{field('rows', 'Rows', 1)}{field('cols', 'Columns', 1)}{field('dx', 'Column spacing (m)', 0.1)}{field('dy', 'Row spacing (m)', 0.1)}</>}
          </>
        )}
        <span className="m">{HELP[tool]}</span>
        {step && <span className="m">{step}</span>}
        {(tool === 'join' || tool === 'mirror' || tool === 'scale' || tool === 'array') && <span className="m">{picked} object{picked === 1 ? '' : 's'} picked</span>}
        {onApply && <div className="cad-devbtns"><button className="chip primary" disabled={!picked} onClick={onApply}>{tool === 'join' ? 'Join' : 'Apply'}</button></div>}
      </div>
    </>
  );
}
