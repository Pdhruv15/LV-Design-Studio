import { isPath } from '../../model/cadEdit';
import { attachOf, NOTE_ATTACHES } from '../../model/cadMtext';
import { DIM_TEXT_POS } from '../../model/cadStyles';
import { ISO_TEXT_MM, TEXT_FRAMES, TEXT_JUSTS } from '../../model/cadText';
import { TRAY_WIDTHS } from '../../model/cadSketch';
import type { SketchItem } from '../../types';
import { addSelectedTool, countLine, groups, paletteGroup, repeatGroup, undoEntries, viewGroup, type CtxEntry, type CtxHead, type CtxIcon, type CtxItem, type MenuCommon } from './cadContextMenu';
import { CASES, CLIPBOARD, DRAW_ORDER, HATCH_ANGLES, HATCH_SCALES, kindOf, sketchEditsFor, type SketchEdit } from './SketchEditPanel';

/** Design CAD: the right-click menu of the drawn objects picked (and of devices picked with them), in the one order of
 * every object menu (docs/notes/Future development/UI UX proposals - 2026-11-16 - CAD right-click menu look and
 * order.md): the header, Repeat, the kind's own tools (one list, or the electrical tools of a tray or a cable route),
 * clipboard and undo, modify, view, select, Properties and Options. Pure: each entry is a page action ('sk', its `arg`
 * "edit|value": CadPage's editSketch) or a typed command. */

export interface DrawnMenuState extends MenuCommon {
  /** The drawn objects picked. */
  items: readonly SketchItem[];
  /** Devices picked with them. */
  devices: number;
  /** The last command, for Repeat. */
  repeat?: string;
  /** The page can open the SLD (Show in SLD on a cable route). */
  canShow: boolean;
  /** The drawing's blocks (Replace with another block). */
  blocks: readonly string[];
  /** The project's dimension styles. */
  dimStyles: readonly string[];
  /** Whether a block has attributes to edit. */
  withAtts?: (it: SketchItem) => boolean;
  /** One path picked: its length in metres. */
  lengthM?: number;
  /** The one object picked is a block of the opened drawing (its name): `items` are the pieces it stands in as, and it has its own Block tools. */
  dwBlock?: string;
}

/** One entry that edits the drawn objects picked (act 'sk'), with the edit's value in `arg` after a bar. */
const sk = (label: string, edit: SketchEdit, value?: string, key?: string, more: Partial<CtxItem> = {}): CtxItem =>
  ({ label, act: 'sk', arg: value === undefined ? edit : `${edit}|${value}`, ...(key ? { key } : {}), ...more });
/** A list whose entries are the values of one edit; the current one is marked. */
const choice = (label: string, edit: SketchEdit, values: readonly { id: string; label: string }[], now?: string, icon?: CtxIcon, lv?: boolean): CtxItem =>
  ({ label, ...(icon ? { icon } : {}), ...(lv ? { lv } : {}), sub: values.map((v) => sk(v.label, edit, v.id, undefined, v.id === now ? { now: true, off: true } : {})) });
const ICON_OF: Record<string, CtxIcon> = { line: 'line', pline: 'pline', circle: 'circle', arc: 'arc', ellipse: 'ellipse', text: 'text', mtext: 'mtext', mleader: 'mtext', dim: 'dim', insert: 'insert', point: 'point', attdef: 'text' };
/** The kind's icon in the header. */
const iconOf = (it: SketchItem): CtxIcon => (it.tray ? 'tray' : it.cable ? 'route' : it.hatch ? 'hatch' : it.cloud ? 'cloud' : it.infinite ? 'line' : ICON_OF[it.kind] ?? 'line');

/** The header: the one object picked (its kind, length and layer) or how many, counted by kind. */
export function drawnHead(s: Pick<DrawnMenuState, 'items' | 'devices' | 'lengthM'>): CtxHead {
  const n = s.items.length + s.devices, one = n === 1 ? s.items[0] : undefined;
  if (!one) return { icon: 'boxes', title: `${n} picked`, second: countLine(s.items.map(kindOf), s.devices) };
  const where = one.tray ? `${one.tray.widthMm} mm` : s.lengthM !== undefined ? `${s.lengthM.toFixed(2)} m` : '';
  return { icon: iconOf(one), title: kindOf(one), detail: [where, one.layer].filter(Boolean).join(' · ') || undefined };
}

