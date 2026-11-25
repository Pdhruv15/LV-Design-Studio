// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CircuitPicker from './CircuitPicker';
import type { Feeder, Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const f = (id: string, boardId: string, name: string, points: Feeder['points']) => ({ id, boardId, name, points }) as Feeder;
const project = {
  building: { buildings: [{ id: 'V', name: 'Villa', levels: [{ id: 'GF', name: 'Ground', kind: 'ground', heightM: 4 }, { id: 'L1', name: 'First', kind: 'upper', heightM: 4 }] }], rooms: [] },
  boards: [{ id: 'DB-G', level: { building: 'V', level: 'GF' } }, { id: 'DB-F', level: { building: 'V', level: 'L1' } }]
} as unknown as Project;
const circuits = [
  f('f1', 'DB-F', 'Bed lights', { ltg: 3 }),
  f('f2', 'DB-G', 'Hall lights', { ltg: 10 }),
  f('f3', 'DB-G', 'Kitchen lights', { ltg: 7 }),
  f('f4', 'DB-G', 'Kitchen sockets', { s13: 2 })
];
const level = { building: 'V', level: 'GF' };
const rows = () => [...document.querySelectorAll<HTMLElement>('.cad-cir-row')];
const render = (value: string, onChange = vi.fn(), lvl: typeof level | null = level) => {
  act(() => root.render(<CircuitPicker project={project} circuits={circuits} value={value} onChange={onChange} placing="ltg" level={lvl ?? undefined} />));
  return onChange;
};
const open = () => act(() => { document.querySelector<HTMLButtonElement>('.cad-cir-field')!.click(); });
const type = (text: string) => act(() => {
  const i = document.querySelector<HTMLInputElement>('.cad-cir-list input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, text);
  i.dispatchEvent(new Event('input', { bubbles: true }));
});
const key = (k: string) => act(() => { document.querySelector('.cad-cir-list input')!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

describe('the Circuit field of Add device', () => {
  it('shows the circuit in use with its room, closed', () => {
    render('f3');
    expect(document.querySelector('.cad-cir-field')!.textContent).toContain('DB-G');
    expect(document.querySelector('.cad-cir-n')!.textContent).toBe('7 / 10');
    expect(document.querySelector('.cad-cir-list')).toBeNull();
  });

  it('lists the boards of this level first, the others closed with their count, and marks full circuits', () => {
    render('f3');
    open();
    const heads = [...document.querySelectorAll('.cad-cir-h')].map((h) => h.textContent);
    expect(heads[0]).toBe('DB-G · this level');
    expect(heads[1]).toContain('DB-F');
    expect(heads[1]).toContain('1');
    expect(rows().map((r) => r.querySelector('.n')!.textContent)).toEqual(['10 / 10', '7 / 10', '2 / 6']);
    expect(rows()[0].classList.contains('full')).toBe(true);
    expect(rows()[1].classList.contains('full')).toBe(false);
    act(() => { (document.querySelectorAll('.cad-cir-h')[1] as HTMLButtonElement).click(); });
    expect(rows()).toHaveLength(4);
  });

  it('finds circuits, and a pick calls onChange and closes the list', () => {
    const onChange = render('f3');
    open();
    type('sockets');
    expect(rows()).toHaveLength(1);
    act(() => { rows()[0].click(); });
    expect(onChange).toHaveBeenCalledWith('f4');
    expect(document.querySelector('.cad-cir-list')).toBeNull();
  });

  it('offers the next circuit with room when the one in use is full; Enter takes it; Escape closes', () => {
    const onChange = render('f2');
    open();
    expect(rows()[0].className).toContain('next');
    expect(document.querySelector('.cad-cir-list .cad-cir-h')!.textContent).toBe('Next with room');
    key('Enter');
    expect(onChange).toHaveBeenCalledWith('f3');
    open();
    key('Escape');
    expect(document.querySelector('.cad-cir-list')).toBeNull();
  });

  it('lists every board open when none is of this level', () => {
    render('f3', vi.fn(), null);
    open();
    expect(rows()).toHaveLength(4);
    expect([...document.querySelectorAll<HTMLButtonElement>('.cad-cir-h')].every((h) => h.disabled)).toBe(true);
  });
});
