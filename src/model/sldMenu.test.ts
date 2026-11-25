import { describe, expect, it } from 'vitest';
import { evaluateProject } from '../calc/electrical';
import { allItems, type CtxEntry, type CtxItem } from '../components/cad/cadContextMenu';
import { sampleProject } from '../data/sampleProject';
import { DEFAULT_LAYERS } from '../diagram/annotations';
import type { Project } from '../types';
import { SLD_MENU_ACTIONS, sldAction, sldMenu, type SldMenuState, type SldTarget } from './sldMenu';
import { withUids } from './stableIds';

const project: Project = withUids(structuredClone(sampleProject));
const state = (p: Project = project, more: Partial<SldMenuState> = {}): SldMenuState => ({
  project: p, calcProject: p, results: evaluateProject(p), canUndo: true, canRedo: false, layers: DEFAULT_LAYERS, colorBy: 'none', supply: 'normal',
  hasGenerator: false, outages: [], grid: 'lines', detail: 'all', ...more
});
const menu = (t: SldTarget, s: SldMenuState = state()) => sldMenu(s, t)!;
/** The labels of a list, '-' for a divider. */
const labels = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : x.label));
const sub = (list: CtxEntry[], label: string): CtxEntry[] => (list.find((x): x is CtxItem => x !== '-' && x.label === label)?.sub ?? []);
const find = (list: CtxEntry[], label: string) => allItems(list).find((x) => x.label === label);
const withTwoTx: Project = {
  ...project,
  boards: [...project.boards, { id: 'MDB-2', name: 'Second main', kind: 'MDB', sourceKva: 800, sourceImpedancePct: 5, ratedCurrentA: 1250 }],
  feeders: project.feeders
};
const failing: Project = { ...project, feeders: project.feeders.map((f) => (f.id === 'FF-LAB' ? { ...f, cableCsaMm2: 4 } : f)) };

describe('board menu', () => {
  it('lists its groups in order with the header', () => {
    const m = menu({ kind: 'board', id: 'SMDB-FF' });
    expect(m.head).toEqual({ icon: 'board', title: 'SMDB-FF', detail: 'SMDB · 250 A · from MDB-1' });
    expect(labels(m.items)).toEqual([
      'Edit SMDB-FF…', 'Load schedule', 'Board diagram', 'Add', '-',
      'Copy with everything below', 'Duplicate', 'Repeat branch on other floors…', '-',
      'Move', 'Supply from…', 'Order', 'Change', 'Fault point', 'Delete SMDB-FF and everything below…', '-',
      'Show on plan', 'Zoom to SMDB-FF', 'Show this branch only', '-', 'Select everything below', '-', 'Properties'
    ]);
    expect(labels(sub(m.items, 'Add'))).toEqual(['Load…', 'Motor…', 'Solar PV…', 'EV charger…', 'Feeder cable…', '-', 'Sub-board…']);
    expect(labels(sub(m.items, 'Order'))).toEqual(['Move left', 'Move right', '-', "First on MDB-1's busbar", "Last on MDB-1's busbar"]);
    expect(labels(sub(m.items, 'Change'))).toEqual(['Rename…', 'Outgoing cable type']);
  });
  it('a main board has no Duplicate, Repeat or Order and says its transformer', () => {
    const m = menu({ kind: 'board', id: 'MDB-1' });
    expect(m.head.detail).toBe('MDB · 1600 A · 1000 kVA transformer');
    const l = labels(m.items);
    for (const x of ['Duplicate', 'Repeat branch on other floors…', 'Move', 'Supply from…', 'Order']) expect(l).not.toContain(x);
  });
  it('a first board fed from outside gets Add upstream board… and Connect to…; the Board tab only the first', () => {
    const first: Project = { ...project, boards: [...project.boards, { id: 'DB-LV', name: 'DB LV', kind: 'DB', ratedCurrentA: 63, supply: { fedBy: 'board', faultKa: 12 } }] };
    const m = menu({ kind: 'board', id: 'DB-LV' }, state(first));
    expect(labels(m.items)).toEqual([
      'Edit DB-LV…', 'Load schedule', 'Board diagram', 'Add', '-',
      'Copy with everything below', '-',
      'Add upstream board…', 'Connect to…', 'Change', 'Fault point', 'Delete DB-LV and everything below…', '-',
      'Show on plan', 'Zoom to DB-LV', 'Show this branch only', '-', 'Properties'
    ]);
    expect(find(m.items, 'Add upstream board…')!.arg).toBe('addupstream');
    expect(find(m.items, 'Connect to…')!.arg).toBe('connectto');
    const tab = sldMenu(state(first), { kind: 'board', id: 'DB-LV' }, 'board', 'DB-LV')!;
    expect(labels(tab.items)).toContain('Add upstream board…');
    expect(labels(tab.items)).not.toContain('Connect to…');
    // No row for a fed board, a transformer board or a meter cabinet; no Connect to… when it is the only board.
    for (const id of ['SMDB-FF', 'MDB-1']) expect(labels(menu({ kind: 'board', id }).items)).not.toContain('Add upstream board…');
    const mc: Project = { ...first, boards: [...first.boards, { id: 'MC-1', name: 'MC', kind: 'MC', supply: { device: 'MCCB' } }] };
    expect(labels(menu({ kind: 'board', id: 'MC-1' }, state(mc)).items)).not.toContain('Add upstream board…');
    const alone: Project = { ...first, boards: [first.boards[first.boards.length - 1]], feeders: [] };
    const l = labels(menu({ kind: 'board', id: 'DB-LV' }, state(alone)).items);
    expect(l).toContain('Add upstream board…');
    expect(l).not.toContain('Connect to…');
  });
  it('Order shows only the moves that change something', () => {
    expect(labels(sub(menu({ kind: 'board', id: 'SMDB-GF' }).items, 'Order'))).toEqual(['Move right', '-', "Last on MDB-1's busbar"]);
    expect(labels(sub(menu({ kind: 'feeder', id: 'DB-PV' }).items, 'Order'))).toEqual(['Move left', '-', "First on MDB-1's busbar"]);
  });
  it('Paste only while a board or a load is copied', () => {
    expect(labels(menu({ kind: 'board', id: 'SMDB-FF' }).items)).not.toContain('Paste SMDB-GF here');
    const b = menu({ kind: 'board', id: 'SMDB-FF' }, state(project, { copiedBoard: 'SMDB-GF' }));
    expect(labels(b.items)).toContain('Paste SMDB-GF here');
    expect(labels(menu({ kind: 'board', id: 'SMDB-FF' }, state(project, { copiedLoads: ['GF-HVAC'] })).items)).toContain('Paste GF-HVAC here');
    // Not on the copied board or when it is gone; below it is fine, as with the ribbon's Paste (a copy, not a move).
    expect(labels(menu({ kind: 'board', id: 'SMDB-GF' }, state(project, { copiedBoard: 'SMDB-GF' })).items).join()).not.toContain('Paste');
    expect(labels(menu({ kind: 'board', id: 'DB-GF1' }, state(project, { copiedBoard: 'SMDB-GF' })).items)).toContain('Paste SMDB-GF here');
    expect(labels(menu({ kind: 'board', id: 'SMDB-FF' }, state(project, { copiedBoard: 'GONE' })).items).join()).not.toContain('Paste');
  });
  it('Incomer length checked only when flagged', () => {
    const flagged: Project = { ...project, feeders: project.feeders.map((f) => (f.id === 'INC-FF' ? { ...f, lengthToCheck: true } : f)) };
    expect(labels(sub(menu({ kind: 'board', id: 'SMDB-FF' }, state(flagged)).items, 'Change'))).toEqual(['Rename…', 'Outgoing cable type', 'Incomer length checked']);
  });
  it('the outgoing cable types mark the one every way agrees on', () => {
    const list = (p: Project) => sub(sub(menu({ kind: 'board', id: 'SMDB-FF' }, state(p)).items, 'Change'), 'Outgoing cable type');
    expect(labels(list(project))[0]).toBe('Automatic (fire-rated for life safety)');
    expect((list(project)[0] as CtxItem).now).toBe(true);
    const all: Project = { ...project, feeders: project.feeders.map((f) => (f.boardId === 'SMDB-FF' ? { ...f, cableType: 'FR BS 8491' } : f)) };
    expect(list(all).filter((x): x is CtxItem => x !== '-' && !!x.now).map((x) => x.arg)).toEqual(['cabletype|FR BS 8491']);
    const mixed: Project = { ...project, feeders: project.feeders.map((f) => (f.id === 'FF-LAB' ? { ...f, cableType: 'MICC' } : f)) };
    expect(list(mixed).some((x) => x !== '-' && x.now)).toBe(false);
  });
});

