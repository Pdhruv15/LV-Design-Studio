// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HelpView from './HelpView';
import { sampleProject } from '../data/sampleProject';
import { logError } from '../util/errorLog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const render = () => act(async () => root.render(<HelpView project={sampleProject} stale={[]} saved onGo={() => {}} />));
const copyButton = () => [...host.querySelectorAll('button')].find((b) => /error log|Copied/.test(b.textContent ?? ''));

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  localStorage.clear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
});

describe('the error log in Help', () => {
  it('is not mentioned until there is something in it', async () => {
    await render();
    expect(host.textContent).not.toContain('recorded on this computer');
    expect(copyButton()).toBeUndefined();
  });

  it('says how many, and copies them all', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    logError('page', new Error('first problem'));
    await render();
    expect(host.textContent).toContain('1 error recorded on this computer.');
    logError('script', new Error('second problem'));
    await render();
    expect(host.textContent).toContain('2 errors recorded on this computer.');
    await act(async () => copyButton()!.click());
    expect(writeText.mock.calls[0][0]).toContain('first problem');
    expect(writeText.mock.calls[0][0]).toContain('second problem');
    expect(copyButton()!.textContent).toBe('Copied');
  });
});