const addSel = (): CtxItem => sk('Add selected', 'addsel', undefined, undefined, { icon: 'addsel' });
const mkBlock = (): CtxItem => sk('Make block…', 'mkblock', undefined, 'B', { icon: 'mkblock' });
const OPEN: Record<string, CtxItem> = {
  trim: sk('Trim', 'trim', undefined, 'TR', { icon: 'trim' }), extend: sk('Extend', 'extend', undefined, 'EX', { icon: 'extend' }), offset: sk('Offset', 'offset', undefined, 'O', { icon: 'offset' }),
  fillet: sk('Fillet', 'fillet', undefined, 'F', { icon: 'fillet' }), chamfer: sk('Chamfer', 'chamfer', undefined, 'CHA', { icon: 'chamfer' }), break: sk('Break', 'break', undefined, 'BR', { icon: 'break' }),
  join: sk('Join…', 'jointool', undefined, 'J', { icon: 'join' }), reverse: sk('Reverse direction', 'reverse', undefined, undefined, { icon: 'reverse' })
};
const qm = (): CtxItem => sk('Quick measure', 'qmeasure', undefined, 'QM', { icon: 'qmeasure' });

/** The tools of a block of the opened drawing picked: counted, taken apart, copied as a block of the app, cropped, or all of it selected (act 'dw'). */
function dwBlockTools(): CtxEntry[] {
  const dw = (label: string, action: string, key?: string, icon?: CtxIcon): CtxItem => ({ label, act: 'dw', arg: action, ...(key ? { key } : {}), ...(icon ? { icon } : {}) });
  return [{ label: 'Block tools', icon: 'tools', sub: [dw('Count instances', 'count'), dw('Explode into drawn objects', 'explode', 'X', 'explode'), dw('Copy as a block of this drawing', 'copyblock', 'INSERT'), dw('Crop…', 'crop', 'CROP'), '-', dw('Select all of this block', 'selblock')] }];
}