describe('load menu', () => {
  it('lists its groups in order, with the load in the header', () => {
    const m = menu({ kind: 'feeder', id: 'FF-LAB' });
    expect(m.head).toEqual({ icon: 'circuit', title: 'FF-LAB', detail: 'Lab · 50.00 kW · on SMDB-FF' });
    expect(labels(m.items)).toEqual(['Edit FF-LAB…', 'Edit cable…', 'Change', '-', 'Copy', 'Duplicate', 'Move', 'Move to board…', 'Order', 'Delete FF-LAB', '-', 'Show on plan', 'Zoom to FF-LAB', '-', 'Select similar', 'Fault point', '-', 'Properties']);
    expect(labels(sub(m.items, 'Change'))).toEqual(['Switching device', 'Earth leakage', 'kWh meter', 'Cable type', '-', 'Essential (on the generator)', 'Existing', 'Local isolator']);
  });
  it('marks the current device, leakage, meter and switches', () => {
    const p: Project = { ...project, feeders: project.feeders.map((f) => (f.id === 'FF-LAB' ? { ...f, rcdMa: 10, kwhMeter: 'CT', essential: true } : f)) };
    const ch = menu({ kind: 'feeder', id: 'FF-LAB' }, state(p)).items;
    const change = sub(ch, 'Change');
    const now = (name: string) => sub(change, name).filter((x): x is CtxItem => x !== '-' && !!x.now).map((x) => x.label);
    expect(now('Switching device')).toEqual(['MCCB']);
    expect(now('Earth leakage')).toEqual(['10 mA']);
    expect(labels(sub(change, 'Earth leakage'))).toEqual(['None', '10 mA', '30 mA', '100 mA', '300 mA']);
    expect(now('kWh meter')).toEqual(['CT-operated']);
    expect(now('Cable type')).toEqual([expect.stringMatching(/^Auto — /)]);
    expect(find(ch, 'Essential (on the generator)')?.on).toBe(true);
    expect(find(ch, 'Existing')?.on).toBe(false);
    expect(sub(sub(menu({ kind: 'feeder', id: 'GF-VRF' }).items, 'Change'), 'Switching device').filter((x): x is CtxItem => x !== '-' && !!x.now).map((x) => x.label)).toEqual(['MCB']);
    expect(sub(sub(menu({ kind: 'feeder', id: 'INC-FF' }).items, 'Change'), 'Switching device').filter((x): x is CtxItem => x !== '-' && !!x.now).map((x) => x.label)).toEqual(['MCCB']);
  });
  it('Phase only for a single-phase load', () => {
    const phase = (id: string) => labels(sub(menu({ kind: 'feeder', id }).items, 'Change')).includes('Phase');
    expect(phase('FF-LTG')).toBe(true);
    expect(phase('FF-LAB')).toBe(false);
    expect(labels(sub(sub(menu({ kind: 'feeder', id: 'FF-LTG' }).items, 'Change'), 'Phase'))).toEqual(['R', 'Y', 'B']);
  });
  it('Quick fix and the failure line only while it fails', () => {
    expect(labels(menu({ kind: 'feeder', id: 'FF-LAB' }).items)).not.toContain('Quick fix');
    expect(menu({ kind: 'feeder', id: 'FF-LAB' }).head.second).toBeUndefined();
    const m = menu({ kind: 'feeder', id: 'FF-LAB' }, state(failing));
    expect(m.head.second).toMatch(/^(Fails|To check) · /);
    expect(m.head.secondTone).toBe(m.head.second!.startsWith('Fails') ? 'bad' : 'warn');
    expect(labels(m.items)[0]).toBe('Quick fix');
    const fixes = sub(m.items, 'Quick fix') as CtxItem[];
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.map((x) => x.arg)).toEqual(fixes.map((_, i) => `quickfix|${i}`));
    for (const x of fixes) expect(['passes', 'still to check']).toContain(x.key);
  });
  it('the order list is that of its own busbar', () => {
    expect(labels(sub(menu({ kind: 'feeder', id: 'FF-IT' }).items, 'Order'))).toEqual(['Move left', 'Move right', '-', "First on SMDB-FF's busbar", "Last on SMDB-FF's busbar"]);
    expect(labels(sub(menu({ kind: 'feeder', id: 'FF-OFF' }).items, 'Order'))).toEqual(['Move right', '-', "Last on SMDB-FF's busbar"]);
  });
});

