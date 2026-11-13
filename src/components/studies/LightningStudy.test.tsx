// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LightningStudy from './LightningStudy';
import { sampleProject } from '../../data/sampleProject';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const field = (label: string) => [...document.querySelectorAll('label.nf')].find((l) => l.querySelector('span')?.textContent === label)!.querySelector('input')!;
const enter = (el: HTMLInputElement, value: string) => act(() => { el.value = value; el.focus(); el.blur(); });
const text = () => document.body.textContent ?? '';

describe('Lightning protection study', () => {
  let last: Project;
  const render = (p: Project) => act(() => root.render(<LightningStudy project={p} onChange={(x) => { last = x; render(x); }} />));

  it('starts empty: nothing is assumed and the building size is asked for', () => {
    render(sampleProject);
    expect(text()).toContain('Building length, width and height must be more than zero');
    expect(text()).toContain('Not entered');
    expect(field('Mesh size').value).toBe('');
    expect(field('Rolling sphere radius').placeholder).toBe('');
  });

  it('saves the entries with the project and works out the mesh and the down conductors', () => {
    render(sampleProject);
    enter(field('Length'), '40');
    enter(field('Width'), '25');
    enter(field('Height'), '18');
    expect(text()).toContain('DATA REQUIRED');
    enter(field('Mesh size'), '10');
    enter(field('Down conductor spacing'), '10');
    expect(last.lightning).toMatchObject({ lengthM: 40, widthM: 25, heightM: 18, meshM: 10, downSpacingM: 10, method: 'mesh' });
    expect(text()).toContain('5 runs · 285 m of roof conductor');
    expect(document.querySelectorAll('svg circle[stroke]').length).toBe(13);
  });

  it('compares the four methods and selects one from its row', () => {
    render({ ...sampleProject, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', lpsClass: 'II', meshM: 10, sphereRadiusM: 30, downSpacingM: 10, rodHeightM: 3, angleDeg: 45, eseMastM: 5, eseDeltaTUs: 60, eseDownPerTerminal: 2 } });
    expect(text()).toContain('12 rods on a 13.33 × 12.5 m grid');
    expect(text()).toContain('Rp 86.46 m · 1 terminal');
    expect(text()).toContain('not an IEC 62305 method');
    const eseRow = [...document.querySelectorAll('tbody tr')].find((tr) => tr.textContent?.startsWith('ESE air terminal')) as HTMLElement;
    act(() => eseRow.click());
    expect(last.lightning?.method).toBe('ese');
    expect(text()).toContain('ESE air terminal (selected)');
  });

  it('clearing a value brings DATA REQUIRED back', () => {
    render({ ...sampleProject, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', meshM: 10, downSpacingM: 10 } });
    enter(field('Mesh size'), '');
    expect(last.lightning?.meshM).toBeUndefined();
    expect(text()).toContain('Data required');
  });

  it('puts the quantities in the BOQ only when ticked', () => {
    render({ ...sampleProject, lightning: { lengthM: 40, widthM: 25, heightM: 18, method: 'mesh', meshM: 10, downSpacingM: 10 } });
    const box = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Include these quantities in the project BOQ'))!.querySelector('input')!;
    expect(box.checked).toBe(false);
    act(() => box.click());
    expect(last.lightning?.inBoq).toBe(true);
  });
});
