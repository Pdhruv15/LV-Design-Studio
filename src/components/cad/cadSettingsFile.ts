import { draftSettings, type DraftSettings } from '../../model/cadDraft';
import { loadLayerTemplates, parseLayerTemplates, saveLayerTemplates, type CadLayerTemplate } from '../../model/cadLayerTemplates';
import { loadLayoutTemplates, parseLayoutTemplate, saveLayoutTemplates, withLayoutTemplate, type LayoutTemplate } from '../../model/layoutTemplates';
import { loadSetupLibrary, readSetups, saveToSetupLibrary, type SetupsFile } from '../../model/plotSetup';
import { keepComputerPatterns, loadComputerPatterns } from '../../model/cadPatternStore';
import { validCustom, type CustomPattern } from '../../model/cadHatch';
import { PALETTE_LABEL, THEME_LABEL, type PalettePref, type ThemePref } from '../../theme/theme';
import { ownAliases, ownKeys, type OwnKeys } from './cadShortcuts';
import type { OwnAliases } from './cadCommands';

/** The Design CAD options a settings file carries. */
export interface CadSettingsOptions { draft: DraftSettings; autosaveMin: number; theme: ThemePref; palette: PalettePref; cadLabels: boolean; ribbonOrder: string[]; aliases: OwnAliases; keys: OwnKeys }
/** The libraries kept on this computer that a settings file carries. */
export interface CadSettingsLibraries { layerTemplates: CadLayerTemplate[]; layoutTemplates: LayoutTemplate[]; setups: SetupsFile; patterns: CustomPattern[] }
export interface CadSettingsFile { kind: 'lvds.cadSettings'; version: 1; app: string; saved: string; options: CadSettingsOptions; libraries: CadSettingsLibraries }

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const noSetups = (): SetupsFile => ({ kind: 'lvds.pageSetups', setups: [], tables: [] });

/** The settings file for these options and libraries, made by the app of this version at this time. */
export function settingsFile(options: CadSettingsOptions, libraries: CadSettingsLibraries, app: string, now = new Date()): CadSettingsFile {
  return { kind: 'lvds.cadSettings', version: 1, app, saved: now.toISOString(), options, libraries };
}

/** What a settings file holds, every value checked as it is read; undefined when it is not a settings file. A missing or wrong part is an empty list. */
export function readSettingsFile(v: unknown): { options: CadSettingsOptions; libraries: CadSettingsLibraries } | undefined {
  if (!isObject(v) || v.kind !== 'lvds.cadSettings') return undefined;
  const o = isObject(v.options) ? v.options : {}, l = isObject(v.libraries) ? v.libraries : {};
  const options: CadSettingsOptions = {
    draft: draftSettings(o.draft),
    autosaveMin: typeof o.autosaveMin === 'number' && o.autosaveMin >= 0 && o.autosaveMin <= 60 ? o.autosaveMin : 2,
    theme: typeof o.theme === 'string' && Object.prototype.hasOwnProperty.call(THEME_LABEL, o.theme) ? (o.theme as ThemePref) : 'dark',
    palette: typeof o.palette === 'string' && Object.prototype.hasOwnProperty.call(PALETTE_LABEL, o.palette) ? (o.palette as PalettePref) : 'graphite',
    cadLabels: o.cadLabels === true,
    ribbonOrder: Array.isArray(o.ribbonOrder) ? o.ribbonOrder.filter((x): x is string => typeof x === 'string').slice(0, 100) : [],
    aliases: ownAliases(o.aliases),
    keys: ownKeys(o.keys)
  };
  const libraries: CadSettingsLibraries = {
    layerTemplates: parseLayerTemplates(l.layerTemplates),
    layoutTemplates: Array.isArray(l.layoutTemplates) ? l.layoutTemplates.map(parseLayoutTemplate).filter((t): t is LayoutTemplate => !!t) : [],
    setups: readSetups(l.setups) ?? noSetups(),
    patterns: Array.isArray(l.patterns) ? l.patterns.filter((c): c is CustomPattern => validCustom(c as CustomPattern | undefined)).slice(0, 500) : []
  };
  return { options, libraries };
}

/** What this computer keeps now: its four libraries. */
export function librariesNow(): CadSettingsLibraries {
  return { layerTemplates: loadLayerTemplates(), layoutTemplates: loadLayoutTemplates(), setups: loadSetupLibrary(), patterns: loadComputerPatterns() };
}

/** Adds the libraries to this computer's: an entry of the same name is replaced, nothing else is removed; an empty part writes nothing. */
export function keepLibraries(l: CadSettingsLibraries): void {
  if (l.layerTemplates.length) {
    let list = loadLayerTemplates();
    for (const t of l.layerTemplates) {
      const old = list.find((x) => x.name.trim().toLowerCase() === t.name.trim().toLowerCase());
      list = [...list.filter((x) => x !== old), { ...t, name: t.name.trim(), id: old?.id ?? t.id }];
    }
    saveLayerTemplates(list.sort((a, b) => a.name.localeCompare(b.name)));
  }
  if (l.layoutTemplates.length) saveLayoutTemplates(l.layoutTemplates.reduce((list, t) => withLayoutTemplate(list, t), loadLayoutTemplates()));
  if (l.setups.setups.length || l.setups.tables.length) saveToSetupLibrary(l.setups);
  if (l.patterns.length) keepComputerPatterns(l.patterns);
}

/** The parts of a read file in words: "options, 3 typed names, 1 key, 4 layer templates". */
export function settingsSummary(r: { options: CadSettingsOptions; libraries: CadSettingsLibraries }): string {
  const n = (count: number, one: string, many = `${one}s`) => (count ? [`${count} ${count === 1 ? one : many}`] : []);
  const { options: o, libraries: l } = r;
  return ['options', ...n(Object.keys(o.aliases).length, 'typed name'), ...n(Object.keys(o.keys).length, 'key'), ...n(l.layerTemplates.length, 'layer template'), ...n(l.layoutTemplates.length, 'layout template'),
    ...n(l.setups.setups.length, 'page setup'), ...n(l.patterns.length, 'hatch pattern')].join(', ');
}
