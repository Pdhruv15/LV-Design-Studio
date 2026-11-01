import { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { lazyPage } from '../../../src/util/onDemand';

/** A page built like the web version (the app's Vite config, so its service worker), with one page loaded when opened,
 * as the app's are: see webUpdate.electron.ts. */

const Later = lazyPage(() => import('./later'));

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <main>
      <button id="open" onClick={() => setOpen(true)}>Open</button>
      {open && <Suspense fallback={<p>Loading…</p>}><Later /></Suspense>}
    </main>
  );
}

const page = window as unknown as Record<string, unknown>;
page.errors = [] as string[];
window.addEventListener('error', (e) => (page.errors as string[]).push(e.message));
/** Registers the service worker and waits until it is in charge of this page. */
page.ready = async () => {
  const sw = navigator.serviceWorker;
  page.registration = await sw.register('./sw.js');
  await sw.ready;
  if (!sw.controller) await new Promise((r) => sw.addEventListener('controllerchange', r, { once: true }));
  return true;
};
/** Looks for a new build, as the app does when the page is shown again, and waits until it has taken over this page. */
page.takeOver = async () => {
  const sw = navigator.serviceWorker, was = sw.controller;
  await (page.registration as ServiceWorkerRegistration).update();
  if (sw.controller === was) await new Promise((r) => sw.addEventListener('controllerchange', r, { once: true }));
  return true;
};
createRoot(document.getElementById('root')!).render(<Host />);
