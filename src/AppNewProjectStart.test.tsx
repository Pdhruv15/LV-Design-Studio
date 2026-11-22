// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import App from './App';

/** The real App: a new project started from an RMU opens the MV supply and RMUs card. */

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

describe('New project with the RMU start', () => {
  it('makes the project and opens the MV supply and RMUs card', async () => {
    await act(async () => { root = createRoot(host); root.render(<App />); });
    await until('the New project button', () => !!button('New project') || !![...host.querySelectorAll('button')].find((b) => b.textContent?.includes('New project')));
    await act(async () => ([...host.querySelectorAll('button')].find((b) => b.textContent?.includes('New project')) as HTMLButtonElement).click());
    await until('the wizard', () => !!document.querySelector('.modal .home-act'));
    await act(async () => (document.querySelector('.modal .home-act') as HTMLButtonElement).click());
    const modal = () => document.querySelector('.modal') as HTMLElement;
    await act(async () => button('Next', modal())!.click());
    await until('the SLD start step', () => !!modal().textContent?.includes('SLD start'));
    await act(async () => ([...modal().querySelectorAll<HTMLButtonElement>('button[role=radio]')].find((b) => b.textContent?.includes('RMU and one or two transformers')))!.click());
    for (let i = 0; i < 5; i++) await act(async () => button('Next', modal())!.click());
    await act(async () => button('Skip folders', modal())?.click());
    await act(async () => button('Create project', modal())!.click());
    await until('the MV supply and RMUs card', () => [...document.querySelectorAll('h4')].some((h) => h.textContent === 'MV supply and RMUs'));
    await until('the RMU on the transformer row', () => [...document.querySelectorAll('select')].some((s) => s.value === 'RMU-1'));
  });
});