/** The kind's own tools of one drawn object: one row with a list (a tray and a cable route are electrical: flat rows). */
function kindTools(s: DrawnMenuState, it: SketchItem): CtxEntry[] {
  const list = (label: string, sub: CtxEntry[]): CtxEntry[] => [{ label, icon: 'tools', sub }];
  if (it.tray) {
    return [sk('Size tray from cables', 'traysize', undefined, undefined, { icon: 'tray', lv: true }), sk('Fill ratio check', 'trayfill', undefined, undefined, { icon: 'status', lv: true }), sk('Cables in this route', 'traycables', undefined, undefined, { icon: 'route', lv: true }),
      choice('Width', 'width', TRAY_WIDTHS.map((w) => ({ id: String(w), label: `${w} mm` })), String(it.tray.widthMm), 'stretch', true),
      { label: 'Tray tools', icon: 'tools', lv: true, sub: [OPEN.offset, OPEN.break, OPEN.fillet, OPEN.reverse, '-', qm()] }];
  }
  if (it.cable) {
    return [sk('Trace circuit', 'trace', undefined, undefined, { icon: 'circuit', lv: true }), ...(s.canShow ? [sk('Show in SLD', 'routesld', undefined, undefined, { icon: 'sld', lv: true })] : []), sk('Reverse direction', 'reverse', undefined, undefined, { icon: 'reverse', lv: true }),
      { label: 'Route tools', icon: 'tools', lv: true, sub: [OPEN.trim, OPEN.extend, OPEN.offset, OPEN.fillet, OPEN.break, OPEN.join, '-', qm()] }];
  }
  const tail = (...x: CtxEntry[]): CtxEntry[] => ['-', ...x];
  switch (it.kind) {
    case 'line':
      if (it.infinite) return addSelectedTool(it) ? list(`${kindOf(it)} tools`, [addSel()]) : [];
      return list('Line tools', [OPEN.trim, OPEN.extend, OPEN.offset, OPEN.fillet, OPEN.chamfer, OPEN.break, OPEN.join, '-', OPEN.reverse, sk('Convert to cable route', 'tocable', undefined, undefined, { icon: 'tocable', lv: true }), ...tail(qm(), addSel(), mkBlock())]);
    case 'pline':
      if (it.cloud) return list(`${kindOf(it)} tools`, [qm(), addSel(), mkBlock()]);
      return list('Polyline tools', [OPEN.offset, OPEN.fillet, OPEN.chamfer, OPEN.trim, OPEN.extend, OPEN.break, OPEN.join, ...(it.pts.length > 2 ? [sk(it.closed ? 'Open' : 'Close', 'plclose')] : []), sk('Explode', 'explode1', undefined, 'X', { icon: 'explode' }), '-',
        OPEN.reverse, ...(it.closed ? [sk('Use as room boundary', 'roomfrom', undefined, undefined, { icon: 'room', lv: true })] : []), sk('Convert to cable route', 'tocable', undefined, undefined, { icon: 'tocable', lv: true }), ...tail(qm(), addSel(), mkBlock())]);
    case 'circle': case 'arc': return list(`${kindOf(it)} tools`, [OPEN.offset, ...tail(qm(), addSel(), mkBlock())]);
    case 'ellipse': return list('Ellipse tools', [qm(), addSel(), mkBlock()]);
    case 'point': return list('Point tools', [addSel(), mkBlock()]);
    case 'text':
      return list('Text tools', [sk('Edit text', 'edtext', undefined, 'ED', { icon: 'edtext' }), sk('Find and replace…', 'find', undefined, 'FIND', { icon: 'find' }),
        choice('Justify', 'txjust', TEXT_JUSTS, it.just ?? 'L'), choice('Text height', 'txheight', ISO_TEXT_MM.map((h) => ({ id: String(h), label: `${h} mm on paper` }))), choice('Case', 'txcase', CASES),
        choice('Frame', 'txframe', TEXT_FRAMES, it.frame ?? 'none'), sk('Background mask', 'txmask', undefined, undefined, { on: !!it.mask }), ...tail(addSel(), mkBlock())]);
    case 'mtext':
      return list('Note tools', [sk('Edit text', 'edtext', undefined, 'ED', { icon: 'edtext' }), sk('Width…', 'ntwidth'), choice('Justify', 'ntjust', NOTE_ATTACHES, attachOf(it)), sk('Find and replace…', 'find', undefined, 'FIND', { icon: 'find' }), ...tail(addSel(), mkBlock())]);
    case 'mleader':
      return list('Multileader tools', [sk('Edit text', 'edtext', undefined, 'ED', { icon: 'edtext' }), { label: 'Add leader', cmd: 'MLEADERADD' }, { label: 'Remove leader', cmd: 'MLEADERREMOVE' },
        { label: 'Align…', cmd: 'MLA', key: 'MLA' }, { label: 'Collect…', cmd: 'MLC', key: 'MLC' }, sk('Find and replace…', 'find', undefined, 'FIND', { icon: 'find' }), ...tail(addSel(), mkBlock())]);
    case 'dim':
      return list('Dimension tools', [sk('Edit text', 'edtext', undefined, 'ED', { icon: 'edtext' }), ...(it.text ? [sk('Remove text override', 'dimreset')] : []),
        ...(s.dimStyles.length ? [choice('Dimension style', 'dimstyle', s.dimStyles.map((n) => ({ id: n, label: n })), it.dimStyle ?? 'Standard')] : []),
        choice('Precision', 'dimprec', [0, 1, 2, 3].map((d) => ({ id: String(d), label: d ? `0.${'0'.repeat(d)}` : '0' })), String(it.look?.decimals ?? 2)),
        ...(it.dimKind === 'angular' ? [] : [choice('Text position', 'dimpos', DIM_TEXT_POS, it.look?.textPos ?? 'outside')]), ...tail(addSel(), mkBlock())]);
    case 'insert':
      return list('Block tools', [...(it.attrs || s.withAtts?.(it) ? [sk('Edit attributes', 'edatt'), sk('Reset attributes', 'blkreset')] : []), sk('Open block editor', 'bedit', undefined, 'BE'), sk('Edit block in place', 'refedit', undefined, 'REFEDIT'),
        sk('Select all of this block', 'selblock'), sk('Count instances', 'blkcount'), ...(s.blocks.some((b) => b !== it.block) ? [choice('Replace with another block', 'blkreplace', s.blocks.filter((b) => b !== it.block).map((b) => ({ id: b, label: b })))] : []),
        sk('Explode', 'blkexplode', undefined, 'X', { icon: 'explode' }), ...tail(addSel())]);
    default: return [];
  }
}
/** A hatch (a closed polyline or a circle with a pattern, so it is asked before the kind). */
function hatchTools(it: SketchItem): CtxEntry[] {
  return [{ label: 'Hatch tools', icon: 'tools', sub: [sk('Edit hatch…', 'hedit', undefined, 'HE'), choice('Hatch scale', 'hscale', HATCH_SCALES), choice('Hatch angle', 'hangle', HATCH_ANGLES.map((a) => ({ id: String(a), label: `${a}°` })), String(it.hatch?.angle ?? 0)),
    sk('Set origin', 'horigin'), ...(it.holes?.length ? [sk('Remove islands', 'hislands')] : []), sk('Recreate boundary', 'hboundary'), '-', qm(), addSel(), mkBlock()] }];
}

