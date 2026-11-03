// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CircuitEditDialog from './CircuitEditDialog';
import { pointColumns } from '../../calc/loadSchedule';
import { sampleProject } from '../../data/sampleProject';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const board = sampleProject.boards.find((b) => b.id === 'DB-GF1')!;
const columns = pointColumns(sampleProject, board);
let root: Root;
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });
const show = (id: string, focus?: string, onSave = vi.fn()) => {
  const host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  const f = sampleProject.feeders.find((x) => x.id === id)!;
  act(() => root.render(<CircuitEditDialog project={sampleProject} board={board} feeder={f} circuitRef={id.split('-').pop()!} columns={columns} focus={focus} onSave={onSave} onDelete={() => {}} onClose={() => {}} />));
  return onSave;
};
const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')].find((b) => b.textContent?.startsWith(name))!;
const pane = () => document.querySelector<HTMLElement>('[role=tabpanel]:not([hidden])')!;
const button = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith(t))!;
const type = (el: HTMLInputElement, v: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('Edit circuit dialog in tabs', () => {
  it('opens on Loads with the summary line and only the columns that fit a lighting circuit', () => {
    show('DB-GF1-B2');
    expect(tab('Loads').getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('.ce-sum')!.textContent).toMatch(/DB-GF1 · phase B · 600 W · MCB 6 A · 2.5 mm² · PASS/);
    expect(pane().querySelectorAll('.ce-pts input')).toHaveLength(4);
    act(() => button('More columns').click());
    expect(pane().querySelectorAll('.ce-pts input')).toHaveLength(columns.length);
  });

  it('opens on the tab of the double-clicked field and shows the calculated results', () => {
    show('DB-GF1-B2', 'mcb');
    expect(tab('Protection').getAttribute('aria-selected')).toBe('true');
    expect(pane().textContent).toContain('Design current Ib');
    expect(pane().textContent).toContain('Section 1');
  });

  it('updates the summary as points change, before Save', () => {
    show('DB-GF1-B2');
    type(pane().querySelector<HTMLInputElement>('[data-field="pt:ltg"]')!, '30');
    expect(document.querySelector('.ce-sum')!.textContent).toContain('3000 W');
    expect(document.querySelector('.ce-sum')!.textContent).not.toContain('MCB 6 A');
  });

  it('copies points with Same as… and saves them', () => {
    const save = show('DB-GF1-B2');
    const sel = pane().querySelector<HTMLSelectElement>('select[aria-label^="Copy the points"]')!;
    act(() => { sel.value = 'DB-GF1-Y2'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    act(() => button('Save changes').click());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ points: expect.objectContaining({ ltg: 8, exfan: 1 }) }));
  });

  it('marks General when the length is empty and does not save', () => {
    const save = show('DB-GF1-B2', 'length');
    type(pane().querySelector<HTMLInputElement>('[data-field="length"]')!, '');
    expect(tab('General').textContent).toContain('!');
    act(() => button('Save changes').click());
    expect(save).not.toHaveBeenCalled();
  });
});