describe('supply menu', () => {
  it('a transformer', () => {
    const m = menu({ kind: 'supply', boardId: 'MDB-1' });
    expect(m.head).toEqual({ icon: 'transformer', title: 'TX-1', detail: '1000 kVA · 5 % · feeds MDB-1' });
    expect(labels(m.items)).toEqual(['Edit transformer…', 'Transformer & generator sizing', 'Scenario', 'Add', 'MV supply and RMUs…', '-', 'Substation', 'RMU', '-', 'Zoom to MDB-1', 'Show TX-1 only', '-', 'Properties']);
    expect(labels(sub(m.items, 'Add'))).toEqual(['Generator + ATS', 'Generator + interlocked ACBs']);
  });
  it('Bus coupler is offered when there is another main board to tie to', () => {
    const m = menu({ kind: 'supply', boardId: 'MDB-1' }, state(withTwoTx));
    expect(labels(sub(m.items, 'Add'))).toEqual(['Generator + ATS', 'Generator + interlocked ACBs', 'Bus coupler / tie']);
  });
  it('the scenario list marks the current one and disables the generator without one', () => {
    const list = (s: SldMenuState) => sub(menu({ kind: 'supply', boardId: 'MDB-1' }, s).items, 'Scenario') as CtxItem[];
    expect(list(state()).map((x) => [x.label, !!x.now, !!x.off])).toEqual([['Normal supply', true, false], ['On generator (mains lost)', false, true]]);
    const s = state(project, { hasGenerator: true, supply: 'outage:MDB-1', outages: ['MDB-1'] });
    expect(list(s).map((x) => [x.label, !!x.now, !!x.off])).toEqual([['Normal supply', false, false], ['On generator (mains lost)', false, false], ['Transformer of MDB-1 failed', true, false]]);
    expect(list(s)[2].arg).toBe('scenario|outage:MDB-1');
  });
  it('a meter cabinet', () => {
    const mc: Project = { ...project, boards: project.boards.map((b) => (b.id === 'MDB-1' ? { ...b, sourceKva: undefined, supply: { fedFrom: 'SEWA' as const } } : b)) };
    const m = menu({ kind: 'supply', boardId: 'MDB-1' }, state(mc));
    expect(m.head).toEqual({ icon: 'board', title: 'Meter cabinet', detail: 'SEWA supply · feeds MDB-1' });
    expect(labels(m.items)).toEqual(['Edit supply…', '-', 'Zoom to MDB-1', 'Show MDB-1 only', '-', 'Properties']);
  });
  it('nothing for a main board that is neither', () => {
    expect(sldMenu(state(), { kind: 'supply', boardId: 'SMDB-FF' })).toBeNull();
  });
});

describe('bus coupler menu', () => {
  const tied: Project = { ...withTwoTx, ties: [{ id: 'BC-1', a: 'MDB-1', b: 'MDB-2', ratingA: 1250 }] };
  it('lists operation, rating and scenario, and marks the present ones', () => {
    const m = menu({ kind: 'tie', id: 'BC-1' }, state(tied, { outages: ['MDB-1', 'MDB-2'] }));
    expect(m.head).toEqual({ icon: 'join', title: 'BC-1', detail: '1250 A · MDB-1 ↔ MDB-2' });
    expect(labels(m.items)).toEqual([expect.stringContaining('Normally open'), expect.stringContaining('Normally closed'), 'Rating', 'Scenario', '-', 'Remove this coupler…']);
    expect((m.items[0] as CtxItem).now).toBe(true);
    expect((m.items[1] as CtxItem).now).toBe(false);
    const ratings = sub(m.items, 'Rating') as CtxItem[];
    expect(ratings.filter((x) => x.now).map((x) => x.label)).toEqual(['1250 A']);
    expect(ratings[0].arg).toMatch(/^tierating\|\d+$/);
    const closed = menu({ kind: 'tie', id: 'BC-1' }, state({ ...tied, ties: [{ ...tied.ties![0], closed: true }] }));
    expect([(closed.items[0] as CtxItem).now, (closed.items[1] as CtxItem).now]).toEqual([false, true]);
    expect(sub(m.items, 'Scenario').length).toBe(4);
  });
  it('nothing for a coupler that is gone', () => {
    expect(sldMenu(state(), { kind: 'tie', id: 'BC-9' })).toBeNull();
  });
});

