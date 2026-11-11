import { Grid3x3, Grip, Maximize2, Minimize2, Scan, Square, ZoomIn, ZoomOut } from 'lucide-react';
import { withNetwork } from '../calc/network';
import { txTag } from '../model/transformers';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from 'react';
import { STATUS_TEXT } from '../calc/statusText';
import { componentLabel } from '../model/components';
import type { DrawingInfo, Project } from '../types';
import { cableTypeOf, CABLE_TYPE_DEFS, labelCode } from '../model/cableTypes';
import { cableRefOf } from '../model/cableRefs';
import { dbSpares, spareBreaker } from '../model/spareWays';
import { besideScaleOf, FeederSwitchSym, LEGEND_ROW, LEGEND_SYM_X, LEGEND_TEXT_X, legendEntries, legendWidth, LoadSym, polesText, rcdInSwitch, starterSymbolOf, SwitchSym, switchKindOf } from '../diagram/IecSymbols';
import { legendLineY, legendPxFor, legendRows } from '../diagram/legendLayout';
import { Sym, SYM_BOX, SYM_SCALE, type SymbolId } from '../diagram/symbolLibrary';
import { panelSymbolOf } from '../diagram/panelBox';
import { izText, type FeederResult, type Status } from '../calc/electrical';
import { boardSummary, loadTypeOf } from '../calc/summary';
import { failReasons, quickFixes } from '../calc/quickFix';
import { boardLocation } from '../model/levels';
import { boardPhaseKw } from '../calc/loadSchedule';
import { DEWA_EXTRA_Y, LEAF_W, layoutSystem } from '../diagram/layout';
import { panelSummary } from '../docs/mdSheet';
import { cpcOf } from '../calc/cableTable';
import LoadIcon from './LoadIcon';
import type { Annotations, ResultLayers } from '../diagram/annotations';
import { addsWay, canDrop, canMove, type DropTarget, type MoveItem, type PaletteItem } from '../model/sldEdit';
import { cables } from '../calc/cableTable';
import { upsLoadingPct } from '../calc/sizing';
import { isMotor, starterInfo, starterOf } from '../calc/motor';
import { sldDevices } from '../diagram/sldDevices';
import { breakerText, cableLines, fireRatedWarning, icuText, incomerReach, incomerTexts, isolatorText, sparePoles, spareText, supplyReach, textWidth } from '../diagram/panelLabels';
import { cableSizeText, faultCurrentKA, impedanceToBoard, runsOf, upstreamVoltageDropPct } from '../calc/electrical';
import { MOTOR_START_DIP_LIMIT_PCT, type GeneratorRun, type OutageScenario } from '../calc/scenario';
import { boardRatio, COLOR_BY, earthRatio, feederRatio, heatColor, type ColorBy } from '../diagram/heatmap';
import { evaluateEarthingAll } from '../calc/earthing';
import { earthingLayout } from '../model/earthingPlan';
import { INCOMER_DEVICES, incomerDeviceOf, type Board, type Feeder } from '../types';
import { getArmedItem, getDragItem, setArmedItem, setDragItem, subscribeArmedItem } from '../diagram/dragItem';
import { recordedKva, recordedText } from '../model/existing';
import { fmtDate, fmtFixed, txt } from '../util/format';
import { CO_GEN_REACH, ChangeoverIncomers } from '../diagram/ChangeoverSym';
import { atsLines, atsOf, changeoverBreakers, isInterlocked } from '../model/changeover';
import { isFitClick, KEY_STEP, PAN_STEP, useSpaceHeld, viewKey, wheelAction, ZoomChip } from './drawingView';

interface Tag {
  text: string;
  cls: string;
}

type GridStyle = 'lines' | 'dots' | 'off';

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const worst = (statuses: (Status | undefined)[]): Status =>
  statuses.includes('bad') ? 'bad' : statuses.includes('warn') ? 'warn' : 'ok';

/** Incomer protection: the board's own, else the authority supply's CT and setting. */
export const protectionOf = (b: Board): Board['protection'] | undefined => {
  const p = { ctRatio: b.protection?.ctRatio ?? b.supply?.ctRatio, irSetting: b.protection?.irSetting ?? b.supply?.irSetting, relays: b.protection?.relays, apfc: b.protection?.apfc };
  return p.ctRatio || p.irSetting || p.relays?.length || p.apfc ? p : undefined;
};

/** Instruments and earthing default on for main boards. */
export const hasInstruments = (b: Board) => b.instruments ?? !b.upstreamId;
export const hasEarthPits = (b: Board) => b.earthing?.show ?? !b.upstreamId;
/** DEWA-style LV earth pits outside a framed main board: pit pitch, the nearest pit's offset
 * left of the frame, and the room left of that for the pit tags and notes. */
const PIT_PITCH = 56, PIT_NEAR = 34, PIT_TAG = 30;
/** A framed board's ammeter, voltmeter and lamps sit outside its frame when the room left of the incomer is short. */
const instrumentsOutside = (n: { board: Board; x: number; busX1: number; terminal: boolean }) =>
  hasInstruments(n.board) && !n.terminal && !isInterlocked(n.board) && n.x - 66 - n.busX1 < 50;
