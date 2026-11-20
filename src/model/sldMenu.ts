import type { FeederResult } from '../calc/electrical';
import { breakerTypeOf } from '../calc/earthing';
import { failReasons, quickFixes } from '../calc/quickFix';
import type { SupplyMode } from '../calc/scenario';
import { groups, type CtxEntry, type CtxHead, type CtxItem } from '../components/cad/cadContextMenu';
import { COLOR_BY, type ColorBy } from '../diagram/heatmap';
import { LAYER_LABELS, type ResultLayers } from '../diagram/annotations';
import { autoCableTypeOf, CABLE_TYPE_DEFS } from './cableTypes';
import { isSinglePhase, phaseTag } from './phases';
import { kindOf } from './renamePanels';
import { canDrop, TIE_OPERATION, tieRatings, type MoveItem, type PaletteItem } from './sldEdit';
import { branchItems, orderTarget, selectAll, type PickItem } from './sldMenuEdit';
import { mainBoards, txTag } from './transformers';
import { partInfo, partKey, partMains, type SldPart } from '../diagram/mvShow';
import { isScheduleCircuit } from '../calc/loadSchedule';
import { rmuRecord, rmuWays } from '../calc/hvSupply';
import { txUnits } from './earthingPlan';
import { rmuChoices, substationNames, type RmuChoice } from './substations';
import { METER_TYPES, RMU_CONFIGS, type Board, type Feeder, type Project } from '../types';
import { txt } from '../util/format';

/** The right-click menus of the single line diagram (docs/notes/Future development/UI UX proposals - 2026-11-18 - SLD
 * right-click menu and edit tools.md). Pure: what a board, a load, a transformer, a bus coupler and the empty drawing offer,
 * built from the project and the page's state. Every row runs an action the page handles (`act: 'sld'`, `arg` = "action" or
 * "action|value"); a row that does not apply is left off, not greyed. */

export type SldTarget =
  | { kind: 'board'; id: string }
  | { kind: 'feeder'; id: string }
  | { kind: 'supply'; boardId: string }
  | { kind: 'tie'; id: string }
  | { kind: 'several'; items: PickItem[] }
  | { kind: 'rmu'; name: string }
  | { kind: 'substation'; name: string }
  | { kind: 'canvas' };

export interface SldMenuState {
  project: Project;
  /** The project the results were calculated for. */
  calcProject: Project;
  results: FeederResult[];
  /** The clipboard: a board, or one or more loads. */
  copiedBoard?: string;
  copiedLoads?: string[];
  canUndo: boolean;
  canRedo: boolean;
  layers: ResultLayers;
  colorBy: ColorBy;
  supply: SupplyMode;
  hasGenerator: boolean;
  /** Main boards whose transformer can be taken out (the SLD ribbon's Scenario list). */
  outages: string[];
  /** The drawing's own view settings. */
  grid: 'lines' | 'dots' | 'off';
  detail: 'auto' | 'all';
  /** The board whose branch the drawing shows alone, if any. */
  branch?: string;
  /** The part of the network drawn (Show, mvShow.ts partKey), when not the whole network. */
  part?: string;
}

/** Every action the menus run (sldMenuRun.ts handles each one). */
export const SLD_MENU_ACTIONS: readonly string[] = [
  'edit', 'schedule', 'diagram', 'add', 'copy', 'paste', 'duplicate', 'repeat', 'move', 'supplyfrom', 'moveto', 'order', 'rename', 'cabletype', 'lengthchecked', 'delete', 'plan', 'zoom', 'properties',
  'quickfix', 'editcable', 'change', 'together', 'similar', 'below', 'select', 'deselect', 'txsizing', 'hv', 'addsupply', 'scenario', 'tieop', 'tierating', 'tieremove',
  'undo', 'redo', 'branch', 'showall', 'fit', 'grid', 'text', 'values', 'colour', 'export', 'part', 'txsubstation', 'txrmu', 'rmuconfig', 'rmunop'
];

/** Actions the drawing does itself (its view, its cable editor); the page is not told of them. */
export const SLD_VIEW_ACTIONS: readonly string[] = ['fit', 'branch', 'showall', 'grid', 'text', 'editcable', 'move', 'supplyfrom', 'moveto', 'similar', 'below', 'select', 'deselect'];

/** Where a menu opens: the system diagram, or one board's tab (which leaves off the rows whose tools live only on the system diagram). */
export type SldWhere = 'system' | 'board';

