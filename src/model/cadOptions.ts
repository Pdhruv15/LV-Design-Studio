import { DRAFT_DEFAULTS, OSNAP_BITS, OSNAP_DEFAULT, OSNAP_MODES, type DraftSettings, type OsnapMode } from './cadDraft';
import type { PalettePref, ThemePref } from '../theme/theme';

/** Design CAD's Options window (OP): every setting on eight pages, which of them are not at their default, and the
 * words to find one by. Pure: the window and its tests read it. */

export type OptPage = 'general' | 'files' | 'display' | 'drafting' | 'selection' | 'plot' | 'shortcuts' | 'drawing';
export type DraftTab = 'snap' | 'polar' | 'osnap' | 'dyn';
/** Where Options opens: a page, a tab of the Drafting page, or the page last used. */
export type OptAt = OptPage | DraftTab | 'last';

export const OPT_PAGES: { k: OptPage; label: string }[] = [
  { k: 'general', label: 'General' }, { k: 'files', label: 'Files & saving' }, { k: 'display', label: 'Display' }, { k: 'drafting', label: 'Drafting' },
  { k: 'selection', label: 'Selection' }, { k: 'plot', label: 'Plot & publish' }, { k: 'shortcuts', label: 'Shortcuts & aliases' }, { k: 'drawing', label: 'This drawing' }
];
export const DRAFT_TABS: { k: DraftTab; label: string }[] = [
  { k: 'snap', label: 'Snap & grid' }, { k: 'polar', label: 'Polar tracking' }, { k: 'osnap', label: 'Object snap' }, { k: 'dyn', label: 'Dynamic input' }
];

/** The settings with a default, as Options holds them while it is open. */
export interface OptValues {
  draft: DraftSettings;
  /** Minutes between recovery copies (Preferences); 0 = off. */
  autosaveMin: number;
  theme: ThemePref;
  palette: PalettePref;
  /** The name of every ribbon tool shown. */
  cadLabels: boolean;
  /** The ribbon panels are in an order of the user's own. */
  ribbonOrder: boolean;
  /** The printer plots go to; '' = the built-in PDF. */
  printer: string;
  /** The user's own typed names (name → the id of its command) and keys (chord → the id), kept in Preferences. */
  aliases: Readonly<Record<string, string>>;
  keys: Readonly<Record<string, string>>;
}
export const OPT_DEFAULTS: OptValues = { draft: DRAFT_DEFAULTS, autosaveMin: 2, theme: 'dark', palette: 'graphite', cadLabels: false, ribbonOrder: false, printer: '', aliases: {}, keys: {} };

export interface OptSetting {
  id: string;
  page: OptPage;
  tab?: DraftTab;
  /** The row's label, as shown. */
  label: string;
  /** More words to find it by: its section, what it does, the typed command or key. */
  words?: string;
  /** The default in words, for the reset tip ("12 px"). Absent: a switch, a folder or a value of the drawing, which has no default and is never marked. */
  def?: string;
  changed?: (v: OptValues) => boolean;
  reset?: (v: OptValues) => OptValues;
}

const same = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? a.join(',') === b.join(',') : a === b);
/** A setting of the drafting settings: changed when it differs from DRAFT_DEFAULTS, reset puts that key back. */
const dk = (k: Exclude<keyof DraftSettings, 'osnap'>): Pick<OptSetting, 'changed' | 'reset'> => ({
  changed: (v) => !same(v.draft[k], DRAFT_DEFAULTS[k]),
  reset: (v) => ({ ...v, draft: { ...v.draft, [k]: DRAFT_DEFAULTS[k] } })
});
/** A setting held at the top of OptValues. */
const tk = (k: 'autosaveMin' | 'theme' | 'palette' | 'cadLabels' | 'ribbonOrder' | 'printer'): Pick<OptSetting, 'changed' | 'reset'> => ({
  changed: (v) => !same(v[k], OPT_DEFAULTS[k]),
  reset: (v) => ({ ...v, [k]: OPT_DEFAULTS[k] })
});
/** One snap mode: changed when its bit differs from the default modes. */
const mk = (m: OsnapMode): Pick<OptSetting, 'changed' | 'reset'> => {
  const bit = OSNAP_BITS[m];
  return {
    changed: (v) => (v.draft.osnap & bit) !== (OSNAP_DEFAULT & bit),
    reset: (v) => ({ ...v, draft: { ...v.draft, osnap: (v.draft.osnap & ~bit) | (OSNAP_DEFAULT & bit) } })
  };
};

