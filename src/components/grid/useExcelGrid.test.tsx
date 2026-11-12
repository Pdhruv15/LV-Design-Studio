// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExcelGrid, type GridCommands } from './useExcelGrid';
import { cellKey, type GridEdit, type Pos } from './excelGrid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let cmds: GridCommands;
const edits: GridEdit[][] = [];
const active: (Pos | null)[] = [];
const VALUES = [['a1', 'b1'], ['a2', 'b2'], ['a3', 'b3']];

function Grid() {
  const ref = useRef<HTMLDivElement>(null);
  cmds = useExcelGrid(ref, (e) => edits.push(e), (p) => active.push(p));
  return (
    <div>
      <div ref={ref}><table><tbody>
        {VALUES.map((r, y) => <tr key={y}>{r.map((v, x) => <td key={x}><input data-cell={cellKey(y, x)} defaultValue={v} /></td>)}</tr>)}
      </tbody></table></div>
      <button id="ribbon-button">Fill down</button>
    </div>
  );
}
const cell = (y: number, x: number) => document.querySelector<HTMLInputElement>(`[data-cell="${cellKey(y, x)}"]`)!;
const press = (el: Element, over: Partial<MouseEventInit> = {}) => act(() => { el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ...over })); window.dispatchEvent(new MouseEvent('mouseup')); });
/** Cells (0,0) to (1,1) selected. */
const select = () => { press(cell(0, 0)); press(cell(1, 1), { shiftKey: true }); };
const key = (el: Element, k: string, over: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ctrlKey: true, ...over })); });
const pasteEvent = (el: Element, text: string) => act(() => {
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { getData: () => text } });
  el.dispatchEvent(e);
});

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  edits.length = 0; active.length = 0;
  writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  root = createRoot(document.body.appendChild(document.createElement('div')));
  act(() => root.render(<Grid />));
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('the grid commands', () => {
  it('copy() puts the selection on the clipboard as the key does', () => {
    select();
    key(cell(1, 1), 'c');
    expect(cmds.copy()).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText.mock.calls[1]).toEqual(writeText.mock.calls[0]);
    expect(writeText.mock.calls[0][0]).toBe('a1\tb1\na2\tb2');
  });

  it('fillDown() makes the edits Ctrl/⌘ D makes', () => {
    select();
    key(cell(1, 1), 'd');
    cmds.fillDown();
    expect(edits).toHaveLength(2);
    expect(edits[1]).toEqual(edits[0]);
    expect(edits[0]).toEqual([{ y: 1, x: 0, value: 'a1' }, { y: 1, x: 1, value: 'b1' }]);
  });

  it('paste(text) makes the edits a paste event makes, from the start of the selection', () => {
    select();
    pasteEvent(cell(1, 1), 'X\tY\nZ\tW');
    expect(cmds.paste('X\tY\nZ\tW')).toBe(true);
    expect(edits).toHaveLength(2);
    expect(edits[1]).toEqual(edits[0]);
    expect(edits[0]).toEqual([{ y: 0, x: 0, value: 'X' }, { y: 0, x: 1, value: 'Y' }, { y: 1, x: 0, value: 'Z' }, { y: 1, x: 1, value: 'W' }]);
  });

  it('paste(text) of one value goes to the active cell; with no selection it does nothing', () => {
    expect(cmds.paste('X')).toBe(false);
    expect(cmds.copy()).toBe(false);
    expect(edits).toEqual([]);
    press(cell(2, 1));
    expect(cmds.paste('X')).toBe(true);
    expect(edits).toEqual([[{ y: 2, x: 1, value: 'X' }]]);
  });

  it('keeps the selection when focus moves to a button outside the grid, and says which cell is active', () => {
    select();
    expect(active[active.length - 1]).toEqual({ y: 1, x: 1 });
    act(() => document.getElementById('ribbon-button')!.focus());
    expect(document.activeElement).toBe(document.getElementById('ribbon-button'));
    cmds.fillDown();
    expect(edits).toEqual([[{ y: 1, x: 0, value: 'a1' }, { y: 1, x: 1, value: 'b1' }]]);
    expect(document.querySelectorAll('.gx-sel')).toHaveLength(4);
    expect(active[active.length - 1]).toEqual({ y: 1, x: 1 });
  });

  it('keeps the keys as they were: Ctrl/⌘ D on one cell does nothing', () => {
    press(cell(0, 0));
    key(cell(0, 0), 'd');
    cmds.fillDown();
    expect(edits).toEqual([]);
  });
});
