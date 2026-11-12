import { Fragment, useState } from 'react';
import { isPath } from '../../model/cadEdit';
import { kindLabel } from '../../model/cadProps';
import { TRAY_WIDTHS } from '../../model/cadSketch';
import { attachOf, NOTE_ATTACHES } from '../../model/cadMtext';
import { DIM_TEXT_POS } from '../../model/cadStyles';
import { ISO_TEXT_MM, TEXT_FRAMES, TEXT_JUSTS } from '../../model/cadText';
import { toolAlias } from './cadCommands';
import type { SketchItem } from '../../types';

/** Design CAD → Draw → Modify / Edit: the toolbar beside drawn objects picked, the side panel of several, and the
 * settings of the edit tools (distances typed in metres). */

export type SketchEdit = 'filter' | 'trim' | 'extend' | 'offset' | 'break' | 'fillet' | 'mirror' | 'scale' | 'array' | 'join' | 'width' | 'move' | 'copy' | 'rotate' | 'erase' | 'clipboard' | 'similar' | 'qselect' | 'edtext' | 'ntwidth' | 'ntjust' | 'draworder' | 'mkblock' | 'selblock' | 'edatt'
  | 'isolate' | 'deselect' | 'addsel' | 'qmeasure' | 'count'
  | 'traysize' | 'traycables' | 'trayfill' | 'reverse' | 'trace' | 'routesld'
  | 'blkreplace' | 'blkreset' | 'blkexplode' | 'blkcount'
  | 'find' | 'txjust' | 'txheight' | 'txcase' | 'txframe' | 'txmask' | 'dimstyle' | 'dimprec' | 'dimpos' | 'dimreset' | 'hscale' | 'hangle' | 'hboundary'
  | 'plclose' | 'explode1' | 'roomfrom' | 'tocable' | 'jointool' | 'chamfer' | 'props' | 'repeat' | 'bedit';
export type EditTool = 'trim' | 'extend' | 'offset' | 'fillet' | 'chamfer' | 'break' | 'join' | 'explode' | 'mirror' | 'scale' | 'stretch' | 'array' | 'tjust' | 'th' | 'talign' | 'tcase' | 'tprefix' | 'tsuffix' | 'torient' | 'tcen' | 'tcopy' | 'tframe' | 'tmask' | 'draworder' | 'texttofront';
/** Offset `through` a point (the copy passes through it), `erase` the source, the copies on the `source` layer or the
 * `current` one; Fillet and Chamfer `trim` the lines to the corner (else they stay and the arc or line is added); a
 * polar array can `rotate` its copies (else they keep the original's direction). */
export interface EditSettings { offset: string; through: boolean; erase: boolean; layer: 'source' | 'current'; radius: string; d1: string; d2: string; trim: boolean; keep: boolean; factor: string; polar: boolean; rotate: boolean; rows: string; cols: string; dx: string; dy: string; n: string; angle: string }
export const ED_START: EditSettings = { offset: '0.3', through: false, erase: false, layer: 'source', radius: '0', d1: '0.5', d2: '0.5', trim: true, keep: true, factor: '2', polar: false, rotate: true, rows: '2', cols: '3', dx: '1', dy: '1', n: '6', angle: '360' };

const LABEL: Record<SketchEdit, string> = {
  filter: 'Filter ▾', trim: 'Trim', extend: 'Extend', offset: 'Offset', break: 'Break', fillet: 'Fillet', mirror: 'Mirror', scale: 'Scale', array: 'Array',
  join: 'Join', width: 'Width ▾', move: 'Move', copy: 'Copy', rotate: 'Rotate', erase: 'Erase', clipboard: 'Clipboard ▸', similar: 'Select similar', qselect: 'Quick select…', edtext: 'Edit text', ntwidth: 'Width…', ntjust: 'Justify ▸', draworder: 'Draw order ▸', mkblock: 'Make block…', selblock: 'Select all of this block', edatt: 'Edit attributes',
  isolate: 'Isolate ▸', deselect: 'Deselect all', addsel: 'Add selected', qmeasure: 'Quick measure', count: 'Count',
  traysize: 'Size tray from cables', traycables: 'Cables in this route', trayfill: 'Fill ratio check', reverse: 'Reverse direction', trace: 'Trace circuit', routesld: 'Show in SLD',
  blkreplace: 'Replace with another block ▸', blkreset: 'Reset attributes', blkexplode: 'Explode', blkcount: 'Count instances',
  find: 'Find and replace…', txjust: 'Justify ▸', txheight: 'Text height ▸', txcase: 'Case ▸', txframe: 'Frame ▸', txmask: 'Background mask', dimstyle: 'Dimension style ▸',
  dimprec: 'Precision ▸', dimpos: 'Text position ▸', dimreset: 'Remove text override', hscale: 'Hatch scale ▸', hangle: 'Hatch angle ▸', hboundary: 'Recreate boundary',
  plclose: 'Close', explode1: 'Explode', roomfrom: 'Use as room boundary', tocable: 'Convert to cable route', jointool: 'Join…', chamfer: 'Chamfer', props: 'Properties', repeat: 'Repeat', bedit: 'Open block editor'
};
export const kindOf = kindLabel;

