// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoadScheduleView from './LoadScheduleView';
import type { Project } from '../../types';
import { EMPTY_DATABASE } from '../../database/database';
import { sampleProject } from '../../data/sampleProject';
import { elcbGroups, scheduleCircuits } from '../../calc/loadSchedule';
import { addCircuit } from '../../model/schedule';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD = 'DB-GF1';
let shown = BOARD;
let start: Project = sampleProject;
let root: Root;
let latest: Project;
const status = vi.fn();

function Harness() {
  const [p, setP] = useState(start);
  latest = p;
  return <LoadScheduleView project={p} boardId={shown} db={EMPTY_DATABASE} onBoard={() => {}} onChange={setP} onStatus={status} onSettings={() => {}} />;
}
const mount = () => act(() => root.render(<Harness />));
const board = () => latest.boards.find((b) => b.id === BOARD)!;
const press = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); window.dispatchEvent(new MouseEvent('mouseup')); });
/** The Room input of a circuit row, by its reference (R1, RYB4 …). */
const roomOf = (ref: string) => [...document.querySelectorAll<HTMLInputElement>('table.ls input[placeholder="Room"][data-cell]')].find((i) => i.closest('tr')!.querySelector('b')?.textContent === ref)!;
const menuButton = () => [...document.querySelectorAll<HTMLButtonElement>('.ls-actions button')].find((b) => b.textContent!.includes('ELCB / RCD'))!;
const openMenu = () => act(() => menuButton().click());
const items = () => [...document.querySelectorAll<HTMLButtonElement>('.ls-actions .menu-pop button')];
const item = (text: string | RegExp) => items().find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent!)))!;
const type = (el: HTMLInputElement, value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  root = createRoot(document.body.appendChild(document.createElement('div')));
  shown = BOARD; start = sampleProject; status.mockClear();
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('Add → ELCB / RCD', () => {
  it('has the menu in the add row, after 3-phase circuit', () => {
    mount();
    expect(document.querySelector('.ls-actions')!.textContent).toMatch(/3-phase circuit.*ELCB \/ RCD.*Spare 1-phase/);
  });

  it('enables the items by the selected row: none, a 1-phase circuit, a 3-phase circuit', () => {
    start = addCircuit(sampleProject, BOARD, 'RYB').project;
    const ryb = scheduleCircuits(start, BOARD).find((f) => f.phase === 'RYB')!;
    mount();
    openMenu();
    expect(items().map((b) => b.textContent)).toEqual(['3-phase ELCB (4P, TP&N) over ways…', '3-phase ELCB for the selected 3-phase circuit', 'RCBO for the selected circuit', 'AFDD + RCBO for the selected 1-phase circuit', 'MCB + RCD add-on block for the selected circuit', 'No RCD for the selected circuit…', 'Re-group all ELCBs…']);
    expect(item('3-phase ELCB for the selected 3-phase circuit').disabled).toBe(true);
    expect(item('RCBO for the selected circuit').disabled).toBe(true);
    expect(item('3-phase ELCB (4P, TP&N) over ways…').disabled).toBe(false);
    press(roomOf('R1'));
    openMenu();
    expect(items().slice(0, 6).map((b) => b.textContent)).toEqual(['3 circuits', '6 circuits', '9 circuits', '12 circuits', 'Edit ELCB-1…', 'Remove ELCB-1']);
    expect(item('RCBO for R1 (2P)').disabled).toBe(false);
    expect(item('3-phase ELCB for the selected 3-phase circuit').disabled).toBe(true);
    press(roomOf(`RYB${ryb.way}`));
    openMenu();
    expect(item(`3-phase ELCB for RYB${ryb.way} only`).disabled).toBe(false);
    expect(item(`RCBO for RYB${ryb.way} (4P)`).disabled).toBe(false);
    expect(item('AFDD + RCBO for the selected 1-phase circuit').disabled).toBe(true);
    expect(item(`MCB + RCD add-on block for RYB${ryb.way}`).disabled).toBe(false);
  });

  it('makes the selected 1-phase circuit an RCBO and says so; it can be removed again', () => {
    mount();
    press(roomOf('R1'));
    openMenu();
    act(() => item('RCBO for R1 (2P)').click());
    const f = latest.feeders.find((x) => x.id === `${BOARD}-R1`)!;
    expect(f.rcbo).toBe(true);
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/^R1: RCBO \d+ A \d+ mA 2P in place of the MCB \(RCBO-1\); it leaves ELCB-1$/));
    expect(document.querySelector('table.ls')!.textContent).toMatch(/RCBO-1.*this circuit/);
    press(roomOf('R1'));
    openMenu();
    expect(items().map((b) => b.textContent)).toContain('Edit RCBO-1…');
    act(() => item('Remove RCBO-1').click());
    expect(latest.feeders.find((x) => x.id === `${BOARD}-R1`)!.rcbo).toBeUndefined();
  });

  it('adds a 3-phase ELCB over ways through the dialog; ELCBs already there give those ways up', () => {
    mount();
    openMenu();
    act(() => item('3-phase ELCB (4P, TP&N) over ways…').click());
    expect(document.querySelector('.elcb-dialog h3')!.textContent).toBe(`Add 3-phase ELCB — ${BOARD}`);
    const from = document.querySelector<HTMLInputElement>('.elcb-dialog input[data-field="from"]')!;
    const to = document.querySelector<HTMLInputElement>('.elcb-dialog input[data-field="to"]')!;
    type(from, '2');
    type(to, '2');
    act(() => [...document.querySelectorAll<HTMLInputElement>('.elcb-dialog input[type="radio"]')][1].click());
    act(() => document.querySelector<HTMLButtonElement>('.elcb-dialog button[type="submit"]')!.click());
    expect(document.querySelector('.elcb-dialog')).toBeNull();
    expect(board().elcbs).toContainEqual(expect.objectContaining({ fromWay: 2, toWay: 2, poles: 3 }));
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/placed over way 2$/));
    const others = elcbGroups(latest, board()).filter((g) => !g.ways.includes(2)).map((g) => g.ways);
    // Ways 2–3: the ELCB on way 2 and the one over way 3 give them up; no warning, nothing else moves.
    openMenu();
    act(() => item('3-phase ELCB (4P, TP&N) over ways…').click());
    type(document.querySelector<HTMLInputElement>('.elcb-dialog input[data-field="from"]')!, '2');
    type(document.querySelector<HTMLInputElement>('.elcb-dialog input[data-field="to"]')!, '3');
    expect(document.querySelector('.elcb-dialog [role="alert"]')).toBeNull();
    act(() => document.querySelector<HTMLButtonElement>('.elcb-dialog button[type="submit"]')!.click());
    const now = elcbGroups(latest, board()).map((g) => g.ways);
    expect(now).toContainEqual([2, 3]);
    for (const w of others.filter((x) => !x.includes(3))) expect(now).toContainEqual(w);
  });

  it('a click on an ELCB cell resizes that ELCB only', () => {
    mount();
    const before = elcbGroups(latest, board()).map((g) => g.ways);
    expect(before[0]).toEqual([1, 2]);
    act(() => document.querySelector<HTMLTableCellElement>('table.ls td.elcb')!.click());
    const pop = document.querySelector('.menu-pop[role="menu"]')!;
    expect(pop.textContent).toMatch(/^ELCB-1 · ways 1–2 · /);
    act(() => [...pop.querySelectorAll('button')].find((b) => b.textContent === '3 circuits')!.click());
    expect(document.querySelector('.menu-pop[role="menu"]')).toBeNull();
    const after = elcbGroups(latest, board()).map((g) => g.ways);
    expect(after.slice(0, 2)).toEqual([[1], [2]]);
    expect(after.slice(2)).toEqual(before.slice(1));
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/^ELCB-1 .* over way 1 \(3 circuits\)$/));
  });

  it('changing New ELCBs keeps every ELCB already on the DB', () => {
    mount();
    const before = elcbGroups(latest, board()).map((g) => g.ways);
    const sel = document.querySelector<HTMLSelectElement>('.ls-head select')!;
    expect(sel.closest('label')!.textContent).toMatch(/^New ELCBs/);
    expect([...sel.options].map((o) => o.textContent)).toEqual(['3 circuits (1 way)', '6 circuits (2 ways)', '9 circuits (3 ways)', '12 circuits (4 ways)', 'No ELCB']);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, '3');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(board().elcbGroupSize).toBe(3);
    expect(elcbGroups(latest, board()).map((g) => g.ways)).toEqual(before);
  });

  it('Re-group all ELCBs shows before and after, then cuts the whole DB again', () => {
    mount();
    press(roomOf('R1'));
    openMenu();
    act(() => item('RCBO for R1 (2P)').click());
    act(() => document.querySelector<HTMLTableCellElement>('table.ls td.elcb[rowspan]')!.click());
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.menu-pop[role="menu"] button')].find((b) => b.textContent === '12 circuits')!.click());
    expect(board().elcbs!.length).toBeGreaterThan(0);
    openMenu();
    act(() => item('Re-group all ELCBs…').click());
    const dlg = document.querySelector('.elcb-dialog')!;
    expect(dlg.querySelector('h3')!.textContent).toBe(`Re-group all ELCBs — ${BOARD}`);
    expect(dlg.textContent).toMatch(/Now: \d+ ELCBs? \(12 · .*After: /);
    const keepRcbos = [...dlg.querySelectorAll('label')].find((l) => l.textContent!.includes('Keep the RCBOs and No RCD circuits'))!.querySelector('input')!;
    act(() => keepRcbos.click());
    act(() => dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(document.querySelector('.elcb-dialog')).toBeNull();
    expect(board().elcbs).toBeUndefined();
    expect(latest.feeders.some((f) => f.rcbo)).toBe(false);
    expect(status).toHaveBeenLastCalledWith(`${BOARD}: ELCBs re-grouped into 6 circuits each`);
  });

  it('offers Make RCBO in the Check column for the one odd circuit of an ELCB', () => {
    const g0 = elcbGroups(sampleProject, sampleProject.boards.find((b) => b.id === BOARD)!)[0];
    const lighting = g0.circuits.find((f) => f.points?.ltg)!;
    start = { ...sampleProject, feeders: sampleProject.feeders.map((f) => (g0.circuits.includes(f) ? { ...f, points: f.id === lighting.id ? { s13: 2 } : { ltg: 4 } } : f)) };
    mount();
    const btns = () => [...document.querySelectorAll<HTMLButtonElement>('table.ls button')].filter((b) => b.textContent === 'Make RCBO');
    expect(btns()).toHaveLength(1);
    expect(btns()[0].title).toBe(`Only power circuit on ELCB-${g0.index}: an RCBO in place of its MCB leaves ELCB-${g0.index} with lighting circuits only`);
    act(() => btns()[0].click());
    expect(latest.feeders.find((f) => f.id === lighting.id)!.rcbo).toBe(true);
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(new RegExp(`; ELCB-${g0.index} is now \\d+ A 100 mA 4P \\(lighting\\)$`)));
    expect(btns()).toHaveLength(0);
  });

  it('No RCD asks the reason, takes the circuit off its ELCB and shows it; Put back undoes it', () => {
    mount();
    press(roomOf('Y1'));
    openMenu();
    act(() => item('No RCD for Y1…').click());
    const dlg = document.querySelector('.elcb-dialog')!;
    expect(dlg.querySelector('h3')!.textContent).toMatch(/^No RCD — Y1/);
    const reason = dlg.querySelector<HTMLInputElement>('input[data-field="reason"]')!;
    expect(reason.value).toBe('Fire alarm panel');
    type(reason, ' ');
    expect(dlg.querySelector('[role="alert"]')!.textContent).toBe('Give the reason, e.g. fire alarm panel');
    expect(dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    type(reason, 'Smoke extract fan');
    act(() => dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(latest.feeders.find((f) => f.id === `${BOARD}-Y1`)!.noRcd).toBe('Smoke extract fan');
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/^Y1: no RCD \(Smoke extract fan\); it leaves ELCB-1\. Its earth fault check rests on the MCB alone$/));
    expect(document.querySelector('table.ls')!.textContent).toContain('No RCDSmoke extract fan');
    press(roomOf('Y1'));
    openMenu();
    expect(items().map((b) => b.textContent)).toContain('Edit the No RCD reason…');
    act(() => item('Put Y1 back on its ELCB').click());
    expect(latest.feeders.find((f) => f.id === `${BOARD}-Y1`)!.noRcd).toBeUndefined();
  });

  it('gives a circuit an AFDD + RCBO, then an RCD add-on block in its place, and names each', () => {
    mount();
    press(roomOf('Y1'));
    openMenu();
    act(() => item('AFDD + RCBO for Y1').click());
    expect(latest.feeders.find((f) => f.id === `${BOARD}-Y1`)).toMatchObject({ rcbo: true, rcboKind: 'afdd' });
    expect(status).toHaveBeenLastCalledWith(expect.stringMatching(/^Y1: AFDD \+ RCBO \d+ A \d+ mA 2P \+ AFDD in place of the MCB \(RCBO-1\); it leaves ELCB-1$/));
    expect(document.querySelector('table.ls')!.textContent).toMatch(/RCBO-1\d+ A \d+ mA 2P \+ AFDDthis circuit/);
    press(roomOf('Y1'));
    openMenu();
    expect(item('AFDD + RCBO for the selected 1-phase circuit').disabled).toBe(true);
    act(() => item('MCB + RCD add-on block for Y1').click());
    expect(latest.feeders.find((f) => f.id === `${BOARD}-Y1`)!.rcboKind).toBe('addon');
    expect(document.querySelector('table.ls')!.textContent).toMatch(/RCD-1\d+ A \d+ mA 2P add-onthis circuit/);
    press(roomOf('Y1'));
    openMenu();
    expect(items().map((b) => b.textContent)).toEqual(expect.arrayContaining(['Edit RCD-1…', 'Remove RCD-1']));
  });

  it('chooses the RCD type for the DB in the board bar, and for one ELCB in its dialog', () => {
    mount();
    const sel = [...document.querySelectorAll<HTMLSelectElement>('.ls-head select')].find((x) => x.closest('label')!.textContent!.startsWith('RCD type'))!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Auto (A; B for EV, drives, PV)', 'All Type AC (plain AC loads only)', 'All Type A (general circuits)', 'All Type F (1-phase drives, inverter units)', 'All Type B (EV chargers, 3-phase drives, PV)']);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'F');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(board().rcdType).toBe('F');
    expect(elcbGroups(latest, board()).every((g) => g.rcdType === 'F')).toBe(true);
    act(() => document.querySelector<HTMLTableCellElement>('table.ls td.elcb[rowspan]')!.click());
    act(() => [...document.querySelectorAll<HTMLButtonElement>('.menu-pop[role="menu"] button')].find((x) => x.textContent === 'Edit ELCB-1…')!.click());
    const dlg = document.querySelector('.elcb-dialog')!;
    const type = [...dlg.querySelectorAll('label')].find((l) => l.textContent!.startsWith('RCD type'))!.querySelector('select')!;
    expect(type.options[0].textContent).toBe("Auto — Type F (the DB's choice)");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(type, 'B');
      type.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(elcbGroups(latest, board())[0]).toMatchObject({ rcdType: 'B' });
    expect(elcbGroups(latest, board())[0].label).toMatch(/Type B$/);
  });

  it('Re-group offers one ELCB at the incomer, edited with S-type and never resized, and RCBO on every circuit', () => {
    const pick = (dlg: Element, text: string) => act(() => [...dlg.querySelectorAll('label')].find((l) => l.textContent!.includes(text))!.querySelector('input')!.click());
    mount();
    openMenu();
    act(() => item('Re-group all ELCBs…').click());
    let dlg = document.querySelector('.elcb-dialog')!;
    expect([...dlg.querySelectorAll('fieldset label')].map((l) => l.textContent!.trim())).toEqual(['ELCBs of 3 circuits (1 way)', 'ELCBs of 6 circuits (2 ways)', 'ELCBs of 9 circuits (3 ways)', 'ELCBs of 12 circuits (4 ways)', 'One ELCB at the incomer (S-type when 30 mA RCBOs sit below it)', 'RCBO on every circuit (new circuits too)', 'No ELCB']);
    pick(dlg, 'One ELCB at the incomer');
    expect(dlg.textContent).toMatch(/After: ELCB-1 \d+ A \d+ mA 4P.* at the incomer over every circuit\./);
    act(() => dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(board().elcbs).toEqual([expect.objectContaining({ incomer: true })]);
    expect(status).toHaveBeenLastCalledWith(`${BOARD}: ELCBs re-grouped: one ELCB at the incomer`);
    act(() => document.querySelector<HTMLTableCellElement>('table.ls td.elcb[rowspan]')!.click());
    const pop = document.querySelector('.menu-pop[role="menu"]')!;
    expect([...pop.querySelectorAll('button')].some((b) => /circuits$/.test(b.textContent!))).toBe(false);
    act(() => [...pop.querySelectorAll('button')].find((x) => x.textContent === 'Edit ELCB-1…')!.click());
    dlg = document.querySelector('.elcb-dialog')!;
    expect(dlg.querySelector('h3')!.textContent).toBe(`ELCB-1 at the incomer — ${BOARD}`);
    expect(dlg.querySelector('input[data-field="from"]')).toBeNull();
    const s = [...dlg.querySelectorAll('label')].find((l) => l.textContent!.startsWith('Time-delayed (S-type)'))!.querySelector('select')!;
    expect(s.options[0].textContent).toBe('Auto — no');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(s, 'yes');
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(elcbGroups(latest, board())).toHaveLength(1);
    expect(elcbGroups(latest, board())[0].label).toMatch(/S-type$/);
    openMenu();
    act(() => item('Re-group all ELCBs…').click());
    dlg = document.querySelector('.elcb-dialog')!;
    pick(dlg, 'RCBO on every circuit');
    act(() => dlg.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(board()).toMatchObject({ elcbs: undefined, rcboEveryCircuit: true });
    expect(scheduleCircuits(latest, BOARD).every((f) => f.rcbo || f.noRcd)).toBe(true);
  });

  it('has no ELCB / RCD menu on the MD form', () => {
    shown = 'MDB-1';
    mount();
    expect([...document.querySelectorAll('button')].some((b) => b.textContent!.includes('ELCB / RCD'))).toBe(false);
  });
});