describe('empty drawing menu', () => {
  it('lists its groups, with the page state marked', () => {
    const m = menu({ kind: 'canvas' }, state(project, { canUndo: false, grid: 'dots', detail: 'auto', colorBy: 'vd' }));
    expect(m.head).toEqual({ icon: 'sld', title: 'System diagram', detail: project.name });
    expect(labels(m.items)).toEqual(['Undo', 'Redo', '-', 'Add', '-', 'Fit', 'Grid', 'Text', 'Values', 'Colour by', 'Scenario', '-', 'Select', '-', 'Export…']);
    expect((m.items[0] as CtxItem).off).toBe(true);
    expect((m.items[1] as CtxItem).off).toBe(true);
    expect(labels(sub(m.items, 'Add'))).toEqual(['Transformer', 'Meter cabinet', 'RMU', '-', 'MV supply and RMUs…']);
    expect(find(sub(m.items, 'Add'), 'RMU')).toMatchObject({ arg: 'addsupply|rmu' });
    // A part of the network does not draw the RMU: offered on the whole network and the MV overview only.
    expect(labels(sub(menu({ kind: 'canvas' }, state(project, { part: 'mv' })).items, 'Add'))).toContain('RMU');
    for (const part of ['rmu:RMU-1', 'ss:SS-1', 'tx:MDB-1']) expect(labels(sub(menu({ kind: 'canvas' }, state(project, { part })).items, 'Add')), part).not.toContain('RMU');
    const nowOf = (name: string) => (sub(m.items, name) as CtxItem[]).filter((x) => x.now).map((x) => x.label);
    expect(nowOf('Grid')).toEqual(['Dots']);
    expect(nowOf('Text')).toEqual(['Follows the zoom']);
    expect(nowOf('Colour by')).toEqual(['Voltage drop']);
    expect((sub(m.items, 'Values') as CtxItem[]).filter((x) => x.on).map((x) => x.label)).toEqual(['Current (A)', 'Bus voltage', 'Voltage drop']);
    expect(labels(sub(m.items, 'Values')).length).toBe(7);
  });
  it('Redo is available after an undo', () => {
    expect((menu({ kind: 'canvas' }, state(project, { canRedo: true })).items[1] as CtxItem).off).toBe(false);
  });
});

describe('every menu', () => {
  const targets: SldTarget[] = [
    { kind: 'board', id: 'MDB-1' }, { kind: 'board', id: 'SMDB-FF' }, { kind: 'board', id: 'DB-GF1' }, { kind: 'feeder', id: 'FF-LAB' }, { kind: 'feeder', id: 'FF-LTG' },
    { kind: 'feeder', id: 'GF-HVAC' }, { kind: 'supply', boardId: 'MDB-1' }, { kind: 'canvas' }
  ];
  const all = [
    ...targets.map((t) => menu(t, state(project, { copiedBoard: 'SMDB-GF', outages: ['MDB-1'], hasGenerator: true }))),
    menu({ kind: 'feeder', id: 'FF-LAB' }, state(failing)),
    menu({ kind: 'tie', id: 'BC-1' }, state({ ...withTwoTx, ties: [{ id: 'BC-1', a: 'MDB-1', b: 'MDB-2', ratingA: 1250 }] }))
  ];
  it('every row runs an action the page handles', () => {
    for (const m of all) {
      for (const x of allItems(m.items)) {
        if (x.sub) { expect(x.arg, x.label).toBeUndefined(); continue; }
        expect(x.act, x.label).toBe('sld');
        expect(SLD_MENU_ACTIONS, `${m.label}: ${x.label}`).toContain(sldAction(x)[0]);
      }
    }
  });
  it('no menu has a divider first, last or twice, or an empty list', () => {
    const check = (list: CtxEntry[]) => {
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]).not.toBe('-');
      expect(list[list.length - 1]).not.toBe('-');
      list.forEach((x, i) => { if (x === '-') expect(list[i - 1]).not.toBe('-'); else if (x.sub) check(x.sub); });
    };
    for (const m of all) check(m.items);
  });
  it('splits an action from its value', () => {
    expect(sldAction({ label: 'x', act: 'sld', arg: 'change|rcdMa|30' })).toEqual(['change', 'rcdMa|30']);
    expect(sldAction({ label: 'x', act: 'sld', arg: 'change|rcdMa|' })).toEqual(['change', 'rcdMa|']);
    expect(sldAction({ label: 'x', act: 'sld', arg: 'zoom' })).toEqual(['zoom', undefined]);
    expect(sldAction({ label: 'x', act: 'sld', arg: 'scenario|outage:MDB-1' })).toEqual(['scenario', 'outage:MDB-1']);
  });
  it('gives nothing for a board or a load that is gone', () => {
    expect(sldMenu(state(), { kind: 'board', id: 'NOPE' })).toBeNull();
    expect(sldMenu(state(), { kind: 'feeder', id: 'NOPE' })).toBeNull();
  });
});

