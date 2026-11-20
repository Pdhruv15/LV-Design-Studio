// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type Ribbon from './components/Ribbon';

/** The real App and the SLD page's Sheets menu; only the ribbon is replaced, to read where the app is. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let ribbon: ComponentProps<typeof Ribbon> | null = null;
vi.mock('./components/Ribbon', async (original) => ({
  ...await original<typeof import('./components/Ribbon')>(),
  default: (props: ComponentProps<typeof Ribbon>) => { ribbon = props; return null; }
}));
// The sample with one system SLD sheet of MDB-1 and its DBs.
vi.mock('./data/sampleProject', async (original) => {
  const real = await original<typeof import('./data/sampleProject')>();
  return { sampleProject: { ...real.sampleProject, drawingSet: { prefix: 'E-SLD-', register: true, sheets: [
    { id: 'sh-1', number: 'E-SLD-001', title: 'SLD — MDB-1', kind: 'system', boards: ['MDB-1', 'SMDB-GF'], size: 'auto', status: 'FOR APPROVAL' }
  ] } } };
});

let host: HTMLDivElement;
let root: Root;
const button = (label: string, within: ParentNode = host) => [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(label));
const menu = () => host.querySelector('.sld-tabs .menu-pop');
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${host.textContent}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}
async function openSld() {
  await act(async () => { root = createRoot(host); root.render(<App />); });
  await until('the sample button', () => !!button('sample'));
  await act(async () => button('sample')!.click());
  await until('the ribbon', () => !!ribbon);
  await act(async () => ribbon!.a.onView('design'));
  await until('the Sheets menu button', () => !!host.querySelector('.sld-tabs .menu-btn'));
}
const openMenu = async () => {
  await act(async () => (host.querySelector('.sld-tabs .menu-btn > button') as HTMLButtonElement).click());
  await until('the menu', () => !!menu());
};
const pick = async (label: string) => {
  await until(`"${label}" in the menu`, () => !!menu() && !!button(label, menu()!));
  await act(async () => button(label, menu()!)!.click());
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); // the SLD canvas measures itself
  host = document.createElement('div');
  document.body.append(host);
  localStorage.clear();
  ribbon = null;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('SLD page → Sheets menu', () => {
  it('lists the system diagram\'s sheets and opens one in Design CAD → Sheets', async () => {
    await openSld();
    await openMenu();
    expect(menu()!.textContent).toContain('Sheets of the system diagram');
    expect(menu()!.textContent).toContain('E-SLD-001 SLD — MDB-1 · For approval');
    await pick('E-SLD-001');
    await until('the Sheets page', () => ribbon!.a.view === 'drawings');
    expect(ribbon!.a.sheets?.open).toBe(true);
  });

  it('opens Sheet setup: the Layout tab of the register, with no sheet open', async () => {
    await openSld();
    await openMenu();
    await pick('Sheet setup');
    await until('the Sheets page', () => ribbon!.a.view === 'drawings');
    expect(ribbon!.a.sheets).toMatchObject({ tab: 'layout', open: false });
  });

  it('on a board with no sheet of its own, makes one and opens it', async () => {
    await openSld();
    await act(async () => button('Board: ')!.click());
    await openMenu();
    expect(menu()!.textContent).toContain('Sheets showing MDB-1');
    await pick('Make a sheet of MDB-1 on its own');
    await until('the new sheet', () => ribbon!.a.view === 'drawings' && !!ribbon!.a.sheets?.open);
    expect(ribbon!.a.sheets?.kind).toBe('board');
  });

  it('opens with ⌘5 / Ctrl+5', async () => {
    await openSld();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '5', metaKey: true, ctrlKey: true, bubbles: true })); });
    await until('the menu', () => !!menu());
    expect(menu()!.textContent).toContain('The sheet set');
  });
});
