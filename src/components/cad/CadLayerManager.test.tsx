// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayerManager } from './CadLayerManager';
import type { CadView } from '../../engines/cad/cadEngine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

describe('Layer manager → Print', () => {
  it('a drawn layer prints unless unticked; unticking keeps it on screen but off the sheets', () => {
    const onStyle = vi.fn();
    const view = { file: 'GF.dwg', info: { layers: [] } } as unknown as CadView;
    act(() => root.render(<LayerManager view={view} layersOn={new Uint8Array()} sketch={[]} styles={{ 'LV-ANNO': { noPrint: true } }} onLayer={() => {}} onStyle={onStyle} onClose={() => {}} />));
    const box = (name: string) => document.querySelector(`input[aria-label="${name} prints"]`) as HTMLInputElement;
    expect([box('LV-SKETCH').checked, box('LV-ANNO').checked]).toEqual([true, false]);
    act(() => { box('LV-SKETCH').click(); });
    expect(onStyle).toHaveBeenLastCalledWith('LV-SKETCH', { noPrint: true });
    act(() => { box('LV-ANNO').click(); });
    expect(onStyle).toHaveBeenLastCalledWith('LV-ANNO', { noPrint: false });
    expect(document.body.textContent).toContain('Untick Print to keep a layer on screen but off the plan sheets.');
  });
});
