// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HatchStrip, type HatchStripProps } from './HatchStrip';
import { HatchSwatch } from './AnnotatePanel';
import { parsePat, type HatchSpec } from '../../model/cadHatch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

const { patterns } = parsePat('*MYGRID, Office grid\n0, 0,0, 0,5\n90, 0,0, 0,5\n*MYSOLID\n*SOLID\n45, 0,0, 0,1');
const start: HatchSpec = { pattern: 'ansi31', scale: 3, angle: 15 };
const fns = () => ({ onSpec: vi.fn(), onPick: vi.fn(), onOutline: vi.fn(), onOrigin: vi.fn(), onFollow: vi.fn(), onFindIslands: vi.fn(), onKeep: vi.fn(), onImport: vi.fn(), onExport: vi.fn(), onDone: vi.fn() });
function show(over: Partial<HatchStripProps> = {}) {
  const f = fns();
  const props: HatchStripProps = { mode: 'hatch', spec: start, pick: 'point', follow: true, canFollow: true, findIslands: true, keep: false, ...f, ...over };
  act(() => root.render(<HatchStrip {...props} />));
  return { ...f, props, again: (next: Partial<HatchStripProps>) => act(() => root.render(<HatchStrip {...props} {...next} />)) };
}
const q = (sel: string, from: ParentNode = document) => from.querySelector(sel) as HTMLElement;
const btn = (name: string) => q(`button[aria-label="${name}"]`) ?? ([...document.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLElement);
const click = (el: Element | null) => { expect(el).toBeTruthy(); act(() => (el as HTMLElement).click()); };
const option = (name: string) => [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent === name) as HTMLElement;
const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
const typeIn = (input: HTMLInputElement, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })); });
const leave = (input: Element) => act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
const wide = (px: number) => vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(px);