/** What the toolbar offers for the drawn objects picked (and devices with them: then only Filter, Move, Copy, Erase). */
export function sketchEditsFor(items: SketchItem[], devices: number): SketchEdit[] {
  if (devices) return ['filter', 'move', 'copy', 'erase'];
  if (items.length > 1) return [...(new Set(items.map(kindOf)).size > 1 ? ['filter' as const] : []), ...(items.every((it) => isPath(it) && !it.closed) ? ['join' as const] : []), 'mirror', 'scale', 'array', 'move', 'copy', 'erase'];
  const it = items[0];
  if (it.tray) return ['offset', 'break', 'fillet', 'width', 'move', 'copy', 'erase'];
  if (isPath(it)) return ['trim', 'extend', 'offset', 'break', 'fillet', 'mirror', 'move', 'copy', 'rotate', 'erase'];
  if (it.kind === 'circle' || it.kind === 'arc') return ['offset', 'mirror', 'scale', 'move', 'copy', 'rotate', 'erase'];
  if (it.kind === 'ellipse' || it.cloud) return ['mirror', 'scale', 'move', 'copy', 'rotate', 'erase'];
  return ['move', 'copy', 'rotate', 'erase'];
}

/** The clipboard entries of the menu at the cursor (S1 of the Design CAD 2D gap plan). */
const CLIPBOARD: { id: string; label: string; key: string; paste?: true }[] = [
  { id: 'cut', label: 'Cut', key: 'Ctrl+X' }, { id: 'copy', label: 'Copy', key: 'Ctrl+C' }, { id: 'copybase', label: 'Copy with base point', key: 'Ctrl+Shift+C' },
  { id: 'paste', label: 'Paste', key: 'Ctrl+V', paste: true }, { id: 'pasteorig', label: 'Paste to original coordinates', key: '', paste: true }
];

/** The entries of Draw order ▸ on the menu at the cursor (S7 of the Design CAD 2D gap plan). */
export const DRAW_ORDER: { id: 'front' | 'back' | 'above' | 'under'; label: string }[] = [
  { id: 'front', label: 'Bring to front' }, { id: 'back', label: 'Send to back' }, { id: 'above', label: 'Above object' }, { id: 'under', label: 'Under object' }
];
/** The entries that open a list of their own. */
const OPENERS = new Set<SketchEdit>(['filter', 'width', 'clipboard', 'ntjust', 'draworder', 'isolate', 'blkreplace', 'txjust', 'txheight', 'txcase', 'txframe', 'dimstyle', 'dimprec', 'dimpos', 'hscale', 'hangle']);
type Opener = 'filter' | 'width' | 'clipboard' | 'ntjust' | 'draworder' | 'isolate' | 'blkreplace' | 'txjust' | 'txheight' | 'txcase' | 'txframe' | 'dimstyle' | 'dimprec' | 'dimpos' | 'hscale' | 'hangle';
/** Case ▸ of a text (TC). */
const CASES: { id: string; label: string }[] = [{ id: 'upper', label: 'UPPER CASE' }, { id: 'lower', label: 'lower case' }, { id: 'title', label: 'Title Case' }, { id: 'sentence', label: 'Sentence case' }];
/** Hatch angle ▸ (degrees) and scale ▸ (times the scale now). */
const HATCH_ANGLES = [0, 45, 90, 135];
const HATCH_SCALES: { id: string; label: string }[] = [{ id: '0.5', label: '× 0.5 (closer)' }, { id: '2', label: '× 2 (wider apart)' }];
/** The entries of Isolate ▸ on the menu at the cursor (phase 1 of the context-menu plan). */
const ISOLATE: { id: 'isolate' | 'hide' | 'end'; label: string }[] = [{ id: 'isolate', label: 'Isolate objects' }, { id: 'hide', label: 'Hide objects' }, { id: 'end', label: 'End object isolation' }];

