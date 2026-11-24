// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_DEFAULTS } from '../../model/cadDraft';
import { CAD_LAYER_TEMPLATES_KEY, loadLayerTemplates, type CadLayerTemplate } from '../../model/cadLayerTemplates';
import { LAYOUT_TEMPLATES_KEY, loadLayoutTemplates, type LayoutTemplate } from '../../model/layoutTemplates';
import { SETUPS_LIBRARY_KEY, loadSetupLibrary } from '../../model/plotSetup';
import { loadComputerPatterns } from '../../model/cadPatternStore';
import type { CustomPattern } from '../../model/cadHatch';
import { CAD_COMMANDS, commandId } from './cadCommands';
import { keepLibraries, librariesNow, readSettingsFile, settingsFile, settingsSummary, type CadSettingsLibraries, type CadSettingsOptions } from './cadSettingsFile';

const copyId = commandId(CAD_COMMANDS.find((c) => c.aliases.includes('COPY'))!);
const options: CadSettingsOptions = { draft: { ...DRAFT_DEFAULTS, gripPx: 12 }, autosaveMin: 5, theme: 'light', palette: 'blueprint', cadLabels: true, ribbonOrder: ['layers', 'draw'], aliases: { MYCOPY: copyId }, keys: { F4: copyId } };
const layer = (name: string, layerName = 'WALLS'): CadLayerTemplate => ({ id: `lt-${name}`, name, layers: [{ layer: layerName, role: 'wall' }], savedAt: '2026-11-01T00:00:00.000Z' });
const layout = (name: string): LayoutTemplate => ({ id: `lay-${name}`, name, savedAt: '2026-11-01T00:00:00.000Z', paper: [420, 297], size: 'A3', viewports: [{ box: [0, 0, 1, 1] }] });
const pattern = (name: string): CustomPattern => ({ name, lines: [{ angle: 0, base: [0, 0], offset: [0, 1], dashes: [] }] });
const libraries: CadSettingsLibraries = {
  layerTemplates: [layer('Alpha')], layoutTemplates: [layout('Sheet')],
  setups: { kind: 'lvds.pageSetups', setups: [{ id: 'ps1', name: 'A3 plan', size: 'A3', plot: {} }], tables: [] }, patterns: [pattern('DOTS')]
};
const empty: CadSettingsLibraries = { layerTemplates: [], layoutTemplates: [], setups: { kind: 'lvds.pageSetups', setups: [], tables: [] }, patterns: [] };

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('Design CAD settings file', () => {
  it('reads back what settingsFile made, through JSON', () => {
    const f = settingsFile(options, libraries, '2.279', new Date('2026-11-24T10:00:00Z'));
    expect(f).toMatchObject({ kind: 'lvds.cadSettings', version: 1, app: '2.279', saved: '2026-11-24T10:00:00.000Z' });
    expect(readSettingsFile(JSON.parse(JSON.stringify(f)))).toEqual({ options, libraries });
  });

  it('is undefined unless it is a settings file', () => {
    for (const v of [{ kind: 'lvds.pageSetups' }, {}, null, 'text', [], 5, undefined]) expect(readSettingsFile(v)).toBeUndefined();
  });

  it('falls back for values that are out of range or of the wrong type', () => {
    const r = readSettingsFile({ kind: 'lvds.cadSettings', options: { draft: { gripPx: 999 }, autosaveMin: 500, theme: 'pink', palette: 7, cadLabels: 'yes', ribbonOrder: ['a', 3, null, 'b'], aliases: { LINE: copyId, OK1: copyId, nope: copyId }, keys: { F1: copyId, F4: copyId, Q: copyId } } })!;
    expect(r.options.draft.gripPx).toBe(DRAFT_DEFAULTS.gripPx);
    expect(r.options).toMatchObject({ autosaveMin: 2, theme: 'dark', palette: 'graphite', cadLabels: false, ribbonOrder: ['a', 'b'], aliases: { OK1: copyId }, keys: { F4: copyId } });
    expect(readSettingsFile({ kind: 'lvds.cadSettings', options: { autosaveMin: 'x', ribbonOrder: 'layers' } })!.options).toMatchObject({ autosaveMin: 2, ribbonOrder: [] });
  });

  it('gives four empty parts when libraries are missing or wrong, and leaves out bad entries', () => {
    expect(readSettingsFile({ kind: 'lvds.cadSettings' })!.libraries).toEqual(empty);
    expect(readSettingsFile({ kind: 'lvds.cadSettings', libraries: 'x' })!.libraries).toEqual(empty);
    const r = readSettingsFile({ kind: 'lvds.cadSettings', libraries: { layerTemplates: [layer('Good'), { id: 1 }], layoutTemplates: [layout('Good'), { name: 'No paper' }], setups: { nothing: true }, patterns: [pattern('OK'), { name: 'bad name!', lines: [] }, 5] } })!;
    expect(r.libraries.layerTemplates.map((t) => t.name)).toEqual(['Good']);
    expect(r.libraries.layoutTemplates.map((t) => t.name)).toEqual(['Good']);
    expect(r.libraries.setups).toEqual(empty.setups);
    expect(r.libraries.patterns.map((p) => p.name)).toEqual(['OK']);
  });

  it('reads what this computer keeps now', () => {
    expect(librariesNow()).toEqual(empty);
    keepLibraries(libraries);
    expect(librariesNow()).toEqual({ ...libraries, setups: expect.objectContaining({ setups: [expect.objectContaining({ name: 'A3 plan' })] }) });
  });

  it('keeps libraries: the same name is replaced, the others stay', () => {
    localStorage.setItem(CAD_LAYER_TEMPLATES_KEY, JSON.stringify([layer('Alpha', 'OLD'), layer('Beta')]));
    localStorage.setItem(LAYOUT_TEMPLATES_KEY, JSON.stringify([layout('Sheet'), layout('Other')]));
    keepLibraries({ ...libraries, layerTemplates: [{ ...layer('ALPHA', 'NEW'), id: 'from-file' }] });
    const lt = loadLayerTemplates();
    expect(lt.map((t) => [t.name, t.layers[0].layer])).toEqual([['ALPHA', 'NEW'], ['Beta', 'WALLS']]);
    expect(lt[0].id).toBe('lt-Alpha');
    expect(loadLayoutTemplates().map((t) => t.name)).toEqual(['Other', 'Sheet']);
    expect(loadSetupLibrary().setups.map((s) => s.name)).toEqual(['A3 plan']);
    expect(loadComputerPatterns().map((p) => p.name)).toEqual(['DOTS']);
  });

  it('writes nothing for empty parts', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    keepLibraries(empty);
    expect(set).not.toHaveBeenCalled();
    keepLibraries({ ...empty, patterns: [pattern('ONE')] });
    expect(set.mock.calls.map((c) => c[0])).not.toContain(CAD_LAYER_TEMPLATES_KEY);
    expect(set.mock.calls.map((c) => c[0])).not.toContain(LAYOUT_TEMPLATES_KEY);
    expect(set.mock.calls.map((c) => c[0])).not.toContain(SETUPS_LIBRARY_KEY);
    expect(set).toHaveBeenCalled();
  });

  it('sums up what a file holds', () => {
    const many: CadSettingsLibraries = {
      layerTemplates: [layer('a'), layer('b'), layer('c'), layer('d')], layoutTemplates: [layout('a'), layout('b')],
      setups: { kind: 'lvds.pageSetups', setups: [1, 2, 3, 4, 5].map((i) => ({ id: `ps${i}`, name: `S${i}`, size: 'A3' as const, plot: {} })), tables: [] }, patterns: Array.from({ length: 12 }, (_, i) => pattern(`P${i}`))
    };
    expect(settingsSummary({ options: { ...options, aliases: { A: 'x', B: 'x', C: 'x' } }, libraries: many })).toBe('options, 3 typed names, 1 key, 4 layer templates, 2 layout templates, 5 page setups, 12 hatch patterns');
    expect(settingsSummary({ options, libraries })).toBe('options, 1 typed name, 1 key, 1 layer template, 1 layout template, 1 page setup, 1 hatch pattern');
    expect(settingsSummary({ options: { ...options, aliases: {}, keys: {} }, libraries: empty })).toBe('options');
  });
});