describe('Hatch strip: groups and pattern swatches', () => {
  it('has the six groups in order, each with its caption', () => {
    show();
    expect([...document.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label'))).toEqual(['Boundary', 'Pattern', 'Properties', 'Origin', 'Options', 'Finish']);
    expect([...document.querySelectorAll('.hatch-strip-cap')].map((c) => c.textContent)).toEqual(['Boundary', 'Pattern', 'Properties', 'Origin', 'Options', 'Finish']);
    expect(q('[role="toolbar"]').getAttribute('aria-label')).toBe('Hatch');
  });

  it('shows the swatches as an option list with plain names (three at least), the chosen one marked; a click picks it and keeps spacing and angle', () => {
    const s = show();
    expect(q('[role="listbox"]').getAttribute('aria-label')).toBe('Hatch pattern');
    const lane = [...q('[role="listbox"]').querySelectorAll('[role="option"]')];
    expect(lane.map((o) => o.textContent)).toEqual(['Solid', 'Diagonal', 'Cross']);
    expect(lane.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(lane[1].getAttribute('title')).toBe('ANSI31 (45° lines)'); // the long name stays on the tooltip
    expect(document.body.textContent).not.toMatch(/ANSI/);
    click(option('Cross'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'ansi37', scale: 3, angle: 15 });
    click(option('Solid'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'solid', scale: 3, angle: 15 });
  });

  it('keeps the pattern origin when another pattern is picked', () => {
    const s = show({ spec: { ...start, origin: [1, 2] } });
    click(option('Cross'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'ansi37', scale: 3, angle: 15, origin: [1, 2] });
  });

  it('ArrowLeft and ArrowRight move the choice, and stop at the ends; the chosen swatch is the one Tab reaches', () => {
    const s = show();
    expect(option('Diagonal').tabIndex).toBe(0);
    expect(option('Cross').tabIndex).toBe(-1);
    key(option('Diagonal'), 'ArrowRight');
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'ansi37', scale: 3, angle: 15 });
    key(option('Diagonal'), 'ArrowLeft');
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'solid', scale: 3, angle: 15 });
    s.onSpec.mockClear();
    s.again({ spec: { ...start, pattern: 'solid' } });
    key(option('Solid'), 'ArrowLeft');
    expect(s.onSpec).not.toHaveBeenCalled();
    s.again({ spec: { ...start, pattern: 'insulation' } });
    key(option('Insulation'), 'ArrowRight');
    expect(s.onSpec).not.toHaveBeenCalled();
    key(option('Insulation'), 'ArrowLeft');
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'sand', scale: 3, angle: 15 });
  });

  it('brings the chosen pattern into view when it is far along the list, and pages with the arrows by the number shown', () => {
    const s = show({ spec: { ...start, pattern: 'sand' } });
    expect(option('Sand').getAttribute('aria-selected')).toBe('true');
    expect(btn('More patterns').hasAttribute('disabled')).toBe(true); // at the end
    click(btn('Earlier patterns'));
    expect([...q('[role="listbox"]').querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Block', 'Concrete', 'Earth']);
    click(btn('More patterns'));
    expect(option('Sand')).toBeTruthy();
    s.again({ spec: start });
    expect(option('Diagonal')).toBeTruthy(); // the pattern chosen from outside is scrolled back into view
  });

  it('shows as many swatches as fit the room', () => {
    const w = wide(540);
    show();
    expect(q('[role="listbox"]').querySelectorAll('[role="option"]')).toHaveLength(10);
    w.mockRestore();
  });

  it('draws each swatch from the real pattern lines, in the text colour (no fixed colours)', () => {
    show();
    const svg = (name: string) => option(name).querySelector('svg')!;
    expect(svg('Diagonal').querySelector('path')!.getAttribute('d')).toMatch(/^M[\d.-]+ [\d.-]+L/);
    expect(svg('Solid').querySelector('rect')).not.toBeNull();
    expect(svg('Diagonal').getAttribute('class')).toBe('hatch-strip-thumb');
    expect(document.body.innerHTML).not.toMatch(/#[0-9a-f]{3,6}\b|rgb\(/i);
  });

  it('lists the project\'s own patterns after the built-in ones and those of this computer last, none twice', () => {
    show({ patterns: [patterns[0]], computer: [patterns[0], patterns[1]], spec: { ...start, pattern: 'MYGRID', custom: patterns[0] } });
    click(btn('All patterns'));
    const section = (name: string) => [...q(`[role="listbox"][aria-label="${name}"]`).querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(section('Built in')).toHaveLength(18);
    expect(section('This project')).toEqual(['MYGRID']);
    expect(section('On this computer')).toEqual(['SOLID']);
    expect(q('[role="listbox"][aria-label="This project"] [aria-selected="true"]').textContent).toBe('MYGRID');
    expect(q('[role="listbox"][aria-label="This project"] [role="option"]').getAttribute('title')).toBe('MYGRID (Office grid)');
  });

  it('shows a drawing\'s own pattern that is in no list, and a pattern picked from the list carries its lines', () => {
    const drawing = { name: 'AR-B816', lines: patterns[0].lines };
    const s = show({ patterns, spec: { ...start, pattern: 'AR-B816', custom: drawing } });
    click(btn('All patterns'));
    expect([...q('[role="listbox"][aria-label="This project"]').querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['MYGRID', 'SOLID', 'AR-B816']);
    click(q('[role="listbox"][aria-label="This project"] [role="option"]'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'MYGRID', scale: 3, angle: 15, custom: patterns[0] });
    expect(q('[role="dialog"]')).toBeNull(); // the list closes on a pick
  });
});

describe('Hatch strip: All patterns box', () => {
  it('opens and closes on the button, Esc and a click elsewhere', () => {
    show();
    expect(q('[role="dialog"]')).toBeNull();
    click(btn('All patterns'));
    expect(q('[role="dialog"]')).not.toBeNull();
    expect(btn('All patterns').getAttribute('aria-expanded')).toBe('true');
    key(q('[role="dialog"] button'), 'Escape');
    expect(q('[role="dialog"]')).toBeNull();
    click(btn('All patterns'));
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(q('[role="dialog"]')).toBeNull();
    click(btn('All patterns'));
    click(btn('All patterns'));
    expect(q('[role="dialog"]')).toBeNull();
  });

  it('Import a pattern file… reads the file chosen and hands its text on', async () => {
    const s = show();
    click(btn('All patterns'));
    const input = q('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('.pat');
    const open = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    click(btn('Import a pattern file…'));
    expect(open).toHaveBeenCalled();
    Object.defineProperty(input, 'files', { value: [new File(['*X\n0,0,0,0,1'], 'office.pat')] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(s.onImport).toHaveBeenCalledWith('*X\n0,0,0,0,1', 'office.pat');
    expect(q('[role="dialog"]')).toBeNull();
  });

  it('Export patterns… asks for the export; the keep tick sets whether imported patterns stay on this computer', () => {
    const s = show();
    click(btn('All patterns'));
    expect(q('[role="dialog"]').textContent).toContain('Also keep imported patterns on this computer for every project');
    const tick = q('input[aria-label="Keep imported patterns on this computer"]') as HTMLInputElement;
    expect(tick.checked).toBe(false);
    click(tick);
    expect(s.onKeep).toHaveBeenLastCalledWith(true);
    click(btn('Export patterns…'));
    expect(s.onExport).toHaveBeenCalled();
    expect(q('[role="dialog"]')).toBeNull();
  });

  it('leaves Import and Export out when the page gives none', () => {
    show({ onImport: undefined, onExport: undefined });
    click(btn('All patterns'));
    expect(q('[role="dialog"]').textContent).not.toMatch(/Import|Export|keep imported/);
  });
});

describe('Hatch strip: properties', () => {
  const type = () => q('select[aria-label="Hatch type"]') as HTMLSelectElement;
  const choose = (v: string) => act(() => { type().value = v; type().dispatchEvent(new Event('change', { bubbles: true })); });
  const angle = () => q('input[aria-label="Hatch angle"]') as HTMLInputElement;
  const scale = () => q('input[aria-label="Hatch scale"]') as HTMLInputElement;

  it('Type: Solid, Pattern and Own; Pattern goes back to the last built-in pattern used (Diagonal at first)', () => {
    const s = show({ spec: { ...start, pattern: 'brick' } });
    expect(type().value).toBe('pattern');
    choose('solid');
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'solid', scale: 3, angle: 15 });
    s.again({ spec: { ...start, pattern: 'solid' } });
    expect(type().value).toBe('solid');
    choose('pattern');
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'brick', scale: 3, angle: 15 });
  });

  it('Type Pattern from a fresh solid is Diagonal; Own is disabled with no own patterns, else picks the first', () => {
    const s = show({ spec: { ...start, pattern: 'solid' } });
    choose('pattern');
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'ansi31', scale: 3, angle: 15 });
    expect((type().querySelector('option[value="own"]') as HTMLOptionElement).disabled).toBe(true);
    s.again({ patterns });
    expect((type().querySelector('option[value="own"]') as HTMLOptionElement).disabled).toBe(false);
    choose('own');
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'MYGRID', scale: 3, angle: 15, custom: patterns[0] });
    s.again({ patterns, spec: { ...start, pattern: 'MYGRID', custom: patterns[0] } });
    expect(type().value).toBe('own');
  });

  it('Angle applies when left (not per key); it is off for a solid fill and for a pattern that looks the same at any angle', () => {
    const s = show();
    expect(angle().value).toBe('15');
    expect(angle().step).toBe('15');
    typeIn(angle(), '30');
    expect(s.onSpec).not.toHaveBeenCalled();
    leave(angle());
    expect(s.onSpec).toHaveBeenLastCalledWith({ ...start, angle: 30 });
    s.again({ spec: { ...start, pattern: 'solid' } });
    expect(angle().disabled).toBe(true);
    expect(angle().title).toMatch(/solid fill/);
    s.again({ spec: { ...start, pattern: 'dots' } });
    expect(angle().disabled).toBe(true);
    expect(angle().title).toMatch(/any angle/);
    s.again({ spec: { ...start, pattern: 'brick' } });
    expect(angle().disabled).toBe(false);
  });

  it('Scale: − halves and + doubles, never below 0.5 mm; the box applies when left; the tooltip says spacing on paper', () => {
    const s = show();
    expect(btn('Double the scale').parentElement!.title).toBe('Spacing on paper, mm');
    click(btn('Double the scale'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ ...start, scale: 6 });
    click(btn('Halve the scale'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ ...start, scale: 1.5 });
    s.again({ spec: { ...start, scale: 0.6 } });
    click(btn('Halve the scale'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ ...start, scale: 0.5 }); // the floor
    s.again({ spec: { ...start, scale: 0.5 } });
    expect((btn('Halve the scale') as HTMLButtonElement).disabled).toBe(true);
    s.again({ spec: start });
    typeIn(scale(), '4');
    expect(s.onSpec).toHaveBeenCalledTimes(3);
    leave(scale());
    expect(s.onSpec).toHaveBeenLastCalledWith({ ...start, scale: 4 });
    typeIn(scale(), '0');
    leave(scale());
    expect(s.onSpec).toHaveBeenLastCalledWith({ ...start, scale: 0.5 }); // a typed zero or less is held at the floor
  });

  it('Scale is off for a solid fill', () => {
    show({ spec: { ...start, pattern: 'solid' } });
    expect([scale().disabled, (btn('Halve the scale') as HTMLButtonElement).disabled, (btn('Double the scale') as HTMLButtonElement).disabled]).toEqual([true, true, true]);
  });
});

