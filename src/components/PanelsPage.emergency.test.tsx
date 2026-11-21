// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { sampleProject } from '../data/sampleProject';
import PanelsPage from './PanelsPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.setConfig({ testTimeout: 30000 });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); });
const text = () => document.body.textContent ?? '';
async function until(what: string, isTrue: () => boolean) {
  const giveUp = Date.now() + 20000;
  while (!isTrue()) {
    if (Date.now() > giveUp) throw new Error(`Still waiting for ${what}. On screen: ${text()}`);
    await act(async () => { await new Promise((r) => { setTimeout(r, 20); }); });
  }
}

describe('Panels: emergency boards from the generator study', () => {
  it('opens the emergency section with the generator kVA given', async () => {
    await act(async () => { root = createRoot(host); root.render(<PanelsPage project={sampleProject} onChange={() => {}} onCreated={() => {}} onStatus={() => {}} onBuilding={() => {}} emergencyKva={1000} />); });
    await until('the emergency section', () => text().includes('Standby generator'));
    const field = [...host.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Standby generator'))!.querySelector('input')!;
    expect(field.value).toBe('1000');
  });
});
