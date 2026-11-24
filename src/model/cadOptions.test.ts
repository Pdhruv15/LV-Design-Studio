import { describe, expect, it } from 'vitest';
import { DRAFT_DEFAULTS, OSNAP_BITS, OSNAP_MODES } from './cadDraft';
import { changedSettings, findSettings, OPT_DEFAULTS, OPT_PAGES, OPT_SETTINGS, placeKey, placeLabel, placeOf, resetSettings, type OptValues } from './cadOptions';

const withDraft = (p: Partial<typeof DRAFT_DEFAULTS>): OptValues => ({ ...OPT_DEFAULTS, draft: { ...DRAFT_DEFAULTS, ...p } });
const ids = (l: { id: string }[]) => l.map((s) => s.id);

describe('Options settings list', () => {
  it('holds every drafting setting, so a new one cannot be left out', () => {
    const have = new Set(ids(OPT_SETTINGS));
    for (const k of Object.keys(DRAFT_DEFAULTS).filter((x) => x !== 'osnap')) expect(have.has(k), k).toBe(true);
    for (const m of OSNAP_MODES) expect(have.has(`osnap.${m.k}`), m.k).toBe(true);
    expect(OSNAP_MODES).toHaveLength(9);
  });
  it('has unique ids, and a reset for every setting that has a default', () => {
    expect(new Set(ids(OPT_SETTINGS)).size).toBe(OPT_SETTINGS.length);
    for (const s of OPT_SETTINGS) expect(!!s.def, s.id).toBe(!!s.changed && !!s.reset);
  });
  it('marks nothing at the defaults', () => { expect(changedSettings(OPT_DEFAULTS)).toEqual([]); });
  it('counts a changed value on its page and tab only, and puts it back', () => {
    const v = withDraft({ gripPx: 12, markerPx: 9 });
    expect(ids(changedSettings(v))).toEqual(['markerPx', 'gripPx']);
    expect(ids(changedSettings(v, 'selection'))).toEqual(['gripPx']);
    expect(ids(changedSettings(v, 'drafting', 'osnap'))).toEqual(['markerPx']);
    expect(changedSettings(v, 'drafting', 'snap')).toEqual([]);
    expect(changedSettings(v, 'display')).toEqual([]);
    expect(resetSettings(v, changedSettings(v, 'selection')).draft.gripPx).toBe(DRAFT_DEFAULTS.gripPx);
    expect(changedSettings(resetSettings(v, changedSettings(v)))).toEqual([]);
  });
  it('counts a snap mode turned on and one turned off, and resets each', () => {
    const v = withDraft({ osnap: (DRAFT_DEFAULTS.osnap | OSNAP_BITS.nearest) & ~OSNAP_BITS.endpoint });
    expect(ids(changedSettings(v))).toEqual(['osnap.endpoint', 'osnap.nearest']);
    const a = resetSettings(v, changedSettings(v).filter((s) => s.id === 'osnap.nearest'));
    expect(ids(changedSettings(a))).toEqual(['osnap.endpoint']);
    expect(resetSettings(a, changedSettings(a)).draft.osnap).toBe(DRAFT_DEFAULTS.osnap);
  });
  it('counts extra polar angles and resets them to none', () => {
    const v = withDraft({ polarExtra: [60] });
    expect(ids(changedSettings(v))).toEqual(['polarExtra']);
    expect(resetSettings(v, changedSettings(v)).draft.polarExtra).toEqual([]);
    expect(changedSettings(withDraft({ polarExtra: [] }))).toEqual([]);
  });
  it('counts the app settings', () => {
    const v: OptValues = { ...OPT_DEFAULTS, theme: 'light', palette: 'blueprint', cadLabels: true, ribbonOrder: true, autosaveMin: 5, printer: 'Office' };
    expect(ids(changedSettings(v)).sort()).toEqual(['autosaveMin', 'cadLabels', 'palette', 'printer', 'ribbonOrder', 'theme']);
    expect(changedSettings(resetSettings(v, changedSettings(v)))).toEqual([]);
  });
  it('counts the names and keys of the user\'s own on the Shortcuts & aliases page, and resets them', () => {
    const v: OptValues = { ...OPT_DEFAULTS, aliases: { CX: 'CO' }, keys: { F4: 'L' } };
    expect(ids(changedSettings(v))).toEqual(['ownAliases', 'ownKeys']);
    expect(ids(changedSettings(v, 'shortcuts'))).toEqual(['ownAliases', 'ownKeys']);
    expect(ids(changedSettings({ ...OPT_DEFAULTS, keys: { F4: 'L' } }))).toEqual(['ownKeys']);
    expect(resetSettings(v, changedSettings(v))).toEqual(OPT_DEFAULTS);
  });
  it('lists the Shortcuts & aliases page after Plot & publish and before This drawing', () => {
    const k = OPT_PAGES.map((p) => p.k);
    expect(k.indexOf('shortcuts')).toBe(k.indexOf('plot') + 1);
    expect(k.indexOf('drawing')).toBe(k.indexOf('shortcuts') + 1);
    expect(ids(findSettings('shortcut'))).toEqual(['ownAliases', 'ownKeys']);
  });
});