/** The toolbar beside the drawn objects picked (or the menu at the cursor, with Clipboard ▸ too). */
export function SketchToolbar({ items, devices, lengthM, left, top, place, canPaste, canShow, withAtts, blocks = [], dimStyles = [], repeat, onEdit }: {
  items: SketchItem[];
  /** Devices picked with them. */
  devices: number;
  /** One path picked: its length in metres. */
  lengthM?: number;
  left: number;
  top: number;
  place: 'above' | 'below' | 'menu';
  /** Something is on the clipboard to paste. */
  canPaste?: boolean;
  /** The page can open the SLD (Show in SLD on a cable route). */
  canShow?: boolean;
  /** The drawing's blocks (Replace with another block ▸). */
  blocks?: string[];
  /** The project's dimension styles (Dimension style ▸). */
  dimStyles?: string[];
  /** The last command, for Repeat at the top of the menu. */
  repeat?: string;
  /** Whether a block has attributes to edit (its right-click menu then offers Edit attributes). */
  withAtts?: (it: SketchItem) => boolean;
  onEdit: (e: SketchEdit, arg?: string) => void;
}) {
  const [open, setOpen] = useState<Opener | null>(null);
  const one = items.length === 1 && !devices ? items[0] : undefined;
  // The menu at the cursor adds Edit text for one text or dimension (S5 of the 2D gap plan), with Width… and Justify ▸
  // for a note (S6), Draw order ▸ for drawn objects (S7), Select similar and Quick select… (S3) and Clipboard ▸ (S1).
  // A tray or a cable route on the menu: its LV tools first (phase 2 of the context-menu plan).
  const lv: SketchEdit[] = place !== 'menu' || !one ? [] : one.tray ? ['traysize', 'traycables', 'trayfill', 'reverse'] : one.cable ? ['trace', ...(canShow ? ['routesld' as const] : []), 'reverse'] : [];
  // The kind's own entries on the menu (phase 4): a text's, a dimension's, a hatch's, a polyline's or a line's.
  const kindOwn: SketchEdit[] = place !== 'menu' || !one || one.tray || one.cable ? [] : one.kind === 'text' ? ['txjust', 'txheight', 'txcase', 'txframe', 'txmask']
    : one.kind === 'dim' ? [...(one.text ? ['dimreset' as const] : []), ...(dimStyles.length ? ['dimstyle' as const] : []), 'dimprec', ...(one.dimKind === 'angular' ? [] : ['dimpos' as const])]
    : one.hatch ? ['hscale', 'hangle', 'hboundary']
    : one.kind === 'pline' && !one.cloud ? [...(one.pts.length > 2 ? ['plclose' as const] : []), 'reverse', 'explode1', ...(one.closed ? ['roomfrom' as const] : []), 'tocable', 'jointool', 'chamfer']
    : one.kind === 'line' ? ['jointool', 'chamfer', 'reverse', 'tocable'] : [];
  const findable = place === 'menu' && !!one && (one.kind === 'text' || one.kind === 'mtext');
  const edits: SketchEdit[] = [...(place === 'menu' && repeat ? ['repeat' as const] : []), ...lv, ...(place === 'menu' && (one?.kind === 'text' || one?.kind === 'dim') ? ['edtext' as const] : place === 'menu' && one?.kind === 'mtext' ? ['edtext' as const, 'ntwidth' as const, 'ntjust' as const] : place === 'menu' && one?.kind === 'insert' ? [...(one.attrs || withAtts?.(one) ? ['edatt' as const, 'blkreset' as const] : []), 'bedit' as const, 'selblock' as const, 'blkcount' as const,
      ...(blocks.some((b) => b !== one.block) ? ['blkreplace' as const] : []), 'blkexplode' as const] : []), ...(findable ? ['find' as const] : []), ...kindOwn, ...sketchEditsFor(items, devices),
    ...(place === 'menu' && items.length && !devices ? ['draworder' as const, ...(items.some((it) => !it.tray && !it.cable) ? ['mkblock' as const] : [])] : []), ...(place === 'menu' ? ['similar' as const, 'qselect' as const, 'clipboard' as const, 'isolate' as const, ...(items.length + devices === 1 ? ['addsel' as const] : []), 'qmeasure' as const, 'count' as const, 'deselect' as const, 'props' as const] : [])];
  const list: { id: string; label: string; now?: boolean; key?: string; off?: boolean }[] = open === 'clipboard'
    ? CLIPBOARD.map((x) => ({ id: x.id, label: x.label, key: x.key, off: x.paste && !canPaste }))
    : open === 'draworder' ? DRAW_ORDER.map((x) => ({ id: x.id, label: x.label }))
    : open === 'isolate' ? ISOLATE.map((x) => ({ id: x.id, label: x.label }))
    : open === 'blkreplace' ? blocks.filter((b) => b !== one?.block).map((b) => ({ id: b, label: b }))
    : open === 'txjust' ? TEXT_JUSTS.map((j) => ({ id: j.id, label: j.label, now: (one?.just ?? 'L') === j.id }))
    : open === 'txheight' ? ISO_TEXT_MM.map((h) => ({ id: String(h), label: `${h} mm on paper` }))
    : open === 'txcase' ? CASES
    : open === 'txframe' ? TEXT_FRAMES.map((f) => ({ id: f.id, label: f.label, now: (one?.frame ?? 'none') === f.id }))
    : open === 'dimstyle' ? dimStyles.map((n) => ({ id: n, label: n }))
    : open === 'dimprec' ? [0, 1, 2, 3].map((d) => ({ id: String(d), label: d ? `0.${'0'.repeat(d)}` : '0', now: (one?.look?.decimals ?? 2) === d }))
    : open === 'dimpos' ? DIM_TEXT_POS.map((x) => ({ id: x.id, label: x.label, now: (one?.look?.textPos ?? 'outside') === x.id }))
    : open === 'hscale' ? HATCH_SCALES
    : open === 'hangle' ? HATCH_ANGLES.map((a) => ({ id: String(a), label: `${a}°`, now: (one?.hatch?.angle ?? 0) === a }))
    : open === 'ntjust' && one
    ? NOTE_ATTACHES.map((j) => ({ id: j.id, label: j.label, now: attachOf(one) === j.id }))
    : open === 'width'
    ? TRAY_WIDTHS.map((w) => ({ id: String(w), label: `${w} mm`, now: one?.tray?.widthMm === w }))
    : open === 'filter' ? [...(devices ? [{ id: 'devices', label: 'Devices only', key: String(devices) }, { id: 'drawn', label: 'Drawn only', key: String(items.length) }] : []),
      ...[...new Set(items.map(kindOf))].map((k) => ({ id: k, label: `${k} only`, key: String(items.filter((it) => kindOf(it) === k).length) }))] : [];
  return (
    <div className={`cad-ctx${place === 'above' ? ' above' : ''}${place === 'menu' ? ' vert' : ''}`} role={place === 'menu' ? 'menu' : 'toolbar'} aria-label="Edit drawn objects" style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <span className="cad-ctx-what">{one ? `${kindOf(one)}${one.tray ? ` · ${one.tray.widthMm} mm` : lengthM !== undefined ? ` · ${lengthM.toFixed(2)} m` : ''}` : `${items.length + devices} selected`}</span>
      <span className="cad-ctx-bar" />
      {edits.map((e) => (
        <Fragment key={e}>
          {e === 'move' && <span className="cad-ctx-bar" />}
          <button aria-expanded={OPENERS.has(e) ? open === e : undefined} onClick={() => (OPENERS.has(e) ? setOpen(open === e ? null : e as typeof open) : onEdit(e))}>{e === 'repeat' ? `Repeat ${repeat}` : e === 'plclose' && one?.closed ? 'Open' : e === 'txmask' && one?.mask ? 'Background mask off' : LABEL[e]}</button>
        </Fragment>
      ))}
      {open && (
        <div className="cad-ctx-list" role="listbox" aria-label={open === 'width' ? 'Width' : open === 'clipboard' ? 'Clipboard' : open === 'ntjust' ? 'Justify' : open === 'draworder' ? 'Draw order' : open === 'isolate' ? 'Isolate' : open === 'blkreplace' ? 'Replace with' : OPENERS.has(open) ? LABEL[open].replace(' ▸', '') : 'Filter'}>
          {list.map((x) => <button key={x.id} role="option" aria-selected={!!x.now} disabled={x.now || x.off} onClick={() => { setOpen(null); onEdit(open, x.id); }}><span>{x.label}</span><small>{x.now ? 'now' : x.key ?? ''}</small></button>)}
        </div>
      )}
    </div>
  );
}