describe('several picked menu', () => {
  const three: SldTarget = { kind: 'several', items: [{ kind: 'feeder', id: 'FF-OFF' }, { kind: 'feeder', id: 'FF-IT' }, { kind: 'feeder', id: 'FF-LAB' }] };
  it('lists its groups with the header for loads of one board', () => {
    const m = menu(three);
    expect(m.head).toEqual({ icon: 'selectall', title: '3 picked', detail: '3 loads on SMDB-FF' });
    expect(labels(m.items)).toEqual(['Edit together…', 'Change', '-', 'Copy', 'Duplicate', '-', 'Move to board…', 'Delete 3…', 'Zoom to the picked', '-', 'Select similar', 'Deselect all']);
    expect(find(m.items, 'Delete 3…')).toMatchObject({ bad: true, key: 'Del', arg: 'delete' });
    expect(find(m.items, 'Edit together…')!.arg).toBe('together');
  });
  it('counts loads and boards in the header; boards leave Edit together out of loads and Copy off', () => {
    const m = menu({ kind: 'several', items: [{ kind: 'feeder', id: 'FF-OFF' }, { kind: 'feeder', id: 'GF-LTG' }, { kind: 'board', id: 'SMDB-GF' }] });
    expect(m.head.detail).toBe('2 loads, 1 board');
    expect(labels(m.items)).not.toContain('Copy');
    expect(labels(m.items)).toContain('Duplicate');
    const boards = menu({ kind: 'several', items: [{ kind: 'board', id: 'SMDB-GF' }, { kind: 'board', id: 'SMDB-FF' }] });
    expect(labels(boards.items)).not.toContain('Edit together…');
    expect(labels(boards.items)).not.toContain('Change');
    expect(boards.head.detail).toBe('2 boards');
    expect(labels(menu({ kind: 'several', items: [{ kind: 'board', id: 'MDB-1' }, { kind: 'board', id: 'MCC-1' }] }).items)).toContain('Duplicate'); // MCC-1 has a board above it
  });
  it('Change ticks a value only where all agree; Phase only when all are single-phase', () => {
    const m = menu(three);
    const change = sub(m.items, 'Change');
    expect(labels(change)).not.toContain('Phase');
    expect((sub(change, 'Switching device') as CtxItem[]).filter((x) => x.now).length).toBeLessThanOrEqual(1);
    const p: Project = { ...project, feeders: project.feeders.map((f) => (['FF-OFF', 'FF-IT'].includes(f.id) ? { ...f, essential: true, rcdMa: 30 } : f)) };
    const c2 = sub(menu({ kind: 'several', items: [{ kind: 'feeder', id: 'FF-OFF' }, { kind: 'feeder', id: 'FF-IT' }] }, state(p)).items, 'Change');
    expect((find(c2, 'Essential (on the generator)') as CtxItem).on).toBe(true);
    expect((find(c2, 'Existing') as CtxItem).on).toBe(false);
    expect((sub(c2, 'Earth leakage') as CtxItem[]).filter((x) => x.now).map((x) => x.label)).toEqual(['30 mA']);
    const mixed = sub(menu(three, state(p)).items, 'Change');
    expect((find(mixed, 'Essential (on the generator)') as CtxItem).on).toBe(false);
    expect((sub(mixed, 'Earth leakage') as CtxItem[]).filter((x) => x.now)).toEqual([]);
  });
  it('a single item or a gone one has no several menu', () => {
    expect(sldMenu(state(), { kind: 'several', items: [{ kind: 'feeder', id: 'FF-OFF' }] })).toBeNull();
    expect(sldMenu(state(), { kind: 'several', items: [{ kind: 'feeder', id: 'FF-OFF' }, { kind: 'feeder', id: 'NOPE' }] })).toBeNull();
  });
  it('every row runs an action the page handles', () => {
    for (const x of allItems(menu(three).items)) if (!x.sub) expect(SLD_MENU_ACTIONS).toContain(sldAction(x)[0]);
  });
});

describe('select tools in the menus', () => {
  it('a load offers Select similar, with the failing list only when something fails', () => {
    const list = sub(menu({ kind: 'feeder', id: 'FF-LTG' }).items, 'Select similar');
    expect(labels(list)).toEqual(['Same load type on SMDB-FF', 'Same load type everywhere']);
    expect(list.map((x) => (x as CtxItem).arg)).toEqual(['similar|board', 'similar|all']);
    expect(labels(sub(menu({ kind: 'feeder', id: 'FF-LTG' }, state(failing)).items, 'Select similar'))).toContain('Every failing circuit');
  });
  it('a board offers Select everything below only when something is below', () => {
    expect(find(menu({ kind: 'board', id: 'SMDB-FF' }).items, 'Select everything below')).toMatchObject({ arg: 'below', icon: 'similar' });
    expect(find(menu({ kind: 'board', id: 'DB-GF1' }).items, 'Select everything below')).toBeUndefined();
  });
  it('the empty drawing offers Select with the kinds present', () => {
    const list = sub(menu({ kind: 'canvas' }).items, 'Select');
    expect(labels(list)).toEqual(['All loads', 'Boards of one kind']);
    expect(sub(list, 'Boards of one kind').map((x) => (x as CtxItem).arg)).toEqual(expect.arrayContaining(['select|kind|MDB', 'select|kind|SMDB']));
    const f = sub(menu({ kind: 'canvas' }, state(failing)).items, 'Select');
    expect(labels(f)).toContain('Every failing circuit');
  });
  it('Paste names one load or the count', () => {
    expect(labels(menu({ kind: 'board', id: 'SMDB-FF' }, state(project, { copiedLoads: ['GF-HVAC', 'GF-LTG', 'GF-SKT'] })).items)).toContain('Paste 3 loads here');
  });
});

