// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import DrawingsView, { type DrawingsTab } from './DrawingsView';
import { sampleProject } from '../../data/sampleProject';
import type { Project } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const plain: Project = { ...sampleProject, drawingSet: undefined };
const ringed: Project = { ...plain, boards: plain.boards.map((b) => (b.id === 'MDB-1' ? { ...b, rmu: 'RMU-1', substation: 'SS-1' } : b)) };

describe('Design CAD → Sheets: One sheet per substation', () => {
  let host: HTMLDivElement, root: Root;
  const change = vi.fn();
  beforeEach(() => { change.mockReset(); host = document.body.appendChild(document.createElement('div')); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });
  const draw = (p: Project, tab: DrawingsTab) => act(() => root.render(<DrawingsView project={p} initialTab={tab} onChange={change} onStatus={() => {}} onOpen={() => {}} />));
  const button = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'One sheet per substation');

  it('is offered once a main board names its substation or RMU, and makes the MV overview first', async () => {
    draw(plain, 'layout');
    expect([button()?.disabled, button()?.title]).toEqual([true, 'Name the substations or RMUs of the main boards first (Panels → Transformers)']);
    draw(ringed, 'layout');
    expect(button()?.disabled).toBe(false);
    await act(async () => { button()!.click(); });
    const set = (change.mock.calls[0][0] as Project).drawingSet!;
    expect(set.sheets.filter((s) => s.kind === 'system').map((s) => [s.number, s.title, s.view ?? ''])).toEqual([
      ['E-SLD-001', 'MV supply — ring, substations and transformers', 'mv'],
      ['E-SLD-002', 'SLD — SS-1 (TX-1)', '']
    ]);
  });

  it('is one of the choices for a project with no sheets yet, only with substations or RMUs named', () => {
    const titles = () => [...host.querySelectorAll('.dw-option > b')].map((b) => b.textContent);
    draw(plain, 'sheets');
    expect(titles()).not.toContain('One sheet per substation');
    draw(ringed, 'sheets');
    expect(titles()).toContain('One sheet per substation');
    const card = [...host.querySelectorAll('.dw-option')].find((o) => o.querySelector('b')?.textContent === 'One sheet per substation')!;
    expect(card.querySelector('.dw-preview')?.textContent).toMatch(/^Creates 3 sheets · MV supply — ring, substations and transformers · SS-1 \(TX-1\) · Earthing schematic/);
  });
});
