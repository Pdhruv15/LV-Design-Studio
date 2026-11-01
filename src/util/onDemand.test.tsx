// @vitest-environment jsdom
import { act, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { lazyPage, onDemand } from './onDemand';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('shows the fallback, then the component once its code has loaded, with its props', async () => {
  let loaded!: () => void;
  const ready = new Promise<void>((r) => { loaded = r; });
  const Hello = onDemand(async () => { await ready; return { default: ({ name }: { name: string }) => <p>Hello {name}</p> }; }, <p>Loading…</p>);
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<Hello name="Sami" />));
  expect(host.textContent).toBe('Loading…');
  await act(async () => { loaded(); await ready; });
  expect(host.textContent).toBe('Hello Sami');
  act(() => root.unmount());
});

const gone = () => Promise.reject<{ default: () => JSX.Element }>(new TypeError('Failed to fetch dynamically imported module: assets/Page-old.js'));

it('leaves a message on the page when its code cannot be loaded, and the rest of the app up', async () => {
  const Page = lazyPage(gone);
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<main><button>Still here</button><Suspense fallback={null}><Page /></Suspense></main>));
  expect(host.querySelector('main button')?.textContent).toBe('Still here');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('This page could not be loaded');
  expect(host.querySelector<HTMLButtonElement>('.page-not-loaded button')?.textContent).toBe('Reload');
  act(() => root.unmount());
});

it('does the same for a component loaded on demand', async () => {
  const Dialog = onDemand<{ name: string }>(gone);
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<main><button>Still here</button><Dialog name="Sami" /></main>));
  expect(host.querySelector('main button')?.textContent).toBe('Still here');
  expect(host.textContent).toContain('This page could not be loaded');
  act(() => root.unmount());
});

it('shows the page itself when its code loads', async () => {
  const Page = lazyPage(async () => ({ default: () => <p>The page</p> }));
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<Suspense fallback={null}><Page /></Suspense>));
  expect(host.textContent).toBe('The page');
  act(() => root.unmount());
});
