// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary, setCrashKeeper } from './ErrorBoundary';
import type { CrashKept } from '../model/projectStore';
import { readErrorLog } from '../util/errorLog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let failing: boolean;
let mounted: number;
let failure = '';
let count = 0;
const swallowError = (e: Event) => e.preventDefault(); // the caught error, which jsdom would print

function Page() {
  useEffect(() => { mounted += 1; }, []);
  if (failing) throw new Error(failure);
  return <p>Page content</p>;
}

const render = (node: React.ReactNode) => act(async () => root.render(node));
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label);
const click = (label: string) => act(async () => button(label)!.click());

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  failing = true;
  mounted = 0;
  count += 1;
  failure = `Cannot read the board ${count}`; // the log skips an error repeating at once
  localStorage.clear();
  window.addEventListener('error', swallowError);
  vi.spyOn(console, 'error').mockImplementation(() => {}); // React reports every caught error here
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setCrashKeeper(null);
  window.removeEventListener('error', swallowError);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('an error on one page', () => {
  const app = (key?: string) => <div><nav>The ribbon</nav><ErrorBoundary level="page" resetKey={key}><Page /></ErrorBoundary></div>;

  it('leaves the rest of the app up and says so', async () => {
    await render(app());
    expect(host.textContent).toContain('The ribbon');
    expect(host.textContent).toContain('This page hit an error');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('is recorded, with the component it happened in', async () => {
    await render(app());
    const [entry] = readErrorLog();
    expect(entry).toMatchObject({ kind: 'page', message: failure });
    expect(entry.where).toContain('Page');
    expect(host.querySelector('pre')?.textContent).toContain(failure);
  });

  it('does not touch unsaved work: nothing else stopped', async () => {
    const keep = vi.fn(async (): Promise<CrashKept> => 'kept');
    setCrashKeeper(keep);
    await render(app());
    expect(keep).not.toHaveBeenCalled();
  });

  it('Try again draws the page again, and says so again if it still fails', async () => {
    await render(app());
    await click('Try again');
    expect(host.textContent).toContain('This page hit an error');
    failing = false;
    await click('Try again');
    expect(host.textContent).toContain('Page content');
    expect(host.textContent).not.toContain('This page hit an error');
  });

  it('clears when another page is opened, not before', async () => {
    await render(app('load-schedule'));
    failing = false;
    await render(app('load-schedule'));
    expect(host.textContent).toContain('This page hit an error');
    await render(app('design'));
    expect(host.textContent).toContain('Page content');
  });

  it('adds nothing around a page that works, and moving between pages does not redraw it from nothing', async () => {
    failing = false;
    await render(<ErrorBoundary level="page" resetKey="a"><Page /></ErrorBoundary>);
    expect(host.innerHTML).toBe('<p>Page content</p>');
    await render(<ErrorBoundary level="page" resetKey="b"><Page /></ErrorBoundary>);
    expect(mounted).toBe(1);
  });
});

describe('an error that stops the whole app', () => {
  const app = () => <ErrorBoundary level="app"><Page /></ErrorBoundary>;

  it.each<[CrashKept, string]>([
    ['kept', 'Your unsaved work has been kept. After reloading, choose Restore it'],
    ['waiting', 'A recovery copy of this project is already waiting. After reloading, choose Restore it'],
    ['nothing', 'There were no unsaved changes.'],
    ['failed', 'could not be kept']
  ])('%s: says what happened to unsaved work', async (kept, says) => {
    setCrashKeeper(async () => kept);
    await render(app());
    expect(host.textContent).toContain('Something went wrong');
    expect(host.textContent).toContain(says);
    expect(button('Reload')!.disabled).toBe(false);
    expect(readErrorLog()[0]).toMatchObject({ kind: 'app', message: failure });
  });

  it('keeps the work before Reload can be pressed', async () => {
    let answer!: (k: CrashKept) => void;
    setCrashKeeper(() => new Promise((done) => { answer = done; }));
    await render(app());
    expect(host.textContent).toContain('Keeping your unsaved work…');
    expect(button('Reload')!.disabled).toBe(true);
    await act(async () => answer('kept'));
    expect(button('Reload')!.disabled).toBe(false);
  });

  it('says so when keeping the work fails', async () => {
    setCrashKeeper(() => Promise.reject(new Error('disk full')));
    await render(app());
    expect(host.textContent).toContain('could not be kept');
  });

  it('does not wait for ever: Reload always comes back', async () => {
    vi.useFakeTimers();
    setCrashKeeper(() => new Promise(() => {}));
    await render(app());
    expect(button('Reload')!.disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(button('Reload')!.disabled).toBe(false);
    expect(host.textContent).toContain('could not be kept');
  });

  it('with the app failing before it could hand over any work, there is none to lose', async () => {
    await render(app());
    expect(host.textContent).toContain('There were no unsaved changes.');
  });
});

describe('Copy details', () => {
  const clipboard = (writeText: unknown) => Object.defineProperty(navigator, 'clipboard', { value: writeText === undefined ? undefined : { writeText }, configurable: true });
  const page = () => <ErrorBoundary level="page"><Page /></ErrorBoundary>;
  afterEach(() => clipboard(undefined));

  it('copies the entry and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    await render(page());
    await click('Copy details');
    expect(writeText.mock.calls[0][0]).toContain(failure);
    expect(button('Copied')).toBeDefined();
  });

  it.each([['refused', vi.fn().mockRejectedValue(new Error('not allowed'))], ['missing', undefined]])('with the clipboard %s, stays as it was', async (_what, writeText) => {
    clipboard(writeText);
    await render(page());
    await click('Copy details');
    expect(button('Copy details')).toBeDefined();
  });
});