/** Several drawn objects, no devices: Join, Array, Quick measure and Make block. */
function manyTools(items: readonly SketchItem[]): CtxEntry[] {
  const kinds = new Set(items.map(kindOf));
  return [{ label: kinds.size === 1 ? `${[...kinds][0]} tools` : 'Tools', icon: 'tools', sub: [...(items.every((it) => isPath(it) && !it.closed) ? [OPEN.join] : []), sk('Array', 'array', undefined, 'AR', { icon: 'array' }), '-', qm(), ...(items.some((it) => !it.tray && !it.cable) ? [mkBlock()] : [])] }];
}

/** The menu of the drawn objects picked (and devices with them). */
export function drawnMenu(s: DrawnMenuState): CtxEntry[] {
  const { items, devices } = s, n = items.length + devices, one = n === 1 ? items[0] : undefined;
  const own = s.dwBlock !== undefined ? dwBlockTools() : one ? (one.hatch ? hatchTools(one) : kindTools(s, one)) : devices ? [] : manyTools(items);
  const edits = sketchEditsFor([...items], devices), has = (e: SketchEdit) => edits.includes(e);
  const kinds = new Set([...items.map(kindOf), ...(devices ? ['Devices'] : [])]);
  const modify: CtxEntry[] = [sk('Erase', 'erase', undefined, 'Del', { icon: 'erase', bad: true }), sk('Move', 'move', undefined, 'M', { icon: 'move' }), sk('Copy selection', 'copy', undefined, 'CO', { icon: 'copy' }),
    ...(has('scale') || (one && isPath(one) && !one.tray && !devices) ? [sk('Scale', 'scale', undefined, 'SC', { icon: 'scale' })] : []), ...(has('rotate') ? [sk('Rotate', 'rotate', undefined, 'RO', { icon: 'rotate' })] : []), ...(has('mirror') ? [sk('Mirror', 'mirror', undefined, 'MI', { icon: 'mirror' })] : []),
    ...(devices ? [] : [{ label: 'Draw order', icon: 'draworder', sub: DRAW_ORDER.map((x) => sk(x.label, 'draworder', x.id)) } as CtxItem])];
  const filter: CtxEntry[] = kinds.size > 1 && s.dwBlock === undefined ? [{ label: 'Filter', icon: 'filter', sub: [
    ...(devices ? [sk('Devices only', 'filter', 'devices', String(devices)), sk('Drawn objects only', 'filter', 'drawn', String(items.length)), '-' as const] : []),
    ...[...new Set(items.map(kindOf))].map((k) => sk(`${k} only`, 'filter', k, String(items.filter((it) => kindOf(it) === k).length)))] }] : [];
  return groups(
    repeatGroup(s.repeat), own,
    [{ label: 'Clipboard', icon: 'clipboard', sub: CLIPBOARD.map((x) => sk(x.label, 'clipboard', x.id, x.key || undefined, { icon: x.id === 'cut' ? 'cut' : x.id === 'copy' ? 'copyclip' : x.id === 'paste' ? 'paste' : undefined, ...(x.paste && !s.canPaste ? { off: true } : {}) })) }, ...undoEntries(s)],
    modify, viewGroup(),
    [{ label: 'Select similar', cmd: 'SELECTSIMILAR', icon: 'similar' }, { label: 'Invert selection', cmd: 'SELECTINVERT', icon: 'invert' }, { label: 'Deselect all', key: 'Esc', act: 'deselect', icon: 'deselect' },
      { label: 'Quick select…', key: 'QS', cmd: 'QSELECT', icon: 'qselect' }, ...filter, { label: 'Count', cmd: 'COUNT', icon: 'count' }],
    paletteGroup(s)
  );
}