/** A picked row's arg, "action|value", as [action, value]. */
export const sldAction = (x: CtxItem): [string, string | undefined] => {
  const [a, ...v] = (x.arg ?? '').split('|');
  return [a, v.length ? v.join('|') : undefined];
};

const row = (label: string, arg: string, more: Partial<CtxItem> = {}): CtxItem => ({ label, act: 'sld', arg, ...more });

/** The Scenario list: also on a transformer, a bus coupler and the empty drawing. */
const scenarioList = (s: SldMenuState): CtxItem => ({
  label: 'Scenario', icon: 'reverse',
  sub: [
    row('Normal supply', 'scenario|normal', { now: s.supply === 'normal' }),
    row('On generator (mains lost)', 'scenario|generator', { now: s.supply === 'generator', off: !s.hasGenerator }),
    ...s.outages.map((id) => row(`Transformer of ${id} failed`, `scenario|outage:${id}`, { now: s.supply === `outage:${id}` }))
  ]
});

/** Order ▸: one way left or right, first or last on the busbar; each entry only when it moves something. */
function orderList(project: Project, item: MoveItem, bus: string): CtxItem {
  const can = (how: 'left' | 'right' | 'first' | 'last') => !!orderTarget(project, item, how);
  return {
    label: 'Order', icon: 'reverse',
    sub: [
      ...(can('left') ? [row('Move left', 'order|left', { key: 'Alt+←' })] : []),
      ...(can('right') ? [row('Move right', 'order|right', { key: 'Alt+→' })] : []),
      '-',
      ...(can('first') ? [row(`First on ${bus}'s busbar`, 'order|first')] : []),
      ...(can('last') ? [row(`Last on ${bus}'s busbar`, 'order|last')] : [])
    ]
  };
}

const view = (id: string, sys = true, zoomLabel = `Zoom to ${id}`): CtxEntry[] => [row('Show on plan', 'plan', { icon: 'locate' }), ...(sys ? [row(zoomLabel, 'zoom', { key: 'Z', icon: 'zoom' })] : [])];
const props = (): CtxEntry[] => [row('Properties', 'properties', { icon: 'properties' })];

/** The cable types of a board's ways, as the Panels tree's menu offers them. */
const cableTypeList = (project: Project, b: Board): CtxItem | undefined => {
  const ways = project.feeders.filter((f) => f.boardId === b.id && !isScheduleCircuit(f));
  if (!ways.length) return undefined;
  const same = ways.every((f) => f.cableType === ways[0].cableType) ? ways[0].cableType ?? 'auto' : undefined;
  return {
    label: 'Outgoing cable type', icon: 'route',
    sub: [
      row('Automatic (fire-rated for life safety)', 'cabletype|auto', { now: same === 'auto' }),
      ...CABLE_TYPE_DEFS.filter((d) => d.value !== 'XLPE/SWA/PVC').map((d) => row(d.label, `cabletype|${d.value}`, { now: same === d.value }))
    ]
  };
};

