import { ask } from '../ConfirmDialog';
import { panelCategoryOf } from '../../docs/sheetLink';
import { projectFormat } from '../../model/scheduleFormats';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supplyChain } from '../../model/transformers';
import { Keyboard, ListPlus, Scale, ShieldCheck, Square, SquareDashed, Trash2, X } from 'lucide-react';
import { RCD_TYPES, type Board, type Feeder, type Phase, type PointType, type Project, type RcdType } from '../../types';
import { cables } from '../../calc/cableTable';
import { defaultCpcMm2 } from '../../calc/earthing';
import { breakerRatings } from '../../calc/sizing';
import { RCBO_KIND_TEXT, type RcboKind, elcbGroups, itemizedTypes, loadItemsText, missingWatts, oddElcbCircuits, pointColumns, pointLabel, pointWattsFor, isScheduleCircuit, rcbosOf, circuitCategory, type ElcbGroup } from '../../calc/loadSchedule';
import { settingsOf } from '../../types';
import { loadsForColumn, type Database } from '../../database/database';
import { buildLoadScheduleHtml, elcbColumn, loadScheduleCsv, loadScheduleRows } from '../../docs/loadScheduleDoc';
import { addCircuit, balanceInsideElcbs, circuitRef, deleteCircuit, duplicateCircuit, fixCircuit, refreshBoard, updateCircuit, type CircuitPatch } from '../../model/schedule';
import { isFail, isProblem, nextProblemBoard, problemRows, rowFixes, rowReasons, type ScheduleRow, type ScheduleFix } from '../../docs/scheduleCheck';
import { saveBinary, saveCsv, savePdf, safeFileName } from '../../util/files';
import { buildFormWorkbook, workbookBytes, type WorkbookScope } from '../../docs/formWorkbook';
import { workbookHtml } from '../../docs/sheetPdf';
import { formatSheetOf, formatSheetsOf, sheetsHtml } from '../../docs/sheetPrint';
import { Page, STATUS_LABEL } from '../ui';
import { applySheetEdits, buildDbSheet } from '../../docs/dbSheet';
import { cellKey, type Pos } from '../grid/excelGrid';
import { useExcelGrid } from '../grid/useExcelGrid';
import GridSelect from '../grid/GridSelect';
import MdSheetView, { type MdTools } from './MdSheetView';
import { hasMdSheet } from '../../docs/mdSheet';
import { dbChecks } from '../../calc/building';
import TxSummaryView, { type TxTools } from './TxSummaryView';
import RiserFormView from './RiserFormView';
import { SCHEDULE_GROUPS, scheduleBoardOrder, scheduleGroupOf, scheduleGroups, type ScheduleGroup, incompleteSchedules } from '../../model/scheduleGroups';
import MenuButton from '../MenuButton';
import CircuitEditDialog from './CircuitEditDialog';
import ElcbDialog, { type ElcbTarget, type ElcbValues } from './ElcbDialog';
import { addBoardElcb, editElcbAt, ELCB_SIZES, regroupElcbs, removeElcbAt, resizeElcb, setNewElcbSize, setNoRcd, setRcbo, type ElcbSize } from '../../model/elcbs';
import ElcbCellMenu, { ElcbSizes, elcbWaysText } from './ElcbCellMenu';
import RegroupDialog from './RegroupDialog';
import TemplateExportDialog from './TemplateExportDialog';
import { addSpareWay, deleteSpareWay, spareLabel, spareRef, updateSpareWay } from '../../model/spareWays';
import { convertSpareWay } from '../../model/wayConversion';
import { fmtFixed, txt } from '../../util/format';
import type { RibbonActions } from '../Ribbon';

const num = (v: string) => (v === '' ? 0 : Math.max(0, Math.round(+v) || 0));
/** Final-circuit MCB ratings up to 125 A, plus the current one if it is outside that list. */
const mcbOptions = (current: number) => [...new Set([...breakerRatings().filter((a) => a <= 125), current])].sort((a, b) => a - b);

/** DEWA-style load distribution schedule for a 3-phase DB, editable in
 * place. It edits the same project data as the SLD, so changes show on
 * the diagram and in every study immediately (and vice versa). */