describe('Show this branch only and the Board tab', () => {
  const rows = (t: SldTarget, s: SldMenuState = state(), where?: 'system' | 'board', here?: string) => labels(sldMenu(s, t, where, here)!.items);
  it('a board offers Show this branch only until its branch is the one shown', () => {
    expect(rows({ kind: 'board', id: 'SMDB-FF' })).toContain('Show this branch only');
    expect(rows({ kind: 'board', id: 'SMDB-FF' }, state(project, { branch: 'SMDB-FF' }))).not.toContain('Show this branch only');
    expect(rows({ kind: 'board', id: 'SMDB-FF' }, state(project, { branch: 'MDB-1' }))).toContain('Show this branch only');
    expect(find(menu({ kind: 'board', id: 'SMDB-FF' }).items, 'Show this branch only')).toMatchObject({ arg: 'branch', icon: 'isolate' });
  });
  it('the empty drawing offers Show everything only while a branch is shown', () => {
    expect(rows({ kind: 'canvas' })).not.toContain('Show everything');
    const m = sldMenu(state(project, { branch: 'SMDB-FF' }), { kind: 'canvas' })!;
    expect(find(m.items, 'Show everything')).toMatchObject({ arg: 'showall', icon: 'isolate' });
  });
  it('on the Board tab the system-only rows are left off a load', () => {
    const l = rows({ kind: 'feeder', id: 'FF-LAB' }, state(), 'board', 'SMDB-FF');
    for (const x of ['Edit cable…', 'Move', 'Move to board…', 'Zoom to FF-LAB', 'Select similar']) expect(l).not.toContain(x);
    for (const x of ['Edit FF-LAB…', 'Change', 'Copy', 'Duplicate', 'Order', 'Delete FF-LAB', 'Show on plan', 'Properties']) expect(l).toContain(x);
  });
  it('on the Board tab this board loses Board diagram too, a sub-board keeps it but not Add and Properties', () => {
    const own = rows({ kind: 'board', id: 'SMDB-FF' }, state(), 'board', 'SMDB-FF');
    for (const x of ['Board diagram', 'Move', 'Supply from…', 'Zoom to SMDB-FF', 'Show this branch only', 'Select everything below']) expect(own).not.toContain(x);
    for (const x of ['Edit SMDB-FF…', 'Load schedule', 'Add', 'Duplicate', 'Order', 'Change', 'Show on plan', 'Properties']) expect(own).toContain(x);
    const subBoard = rows({ kind: 'board', id: 'SMDB-FF' }, state(), 'board', 'MDB-1');
    expect(subBoard).toContain('Board diagram');
    for (const x of ['Add', 'Properties', 'Move', 'Supply from…', 'Zoom to SMDB-FF']) expect(subBoard).not.toContain(x);
    expect(subBoard).toContain('Edit SMDB-FF…');
  });
  it('the system menus are as before by default', () => {
    expect(rows({ kind: 'feeder', id: 'FF-LAB' })).toEqual(rows({ kind: 'feeder', id: 'FF-LAB' }, state(), 'system'));
    expect(rows({ kind: 'feeder', id: 'FF-LAB' })).toContain('Edit cable…');
  });
});

describe('Show (a part of the network)', () => {
  const ringed: Project = {
    ...withTwoTx,
    boards: withTwoTx.boards.map((b) => (b.id === 'MDB-1' || b.id === 'MDB-2' ? { ...b, rmu: 'RMU-1', substation: 'SS-1' } : b)),
    rmus: [{ name: 'RMU-1', config: 'RRTT' }]
  };
  it('an RMU and a substation frame: Show it only, and where they are entered', () => {
    const r = menu({ kind: 'rmu', name: 'RMU-1' }, state(ringed));
    expect(r.head).toEqual({ icon: 'hv', title: 'RMU-1', detail: 'RRTT · SS-1 · 2 transformers · 6 boards' });
    expect(labels(r.items)).toEqual(['Show RMU-1 only', '-', 'Add transformer and main board', 'Configuration', 'Normally open', '-', 'MV supply and RMUs…']);
    expect(find(r.items, 'Show RMU-1 only')).toMatchObject({ arg: 'part|rmu:RMU-1', icon: 'isolate' });
    const f = menu({ kind: 'substation', name: 'SS-1' }, state(ringed));
    expect(f.head.title).toBe('Substation SS-1');
    expect(find(f.items, 'Show SS-1 only')).toMatchObject({ arg: 'part|ss:SS-1' });
    // While a part is shown they offer Show all too; an RMU that is no longer named has no menu.
    expect(labels(menu({ kind: 'rmu', name: 'RMU-1' }, state(ringed, { part: 'ss:SS-1' })).items)).toEqual(['Show RMU-1 only', 'Show all', '-', 'Add transformer and main board', 'Configuration', 'Normally open', '-', 'MV supply and RMUs…']);
    expect(sldMenu(state(), { kind: 'rmu', name: 'RMU-1' })).toBeNull();
  });
  it('a transformer offers Show it only, marked while it is the part shown', () => {
    expect(find(menu({ kind: 'supply', boardId: 'MDB-2' }, state(withTwoTx)).items, 'Show TX-2 only')).toMatchObject({ arg: 'part|tx:MDB-2' });
    expect(find(menu({ kind: 'supply', boardId: 'MDB-2' }, state(withTwoTx, { part: 'tx:MDB-2' })).items, 'Show TX-2 only')?.now).toBe(true);
  });
  it('the empty drawing offers Show all only while a part is shown', () => {
    expect(labels(menu({ kind: 'canvas' }).items)).not.toContain('Show all');
    expect(find(menu({ kind: 'canvas' }, state(project, { part: 'mv' })).items, 'Show all')).toMatchObject({ arg: 'part|all' });
    expect(SLD_MENU_ACTIONS).toContain('part');
  });
});

