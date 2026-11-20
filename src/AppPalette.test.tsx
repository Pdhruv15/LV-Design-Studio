// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type Ribbon from './components/Ribbon';

/** The real App and its ⌘K palette; only the ribbon is replaced, to read where the app is. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let ribbon: ComponentProps<typeof Ribbon> | null = null;
vi.mock('./components/Ribbon', async (original) => ({
  ...await original<typeof import('./components/Ribbon')>(),
  default: (props: ComponentProps<typeof Ribbon>) => { ribbon = props; return null; }
}));
// The sample with one drawing sheet, so the palette lists it.
vi.mock('./data/sampleProject', async (original) => {
  const real = await original<typeof import('./data/sampleProject')>();
  return { sampleProject: { ...real.sampleProject, drawingSet: { prefix: 'E-SLD-', register: true, sheets: [
    { id: 'sh-1', number: 'E-SLD-001', title: 'SLD — MDB-1', kind: 'system', boards: ['MDB-1'], size: 'auto', status: 'FOR APPROVAL' }
  ] } } };
});

let host: HTMLDivElement;
let root: Root;
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${host.textContent}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); // the SLD canvas measures itself
  Element.prototype.scrollIntoView ??= () => {}; // the palette keeps its highlighted row in view
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

describe('the ⌘K palette', () => {
  it('opens a drawing sheet in Design CAD → Sheets, not on the SLD', async () => {
    await act(async () => { root = createRoot(host); root.render(<App />); });
    await until('the sample button', () => !!button('sample'));
    await act(async () => button('sample')!.click());
    await until('the ribbon', () => !!ribbon);
    await act(async () => ribbon!.a.onView('design'));
    await until('the Search chip', () => !!host.querySelector('.cmdk-open'));
    await act(async () => (host.querySelector('.cmdk-open') as HTMLButtonElement).click());
    const item = () => [...host.querySelectorAll<HTMLButtonElement>('.cmdk-item')].find((b) => b.textContent?.includes('E-SLD-001'));
    await until('the sheet in the palette', () => !!item());
    await act(async () => item()!.click());
    await until('the Sheets page', () => ribbon!.a.view === 'drawings');
    expect(ribbon!.a.sheets?.open).toBe(true);
  });
});