function boardMenu(s: SldMenuState, id: string, where: SldWhere, here?: string) {
  const sys = where === 'system';
  // On the Board tab a sub-board's Add and Properties need that board picked, which would switch the tab: left off there.
  const local = sys || here === undefined || here === id;
  const { project } = s;
  const b = project.boards.find((x) => x.id === id);
  if (!b) return null;
  const kva = b.sourceKva ? `${b.sourceKva} kVA transformer` : undefined;
  const detail = [kindOf(b), b.ratedCurrentA ? `${b.ratedCurrentA} A` : undefined, b.upstreamId ? `from ${b.upstreamId}` : kva].filter(Boolean).join(' · ');
  const up = b.upstreamId;
  const copied = s.copiedBoard && s.copiedBoard !== id && project.boards.some((x) => x.id === s.copiedBoard) ? s.copiedBoard : undefined;
  const loads = copied ? [] : (s.copiedLoads ?? []).filter((x) => project.feeders.some((f) => f.id === x && !f.feedsBoardId));
  const incomerChecked = project.feeders.some((f) => f.feedsBoardId === id && f.lengthToCheck);
  const cables = cableTypeList(project, b);
  const item: MoveItem = { kind: 'board', id };
  const items = groups(
    [row(`Edit ${id}…`, 'edit', { key: 'F2', icon: 'edtext' }), row('Load schedule', 'schedule', { icon: 'schedule' }), ...(sys || here !== id ? [row('Board diagram', 'diagram', { key: 'Ctrl+2', icon: 'sld' })] : []),
      ...(local ? [{
        label: 'Add', icon: 'plus' as const,
        sub: [row('Load…', 'add|load', { icon: 'circuit' }), row('Motor…', 'add|motor'), row('Solar PV…', 'add|pv'), row('EV charger…', 'add|ev'), row('Feeder cable…', 'add|cable'), '-' as const, row('Sub-board…', 'add|board')]
      }] : [])],
    [row('Copy with everything below', 'copy', { key: 'Ctrl+C', icon: 'copy' }),
      ...(copied ? [row(`Paste ${copied} here`, 'paste', { key: 'Ctrl+V', icon: 'paste' })] : loads.length ? [row(`Paste ${loads.length === 1 ? loads[0] : `${loads.length} loads`} here`, 'paste', { key: 'Ctrl+V', icon: 'paste' })] : []),
      ...(up ? [row('Duplicate', 'duplicate', { key: 'Ctrl+D', icon: 'copyplus' }), row('Repeat branch on other floors…', 'repeat', { icon: 'layers' })] : [])],
    [...(up ? [...(sys ? [row('Move', 'move', { key: 'M', icon: 'move' }), row('Supply from…', 'supplyfrom', { icon: 'plug' })] : []), orderList(project, item, up)] : []),
      {
        label: 'Change', icon: 'sliders',
        sub: [row('Rename…', 'rename', { icon: 'textcursor' }), ...(cables ? [cables] : []), ...(incomerChecked ? [row('Incomer length checked', 'lengthchecked', { icon: 'status' })] : [])]
      },
      row(`Delete ${id} and everything below…`, 'delete', { key: 'Del', icon: 'delete', bad: true })],
    [...view(id, sys), ...(sys && s.branch !== id ? [row('Show this branch only', 'branch', { icon: 'isolate' })] : [])],
    sys && branchItems(project, id).length ? [row('Select everything below', 'below', { icon: 'similar' })] : [],
    local ? props() : []
  );
  return { head: { icon: 'board', title: id, detail } satisfies CtxHead, items, label: `${id} menu` };
}

/** The switching device of a load, as the SLD draws it. */
const deviceNow = (f: Feeder): 'ACB' | 'MCCB' | 'MCB' | 'ISOL' => {
  if (f.device === 'ISOL') return 'ISOL';
  const t = breakerTypeOf(f);
  return f.device === 'ACB' || t === 'ACB' ? 'ACB' : f.device === 'MCCB' || t === 'MCCB' ? 'MCCB' : 'MCB';
};

/** The Change list of one load, or of several (a current value is ticked only where all of them agree; Phase only when all are single-phase). */
function changeList(project: Project, fs: Feeder[]): CtxItem {
  const f = fs[0];
  const same = <T,>(get: (x: Feeder) => T): T | undefined => (fs.every((x) => get(x) === get(f)) ? get(f) : undefined);
  const all = (get: (x: Feeder) => unknown) => fs.every((x) => !!get(x));
  const dev = same(deviceNow);
  const rcdNow = same((x) => x.rcdMa ?? 0), meterNow = same((x) => x.kwhMeter ?? ''), typeNow = same((x) => x.cableType ?? '');
  const rcd = [...new Set([30, 100, 300, ...fs.map((x) => x.rcdMa ?? 0).filter(Boolean)])].sort((a, b) => a - b);
  const phase = same((x) => (isSinglePhase(x) ? phaseTag(x) : ''));
  return {
    label: 'Change', icon: 'sliders',
    sub: [
      { label: 'Switching device', icon: 'shield', sub: [['ACB', 'ACB'], ['MCCB', 'MCCB'], ['MCB', 'MCB'], ['Isolator', 'ISOL']].map(([l, v]) => row(l, `change|device|${v}`, { now: dev === v })) },
      { label: 'Earth leakage', icon: 'shieldalert', sub: [row('None', 'change|rcdMa|', { now: rcdNow === 0 }), ...rcd.map((m) => row(`${m} mA`, `change|rcdMa|${m}`, { now: rcdNow === m }))] },
      { label: 'kWh meter', icon: 'gauge', sub: [row('None', 'change|kwhMeter|', { now: meterNow === '' }), ...METER_TYPES.map((m) => row(m === 'CT' ? 'CT-operated' : `${m} direct`, `change|kwhMeter|${m}`, { now: meterNow === m }))] },
      ...(fs.every((x) => isSinglePhase(x)) ? [{ label: 'Phase', icon: 'waves' as const, sub: (['R', 'Y', 'B'] as const).map((p) => row(p, `change|phase|${p}`, { now: phase === p })) }] : []),
      {
        label: 'Cable type', icon: 'route',
        sub: [row(fs.length === 1 ? `Auto — ${autoCableTypeOf(project, f).label}` : 'Auto', 'change|cableType|', { now: typeNow === '' }),
          ...CABLE_TYPE_DEFS.filter((d) => d.value !== 'XLPE/SWA/PVC').map((d) => row(d.label, `change|cableType|${d.value}`, { now: typeNow === d.value }))]
      },
      '-',
      row('Essential (on the generator)', 'change|essential', { icon: 'power', on: all((x) => x.essential) }),
      row('Existing', 'change|existing', { icon: 'history', on: all((x) => x.existing) }),
      row('Local isolator', 'change|localIsolator', { icon: 'toggle', on: all((x) => x.localIsolator) })
    ]
  };
}