describe('Entering the arrangement (proposal 2026-11-18 part 4)', () => {
  const tx = (id: string, extra = {}) => ({ id, name: id, kind: 'MDB' as const, sourceKva: 1000, sourceImpedancePct: 6, ratedCurrentA: 1600, ...extra });
  /** SS-1: RMU-1 (RRTT) feeding MDB-1 and MDB-2; RMU-2 (RRT) in SS-2 feeding nothing yet; MDB-3 on no RMU. */
  const p: Project = {
    ...project,
    boards: [...project.boards.map((b) => (b.id === 'MDB-1' ? { ...b, rmu: 'RMU-1', substation: 'SS-1' } : b)), tx('MDB-2', { rmu: 'RMU-1', substation: 'SS-1' }), tx('MDB-3')],
    rmus: [{ name: 'RMU-1', config: 'RRTT' }, { name: 'RMU-2', config: 'RRT', substation: 'SS-2' }]
  };
  const rowsOf = (list: CtxEntry[]) => list.map((x) => (x === '-' ? '-' : [x.label, x.key ?? '', !!x.now, !!x.off]));
  it('a transformer: Substation ▸ in ring order with a new one, RMU ▸ with each RMU\'s tee-offs and a new one', () => {
    const m = menu({ kind: 'supply', boardId: 'MDB-1' }, state(p));
    expect(find(m.items, 'Substation')).toMatchObject({ icon: 'sld', key: 'SS-1' });
    expect(rowsOf(sub(m.items, 'Substation'))).toEqual([['None', '', false, false], ['SS-1', '', true, true], ['SS-2', '', false, false], '-', ['New substation…', '', false, false]]);
    expect((sub(m.items, 'Substation') as CtxItem[]).map((x) => x.arg)).toEqual(['txsubstation|', 'txsubstation|SS-1', 'txsubstation|SS-2', undefined, 'txsubstation|+']);
    expect(find(m.items, 'RMU')).toMatchObject({ icon: 'hv', key: 'RMU-1' });
    expect(rowsOf(sub(m.items, 'RMU'))).toEqual([['None', '', false, false], ['RMU-1', 'RRTT · 2 of 2', true, true], ['RMU-2', 'RRT · 0 of 1 · 1 free', false, false], '-', ['New RMU', 'starts as RRT', false, false]]);
    // MDB-3 on no RMU: the full RRTT unit is offered as RRTTT; a full RRTTT unit is greyed.
    const m3 = menu({ kind: 'supply', boardId: 'MDB-3' }, state(p));
    expect(find(m3.items, 'Substation')?.key).toBe('none');
    expect(rowsOf(sub(m3.items, 'RMU')).slice(0, 2)).toEqual([['None', '', true, true], ['RMU-1', 'RRTT · full → RRTTT', false, false]]);
    const fullP: Project = { ...p, boards: [...p.boards, tx('MDB-4', { rmu: 'RMU-1' })], rmus: [{ name: 'RMU-1', config: 'RRTTT' }] };
    expect(rowsOf(sub(menu({ kind: 'supply', boardId: 'MDB-3' }, state(fullP)).items, 'RMU'))[1]).toEqual(['RMU-1', 'RRTTT · full · 3 of 3', false, true]);
  });
  it('an RMU: Configuration ▸, a smaller one greyed while its transformers need the tee-offs; Normally open ▸ R1, R2 or none', () => {
    const m = menu({ kind: 'rmu', name: 'RMU-1' }, state(p));
    expect(find(m.items, 'Configuration')).toMatchObject({ icon: 'sliders', key: 'RRTT' });
    expect(rowsOf(sub(m.items, 'Configuration'))).toEqual([['RRT', 'too few tee-offs', false, true], ['RRTT', '', true, true], ['RRRT', 'too few tee-offs', false, true], ['RT', 'too few tee-offs', false, true], ['RRTTT', '', false, false]]);
    expect(find(m.items, 'Normally open')).toMatchObject({ icon: 'toggle', key: 'none' });
    expect((sub(m.items, 'Normally open') as CtxItem[]).map((x) => [x.label, x.arg, !!x.now])).toEqual([['None', 'rmunop|', true], ['R1 (ring in)', 'rmunop|R1', false], ['R2 (ring out)', 'rmunop|R2', false]]);
    const open: Project = { ...p, rmus: [{ name: 'RMU-1', config: 'RRTT', normallyOpen: 'R2' }] };
    expect(find(menu({ kind: 'rmu', name: 'RMU-1' }, state(open)).items, 'Normally open')?.key).toBe('R2');
    // An RT unit has one ring switch: no normally open point.
    const rt: Project = { ...p, boards: p.boards.filter((b) => b.id !== 'MDB-2'), rmus: [{ name: 'RMU-1', config: 'RT' }] };
    expect(labels(menu({ kind: 'rmu', name: 'RMU-1' }, state(rt)).items)).toEqual(['Show RMU-1 only', '-', 'Add transformer and main board', 'Configuration', '-', 'MV supply and RMUs…']);
    for (const a of ['txsubstation', 'txrmu', 'rmuconfig', 'rmunop', 'addtx', 'rmuremove']) expect(SLD_MENU_ACTIONS).toContain(a);
  });
  it('an RMU feeding nothing yet has a menu: no Show, Add transformer and main board first, its substation from the record', () => {
    const m = menu({ kind: 'rmu', name: 'RMU-2' }, state(p));
    expect(m.head).toEqual({ icon: 'hv', title: 'RMU-2', detail: 'RRT · SS-2 · no transformer yet' });
    expect(labels(m.items)).toEqual(['Add transformer and main board', 'Configuration', 'Normally open', 'Remove RMU-2', '-', 'MV supply and RMUs…']);
    expect(find(m.items, 'Remove RMU-2')).toMatchObject({ arg: 'rmuremove', icon: 'delete', bad: true });
    // An RMU that feeds a board has no Remove row.
    expect(labels(menu({ kind: 'rmu', name: 'RMU-1' }, state(p)).items)).not.toContain('Remove RMU-1');
    expect(find(m.items, 'Add transformer and main board')).toMatchObject({ arg: 'addtx', icon: 'plus', key: '1 free', off: false });
    // Shown part: still no Show rows for it.
    expect(labels(menu({ kind: 'rmu', name: 'RMU-2' }, state(p, { part: 'ss:SS-1' })).items)).not.toContain('Show all');
    // The key says what happens when full: a unit that grows, a unit that cannot.
    expect(find(menu({ kind: 'rmu', name: 'RMU-1' }, state(p)).items, 'Add transformer and main board')).toMatchObject({ key: '→ RRTTT', off: false });
    const full: Project = { ...p, boards: [...p.boards, tx('MDB-4', { rmu: 'RMU-1' })], rmus: [{ name: 'RMU-1', config: 'RRTTT' }] };
    expect(find(menu({ kind: 'rmu', name: 'RMU-1' }, state(full)).items, 'Add transformer and main board')).toMatchObject({ key: 'full', off: true });
    // A main board on the 11 kV side that names the RMU takes its tee-off before it has a kVA: RRT with one such board is full.
    const noKva: Project = { ...p, boards: [...p.boards.filter((b) => b.id === 'MDB-1' || b.id === 'MDB-3').map((b) => (b.id === 'MDB-1' ? { ...b, sourceKva: undefined } : b))], rmus: [{ name: 'RMU-1', config: 'RRT' }] };
    expect(find(menu({ kind: 'rmu', name: 'RMU-1' }, state(noKva)).items, 'Add transformer and main board')).toMatchObject({ key: '→ RRTT', off: false });
    // A name no board or record holds has no menu.
    expect(sldMenu(state(p), { kind: 'rmu', name: 'RMU-9' })).toBeNull();
    expect(sldMenu(state(p), { kind: 'substation', name: 'SS-2' })).toBeNull();
  });
});