describe('Hatch strip: Hatch (new hatches)', () => {
  it('Pick point is the running mode; Select, Set point and Match switch it, and mark it pressed', () => {
    const s = show();
    const pressed = () => ['Pick point', 'Select', 'Set point', 'Match'].map((n) => btn(n).getAttribute('aria-pressed'));
    expect(pressed()).toEqual(['true', 'false', 'false', 'false']);
    click(btn('Select')); click(btn('Set point')); click(btn('Match'));
    expect(s.onPick.mock.calls.map((c) => c[0])).toEqual(['select', 'origin', 'match']);
    s.again({ pick: 'select' });
    expect(pressed()).toEqual(['false', 'true', 'false', 'false']);
    expect(btn('Select').className).toMatch(/\bon\b/);
    s.again({ pick: 'origin' });
    expect(pressed()).toEqual(['false', 'false', 'true', 'false']);
  });

  it('Remove and Outline are off, and say why', () => {
    show();
    for (const n of ['Remove', 'Outline']) {
      expect((btn(n) as HTMLButtonElement).disabled, n).toBe(true);
      expect(btn(n).title, n).toContain('Edit hatch (HE)');
    }
    expect((btn('Remove: more') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Follow boundary and Islands are toggles; Sheet scale is off and says it comes with annotation scale', () => {
    const s = show({ follow: false, findIslands: true });
    expect([btn('Follow boundary').getAttribute('aria-pressed'), btn('Islands').getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    click(btn('Follow boundary')); click(btn('Islands'));
    expect(s.onFollow).toHaveBeenCalledTimes(1);
    expect(s.onFindIslands).toHaveBeenCalledTimes(1);
    expect((btn('Sheet scale') as HTMLButtonElement).disabled).toBe(true);
    expect(btn('Sheet scale').title).toBe('Comes with annotation scale');
  });

  it('the origin list: corner and centre need one hatch being edited; Reset is on only when an origin is set', () => {
    const s = show();
    click(btn('Origin: more'));
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')] as HTMLButtonElement[];
    expect(items.map((i) => i.textContent)).toEqual(['Bottom left of the boundary', 'Centre of the boundary', 'Reset to 0, 0']);
    expect(items.map((i) => i.disabled)).toEqual([true, true, true]);
    expect(items[0].title).toContain('Edit hatch (HE)');
    key(items[0], 'Escape');
    s.again({ spec: { ...start, origin: [1, 2] }, hasOrigin: true });
    click(btn('Origin: more'));
    click(q('[role="menu"] [role="menuitem"]:last-child'));
    expect(s.onOrigin).toHaveBeenLastCalledWith('reset');
    expect(q('[role="menu"]')).toBeNull();
  });

  it('Done leaves the tool', () => {
    const s = show();
    click(btn('Done'));
    expect(s.onDone).toHaveBeenCalledTimes(1);
    expect(btn('Done').className).toMatch(/\bdone\b/);
  });

  it('every control has a tooltip, and all are real buttons, links or fields in visual order', () => {
    show();
    const controls = [...q('[role="toolbar"]').querySelectorAll('button, select, input')] as HTMLElement[];
    for (const c of controls) expect(c.title || c.getAttribute('aria-label'), c.outerHTML).toBeTruthy();
    expect(controls.filter((c) => c.tagName === 'BUTTON').map((c) => c.getAttribute('aria-label') ?? c.textContent).slice(0, 5)).toEqual(['Pick point', 'Select', 'Remove', 'Remove: more', 'Outline']);
    for (const b of document.querySelectorAll('button')) expect(b.type).toBe('button');
  });
});

describe('Hatch strip: Edit hatch', () => {
  const edit = (over: Partial<HatchStripProps> = {}) => show({ mode: 'edit', pick: 'select', edited: 1, islands: 2, ...over });

  it('the toolbar is named Edit hatch; Select (click another hatch) is the running mode and Pick point is off', () => {
    edit();
    expect(q('[role="toolbar"]').getAttribute('aria-label')).toBe('Edit hatch');
    expect(btn('Select').getAttribute('aria-pressed')).toBe('true');
    expect((btn('Pick point') as HTMLButtonElement).disabled).toBe(true);
    expect(btn('Pick point').title).toContain('Hatch (H)');
    expect(btn('Select').title).toContain('another hatch');
  });

  it('Remove keeps an area clear; its list also hatches an island again (off with no islands)', () => {
    const s = edit();
    click(btn('Remove'));
    expect(s.onPick).toHaveBeenLastCalledWith('keep');
    click(btn('Remove: more'));
    const [keep, again] = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')] as HTMLButtonElement[];
    expect([keep.textContent, again.textContent]).toEqual(['Keep an area clear', 'Hatch an island again']);
    click(again);
    expect(s.onPick).toHaveBeenLastCalledWith('again');
    s.again({ islands: 0 });
    click(btn('Remove: more'));
    const off = q('[role="menu"] [role="menuitem"]:last-child') as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    expect(off.title).toBe('This hatch has no islands');
    expect(q('[role="menu"] [role="menuitem"]').getAttribute('aria-label')).toBeNull();
  });

  it('Remove while it runs is shown pressed', () => {
    const s = edit({ pick: 'keep' });
    expect(btn('Remove').getAttribute('aria-pressed')).toBe('true');
    s.again({ pick: 'again' });
    expect(btn('Remove').getAttribute('aria-pressed')).toBe('true');
  });

  it('Remove needs one hatch; with none chosen the strip is off and says to select a hatch', () => {
    edit({ edited: 2 });
    expect(btn('Remove').title).toContain('Select one hatch first');
    expect((btn('Remove') as HTMLButtonElement).disabled).toBe(true);
    edit({ edited: 0, spec: undefined });
    expect(btn('Outline').title).toContain('Select a hatch first');
    expect((btn('Outline') as HTMLButtonElement).disabled).toBe(true);
    expect((btn('Match') as HTMLButtonElement).disabled).toBe(true);
    expect((btn('Set point') as HTMLButtonElement).disabled).toBe(true);
    expect((q('select[aria-label="Hatch type"]') as HTMLSelectElement).disabled).toBe(true);
    expect((option('Diagonal') as HTMLButtonElement).disabled).toBe(true);
    expect(option('Diagonal').title).toBe('Select a hatch first');
  });

  it('Outline asks for the outline; Match and Set point are modes', () => {
    const s = edit();
    click(btn('Outline'));
    expect(s.onOutline).toHaveBeenCalled();
    click(btn('Match')); click(btn('Set point'));
    expect(s.onPick.mock.calls.map((c) => c[0])).toEqual(['match', 'origin']);
  });

  it('the origin list gives the corner and the centre for one hatch, and the tooltip shows its origin in metres', () => {
    const s = edit({ origin: [1.5, 2], hasOrigin: true });
    expect(btn('Set point').title).toContain('1.50, 2.00 m');
    click(btn('Origin: more'));
    const [corner, centre, reset] = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')] as HTMLButtonElement[];
    expect([corner.disabled, centre.disabled, reset.disabled]).toEqual([false, false, false]);
    click(centre);
    expect(s.onOrigin).toHaveBeenLastCalledWith('centre');
    click(btn('Origin: more'));
    click(q('[role="menu"] [role="menuitem"]'));
    expect(s.onOrigin).toHaveBeenLastCalledWith('corner');
    s.again({ edited: 3, origin: undefined });
    click(btn('Origin: more'));
    const several = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')] as HTMLButtonElement[];
    expect([several[0].disabled, several[1].disabled]).toEqual([true, true]);
    expect(several[0].title).toContain('Select one hatch first');
  });

  it('Follow boundary is the hatch\'s own setting, off when it is tied to nothing; Islands is off here', () => {
    const s = edit({ follow: true, canFollow: true });
    expect(btn('Follow boundary').getAttribute('aria-pressed')).toBe('true');
    click(btn('Follow boundary'));
    expect(s.onFollow).toHaveBeenCalledTimes(1);
    expect((btn('Islands') as HTMLButtonElement).disabled).toBe(true);
    s.again({ follow: false, canFollow: false });
    expect((btn('Follow boundary') as HTMLButtonElement).disabled).toBe(true);
    expect(btn('Follow boundary').title).toContain('not tied to any object');
    expect(btn('Follow boundary').getAttribute('aria-pressed')).toBe('false');
  });

  it('says that several hatches change together', () => {
    edit({ edited: 3 });
    expect(document.body.textContent).toContain('3 hatches: pattern, angle and scale change together.');
    edit({ edited: 1 });
    expect(document.body.textContent).not.toContain('change together');
  });

  it('the pattern, angle and scale act on the hatch shown, as in Hatch', () => {
    const s = edit();
    click(option('Cross'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ pattern: 'ansi37', scale: 3, angle: 15 });
    click(btn('Double the scale'));
    expect(s.onSpec).toHaveBeenLastCalledWith({ ...start, scale: 6 });
  });
});

describe('hatch swatch drawing', () => {
  it('lines for a line pattern, dots for Dots, a faint fill for Solid; drawn in the text colour, no fixed colours', () => {
    const swatch = () => host.querySelector('svg')!;
    act(() => root.render(<HatchSwatch spec={start} />));
    expect(swatch().querySelectorAll('path')).toHaveLength(1);
    expect(swatch().querySelector('path')!.getAttribute('d')).toMatch(/^M[\d.-]+ [\d.-]+L/);
    act(() => root.render(<HatchSwatch spec={{ ...start, pattern: 'dots' }} />));
    expect(swatch().querySelector('path')!.getAttribute('d')).toMatch(/h0/);
    act(() => root.render(<HatchSwatch spec={{ ...start, pattern: 'solid' }} className="x" />));
    expect(swatch().getAttribute('class')).toBe('x');
    expect(swatch().querySelector('rect')).not.toBeNull();
    expect(swatch().querySelector('path')).toBeNull();
    expect(swatch().outerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i);
  });
});