function loadMenu(s: SldMenuState, id: string, where: SldWhere) {
  const { project } = s;
  const sys = where === 'system';
  const f = project.feeders.find((x) => x.id === id);
  if (!f) return null;
  const r = s.results.find((x) => x.feeder.id === id);
  const status = r?.status ?? 'ok';
  const head: CtxHead = { icon: 'circuit', title: id, detail: `${f.name} · ${txt.power(f.loadKw)} kW · on ${f.boardId}` };
  if (r && status !== 'ok') {
    const why = failReasons(s.calcProject, r)[0];
    head.second = `${status === 'bad' ? 'Fails' : 'To check'}${why ? ` · ${why}` : ''}`;
    head.secondTone = status;
  }
  const fixes = status !== 'ok' ? quickFixes(s.calcProject, f) : [];
  const items = groups(
    [...(fixes.length ? [{
      label: 'Quick fix', icon: 'tools' as const,
      sub: fixes.map((x, i) => row(x.label, `quickfix|${i}`, { key: x.after.status === 'ok' ? 'passes' : 'still to check' }))
    }] : []),
    row(`Edit ${id}…`, 'edit', { key: 'F2', icon: 'edtext' }), ...(sys ? [row('Edit cable…', 'editcable', { icon: 'route' })] : []),
    changeList(project, [f])],
    [row('Copy', 'copy', { key: 'Ctrl+C', icon: 'copy' }), row('Duplicate', 'duplicate', { key: 'Ctrl+D', icon: 'copyplus' }), ...(sys ? [row('Move', 'move', { key: 'M', icon: 'move' }), row('Move to board…', 'moveto', { icon: 'plug' })] : []), orderList(project, { kind: 'feeder', id }, f.boardId), row(`Delete ${id}`, 'delete', { key: 'Del', icon: 'delete', bad: true })],
    view(id, sys),
    sys ? [similarList(s, f)] : [],
    props()
  );
  return { head, items, label: `${id} menu` };
}

/** Select similar ▸ on a load: the same load type on its board or everywhere, and the failing circuits when there are any. */
function similarList(s: SldMenuState, f: Feeder): CtxItem {
  const failing = selectAll(s.project, s.results, 'failing').length > 0;
  return {
    label: 'Select similar', icon: 'similar',
    sub: [row(`Same load type on ${f.boardId}`, 'similar|board'), row('Same load type everywhere', 'similar|all'), ...(failing ? [row('Every failing circuit', 'similar|failing')] : [])]
  };
}

