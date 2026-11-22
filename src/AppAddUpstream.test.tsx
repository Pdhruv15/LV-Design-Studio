// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

/** The real App: a project that starts from a Final DB grows upward with Add upstream board…, and Undo brings the single DB back. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
const button = (label: string, within: ParentNode = host) => [...within.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${document.body.textContent}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView ??= () => {};
  host = document.createElement('div');
  document.body.append(host);
  localStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('Add upstream board… in the App', () => {
  it('a Final DB start grows an SMDB above the DB, and Undo brings the single DB back', async () => {
    await act(async () => { root = createRoot(host); root.render(<App />); });
    await until('the New project button', () => !![...host.querySelectorAll('button')].find((b) => b.textContent?.includes('New project')));
    await act(async () => ([...host.querySelectorAll('button')].find((b) => b.textContent?.includes('New project')) as HTMLButtonElement).click());
    await until('the wizard', () => !!document.querySelector('.modal .home-act'));
    await act(async () => (document.querySelector('.modal .home-act') as HTMLButtonElement).click());
    const modal = () => document.querySelector('.modal') as HTMLElement;
    await act(async () => button('Next', modal())!.click());
    await until('the SLD start step', () => !!modal().textContent?.includes('SLD start'));
    await act(async () => ([...modal().querySelectorAll<HTMLButtonElement>('button[role=radio]')].find((b) => b.textContent?.includes('Final DB')))!.click());
    for (let i = 0; i < 5; i++) await act(async () => button('Next', modal())!.click());
    await act(async () => button('Skip folders', modal())?.click());
    await act(async () => button('Create project', modal())!.click());
    await until('the project', () => !document.querySelector('.modal'));
    await act(async () => button('SLD')!.click());
    const boards = () => [...document.querySelectorAll('svg g.bd')].map((g) => g.getAttribute('data-lv-id'));
    await until('the DB on the drawing', () => boards().length > 0);
    const first = document.querySelector('svg g.bd')!;
    const before = boards();
    await act(async () => { first.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 })); });
    const row = () => [...document.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === 'Add upstream board…');
    await until('the Add upstream board… row', () => !!row());
    await act(async () => row()!.click());
    await until('the question', () => document.body.textContent?.includes('Add a board above') ?? false);
    await act(async () => button('Add board', document.querySelector('.modal') as HTMLElement)!.click());
    await until('the new board on the drawing', () => boards().includes('board:SMDB-1'));
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); });
    await until('the single DB again', () => !boards().includes('board:SMDB-1') && boards().join() === before.join());
  });

  it('a start from one RMU and one transformer: right-click RMU-1 → Add transformer and main board asks about RRTT, then MDB-2 is on the drawing', async () => {
    await act(async () => { root = createRoot(host); root.render(<App />); });
    await until('the New project button', () => !![...host.querySelectorAll('button')].find((b) => b.textContent?.includes('New project')));
    await act(async () => ([...host.querySelectorAll('button')].find((b) => b.textContent?.includes('New project')) as HTMLButtonElement).click());
    await until('the wizard', () => !!document.querySelector('.modal .home-act'));
    await act(async () => (document.querySelector('.modal .home-act') as HTMLButtonElement).click());
    const modal = () => document.querySelector('.modal') as HTMLElement;
    await act(async () => button('Next', modal())!.click());
    await until('the SLD start step', () => !!modal().textContent?.includes('SLD start'));
    await act(async () => ([...modal().querySelectorAll<HTMLButtonElement>('button[role=radio]')].find((b) => b.textContent?.includes('RMU, one or two')))!.click());
    for (let i = 0; i < 5; i++) await act(async () => button('Next', modal())!.click());
    await act(async () => button('Skip folders', modal())?.click());
    await act(async () => button('Create project', modal())!.click());
    await until('the project', () => !document.querySelector('.modal'));
    // The 11 kV starts open the MV supply and RMUs card first.
    await until('the MV supply card', () => document.body.textContent?.includes('MV supply and RMUs') ?? false);
    // Panels belongs to the SLD tab: its SLD button opens the drawing.
    await act(async () => (document.querySelector('#ribbon-tab-sld') as HTMLButtonElement).click());
    await until('the SLD button', () => !!document.querySelector('button[title="Single line diagram"]'));
    await act(async () => (document.querySelector('button[title="Single line diagram"]') as HTMLButtonElement).click());
    await until('the RMU on the drawing', () => !!document.querySelector('svg g.rmu[data-rmu="RMU-1"]'));
    const boards = () => [...document.querySelectorAll('svg g.bd')].map((g) => g.getAttribute('data-lv-id'));
    expect(boards()).not.toContain('board:MDB-2');
    await act(async () => { document.querySelector('svg g.rmu[data-rmu="RMU-1"] rect')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90 })); });
    const row = () => [...document.querySelectorAll<HTMLButtonElement>('.cad-menu button')].find((b) => b.querySelector('.lb')?.textContent === 'Add transformer and main board');
    await until('the Add transformer and main board row', () => !!row());
    expect(row()!.textContent).toContain('full → RRTT');
    await act(async () => row()!.click());
    await until('the question about RRTT', () => document.body.textContent?.includes('it becomes RRTT') ?? false);
    await act(async () => button('Add transformer', document.querySelector('.modal') as HTMLElement)!.click());
    await until('MDB-2 on the drawing', () => boards().includes('board:MDB-2'));
    await until('RMU-1 as RRTT', () => !!document.querySelector('svg g.rmu[data-rmu="RMU-1"]')?.textContent?.includes('RRTT'));
  });
});