export default function LoadScheduleView({
  project,
  boardId,
  db,
  onBoard,
  onOpenRiser,
  onChange,
  onStatus,
  onSettings,
  onSchedule,
  onOpenSheet
}: {
  project: Project;
  boardId: string;
  db: Database;
  onBoard: (id: string) => void;
  onOpenRiser?: () => void;
  onChange: (p: Project, opts?: { step?: boolean }) => void;
  onStatus: (m: string) => void;
  onSettings: () => void;
  /** Tells the ribbon what the Load schedule tab's tools can do now (undefined when this page goes away). */
  onSchedule?: (s: RibbonActions['schedule']) => void;
  /** Shows a board as a sheet in the project's format for its panel category (Sheets); the ribbon's Open in my format. */
  onOpenSheet?: (boardId: string) => void;
}) {
  const board = project.boards.find((b) => b.id === boardId) ?? project.boards[0];
  const data = useMemo(() => loadScheduleRows(project, board.id), [project, board.id]);
  const watts = pointWattsFor(board);
  const otherFeeders = project.feeders.filter((f) => f.boardId === board.id && !isScheduleCircuit(f));
  const missing = missingWatts(project, board);
  const settings = settingsOf(project);
  const columns = pointColumns(project, board);
  // Excel-style keys, paste, selection, copy and fill down on the table:
  // cells are addressed like the DB sheet model (row 0 = WATT / UNIT), and
  // multi-cell changes go through its checks.
  const dbs = useMemo(() => buildDbSheet(project, board.id), [project, board.id]);
  const rowOf = useMemo(() => new Map(dbs.rows.map((r, y) => [r.type === 'circuit' ? r.feeder.id : r.type === 'watts' ? '__watts' : '', y])), [dbs]);
  const colOf = (key: string) => dbs.sheetCols.findIndex((c) => c.key === key);
  const cell = (feederId: string, key: string) => cellKey(rowOf.get(feederId) ?? -1, colOf(key));
  const grid = useRef<HTMLDivElement>(null);
  // The cell the selection ends on: its row is the one the ribbon's Edit and Delete act on.
  const [active, setActive] = useState<Pos | null>(null);
  const cmds = useExcelGrid(grid, (edits) => {
    const { project: next, rejected } = applySheetEdits(project, dbs, edits);
    if (next !== project) onChange(next);
    if (rejected.length) onStatus(`Not applied — ${rejected.slice(0, 3).join('; ')}${rejected.length > 3 ? ` (+${rejected.length - 3} more)` : ''}`);
  }, (p) => setActive((q) => (q?.y === p?.y && q?.x === p?.x ? q : p)));
  const activeRow = (() => {
    const r = active ? dbs.rows[active.y] : undefined;
    return r?.type === 'circuit' ? data.rows.find((x) => x.f.id === r.feeder.id) : undefined;
  })();
  // Which form: the DB load distribution schedule, or the connected load &
  // maximum demand form (boards with outgoing feeders). A board with no
  // circuits opens on the MD form; so does an empty MDB / SMDB / MCC (not a
  // DB or EDB), so its first feeder can be added there.
  const mdAvailable = hasMdSheet(project, board.id) || (board.kind ?? (board.upstreamId ? 'DB' : 'MDB')) !== 'DB';
  const [pick, setPick] = useState<{ board: string; form: 'db' | 'md' } | null>(null);
  const [txForm, setTxForm] = useState<false | 'tx' | 'riser'>(false);
  // Tabs by panel type (submission order); the open tab follows the selected panel.
  const groups = useMemo(() => scheduleGroups(project), [project]);
  const group: ScheduleGroup = scheduleGroupOf(project, board);
  const openGroup = (g: ScheduleGroup) => { setTxForm(false); const first = groups[g][0]; if (first && first.id !== board.id) onBoard(first.id); };
  /** A panel whose schedule still needs filling: a DB with no circuits, or a panel with no outgoing loads. */
  const incomplete = (b: Board) => incompleteSchedules(project).has(b.id);
  const form: 'db' | 'md' | 'tx' | 'riser' = txForm ? txForm : pick?.board === board.id ? pick.form : data.rows.length || !mdAvailable ? 'db' : 'md';
  const [exporting, setExporting] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  // Circuit open in the double-click edit dialog, and the field to focus.
  const [editing, setEditing] = useState<{ id: string; focus?: string } | null>(null);
  const editRow = editing && data.rows.find((r) => r.f.id === editing.id);
  /** Double-click on a row opens its edit dialog, focused on the clicked field. */
  const openEdit = (e: React.MouseEvent, id: string) => {
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;
    const key = t.closest<HTMLElement>('[data-cell]')?.dataset.cell;
    const col = key ? dbs.sheetCols[+key.split(':')[1]]?.key : undefined;
    setEditing({ id, focus: col });
  };
  async function exportExcel(scope: WorkbookScope, name: string) {
    setExporting(true);
    try {
      const bytes = await workbookBytes(buildFormWorkbook(project, scope));
      const m = await saveBinary(`${safeFileName(name)}.xlsx`, bytes, 'Excel workbook', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { output: 'loadSchedule', project });
      if (m) onStatus(m);
    } catch (e) {
      onStatus(`Excel export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  /** The same form as PDF, printed from the Excel layout (MD, TCL summary, risers). */
  async function exportFormPdf(scope: WorkbookScope, name: string) {
    setExporting(true);
    try {
      const m = await savePdf(`${safeFileName(name)}.pdf`, workbookHtml(project, buildFormWorkbook(project, scope), name), { pageSize: 'A4', landscape: true, cssPages: true }, { output: 'loadSchedule', project });
      if (m) onStatus(m);
    } catch (e) {
      onStatus(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  }

  /** The form on screen as a workbook scope and file name. */
  const formScope = (): [WorkbookScope, string] => form === 'riser' ? [{ forms: ['riser'] }, `${project.name} bus bar risers`]
    : form === 'tx' ? [{ forms: ['tx'] }, `${project.name} TCL summary at transformer level`]
    : [{ boardIds: [board.id], forms: [form] }, `${project.name} ${board.id} ${form === 'md' ? 'connected load MD' : 'load schedule'}`];

  // Check: the circuit shown in the bar above the grid, and a jump to another board waiting for it to be on screen.
  const [bar, setBar] = useState<{ board: string; id: string } | null>(null);
  const jump = useRef<string | null>(null);
  const order = useMemo(() => scheduleBoardOrder(groups), [groups]);
  const problems = useMemo(() => problemRows(data.rows), [data]);
  const current = bar && bar.board === board.id && form === 'db' ? problems.find((r) => r.f.id === bar.id) : undefined;
  const why = useMemo(() => (current ? { reasons: rowReasons(project, current), fixes: rowFixes(project, current) } : undefined), [project, current]);
  // The bar goes when the board changes, its circuit is deleted or no longer a problem.
  useEffect(() => { if (bar && !current) setBar(null); }, [bar, current]);
  const showProblem = (r: ScheduleRow) => {
    setBar({ board: board.id, id: r.f.id });
    const y = rowOf.get(r.f.id);
    if (y !== undefined) cmds.select({ y, x: Math.max(colOf('room'), 0) });
  };
  const check = () => {
    if (problems.length) { showProblem(problems[((current ? problems.indexOf(current) : -1) + 1) % problems.length]); return; }
    const to = nextProblemBoard(project, board.id, order);
    if (!to) { onStatus('Every circuit in every schedule is within limits'); return; }
    jump.current = to;
    setTxForm(false);
    setPick({ board: to, form: 'db' });
    onBoard(to);
  };
  // The jump: once the other board's DB form is on screen, its first problem.
  useEffect(() => {
    if (jump.current !== board.id || form !== 'db') return;
    jump.current = null;
    if (problems[0]) showProblem(problems[0]);
  });
  const applyFix = (r: ScheduleRow, fix: ScheduleFix) => {
    const next = fixCircuit(project, r.f.id, fix.patch);
    onChange(next, { step: true });
    const row = loadScheduleRows(next, board.id).rows.find((x) => x.f.id === r.f.id);
    if (row && !isProblem(row)) { setBar(null); onStatus(`${r.ref}: ${fix.label} applied`); }
  };
  const duplicate = () => {
    if (!activeRow) return;
    try {
      const r = duplicateCircuit(project, activeRow.f.id);
      onChange(r.project, { step: true });
      onStatus(`Circuit ${circuitRef(r.project.feeders.find((f) => f.id === r.id)!)} added as a copy of ${activeRow.ref}`);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : String(e));
    }
  };
  // The panels either side of this one in the schedule's own order (on a panel's own forms).
  const at = order.findIndex((b) => b.id === board.id);
  const onBoardForm = form === 'db' || form === 'md';
  const prevBoard = onBoardForm && at > 0 ? order[at - 1].id : undefined;
  const nextBoard = onBoardForm && at >= 0 ? order[at + 1]?.id : undefined;

  const setBoard = (patch: Partial<Board>, resize = false) => {
    const p = { ...project, boards: project.boards.map((b) => (b.id === board.id ? { ...b, ...patch } : b)) };
    onChange(resize ? refreshBoard(p, board.id) : p);
  };
  const patch = (id: string, pt: CircuitPatch) => onChange(updateCircuit(project, id, pt));
  // The MD form's and the TCL summary's own tools, as they publish them: the ribbon's buttons work through these.
  const mdTools = useRef<MdTools>();
  const txTools = useRef<TxTools>();
  const [mdShown, setMdShown] = useState<Pick<MdTools, 'row' | 'rowBlock' | 'dupBlock'>>({});
  const [txShown, setTxShown] = useState<Pick<TxTools, 'row' | 'substation'>>({ substation: '' });
  const addSpare = (kind: 'spare' | 'space', phase?: 'one' | 'three') => {
    if (form === 'md') { mdTools.current?.addWay(kind, phase ?? 'three'); return; }
    try {
      const r = addSpareWay(project, board.id, kind, phase === 'three' ? 'RYB' : undefined);
      onChange(r.project);
      onStatus(r.message);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const add = (phase?: Phase) => {
    if (form === 'md') { mdTools.current?.addFeeder(); return; }
    try {
      onChange(addCircuit(project, board.id, phase).project);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const convertWay = async (sp: NonNullable<Board['spareWays']>[number]) => {
    const label = `${spareLabel(sp).toLowerCase()} ${spareRef(sp)}`;
    const kept = sp.kind === 'spare' ? 'keep its fitted breaker' : 'add the breaker planned for this space';
    if (!(await ask(`Convert ${label} to a circuit? It will ${kept} and start with no load until you enter its points.`))) return;
    const r = convertSpareWay(project, board.id, sp.id);
    if (r.project !== project) onChange(r.project, { step: true });
    onStatus(r.message);
    if (r.id) setEditing({ id: r.id });
  };
  // ELCBs and RCBOs (Add → ELCB / RCD, or a click on an ELCB cell): the dialogs, and what the menus do. Every ELCB is a
  // device of its own: changing one moves no other; Re-group all ELCBs cuts the whole DB again.
  const [elcbDlg, setElcbDlg] = useState<ElcbTarget | null>(null);
  const [regroupOpen, setRegroupOpen] = useState(false);
  const [cellMenu, setCellMenu] = useState<{ index: number; at: DOMRect } | null>(null);
  const elcbCells = useMemo(() => elcbColumn(data.entries), [data]);
  const activeGroup = activeRow?.rcbo ? undefined : activeRow?.group;
  // The one circuit that makes its ELCB mix lighting and power: the Check column offers an RCBO in its place.
  const odd = useMemo(() => oddElcbCircuits(data.groups), [data]);
  const oddTitle = (f: Feeder, g: ElcbGroup) => {
    const mine = circuitCategory(f), other = mine === 'power' ? 'lighting' : 'power';
    return `Only ${mine} circuit on ELCB-${g.index}: an RCBO in place of its MCB leaves ELCB-${g.index} with ${other} circuits only`;
  };
  const makeOddRcbo = (f: Feeder, ref: string, g: ElcbGroup) => {
    try {
      const next = setRcbo(project, f.id, true);
      onChange(next, { step: true });
      const b = next.boards.find((x) => x.id === board.id)!;
      const rc = rcbosOf(next, b).find((x) => x.circuit.id === f.id)!;
      const ng = elcbGroups(next, b).find((x) => x.ways[0] === g.ways[0]);
      onStatus(`${ref}: RCBO ${rc.ratingA} A ${rc.sensitivityMa} mA in place of the MCB${ng ? `; ELCB-${ng.index} is now ${ng.label} (${ng.category})` : ''}`);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const menuGroup = cellMenu ? elcbCells.find((c) => c?.group?.index === cellMenu.index)?.group : undefined;
  const editElcb = (g: ElcbGroup) => setElcbDlg({ kind: 'elcb', at: g.ways[0], from: g.ways[0], to: g.ways[g.ways.length - 1] });
  const resize = (g: ElcbGroup, circuits: number) => {
    try {
      const r = resizeElcb(project, board.id, g.ways[0], circuits);
      if (r.project !== project) onChange(r.project, { step: true });
      onStatus(r.message);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const newSize = board.elcbGroupSize ?? 6;
  const removeElcb = (g: ElcbGroup) => {
    onChange(removeElcbAt(project, board.id, g.ways[0]), { step: true });
    onStatus(`ELCB-${g.index} removed: ${elcbWaysText(g.ways)} take the New ELCBs size (${newSize ? `${newSize} circuits` : 'no ELCB'})`);
  };
  const placeRcbo = (kind: RcboKind = 'rcbo') => {
    if (!activeRow) return;
    try {
      const next = setRcbo(project, activeRow.f.id, true, undefined, kind);
      onChange(next, { step: true });
      const r = rcbosOf(next, next.boards.find((b) => b.id === board.id)!).find((x) => x.circuit.id === activeRow.f.id)!;
      const what = kind === 'addon' ? `RCD add-on block ${r.label} on its MCB (${r.name})` : `${RCBO_KIND_TEXT[kind]} ${r.label} in place of the MCB (${r.name})`;
      onStatus(`${activeRow.ref}: ${what}${activeRow.group ? `; it leaves ELCB-${activeRow.group.index}` : ''}`);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const saveElcb = (target: ElcbTarget, v: ElcbValues): string | undefined => {
    try {
      if (target.kind === 'rcbo') {
        onChange(setRcbo(project, target.feederId, true, v.sensitivityMa, undefined, v.rcdType ?? null), { step: true });
        const f = project.feeders.find((x) => x.id === target.feederId);
        onStatus(`${f ? circuitRef(f) : ''}: RCBO earth leakage ${v.sensitivityMa ? `${v.sensitivityMa} mA` : 'Auto'}`);
        return undefined;
      }
      if (target.kind === 'none') {
        const f = project.feeders.find((x) => x.id === target.feederId);
        const was = f && data.rows.find((x) => x.f.id === f.id)?.group;
        onChange(setNoRcd(project, target.feederId, v.reason), { step: true });
        onStatus(`${f ? circuitRef(f) : ''}: no RCD (${v.reason})${was ? `; it leaves ELCB-${was.index}` : ''}. Its earth fault check rests on the MCB alone`);
        return undefined;
      }
      const body = { fromWay: v.fromWay, toWay: v.toWay, poles: v.poles === 3 ? 3 as const : undefined, ratingA: v.ratingA, sensitivityMa: v.sensitivityMa, rcdType: v.rcdType };
      const r = target.at !== undefined ? editElcbAt(project, board.id, target.at, body) : addBoardElcb(project, board.id, body);
      onChange(r.project, { step: true });
      onStatus(r.message);
      return undefined;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const removeRcbo = () => {
    if (!activeRow?.rcbo) return;
    onChange(setRcbo(project, activeRow.f.id, false), { step: true });
    onStatus(`${activeRow.rcbo.name} removed: ${activeRow.ref} has its MCB again and is back on the ELCB`);
  };
  const backOnElcb = () => {
    if (!activeRow?.none) return;
    onChange(setNoRcd(project, activeRow.f.id), { step: true });
    onStatus(`${activeRow.ref} is back on its ELCB`);
  };
  const regroup = (o: Parameters<typeof regroupElcbs>[2]) => {
    onChange(regroupElcbs(project, board.id, o), { step: true });
    onStatus(`${board.id}: ELCBs re-grouped${o.size ? ` into ${o.size} circuits each` : ': no ELCB'}`);
  };
  const removeCircuit = async (r: { f: { id: string }; ref: string }) => {
    if (await ask(`Delete circuit ${r.ref}?`)) onChange(deleteCircuit(project, r.f.id));
  };
  /** Paste from the ribbon: the system clipboard through the grid's own paste. */
  const pasteClipboard = async () => {
    const told = 'Paste: press Ctrl/⌘ V on the schedule';
    try {
      const text = await navigator.clipboard.readText();
      if (!(form === 'md' ? mdTools.current?.paste(text) : cmds.paste(text))) onStatus('Paste: click a cell on the schedule first');
    } catch {
      onStatus(told);
    }
  };
  const exportKind = async (kind: 'excel' | 'pdf' | 'csv' | 'pack' | 'template' | 'myPdf' | 'myPdfAll' | 'myXlsx' | 'myXlsxAll') => {
    if (kind === 'myPdf' || kind === 'myPdfAll' || kind === 'myXlsx' || kind === 'myXlsxAll') {
      const one = kind === 'myPdf' || kind === 'myXlsx', mine = one ? formatSheetOf(project, board.id) : undefined, sheets = one ? (mine ? [mine] : []) : formatSheetsOf(project);
      if (!sheets.length) { onStatus(one ? 'Choose a format for this panel in Sheets → My formats first.' : 'No panel of this project has a format yet: choose them in Sheets → My formats.'); return; }
      const excel = kind === 'myXlsx' || kind === 'myXlsxAll', file = one ? `${safeFileName(board.id)}-schedule-my-format` : `${safeFileName(project.name)}-schedules-my-format`;
      const m = excel ? await saveBinary(`${file}.xlsx`, new Uint8Array(await (await import('../../docs/sheetXlsx')).buildXlsx(sheets).xlsx.writeBuffer()), 'Excel workbook', 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { output: 'loadSchedule', project, values: one ? { Board: board.id } : undefined }) : await savePdf(`${file}.pdf`, sheetsHtml(sheets, one ? `${project.name} — ${board.id}` : project.name), { cssPages: true }, { output: 'loadSchedule', project, values: one ? { Board: board.id } : undefined }); // each sheet on its own paper
      if (m) onStatus(one ? m : `${m} — ${sheets.length} panels`);
      return;
    }
    if (kind === 'excel') await exportExcel(...formScope());
    else if (kind === 'pack') await exportExcel({}, `${project.name} submission forms`);
    else if (kind === 'template') setTemplateOpen(true);
    else if (kind === 'csv') { const c = loadScheduleCsv(project, board.id); const m = await saveCsv(`${project.name} ${board.id} load schedule`, c.headers, c.rows, { output: 'loadSchedule', project, values: { Board: board.id } }); if (m) onStatus(m); }
    else if (form === 'db') { const m = await savePdf(`${safeFileName(board.id)}-load-schedule.pdf`, buildLoadScheduleHtml(project, board.id), { pageSize: 'A4', landscape: true }, { output: 'loadSchedule', project, values: { Board: board.id } }); if (m) onStatus(m); }
    else await exportFormPdf(...formScope());
  };

  // The ribbon's Load schedule tools. Published by value: the handlers go through a ref, so what is sent changes only
  // with what the ribbon shows (publishing an object built every render would loop).
  const now = { add, addSpare,
    fill: () => (form === 'md' ? mdTools.current?.fillDown() : cmds.fillDown()),
    edit: () => { if (form === 'md') mdTools.current?.edit(); else if (form === 'tx') txTools.current?.edit(); else if (form === 'riser') onOpenRiser?.(); else if (activeRow) setEditing({ id: activeRow.f.id }); },
    remove: () => { if (form === 'md') mdTools.current?.remove(); else if (form === 'tx') txTools.current?.remove(); else if (activeRow) void removeCircuit(activeRow); },
    balance: () => onChange(balanceInsideElcbs(project, board.id)), copy: () => { if (form === 'md') mdTools.current?.copy(); else cmds.copy(); }, paste: pasteClipboard, exportKind,
    step: (d: -1 | 1) => { const to = d < 0 ? prevBoard : nextBoard; if (to) onBoard(to); }, check,
    duplicate: () => { if (form === 'md') mdTools.current?.duplicate(); else duplicate(); },
    addTransformer: (newSubstation: boolean) => txTools.current?.addTransformer(newSubstation), formDetails: onSettings, openSheet: () => onOpenSheet?.(board.id) };
  const tools = useRef(now);
  tools.current = now;
  const publish = useRef(onSchedule);
  publish.current = onSchedule;
  const onGrid = form === 'db', rowRef = onGrid ? activeRow?.ref : form === 'md' ? mdShown.row : form === 'tx' ? txShown.row : undefined;
  const { rowBlock, dupBlock } = form === 'md' ? mdShown : { rowBlock: undefined, dupBlock: undefined };
  const substation = form === 'tx' ? txShown.substation : undefined;
  const imbalancePct = data.rows.length ? Math.round(data.imbalance) : undefined, canBalance = data.rows.length >= 2;
  const fails = onGrid ? problems.filter(isFail).length : 0, warns = onGrid ? problems.length - fails : 0;
  const category = panelCategoryOf(project, board), sheetFormat = !!(category && projectFormat(project, category)) || !!project.sheets?.sheets.some((s) => s.link?.boardId === board.id), sheetFormats = !!project.sheets?.sheets.some((s) => s.link?.boardId) || Object.keys(project.scheduleFormats ?? {}).length > 0;
  useEffect(() => {
    publish.current?.({
      form, grid: onGrid, row: rowRef, rowBlock, dupBlock, substation, canBalance, imbalancePct, exporting, board: onBoardForm, prevBoard, nextBoard, fails, warns,
      onBoardStep: (d) => tools.current.step(d), onDuplicate: () => tools.current.duplicate(), onCheck: () => tools.current.check(),
      onAddCircuit: (three) => tools.current.add(three ? 'RYB' : undefined), onAddSpare: (k, phase) => tools.current.addSpare(k, phase),
      onAddTransformer: (n) => tools.current.addTransformer(n), onFormDetails: () => tools.current.formDetails(),
      onFillDown: () => tools.current.fill(), onEditRow: () => tools.current.edit(), onDeleteRow: () => tools.current.remove(),
      onBalance: () => tools.current.balance(), onCopy: () => tools.current.copy(), onPaste: () => void tools.current.paste(),
      onExport: (k) => void tools.current.exportKind(k), sheetFormat, sheetFormats, onOpenSheet: () => tools.current.openSheet()
    });
  }, [sheetFormat, sheetFormats, form, onGrid, rowRef, rowBlock, dupBlock, substation, canBalance, imbalancePct, exporting, onBoardForm, prevBoard, nextBoard, fails, warns]);
  useEffect(() => () => publish.current?.(undefined), []);

  return (
    <Page
      docId="load-schedule-page"
      title={form === 'riser' ? 'Bus bar riser — connected load / max. demand' : form === 'tx' ? 'Summary of the TCL at transformer level' : form === 'md' ? 'Connected load, maximum demand & kWh metering' : 'Load distribution schedule'}
      info={form === 'riser' ? <p>For high-rise buildings: the busbar riser from the MDB and each floor’s tap-off to its SMDB / DB, with connected load per phase, TCL, D.F, MD and kWh meters.</p> : form === 'tx' ? <p>Authority summary of every transformer: main breaker and setting, fault duty, connected load per phase, TCL, demand factor, MDL and the kWh meters it feeds. Loads and meters come from the MD forms and load schedules below each transformer.</p> : form === 'md'
        ? <p>Authority form for a meter cabinet, MDB, SMDB or MCC: its incomer and every outgoing feeder. Connected load per phase, TCL and MDL come from everything below each feeder, down to the DB load schedules. Type ratings, cable type, meters and remarks in the white cells.</p>
        : <>
        <p>Enter circuits here or on the SLD — both edit the same data. Circuit references are phase + way (R1, Y1, B1, R2…; RYB = 3-phase). Load per circuit = points × WATT/UNIT (your input).</p>
        <p>Lighting circuits (LTG / fans only): min {settings.minWireLightingMm2} mm², {settings.elcbLightingMa} mA ELCB; power circuits: min {settings.minWirePowerMm2} mm², {settings.elcbPowerMa} mA ELCB — change these in Project settings.</p>
        <p>MCB and wire are sized from the load, voltage drop and earth fault; a size chosen by hand is kept.</p>
      </>}
      head={<span className="m ls-supply" title="Where this board's supply comes from">Supply {supplyChain(project, board.id).join(' → ')}</span>}
      actions={
        <>
          {form !== 'tx' && form !== 'riser' && <select className="chip" value={board.id} onChange={(e) => onBoard(e.target.value)} aria-label="DB">
            {project.boards.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
          </select>}
        </>
      }
    >
      <div className="ls-nav">
        <div className="seg form-tabs" role="tablist" aria-label="Schedules" data-doc-id="load-schedule-groups">
          <button role="tab" aria-selected={form === 'tx'} className={form === 'tx' ? 'on' : ''} title="Summary of the TCL at transformer level — every transformer of the project" onClick={() => setTxForm('tx')}>TCL summary</button>
          {SCHEDULE_GROUPS.flatMap(({ key, label }) => {
            const tab = groups[key].length ? [<button key={key} role="tab" aria-selected={!txForm && group === key} className={!txForm && group === key ? 'on' : ''} onClick={() => openGroup(key)}>{label} <span className="m">({groups[key].length})</span></button>] : [];
            // The busbar riser follows the main LV panels.
            return key === 'mdb' && project.busRisers?.length ? [...tab, <button key="riser" role="tab" aria-selected={form === 'riser'} className={form === 'riser' ? 'on' : ''} title="Bus bar riser — connected load / max. demand of each tap-off (high-rise)" onClick={() => setTxForm('riser')}>Busbar riser</button>] : tab;
          })}
        </div>
        {!txForm && (
          <>
            <span className="ls-nav-sep" aria-hidden />
            <div className="ls-panels" data-doc-id="load-schedule-panels">
              {groups[group].map((b) => (
                <button key={b.id} className={`chip${b.id === board.id ? ' on' : ''}`} title={incomplete(b) ? `${b.id}: schedule not filled yet` : b.name} onClick={() => b.id !== board.id && onBoard(b.id)}>
                  {b.id}{incomplete(b) && <span className="warn"> !</span>}
                </button>
              ))}
              {data.rows.length > 0 && mdAvailable && (
                <span className="seg ls-form">
                  <button className={form === 'db' ? 'on' : ''} onClick={() => setPick({ board: board.id, form: 'db' })}>Load schedule</button>
                  <button className={form === 'md' ? 'on' : ''} onClick={() => setPick({ board: board.id, form: 'md' })}>Connected load &amp; MD</button>
                </span>
              )}
            </div>
          </>
        )}
        {(() => {
          const c = dbChecks(project).find((x) => x.boardId === board.id);
          if (!c) return null;
          return (
            <span className={`ls-rooms ${c.status}`} title={`From Building information: the rooms this board serves and their room types' W/m². Serves ${c.rooms.length} room${c.rooms.length === 1 ? '' : 's'} (${c.rooms.map((x) => x.room.name).slice(0, 3).join(', ')}${c.rooms.length > 3 ? '…' : ''}), ${txt.size(c.areaM2)} m²: expected ${txt.power(c.expectedKw)} kW from the room types, designed ${txt.power(c.scheduledKw)} kW (${c.wPerM2.toFixed(1)} W/m²)${c.status === 'warn' ? ' — check' : ' — OK'}`}>
              Serves {c.rooms.length} room{c.rooms.length === 1 ? '' : 's'}{c.status === 'warn' ? ' — check' : ' — OK'}
            </span>
          );
        })()}
      </div>
      {form === 'riser' ? (
        <RiserFormView project={project} onOpenRiser={() => onOpenRiser?.()} />
      ) : form === 'tx' ? (
        <TxSummaryView project={project} onChange={onChange} onSettings={onSettings}
          onTools={(t) => { txTools.current = t; setTxShown((q) => (q.row === t?.row && q.substation === (t?.substation ?? '') ? q : { row: t?.row, substation: t?.substation ?? '' })); }} />
      ) : form === 'md' ? (
        <MdSheetView project={project} boardId={board.id} onChange={onChange} onStatus={onStatus} onSettings={onSettings}
          onTools={(t) => { mdTools.current = t; setMdShown((q) => (q.row === t?.row && q.rowBlock === t?.rowBlock && q.dupBlock === t?.dupBlock ? q : { row: t?.row, rowBlock: t?.rowBlock, dupBlock: t?.dupBlock })); }} />
      ) : (
        <>
          <div className="ls-head">
            <span><span className="m">Project</span> <b>{project.name}</b></span>
            <span><span className="m">DB No.</span> <b>{board.id}</b></span>
            <span><span className="m">Fed from</span> <b>{board.upstreamId ?? 'Transformer'}</b></span>
            <label><span className="m">Location</span> <input value={board.location ?? ''} onChange={(e) => setBoard({ location: e.target.value || undefined })} /></label>
            <span><span className="m">Incomer</span> <b>{data.incomer ? `${data.incomer.breakerRatingA} A TP&N` : board.ratedCurrentA ? `${board.ratedCurrentA} A` : '—'}</b></span>
            <label title="The size of the ELCBs for ways that have none yet; the ELCBs already on this DB keep their ways"><span className="m">New ELCBs</span>
              <select value={newSize} onChange={(e) => onChange(setNewElcbSize(project, board.id, +e.target.value as ElcbSize), { step: true })}>
                {ELCB_SIZES.map((n) => <option key={n} value={n}>{n} circuits ({n / 3} way{n > 3 ? 's' : ''})</option>)}
                <option value={0}>No ELCB</option>
              </select>
            </label>
            <button className="chip" title="Cut the whole DB again into ELCBs of one size, after showing what changes" onClick={() => setRegroupOpen(true)}>Re-group all ELCBs…</button>
            <label><span className="m">Sensitivity</span>
              <select value={board.elcbSensitivityMa ?? ''} onChange={(e) => setBoard({ elcbSensitivityMa: e.target.value === '' ? undefined : +e.target.value })}>
                <option value="">Auto (lighting {settings.elcbLightingMa} / power {settings.elcbPowerMa} mA)</option>
                {[30, 100, 300].map((m) => <option key={m} value={m}>All {m} mA</option>)}
              </select>
            </label>
            <label title="RCD type of the ELCBs and RCBOs that have none of their own. Auto: Type A, or B for an EV charger, 3-phase drive or PV named in the remarks, F for a 1-phase drive; printed only when it is not A"><span className="m">RCD type</span>
              <select value={board.rcdType ?? ''} onChange={(e) => setBoard({ rcdType: (e.target.value || undefined) as RcdType | undefined })}>
                <option value="">Auto (A; B for EV, drives, PV)</option>
                {RCD_TYPES.map((t) => <option key={t.value} value={t.value}>All {t.label}</option>)}
              </select>
            </label>
          </div>

          {missing.length > 0 && (
            <p className="ls-missing warn">
              Enter WATT / UNIT for: {missing.map((t) => pointLabel(board, t, project)).join(', ')} — circuits using them count as 0 W until you do.
            </p>
          )}
          <div className="ls-actions">
            <span className="m ls-add-lbl">Add</span>
            <button className="chip primary" title={`Add a circuit in the next free way of ${board.id}`} onClick={() => add()}><ListPlus size={15} /> 1-phase circuit</button>
            <button className="chip" title={`Add a 3-phase circuit (RYB) to ${board.id}`} onClick={() => add('RYB')}><ListPlus size={15} /> 3-phase circuit</button>
            <span className="ls-sep" aria-hidden />
            <MenuButton label={<><ShieldCheck size={15} /> ELCB / RCD</>} title="Earth leakage protection: the selected circuit's ELCB, an ELCB over ways, or a 1-phase RCBO in place of a circuit's MCB">
              {(close) => (
                <>
                  {activeGroup && (
                    <>
                      <div className="mp-h">ELCB-{activeGroup.index} · {elcbWaysText(activeGroup.ways)} · size</div>
                      <ElcbSizes group={activeGroup} onPick={(n) => { close(); resize(activeGroup, n); }} />
                      <button onClick={() => { close(); editElcb(activeGroup); }}>Edit ELCB-{activeGroup.index}…</button>
                      <button title="Its ways take the New ELCBs size" onClick={() => { close(); removeElcb(activeGroup); }}>Remove ELCB-{activeGroup.index}</button>
                      <hr />
                    </>
                  )}
                  <div className="mp-h">Earth leakage protection</div>
                  <button title="An ELCB over whole ways (R, Y and B of each way); ELCBs already there give those ways up" onClick={() => { close(); setElcbDlg({ kind: 'elcb', from: activeRow?.f.way ?? 1, to: activeRow?.f.way ?? 1 }); }}>3-phase ELCB (4P, TP&amp;N) over ways…</button>
                  {activeRow && activeRow.f.phase === 'RYB' && !(activeGroup && activeGroup.ways.length === 1)
                    ? <button title="An ELCB over the way of this 3-phase circuit; the ELCB it is under gives that way up" onClick={() => { close(); setElcbDlg({ kind: 'elcb', from: activeRow.f.way!, to: activeRow.f.way! }); }}>3-phase ELCB for {activeRow.ref} only</button>
                    : <button disabled title="Select a 3-phase circuit that does not have an ELCB of its own yet">3-phase ELCB for the selected 3-phase circuit</button>}
                  {activeRow && activeRow.rcbo?.kind !== 'rcbo'
                    ? <button title={`The circuit's breaker becomes an RCBO (MCB and earth leakage in one, ${activeRow.f.phase === 'RYB' ? '4P' : '2P'}); it leaves the ELCB of its ways`} onClick={() => { close(); placeRcbo(); }}>RCBO for {activeRow.ref} ({activeRow.f.phase === 'RYB' ? '4P' : '2P'})</button>
                    : <button disabled title="Select a circuit that is not an RCBO yet first">RCBO for the selected circuit</button>}
                  {activeRow && activeRow.f.phase !== 'RYB' && activeRow.rcbo?.kind !== 'afdd'
                    ? <button title="An RCBO with arc fault detection (IEC 62606) in place of the MCB; it leaves the ELCB of its ways" onClick={() => { close(); placeRcbo('afdd'); }}>AFDD + RCBO for {activeRow.ref}</button>
                    : <button disabled title="Select a 1-phase circuit that has no AFDD + RCBO yet first">AFDD + RCBO for the selected 1-phase circuit</button>}
                  {activeRow && activeRow.rcbo?.kind !== 'addon'
                    ? <button title="The MCB stays and an RCD add-on block is clipped to it, for ratings or curves where no RCBO is made; it leaves the ELCB of its ways" onClick={() => { close(); placeRcbo('addon'); }}>MCB + RCD add-on block for {activeRow.ref}</button>
                    : <button disabled title="Select a circuit that has no RCD add-on block yet first">MCB + RCD add-on block for the selected circuit</button>}
                  {activeRow && !activeRow.none
                    ? <button title="No earth leakage device on purpose (fire alarm panel, life safety); asks the reason" onClick={() => { close(); setElcbDlg({ kind: 'none', feederId: activeRow.f.id }); }}>No RCD for {activeRow.ref}…</button>
                    : !activeRow && <button disabled title="Select a circuit first">No RCD for the selected circuit…</button>}
                  {activeRow?.rcbo && (
                    <>
                      <hr />
                      <button onClick={() => { close(); setElcbDlg({ kind: 'rcbo', feederId: activeRow.f.id }); }}>Edit {activeRow.rcbo.name}…</button>
                      <button onClick={() => { close(); removeRcbo(); }}>Remove {activeRow.rcbo.name}</button>
                    </>
                  )}
                  {activeRow?.none && (
                    <>
                      <hr />
                      <button onClick={() => { close(); setElcbDlg({ kind: 'none', feederId: activeRow.f.id }); }}>Edit the No RCD reason…</button>
                      <button onClick={() => { close(); backOnElcb(); }}>Put {activeRow.ref} back on its ELCB</button>
                    </>
                  )}
                  <hr />
                  <button title="Cut the whole DB again into ELCBs of one size, after showing what changes" onClick={() => { close(); setRegroupOpen(true); }}>Re-group all ELCBs…</button>
                </>
              )}
            </MenuButton>
            <span className="ls-sep" aria-hidden />
            <button className="chip" title="A 1-phase way with a breaker fitted and nothing connected" onClick={() => addSpare('spare')}><SquareDashed size={15} /> Spare 1-phase</button>
            <button className="chip" title="A 3-phase way with a breaker fitted and nothing connected" onClick={() => addSpare('spare', 'three')}><SquareDashed size={15} /> Spare 3-phase</button>
            <MenuButton label={<><Square size={15} /> Space</>} title="An empty way kept for a future breaker">
              {(close) => (
                <>
                  <button title="A 1-phase empty way kept for a future breaker" onClick={() => { close(); addSpare('space'); }}>1-phase space</button>
                  <button title="A 3-phase empty way kept for a future breaker" onClick={() => { close(); addSpare('space', 'three'); }}>3-phase space</button>
                </>
              )}
            </MenuButton>
            <span className="ls-sep" aria-hidden />
            <button className="chip" title="Spread the 1-phase circuits over R / Y / B inside each ELCB, so every ELCB keeps its circuits; circuits that move are renumbered" disabled={!canBalance} onClick={() => now.balance()}><Scale size={15} /> Balance phases</button>
            <span className="sp" />
            <span>
              Phase load (W): <b className="ph-r">R {fmtFixed(data.phaseW.R * 1000, 0)}</b> · <b className="ph-y">Y {fmtFixed(data.phaseW.Y * 1000, 0)}</b> ·{' '}
              <b className="ph-b">B {fmtFixed(data.phaseW.B * 1000, 0)}</b> · imbalance{' '}
              <b className={data.imbalance > 20 ? 'warn' : 'ok'}>{data.imbalance.toFixed(0)}%</b>
            </span>
            <span className="m gx-hint" aria-label="Excel keys" title="Arrows / Enter move · Shift+arrows or drag select · Ctrl/⌘ C copy · Ctrl/⌘ V paste from Excel · Ctrl/⌘ D fill down · Delete clears the selection · New rows go in the next free way (R1 → Y1 → B1 → R2 …); a 3-phase circuit or spare takes a whole way."><Keyboard size={16} /></span>
          </div>

          {current && why && (
            <div className="ls-missing warn" role="status" aria-label="Circuit to check">
              <span className="m">Problem {problems.indexOf(current) + 1} of {problems.length} · {board.id}</span>{' '}
              <b>{current.ref}{current.f.room ? ` · ${current.f.room}` : ''}</b>{' '}
              <span className={current.status}>{STATUS_LABEL[current.status]}</span>
              {why.reasons.length > 0 && <> — {why.reasons.join('; ')}</>}{' '}
              {why.fixes.map((x) => <button key={x.label} className="chip" onClick={() => applyFix(current, x)}>{x.label}</button>)}{' '}
              <button className="chip" onClick={check}>Next problem</button>{' '}
              <button className="icon-btn" title="Close" aria-label="Close" onClick={() => setBar(null)}><X size={14} /></button>
            </div>
          )}
          {(
            <div className="ls-wrap" ref={grid} data-doc-id="load-schedule-grid">
              <table className="ls">
                <thead>
                  <tr>
                    <th rowSpan={2}>ELCB</th><th rowSpan={2}>Sl.</th><th rowSpan={2}>Cir No.</th><th rowSpan={2}>MCB (A)</th>
                    <th rowSpan={2}>CCT wire mm²</th><th rowSpan={2}>ECC mm²</th><th rowSpan={2}>Room / area</th>
                    <th colSpan={columns.length}>Connected loads / points</th>
                    <th colSpan={3} className="shade">Load per circuit (W)</th>
                    <th rowSpan={2} title="Not on the authority form — used only for voltage drop and earth-fault checks">Length (m)<br /><span className="m">calc only</span></th><th rowSpan={2}>Check</th><th rowSpan={2}>Remarks</th><th rowSpan={2}></th>
                  </tr>
                  <tr>
                    {columns.map((t) => (
                      <th key={t.value} title={t.title} className="pt">
                        {t.value.startsWith('spare') ? (
                          <input className="hdr-in" value={pointLabel(board, t.value, project)} onChange={(e) => setBoard({ spareNames: { ...board.spareNames, [t.value]: e.target.value } })} aria-label={`${t.title} heading`} />
                        ) : t.label}
                      </th>
                    ))}
                    <th className="shade">R</th><th className="shade">Y</th><th className="shade">B</th>
                  </tr>
                  <tr className="watt-row">
                    <td colSpan={7}><b>WATT / UNIT</b></td>
                    {columns.map((t) => (
                      <td key={t.value} className={missing.includes(t.value) ? 'missing' : ''} title={board.pointItems?.[t.value] ? `From library: ${board.pointItems[t.value]}` : undefined}>
                        {/* Typing a value unlinks the column from the library. */}
                        <input inputMode="numeric" data-cell={cellKey(rowOf.get('__watts') ?? 0, colOf(`pt:${t.value}`))} value={watts[t.value] || ''} placeholder="W" aria-label={`${t.title} watts per point`}
                          onChange={(e) => setBoard({ pointWatts: { ...board.pointWatts, [t.value]: num(e.target.value) }, pointItems: { ...board.pointItems, [t.value]: undefined } }, true)} />
                        {db.loads.length > 0 && (
                          <select className={`lib-pick ${board.pointItems?.[t.value] ? 'linked' : ''}`} value={board.pointItems?.[t.value] ?? ''} aria-label={`${t.title} from library`}
                            onChange={(e) => {
                              const item = db.loads.find((l) => l.name === e.target.value);
                              setBoard(item
                                ? { pointWatts: { ...board.pointWatts, [t.value]: item.watts }, pointItems: { ...board.pointItems, [t.value]: item.name } }
                                : { pointItems: { ...board.pointItems, [t.value]: undefined } }, true);
                            }}>
                            <option value="">{board.pointItems?.[t.value] ? 'unlink' : 'library…'}</option>
                            {loadsForColumn(db, t.value).map((l) => <option key={l.name} value={l.name}>{l.name} ({l.watts} W)</option>)}
                          </select>
                        )}
                      </td>
                    ))}
                    <td colSpan={3} className="shade" /><td colSpan={4} />
                  </tr>
                </thead>
                <tbody>
                  {data.entries.length === 0 && (
                    <tr><td colSpan={7 + columns.length + 7} className="m">No circuits yet — use 1-phase circuit or 3-phase circuit above to start this DB's schedule.</td></tr>
                  )}
                  {data.entries.map((e, i) => {
                    const g = e.group;
                    const c = elcbCells[i];
                    const cg = c?.group;
                    const mixed = !!cg && cg.category === 'mixed';
                    const covers = !cg ? '' : cg.ways.length === 1 && cg.circuits.length === 1 && cg.circuits[0].phase === 'RYB' ? 'this circuit' : `${cg.ways.length * 3} circuits`;
                    const elcbTd = !c ? null : c.rcbo ? (
                      <td className="elcb">{c.rcbo.name}<br />{c.rcbo.label}<br /><span className="m">this circuit</span></td>
                    ) : c.none ? (
                      <td className="elcb" title="No earth leakage device on purpose: the earth fault check rests on the MCB alone">No RCD<br /><span className="m">{c.none}</span></td>
                    ) : cg ? (
                      <td rowSpan={c.span} className={`elcb ${mixed ? 'warn' : ''}`} onClick={(ev) => setCellMenu({ index: cg.index, at: ev.currentTarget.getBoundingClientRect() })}
                        title={`${mixed ? 'Lighting and power share this ELCB — Re-group all ELCBs… with “Keep lighting and power circuits apart” separates them. ' : ''}Click to change ELCB-${cg.index} (${elcbWaysText(cg.ways)})`}>
                        ELCB-{cg.index}<br />{cg.label}<br /><span className="m">{covers} · {mixed ? 'mixed!' : cg.category}</span>
                      </td>
                    ) : <td />;
                    if (e.type === 'spare') {
                      const sp = e.spare;
                      return (
                        <tr key={`sp:${sp.id}`} className={`ls-spare${g && g.index % 2 === 0 ? ' alt' : ''}`}>
                          {elcbTd}
                          <td>{e.sl}</td>
                          <td><b className={`ph-${sp.phase === 'RYB' ? 'ryb' : sp.phase.toLowerCase()}`}>{spareRef(sp)}</b></td>
                          <td>{sp.kind === 'spare' ? (
                            <GridSelect value={sp.ratingA} aria-label={`${spareRef(sp)} spare MCB`} options={mcbOptions(sp.ratingA)} onPick={(a) => onChange(updateSpareWay(project, board.id, sp.id, { ratingA: a }))} />
                          ) : <span className="m">—</span>}</td>
                          <td /><td />
                          <td><b>{spareLabel(sp)}</b></td>
                          {columns.map((t) => <td key={t.value} />)}
                          <td className="shade" /><td className="shade" /><td className="shade" />
                          <td /><td />
                          <td><input className="room" value={sp.remarks ?? ''} onChange={(ev) => onChange(updateSpareWay(project, board.id, sp.id, { remarks: ev.target.value || undefined }))} aria-label={`${spareRef(sp)} remarks`} /></td>
                          <td>
                            <button className="icon-btn" aria-label={`Convert ${spareLabel(sp).toLowerCase()} ${spareRef(sp)} to circuit`} title={`Convert ${spareLabel(sp).toLowerCase()} ${spareRef(sp)} to circuit`} onClick={() => void convertWay(sp)}>
                              <ListPlus size={14} />
                            </button>
                            <button className="icon-btn" title={`Delete ${spareLabel(sp).toLowerCase()} ${spareRef(sp)}`} onClick={async () => (await ask(`Delete ${spareLabel(sp).toLowerCase()} ${spareRef(sp)}?`)) && onChange(deleteSpareWay(project, board.id, sp.id).project)}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    }
                    const r = e.row;
                    const f = r.f;
                    return (
                      <tr key={f.id} className={g && g.index % 2 === 0 ? 'alt' : ''} title="Double-click to edit this circuit" onDoubleClick={(ev) => openEdit(ev, f.id)}>
                        {elcbTd}
                        <td data-cell={cell(f.id, 'sl')}>{r.sl}</td>
                        <td>
                          <b className={`ph-${f.phase === 'RYB' ? 'ryb' : f.phase!.toLowerCase()}`}>{r.ref}</b>
                          <span className={`cat cat-${r.category}`} title={r.category === 'lighting' ? 'Lighting circuit' : 'Power circuit'}>{r.category === 'lighting' ? 'L' : 'P'}</span>
                        </td>
                        <td>
                          <GridSelect data-cell={cell(f.id, 'mcb')} aria-label={`${r.ref} MCB`} value={f.breakerRatingA} options={mcbOptions(f.breakerRatingA)} onPick={(a) => patch(f.id, { breakerRatingA: a })} />
                        </td>
                        <td>
                          <select data-cell={cell(f.id, 'wire')} value={f.cableCsaMm2} onChange={(e) => patch(f.id, { cableCsaMm2: +e.target.value })}>
                            {cables().map((c) => <option key={c.csaMm2} value={c.csaMm2}>{c.csaMm2}</option>)}
                          </select>
                        </td>
                        <td>
                          <select data-cell={cell(f.id, 'ecc')} value={f.cpcMm2 ?? ''} onChange={(e) => patch(f.id, { cpcMm2: e.target.value === '' ? undefined : +e.target.value })} title="Protective (earth) conductor">
                            <option value="">{defaultCpcMm2(f.cableCsaMm2)}</option>
                            {cables().filter((c) => c.csaMm2 <= f.cableCsaMm2).map((c) => <option key={c.csaMm2} value={c.csaMm2}>{c.csaMm2}*</option>)}
                          </select>
                        </td>
                        <td><input className="room" data-cell={cell(f.id, 'room')} value={f.room ?? ''} placeholder="Room" onChange={(e) => patch(f.id, { room: e.target.value })} /></td>
                        {columns.map((t) => itemizedTypes(f).has(t.value) ? (
                          // Mixed load items: the count is their sum, edited in the circuit dialog.
                          <td key={t.value} className="itemized" title={`${loadItemsText(f, t.value)} — double-click to edit the load items`}>
                            <input readOnly className="pt-in" data-cell={cell(f.id, `pt:${t.value}`)} value={f.points?.[t.value as PointType] || ''} aria-label={`${r.ref} ${t.title} (load items)`} />
                          </td>
                        ) : (
                          <td key={t.value}>
                            <input inputMode="numeric" className="pt-in" data-cell={cell(f.id, `pt:${t.value}`)} value={f.points?.[t.value as PointType] || ''} aria-label={`${r.ref} ${t.title}`}
                              onChange={(e) => patch(f.id, { points: { ...f.points, [t.value]: num(e.target.value) } })} />
                          </td>
                        ))}
                        <td className="shade" data-cell={cell(f.id, 'R')}>{r.ph.R}</td><td className="shade" data-cell={cell(f.id, 'Y')}>{r.ph.Y}</td><td className="shade" data-cell={cell(f.id, 'B')}>{r.ph.B}</td>
                        <td><input inputMode="decimal" className="pt-in" key={f.lengthM} data-cell={cell(f.id, 'length')} defaultValue={f.lengthM}
                          onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (v > 0 && v !== f.lengthM) patch(f.id, { lengthM: v }); else e.target.value = String(f.lengthM); }}
                          aria-label={`${r.ref} length`} /></td>
                        <td className={r.status} title={r.belowMin ? `Wire below the ${r.minWire} mm² minimum for ${r.category} circuits` : odd.has(f.id) ? oddTitle(f, odd.get(f.id)!) : undefined}>
                          {r.belowMin ? `< ${r.minWire} mm²` : STATUS_LABEL[r.status]}
                          {odd.has(f.id) && <>{' '}<button className="chip" title={oddTitle(f, odd.get(f.id)!)} onClick={() => makeOddRcbo(f, r.ref, odd.get(f.id)!)}>Make RCBO</button></>}
                        </td>
                        <td><input className="room" data-cell={cell(f.id, 'remarks')} value={f.remarks ?? ''} onChange={(e) => patch(f.id, { remarks: e.target.value || undefined })} aria-label={`${r.ref} remarks`} /></td>
                        <td>
                          <button className="icon-btn" title={`Delete ${r.ref}`} onClick={async () => (await ask(`Delete circuit ${r.ref}?`)) && onChange(deleteCircuit(project, f.id))}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total">
                    <td colSpan={7 + columns.length} style={{ textAlign: 'right' }}>TOTAL (W)</td>
                    <td className="shade">{fmtFixed(data.phaseW.R * 1000, 0)}</td>
                    <td className="shade">{fmtFixed(data.phaseW.Y * 1000, 0)}</td>
                    <td className="shade">{fmtFixed(data.phaseW.B * 1000, 0)}</td>
                    <td colSpan={4} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {elcbDlg && <ElcbDialog project={project} board={board} target={elcbDlg} onSave={(v) => saveElcb(elcbDlg, v)} onClose={() => setElcbDlg(null)} />}
          {regroupOpen && <RegroupDialog project={project} board={board} onApply={regroup} onClose={() => setRegroupOpen(false)} />}
          {cellMenu && menuGroup && (
            <ElcbCellMenu group={menuGroup} at={cellMenu.at} onClose={() => setCellMenu(null)}
              onResize={(n) => resize(menuGroup, n)} onEdit={() => editElcb(menuGroup)} onRemove={() => removeElcb(menuGroup)} onRegroup={() => setRegroupOpen(true)} />
          )}
          {templateOpen && <TemplateExportDialog project={project} boardId={board.id} onStatus={onStatus} onClose={() => setTemplateOpen(false)} />}
          {editRow && (
            <CircuitEditDialog project={project} board={board} feeder={editRow.f} circuitRef={editRow.ref} columns={columns} library={db.loads} focus={editing!.focus}
              onSave={(pt) => { patch(editRow.f.id, pt); setEditing(null); }}
              onDelete={() => { onChange(deleteCircuit(project, editRow.f.id)); setEditing(null); }}
              onClose={() => setEditing(null)} />
          )}
          <p className="m note">
            ECC: the plain number is the IEC 60364-5-54 default; a starred size was chosen by hand ({data.rows.filter((r) => r.f.cpcMm2 !== undefined).length} set).
            {' '}Length isn't on the authority form or its PDF — it's only used for the voltage drop and earth-fault checks (default 20 m).
            {otherFeeders.length > 0 && ` Also on this board (not schedule circuits): ${otherFeeders.map((f) => f.id).join(', ')}.`}
          </p>
        </>
      )}
    </Page>
  );
}
