// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewProjectWizard } from './BriefEditor';
import { BUILT_IN_REFERENCES } from '../model/designReference';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const onCreate = vi.fn();
beforeEach(() => { localStorage.clear(); onCreate.mockClear(); root = createRoot(document.body.appendChild(document.createElement('div'))); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; localStorage.clear(); });

const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
const text = () => document.body.textContent ?? '';
const tile = (title: string) => [...document.querySelectorAll<HTMLButtonElement>('button[role=radio]')].find((b) => b.querySelector('b')?.textContent === title)!;
const show = () => {
  act(() => root.render(<NewProjectWizard initialName="Villa" references={BUILT_IN_REFERENCES} folderParent="" onQuick={() => {}} onCreate={onCreate} onCancel={() => {}} />));
  click(document.querySelector('.home-act')!);
  click(button('Next'));
};
const finish = () => { for (let i = 0; i < 5; i++) click(button('Next')); };

describe('New project: the SLD start step', () => {
  it('is step 2 of 7 with the transformer start chosen', () => {
    show();
    expect(text()).toContain('step 2 of 7: SLD start');
    expect(tile('Transformer and main board').getAttribute('aria-checked')).toBe('true');
    expect(text()).toContain("It can be changed afterwards on the board's Supply tab.");
  });
  it('passes the transformer start as the eighth argument when left alone', () => {
    show(); finish();
    click(button('Create project'));
    expect(onCreate.mock.calls[0][7]).toEqual({ level: 'transformer' });
  });
  it('passes the chosen start and shows it on the Review step', () => {
    show();
    click(tile('Final DB'));
    finish();
    expect(text()).toContain('SLD starts from: Final DB');
    click(button('Create project'));
    expect(onCreate.mock.calls[0][7]).toEqual({ level: 'db' });
  });
});