const sn = (id: string, label: string, words: string, def?: string, k?: Exclude<keyof DraftSettings, 'osnap'>): OptSetting => ({ id, page: 'drafting', tab: 'snap', label, words, ...(def !== undefined && k ? { def, ...dk(k) } : {}) });
const po = (id: string, label: string, words: string, def?: string, k?: Exclude<keyof DraftSettings, 'osnap'>): OptSetting => ({ id, page: 'drafting', tab: 'polar', label, words, ...(def !== undefined && k ? { def, ...dk(k) } : {}) });
const dy = (id: string, label: string, words: string, def?: string, k?: Exclude<keyof DraftSettings, 'osnap'>): OptSetting => ({ id, page: 'drafting', tab: 'dyn', label, words, ...(def !== undefined && k ? { def, ...dk(k) } : {}) });
const se = (id: Exclude<keyof DraftSettings, 'osnap'>, label: string, words: string, def: string): OptSetting => ({ id, page: 'selection', label, words, def, ...dk(id) });
const di = (id: Exclude<keyof DraftSettings, 'osnap'>, label: string, words: string, def: string): OptSetting => ({ id, page: 'display', label, words, def, ...dk(id) });
const fi = (id: string, label: string, words: string, def?: string, k?: Exclude<keyof DraftSettings, 'osnap'>): OptSetting => ({ id, page: 'files', label, words, ...(def !== undefined && k ? { def, ...dk(k) } : {}) });

/** One entry per row, in the order the rows show (also the order of find results). */
export const OPT_SETTINGS: OptSetting[] = [
  { id: 'cadLabels', page: 'general', label: 'Show the name of every tool, the small ones too', words: 'ribbon tool names labels sub-tabs', def: 'off', ...tk('cadLabels') },
  { id: 'ribbonOrder', page: 'general', label: 'Panel order', words: 'ribbon panels order reset', def: 'Standard', ...tk('ribbonOrder') },
  { id: 'settingsFile', page: 'general', label: 'Your settings file', words: 'export import backup another computer libraries reset all' },
  fi('folderProjects', 'Projects', 'folder projects files'),
  fi('folderDatabase', 'LV Database', 'folder database workbooks'),
  fi('folderBlocks', 'Block library', 'folder blocks library dwg dxf'),
  fi('folderRecovery', 'Recovery copies', 'folder recovery unsaved'),
  fi('saveFormat', 'Save As format', 'saving dwg dxf format', 'DWG', 'saveFormat'),
  fi('keepBak', 'Keep the previous copy as .bak on Save', 'saving backup bak', 'on', 'keepBak'),
  { id: 'autosaveMin', page: 'files', label: 'Recovery copy every', words: 'saving recovery autosave minutes', def: '2 min', ...tk('autosaveMin') },
  { id: 'theme', page: 'display', label: 'Colour theme', words: 'dark light screen colours', def: 'Dark', ...tk('theme') },
  { id: 'palette', page: 'display', label: 'Colour palette', words: 'graphite blueprint screen colours', def: 'Graphite', ...tk('palette') },
  di('crossPct', 'Crosshair size', 'cursor crosshair', '100 %'),
  di('crossColor', 'Crosshair colour', 'cursor crosshair', 'Drawing ink'),
  di('cursorOutline', 'Outline the cursor', 'cursor crosshair pick box', 'on'),
  { id: 'lwt', page: 'display', label: 'Show lineweights (LWT)', words: 'line widths lwt' },
  sn('snapOn', 'Snap on', 'snap f9'),
  sn('snapX', 'X spacing', 'snap spacing f9', '0 mm', 'snapX'),
  sn('snapY', 'Y spacing (0 = as X)', 'snap spacing f9', '0 mm', 'snapY'),
  sn('gridOn', 'Grid on', 'grid f7'),
  sn('gridStyle', 'Style', 'grid lines dots f7'),
  sn('gridMm', 'Spacing (0 = adapt to zoom)', 'grid spacing f7', '0 mm', 'gridMm'),
  sn('gridMajor', 'Major line every', 'grid major line', '5', 'gridMajor'),
  po('polarOn', 'Polar tracking on', 'polar f10'),
  po('polarInc', 'Increment angle', 'polar angle f10', '45°', 'polarInc'),
  po('polarExtra', 'Extra angles', 'polar angle', 'none', 'polarExtra'),
  po('otrackOn', 'Object snap tracking on', 'otrack f11 tracking'),
  po('trackAllPolar', 'Track along', 'otrack tracking f11', 'Straight only', 'trackAllPolar'),
  { id: 'osnapOn', page: 'drafting', tab: 'osnap', label: 'Object snap on (F3)', words: 'osnap f3' },
  ...OSNAP_MODES.map((m): OptSetting => ({ id: `osnap.${m.k}`, page: 'drafting', tab: 'osnap', label: m.label, words: 'object snap mode osnap', def: (OSNAP_DEFAULT & OSNAP_BITS[m.k]) !== 0 ? 'on' : 'off', ...mk(m.k) })),
  { id: 'aperturePx', page: 'drafting', tab: 'osnap', label: 'Snap aperture', words: 'object snap aperture', def: '10 px', ...dk('aperturePx') },
  { id: 'markerPx', page: 'drafting', tab: 'osnap', label: 'Snap marker size', words: 'object snap marker', def: '7 px', ...dk('markerPx') },
  { id: 'snapTip', page: 'drafting', tab: 'osnap', label: 'Snap name beside the marker', words: 'object snap marker name', def: 'on', ...dk('snapTip') },
  dy('dynOn', 'Dynamic input on (F12)', 'dyn f12'),
  dy('dynBoxes', 'Length and angle boxes', 'dynamic input', 'on', 'dynBoxes'),
  dy('dynPrompt', 'The prompt at the cursor', 'dynamic input', 'on', 'dynPrompt'),
  dy('dynOptions', 'The options list', 'dynamic input', 'on', 'dynOptions'),
  dy('attDialog', 'Attribute prompts in a dialog', 'block attributes', 'off', 'attDialog'),
  se('pickBoxPx', 'Pick box size', 'picking cursor', '12 px'),
  se('hoverMark', 'Highlight what is under the pick box', 'picking hover', 'on'),
  se('hoverTag', 'Name tag after a pause', 'picking hover', 'off'),
  se('windowFill', 'Shade the selection window', 'window crossing', 'on'),
  se('pickLook', 'Picked objects look', 'selected', 'Dashed + halo'),
  se('selColor', 'Selection colour', 'selected grips colour', 'Blue'),
  se('grips', 'Grips on what is picked', 'grips', 'on'),
  se('gripPx', 'Grip size', 'grips', '8 px'),
  se('gripMax', 'Grips on up to', 'grips', '100 objects'),
  { id: 'printer', page: 'plot', label: 'Plot to', words: 'printer plot print', def: 'PDF', ...tk('printer') },
  { id: 'pageSetups', page: 'plot', label: 'Page setups', words: 'page setup paper plot' },
  { id: 'penTables', page: 'plot', label: 'Pen tables', words: 'pens lineweights ctb stb plot' },
  { id: 'ownAliases', page: 'shortcuts', label: 'Typed names of your own', words: 'alias aliases shortcut command typed name', def: 'none', changed: (v) => Object.keys(v.aliases).length > 0, reset: (v) => ({ ...v, aliases: {} }) },
  { id: 'ownKeys', page: 'shortcuts', label: 'Keys of your own', words: 'keyboard shortcut key f-key function', def: 'none', changed: (v) => Object.keys(v.keys).length > 0, reset: (v) => ({ ...v, keys: {} }) },
  { id: 'level', page: 'drawing', label: 'Level', words: 'level plan drawing' },
  { id: 'units', page: 'drawing', label: 'Units', words: 'units mm drawing un' }
];

