import { createElement, lazy, Suspense, type Attributes, type ComponentType, type JSX, type ReactNode } from 'react';

/** What a page shows when its code cannot be loaded. In the web version a page left open keeps running its own build,
 * and that build's files can be gone once newer builds have gone live; or there is no connection. */
function NotLoaded() {
  return (
    <div className="page-not-loaded" role="alert">
      <p>This page could not be loaded. A newer version of the app may have replaced this one, or the connection may be down. The rest of the app still works, so save or download your project first if it has changes.</p>
      <button className="chip primary" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}

/** React's lazy, except that code which cannot be loaded leaves a message on that page. Left to fail, it would take the
 * whole app down with it, and nothing could be clicked any more. */
export const lazyPage: typeof lazy = (load) => lazy(() => load().catch(() => ({ default: NotLoaded as never })));

/** A component whose code loads the first time it is shown, in its own Suspense boundary, so it can be rendered
 * anywhere like a normal component. For pages and dialogs that are not needed at start-up: their code stays out of
 * the main bundle and the app opens faster. */
export function onDemand<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, fallback: ReactNode = null): (props: P) => JSX.Element {
  const Loaded = lazyPage(load) as unknown as ComponentType<P>;
  return function OnDemand(props: P) {
    return <Suspense fallback={fallback}>{createElement(Loaded, props as P & Attributes)}</Suspense>;
  };
}