const INSTRUMENTS_OUT = 52;
/** LV earth pits of a main board: its own count, else the earthing plan's, else two. */
const lvPitCount = (b: Board, planned: Map<string, string[]>) => b.earthing?.pits ?? (planned.get(`lv:${b.id}`)?.length || 2);
const pitColumnLead = (pits: number, instOut: boolean) => PIT_NEAR + (pits - 1) * PIT_PITCH + PIT_TAG + (instOut ? INSTRUMENTS_OUT : 0);
/** Earth pit IDs (E1, E2 …) of each earthing item key (lv:, txn:, txb: + board id) from the earthing plan. */
export function plannedEarthPits(project: Project): Map<string, string[]> {
  const m = new Map<string, string[]>();
  if (!project.boards.some(hasEarthPits)) return m;
  const L = earthingLayout(project);
  for (const pit of L.pits) { const k = pit.itemKey.replace(/#\d+$/, ''); (m.get(k) ?? m.set(k, []).get(k)!).push(pit.id); }
  // A transformer body without pits of its own shows the RMU body-earth pits it is connected to.
  for (const it of L.items) { const k = it.key.replace(/#\d+$/, ''); if (it.sharesPitsOf && !m.has(k) && m.has(it.sharesPitsOf)) m.set(k, m.get(it.sharesPitsOf)!); }
  return m;
}

/** The SLD's layout. DEWA style: a framed main board's LV earth pits stand side by side outside
 * its frame, on the left, so the root takes that much room before it (earthLead, by board id;
 * more when its instruments sit outside the frame). */
export function sldLayout(project: Project, dewa: boolean, cableRefs = false, rootExtraY = 0, planned = plannedEarthPits(project)) {
  const extraY = dewa ? DEWA_EXTRA_Y : 0;
  let base = layoutSystem(project, extraY, { frames: dewa, rootFrames: !dewa, cableRefs, rootExtraY });
  // A DEWA main board with no outgoing panels has no frame head to hold its earth pits: it
  // draws the standard-style detail in its own band, so the root bus drops by that band.
  if (dewa && base.roots.some((r) => r.terminal && hasEarthPits(r.board) && lvPitCount(r.board, planned) > 0)) {
    rootExtraY += EARTH_BAND_Y;
    base = layoutSystem(project, extraY, { frames: dewa, rootFrames: !dewa, cableRefs, rootExtraY });
  }
  // Both styles: a framed root panel's LV earth pits stand outside its frame, on the left.
  const earthLead = new Map<string, number>();
  for (const r of base.roots) {
    const pits = r.frame && !r.terminal && hasEarthPits(r.board) && !isInterlocked(r.board) ? lvPitCount(r.board, planned) : 0;
    if (pits > 0) earthLead.set(r.board.id, pitColumnLead(pits, instrumentsOutside(r)));
  }
  // The authority supply's lines reach right of a root's incomer line further than a new panel's
  // one slot: the next root starts clear of them, and clear of a board symbol's incomer label and
  // text beside it (a root with no outgoing ways). Unless framed, the LV earth-pit detail stands
  // left of the incomer line, wider than the board box: the root starts that much later.
  const rootReach = new Map<string, number>();
  const rootLead = new Map(earthLead);
  for (const r of base.roots) {
    const b = r.board;
    const reach = Math.max(!b.upstreamId && !b.sourceKva ? supplyReach(b, dewa) : 0, r.terminal ? boardSymbolReach(project, b) + (dewa ? BOARD_FRAME_PAD : 0) : 0);
    if (reach > 0) rootReach.set(b.id, reach);
    const pits = hasEarthPits(b) ? lvPitCount(b, planned) : 0;
    if (pits > 0 && !earthLead.has(b.id) && !(dewa && !r.terminal)) rootLead.set(b.id, earthDetailWidth(project, b, pits, planned.get(`lv:${b.id}`)) + EARTH_DETAIL_GAP - 62);
  }
  const layout = rootLead.size || rootReach.size ? layoutSystem(project, extraY, { frames: dewa, rootFrames: !dewa, cableRefs, rootExtraY, rootLeadX: rootLead, rootReachX: rootReach }) : base;
  return { layout, earthLead };
}

/** Gap between an unframed LV earth-pit detail and the incomer line on its right. */
const EARTH_DETAIL_GAP = 10;
/** The electrode note of an unframed LV earth-pit detail, on two lines so the detail stays narrow. */
const electrodeNote = (el: number) => [`MIN. ${el} m ELECTRODE WITH`, 'INSPECTION PIT AND COVER'];
/** An unframed detail's test link: this far left of the incomer line, clear of the voltage label. */
const EARTH_TL_IN = 50;
/** An unframed detail's last pit stands this far left of the incomer line: clear of the test link,
 * and outside the dashed frame of a DEWA board with no outgoing ways (which holds the MET). */
const EARTH_PITS_IN = 96;
/** Width of an unframed LV earth-pit detail: its longest line, at least the board box's 124, and
 * room for its pits (24 apart) left of the test link. Narrow, so it stands by its own incomer
 * and not by the transformer on its left. */
const earthDetailWidth = (project: Project, b: Board, pits: number, lvIds?: string[]) => {
  const el = b.earthing?.electrodeM ?? project.earthingPlan?.electrodeM ?? 3;
  const ids = lvIds?.length === pits ? ` · ${lvIds.join(', ')}` : '';
  return Math.ceil(Math.max(124, textWidth(`LV EARTH PITS (${pits} NO.)${ids}`, 8, true), textWidth(`1C ${earthConductorOf(project, b)}mm² CU/PVC`, 7.5),
    ...electrodeNote(el).map((t) => textWidth(t, 7.5)), (pits - 1) * 24 + EARTH_PITS_IN + 4));
};
/** Standard style: a root panel's dashed frame, from this far above its busbar (clear of the transformer's earth
 * labels, holding the MET, the incomer and its labels) to this far below it (under the ways' breakers, above their
 * cable text). */
const PLAIN_FRAME_TOP = 186, PLAIN_FRAME_BOTTOM = 43;
/** Lift of the root bus that gives an unframed main board's LV earth-pit detail its own band. */
const EARTH_BAND_Y = 140;
/** Top of a framed panel (DEWA style): the name box band above the incomer. */
const frameTopOf = (b: Board, busY: number, rows = 4) => busY - (protectionOf(b) ? 92 : 84) - 12 - 62 - Math.max(0, rows - 4) * 11;
/** Wraps text to lines of at most `max` characters at spaces; the last line is cut with "…". */
const wrapText = (text: string, max: number, lines: number): string[] => {
  const out: string[] = [];
  let rest = text.trim();
  while (rest && out.length < lines - 1 && rest.length > max) {
    const cut = rest.lastIndexOf(' ', max);
    if (cut <= 0) break;
    out.push(rest.slice(0, cut)); rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest.length > max ? `${rest.slice(0, max - 1)}…` : rest);
  return out;
};
const m2s = (ids?: string[]) => (ids?.length ? ids.join(', ') : undefined);
/** Main earth conductor: typed, else the incomer's protective conductor size (min. 16), else 50 mm². */
export function earthConductorOf(project: Project, b: Board): number {
  if (b.earthing?.conductorMm2) return b.earthing.conductorMm2;
  const inc = project.feeders.find((f) => f.feedsBoardId === b.id);
  return inc ? Math.max(16, cpcOf(inc)) : 50;
}

/** A starter box's centre below its way's busbar: under the breaker (which ends at 34), so its link meets the cable
 * there, its top clear of the previous way's breaker text (baseline at 26) and its foot clear of the frame (at 47). */
export const STARTER_DY = 36.5;

/** Screen pixels per drawing unit at which the SLD's text shows at its drawn size (10–11 px). */
export const READABLE_PX_PER_UNIT = 1;

/**
 * Where the design canvas opens: the whole drawing when its text is readable fitted;
 * otherwise the full width if that is readable, else text at its drawn size,
 * from the top of the drawing and centred on the main board (`cx`).
 */
export function openingView(w: number, h: number, boxW: number, boxH: number, cx = w / 2): ViewBox {
  const full = { x: 0, y: 0, w, h };
  if (!(boxW > 0 && boxH > 0 && w > 0 && h > 0) || Math.min(boxW / w, boxH / h) >= READABLE_PX_PER_UNIT) return full;
  const s = Math.max(READABLE_PX_PER_UNIT, boxW / w);
  const vw = boxW / s, vh = boxH / s;
  return { x: Math.min(Math.max(cx - vw / 2, 0), Math.max(w - vw, 0)), y: 0, w: vw, h: vh };
}

/**
 * How the design canvas draws. On screen: what is in view, detail by zoom, and no symbol legend (the design canvas
 * is not published; the legend is on the drawing sheets). The Export dialog copies the live drawing, so while it is
 * open the canvas draws everything, as a drawing.
 */
export const canvasDrawing = (exporting: boolean) => ({ cull: !exporting, lod: !exporting, hideLegend: !exporting });

/** The smallest margin (drawing units) the drawing keeps around the view, so a label from just outside never leaves a gap. */
const VIEW_MARGIN = 400;
/** Drawn width for a view of this width: the view, half a view each side, and a margin. */
const drawnSpan = (w: number) => w * 1.5 + VIEW_MARGIN + Math.max(w * 0.5, VIEW_MARGIN);
/** How long after the last zoom or pan step the drawing lets go of what is far out of view. */
const SETTLE_MS = 250;

/** The zoom chip on its own: it follows every zoom step, which the drawing does not draw again for. */
function ViewZoomChip({ view, W, subscribe, onFit }: { view: RefObject<ViewBox>; W: number; subscribe: (changed: () => void) => () => void; onFit: () => void }) {
  const read = () => (W / view.current!.w) * 100;
  return <ZoomChip pct={useSyncExternalStore(subscribe, read, read)} onFit={onFit} />;
}

/** A DB's spares and spaces for its summary on the SLD, e.g. " + 2 spare, 1 space". */
const dbSpareText = (b: Board): string => {
  const ways = dbSpares(b);
  const sp = ways.filter((w) => w.kind === 'spare').length, gap = ways.length - sp;
  return ways.length ? ` + ${[sp ? `${sp} spare` : '', gap ? `${gap} space` : ''].filter(Boolean).join(', ')}` : '';
};
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Side of the board symbol a board with no outgoing ways is drawn as. */
const BOARD_SYM = 44;
/** DEWA style, its dashed panel frame: from this far left of the incomer line (room for the MET),
 * and this far past its text on the right and below. */
const BOARD_FRAME_IN = 86, BOARD_FRAME_PAD = 8;
/** How far right of its incomer line a board symbol's labels reach: the incomer device, or the
 * name and the tags beside the symbol (allowing for a three-figure phase-load line). */
const boardSymbolReach = (project: Project, b: Board) => Math.max(incomerReach(project, b),
  BOARD_SYM / 2 + 8 + Math.max(textWidth(trunc(b.id, 14), 12, true), textWidth('R 000.0 · Y 000.0 · B 000.0 kW', 10.5, true)));
/** A board with no outgoing ways: the incomer ends on an enclosure with its busbar and ways drawn
 * inside (a DB one way, a package panel its control rows), with the name and kind on its right. */
function BoardSymbol({ board: b, x, top, status, sel }: { board: Board; x: number; top: number; status: string; sel: boolean }) {
  const k = BOARD_SYM / 16, h = BOARD_SYM / 2;
  const at = (u: number) => (u - 12) * k; // palette icon units (24 grid, 16 wide box) to offsets
  const bus = top + 6 * k;
  const kind = b.kind ?? (b.upstreamId ? 'DB' : 'MDB');
  const inner = kind === 'DB' || kind === 'EDB'
    ? <line x1={x} y1={bus} x2={x} y2={top + 13 * k} className="ln" />
    : kind === 'MCC' || kind === 'EMCC' || kind === 'FP'
      ? <path d={`M${x + at(8)} ${top + 10 * k} H${x + at(16)} M${x + at(8)} ${top + 13 * k} H${x + at(16)}`} className="ln" />
      : <path d={`M${x + at(9)} ${bus} V${top + 14 * k} M${x + at(15)} ${bus} V${top + 14 * k}`} className="ln" />;
  return (
    <g className="board-sym">
      <rect x={x - h} y={top} width={BOARD_SYM} height={BOARD_SYM} rx="2" className="box" style={sel ? { stroke: 'var(--acc)', strokeWidth: 2 } : undefined} />
      <line x1={x + at(5.5)} y1={bus} x2={x + at(18.5)} y2={bus} className="ln" style={{ strokeWidth: 2.2 }} />
      {inner}
      <circle cx={x + h - 6} cy={top + 6} r="3" style={{ fill: `var(--${status})` }} />
      <text className="b lod-name" x={x + h + 8} y={top + 16}>{trunc(b.id, 14)}</text>
      <text className="m" x={x + h + 8} y={top + 30}>{`${kind}${b.existing ? ' · EXISTING' : ''}`}</text>
    </g>
  );
}

/** Whole-network single line diagram: utility → transformer → main board →
 * sub-boards → loads. Wheel to zoom, drag to pan; click a board or a load to
 * select it, double-click to edit it. Optional result labels (current,
 * voltage, voltage drop, fault level, power factor, loading) are printed
 * next to each board and feeder. */
export default function SystemDiagram({
  project,
  calcProject,
  stale = false,
  results,
  selectedFeederId,
  selectedBoardId,
  onSelectFeeder,
  onSelectBoard,
  tool = 'select',
  annotations,
  layers,
  cableRefs: cableRefsProp,
  hideLegend = false,
  lod = false,
  outlines,
  clouds,
  anchors,
  onOutline,
  onMoveToSheet,
  focus,
  onFixFeeder,
  arrows,
  fromSheet,
  cull = false,
  onEditFeeder,
  onEditBoard,
  onOpenSchedule,
  onDropItem,
  onMoveItem,
  onPatchFeeder,
  colorBy = 'none',
  scenario,
  chain,
  onEditTie,
  resizable = false,
  fullScreen = false,
  onToggleFullScreen,
  onDrawing
}: {
  project: Project;
  /** The project the results were calculated for (the last run). */
  calcProject?: Project;
  /** Results out of date: labels, dots and colours are shown faded. */
  stale?: boolean;
  results: FeederResult[];
  selectedFeederId: string | null;
  selectedBoardId: string | null;
  onSelectFeeder: (id: string) => void;
  onSelectBoard: (id: string) => void;
  /** 'pan': dragging and clicking never select anything. */
  tool?: 'select' | 'pan';
  annotations?: Annotations;
  layers?: ResultLayers;
  /** Cable text as a reference number (legend: CABLE SCHEDULE) and the size only. */
  cableRefs?: boolean;
  /** Leave the symbol legend out (drawing sheets put it in their legend column). */
  hideLegend?: boolean;
  /** Level of detail by zoom (the interactive canvas only): zoomed out, only panel and load names, larger;
   * part-way, no cable, result or accessory text. Off for anything exported — exports copy the live styles. */
  lod?: boolean;
  /** Sheet outlines on the design canvas: which panels go on which sheet. */
  outlines?: { id: string; label: string; boards: string[]; color: string }[];
  /** Revision clouds around panels or circuits (drawing sheets). */
  clouds?: { boards: string[]; feeders?: string[]; rev: string }[];
  /** Invisible panel and circuit outlines (data-anchor) so drawing sheets can hit-test what a drag points at. */
  anchors?: boolean;
  onOutline?: (sheetId: string) => void;
  /** A panel dragged into another sheet's outline. */
  onMoveToSheet?: (boardId: string, sheetId: string) => void;
  /** Centre the view on this panel or circuit (n changes on every request). */
  focus?: { kind: 'board' | 'feeder'; id: string; n: number };
  /** Apply a quick fix from a circuit's hover card. */
  onFixFeeder?: (id: string, patch: Partial<Feeder>, label: string) => void;
  /** Callouts with leader arrows (drawing sheets). */
  arrows?: { target: string; text: string; dir: 'ne' | 'nw' | 'se' | 'sw'; len?: number }[];
  /** Drawing sheets: the sheet number of the board feeding each panel drawn from another sheet. */
  fromSheet?: Record<string, string>;
  /** Draw only the boards and circuits in view (plus a margin) — for the interactive SLD on large
   * projects. Exports and sheets leave it off so everything is drawn. */
  cull?: boolean;
  onEditFeeder?: (id: string) => void;
  onEditBoard?: (id: string) => void;
  /** Opens a DB's load schedule (double-click on the DB's circuit summary). */
  onOpenSchedule?: (boardId: string) => void;
  /** Drag and drop from the equipment library; the diagram only reports
   * where an item was dropped. */
  onDropItem?: (item: PaletteItem, target: DropTarget) => void;
  /** A load or board picked up on the diagram and dropped on a target. */
  onMoveItem?: (item: MoveItem, target: DropTarget) => void;
  /** Quick edit of a feeder's cable from its label. */
  onPatchFeeder?: (feederId: string, patch: Partial<Feeder>) => void;
  /** Colour cables and busbars by a result. */
  colorBy?: ColorBy;
  /** Generator mode: the network as it runs on the standby generators.
   * Everything else is drawn dimmed; results must be for this network. */
  scenario?: { project: Project; energized: Set<string>; generators: GeneratorRun[]; outage?: OutageScenario['outage'] };
  /** Click on a bus tie. */
  onEditTie?: (id: string) => void;
  /** Breakers in the selected feeder's discrimination chain, by status. */
  chain?: Map<string, Status>;
  /** Drag handle at the bottom edge to change the height (remembered). */
  resizable?: boolean;
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
  /** Change the drawing settings (symbol style, legend): shows their buttons. */
  onDrawing?: (patch: Partial<DrawingInfo>) => void;
}) {
  const iec = (project.drawing?.symbols ?? 'iec') === 'iec';
  // DEWA submission style: panel frames, summary boxes (LOC, TCL, DF, MDL), DEWA wording.
  const dewa = project.drawing?.sldStyle !== 'standard'; // on unless switched off
  const feederTags = (id: string): Tag[] => {
    // Earth fault loop colouring: Zs against its limit on every feeder.
    const e = earthing?.get(id);
    const earthTag: Tag[] = e ? [{ text: `Zs ${fmtFixed(e.zsOhm, 2)} / ${fmtFixed(e.maxZsOhm, 2)} Ω`, cls: e.status }] : [];
    const a = annotations?.feeders[id];
    if (!a || !layers) return earthTag;
    const t: (Tag | false)[] = [
      layers.current && a.currentA !== undefined && { text: `${fmtFixed(a.currentA, 0)} A`, cls: 'r-cur' },
      layers.vd && a.vdTotalPct !== undefined && { text: `ΔV ${fmtFixed(a.vdTotalPct, 2)}%`, cls: a.vdStatus ?? '' },
      layers.fault && a.faultKA !== undefined && { text: `Ik ${a.faultKA.toFixed(1)} kA`, cls: 'r-fault' },
      layers.fault && icuShort(id),
      layers.pf && a.pf !== undefined && { text: `PF ${a.pf.toFixed(2)}`, cls: 'r-pf' },
      layers.loading && a.loadingPct !== undefined && { text: `${fmtFixed(a.loadingPct, 0)}% of In`, cls: a.loadingStatus ?? '' }
    ];
    return [...t.filter((x): x is Tag => !!x), ...earthTag];
  };
  // Breaking capacity below the fault level at the board the breaker is on.
  const icuShort = (id: string): Tag | false => {
    const f = project.feeders.find((x) => x.id === id);
    const ik = f && annotations?.boards[f.boardId]?.faultKA;
    return !!f && ik !== undefined && f.breakerIcuKa > 0 && f.breakerIcuKa < ik && { text: `✕ Icu ${f.breakerIcuKa} < Ik ${ik.toFixed(1)} kA`, cls: 'bad' };
  };
  const boardTags = (id: string): Tag[] => {
    const a = annotations?.boards[id];
    if (!a || !layers) return [];
    const t: (Tag | false)[] = [
      layers.voltage && a.voltageV !== undefined && { text: `${a.voltageV.toFixed(0)} V · ${a.voltagePct!.toFixed(1)}%`, cls: a.voltageStatus ?? '' },
      layers.fault && a.faultKA !== undefined && { text: `Ik″ ${a.faultKA.toFixed(1)} kA`, cls: 'r-fault' },
      layers.pf && a.pf !== undefined && { text: `PF ${a.pf.toFixed(2)}`, cls: 'r-pf' }
    ];
    return t.filter((x): x is Tag => !!x);
  };
  const edit = (fn?: (id: string) => void, id?: string) => () => {
    if (tool !== 'pan' && fn && id) fn(id);
  };
  // Cable text as reference numbers: on the drawing sheets when chosen there, on screen with Always numbers.
  const cableRefs = cableRefsProp ?? project.drawing?.cableLabels === 'ref';
  // Standard style: room under a root's transformer for the LV earth-pit detail and a root panel's
  // frame, which the DEWA head (DEWA_EXTRA_Y and the frame) already has.
  const earthLift = !dewa && project.boards.some((b) => !b.upstreamId && (hasEarthPits(b) || project.feeders.some((f) => f.boardId === b.id))) ? EARTH_BAND_Y : 0;
  // Earth pit IDs (E1, E2 …) from the earthing plan, so the SLD and the earthing sheet agree.
  const earthPits = useMemo(() => plannedEarthPits(project), [project]);
  const { layout, earthLead } = useMemo(() => sldLayout(project, dewa, cableRefs, earthLift, earthPits), [project, dewa, cableRefs, earthLift, earthPits]);
  const pitIds = (key: string) => m2s(earthPits.get(key));
  // A framed panel's name box: as wide as the room left of the incomer allows (never across it),
  // with the location wrapped onto a second line when it doesn't fit.
  /** An existing board's rows in the DEWA name box: the tag, its recorded demand, then how it was recorded. */
  const existingRows = (b: Board, max: number): string[] => {
    const kva = recordedKva(project, b), e = b.existing!;
    const date = fmtDate(e.recordedOn);
    const how = [e.source, date].filter(Boolean).join(', ');
    // A date stays whole on its own line when the two don't fit on one.
    const howRows = !how ? [] : how.length <= max || !e.source || !date ? wrapText(how, max, 2) : [...wrapText(`${e.source},`, max, 1), date];
    return ['EXISTING', ...(kva !== undefined ? [`MD = ${fmtFixed(kva, 0)} kVA${e.marginPct ? ` (+${e.marginPct} %)` : ''}`] : []), ...howRows];
  };
  const nameBox = (b: Board, n: { x: number; busX1: number; busY: number }) => {
    const x1 = n.busX1 - 7;
    const w = Math.max(96, Math.min(139, n.x - x1 - 14));
    const max = Math.floor((w - 12) / 5);
    const sm = panelSummary(project, b);
    const iscRaw = faultCurrentKA(impedanceToBoard(project, b.id), project.voltageV);
    const isc = Number.isFinite(iscRaw) ? iscRaw : undefined;
    const loc = wrapText(`LOC : ${boardLocation(project, b) || '—'}`, max, 2);
    const rows = [
      `TCL = ${fmtFixed(sm.tclKw, 2)} kW`,
      `MDL = ${fmtFixed(sm.mdlKw, 2)} kW`,
      ...loc.map((t, i) => (i ? `      ${t}` : t)),
      ...(isc !== undefined ? [`Isc = ${isc.toFixed(1)} kA`] : []),
      // Existing board: its tag and recorded maximum demand.
      ...(b.existing ? existingRows(b, max) : [])
    ];
    return { w, rows, sm, top: frameTopOf(b, n.busY, rows.length) };
  };
  // CAD label limits follow neighbouring drops on the same row. This is
  // export metadata only; it does not change the live or printed diagram.
  const cadSlots = useMemo(() => {
    const slots = new Map<string, number>();
    const rows = new Map<number, typeof layout.feeders>();
    for (const n of layout.feeders) (rows.get(n.busY) ?? rows.set(n.busY, []).get(n.busY)!).push(n);
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      row.forEach((n, i) => slots.set(n.feeder.id, row[i + 1] ? row[i + 1].x - n.x : LEAF_W));
    }
    return slots;
  }, [layout]);
  /** Where each board box hangs from (higher than its busbar on a mains / generator changeover). */
  const headOf = useMemo(() => new Map(layout.boards.map((n) => [n.board.id, n.headY])), [layout]);
  /** Box around these panels: board box, summary box, busbar and outgoing ways. */
  const boardsBox = (ids: string[], pad: number) => {
    const ns = layout.boards.filter((n) => ids.includes(n.board.id));
    if (!ns.length) return null;
    const x1 = Math.min(...ns.map((n) => (n.terminal ? n.x - BOARD_FRAME_IN - 4 : n.busX1 - 12))) - pad;
    const x2 = Math.max(...ns.map((n) => (n.terminal ? n.x + 135 : Math.max(n.busX2 + 12, n.x + 135, n.genX !== undefined ? n.genX + CO_GEN_REACH + 5 : -Infinity)))) + pad;
    const y1 = Math.min(...ns.map((n) => n.headY - (dewa ? 165 : n.frame ? PLAIN_FRAME_TOP + 2 : 70))) - pad;
    const y2 = Math.max(...ns.map((n) => n.busY + (n.terminal ? 10 : 120))) + pad;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };
  /** The sheet outline under a screen point (the smallest one), for dropping a panel on a sheet. */
  const outlineAt = (cx: number, cy: number): string | undefined => {
    const svg = svgRef.current, ctm = svg?.getScreenCTM();
    if (!svg || !ctm || !outlines?.length) return undefined;
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const p = pt.matrixTransform(ctm.inverse());
    const hits = outlines.map((o, i) => ({ o, r: boardsBox(o.boards, 8 + (i % 3) * 6) })).filter((h) => h.r && p.x >= h.r.x && p.x <= h.r.x + h.r.w && p.y >= h.r.y && p.y <= h.r.y + h.r.h);
    hits.sort((a, b) => a.r!.w * a.r!.h - b.r!.w * b.r!.h);
    return hits[0]?.o.id;
  };
  const [overOutline, setOverOutline] = useState<string | null>(null);
  // Way numbers along each busbar (DEWA style).
  const wayNo = useMemo(() => { const m = new Map<string, number>(), c = new Map<string, number>(); for (const n of [...layout.feeders].sort((a, b) => a.x - b.x)) { const k = (c.get(n.feeder.boardId) ?? 0) + 1; c.set(n.feeder.boardId, k); m.set(n.feeder.id, k); } return m; }, [layout]);
  const byFeeder = useMemo(() => new Map(results.map((r) => [r.feeder.id, r])), [results]);
  const feedersOn = useMemo(() => { const m = new Map<string, Feeder[]>(); for (const f of project.feeders) (m.get(f.boardId) ?? m.set(f.boardId, []).get(f.boardId)!).push(f); return m; }, [project.feeders]);
  // Board loading and voltage come from the network that is running: the
  // generator scenario in generator mode.
  const running = scenario?.project ?? calcProject ?? project;
  // One network index for all the panel summaries (totals, fault level, voltage reuse the same walks).
  const summaries = useMemo(() => {
    const src = scenario?.project ?? calcProject ?? project;
    const srcById = new Map(src.boards.map((x) => [x.id, x]));
    return withNetwork(src, () => new Map(project.boards.map((b) => {
      const calc = srcById.get(b.id);
      return [b.id, calc ? boardSummary(src, calc) : withNetwork(project, () => boardSummary(project, b))];
    })));
  },
    [project, calcProject, scenario]
  );
  const off = (boardId: string) => !!scenario && !scenario.energized.has(boardId);
  const earthing = useMemo(
    () => (colorBy === 'earth' ? new Map(evaluateEarthingAll(running).map((e) => [e.feeder.id, e])) : undefined),
    [colorBy, running]
  );
  const feederHeat = (id: string) => {
    const r = byFeeder.get(id);
    const e = earthing?.get(id);
    const ratio = colorBy === 'earth' ? (e ? earthRatio(e) : undefined) : r && colorBy !== 'none' ? feederRatio(r, colorBy, project.vdLimitPct) : undefined;
    return ratio === undefined ? undefined : heatColor(ratio);
  };
  const boardHeat = (id: string) => {
    const s = summaries.get(id);
    if (!s || colorBy === 'none' || off(id)) return undefined;
    const ratio = boardRatio(s, upstreamVoltageDropPct(running, id), colorBy, project.vdLimitPct);
    return ratio === undefined ? undefined : heatColor(ratio);
  };

  // The symbol legend sits to the right of the network, inside the drawing (so it exports).
  const legend = useMemo(() => (iec && !hideLegend && (project.drawing?.legend ?? true) ? legendEntries(calcProject ?? project) : []), [iec, hideLegend, project, calcProject]);
  const legendW = legendWidth(legend);
  const W = layout.width + (legend.length ? legendW + 30 : 0);
  const H = Math.max(layout.height, legend.length ? 80 + legend.length * LEGEND_ROW : 0);
  const full: ViewBox = { x: 0, y: 0, w: W, h: H };
  // The view is not state: a zoom or pan step (moveVb) moves the viewBox without drawing everything again.
  const view = useRef<ViewBox>(full);
  const vb = view.current;
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // Visible span (drawing units) with a margin of half a screen each side, so panning shows no gaps.
  const viewX1 = vb.x - Math.max(vb.w * 0.5, VIEW_MARGIN), viewX2 = vb.x + vb.w * 1.5 + VIEW_MARGIN;
  // Hover card: a circuit's or panel's results, with quick fixes for a failing circuit.
  const [card, setCard] = useState<{ kind: 'board' | 'feeder'; id: string; x: number; y: number } | null>(null);
  const hideCard = useRef<ReturnType<typeof setTimeout>>();
  const showCard = (kind: 'board' | 'feeder', id: string) => (e: React.MouseEvent) => {
    if (pick.current || drag.current?.moved) return;
    clearTimeout(hideCard.current);
    const r = svgRef.current?.parentElement?.getBoundingClientRect();
    if (!r) return;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    setCard((c) => (c && c.id === id && c.kind === kind ? c : { kind, id, x, y }));
  };
  const leaveCard = () => { clearTimeout(hideCard.current); hideCard.current = setTimeout(() => setCard(null), 300); };
  // Grid (lines like CAD, dots, or none) and canvas height: this viewer's preferences.
  const [grid, setGrid] = useState<GridStyle>(() => {
    try { const g = localStorage.getItem('sld.grid'); return g === 'dots' || g === 'off' ? g : 'lines'; } catch { return 'lines'; }
  });
  const nextGrid = () => {
    const g: GridStyle = grid === 'lines' ? 'dots' : grid === 'dots' ? 'off' : 'lines';
    setGrid(g);
    try { localStorage.setItem('sld.grid', g); } catch { /* preference only */ }
  };
  const [height, setHeight] = useState<number | undefined>(() => {
    try { const h = Number(localStorage.getItem('sld.height')); return h >= 300 ? h : undefined; } catch { return undefined; }
  });
  const rootRef = useRef<HTMLDivElement>(null);
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = rootRef.current?.getBoundingClientRect().height ?? 500;
    let h = h0;
    const move = (ev: PointerEvent) => { h = Math.max(300, Math.min(4000, h0 + ev.clientY - y0)); setHeight(h); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { localStorage.setItem('sld.height', String(Math.round(h))); } catch { /* preference only */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  // Without a height of the user's own, the drawing takes the room left in the
  // scrolling page (after the toolbars above and the results tabs below), so a
  // collapsed ribbon or hidden banner gives it the space. Never below 420 px.
  const [autoHeight, setAutoHeight] = useState<number | undefined>();
  useLayoutEffect(() => {
    const el = rootRef.current, page = el?.closest<HTMLElement>('.mid');
    if (!resizable || fullScreen || height || !el || !page) { setAutoHeight(undefined); return; }
    const fit = () => {
      // Heights of everything else on the page (not positions: the results
      // drawer is pushed to the bottom by an auto margin).
      const er = el.getBoundingClientRect();
      let other = 0;
      for (const c of Array.from(page.children)) {
        const r = c.getBoundingClientRect(), cs = getComputedStyle(c);
        // An auto margin reads back as the gap it fills: count at most 16 px.
        const margins = (c.contains(el) ? 0 : Math.min(16, parseFloat(cs.marginTop) || 0)) + Math.min(16, parseFloat(cs.marginBottom) || 0);
        other += margins + (c.contains(el) ? r.height - er.height : r.height);
      }
      const h = Math.max(420, Math.floor(page.clientHeight - other - 12));
      setAutoHeight((o) => (o !== undefined && Math.abs(o - h) < 2 ? o : h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(page);
    for (const c of Array.from(page.children)) if (!c.contains(el)) ro.observe(c);
    return () => ro.disconnect();
  }, [resizable, fullScreen, height]);
  useEffect(() => {
    if (!fullScreen || !onToggleFullScreen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onToggleFullScreen(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [fullScreen, onToggleFullScreen]);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !lod) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [lod]);
  // Screen pixels per drawing unit (the viewBox is fitted with "meet").
  const pxAt = (v: ViewBox) => (box.w && box.h ? Math.min(box.w / v.w, box.h / v.h) : 1);
  const pxPerUnit = pxAt(vb);
  // Text detail: 'all' (the default) shows every label at every zoom, 'auto' follows the zoom (remembered).
  const [detail, setDetail] = useState<'auto' | 'all'>(() => { try { return localStorage.getItem('lvds.sldDetail') === 'auto' ? 'auto' : 'all'; } catch { return 'all'; } });
  const toggleDetail = () => setDetail((d) => { const v = d === 'auto' ? 'all' : 'auto'; try { localStorage.setItem('lvds.sldDetail', v); } catch { /* ignore */ } return v; });
  const lodAt = (px: number) => (!lod || detail === 'all' ? '' : px < 0.55 ? ' lod-far' : px < 0.8 ? ' lod-mid' : '');
  const lodFont = (px: number) => `${Math.min(22, 10 / px).toFixed(1)}px`;
  const lodLevel = lodAt(pxPerUnit);
  // On screen, squeeze any label wider than its slot so it can't run over the neighbouring feeder.
  useLayoutEffect(() => {
    svgRef.current?.querySelectorAll<SVGTextElement>('text[data-dxf-max-width], text[data-fit-width]').forEach((t) => {
      t.removeAttribute('textLength');
      const max = Number(t.getAttribute('data-dxf-max-width') ?? t.getAttribute('data-fit-width'));
      const w = t.getComputedTextLength?.() ?? 0;
      if (max > 0 && w > max) { t.setAttribute('textLength', String(max)); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
    });
  });
  const drag = useRef<{ px: number; py: number; vb: ViewBox; moved: boolean } | null>(null);

  const gridRef = useRef<SVGRectElement>(null);
  const zoomChips = useRef(new Set<() => void>());
  const subscribeZoom = useCallback((changed: () => void) => { zoomChips.current.add(changed); return () => { zoomChips.current.delete(changed); }; }, []);
  /** Puts the view on the page. Every move comes through here, as a draw writes only what changed since the last draw. */
  const showView = useCallback((v: ViewBox) => {
    view.current = v;
    svgRef.current?.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    const g = gridRef.current;
    if (g) { g.setAttribute('x', String(v.x - v.w * 2)); g.setAttribute('y', String(v.y - v.h * 2)); g.setAttribute('width', String(v.w * 5)); g.setAttribute('height', String(v.h * 5)); }
    zoomChips.current.forEach((changed) => changed());
  }, []);
  // A one-off move (Fit, the opening view, a re-fit, centring on a panel): the drawing follows at once.
  const setVb = useCallback((next: ViewBox | ((v: ViewBox) => ViewBox)) => {
    const was = view.current, v = typeof next === 'function' ? next(was) : next;
    if (v.x === was.x && v.y === was.y && v.w === was.w && v.h === was.h) return;
    showView(v);
    redraw();
  }, [showView]);
  const settle = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(settle.current), []);
  // A draw starts from the view as it is now, so it has nothing left to let go of.
  useLayoutEffect(() => clearTimeout(settle.current));
  // One zoom or pan step. It compares the view with this draw, so every draw replaces it (the wheel listener outlives draws).
  const step = useRef<(v: ViewBox) => void>(() => {});
  step.current = (v) => {
    showView(v);
    clearTimeout(settle.current);
    const px = pxAt(v), level = lodAt(px);
    // Draw again only for what the view cannot show as it stands: parts not drawn yet, or another level of detail.
    if ((cull && (v.x - VIEW_MARGIN < viewX1 || v.x + v.w + VIEW_MARGIN > viewX2)) || level !== lodLevel || (level === ' lod-far' && lodFont(px) !== lodFont(pxPerUnit))) { redraw(); return; }
    // Zoomed in on a large drawing: let go of what is far out of view, once when zooming stops, if that halves it.
    const drawnWidth = Math.min(W, viewX2) - Math.max(0, viewX1);
    if (cull && drawnWidth > 2 * Math.min(W, drawnSpan(v.w))) settle.current = setTimeout(redraw, SETTLE_MS);
  };
  const moveVb = useCallback((next: ViewBox | ((v: ViewBox) => ViewBox)) => step.current(typeof next === 'function' ? next(view.current) : next), []);

  // Re-fit when the network's overall size changes (boards/feeders added) only
  // while the whole drawing is in view: an edit keeps the user's zoom and
  // position. Another project always opens fitted.
  const fitted = useRef({ w: W, h: H, project: project.id });
  useEffect(() => {
    const was = fitted.current;
    fitted.current = { w: W, h: H, project: project.id };
    // The design canvas opens readable (below); other diagrams open fitted.
    setVb((v) => ((!resizable && was.project !== project.id) || (v.x === 0 && v.y === 0 && v.w === was.w && v.h === was.h) ? { x: 0, y: 0, w: W, h: H } : v));
  }, [W, H, project.id, resizable, setVb]);
  // The design canvas opens with readable text (at least 10 px), once per project, after its height has settled.
  const opened = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!resizable || opened.current === project.id || !el?.clientWidth || !el.clientHeight) return;
    if (!fullScreen && !height && autoHeight === undefined) return;
    opened.current = project.id;
    setVb(openingView(W, H, el.clientWidth, el.clientHeight, layout.roots[0]?.x));
  }, [resizable, project.id, fullScreen, height, autoHeight, W, H, layout.roots, setVb]);

  // Centre on a panel or circuit picked in the results below the drawing.
  const lastFocus = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!focus || focus.n === lastFocus.current) return;
    lastFocus.current = focus.n;
    const pt = focus.kind === 'board'
      ? layout.boards.find((n) => n.board.id === focus.id) && (() => { const n = layout.boards.find((m) => m.board.id === focus.id)!; return { x: n.x, y: n.busY - 30 }; })()
      : layout.feeders.find((n) => n.feeder.id === focus.id) && (() => { const n = layout.feeders.find((m) => m.feeder.id === focus.id)!; return { x: n.x, y: n.busY + 40 }; })();
    if (!pt) return;
    setVb((v) => { const w = Math.min(v.w, 1400), h = (w / v.w) * v.h; return { x: pt.x - w / 2, y: pt.y - h / 2, w, h }; });
  }, [focus, layout, setVb]);
  function zoom(factor: number, cx = view.current.x + view.current.w / 2, cy = view.current.y + view.current.h / 2) {
    moveVb((v) => {
      const w = Math.min(Math.max(v.w * factor, 200), layout.width * 3);
      const h = (w / v.w) * v.h;
      return { x: cx - ((cx - v.x) * w) / v.w, y: cy - ((cy - v.y) * h) / v.h, w, h };
    });
  }

  // Native (non-passive) wheel listener so the page doesn't scroll while zooming.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const w = wheelAction(e);
      moveVb((v) => {
        const scale = Math.max(v.w / r.width, v.h / r.height);
        if ('pan' in w) return { ...v, x: v.x + w.pan[0] * scale, y: v.y + w.pan[1] * scale };
        const cx = v.x + (e.clientX - r.left - (r.width - v.w / scale) / 2) * scale;
        const cy = v.y + (e.clientY - r.top - (r.height - v.h / scale) / 2) * scale;
        const nw = Math.min(Math.max(v.w / w.zoom, 200), layout.width * 3);
        const h = (nw / v.w) * v.h;
        return { x: cx - ((cx - v.x) * nw) / v.w, y: cy - ((cy - v.y) * h) / v.h, w: nw, h };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [layout.width, moveVb]);

  // Moving what's on the diagram: press on a load, board or incomer and drag
  // it to a busbar (reconnect) or onto another feeder (place before it).
  // Dragging the empty background still pans.
  const pick = useRef<{ item: MoveItem; label: string; px: number; py: number } | null>(null);
  const space = useSpaceHeld(); // Space + drag pans, even over a board
  const [moving, setMoving] = useState<{ label: string; x: number; y: number } | null>(null);
  const [cableEdit, setCableEdit] = useState<{ id: string; x: number; y: number; size: string; cores: string; length: string; runs: string; type: string } | null>(null);
  const lengthOk = (v: string) => /^\d*\.?\d+$/.test(v.trim().replace(',', '.')) && Number(v.trim().replace(',', '.')) > 0;
  const saveCable = () => {
    if (!cableEdit || !onPatchFeeder || !lengthOk(cableEdit.length)) return;
    // Only sizes from the cable table and 2/3/4 cores: anything else would break every calculation.
    if (!cables().some((c) => c.csaMm2 === Number(cableEdit.size)) || !['2', '3', '4'].includes(cableEdit.cores)) return;
    onPatchFeeder(cableEdit.id, { cableCsaMm2: Number(cableEdit.size), cores: Number(cableEdit.cores) as 2 | 3 | 4, lengthM: Number(cableEdit.length.trim().replace(',', '.')), parallel: Number(cableEdit.runs) > 1 ? Number(cableEdit.runs) : undefined, cableType: cableEdit.type || undefined });
    setCableEdit(null);
  };
  const startPick = (item: MoveItem, label: string) => (e: React.PointerEvent) => {
    if (!onMoveItem || tool === 'pan' || e.button !== 0 || space.current) return;
    pick.current = { item, label, px: e.clientX, py: e.clientY };
  };
  const targetAt = (x: number, y: number): { target: DropTarget; key: string } | undefined => {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop]');
    const key = el?.getAttribute('data-drop');
    if (!key) return undefined;
    const id = key.slice(key.indexOf(':') + 1);
    return { key, target: key.startsWith('bus:') ? { type: 'bus', boardId: id } : { type: 'feeder', feederId: id } };
  };

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { px: e.clientX, py: e.clientY, vb: view.current, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const pk = pick.current;
    const svg = svgRef.current;
    if (pk && svg) {
      if (!moving && Math.hypot(e.clientX - pk.px, e.clientY - pk.py) < 6) return;
      if (!moving) svg.setPointerCapture(e.pointerId);
      if (drag.current) drag.current.moved = true; // not a click
      const t = targetAt(e.clientX, e.clientY);
      const ok = t && canMove(project, pk.item, t.target) ? t.key : null;
      if (ok !== hover) setHover(ok);
      const ol = !ok && pk.item.kind === 'board' && onMoveToSheet ? outlineAt(e.clientX, e.clientY) ?? null : null;
      if (ol !== overOutline) setOverOutline(ol);
      const r = svg.parentElement!.getBoundingClientRect();
      setMoving({ label: pk.label, x: e.clientX - r.left, y: e.clientY - r.top });
      return;
    }
    const d = drag.current;
    if (!d && armed && onDropItem) {
      armHover(armed, e.clientX, e.clientY);
      return;
    }
    const el = svgRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) el.setPointerCapture(e.pointerId);
    d.moved = true;
    const r = el.getBoundingClientRect();
    const scale = Math.max(d.vb.w / r.width, d.vb.h / r.height);
    moveVb({ ...d.vb, x: d.vb.x - dx * scale, y: d.vb.y - dy * scale });
  }
  function onPointerUp(e: React.PointerEvent) {
    const pk = pick.current;
    pick.current = null;
    if (pk && moving) {
      const t = targetAt(e.clientX, e.clientY);
      setMoving(null);
      setHover(null);
      if (t && canMove(project, pk.item, t.target)) onMoveItem?.(pk.item, t.target);
      else if (pk.item.kind === 'board' && onMoveToSheet) { const sh = outlineAt(e.clientX, e.clientY); if (sh) onMoveToSheet(pk.item.id, sh); }
      setOverOutline(null);
    }
    // Keep the flag until the click event has fired, so a drag isn't a click.
    setTimeout(() => (drag.current = null), 0);
  }
  // Drag and drop: a busbar, a feeder or the empty canvas highlights while
  // an item that can go there is dragged over it.
  const [hover, setHover] = useState<string | null>(null);
  // Where along a busbar a new way would go: between the two feeders nearest the pointer.
  const [insertAt, setInsertAt] = useState<{ boardId: string; x: number; before?: string } | null>(null);
  const busInsert = (boardId: string, clientX: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return undefined;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = 0;
    const x = pt.matrixTransform(ctm.inverse()).x;
    const onBus = layout.feeders.filter((n) => n.feeder.boardId === boardId).sort((a, b) => a.x - b.x);
    const next = onBus.find((n) => n.x > x);
    const prev = [...onBus].reverse().find((n) => n.x <= x);
    const gx = next && prev ? (next.x + prev.x) / 2 : next ? next.x - LEAF_W / 2 : prev ? prev.x + LEAF_W / 2 : x;
    return { boardId, x: gx, before: next?.feeder.id };
  };
  const dnd = (target: DropTarget, key: string) =>
    onDropItem
      ? {
          onDragOver: (e: React.DragEvent) => {
            const item = getDragItem();
            if (!item) return;
            e.stopPropagation(); // the nearest target decides; never fall through to the canvas
            if (!canDrop(project, item, target)) {
              if (hover) setHover(null);
              return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (hover !== key) setHover(key);
            if (target.type === 'bus' && addsWay(item)) {
              const ins = busInsert(target.boardId, e.clientX);
              if (ins && (ins.boardId !== insertAt?.boardId || ins.before !== insertAt?.before)) setInsertAt(ins);
            } else if (insertAt) setInsertAt(null);
          },
          onDrop: (e: React.DragEvent) => {
            const item = getDragItem();
            if (!item) return;
            e.preventDefault();
            e.stopPropagation();
            setHover(null);
            setDragItem(null);
            const ins = target.type === 'bus' && addsWay(item) ? busInsert(target.boardId, e.clientX) : undefined;
            setInsertAt(null);
            onDropItem(item, ins?.before && target.type === 'bus' ? { ...target, before: ins.before } : target);
          }
        }
      : {};
  const dropCls = (key: string) => (hover === key ? ' drop-ok' : '');

  // Click to place: a palette item armed by a click goes where the drawing
  // is clicked next, with the same highlight and insert line as a drag.
  const armed = useSyncExternalStore(subscribeArmedItem, getArmedItem, getArmedItem);
  useEffect(() => subscribeArmedItem(() => { if (!getArmedItem()) { setHover(null); setInsertAt(null); } }), []);
  const armedAt = (item: PaletteItem, x: number, y: number) => {
    const t = targetAt(x, y) ?? { key: 'canvas', target: { type: 'canvas' } as DropTarget };
    if (!canDrop(project, item, t.target)) return null;
    const ins = t.target.type === 'bus' && addsWay(item) ? busInsert(t.target.boardId, x) : undefined;
    return { key: t.key, ins: ins ?? null, target: ins?.before && t.target.type === 'bus' ? { ...t.target, before: ins.before } : t.target };
  };
  function armHover(item: PaletteItem, x: number, y: number) {
    const a = armedAt(item, x, y);
    const key = a?.key ?? null;
    if (key !== hover) setHover(key);
    const ins = a?.ins ?? null;
    if (ins?.boardId !== insertAt?.boardId || ins?.before !== insertAt?.before) setInsertAt(ins);
  }
  function placeArmed(e: React.MouseEvent) {
    const item = getArmedItem();
    if (!item || !onDropItem || drag.current?.moved) return;
    e.stopPropagation(); // placing, not selecting what's under the pointer
    const a = armedAt(item, e.clientX, e.clientY);
    if (!a) return;
    setHover(null);
    setInsertAt(null);
    if (!e.shiftKey) setArmedItem(null); // shift-click places another
    onDropItem(item, a.target);
  }

  const click = (fn: () => void) => () => {
    if (!drag.current?.moved && tool !== 'pan') fn();
  };

  const main = layout.roots[0];

  return (
    <div
      ref={rootRef}
      data-doc-id="sld-canvas"
      className={`sysdiag ${tool === 'pan' ? 'pan' : ''}${armed && onDropItem ? ' armed' : ''}${dropCls('canvas')}${stale ? ' stale' : ''}${lodLevel}`}
      tabIndex={0}
      aria-label="Single line diagram. Plus and minus zoom, F or 0 fits, arrow keys pan, G changes the grid."
      onKeyDown={(e) => {
        // Keyboard zoom and pan while the drawing (or a board or circuit on it) has focus; not in text boxes or buttons.
        if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input,select,textarea,button,[contenteditable="true"]')) return;
        const k = viewKey(e);
        if (!k) return;
        e.preventDefault();
        if (k === 'in') zoom(1 / KEY_STEP);
        else if (k === 'out') zoom(KEY_STEP);
        else if (k === 'fit') setVb(full);
        else if (k === 'grid') nextGrid();
        else moveVb((v) => ({ ...v, x: v.x + k.pan[0] * v.w * PAN_STEP, y: v.y + k.pan[1] * v.h * PAN_STEP }));
      }}
      style={{ ...(resizable && !fullScreen && (height ?? autoHeight) ? { height: height ?? autoHeight } : {}), ...(lodLevel === ' lod-far' ? { '--lod-fs': lodFont(pxPerUnit) } : {}) } as CSSProperties}
    >
      <div className="sysdiag-tools" role="toolbar" aria-label="Diagram tools" data-doc-id="sld-display-tools">
        {(onDrawing || lod) && (
          <div className="sd-group" role="group" aria-label="Drawing">
            <span className="sd-cap">Drawing</span>
            {onDrawing && <button className="chip" onClick={() => onDrawing({ symbols: iec ? 'simple' : 'iec' })} title={iec ? 'IEC 60617 symbols — click for simple icons' : 'Simple icons — click for IEC 60617 symbols'}>{iec ? 'IEC' : 'Icons'}</button>}
            {onDrawing && <button className={`chip${dewa ? ' on' : ''}`} aria-pressed={dewa} onClick={() => onDrawing({ sldStyle: dewa ? 'standard' : undefined })} title="DEWA submission style: a frame around each panel with its summary (LOC, TCL, DF, MDL), way numbers and DEWA wording">DEWA</button>}
            {onDrawing && <button className={`chip${project.drawing?.cableLabels === 'ref' ? ' on' : ''}`} aria-pressed={project.drawing?.cableLabels === 'ref'} onClick={() => onDrawing({ cableLabels: project.drawing?.cableLabels === 'ref' ? undefined : 'ref' })} title="Cable text as reference numbers (CABLE SCHEDULE legend). Off: full description on screen; drawing sheets switch to numbers by themselves when crowded.">Cable no.</button>}
            {lod && <button className={`chip${detail === 'all' ? ' on' : ''}`} onClick={toggleDetail} aria-pressed={detail === 'all'}
              title={detail === 'auto' ? 'Text follows the zoom: names only when zoomed out, ratings and cables closer in. Click to always show all text.' : 'All text shown at every zoom. Click to let the text follow the zoom.'}>
              {detail === 'auto' ? 'Text: Auto' : 'Text: All'}
            </button>}
          </div>
        )}
        <div className="sd-group" role="group" aria-label="View">
          <span className="sd-cap">View</span>
          <button className="chip" onClick={nextGrid} title={`Grid: ${grid === 'lines' ? 'lines' : grid === 'dots' ? 'dots' : 'none'} — click for ${grid === 'lines' ? 'dots' : grid === 'dots' ? 'none' : 'lines'}`} aria-label={`Grid: ${grid}`}>
            {grid === 'lines' ? <Grid3x3 size={15} aria-hidden /> : grid === 'dots' ? <Grip size={15} aria-hidden /> : <Square size={15} aria-hidden />}
          </button>
          <button className="chip" onClick={() => zoom(1.25)} aria-label="Zoom out" title="Zoom out (−, or the mouse wheel)"><ZoomOut size={15} aria-hidden /></button>
          <button className="chip" onClick={() => zoom(1 / 1.25)} aria-label="Zoom in" title="Zoom in (+, or the mouse wheel)"><ZoomIn size={15} aria-hidden /></button>
          <button className="chip" onClick={() => setVb(full)} aria-label="Fit the drawing" title="Fit the whole drawing (F or 0, or double-click the wheel)"><Scan size={15} aria-hidden /></button>
          {onToggleFullScreen && <button className="chip" onClick={onToggleFullScreen} aria-label={fullScreen ? 'Exit full screen' : 'Full screen'} title={fullScreen ? 'Exit full screen (Esc)' : 'Full screen'}>{fullScreen ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}</button>}
        </div>
      </div>
      {lodLevel && (
        <div className="lod-hint" role="status">
          {lodLevel === ' lod-far' ? 'Zoomed out: names only' : 'Zoomed out: cables and results hidden'} — zoom in to see more, or
          <button className="linkish" onClick={toggleDetail}>show all text</button>
        </div>
      )}
      {resizable && !fullScreen && (
        <div className="sysdiag-resize" onPointerDown={startResize} onDoubleClick={() => { setHeight(undefined); try { localStorage.removeItem('sld.height'); } catch { /* ignore */ } }} title="Drag to make the drawing taller or shorter — double-click for the default height" />
      )}
      <svg
        ref={svgRef}
        data-w={W}
        data-h={H}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label={`Single line diagram of ${project.name}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
        onAuxClick={(e) => { if (isFitClick(e)) setVb(full); }}
        onPointerLeave={(e) => { onPointerUp(e); if (armed) { setHover(null); setInsertAt(null); } }}
        onClickCapture={placeArmed}
        {...dnd({ type: 'canvas' }, 'canvas')}
        onDragLeave={(e) => { if (!svgRef.current?.contains(e.relatedTarget as Node)) { setHover(null); setInsertAt(null); } }}
      >
        {/* Grid: in drawing units, so it pans and zooms with the drawing; not exported. */}
        {grid !== 'off' && (
          <g className="grid-bg" pointerEvents="none">
            <defs>
              <pattern id="sld-grid-minor" width="20" height="20" patternUnits="userSpaceOnUse">
                {grid === 'lines' ? <path d="M20 0H0V20" className="grid-minor" /> : <circle cx="0" cy="0" r="1.1" className="grid-dot" />}
              </pattern>
              <pattern id="sld-grid-major" width="100" height="100" patternUnits="userSpaceOnUse">
                <rect width="100" height="100" fill="url(#sld-grid-minor)" />
                {grid === 'lines' && <path d="M100 0H0V100" className="grid-major" />}
              </pattern>
            </defs>
            <rect ref={gridRef} x={vb.x - vb.w * 2} y={vb.y - vb.h * 2} width={vb.w * 5} height={vb.h * 5} fill="url(#sld-grid-major)" />
          </g>
        )}

        {/* Utility and transformers */}
        {main && layout.roots.some((r) => r.board.sourceKva) && (
          <g>
            <circle cx={layout.utilityX} cy="22" r="11" className="sym" />
            <path d={`M${layout.utilityX - 5} 22 q2.5 -6 5 0 t5 0`} className="ln" />
            <text className="b" x={layout.utilityX + 18} y="20">Utility</text>
            <text className="m" x={layout.utilityX + 18} y="34">11 kV</text>
            {layout.roots.length > 1 && (
              <line x1={layout.roots[0].x} y1="50" x2={layout.roots[layout.roots.length - 1].x} y2="50" className="ln mv" />
            )}
            <line x1={layout.utilityX} y1="33" x2={layout.utilityX} y2="50" className="ln mv" />
          </g>
        )}

        {/* RMUs: one box across the transformers each one feeds (11 kV side) */}
        {[...new Set(layout.roots.map((r) => r.board.rmu).filter((x): x is string => !!x))].map((rmu) => {
          const rs = layout.roots.filter((r) => r.board.rmu === rmu);
          const x1 = Math.min(...rs.map((r) => r.x)) - 34;
          const x2 = Math.max(...rs.map((r) => r.x)) + 34;
          return (
            <g key={`rmu-${rmu}`} className="rmu">
              <title>{`${rmu}: ring main unit feeding ${rs.map((r) => r.board.id).join(', ')}`}</title>
              <rect x={x1} y={41} width={x2 - x1} height={18} rx="3" className="sym rmu-box" />
              <text x={(x1 + x2) / 2} y={54} textAnchor="middle" className="b" style={{ fontSize: 10 }}>{rmu} · 11 kV</text>
            </g>
          );
        })}
        {layout.roots.map((r) => r.board.upstreamId ? (() => {
          // Part of the network (a study report's scope): the board is fed
          // from a board that isn't drawn.
          const inc = (calcProject ?? project).feeders.find((f) => f.feedsBoardId === r.board.id && f.boardId === r.board.upstreamId);
          return (
            <g key={`from-${r.board.id}`} className="from-up">
              <path d={`M${r.x - 7} 60 L${r.x} 72 L${r.x + 7} 60`} className="ln" />
              <line x1={r.x} y1="40" x2={r.x} y2={r.headY - 58} className="ln" />
              <text className="b" x={r.x + 14} y="46">From {r.board.upstreamId}{fromSheet?.[r.board.id] ? ` — sheet ${fromSheet[r.board.id]}` : ''}</text>
              {inc && <text className="m" x={r.x + 14} y="60">{inc.id}: {cableSizeText(inc)}, {inc.lengthM} m · {inc.breakerRatingA} A</text>}
            </g>
          );
        })() : !r.board.sourceKva && r.board.supply ? (
          <g key={`sup-${r.board.id}`} className="tx" data-lv-id={`board:${r.board.id}`} onDoubleClick={edit(onEditBoard, r.board.id)}>
            <title>Supply from the authority — double-click to edit</title>
            <rect x={r.x - 16} y={52} width={32} height={26} rx={3} className="sym" />
            <text className="b" x={r.x} y={69} textAnchor="middle" style={{ fontSize: 10 }}>kWh</text>
            <text className="b" x={r.x + 24} y="62">{r.board.supply.fedFrom ?? 'DEWA'} supply</text>
            {dewa ? (
              <>
                <text className="m" x={r.x + 24} y="76">METER CABINET{r.board.supply.ctRatio || r.board.protection?.ctRatio ? ` · CTM ${r.board.supply.ctRatio ?? r.board.protection?.ctRatio}` : ''}</text>
                {r.board.supply.ratingA && <text className="m" x={r.x + 24} y="90">{r.board.supply.ratingA}A TP {r.board.supply.device ?? 'MCCB'}{r.board.supply.faultKa ? ` ${r.board.supply.faultKa} kA` : ''}</text>}
                <text className="m" x={r.x + 24} y="104">CABLE BY {r.board.supply.fedFrom ?? 'DEWA'} · FED FROM {r.board.supply.fedFrom ?? 'DEWA'}</text>
              </>
            ) : <text className="m" x={r.x + 24} y="76">{r.board.supply.ratingA ? `${r.board.supply.ratingA} A ${r.board.supply.device ?? ''}` : 'meter cabinet'}{r.board.supply.meter ? ` · ${r.board.supply.meter} meter` : ''}</text>}
            <line x1={r.x} y1="34" x2={r.x} y2="52" className="ln" />
            <line x1={r.x} y1="78" x2={r.x} y2={r.headY - 58} className="ln" />
            <text className="m" x={r.x - 8} y={r.headY - 72} textAnchor="end">{project.voltageV} V</text>
          </g>
        ) : (
          <g key={`tx-${r.board.id}`} className={`tx${r.board.existing ? ' existing' : ''}`} data-lv-id={`board:${r.board.id}`} onDoubleClick={edit(onEditBoard, r.board.id)}>
            <title>Double-click to edit the transformer</title>
            <line x1={r.x} y1="50" x2={r.x} y2="78" className="ln mv" />
            <Sym id="tx" x={r.x} y={92} s={SYM_SCALE.load} />
            <text className="b" x={r.x + 24} y="86">{`${txTag(project, r.board.id) ?? 'Transformer'}${r.board.existing ? ' — EXISTING' : ''}`}</text>
            <text className="m" x={r.x + 24} y="100">
              {r.board.sourceKva ? `${r.board.sourceKva} kVA · ${r.board.sourceImpedancePct ?? '—'}% Z` : 'no source data'}
            </text>
            {r.board.sourceKva && <text className="m" x={r.x + 24} y="113">{r.board.vectorGroup ?? 'Dyn11'} · 11 / {(project.voltageV / 1000).toFixed(3)} kV</text>}
            {r.board.existing && recordedText(project, r.board) && <text className="m" x={r.x + 24} y="127">{recordedText(project, r.board)}</text>}
            <line x1={r.x} y1="106" x2={r.x} y2={r.headY - 58} className="ln" />
            <text className="m" x={r.x - 8} y={r.headY - (dewa ? 96 : protectionOf(r.board) ? 84 : 72)} textAnchor="end">{project.voltageV} V</text>
            {scenario?.outage?.failedId === r.board.id && (
              <g className="failed-tx">
                <line x1={r.x - 20} y1="68" x2={r.x + 20} y2="116" />
                <line x1={r.x + 20} y1="68" x2={r.x - 20} y2="116" />
                <text x={r.x + 24} y="114" className="res bad">FAILED</text>
              </g>
            )}
            {(() => {
              const t = scenario?.outage?.transformers.find((x) => x.boardId === r.board.id);
              if (!t) return null;
              return <text x={r.x + 24} y="114" className={`res ${t.loadingPct > 100 ? 'bad' : t.loadingPct > 80 ? 'warn' : 'ok'}`}>{fmtFixed(t.loadingPct, 0)}% loaded ({fmtFixed(t.demandKva, 0)} kVA)</text>;
            })()}
          </g>
        ))}

        {/* Main earthing: the transformer's neutral and body earths (separate pits, never joined) and
            the linked LV earth pits wired through a test link to the main board's MET. IEC 60364-5-54 / BS 7430. */}
        {layout.roots.map((r) => {
          const b = r.board;
          if (!hasEarthPits(b)) return null;
          const tx = !!b.sourceKva && !b.upstreamId; // own transformer (an authority supply has none to draw)
          const mm = earthConductorOf(project, b);
          // Pit count and electrode from the earthing plan unless this board sets its own.
          const lvIds = earthPits.get(`lv:${b.id}`);
          const pits = lvPitCount(b, earthPits);
          if (pits <= 0) return null;
          const el = b.earthing?.electrodeM ?? project.earthingPlan?.electrodeM ?? 3;
          const sp = b.earthing?.spacingM ?? 6;
          const ids = lvIds?.length === pits ? ` · ${lvIds.join(', ')}` : '';
          // Keep the LV earth detail above the panel header, clear of the instruments and
          // incomer annotations inside the panel. A framed DEWA panel keeps the original rows (the
          // frame head has the room). Unframed (standard style, or a DEWA main board with no
          // outgoing panels) the root bus drops (rootExtraY) and the detail takes its own band
          // between the transformer's earth labels (ending at y 150) and the incomer device, wholly
          // left of the incomer line (the layout leads the root by its width): notes under the
          // header, the test link at the right end, and the MET conductor dropping straight down
          // to a MET bar under the detail, left of the incomer column.
          const nb = nameBox(b, { ...r, busY: r.headY }), y1 = nb.top;
          const framed = dewa && !r.terminal;
          const oy = framed ? y1 - 82 : r.busY - 190;
          const detailW = framed ? nb.w : earthDetailWidth(project, b, pits, lvIds);
          const ox = framed ? r.busX1 - 2 : r.x - EARTH_DETAIL_GAP - detailW;
          // Unframed, the electrode note takes two lines: the link and pits sit one line lower.
          const pitTop = framed ? 22 : 50;
          const noteY = framed ? 65 : 18;
          const linkY = oy + (framed ? 16 : 45);
          const arrowY = oy + (framed ? 56 : 84);
          // Unframed, the test link stands left of the voltage label, and the last pit keeps clear of it.
          const testX = framed ? ox + detailW - 8 : r.x - EARTH_TL_IN;
          const pitPitch = pits > 1 ? Math.min(60, Math.max(24, (framed ? detailW - 28 : r.x - EARTH_PITS_IN - ox - 14) / (pits - 1))) : 0;
          const pitStart = pits > 1 ? ox + 14 : ox + Math.min(35, detailW / 2);
          const pitXs = Array.from({ length: pits }, (_, n) => pitStart + n * pitPitch);
          // MET: inside the main board frame, or (standard style and a DEWA main board with no
          // outgoing panels) under the detail, ending left of the incomer's result rows, and
          // dropped below the incomer's voltage label where it would run through it.
          const metX1 = framed ? r.busX1 - 7 + nb.w + 13 : r.x - 58;
          const voltY = b.upstreamId ? undefined : r.headY - (!b.sourceKva && b.supply ? 72 : dewa ? 96 : protectionOf(b) ? 84 : 72); // as drawn at the root's head
          const metAt = oy + 90;
          const metY = framed ? y1 + 20 : voltY !== undefined && metAt > voltY - 13 && metAt < voltY + 5 ? voltY + 10 : metAt;
          const metMid = metX1 + 25;
          const gnd = (x: number, y: number) => (
            <>
              <line x1={x - 7} y1={y} x2={x + 7} y2={y} className="ln" />
              <line x1={x - 4.5} y1={y + 3} x2={x + 4.5} y2={y + 3} className="ln" />
              <line x1={x - 2} y1={y + 6} x2={x + 2} y2={y + 6} className="ln" />
            </>
          );
          const rod = (x: number, top = oy + pitTop) => (
            <g key={x} className="earth-electrode">
              <rect x={x - 7} y={top} width="14" height="10" className="sym" />
              <line x1={x} y1={top + 5} x2={x} y2={top + 24} className="ln" />
              {gnd(x, top + 24)}
            </g>
          );
          const nIds = pitIds(`txn:${b.id}`), bIds = pitIds(`txb:${b.id}`);
          // A framed main board (DEWA, or a standard-style root panel): a vertical MET inside the frame
          // (DEWA: under the name box), and one
          // conductor per pit, evenly spaced along the MET, leaving the frame to its own test link
          // and turning down to its pit. The pits stand side by side outside the frame, on the left,
          // in the room the layout keeps there (earthLead), so the spacing reads horizontally.
          const column = earthLead.has(b.id);
          const lvDetail = () => {
            const fx = r.frame!.x1, fy = dewa ? y1 : r.busY - PLAIN_FRAME_TOP;
            const metX = fx + 12, metTop = dewa ? y1 + 27 + nb.rows.length * 11 : fy + 70, metBot = r.busY - 55;
            const shift = instrumentsOutside(r) ? INSTRUMENTS_OUT : 0;
            const px = (i: number) => fx - PIT_NEAR - shift - (pits - 1 - i) * PIT_PITCH;
            const ly = (i: number) => metTop + ((i + 1) * (metBot - metTop)) / (pits + 1);
            const top = r.busY - 46, arrowY = r.busY - 8;
            const colX = fx - earthLead.get(b.id)! + 6, colW = fx - 6 - colX;
            const chars = Math.floor(colW / 4.3);
            const notes = [...wrapText(`1C ${mm}mm² CU/PVC EACH`, chars, 2), ...wrapText(`MIN. ${el} m ELECTRODE WITH INSPECTION PIT AND COVER`, chars, 3)];
            return (
              <>
                <text x={colX} y={fy + 8} className="acc-t b" data-fit-width={colW} data-dxf-max-width={colW}>{`LV EARTH PITS (${pits} NO.)`}</text>
                {notes.map((t, i) => <text key={i} x={colX} y={fy + 19 + i * 9} className="acc-t" style={{ fontSize: 7.5 }} data-fit-width={colW} data-dxf-max-width={colW}>{t}</text>)}
                {pitXs.map((_, i) => {
                  const x = px(i), y = ly(i), tl = x + 17;
                  return (
                    <g key={`pit-${i}`}>
                      <path d={`M${metX} ${y} H${tl + 5}`} className="ln earth-to-met" />
                      <rect x={tl - 5} y={y - 4} width="10" height="8" className="sym test-link" />
                      <text x={tl} y={y + 12} textAnchor="middle" className="acc-t test-link-label" style={{ fontSize: 6.5 }}>{`TL${i + 1}`}</text>
                      <path d={`M${tl - 5} ${y} H${x} V${top}`} className="ln earth-pit-link" />
                      {rod(x, top)}
                      {lvIds?.length === pits && <text x={x - 10} y={top + 8} textAnchor="end" className="acc-t" style={{ fontSize: 7 }}>{lvIds[i]}</text>}
                    </g>
                  );
                })}
                {pits > 1 && (
                  <>
                    <line x1={px(0)} y1={arrowY} x2={px(pits - 1)} y2={arrowY} className="ln" />
                    <path d={`M${px(0)} ${arrowY} l5 -2.5 v5 z M${px(pits - 1)} ${arrowY} l-5 -2.5 v5 z`} className="dot" />
                    <text x={(px(0) + px(1)) / 2} y={arrowY - 3} textAnchor="middle" className="acc-t" style={{ fontSize: 7 }}>{sp.toFixed(1)} m (MIN)</text>
                  </>
                )}
                <line x1={metX} y1={metTop} x2={metX} y2={metBot} className="ln met-bar" />
                <text x={metX + 4} y={metTop + 7} className="acc-t b">MET</text>
              </>
            );
          };
          return (
            <g key={`earth-${b.id}`} className="acc earth-pit" data-board-id={b.id}>
              <title>{`${b.id} main earthing: ${pits} earth pits${ids}, ${el} m electrodes, min. ${sp} m apart, 1C ${mm} mm² Cu/PVC from the MET ${column ? 'to each pit through its own test link' : 'through the test link to the linked pits'}${tx ? '; transformer neutral to its own pit; tank / body earth bar to the RMU earth bar (RMU body-earth pits); neutral and body not interconnected' : ''}`}</title>
              {tx && (
                <g className="tx-earth">
                  {/* Neutral (star point) to its own pit, on the left */}
                  <circle cx={r.x - 14} cy={100} r="1.8" className="dot" />
                  <path d={`M${r.x - 14} 100 H${r.x - 36} V130`} className="ln" />
                  {gnd(r.x - 36, 130)}
                  <text x={r.x - 36} y={146} textAnchor="middle" className="acc-t" style={{ fontSize: 7 }}>{`N EARTH${nIds ? ` · ${nIds}` : ''}`}</text>
                  {/* Tank / body earth (via the RMU earth bar to the RMU pits unless it has its own), on the right under the rating text */}
                  <rect x={r.x - 18} y={67} width="36" height="51" className="ln interlock" fill="none" />
                  <path d={`M${r.x + 12} 118 V124 H${r.x + 44} V130`} className="ln" />
                  {gnd(r.x + 44, 130)}
                  <text x={r.x + 44} y={146} textAnchor="middle" className="acc-t" style={{ fontSize: 7 }}>{`BODY EARTH${bIds ? ` · ${bIds}` : ''}`}</text>
                </g>
              )}
              {column ? lvDetail() : (<>
              <text x={ox} y={oy + 8} className="acc-t b" data-fit-width={detailW} data-dxf-max-width={detailW}>{`LV EARTH PITS (${pits} NO.)${ids}`}</text>
              {/* Pits join at one test link. From the link to the MET there is one conductor and one 90° bend. */}
              {pitXs.map((x) => <line key={`pit-link-${x}`} x1={x} y1={oy + pitTop} x2={x} y2={linkY} className="ln" />)}
              {pitXs.length > 0 && <line x1={pitXs[0]} y1={linkY} x2={testX - 5} y2={linkY} className="ln earth-pit-link" />}
              <rect x={testX - 5} y={linkY - 4} width="10" height="8" className="sym test-link" />
              <text x={testX + (framed ? 9 : 4)} y={linkY + (framed ? 13 : 12)} className="acc-t test-link-label" style={{ fontSize: 7 }}>TL</text>
              <path d={framed ? `M${testX + 5} ${linkY} H${metMid} V${metY}` : `M${testX} ${linkY + 4} V${metY}`} className="ln earth-to-met" />
              {pitXs.map((x) => rod(x))}
              {pitXs.length > 1 && (
                <>
                  <line x1={pitXs[0]} y1={arrowY} x2={pitXs[pitXs.length - 1]} y2={arrowY} className="ln" />
                  <path d={`M${pitXs[0]} ${arrowY} l5 -2.5 v5 z M${pitXs[pitXs.length - 1]} ${arrowY} l-5 -2.5 v5 z`} className="dot" />
                  {/* Framed, the spacing reads above its line; unframed, below it, clear of the earth symbols (pits can stand 24 apart). */}
                  <text x={(pitXs[0] + pitXs[pitXs.length - 1]) / 2} y={framed ? arrowY - 2 : arrowY + 8} textAnchor="middle" className="acc-t" style={{ fontSize: 7 }}>{sp.toFixed(1)} m (MIN)</text>
                </>
              )}
              <text x={ox} y={oy + noteY} className="acc-t" style={{ fontSize: 7.5 }} data-fit-width={detailW} data-dxf-max-width={detailW}>1C {mm}mm² CU/PVC</text>
              {electrodeNote(el).map((t, i) => <text key={i} x={ox} y={oy + noteY + 9 * (i + 1)} className="acc-t" style={{ fontSize: 7.5 }} data-fit-width={detailW} data-dxf-max-width={detailW}>{t}</text>)}
              {/* Main earthing terminal in the main board */}
              <line x1={metX1} y1={metY} x2={metX1 + 50} y2={metY} className="ln met-bar" />
              {framed
                ? <text x={metX1 + 54} y={metY + 3} className="acc-t b">MET</text>
                : <text x={metX1 - 4} y={metY + 3} textAnchor="end" className="acc-t b">MET</text>}
              </>)}
            </g>
          );
        })}

        {/* Bus couplers between main boards: normally open (closed when a transformer is out) or normally closed (transformers in parallel) */}
        {(project.ties ?? []).map((t) => {
          const a = layout.roots.find((r) => r.board.id === t.a);
          const b = layout.roots.find((r) => r.board.id === t.b);
          if (!a || !b) return null;
          const [left, right] = a.x < b.x ? [a, b] : [b, a];
          const y = left.busY;
          const x1 = left.busX2;
          const x2 = right.busX1;
          // Clear of the right board's earth pits outside its frame (DEWA style).
          const mx = (x1 + x2 - (earthLead.has(right.board.id) ? earthLead.get(right.board.id)! + 7 : 0)) / 2;
          const run = scenario?.outage?.tie?.id === t.id ? scenario.outage.tie : undefined;
          const shut = !!run || !!t.closed;
          return (
            <g key={t.id} className={`tie${run ? ' closed' : ''}`} onClick={click(() => onEditTie?.(t.id))}>
              <title>{`${t.id}: bus coupler ${t.ratingA} A, ${run ? 'closed' : t.closed ? 'normally closed — transformers in parallel' : 'normally open'} — click to change or remove`}</title>
              <line x1={x1} y1={y} x2={mx - 9} y2={y} className="tie-ln" data-dxf-layer="BUSBAR" />
              <line x1={mx + 9} y1={y} x2={x2} y2={y} className="tie-ln" data-dxf-layer="BUSBAR" />
              <rect x={mx - 9} y={y - 9} width="18" height="18" rx="2" className="sym" />
              {shut ? <line x1={mx - 9} y1={y} x2={mx + 9} y2={y} className="ln" /> : <line x1={mx - 6} y1={y + 6} x2={mx + 6} y2={y - 6} className="ln" />}
              <text x={mx} y={y - 16} textAnchor="middle" className="b">{t.id} · {t.ratingA} A</text>
              <text x={mx} y={y + 24} textAnchor="middle" className={run ? `res ${run.loadingPct > 100 ? 'bad' : run.loadingPct > 85 ? 'warn' : 'ok'}` : 'm'}>
                {run ? `CLOSED · ${fmtFixed(run.currentA, 0)} A (${fmtFixed(run.loadingPct, 0)}%)` : t.closed ? 'N/C' : 'N/O'}
              </text>
            </g>
          );
        })}

        {/* Spares (breaker, nothing connected) and spaces (empty way) on a panel's busbar */}
        {layout.spares.map((n) => {
          if (cull && (n.x < viewX1 || n.x > viewX2)) return null;
          const w = n.way, y = n.busY;
          const poles = sparePoles(w);
          if (w.kind === 'space') return (
            <g key={`${n.boardId}:${w.id}`} className={`spare-way${off(n.boardId) ? ' off' : ''}`}>
              <title>{`${n.boardId}: space (empty way, no breaker) — add or delete it on the panel's schedule`}</title>
              <line x1={n.x} y1={y} x2={n.x} y2={y + 34} className="ln space-ln" />
              <text x={n.x + 10} y={y + 26} className="b">SPACE</text>
              <text x={n.x + 10} y={y + 39} className="acc-t">{poles} · no breaker</text>
            </g>
          );
          const board = project.boards.find((b) => b.id === n.boardId)!;
          const f = spareBreaker(board, w);
          return (
            <g key={`${n.boardId}:${w.id}`} className={`spare-way${off(n.boardId) ? ' off' : ''}`}>
              <title>{`${n.boardId}: spare ${w.ratingA} A ${poles} breaker (nothing connected) — edit or delete it on the panel's schedule`}</title>
              <line x1={n.x} y1={y} x2={n.x} y2={y + 18} className="ln" />
              {iec ? <SwitchSym x={n.x} y={y + 18} kind={switchKindOf(f)} /> : <rect x={n.x - 6} y={y + 18} width="12" height="16" className="sym" />}
              {!iec && <line x1={n.x - 5} y1={y + 32} x2={n.x + 5} y2={y + 20} className="ln" />}
              <line x1={n.x} y1={y + 34} x2={n.x} y2={y + 46} className="ln" />
              <text className={dewa ? 'dev' : 'b'} x={n.x + 10} y={y + 28}>{spareText(w)}</text>
              <text x={n.x + 10} y={y + 42} className="b">SPARE</text>
            </g>
          );
        })}

        {/* Feeders: breaker, cable, then a load or a drop to a sub-board */}
        {layout.feeders.map((n) => {
          if (cull && (n.x < viewX1 || n.x > viewX2)) return null;
          const f = n.feeder;
          const r = byFeeder.get(f.id);
          const status = r?.status ?? 'ok';
          const sel = f.id === selectedFeederId;
          const y = n.busY;
          const endY = n.childBoardId ? (headOf.get(n.childBoardId) ?? y + layout.levelH) - 58 : y + 76;
          const tagY = dewa ? 16 : 0; // DEWA: cable text takes two lines
          const cadSlot = cadSlots.get(f.id) ?? LEAF_W;
          const cadCableDx = f.kwhMeter && !n.childBoardId ? (f.kwhMeter === 'CT' ? 50 : 35) : 0;
          const cadCableWidth = Math.max(1, cadSlot - (cableRefs ? 26 : 12) - 7 - cadCableDx);
          const cadDeviceWidth = Math.max(1, cadSlot - 26);
          const cable = cableLines(project, f, cableRefs);
          return (
            <g
              key={f.id}
              className={`fd ${sel ? 'sel' : ''}${dropCls(`fd:${f.id}`)}${off(f.boardId) ? ' off' : ''}${f.existing ? ' existing' : ''}`}
              onMouseEnter={showCard('feeder', f.id)}
              onMouseLeave={leaveCard}
              {...dnd({ type: 'feeder', feederId: f.id }, `fd:${f.id}`)}
              data-drop={`fd:${f.id}`}
              data-lv-id={`feeder:${f.id}`}
              onPointerDown={startPick(n.childBoardId ? { kind: 'board', id: n.childBoardId } : { kind: 'feeder', id: f.id }, n.childBoardId ?? f.name ?? f.id)}
              onClick={click(() => onSelectFeeder(f.id))}
              onDoubleClick={edit(onEditFeeder, f.id)}
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' ? onSelectFeeder(f.id) : e.key === 'F2' && edit(onEditFeeder, f.id)())}
            >
              <title>{`${f.id} — double-click to edit`}</title>
              <line x1={n.x} y1={y} x2={n.x} y2={y + 18} className="ln" />
              {iec ? <FeederSwitchSym x={n.x} y={y + 18} f={f} /> : <rect x={n.x - 6} y={y + 18} width="12" height="16" className="sym" />}
              {chain?.has(f.id) && (
                <rect x={n.x - 11} y={y + 13} width="22" height="26" rx="4" className={`disc-ring ${chain.get(f.id)}`}>
                  <title>{`Discrimination: ${chain.get(f.id) === 'ok' ? 'selective' : chain.get(f.id) === 'warn' ? 'partial' : 'not selective'}`}</title>
                </rect>
              )}
              {!iec && <line x1={n.x - 5} y1={y + 32} x2={n.x + 5} y2={y + 20} className="ln" />}
              {dewa ? <text x={n.x + 10} y={y + 37} className="dev-k" data-dxf-max-width={cadDeviceWidth}>{icuText(f)}</text>
                : iec && <text x={n.x + 10} y={y + 41} className="acc-t" data-dxf-max-width={cadDeviceWidth}>{polesText(f)} · {f.breakerIcuKa} kA</text>}
              {dewa && <text x={n.x - 5} y={y + 13} textAnchor="end" className="acc-t way-no">{wayNo.get(f.id)}</text>}
              <line x1={n.x} y1={y + 34} x2={n.x} y2={endY} className={`ln ${status !== 'ok' ? status : ''}${cableTypeOf(project, f).fireRated ? ' fr' : ''}`}
                style={feederHeat(f.id) ? { stroke: feederHeat(f.id), strokeWidth: 3.5 } : undefined} />
              {dewa ? <text className="dev" x={n.x + 10} y={y + 26} data-dxf-max-width={cadDeviceWidth}>{breakerText(f)}</text>
                : <text className="b" x={n.x + 10} y={y + 30} data-dxf-max-width={cadDeviceWidth}>{f.breakerRatingA} A{f.rcdMa ? <tspan className="acc-t"> · {f.rcdMa} mA</tspan> : null}</text>}
              <text
                className={`${dewa ? 'acc-t' : 'm'}${onPatchFeeder ? ' cable-lbl' : ''}`}
                style={dewa ? { fontSize: 9 } : undefined}
                x={n.x + 7}
                y={y + (dewa ? 60 : 52)}
                data-dxf-max-width={cadCableWidth}
                data-dxf-dy={dewa ? 3 : 0}
                data-dxf-dx={cadCableDx}
                onPointerDown={(e) => onPatchFeeder && e.stopPropagation()}
                onClick={(e) => {
                  if (!onPatchFeeder || tool === 'pan') return;
                  e.stopPropagation();
                  const r = svgRef.current!.parentElement!.getBoundingClientRect();
                  setCableEdit({ id: f.id, x: e.clientX - r.left, y: e.clientY - r.top, size: String(f.cableCsaMm2), cores: String(f.cores), length: String(f.lengthM), runs: String(runsOf(f)), type: f.cableType ?? '' });
                }}
              >
                {onPatchFeeder && <title>Click to change the cable</title>}
                {cableRefs || dewa ? cable[0]
                  : <>{runsOf(f) > 1 ? `${runsOf(f)}×` : ''}{f.cores}C × {f.cableCsaMm2}mm²{(() => { const c = labelCode(project, f); return c ? ` ${c}` : ''; })()} · {f.lengthM}m</>}
                {fireRatedWarning(project, f) && <tspan className="res warn"> ⚠ FR</tspan>}
              </text>
              {cableRefs && (() => { const r = cableRefOf(project, f); return (
                <g className="cable-ref"><title>{`Cable ${r.ref}: ${r.text}`}</title>
                  <circle cx={n.x - 13} cy={y + (dewa ? 66 : 49)} r="7.5" className="cable-ref-c" />
                  <text x={n.x - 13} y={y + (dewa ? 69 : 52)} textAnchor="middle" className="cable-ref-t">{r.ref}</text>
                  <text x={n.x + 7} y={y + (dewa ? 68 : 63)} className="acc-t" style={{ fontSize: 8 }} data-dxf-max-width={cadCableWidth} data-dxf-dx={cadCableDx}>{cable[1]}</text>
                </g>); })()}
              {dewa && !cableRefs && <text className="acc-t" style={{ fontSize: 9 }} x={n.x + 7} y={y + 70} data-dxf-max-width={cadCableWidth} data-dxf-dy={3} data-dxf-dx={cadCableDx}>{cable[1]}</text>}
              {/* Accessories on the feeder, top to bottom: earth leakage (its
                  rating goes with the breaker's), metering on the right below
                  the cable text, local isolator just above the load. */}
              {(() => {
                // Boxed devices on the feeder, to the left of the line (the cable text is on the right).
                const dev = sldDevices(f);
                // One compact column left of the line, top to bottom (cable-reference circles sit close in, so shift out).
                const shiftX = cableRefs ? 12 : 0;
                const box = (i: number, label: string, key: string) => {
                  const by = y + 21 + i * 12; // beside the breaker, clear of the panel frame's gland line
                  const w = label.length * 5.2 + 6;
                  const x1 = n.x - 8 - shiftX;
                  return (
                    <g className="acc" data-dxf-layer="DEVICE" key={key}>
                      <line x1={x1} y1={by + 5.5} x2={n.x} y2={by + 5.5} className="ln" />
                      <rect x={x1 - w} y={by} width={w} height="11" className="sym" />
                      <text x={x1 - w / 2} y={by + 8.5} textAnchor="middle" className="acc-t b" style={{ fontSize: 7.5 }}>{label}</text>
                    </g>
                  );
                };
                // IEC: an RCBO / RCCB is drawn in the breaker slot, and the starter
                // as its library symbol at the foot of the column.
                const elcb = dev.elcb && !(iec && rcdInSwitch(f)) ? dev.elcb : undefined;
                const starter = dev.starterType && !n.childBoardId ? dev.starterType : undefined;
                // IEC: library symbols at the foot of the column, 18 apart: the undervoltage relay, then the starter. A starter's
                // box hangs below the breaker, linked to the cable under it, clear of the breaker's blade.
                const foot: SymbolId[] = iec ? [...(dev.extras.includes('UVR') ? ['uvr' as const] : []), ...(starter ? [starterSymbolOf(starter)] : [])] : [];
                const items: { key: string; label: string }[] = [];
                if (elcb) items.push({ key: 'elcb', label: elcb.label });
                if (starter && !iec) items.push({ key: 'starter', label: dev.starter! });
                for (const e of dev.extras) if (!(iec && e === 'UVR')) items.push({ key: e, label: e });
                const sy = y + 28.5 + items.length * 12;
                return (
                  <>
                    {items.map((it, i) => box(i, it.label, it.key))}
                    {foot.map((id, i) => {
                      const s = besideScaleOf(id, SYM_SCALE.device);
                      const fy = s === SYM_SCALE.device ? sy + i * 18 : Math.max(sy + i * 18, y + STARTER_DY);
                      return (
                        <g key={id} className="acc" data-dxf-layer="DEVICE">
                          <line x1={n.x - 8 - shiftX} y1={fy} x2={n.x} y2={fy} className="ln" />
                          <Sym id={id} x={n.x - 8 - shiftX - (SYM_BOX.w / 2) * s} y={fy} s={s} />
                        </g>
                      );
                    })}
                    {elcb && (
                      <g className="acc">
                        <title>{`Earth leakage protection${elcb.ma ? ` ${elcb.ma} mA` : ''}`}</title>
                        {/* IEC: the library RCD (its toroid) on the cable below the breaker; the box names the device. */}
                        {iec ? <Sym id="rcd" x={n.x} y={y + 42} s={SYM_SCALE.device} />
                          : <ellipse cx={n.x - 8 - shiftX - elcb.label.length * 5.2 - 6 - 5} cy={y + 26.5} rx="4.5" ry="2.2" className="sym-ln" />}
                        {elcb.ma ? <text x={n.x - 8 - shiftX} y={y + 19} textAnchor="end" className="acc-t" style={{ fontSize: 7 }}>{elcb.ma}mA</text> : null}
                      </g>
                    )}
                  </>
                );
              })()}
              {f.kwhMeter && (() => {
                // Sub-board incomers: below their result labels.
                const my = n.childBoardId ? y + 128 + tagY : y + 62;
                return (
                <g className="acc">
                  <title>{f.kwhMeter === 'CT' ? 'CT-operated kWh meter' : `${f.kwhMeter} direct kWh meter`}</title>
                  {f.kwhMeter === 'CT' && <Sym id="ct" x={n.x} y={my} s={SYM_SCALE.device} />}
                  <line x1={n.x + (f.kwhMeter === 'CT' ? 7 : 0)} y1={my} x2={n.x + 10} y2={my} className="ln" style={f.kwhMeter === 'CT' ? { strokeDasharray: '2 1.5' } : undefined} />
                  <Sym id="kwh" x={n.x + 17} y={my} s={SYM_SCALE.device} />
                  {f.kwhMeter === 'CT' && <text x={n.x + 27} y={my + 3} className="acc-t">CT</text>}
                </g>
                );
              })()}
              {f.localIsolator && !n.childBoardId && (
                <g className="acc">
                  <title>Local isolator at the equipment</title>
                  <rect x={n.x - 4} y={y + 66} width="8" height="9" className="bg-fill" />
                  <circle cx={n.x} cy={y + 67} r="1.6" className="dot" />
                  <line x1={n.x} y1={y + 75} x2={n.x - 7} y2={y + 67} className="ln" />
                  {dewa ? <text x={n.x + 10} y={y + 79} className="acc-t" style={{ fontSize: 9 }} data-dxf-max-width={cadDeviceWidth}>{isolatorText(f)}</text> : <text x={n.x - 9} y={y + 74} textAnchor="end" className="acc-t">ISO</text>}
                </g>
              )}
              {!n.childBoardId && (() => {
                // A sub-board drawn as one box: the panel symbol in the load's slot, with the board's name and demand.
                const panel = n.panelBoardId ? project.boards.find((b) => b.id === n.panelBoardId) : undefined;
                const sym = panel && panelSymbolOf(project, panel);
                return (
                <>
                  {panel && sym ? (
                    <>
                      <line x1={n.x} y1={y + 76} x2={n.x} y2={y + 80} className="ln" />
                      <g className="sched" onDoubleClick={(e) => { e.stopPropagation(); edit(onOpenSchedule, panel.id)(); }}>
                        <title>{`${panel.id}: its final circuits are on the load schedule — double-click to open it`}</title>
                        <Sym id={sym} x={n.x} y={y + 94} s={SYM_SCALE.load} />
                      </g>
                    </>
                  ) : iec ? (
                    <>
                      <line x1={n.x} y1={y + 76} x2={n.x} y2={y + 84} className="ln" />
                      <LoadSym x={n.x} y={y + 94} type={loadTypeOf(f)} motor={isMotor(f)} fireFighting={loadTypeOf(f) === 'fire-pump'} />
                    </>
                  ) : (
                    <>
                      <circle cx={n.x} cy={y + 94} r="18" className={`load ${status}`} />
                      <g transform={`translate(${n.x} ${y + 94})`} className={`icon ${status}`}>
                        <LoadIcon type={loadTypeOf(f)} />
                      </g>
                    </>
                  )}
                  <text className="b lod-name" x={n.x} y={y + 132} textAnchor="middle" data-fit-width={cadSlot - 6}>{trunc(panel?.id ?? f.id, 16)}</text>
                  <text className="m" x={n.x} y={y + 146} textAnchor="middle">{trunc(panel ? panel.name : f.name, 19)}</text>
                  <text x={n.x} y={y + 160} textAnchor="middle" data-fit-width={cadSlot - 6}>
                    {panel ? (() => { const p = panelSummary(project, panel); return `TCL ${fmtFixed(p.tclKw, 2)} · MDL ${fmtFixed(p.mdlKw, 2)} kW`; })() : f.componentId && project.components?.some((c) => c.id === f.componentId) ? trunc(componentLabel(project, project.components!.find((c) => c.id === f.componentId)!, f), 30) : f.kvar ? `${f.capSteps && f.capSteps > 1 ? `${f.capSteps} × ${+(f.kvar / f.capSteps).toFixed(1)}` : f.kvar} kvar${f.detunedPct ? ` · ${f.detunedPct}% det.` : ''}` : `${dewa && !f.generation ? `TCL : ${fmtFixed(f.loadKw, 2)}` : fmtFixed(f.loadKw * f.demandFactor, 0)} kW${f.generation ? ' gen' : ''}${isMotor(f) ? ` · ${starterInfo(starterOf(f)).short}` : ''}`}
                    {!layers?.current && !panel && ` · ${r ? fmtFixed(r.ib, 0) : '–'} A`}
                  </text>
                  {feederTags(f.id).map((t, i) => (
                    <text key={t.text} x={n.x} y={y + 177 + i * 13} textAnchor="middle" className={`res ${t.cls}`}>{t.text}</text>
                  ))}
                  <circle cx={n.x + 22} cy={y + 78} r="4" className="status-dot" style={{ fill: `var(--${status})` }} />
                </>
                );
              })()}
              {n.childBoardId &&
                feederTags(f.id).map((t, i) => (
                  <text key={t.text} x={n.x + 7} y={y + 72 + tagY + i * 13} className={`res ${t.cls}`}>{t.text}</text>
                ))}
              {sel && <rect x={n.x - 60} y={y + 8} width="120" height={n.childBoardId ? 50 : 160} rx="8" className="sel-ring" />}
            </g>
          );
        })}

        {/* Boards: box on the incoming line, then the busbar */}
        {layout.boards.map((real) => {
          if (real.boxed) return null; // drawn as a panel box on its feeder
          if (cull && (real.busX2 < viewX1 || real.busX1 > viewX2)) return null;
          // Everything above the incomer hangs from the head (the busbar, or higher on a mains /
          // generator changeover); the busbar, its label and what is on it stay on the real busbar.
          const n = real.headY === real.busY ? real : { ...real, busY: real.headY };
          const b = n.board;
          const s = summaries.get(b.id)!;
          const status = worst([s.loadingStatus, ...(feedersOn.get(b.id) ?? []).map((f) => byFeeder.get(f.id)?.status)]);
          const sel = b.id === selectedBoardId;
          const kw = n.circuits.reduce((sum, f) => sum + f.loadKw * f.demandFactor, 0);
          const ph = boardPhaseKw({ ...project, feeders: n.circuits }, b.id);
          const failing = n.circuits.filter((f) => byFeeder.get(f.id)?.status !== 'ok').length;
          const circuitTags: Tag[] = n.circuits.length
            ? [
                { text: `${n.circuits.length} circuits${dbSpareText(b)} · ${fmtFixed(kw, 1)} kW`, cls: 'b' },
                { text: `R ${fmtFixed(ph.R, 1)} · Y ${fmtFixed(ph.Y, 1)} · B ${fmtFixed(ph.B, 1)} kW`, cls: 'm' },
                ...(failing ? [{ text: `${failing} circuit${failing > 1 ? 's' : ''} to check`, cls: status }] : [])
              ]
            : [];
          return (
            <g
              key={b.id}
              className={`bd ${sel ? 'sel' : ''}${dropCls(`bus:${b.id}`)}${off(b.id) ? ' off' : ''}${b.existing ? ' existing' : ''}`}
              onMouseEnter={showCard('board', b.id)}
              onMouseLeave={leaveCard}
              {...dnd({ type: 'bus', boardId: b.id }, `bus:${b.id}`)}
              data-drop={`bus:${b.id}`}
              data-lv-id={`board:${b.id}`}
              onPointerDown={startPick({ kind: 'board', id: b.id }, b.id)}
              onClick={click(() => onSelectBoard(b.id))}
              onDoubleClick={edit(onEditBoard, b.id)}
              tabIndex={0}
              onKeyDown={(e) => (e.key === 'Enter' ? onSelectBoard(b.id) : e.key === 'F2' && edit(onEditBoard, b.id)())}
            >
              <title>{`${b.id} — double-click to edit`}</title>
              {!n.terminal && <line x1={n.busX1} y1={real.busY} x2={n.busX2} y2={real.busY} className={`bus ${sel ? 'sel' : ''}`}
                style={boardHeat(b.id) ? { stroke: boardHeat(b.id) } : undefined} />}
              {/* Wide invisible band along the busbar, so drops don't need pixel precision. */}
              {onDropItem && <line x1={n.busX1 - 20} y1={real.busY} x2={n.busX2 + 20} y2={real.busY} className="bus-hit" />}
              {!n.terminal && <line x1={n.x} y1={n.busY - 22} x2={n.x} y2={n.busY} className="ln" />}
              {b.standby && isInterlocked(b) && real.genX !== undefined && (() => {
                // Mains and generator incomers into the busbar, each with its own breaker and
                // instruments, electro-mechanically interlocked (DEWA submission drawings).
                const k = changeoverBreakers(project, b)!;
                const g = scenario?.generators.find((x) => x.boardId === b.id);
                return (
                  <>
                    <ChangeoverIncomers x={n.x} genX={real.genX} headY={real.headY} busY={real.busY} kva={b.standby.kva}
                      mains={k.mains} generator={k.generator} instruments={hasInstruments(b)} pmu={!!b.pmu} spd={b.spd} />
                    {g && (
                      <>
                        <circle cx={real.genX} cy={real.headY - 40} r="14" className="gen-live" />
                        <text x={real.genX + 15} y={real.headY - 56} className={`res ${g.loadingPct > 100 ? 'bad' : g.loadingPct > 80 ? 'warn' : 'ok'}`}>ON · {fmtFixed(g.loadingPct, 0)}% loaded</text>
                        {g.largestMotor && (
                          <text x={real.genX + 15} y={real.headY - 70} className={`res ${g.largestMotor.dipPct > MOTOR_START_DIP_LIMIT_PCT ? 'bad' : 'ok'}`}>
                            {g.largestMotor.feeder.name || g.largestMotor.feeder.id} start: dip {fmtFixed(g.largestMotor.dipPct, 0)}%
                          </text>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
              {b.standby && !isInterlocked(b) && (() => {
                // ATS: one box on the incoming line, its rating and type beside it; the generator to its right.
                const gx = n.x + 45;
                const gy = n.busY - 80;
                const g = scenario?.generators.find((x) => x.boardId === b.id);
                const cls = g ? (g.loadingPct > 100 ? 'bad' : g.loadingPct > 80 ? 'warn' : 'ok') : '';
                const m = g?.largestMotor;
                const ats = atsOf(project, b)!;
                return (
                  <g className="standby">
                    <title>{`Standby generator ${b.standby.kva} kVA through an ${atsLines(ats).join(', ')} — everything on ${b.id} is essential load`}</title>
                    {/* Changeover switch (library ats): mains (N) to the left contact, generator (E) to the right one,
                        the common contact down to the board. The incoming line is masked behind it. */}
                    <rect x={n.x - 8} y={n.busY - 93} width="16" height="21" className="bg-fill" />
                    <path d={`M${n.x} ${n.busY - 93} V${n.busY - 91} H${n.x - 6} V${n.busY - 88}`} className="ln" />
                    <Sym id="ats" x={n.x} y={n.busY - 80} s={SYM_SCALE.device} />
                    {/* The ATS rating and type above the generator, right of the line (the panel's name box is on the left). */}
                    <text x={n.x - 9} y={n.busY - 90} textAnchor="end" className="acc-t">N</text>
                    <text x={n.x + 14} y={n.busY - 94} className="acc-t">E</text>
                    {atsLines(ats).map((t, i) => (
                      <text key={t} x={n.x + 14} y={n.busY - 136 + i * 11} className={i ? 'dev-k' : 'dev'}>{t}</text>
                    ))}
                    <path d={`M${gx - 12.25} ${gy} H${n.x + 12} V${n.busY - 91} H${n.x + 6} V${n.busY - 88}`} className="ln" />
                    <Sym id="gen" x={gx} y={gy} s={SYM_SCALE.load} />
                    <text x={gx + 15} y={gy + 3} className="m">{b.standby.kva} kVA</text>
                    {g && (
                      <>
                        <circle cx={gx} cy={gy} r="14" className="gen-live" />
                        <text x={gx + 15} y={gy - 10} className={`res ${cls}`}>ON · {fmtFixed(g.loadingPct, 0)}% loaded</text>
                        {m && (
                          <text x={gx + 15} y={gy + 16} className={`res ${m.dipPct > MOTOR_START_DIP_LIMIT_PCT ? 'bad' : 'ok'}`}>
                            {m.feeder.name || m.feeder.id} start: dip {fmtFixed(m.dipPct, 0)}%
                          </text>
                        )}
                      </>
                    )}
                  </g>
                );
              })()}
              {(() => {
                // Incomer CT, long-time setting and protection relays.
                const p = protectionOf(b);
                if (!p) return null;
                const cy = n.busY - 66;
                const txt = [p.ctRatio && `CT ${p.ctRatio}`, p.irSetting && `Ir ${p.irSetting}×In`, ...(p.relays ?? [])].filter(Boolean).join(' · ');
                const cap = p.apfc ? layout.feeders.find((x) => x.feeder.boardId === b.id && loadTypeOf(x.feeder) === 'capacitor') : undefined;
                return (
                  <g className="acc">
                    <title>{`Incomer: ${txt}${p.apfc ? ' · APFC relay CT' : ''}`}</title>
                    <circle cx={n.x} cy={cy} r="4.5" className="sym-ln" />
                    <line x1={n.x - 4.5} y1={cy} x2={n.x - 14} y2={cy} className="ln" style={{ strokeDasharray: '2 1.5' }} />
                    <text x={n.x - 16} y={cy + 3} textAnchor="end" className="acc-t">{txt}</text>
                    {cap && (
                      <>
                        <path d={`M${n.x + 4.5} ${cy} H${cap.x - 22} V${real.busY + 19.5}`} className="ln interlock" />
                        <Sym id="pfrelay" x={cap.x - 22} y={real.busY + 27.5} s={SYM_SCALE.device} />
                      </>
                    )}
                  </g>
                );
              })()}
              {b.kind === 'UPS' && (
                <g>
                  <title>{`UPS ${b.upsKva ?? '—'} kVA`}</title>
                  <rect x={n.x - 15} y={n.busY - 118} width="30" height="17" rx="2" className="sym" />
                  <text x={n.x} y={n.busY - 106} textAnchor="middle" className="b" style={{ fontSize: 9 }}>UPS</text>
                </g>
              )}
              {dewa && !n.terminal && (() => {
                // Panel frame: busbar, outgoing ways and incomer; cables cross it at a gland mark.
                // The panel's name box sits just inside the frame's top-left corner: name, TCL, MDL, location and
                // the prospective fault level at the board (the breaker's own Icu is on the incomer line).
                const { x1, x2 } = real.frame!, y2 = real.busY + 47;
                const nb = nameBox(b, n);
                const y1 = nb.top;
                const gland = (x: number, gy: number) => <path key={`${x}-${gy}`} d={`M${x - 5} ${gy - 4} q3 4 0 8 M${x + 5} ${gy - 4} q-3 4 0 8`} className="ln" />;
                const outs = layout.feeders.filter((f) => f.feeder.boardId === b.id);
                const { sm, rows } = nb;
                return (
                  <g className="panel-frame">
                    <title>{`${b.id}: TCL ${fmtFixed(sm.tclKw, 2)} kW × DF ${sm.df.toFixed(2)} = MDL ${fmtFixed(sm.mdlKw, 2)} kW · ${boardLocation(project, b) || 'location not set'}`}</title>
                    <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} className="frame-ln" />
                    {gland(n.x, y1)}
                    <rect x={x1 + 5} y={y1 + 5} width={nb.w} height={18 + rows.length * 11} className="sum-box" style={sel ? { stroke: 'var(--acc)', strokeWidth: 2 } : undefined} />
                    <text x={x1 + 11} y={y1 + 18} className="acc-t b lod-name">{trunc(b.id, Math.floor((nb.w - 12) / 5.5))}</text>
                    {rows.map((t, i) => <text key={i} x={x1 + 11} y={y1 + 29 + i * 11} className="acc-t" data-dxf-max-width={nb.w - 12} xmlSpace="preserve">{t}</text>)}
                    {outs.map((f) => gland(f.x, y2))}
                  </g>
                );
              })()}
              {!dewa && real.frame && (() => {
                // Standard style, a root panel: a dashed frame round its MET, incomer, name, busbar and ways'
                // breakers (its LV earth pits stand outside, on the left); cables cross it at a gland mark.
                const { x1, x2 } = real.frame, y1 = real.busY - PLAIN_FRAME_TOP, y2 = real.busY + PLAIN_FRAME_BOTTOM;
                const gland = (x: number, gy: number) => <path key={`${x}-${gy}`} d={`M${x - 5} ${gy - 4} q3 4 0 8 M${x + 5} ${gy - 4} q-3 4 0 8`} className="ln" />;
                return (
                  <g className="plain-frame">
                    <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} className="ln interlock" fill="none" style={sel ? { stroke: 'var(--acc)', strokeWidth: 2 } : undefined} />
                    {gland(n.x, y1)}
                    {layout.feeders.filter((f) => f.feeder.boardId === b.id).map((f) => gland(f.x, y2))}
                  </g>
                );
              })()}
              {incomerDeviceOf(b) && !b.standby && (() => {
                const dev = incomerDeviceOf(b)!;
                // Incomer switching device on the line above the name box.
                const kind = dev === 'ISOL' ? 'isolator' : dev === 'ACB' ? 'acb' : dev === 'MCCB-NA' ? 'nonauto' : 'breaker';
                const sy = n.busY - (protectionOf(b) ? 92 : 84);
                return (
                  <g className="acc">
                    <title>{`Incomer: ${INCOMER_DEVICES.find((d) => d.value === dev)!.label}`}</title>
                    {/* Mask the line only over the symbol body (sy … sy + 16), so the blade's pivot meets the line below. */}
                    <rect x={n.x - 2} y={sy - 1} width="4" height="17" className="bg-fill" />
                    <SwitchSym x={n.x} y={sy} kind={kind} />
                    {/* Rating, poles and device, then the breaking capacity: "500 A TP MCCB (NA)", "36 kA". */}
                    {(() => {
                      const t = incomerTexts(project, b)!;
                      return (
                        <>
                          <text x={n.x + 10} y={sy + 9} className="dev">{t.device}</text>
                          {/* Red when the breaker can't break the board's prospective fault current. */}
                          {t.icu && <text x={n.x + 10} y={sy + 21} className="dev-k" style={t.low ? { fill: 'var(--bad)' } : undefined}>{t.icu}</text>}
                        </>
                      );
                    })()}
                  </g>
                );
              })()}
              {/* Board box; a framed DEWA panel names itself in the frame header, so its incoming line runs straight on. */}
              {/* A standard-style root panel names itself as plain text inside its frame, left of the incoming line. */}
              {n.terminal ? <BoardSymbol board={b} x={n.x} top={n.busY - 58} status={status} sel={sel} /> : dewa ? <line x1={n.x} y1={n.busY - 58} x2={n.x} y2={n.busY - 22} className="ln" /> : real.frame ? (
                <>
                  <line x1={n.x} y1={n.busY - 58} x2={n.x} y2={n.busY - 22} className="ln" />
                  <text className="b lod-name" x={n.x - 8} y={n.busY - 42} textAnchor="end" data-fit-width={54}>{trunc(b.id, 14)}</text>
                  <text className="m" x={n.x - 8} y={n.busY - 28} textAnchor="end" data-fit-width={54}>{`${b.kind ?? (b.upstreamId ? 'DB' : 'MDB')}${b.existing ? ' · EXISTING' : ''}`}</text>
                </>
              ) : (
                <>
                  <rect x={n.x - 62} y={n.busY - 58} width="124" height="36" rx="6" className="box" style={sel ? { stroke: 'var(--acc)', strokeWidth: 2 } : undefined} />
                  <text className="b lod-name" x={n.x - 54} y={n.busY - 42}>{trunc(b.id, 14)}</text>
                  <text className="m" x={n.x - 54} y={n.busY - 28}>{`${b.kind ?? (b.upstreamId ? 'DB' : 'MDB')}${b.existing ? ' · EXISTING' : ''}`}</text>
                  <circle cx={n.x + 52} cy={n.busY - 46} r="4" className="status-dot" style={{ fill: `var(--${status})` }} />
                </>
              )}
              {/* Busbar description at its right-hand end, the same wording on every panel:
                  "630 A TPN+E Cu BUSBAR", wrapped onto two lines where it would reach the incoming line.
                  The way count and full description are in the tooltip (and the panel schedule). */}
              {!n.terminal && b.ratedCurrentA && (() => {
                const ways = layout.feeders.filter((f) => f.feeder.boardId === b.id).length + layout.spares.filter((x) => x.boardId === b.id).length;
                const al = b.busbarMaterial === 'aluminium';
                const full = `${ways} WAY ${b.ratedCurrentA} A TPN+E ${al ? 'ALUMINIUM' : 'COPPER'} BUSBAR`;
                const head = `${b.ratedCurrentA} A TPN+E`, tail = `${al ? 'Al' : 'Cu'} BUSBAR`;
                // On a changeover both ends carry an incomer: the label goes under the busbar's left end,
                // where no outgoing way drops.
                const co = isInterlocked(b);
                const oneLine = !co && (head.length + tail.length + 1) * 6.8 < n.busX2 - n.x - 10;
                const lx = co ? n.busX1 + 4 : n.busX2, anchor = co ? 'start' : 'end';
                const [y1, y2] = co ? [real.busY + 16, real.busY + 28] : [real.busY - 17, real.busY - 5];
                // Separate <text> lines (not tspans), and the tooltip on the group, so the CAD export reads each line as is.
                return (
                  <g><title>{full}</title>
                    {oneLine ? <text x={lx} y={real.busY - 5} textAnchor={anchor} className="dev bus-t">{`${head} ${tail}`}</text> : (
                      <>
                        <text x={lx} y={y1} textAnchor={anchor} className="dev bus-t">{head}</text>
                        <text x={lx} y={y2} textAnchor={anchor} className="dev bus-t">{tail}</text>
                      </>
                    )}
                  </g>
                );
              })()}
              {hasInstruments(b) && !n.terminal && !isInterlocked(b) && (() => {
                // Ammeter and voltmeter with selector switches, R-Y-B lamps: inside the panel, left of the board box.
                const room = n.x - 66 - n.busX1;
                const x0 = room >= 50 ? n.busX1 + 2 : n.busX1 - 52;
                const y0 = n.busY - 52;
                const meter = (x: number, t: 'A' | 'V') => (
                  <g key={t}>
                    <Sym id={t === 'A' ? 'ammeter' : 'voltmeter'} x={x + 8} y={y0 + 7} s={SYM_SCALE.device} />
                    <rect x={x - 1} y={y0 + 16} width="18" height="10" className="sym" />
                    <text x={x + 8} y={y0 + 24} textAnchor="middle" className="acc-t" style={{ fontSize: 7 }}>S/S</text>
                  </g>
                );
                return (
                  <g className="acc instruments">
                    <title>Ammeter and voltmeter with selector switches, R-Y-B indicating lamps</title>
                    {meter(x0 + 2, 'A')}
                    {meter(x0 + 24, 'V')}
                    {['R', 'Y', 'B'].map((ph, i) => (
                      <g key={ph}>
                        {/* Library lamp: its lamp on the old spot, tapped off a short phase line on its left. */}
                        <Sym id="lamp" x={x0 - 3 + i * 15} y={y0 + 38} s={SYM_SCALE.device} />
                        <text x={x0 + 7 + i * 15} y={y0 + 33} textAnchor="middle" className="acc-t" style={{ fontSize: 7 }}>{ph}</text>
                      </g>
                    ))}
                  </g>
                );
              })()}
              {b.spd && !isInterlocked(b) && (
                <g className="acc">
                  <title>{`Surge protection device, Type ${b.spd === 'T1+2' ? '1+2' : b.spd.slice(1)}`}</title>
                  {(() => {
                    // On the busbar's right end (or under the board box when it has no busbar).
                    // On a board with no busbar, off the left side of its board symbol.
                    const sx = n.terminal ? n.x - BOARD_SYM / 2 - 12 : n.busX2 - 8;
                    const sy = n.terminal ? n.busY - 30 : n.busY;
                    return (
                      <>
                        {n.terminal && <line x1={n.x - BOARD_SYM / 2} y1={sy} x2={sx} y2={sy} className="ln" />}
                        <line x1={sx} y1={sy} x2={sx} y2={sy - 12} className="ln" />
                        <Sym id="spd" x={sx} y={sy - 20} s={SYM_SCALE.device} flip />
                        <text x={sx - 9} y={sy - 16} textAnchor="end" className="acc-t">SPD {b.spd === 'T1+2' ? 'T1+2' : b.spd}</text>
                      </>
                    );
                  })()}
                </g>
              )}
              {(() => {
              const tags: Tag[] = [
                ...(n.terminal ? [] : circuitTags),
                ...(b.kind === 'UPS' ? (() => {
                  const pct = upsLoadingPct(project, b);
                  return [{ text: `UPS ${b.upsKva ?? '—'} kVA${pct !== undefined ? ` · ${fmtFixed(pct, 0)}%` : ''}`, cls: pct === undefined ? 'm' : pct > 100 ? 'bad' : pct > 80 ? 'warn' : 'ok' }];
                })() : []),
                // Existing board (plain style; DEWA has it in the name box, a transformer beside its symbol): its recorded demand.
                ...(!dewa && b.existing && recordedText(project, b) && !(!b.upstreamId && b.sourceKva) ? [{ text: recordedText(project, b)!, cls: 'm' }] : []),
                ...boardTags(b.id),
                ...(s.loadingPct !== undefined ? [{ text: `${fmtFixed(s.loadingPct, 0)}% loaded`, cls: layers?.loading ? s.loadingStatus ?? 'm' : 'm' }] : [])
              ];
              if (n.terminal) {
                // No busbar: the tags follow the name and kind beside the board symbol, then what the
                // board feeds (its final circuits on the load schedule), or that it feeds nothing yet.
                const tx = n.x + BOARD_SYM / 2 + 8, ty = (i: number) => n.busY - 14 + i * 13;
                // DEWA: a dashed panel frame as on the other panels, holding the incomer device (and on a
                // main board its voltage label and the MET), the symbol and its text; the incomer
                // crosses it at a gland mark.
                const rows = tags.length + Math.max(1, circuitTags.length);
                const isRoot = layout.roots.some((r) => r.board.id === b.id);
                const fy1 = n.busY - (b.standby ? 148 : isRoot ? 114 : incomerDeviceOf(b) ? (protectionOf(b) ? 92 : 84) + 10 : 70);
                const fy2 = ty(rows - 1) + 4 + BOARD_FRAME_PAD, fx1 = n.x - BOARD_FRAME_IN, fx2 = n.x + BOARD_FRAME_PAD + Math.max(incomerReach(project, b),
                  BOARD_SYM / 2 + 8 + Math.max(textWidth(trunc(b.id, 14), 12, true), textWidth('NO OUTGOING WAYS', 10.5), ...[...tags, ...circuitTags].map((t) => textWidth(t.text, 10.5, true))));
                return (
                  <>
                    {dewa && (
                      <g className="panel-frame board-frame">
                        <rect x={fx1} y={fy1} width={fx2 - fx1} height={fy2 - fy1} className="frame-ln" />
                        <path d={`M${n.x - 5} ${fy1 - 4} q3 4 0 8 M${n.x + 5} ${fy1 - 4} q-3 4 0 8`} className="ln" />
                      </g>
                    )}
                    {tags.map((t, i) => <text key={t.text} x={tx} y={ty(i)} className={`res ${t.cls}`}>{t.text}</text>)}
                    {circuitTags.length > 0 ? (
                      <g className="sched" onDoubleClick={(e) => { e.stopPropagation(); edit(onOpenSchedule, b.id)(); }}>
                        <title>Final circuits are on the load schedule — double-click to open it</title>
                        {circuitTags.map((t, i) => <text key={t.text} x={tx} y={ty(tags.length + i)} className={`res ${t.cls}`}>{t.text}</text>)}
                      </g>
                    ) : <text x={tx} y={ty(tags.length)} className="res m no-ways">NO OUTGOING WAYS</text>}
                  </>
                );
              }
              return tags.map((t, i) => (
                // Under the incomer label (same left edge, one line gap), clear of the busbar label.
                <text key={t.text} x={n.x + 10} y={(incomerDeviceOf(b) && !b.standby ? n.busY - (protectionOf(b) ? 92 : 84) + 40 : n.busY - 47) + i * 13} className={`res ${t.cls}`}>{t.text}</text>
              ));
              })()}
            </g>
          );
        })}
        {legend.length > 0 && (
          <g className="legend" transform={`translate(${layout.width + 10} 30)`}>
            <rect x="0" y="0" width={legendW} height={46 + legend.length * LEGEND_ROW} rx="4" className="legend-box" />
            <text x="12" y="22" className="b">LEGEND</text>
            <line x1="0" y1="32" x2={legendW} y2="32" className="ln" />
            {legend.map((e, i) => (
              <g key={e.key}>
                {e.draw(LEGEND_SYM_X, 32 + 20 + i * LEGEND_ROW)}
                <text x={LEGEND_TEXT_X} y={32 + 24 + i * LEGEND_ROW} className="legend-t">{e.label}</text>
              </g>
            ))}
          </g>
        )}
        {(outlines ?? []).map((o, i) => {
          const r = boardsBox(o.boards, 8 + (i % 3) * 6);
          if (!r) return null;
          return (
            <g key={o.id} className={`sheet-outline${overOutline === o.id ? ' over' : ''}`} onClick={(e) => { if (!onOutline) return; e.stopPropagation(); onOutline(o.id); }}>
              <title>{`${o.label} — click to open the sheet`}</title>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="10" style={{ stroke: o.color }} />
              <text x={r.x + 8} y={r.y + 16} style={{ fill: o.color }}>{o.label}</text>
            </g>
          );
        })}
        {anchors && (
          <g className="sheet-anchors" style={{ opacity: 0 }} pointerEvents="none">
            {layout.boards.map((n) => { const r = boardsBox([n.board.id], 0); return r && <rect key={n.board.id} data-anchor={n.board.id} x={r.x} y={r.y} width={r.w} height={r.h} />; })}
            {layout.feeders.map((n) => <rect key={n.feeder.id} data-anchor={`f:${n.feeder.id}`} x={n.x - 10} y={n.busY + 8} width={20} height={84} />)}
          </g>
        )}
        {(clouds ?? []).map((c, i) => {
          // A circuit's cloud goes round its breaker and cable, as its callout anchor.
          const boxes = [boardsBox(c.boards, 12), ...layout.feeders.filter((n) => c.feeders?.includes(n.feeder.id)).map((n) => ({ x: n.x - 22, y: n.busY - 4, w: 44, h: 108 }))].filter((b): b is NonNullable<typeof b> => !!b);
          if (!boxes.length) return null;
          const x1 = Math.min(...boxes.map((b) => b.x)), y1 = Math.min(...boxes.map((b) => b.y));
          const r = { x: x1, y: y1, w: Math.max(...boxes.map((b) => b.x + b.w)) - x1, h: Math.max(...boxes.map((b) => b.y + b.h)) - y1 };
          return (
            <g key={i} className="rev-cloud">
              <path d={cloudPath(r.x, r.y, r.w, r.h)} />
              <path d={`M${r.x + r.w - 6} ${r.y - 4} l12 -20 l12 20 z`} className="rev-tri" />
              <text x={r.x + r.w + 6} y={r.y - 9} textAnchor="middle" className="b">{c.rev}</text>
            </g>
          );
        })}
        {(arrows ?? []).map((a, i) => {
          let ax: number | undefined, ay: number | undefined;
          if (a.target.startsWith('f:')) {
            const fn = layout.feeders.find((n) => n.feeder.id === a.target.slice(2));
            if (fn) { ax = fn.x; ay = fn.busY + 46; }
          } else {
            const bn = layout.boards.find((n) => n.board.id === a.target);
            if (bn) { ax = bn.x + (a.dir.endsWith('e') ? 62 : -62); ay = bn.busY - 40; }
          }
          if (ax === undefined || ay === undefined) return null;
          const L = a.len ?? 80;
          const tx = ax + (a.dir.endsWith('e') ? L : -L), ty = ay + (a.dir.startsWith('n') ? -L * 0.7 : L * 0.7);
          const ang = Math.atan2(ay - ty, ax - tx);
          const head = (d: number) => `${ax! - 9 * Math.cos(ang + d)},${ay! - 9 * Math.sin(ang + d)}`;
          const right = a.dir.endsWith('e');
          return (
            <g key={i} className="callout">
              <line x1={tx} y1={ty} x2={ax} y2={ay} className="ln" />
              <polygon points={`${ax},${ay} ${head(0.4)} ${head(-0.4)}`} className="callout-head" />
              <line x1={tx} y1={ty} x2={tx + (right ? 10 : -10)} y2={ty} className="ln" />
              <text x={tx + (right ? 14 : -14)} y={ty + 4} textAnchor={right ? 'start' : 'end'} className="b callout-t">{a.text}</text>
            </g>
          );
        })}
        {insertAt && hover === `bus:${insertAt.boardId}` && (() => {
          const n = layout.boards.find((b) => b.board.id === insertAt.boardId);
          if (!n) return null;
          return (
            <g className="insert-guide" pointerEvents="none">
              <line x1={insertAt.x} y1={n.busY - 16} x2={insertAt.x} y2={n.busY + 96} />
              <circle cx={insertAt.x} cy={n.busY} r="4.5" />
            </g>
          );
        })()}
      </svg>
      <ViewZoomChip view={view} W={W} subscribe={subscribeZoom} onFit={() => setVb(full)} />
      {colorBy !== 'none' && (
        <div className="heat-legend">
          <b>{COLOR_BY.find((c) => c.value === colorBy)?.label}</b>
          <div className="heat-bar" />
          <div className="heat-ticks"><span>0</span><span>50%</span><span>85%</span><span>≥100% of limit</span></div>
          <span className="m">{COLOR_BY.find((c) => c.value === colorBy)?.legend}</span>
        </div>
      )}
      {scenario?.outage && (
        <div className={`mode-banner${scenario.outage.tie ? '' : ' bad'}`}>
          {scenario.outage.tie
            ? `Transformer of ${scenario.outage.failedId} failed — ${scenario.outage.tie.id} closed; ${scenario.outage.tie.fromId}'s transformer carries both`
            : `Transformer of ${scenario.outage.failedId} failed — no bus tie: ${scenario.outage.failedId} and everything below it is off`}
        </div>
      )}
      {scenario && !scenario.outage && (
        <div className="mode-banner">
          {scenario.generators.length
            ? `On generator: ${scenario.generators.map((g) => `${g.boardId} ${g.kva} kVA`).join(', ')} — mains lost, ATS changed over; dimmed boards are off`
            : 'No standby generator in this project — drop “Generator + ATS” on a board'}
        </div>
      )}
      {moving && <div className="move-ghost" style={{ left: moving.x + 14, top: moving.y + 10 }}>Move {moving.label}{hover ? '' : ' — drop on a busbar or feeder'}</div>}
      {card && !moving && !cableEdit && (() => {
        const W = 270;
        const host = svgRef.current?.parentElement?.getBoundingClientRect();
        const left = Math.max(4, Math.min(card.x + 16, (host?.width ?? 800) - W - 4));
        const top = Math.max(4, Math.min(card.y + 14, (host?.height ?? 600) - 230));
        const keep = { onMouseEnter: () => clearTimeout(hideCard.current), onMouseLeave: leaveCard };
        if (card.kind === 'board') {
          const b = project.boards.find((x) => x.id === card.id);
          if (!b) return null;
          const sm = boardSummary(calcProject ?? project, b);
          const a = annotations?.boards[b.id];
          const vp = a?.voltagePct ?? sm.voltagePct;
          return (
            <div className="hover-card" style={{ left, top, width: W }} {...keep}>
              <div className="hc-head"><b>{b.id}</b> <span className="m">{b.kind ?? (b.upstreamId ? 'DB' : 'MDB')}{b.ratedCurrentA ? ` · ${b.ratedCurrentA} A` : ''}</span></div>
              <dl className="hc-kv">
                <dt>Voltage</dt><dd className={a?.voltageStatus ?? ''}>{txt.volts((project.voltageV * vp) / 100)} V ({txt.pct(vp)} %)</dd>
                <dt>Fault level Ik″</dt><dd>{txt.fault(a?.faultKA ?? sm.faultKA)} kA</dd>
                <dt>Demand</dt><dd>{txt.power(sm.demandKw)} kW · {txt.current(sm.currentA)} A</dd>
                <dt>Loading</dt><dd className={sm.loadingStatus ?? ''}>{sm.loadingPct === undefined ? 'no rating' : `${txt.loading(sm.loadingPct)} %`}</dd>
                <dt>TCL × DF = MDL</dt><dd>{(() => { const p = panelSummary(project, b); return `${txt.power(p.tclKw)} × ${p.df.toFixed(2)} = ${txt.power(p.mdlKw)} kW`; })()}</dd>
              </dl>
            </div>
          );
        }
        const f = project.feeders.find((x) => x.id === card.id);
        const r = f && byFeeder.get(f.id);
        if (!f || !r) return null;
        const reasons = r.status === 'ok' ? [] : failReasons(calcProject ?? project, r);
        const fixes = onFixFeeder && r.status !== 'ok' ? quickFixes(calcProject ?? project, f) : [];
        return (
          <div className={`hover-card ${r.status}`} style={{ left, top, width: W }} {...keep}>
            <div className="hc-head"><b>{f.id}</b> <span className="m">{f.name}</span><span className={`hc-st ${r.status}`}>{STATUS_TEXT[r.status]}</span></div>
            <dl className="hc-kv">
              <dt>Cable</dt><dd>{runsOf(f) > 1 ? `${runsOf(f)}× ` : ''}{f.cores}C {f.cableCsaMm2} mm² · {f.lengthM} m</dd>
              <dt>Ib / In / Iz</dt><dd className={r.protectionStatus === 'bad' || r.ampacityStatus === 'bad' ? 'bad' : ''}>{txt.current(r.ib)} / {f.breakerRatingA} / {izText(r.ampacity)} A</dd>
              <dt>Voltage drop</dt><dd className={r.vdStatus}>{txt.pct(r.vdPct)} % cable · {txt.pct(r.vdTotalPct)} % total</dd>
              <dt>Fault / Icu</dt><dd className={r.icuStatus === 'bad' ? 'bad' : ''}>{txt.fault(r.breakerFaultKA)} kA / {f.breakerIcuKa} kA</dd>
            </dl>
            {reasons.length > 0 && <ul className="hc-why">{reasons.map((t) => <li key={t}>{t}</li>)}</ul>}
            {fixes.length > 0 && (
              <div className="hc-fix">
                <span className="m">Quick fix:</span>
                {fixes.map((x) => (
                  <button key={x.label} className={`chip ${x.after.status}`} title={`After: Vd ${txt.pct(x.after.vdTotalPct)} %, Iz ${izText(x.after.ampacity)} A — ${x.after.status === 'ok' ? 'passes' : 'still to check'}`}
                    onClick={() => { onFixFeeder!(f.id, x.patch, x.label); setCard(null); }}>{x.label}</button>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {cableEdit && (
        <form
          className="cable-edit"
          style={{ left: cableEdit.x, top: cableEdit.y + 8 }}
          onSubmit={(e) => { e.preventDefault(); saveCable(); }}
          onKeyDown={(e) => e.key === 'Escape' && setCableEdit(null)}
        >
          <b>{cableEdit.id} cable</b>
          <label>Size
            <select value={cableEdit.size} onChange={(e) => setCableEdit({ ...cableEdit, size: e.target.value })}>
              {cables().map((c) => <option key={c.csaMm2} value={c.csaMm2}>{c.csaMm2} mm²</option>)}
            </select>
          </label>
          <label>Runs in parallel
            <select value={cableEdit.runs} onChange={(e) => setCableEdit({ ...cableEdit, runs: e.target.value })}>
              {['1', '2', '3', '4', '5', '6'].map((c) => <option key={c} value={c}>{c === '1' ? 'single' : `${c} ×`}</option>)}
            </select>
          </label>
          <label>Cores
            <select value={cableEdit.cores} onChange={(e) => setCableEdit({ ...cableEdit, cores: e.target.value })}>
              {['2', '3', '4'].map((c) => <option key={c} value={c}>{c}C</option>)}
            </select>
          </label>
          <label>Type
            <select value={cableEdit.type} onChange={(e) => setCableEdit({ ...cableEdit, type: e.target.value })}>
              {(() => { const f = project.feeders.find((x) => x.id === cableEdit.id); return <option value="">Auto — {f ? cableTypeOf(project, f).label : ''}</option>; })()}
              {CABLE_TYPE_DEFS.filter((d) => d.value !== 'XLPE/SWA/PVC').map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label>Length (m)
            <input autoFocus inputMode="decimal" value={cableEdit.length} aria-invalid={!lengthOk(cableEdit.length)}
              onChange={(e) => setCableEdit({ ...cableEdit, length: e.target.value })} onFocus={(e) => e.target.select()} />
          </label>
          <div className="cable-edit-actions">
            <button type="button" className="chip" onClick={() => setCableEdit(null)}>Cancel</button>
            <button type="submit" className="chip primary" disabled={!lengthOk(cableEdit.length)}>Apply</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The symbol legend on its own (the drawing sheets' legend column). widthMm: the column's inner width; the legend is
 * drawn for it (src/diagram/legendLayout.ts), so its labels print at 2.5 mm and wrap instead of shrinking. Without it,
 * as wide as its longest label. */
export function LegendSvg({ project, widthMm, textMm, cols = 1 }: { project: Project; widthMm?: number; textMm?: number; cols?: number }) {
  const legend = legendEntries(project);
  if (!legend.length) return null;
  const W = widthMm ? legendPxFor(widthMm, textMm) : legendWidth(legend);
  const { rows, h } = legendRows(legend, W, LEGEND_TEXT_X, widthMm ? cols : 1);
  return (
    <div className="sysdiag">
      <svg viewBox={`0 0 ${W} ${h}`} width={W} height={h} data-w={W} data-h={h}>
        <g className="legend">
          <rect x="0" y="0" width={W} height={h} rx="4" className="legend-box" />
          <text x="12" y="22" className="b">LEGEND</text>
          <line x1="0" y1="32" x2={W} y2="32" className="ln" />
          {rows.map(({ entry: e, lines, y, x }) => (
            <g key={e.key}>
              {e.draw(LEGEND_SYM_X + x, y)}
              {lines.map((l, j) => <text key={j} x={LEGEND_TEXT_X + x} y={legendLineY(y, lines.length, j)} className="legend-t">{l}</text>)}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

/** A revision cloud: arcs along a rectangle. */
function cloudPath(x: number, y: number, w: number, h: number): string {
  const step = 18;
  const nx = Math.max(2, Math.round(w / step)), ny = Math.max(2, Math.round(h / step));
  const sx = w / nx, sy = h / ny;
  let d = `M${x} ${y}`;
  for (let i = 0; i < nx; i++) d += ` a${sx / 2} ${sx / 2} 0 0 1 ${sx} 0`;
  for (let i = 0; i < ny; i++) d += ` a${sy / 2} ${sy / 2} 0 0 1 0 ${sy}`;
  for (let i = 0; i < nx; i++) d += ` a${sx / 2} ${sx / 2} 0 0 1 ${-sx} 0`;
  for (let i = 0; i < ny; i++) d += ` a${sy / 2} ${sy / 2} 0 0 1 0 ${-sy}`;
  return `${d} z`;
}