/** Where Options shows: `placeKey` written as `page` or `drafting/<tab>`. */
export function placeOf(at: OptAt, last?: string | null): { page: OptPage; tab: DraftTab } {
  const page = (s: string) => OPT_PAGES.find((p) => p.k === s)?.k;
  const tab = (s: string | undefined) => DRAFT_TABS.find((t) => t.k === s)?.k ?? 'snap';
  if (at === 'last') {
    const [a, b] = (last ?? '').split('/');
    const p = page(a);
    return p ? { page: p, tab: p === 'drafting' ? tab(b) : 'snap' } : { page: 'general', tab: 'snap' };
  }
  const t = DRAFT_TABS.find((x) => x.k === at);
  if (t) return { page: 'drafting', tab: t.k };
  return { page: page(at) ?? 'general', tab: 'snap' };
}
/** The string `placeOf` reads back. */
export const placeKey = (page: OptPage, tab: DraftTab): string => (page === 'drafting' ? `drafting/${tab}` : page);
/** A setting's place as shown: `Display`, or `Drafting › Object snap`. */
export function placeLabel(s: OptSetting): string {
  const p = OPT_PAGES.find((x) => x.k === s.page)?.label ?? s.page;
  const t = s.tab ? DRAFT_TABS.find((x) => x.k === s.tab)?.label : undefined;
  return t ? `${p} › ${t}` : p;
}
/** The settings that match every word of the query in their label, words, page or tab name; none for an empty query. */
export function findSettings(q: string): OptSetting[] {
  const ws = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!ws.length) return [];
  return OPT_SETTINGS.filter((s) => {
    const hay = `${s.label} ${s.words ?? ''} ${OPT_PAGES.find((p) => p.k === s.page)?.label ?? ''} ${DRAFT_TABS.find((t) => t.k === s.tab)?.label ?? ''}`.toLowerCase();
    return ws.every((w) => hay.includes(w));
  });
}
/** The settings not at their default; with a page, only that page; with a tab too (Drafting), only that tab. */
export const changedSettings = (v: OptValues, page?: OptPage, tab?: DraftTab): OptSetting[] =>
  OPT_SETTINGS.filter((s) => (!page || s.page === page) && (!tab || s.tab === tab) && s.changed?.(v));
/** The values with each of the settings put back to its default. */
export const resetSettings = (v: OptValues, list: OptSetting[]): OptValues => list.reduce((a, s) => (s.reset ? s.reset(a) : a), v);