/** What several picked boards and loads offer; every row works on all of them. */
function severalMenu(s: SldMenuState, items: PickItem[]) {
  const { project } = s;
  const boards = items.filter((x) => x.kind === 'board' && project.boards.some((b) => b.id === x.id));
  const feeders = items.filter((x): x is Extract<PickItem, { kind: 'feeder' }> => x.kind === 'feeder').map((x) => project.feeders.find((f) => f.id === x.id)).filter((f): f is Feeder => !!f && !f.feedsBoardId);
  const n = boards.length + feeders.length;
  if (n < 2) return null;
  const onOne = feeders.length === n && feeders.every((f) => f.boardId === feeders[0].boardId);
  const detail = onOne ? `${feeders.length} loads on ${feeders[0].boardId}` : [feeders.length ? `${feeders.length} load${feeders.length === 1 ? '' : 's'}` : '', boards.length ? `${boards.length} board${boards.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
  const dupable = feeders.length + boards.filter((b) => project.boards.find((x) => x.id === b.id)?.upstreamId).length > 0;
  const group = groups(
    [...(feeders.length ? [row('Edit together…', 'together', { icon: 'edtext' }), changeList(project, feeders)] : [])],
    [...(!boards.length && feeders.length ? [row('Copy', 'copy', { key: 'Ctrl+C', icon: 'copy' })] : []), ...(dupable ? [row('Duplicate', 'duplicate', { key: 'Ctrl+D', icon: 'copyplus' })] : [])],
    [row('Move to board…', 'moveto', { icon: 'plug' }), row(`Delete ${n}…`, 'delete', { key: 'Del', icon: 'delete', bad: true }), row('Zoom to the picked', 'zoom', { key: 'Z', icon: 'zoom' })],
    [...(feeders.length ? [similarList(s, feeders[0])] : []), row('Deselect all', 'deselect', { key: 'Esc', icon: 'deselect' })]
  );
  return { head: { icon: 'selectall', title: `${n} picked`, detail } satisfies CtxHead, items: group, label: `${n} picked menu` };
}

/** An RMU in a transformer's RMU list: its configuration, then how many tee-offs are used and free, "full → RRTT"
 * where taking this transformer makes it a bigger unit, or full. */
function rmuKey(c: RmuChoice): string {
  const use = c.current ? `${c.count} of ${c.max}` : c.grow ? `full → ${c.grow}` : c.full ? `full · ${c.count} of ${c.max}` : `${c.count} of ${c.max} · ${c.max - c.count} free`;
  return [c.config, use].filter(Boolean).join(' · ');
}

/** Substation ▸ and RMU ▸ of a transformer (proposal 2026-11-18 part 4): the substations in ring order and a new one,
 * and the RMUs with their free tee-offs and a new one, which starts as RRT. */
function arrangementRows(project: Project, b: Board): CtxItem[] {
  const ss = b.substation?.trim() || undefined, rmu = b.rmu?.trim() || undefined;
  const same = (n: string) => !!ss && n.toLowerCase() === ss.toLowerCase();
  return [
    {
      label: 'Substation', icon: 'sld', key: ss ?? 'none',
      sub: [row('None', 'txsubstation|', { now: !ss, off: !ss }), ...substationNames(project).map((n) => row(n, `txsubstation|${n}`, { now: same(n), off: same(n) })), '-', row('New substation…', 'txsubstation|+')]
    },
    {
      label: 'RMU', icon: 'hv', key: rmu ?? 'none',
      sub: [row('None', 'txrmu|', { now: !rmu, off: !rmu }), ...rmuChoices(project, b.id).map((c) => row(c.name, `txrmu|${c.name}`, { now: c.current, off: c.current || (c.full && !c.grow), key: rmuKey(c) })), '-', row('New RMU', 'txrmu|+', { key: 'starts as RRT' })]
    }
  ];
}

/** Configuration ▸ and Normally open ▸ of an RMU: a configuration with fewer tee-offs than its transformers is greyed;
 * the normally open switch only on a unit with two ring switches. */
function rmuRows(project: Project, name: string): CtxItem[] {
  const rec = rmuRecord(project, name);
  const config = rec?.config?.trim().toUpperCase() || undefined;
  const units = txUnits(project);
  const used = mainBoards(project).filter((b) => b.sourceKva && b.rmu?.trim() === name).reduce((n, b) => n + (units.get(b.id) ?? 1), 0);
  const nop = rec?.normallyOpen;
  const ways: [string, 'R1' | 'R2' | ''][] = [['None', ''], ['R1 (ring in)', 'R1'], ['R2 (ring out)', 'R2']];
  return [
    {
      label: 'Configuration', icon: 'sliders', key: config ?? '—',
      sub: [...new Set([...RMU_CONFIGS, ...(config ? [config] : [])])].map((c) => {
        const few = rmuWays(c).tOff < used;
        return row(c, `rmuconfig|${c}`, { now: c === config, off: c === config || few, ...(few ? { key: 'too few tee-offs' } : {}) });
      })
    },
    ...((config ? rmuWays(config).ring : 2) >= 2 ? [{
      label: 'Normally open', icon: 'toggle' as const, key: nop ?? 'none',
      sub: ways.map(([l, v]) => row(l, `rmunop|${v}`, { now: (nop ?? '') === v, off: (nop ?? '') === v }))
    }] : [])
  ];
}

function supplyMenu(s: SldMenuState, boardId: string) {
  const { project } = s;
  const b = project.boards.find((x) => x.id === boardId);
  if (!b) return null;
  const zoom = row(`Zoom to ${boardId}`, 'zoom', { key: 'Z', icon: 'zoom' });
  if (b.sourceKva) {
    const drops: [string, string, PaletteItem][] = [['Generator + ATS', 'generator', { kind: 'generator' }], ['Generator + interlocked ACBs', 'generator-acb', { kind: 'generator', changeover: 'ACB' }], ['Bus coupler / tie', 'tie', { kind: 'tie' }]];
    const add = drops.filter(([, , item]) => canDrop(project, item, { type: 'bus', boardId })).map(([l, v]) => row(l, `addsupply|${v}`));
    const detail = [`${b.sourceKva} kVA`, b.sourceImpedancePct !== undefined ? `${b.sourceImpedancePct} %` : undefined, `feeds ${boardId}`].filter(Boolean).join(' · ');
    const items = groups(
      [row('Edit transformer…', 'edit', { icon: 'edtext' }), row('Transformer & generator sizing', 'txsizing', { icon: 'txsizing' }), scenarioList(s), ...(add.length ? [{ label: 'Add', icon: 'plus' as const, sub: add }] : []), row('MV supply and RMUs…', 'hv', { icon: 'hv' })],
      arrangementRows(project, b),
      [zoom, row(`Show ${txTag(project, boardId) ?? boardId} only`, `part|${partKey({ kind: 'tx', id: boardId })}`, { icon: 'isolate', now: s.part === partKey({ kind: 'tx', id: boardId }) })], props()
    );
    return { head: { icon: 'transformer', title: txTag(project, boardId) ?? 'Transformer', detail } satisfies CtxHead, items, label: 'Transformer menu' };
  }
  if (!b.supply) return null;
  return {
    head: { icon: 'board', title: 'Meter cabinet', detail: `${b.supply.fedFrom ?? 'DEWA'} supply · feeds ${boardId}` } satisfies CtxHead,
    items: groups([row('Edit supply…', 'edit', { icon: 'edtext' })], [zoom, row(`Show ${boardId} only`, `part|${partKey({ kind: 'supply', id: boardId })}`, { icon: 'isolate', now: s.part === partKey({ kind: 'supply', id: boardId }) })], props()),
    label: 'Meter cabinet menu'
  };
}

function tieMenu(s: SldMenuState, id: string) {
  const t = s.project.ties?.find((x) => x.id === id);
  if (!t) return null;
  const items = groups(
    [row(TIE_OPERATION.open, 'tieop|open', { now: !t.closed }), row(TIE_OPERATION.closed, 'tieop|closed', { now: !!t.closed }),
      { label: 'Rating', icon: 'gauge', sub: tieRatings(t.ratingA).map((r) => row(r, `tierating|${parseInt(r, 10)}`, { now: parseInt(r, 10) === t.ratingA })) }, scenarioList(s)],
    [row('Remove this coupler…', 'tieremove', { icon: 'delete', bad: true })]
  );
  return { head: { icon: 'join', title: id, detail: `${t.ratingA} A · ${t.a} ↔ ${t.b}` } satisfies CtxHead, items, label: `${id} menu` };
}

/** An RMU on the ring, or a substation frame (Show, proposal 2026-11-18 part 2): show that part only; an RMU also has
 * its Configuration and Normally open (part 4). Ratings are entered in Panels → Transformers (MV supply and RMUs…). */
function mvMenu(s: SldMenuState, t: { kind: 'rmu' | 'substation'; name: string }) {
  const part: SldPart = t.kind === 'rmu' ? { kind: 'rmu', name: t.name } : { kind: 'substation', name: t.name };
  if (!partMains(s.project, part).length) return null;
  const info = partInfo(s.project, part), key = partKey(part);
  const items = groups(
    [row(`Show ${t.name} only`, `part|${key}`, { icon: 'isolate', now: s.part === key }), ...(s.part ? [row('Show all', 'part|all', { icon: 'isolate' })] : [])],
    t.kind === 'rmu' ? rmuRows(s.project, t.name) : [],
    [row('MV supply and RMUs…', 'hv', { icon: 'hv' })]
  );
  const detail = [info.detail, info.counts].filter(Boolean).join(' · ');
  return { head: { icon: t.kind === 'rmu' ? 'hv' : 'sld', title: t.kind === 'rmu' ? t.name : `Substation ${t.name}`, detail } satisfies CtxHead, items, label: `${t.name} menu` };
}

/** The empty drawing's Select list: only the choices that would pick something. */
function selectList(s: SldMenuState): CtxItem {
  const { project, results } = s;
  const kinds = [...new Set(project.boards.map((b) => kindOf(b)))];
  const has = (w: 'loads' | 'failing' | 'warn') => selectAll(project, results, w).length > 0;
  return {
    label: 'Select', icon: 'selectall',
    sub: [
      ...(has('loads') ? [row('All loads', 'select|loads')] : []),
      ...(has('failing') ? [row('Every failing circuit', 'select|failing')] : []),
      ...(has('warn') ? [row('Every circuit to check', 'select|warn')] : []),
      { label: 'Boards of one kind', sub: kinds.map((k) => row(k, `select|kind|${k}`)) }
    ]
  };
}

function canvasMenu(s: SldMenuState) {
  const { project } = s;
  const canvas = { type: 'canvas' } as const;
  const add: CtxEntry[] = [];
  if (canDrop(project, { kind: 'transformer' }, canvas)) add.push(row('Transformer', 'addsupply|transformer'));
  if (canDrop(project, { kind: 'board', board: 'MC' }, canvas)) add.push(row('Meter cabinet', 'addsupply|mc'));
  add.push('-', row('MV supply and RMUs…', 'hv', { icon: 'hv' }));
  const items = groups(
    [row('Undo', 'undo', { key: 'Ctrl+Z', icon: 'undo', off: !s.canUndo }), row('Redo', 'redo', { key: 'Ctrl+Y', icon: 'redo', off: !s.canRedo })],
    [{ label: 'Add', icon: 'plus', sub: add }],
    [...(s.branch ? [row('Show everything', 'showall', { icon: 'isolate' })] : []), ...(s.part ? [row('Show all', 'part|all', { icon: 'isolate' })] : []), row('Fit', 'fit', { key: 'F', icon: 'fit' }),
      { label: 'Grid', icon: 'grid', sub: [['Lines', 'lines'], ['Dots', 'dots'], ['None', 'off']].map(([l, v]) => row(l, `grid|${v}`, { now: s.grid === v })) },
      { label: 'Text', icon: 'text', sub: [row('Follows the zoom', 'text|auto', { now: s.detail === 'auto' }), row('All text', 'text|all', { now: s.detail === 'all' })] },
      { label: 'Values', icon: 'tags', sub: LAYER_LABELS.map(([k, l]) => row(l, `values|${k}`, { on: !!s.layers[k] })) },
      { label: 'Colour by', icon: 'palette', sub: COLOR_BY.map((c) => row(c.label, `colour|${c.value}`, { now: s.colorBy === c.value })) },
      scenarioList(s)],
    [selectList(s)],
    [row('Export…', 'export', { icon: 'export' })]
  );
  return { head: { icon: 'sld', title: 'System diagram', detail: project.name } satisfies CtxHead, items, label: 'Diagram menu' };
}

/** The menu of a target: its header, its rows and the label of the menu; null when the target is gone. `here` is the board
 * on screen on the Board tab (its own Board diagram row is left off). */
export function sldMenu(s: SldMenuState, t: SldTarget, where: SldWhere = 'system', here?: string): { head: CtxHead; items: CtxEntry[]; label: string } | null {
  switch (t.kind) {
    case 'board': return boardMenu(s, t.id, where, here);
    case 'feeder': return loadMenu(s, t.id, where);
    case 'supply': return supplyMenu(s, t.boardId);
    case 'tie': return tieMenu(s, t.id);
    case 'several': return severalMenu(s, t.items);
    case 'rmu': case 'substation': return mvMenu(s, t);
    case 'canvas': return canvasMenu(s);
  }
}
