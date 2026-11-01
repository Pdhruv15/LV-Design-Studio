// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import type Ribbon from './components/Ribbon';
import { readRecoveries } from './model/projectStore';
import { readErrorLog } from './util/errorLog';

/** The real App with its real state, as far as a crash goes: only the ribbon (which stands outside the pages, so its
 * error stops the whole app) and one page are replaced, to fail on command and to give a way in without clicking. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

const fail = vi.hoisted(() => ({ ribbon: '', help: '' }));
let ribbon: ComponentProps<typeof Ribbon> | null = null;

vi.mock('./components/Ribbon', async (original) => ({
  ...await original<typeof import('./components/Ribbon')>(),
  default: (props: ComponentProps<typeof Ribbon>) => {
    ribbon = props;
    if (fail.ribbon) throw new Error(fail.ribbon);
    return null;
  }
}));
vi.mock('./components/HelpView', async (original) => {
  const real = await original<typeof import('./components/HelpView')>();
  return {
    ...real,
    default: () => {
      if (fail.help) throw new Error(fail.help);
      return <p>The help page</p>;
    }
  };
});

let host: HTMLDivElement;
let root: Root;
const swallowError = (e: Event) => e.preventDefault(); // the caught error, which jsdom would print

const mount = () => act(async () => {
  ribbon = null; // what the app before this one last showed says nothing about this one
  root = createRoot(host);
  root.render(<ErrorBoundary level="app"><App /></ErrorBoundary>);
});
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label));

/** Pages load when first opened and recovery copies are read after starting, which on a slow machine takes longer than
 * any fixed wait should assume. */
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${host.textContent}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}
const shows = (text: string) => until(`"${text}"`, () => !!host.textContent?.includes(text));

async function openSample() {
  await mount();
  await until('the sample button', () => !!button('sample'));
  await act(async () => button('sample')!.click());
  await until('the ribbon', () => !!ribbon);
}
const edit = () => act(async () => ribbon!.a.onRoute('before-ifc'));
const open = (view: Parameters<NonNullable<typeof ribbon>['a']['onView']>[0]) => act(async () => ribbon!.a.onView(view));
const crash = (why: string) => {
  fail.ribbon = why;
  return open('dashboard');
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  localStorage.clear();
  fail.ribbon = '';
  fail.help = '';
  window.addEventListener('error', swallowError);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  window.removeEventListener('error', swallowError);
  vi.restoreAllMocks();
});

describe('the app stopping with an error', () => {
  it('keeps unsaved work, and it can be restored after reloading', async () => {
    await openSample();
    await edit();
    await crash('app stopped with work unsaved');
    await shows('Your unsaved work has been kept');
    expect(host.textContent).toContain('Something went wrong');
    expect(host.querySelector('.recover-bar')).toBeNull();
    const [copy] = await readRecoveries();
    expect(copy.project.stage?.route).toBe('before-ifc');
    expect(readErrorLog().slice(-1)[0]).toMatchObject({ kind: 'app', message: 'app stopped with work unsaved' });

    // Reload: a new start of the app, with the same stored data.
    act(() => root.unmount());
    fail.ribbon = '';
    await mount();
    await shows('Unsaved work on');
    expect(ribbon).toBeNull(); // back on the projects list, nothing of that project open yet
    await act(async () => button('Restore it')!.click());
    await until('the project to be restored', () => !!ribbon);
    expect(ribbon!.a.route).toBe('before-ifc');
  });

  it('says there was nothing to lose when all was saved, and writes no copy', async () => {
    await openSample();
    await crash('app stopped with nothing unsaved');
    await shows('There were no unsaved changes.');
    expect(await readRecoveries()).toEqual([]);
  });
});

describe('one page stopping with an error', () => {
  it('leaves the app up, with the work still open, and Try again brings the page back', async () => {
    await openSample();
    await edit();
    fail.help = 'the help page failed';
    await open('help');
    await shows('This page hit an error');
    expect(host.textContent).not.toContain('Something went wrong');
    expect(await readRecoveries()).toEqual([]); // nothing was lost, so no copy
    expect(readErrorLog().slice(-1)[0]).toMatchObject({ kind: 'page', message: 'the help page failed' });

    await act(async () => button('Try again')!.click());
    expect(host.textContent).toContain('This page hit an error');
    fail.help = '';
    await act(async () => button('Try again')!.click());
    await shows('The help page');
    expect(host.textContent).not.toContain('This page hit an error');
    expect(ribbon!.a.route).toBe('before-ifc');
  });

  it('opening another page clears it', async () => {
    await openSample();
    fail.help = 'the help page failed again';
    await open('help');
    await shows('This page hit an error');
    await open('dashboard');
    await until('the message to clear', () => !host.textContent?.includes('This page hit an error'));
    expect(host.textContent).not.toContain('Something went wrong');
  });
});