/** Several objects picked with drawn ones among them: how many, and the edits for them all (the properties palette
 * counts them by kind). */
export function DrawnSelectionPanel({ items, devices, onEdit }: { items: SketchItem[]; devices: number; onEdit: (e: SketchEdit) => void }) {
  const edits = sketchEditsFor(items, devices).filter((e) => e !== 'filter' && e !== 'width');
  return (
    <>
      <div><b>{items.length + devices} objects selected</b></div>
      {devices > 0 && <dl className="cad-props" aria-label="Objects selected"><dt>Devices</dt><dd>{devices}</dd></dl>}
      <div className="cad-devbtns">{edits.map((e) => <button key={e} className="chip" onClick={() => onEdit(e)}>{LABEL[e]}</button>)}</div>
    </>
  );
}

export const EDIT_TITLE: Record<EditTool, string> = {
  trim: 'Trim', extend: 'Extend', offset: 'Offset', fillet: 'Fillet', chamfer: 'Chamfer', break: 'Break', join: 'Join', explode: 'Explode',
  mirror: 'Mirror', scale: 'Scale', stretch: 'Stretch', array: 'Array', tjust: 'Justify text', th: 'Text height',
  talign: 'Align text', tcase: 'Text case', tprefix: 'Text prefix', tsuffix: 'Text suffix', torient: 'Orient text', tcen: 'Centre text', tcopy: 'Copy words', tframe: 'Frame text', tmask: 'Mask text', draworder: 'Draw order', texttofront: 'Text to front'
};
export const EDIT_HELP: Record<EditTool, string> = {
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
  array: 'Pick the objects (click them, then Enter), then Rectangular or Polar on the command line: rectangular copies are made at once, polar ones round the centre clicked.',
  tjust: 'Pick the texts (click them, then Enter), then the justification on the command line (Left, Centre, Right, or TL … BR): each text stays where it is; only its anchor point moves on it.',
  th: 'Pick the texts and dimensions (click them, then Enter), then the height on paper in mm (1.8, 2.5, 3.5, 5, 7, 10): each keeps its anchor point. Enter with nothing picked sets the height for new text.',
  talign: 'Pick the texts (click them, then Enter), then Left, Right, Centre, Top or Bottom and the text or point to line up with; or Spacing and the gap on paper to space them evenly down the page.',
  tcase: 'Pick the texts (click them, then Enter), then Upper, Lower, Title or Sentence.',
  tprefix: 'Pick the texts (click them, then Enter), then type the words to put before each (Space types a space).',
  tsuffix: 'Pick the texts (click them, then Enter), then type the words to put after each (Space types a space).',
  torient: 'Pick the texts (click them, then Enter), then Bottom, Right or Both: each turns about its centre so it reads from the bottom of the sheet, from the right, or whichever of the two it is nearer.',
  tcen: 'Pick one text (click it, then Enter), then two points (snaps help): its centre goes to their midpoint.',
  tcopy: 'Pick the texts to change (click them, then Enter), then click the text whose words they take.',
  tframe: 'Pick the texts (click them, then Enter), then Circle, Box, Hexagon or None: a frame round each, sized from its height, that moves and scales with it.',
  tmask: 'Pick the texts (click them, then Enter), then Yes or No: a paper-colour fill under the text so it reads over hatches, trays and underlays.',
  draworder: 'Pick the objects (click them, then Enter), then Front, Back, Above or Under on the command line; Above and Under then ask for the reference object. Later in the order is on top: a solid hatch sent to the back no longer hides the symbols and texts over it. The order prints on the sheets and saves to DXF / DWG.',
  texttofront: 'Text, Dimensions, Leaders or All on the command line: those objects go over everything else, in their order.'
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
      <h4>{EDIT_TITLE[tool]} <span className="m">{toolAlias(tool)}</span></h4>
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
        <span className="m">{EDIT_HELP[tool]}</span>
        {step && <span className="m">{step}</span>}
        {(tool === 'join' || tool === 'mirror' || tool === 'scale' || tool === 'array') && <span className="m">{picked} object{picked === 1 ? '' : 's'} picked</span>}
        {onApply && <div className="cad-devbtns"><button className="chip primary" disabled={!picked} onClick={onApply}>{tool === 'join' ? 'Join' : 'Apply'}</button></div>}
      </div>
    </>
  );
}