describe('supply menu head by supply mode', () => {
  const only = (supply?: Project['boards'][number]['supply']): Project => ({ ...project, boards: project.boards.map((b) => (b.id === 'MDB-1' ? { ...b, sourceKva: undefined, sourceImpedancePct: undefined, supply } : b)) });
  it('a board outside the project: "Supply point", titled by the model; no supplier name is made up', () => {
    const m = menu({ kind: 'supply', boardId: 'MDB-1' }, state(only({ fedBy: 'board', fedFrom: 'SMDB-3F' })));
    expect(m.head).toEqual({ icon: 'board', title: 'Supply point', detail: 'From SMDB-3F · feeds MDB-1' });
    expect(menu({ kind: 'supply', boardId: 'MDB-1' }, state(only({}))).head).toEqual({ icon: 'board', title: 'Meter cabinet', detail: 'Source · feeds MDB-1' });
  });
  it('a source with no meter (generator, no meter type) is a "Supply point", not a meter cabinet', () => {
    const m = menu({ kind: 'supply', boardId: 'MDB-1' }, state(only({ kind: 'generator', fedFrom: 'Genset 1' })));
    expect(m.head).toEqual({ icon: 'board', title: 'Supply point', detail: 'Genset 1 · feeds MDB-1' });
    expect(m.label).toBe('Supply menu');
  });
  it('an unset supply gets a small menu with no "Show only" row', () => {
    const m = menu({ kind: 'supply', boardId: 'MDB-1' }, state(only(undefined)));
    expect(m.head).toEqual({ icon: 'board', title: 'Supply not set', detail: 'feeds MDB-1' });
    expect(labels(m.items)).toEqual(['Edit supply…', '-', 'Zoom to MDB-1', '-', 'Properties']);
  });
});

describe('Fault point ▸', () => {
  const args = (list: CtxEntry[]) => list.filter((x): x is CtxItem => x !== '-').map((x) => x.arg);
  it('a board offers Mark on this busbar, and Remove for each mark on it', () => {
    const p: Project = { ...project, faultPoints: [{ id: 'F1', boardId: 'SMDB-FF' }, { id: 'F2', feederId: 'FF-LAB', distanceM: 0 }] };
    const list = sub(menu({ kind: 'board', id: 'SMDB-FF' }, state(p)).items, 'Fault point');
    expect(labels(list)).toEqual(['Mark on this busbar', '-', 'Remove F1']);
    expect(args(list)).toEqual(['faultadd', 'faultremove|F1']);
  });
  it('a circuit offers the far end, and for each mark where along the cable it sits (the present place ticked)', () => {
    const p: Project = { ...project, faultPoints: [{ id: 'F2', feederId: 'FF-LAB', distanceM: 0 }] };
    const list = sub(menu({ kind: 'feeder', id: 'FF-LAB' }, state(p)).items, 'Fault point');
    expect(labels(list)).toEqual(['Mark at the far end of the cable', '-', 'F2: at the board', 'F2: quarter way', 'F2: half way', 'F2: three quarters', 'F2: far end', 'Remove F2']);
    expect(list.filter((x): x is CtxItem => x !== '-' && !!x.now).map((x) => x.label)).toEqual(['F2: at the board']);
    expect(args(list)[3]).toBe('faultat|F2:0.5');
  });
});