describe('find a setting', () => {
  it('is empty for no text', () => { expect(findSettings('')).toEqual([]); expect(findSettings('   ')).toEqual([]); });
  it('finds every label with the word, in the order the rows show', () => {
    const r = findSettings('size');
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) expect(`${s.label} ${s.words}`.toLowerCase()).toContain('size');
    expect(ids(r)).toEqual(['crossPct', 'markerPx', 'pickBoxPx', 'gripPx']);
    expect(ids(r)).toEqual(ids(OPT_SETTINGS.filter((s) => s.label.toLowerCase().includes('size'))));
  });
  it('needs every word of a query', () => {
    expect(ids(findSettings('grid major'))).toEqual(['gridMajor']);
    expect(ids(findSettings('polar angle'))).toEqual(['polarInc', 'polarExtra']);
    expect(findSettings('grid zebra')).toEqual([]);
  });
  it('finds by the name of the page', () => {
    const r = findSettings('selection');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((s) => s.page === 'selection')).toBe(true);
    expect(ids(r)).toEqual(ids(OPT_SETTINGS.filter((s) => s.page === 'selection')));
  });
  it('is not case-sensitive', () => { expect(ids(findSettings('  GRIP SIZE '))).toEqual(['gripPx']); });
});

describe('where Options opens', () => {
  it('opens a page, or a tab of the Drafting page', () => {
    expect(placeOf('selection')).toEqual({ page: 'selection', tab: 'snap' });
    expect(placeOf('osnap')).toEqual({ page: 'drafting', tab: 'osnap' });
    expect(placeOf('dyn')).toEqual({ page: 'drafting', tab: 'dyn' });
  });
  it('reads the page last used, and falls back to General', () => {
    expect(placeOf('last', 'drafting/polar')).toEqual({ page: 'drafting', tab: 'polar' });
    expect(placeOf('last', 'display')).toEqual({ page: 'display', tab: 'snap' });
    expect(placeOf('last', 'nonsense')).toEqual({ page: 'general', tab: 'snap' });
    expect(placeOf('last', null)).toEqual({ page: 'general', tab: 'snap' });
    expect(placeOf('last')).toEqual({ page: 'general', tab: 'snap' });
  });
  it('writes the place so that it reads back', () => {
    expect(placeOf('last', placeKey('drafting', 'dyn'))).toEqual({ page: 'drafting', tab: 'dyn' });
    expect(placeOf('last', placeKey('plot', 'snap'))).toEqual({ page: 'plot', tab: 'snap' });
  });
  it('names a place', () => {
    expect(placeLabel(OPT_SETTINGS.find((s) => s.id === 'lwt')!)).toBe('Display');
    expect(placeLabel(OPT_SETTINGS.find((s) => s.id === 'markerPx')!)).toBe('Drafting › Object snap');
  });
});
