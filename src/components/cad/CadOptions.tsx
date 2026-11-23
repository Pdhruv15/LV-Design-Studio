import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { FolderOpen, RotateCcw, Search, TriangleAlert, X } from 'lucide-react';
import { CadDialog } from './CadDialogs';
import { DisplayPreview, SelectionPreview } from './CadOptionsPreview';
import type { CadToggles } from './CadCanvas';
import { isNumber } from './cadPrompt';
import { CAD_COMMANDS, aliasesOf, commandFullName, commandId, type CadCommand, type OwnAliases } from './cadCommands';
import { aliasProblem, chordLabel, chordOf, commandRows, keyProblem, keysOf, type OwnKeys } from './cadShortcuts';
import { CROSS_COLORS, OSNAP_BITS, OSNAP_MODES, parseAngles, PICK_LOOKS, POLAR_INCREMENTS, SEL_COLORS, type CrossColor, type DraftSettings, type OsnapMode, type PickLook, type SelColor } from '../../model/cadDraft';
import { changedSettings, DRAFT_TABS, findSettings, OPT_PAGES, OPT_SETTINGS, placeKey, placeLabel, placeOf, resetSettings, type OptAt, type OptPage, type OptSetting, type OptValues } from '../../model/cadOptions';
import { PALETTE_LABEL, THEME_LABEL, type PalettePref, type ThemePref } from '../../theme/theme';
import { plotPrinter, usePrinters } from '../../util/printers';
import { DATABASE_FOLDER } from '../../database/database';

type MenuItem = { label: string; title: string; onClick: () => void };
type App = { theme: ThemePref; palette: PalettePref; cadLabels: boolean; ribbonOrder: boolean };

const PLACE_KEY = 'lvds.cad.optPage';
/** The find box's key, as the app names the modifier elsewhere. */
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const FIND_KEY = MAC ? '⌘F' : 'Ctrl F';
const BY_ID = new Map(OPT_SETTINGS.map((s) => [s.id, s]));
const HELP: Record<Exclude<OptPage, 'drafting'> | 'drafting/snap' | 'drafting/polar' | 'drafting/osnap' | 'drafting/dyn' | 'found', string> = {
  general: "The ribbon's tool names and the order of its panels, as in Profile & preferences.",
  files: 'The folders the app uses, and how a drawing is saved. Kept for you on this computer, for every drawing.',
  display: 'The crosshair and its colour, the outline that keeps the cursor visible over any line, and line widths on screen. Colour theme and palette are the app\'s own. The preview shows the result before OK.',
  'drafting/snap': 'Snap (F9) steps the cursor by the spacing; 0 follows the grid on screen. Grid (F7): 0 adapts to the zoom.',
  'drafting/polar': 'Polar tracking (F10) holds the next point on the angles from the last one. ORTHO (F8) and polar turn each other off. Object snap tracking (F11): rest the cursor on a snap point to acquire it (again to let it go), then follow its alignment lines.',
  'drafting/osnap': 'The snap points the cursor finds (F3 turns them all on or off), the snap aperture (how near a snap point must be) and the marker. Perpendicular is from the last point picked. Shift-click and a window select, as before.',
  'drafting/dyn': 'Dynamic input (F12): the boxes, the short prompt and its options at the cursor.',
  selection: 'Left to right: only what is fully inside. Right to left: what the window crosses. Shift-click adds or removes. A click picks what is inside the pick box. The preview shows the result before OK.',
  plot: 'The printer plots go to on this computer. Page setups and pen tables belong to the project.',
  shortcuts: 'Typed names and keys of your own for any command. The standard ones stay; one already in use is refused and its command is named. Kept on this computer.',
  drawing: 'Level and units belong to this drawing; each change is one undo step on OK.',
  found: 'An amber dot marks a setting that is not at its default; the arrow beside it puts it back.'
};
/** The 12 x 12 marker of each snap mode. */
const MODE_MARK: Record<OsnapMode, ReactNode> = {
  endpoint: <rect x="2" y="2" width="8" height="8" />,
  midpoint: <path d="M6 2L10.5 10H1.5Z" />,
  center: <circle cx="6" cy="6" r="4" />,
  quadrant: <path d="M6 1.5L10.5 6L6 10.5L1.5 6Z" />,
  intersection: <path d="M2 2L10 10M10 2L2 10" />,
  node: <><circle cx="6" cy="6" r="4" /><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" /></>,
  insertion: <><rect x="2" y="2" width="8" height="8" /><circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" /></>,
  perpendicular: <path d="M1.5 10H10.5M6 10V2" />,
  nearest: <path d="M2 2H10L2 10H10Z" />
};
const ALL_MODES = Object.values(OSNAP_BITS).reduce((a, b) => a | b, 0);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A number box: the text stays as typed and each whole number (0 or more) is passed on as it is typed; a part such as
 * "-" or nothing is let be until the box is left. A value set elsewhere (a reset) shows at once. */
function NumRow({ label, lab, rs, chg, unit, value, onChange }: { label: string; lab: ReactNode; rs: ReactNode; chg: boolean; unit?: string; value: number; onChange: (v: string) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText((t) => (isNumber(t) && Number(t) === Number(value) ? t : String(value))), [value]);
  const ok = (t: string) => isNumber(t) && Number(t) >= 0;
  return (
    <div className={`cad-dlg-r${chg ? ' chg' : ''}`}>
      <span className="cad-dlg-l">{lab}{rs}</span>
      <span className="cad-dlg-in">
        <input aria-label={label} inputMode="decimal" autoComplete="off" value={text}
          onChange={(e) => { const t = e.target.value; setText(t); if (ok(t)) onChange(t.trim()); }} onBlur={() => { if (!ok(text)) setText(String(value)); }} />
        {unit && <u>{unit}</u>}
      </span>
    </div>
  );
}

/** Options (OP / OPTIONS): every Design CAD setting in one window, seven pages in a list, a box to find a setting, and a
 * mark, a count and a reset for what is not at its default. Nothing changes until OK; Esc, Cancel or × change nothing.
 * Level and units run at once on OK, each one undo step. */
export default function CadOptions({ at = 'last', draft, toggles, gridDots, level, levelSet, levels, unit, units, autosaveMin, app, setups, penTables, blockFolder, onBlockFolder, folders, onOutput, aliases = {}, keys = {}, onApply, onClose }: {
  at?: OptAt;
  draft: DraftSettings;
  toggles: CadToggles;
  gridDots: boolean;
  level: string;
  /** The drawing is the plan of a level (else the Level box reads "Not set"). */
  levelSet: boolean;
  levels: MenuItem[];
  unit: string;
  units: MenuItem[];
  /** Minutes between the project's recovery copies (Preferences); 0 = off. */
  autosaveMin: number;
  /** The app's own settings shown on General and Display. */
  app: App;
  /** Named page setups and pen tables of the project, for the Plot & publish rows. */
  setups: number;
  penTables: string[];
  /** The block library folder ('' = none chosen) and its chooser (desktop app). */
  blockFolder: string;
  onBlockFolder?: () => Promise<void> | void;
  /** The app's folder choosers (desktop app only; absent in a browser). */
  folders?: { chooseProjects: () => Promise<void>; chooseDatabase: () => Promise<void> };
  /** Opens Page setups or Pen tables over the window. */
  onOutput?: (which: 'setups' | 'pens') => void;
  /** The user's own typed names and keys (Shortcuts & aliases). */
  aliases?: OwnAliases;
  keys?: OwnKeys;
  onApply: (next: { draft: DraftSettings; toggles: CadToggles; gridDots: boolean; autosaveMin: number; app: { theme: ThemePref; palette: PalettePref; cadLabels: boolean; resetRibbonOrder: boolean; aliases: OwnAliases; keys: OwnKeys }; printer: string; level?: MenuItem; unit?: MenuItem }) => void;
  onClose: () => void;
}) {
  const [place, setPlace] = useState(() => { let last: string | null = null; try { last = localStorage.getItem(PLACE_KEY); } catch { /* none */ } return placeOf(at, last); });
  const { page, tab } = place;
  useEffect(() => { try { localStorage.setItem(PLACE_KEY, placeKey(page, tab)); } catch { /* not remembered */ } }, [page, tab]);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'page' | 'changed'>('page');
  // Asked for again at another place while it is open (OS typed, a status-bar switch right-clicked): it goes there, and
  // what was changed so far stays.
  const openedAt = useRef(at);
  useEffect(() => {
    if (at === openedAt.current) return;
    openedAt.current = at;
    if (at !== 'last') { setPlace(placeOf(at)); setQ(''); setMode('page'); }
  }, [at]);
  const [v, setV] = useState<OptValues>(() => ({ draft, autosaveMin, theme: app.theme, palette: app.palette, cadLabels: app.cadLabels, ribbonOrder: app.ribbonOrder, printer: plotPrinter(), aliases, keys }));
  // Shortcuts & aliases: the page's tab (not kept), the filter, and the row a name or a key is being added to.
  const [sub, setSub] = useState<'names' | 'keys'>('names');
  const [filter, setFilter] = useState('');
  const [addName, setAddName] = useState<{ id: string; text: string } | null>(null);
  const [addKey, setAddKey] = useState<{ id: string; problem?: string } | null>(null);
  /** Esc in the name box: what is typed is dropped, where leaving the box any other way keeps a name that can be added. */
  const nameDropped = useRef(false);
  const [t, setT] = useState(toggles);
  const [dots, setDots] = useState(gridDots);
  const [extra, setExtra] = useState(draft.polarExtra.join(', '));
  const [lv, setLv] = useState('');
  const [un, setUn] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const finder = useRef<HTMLInputElement>(null);
  // The window takes the keyboard when it opens: type to find a setting, Esc closes.
  useEffect(() => { finder.current?.focus(); }, []);
  const printers = usePrinters().list;
  const d = v.draft;
  /** The values as they stand now: the typed extra angles count at once. */
  const cur: OptValues = { ...v, draft: { ...d, polarExtra: parseAngles(extra) } };
  const query = q.trim();
  const bridge = typeof window !== 'undefined' ? window.lvds?.settings : undefined;
  const hits = query ? findSettings(query).filter((s) => bridge || !s.id.startsWith('folder')) : [];
  const shown = !query && mode === 'page';

  const patch = (p: Partial<DraftSettings>) => setV((x) => ({ ...x, draft: { ...x.draft, ...p } }));
  const top = (p: Partial<OptValues>) => setV((x) => ({ ...x, ...p }));
  const tog = (k: keyof CadToggles) => (on: boolean) => setT((x) => ({ ...x, [k]: on, ...(k === 'ortho' && on ? { polar: false } : k === 'polar' && on ? { ortho: false } : {}) }));
  const whole = (k: keyof DraftSettings, lo: number, hi: number) => (s: string) => { const x = Math.round(Number(s)); if (x >= lo && x <= hi) patch({ [k]: x } as Partial<DraftSettings>); };
  const resetOf = (l: OptSetting[]) => { setV(resetSettings(cur, l)); if (l.some((s) => s.id === 'polarExtra')) setExtra(''); };
  const goTo = (s: OptSetting) => { setPlace((p) => ({ page: s.page, tab: s.tab ?? p.tab })); setQ(''); setMode('page'); };
  const step = (e: React.KeyboardEvent, i: number) => {
    const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : i;
    if (j === i || j < 0 || j >= OPT_PAGES.length) return;
    e.preventDefault(); setPlace((p) => ({ ...p, page: OPT_PAGES[j].k })); setQ(''); setMode('page'); list.current?.querySelectorAll<HTMLButtonElement>('.cad-dlg-pls > button[role="tab"]')[j]?.focus();
  };
  const stepTab = (e: React.KeyboardEvent, i: number) => {
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : i;
    if (j === i || j < 0 || j >= DRAFT_TABS.length) return;
    e.preventDefault(); setPlace((p) => ({ ...p, tab: DRAFT_TABS[j].k })); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[j]?.focus();
  };

  const stepSub = (e: React.KeyboardEvent, i: number) => {
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : i;
    if (j === i || j < 0 || j > 1) return;
    e.preventDefault(); setSub(j ? 'keys' : 'names'); setAddName(null); setAddKey(null); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[j]?.focus();
  };

  const changedHere = (s: OptSetting) => !!s.changed?.(cur);
  const marked = (label: string) => {
    const ws = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!ws.length) return label;
    const re = new RegExp(`(${ws.map(esc).join('|')})`, 'gi');
    return label.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
  };
  /** A row's label in one piece, so the part found is marked inside the word it belongs to. */
  const lab = (s: OptSetting) => <span>{marked(s.label)}</span>;
  const rs = (s: OptSetting) => (changedHere(s)
    ? <button type="button" className="cad-dlg-rs" aria-label={`Reset ${s.label}`} title={`Reset to ${s.def}`} onClick={() => resetOf([s])}><RotateCcw size={11} aria-hidden /></button> : null);
  const cls = (s: OptSetting) => (changedHere(s) ? ' chg' : '');
  /** A label and its control on one row. */
  const vrow = (s: OptSetting, control: ReactNode, unitText?: string) => (
    <div key={s.id} className={`cad-dlg-r${cls(s)}`}><span className="cad-dlg-l">{lab(s)}{rs(s)}</span><span className="cad-dlg-in">{control}{unitText && <u>{unitText}</u>}</span></div>
  );
  const crow = (s: OptSetting, on: boolean, set: (b: boolean) => void) => (
    <div key={s.id} className={`cad-dlg-r cad-dlg-ck${cls(s)}`}><label><input type="checkbox" aria-label={s.label} checked={on} onChange={(e) => set(e.target.checked)} />{lab(s)}</label>{rs(s)}</div>
  );
  const nrow = (s: OptSetting, value: number, set: (x: string) => void, unitText?: string) => <NumRow key={s.id} label={s.label} lab={lab(s)} rs={rs(s)} chg={changedHere(s)} unit={unitText} value={value} onChange={set} />;
  const opts = (items: readonly { k: string; label: string }[]) => items.map((c) => <option key={c.k} value={c.k}>{c.label}</option>);

  // The folders: read from the desktop app when a page that shows them first opens, and again after each Change….
  const [paths, setPaths] = useState<{ projectsFolder: string; databaseFolder?: string } | null>(null);
  const readPaths = () => { void bridge?.get().then(setPaths, () => undefined); };
  const wantsPaths = !!bridge && (shown ? page === 'files' : hits.some((s) => s.page === 'files'));
  const readOnce = useRef(false);
  useEffect(() => { if (wantsPaths && !readOnce.current) { readOnce.current = true; readPaths(); } }, [wantsPaths]); // eslint-disable-line react-hooks/exhaustive-deps -- read once, when first shown
  const afterChange = (f?: () => Promise<void>) => f && (() => { void Promise.resolve(f()).then(readPaths); });
  const folderRow = (s: OptSetting, path: ReactNode, change?: () => void, show?: { label: string; run: () => void; off?: boolean }) => (
    <div key={s.id} role="group" aria-label={s.label} className="cad-dlg-r path">
      <span className="cad-dlg-l">{lab(s)}</span>
      <span className="cad-dlg-in">
        {path}
        {change && <button type="button" onClick={change}>Change…</button>}
        {show && <button type="button" className="cad-dlg-ib" aria-label={`Show ${show.label} in the file manager`} title="Show in the file manager" disabled={show.off} onClick={show.run}><FolderOpen size={11} aria-hidden /></button>}
      </span>
    </div>
  );
  /** A folder's path in a box; one too long to fit shows its end, where the folder's own name is. */
  const pathBox = (p: string) => <span className="cad-dlg-path" title={p}><bdi>{p}</bdi></span>;
  const projectsPath = paths?.projectsFolder ?? '';
  const databasePath = paths ? paths.databaseFolder || `${projectsPath}${projectsPath.includes('\\') ? '\\' : '/'}${DATABASE_FOLDER}` : '';
  const showFolder = bridge?.showFolder;

  /** One setting's row: the same control on its page, in the find results and on the Changed page. */
  const row = (s: OptSetting): ReactNode => {
    const id = s.id;
    if (id.startsWith('osnap.')) {
      const m = OSNAP_MODES.find((x) => `osnap.${x.k}` === id)!;
      const bit = OSNAP_BITS[m.k];
      return (
        <div key={id} className={`cad-dlg-mode${cls(s)}`}>
          <label><input type="checkbox" aria-label={m.label} checked={(d.osnap & bit) !== 0} onChange={(e) => patch({ osnap: e.target.checked ? d.osnap | bit : d.osnap & ~bit })} />
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">{MODE_MARK[m.k]}</svg>{lab(s)}</label>{rs(s)}
        </div>
      );
    }
    switch (id) {
      case 'cadLabels': return crow(s, v.cadLabels, (b) => top({ cadLabels: b }));
      case 'ribbonOrder': return vrow(s, <><span className="m">{v.ribbonOrder ? 'Your own' : 'Standard'}</span><button type="button" disabled={!v.ribbonOrder} onClick={() => top({ ribbonOrder: false })}>Reset order</button></>);
      case 'folderProjects': return folderRow(s, pathBox(projectsPath), afterChange(folders?.chooseProjects), showFolder ? { label: 'Projects', run: () => void showFolder('projects') } : undefined);
      case 'folderDatabase': return folderRow(s, pathBox(databasePath), afterChange(folders?.chooseDatabase), window.lvds?.database?.open ? { label: 'LV Database', run: () => void window.lvds.database.open() } : undefined);
      case 'folderBlocks': return folderRow(s, blockFolder ? pathBox(blockFolder) : <span className="m">Not set</span>, afterChange(onBlockFolder ? async () => { await onBlockFolder(); } : undefined), showFolder ? { label: 'Block library', run: () => void showFolder('blocks', blockFolder), off: !blockFolder } : undefined);
      case 'folderRecovery': return folderRow(s, <span className="m">App data › recovery</span>, undefined, showFolder ? { label: 'Recovery copies', run: () => void showFolder('recovery') } : undefined);
      case 'saveFormat': return vrow(s, <select aria-label="Save As format" value={d.saveFormat} onChange={(e) => patch({ saveFormat: e.target.value as DraftSettings['saveFormat'] })}><option value="dwg">DWG (default)</option><option value="dxf">DXF</option><option value="own">The drawing's own format</option></select>);
      case 'keepBak': return crow(s, d.keepBak, (b) => patch({ keepBak: b }));
      case 'autosaveMin': return nrow(s, v.autosaveMin, (x) => top({ autosaveMin: Math.round(Number(x)) }), 'min');
      case 'theme': return vrow(s, <select aria-label="Colour theme" value={v.theme} onChange={(e) => top({ theme: e.target.value as ThemePref })}>{opts(Object.entries(THEME_LABEL).map(([k, label]) => ({ k, label })))}</select>);
      case 'palette': return vrow(s, <select aria-label="Colour palette" value={v.palette} onChange={(e) => top({ palette: e.target.value as PalettePref })}>{opts(Object.entries(PALETTE_LABEL).map(([k, label]) => ({ k, label })))}</select>);
      case 'crossPct': return nrow(s, d.crossPct, whole('crossPct', 1, 100), '%');
      case 'crossColor': return vrow(s, <select aria-label="Crosshair colour" value={d.crossColor} onChange={(e) => patch({ crossColor: e.target.value as CrossColor })}>{opts(CROSS_COLORS)}</select>);
      case 'cursorOutline': return crow(s, d.cursorOutline, (b) => patch({ cursorOutline: b }));
      case 'lwt': return crow(s, t.lwt !== false, tog('lwt'));
      case 'snapOn': return crow(s, t.snap, tog('snap'));
      case 'snapX': return nrow(s, d.snapX, (x) => patch({ snapX: Number(x) }), 'mm');
      case 'snapY': return nrow(s, d.snapY, (x) => patch({ snapY: Number(x) }), 'mm');
      case 'gridOn': return crow(s, t.grid, tog('grid'));
      case 'gridStyle': return vrow(s, <select aria-label="Grid style" value={dots ? 'dots' : 'lines'} onChange={(e) => setDots(e.target.value === 'dots')}><option value="lines">Lines</option><option value="dots">Dots</option></select>);
      case 'gridMm': return nrow(s, d.gridMm, (x) => patch({ gridMm: Number(x) }), 'mm');
      case 'gridMajor': return nrow(s, d.gridMajor, (x) => { if (Number(x) >= 1) patch({ gridMajor: Math.round(Number(x)) }); });
      case 'polarOn': return crow(s, !!t.polar, tog('polar'));
      case 'polarInc': return vrow(s, <select aria-label="Increment angle" value={d.polarInc} onChange={(e) => patch({ polarInc: Number(e.target.value) })}>{POLAR_INCREMENTS.map((a) => <option key={a} value={a}>{a}°</option>)}</select>);
      case 'polarExtra': return vrow(s, <input aria-label="Extra angles" value={extra} placeholder="60, 120" onChange={(e) => setExtra(e.target.value)} />, '°');
      case 'otrackOn': return crow(s, !!t.otrack, tog('otrack'));
      case 'trackAllPolar': return vrow(s, <select aria-label="Track along" value={d.trackAllPolar ? 'all' : 'straight'} onChange={(e) => patch({ trackAllPolar: e.target.value === 'all' })}><option value="straight">Straight only</option><option value="all">All polar angles</option></select>);
      case 'osnapOn': return crow(s, t.osnap, tog('osnap'));
      case 'aperturePx': return nrow(s, d.aperturePx, whole('aperturePx', 2, 40), 'px');
      case 'markerPx': return nrow(s, d.markerPx, whole('markerPx', 3, 20), 'px');
      case 'snapTip': return crow(s, d.snapTip, (b) => patch({ snapTip: b }));
      case 'dynOn': return crow(s, !!t.dyn, tog('dyn'));
      case 'dynBoxes': return crow(s, d.dynBoxes, (b) => patch({ dynBoxes: b }));
      case 'dynPrompt': return crow(s, d.dynPrompt, (b) => patch({ dynPrompt: b }));
      case 'dynOptions': return crow(s, d.dynOptions, (b) => patch({ dynOptions: b }));
      case 'attDialog': return crow(s, !!d.attDialog, (b) => patch({ attDialog: b }));
      case 'pickBoxPx': return nrow(s, d.pickBoxPx, whole('pickBoxPx', 3, 30), 'px');
      case 'hoverMark': return crow(s, d.hoverMark, (b) => patch({ hoverMark: b }));
      case 'hoverTag': return crow(s, d.hoverTag, (b) => patch({ hoverTag: b }));
      case 'windowFill': return crow(s, d.windowFill, (b) => patch({ windowFill: b }));
      case 'pickLook': return vrow(s, <select aria-label="Picked objects look" title={PICK_LOOKS.find((c) => c.k === d.pickLook)?.label} value={d.pickLook} onChange={(e) => patch({ pickLook: e.target.value as PickLook })}>{opts(PICK_LOOKS)}</select>);
      case 'selColor': return vrow(s, <select aria-label="Selection colour" value={d.selColor} onChange={(e) => patch({ selColor: e.target.value as SelColor })}>{opts(SEL_COLORS)}</select>);
      case 'grips': return crow(s, d.grips, (b) => patch({ grips: b }));
      case 'gripPx': return nrow(s, d.gripPx, whole('gripPx', 4, 20), 'px');
      case 'gripMax': return nrow(s, d.gripMax, whole('gripMax', 1, 1000), 'objects');
      case 'printer': return vrow(s, <select aria-label="Plot to" value={v.printer} onChange={(e) => top({ printer: e.target.value })}>
        <option value="">PDF (built in)</option>
        {printers.map((p) => <option key={p.name} value={p.name}>{p.displayName}</option>)}
        {v.printer && !printers.some((p) => p.name === v.printer) && <option value={v.printer}>{v.printer}</option>}
      </select>);
      case 'pageSetups': return (
        <div key={id} role="group" aria-label={s.label} className="cad-dlg-r"><span className="cad-dlg-l">{lab(s)}</span><span className="cad-dlg-in"><span className="m">{setups ? `${setups} named` : 'None named'}</span>{onOutput && <button type="button" onClick={() => onOutput('setups')}>Open…</button>}</span></div>
      );
      case 'penTables': return (
        <div key={id} role="group" aria-label={s.label} className="cad-dlg-r"><span className="cad-dlg-l">{lab(s)}</span><span className="cad-dlg-in"><span className="m">{penTables[0] ?? 'None'}{penTables.length > 1 ? ` + ${penTables.length - 1}` : ''}</span>{onOutput && <button type="button" onClick={() => onOutput('pens')}>Open…</button>}</span></div>
      );
      case 'level': return vrow(s, <select aria-label="Level" value={lv} disabled={!levels.length} onChange={(e) => setLv(e.target.value)}><option value="">{levelSet ? level : 'Not set'}</option>{levels.map((x) => <option key={x.label} value={x.label}>{x.label}</option>)}</select>);
      case 'units': return vrow(s, <select aria-label="Units" value={un} disabled={!units.length} onChange={(e) => setUn(e.target.value)}><option value="">{unit}</option>{units.map((x) => <option key={x.label} value={x.label}>{x.label}</option>)}</select>);
      case 'ownAliases': { const n = Object.keys(v.aliases).length; return vrow(s, <span className="m">{n ? `${n} added` : 'None'}</span>); }
      case 'ownKeys': { const n = Object.keys(v.keys).length; return vrow(s, <span className="m">{n ? `${n} added` : 'None'}</span>); }
      default: return null;
    }
  };
  const r = (id: string) => row(BY_ID.get(id)!);
  const sec = (name: string, where: string) => <div className="cad-dlg-sec two">{name}<i>{where}</i></div>;

  /** Rows grouped by the place they are on, each group under its name with a Go to page button (find and Changed). */
  const grouped = (l: OptSetting[]) => {
    const groups: { name: string; first: OptSetting; items: OptSetting[] }[] = [];
    for (const s of l) {
      const name = placeLabel(s);
      const g = groups[groups.length - 1];
      if (g && g.name === name) g.items.push(s); else groups.push({ name, first: s, items: [s] });
    }
    return groups.map((g) => {
      const body: ReactNode[] = [];
      for (let i = 0; i < g.items.length; i += 1) {
        if (!g.items[i].id.startsWith('osnap.')) { body.push(row(g.items[i])); continue; }
        const run: OptSetting[] = [];
        while (i < g.items.length && g.items[i].id.startsWith('osnap.')) { run.push(g.items[i]); i += 1; }
        i -= 1;
        body.push(<div key={`m${run[0].id}`} className="cad-dlg-modes">{run.map(row)}</div>);
      }
      return (
        <Fragment key={g.name}>
          <div className="cad-dlg-sec two go"><b>{g.name}</b><button type="button" aria-label={`Go to ${g.name}`} onClick={() => goTo(g.first)}>Go to page</button></div>
          {body}
        </Fragment>
      );
    });
  };

  const modes = (
    <div className="cad-dlg-modes">{OSNAP_MODES.map((m) => r(`osnap.${m.k}`))}</div>
  );
  const preview = (drawing: ReactNode) => <div className="cad-dlg-pv"><span>Preview</span>{drawing}<p>Follows the values on this page</p></div>;
  /** Shortcuts & aliases: every command with its typed names or its keys, and a + to add one of your own. */
  const shortcutsPage = (): ReactNode => {
    const names = sub === 'names';
    // First the commands that had a name (or key) of the user's own when the window opened, then on Keys those with a
    // standard key, then the rest in the list's order. By what was there on opening, so a row stays put as one is added.
    const rank = (c: CadCommand) => (names ? (aliasesOf(c, aliases).length > c.aliases.length ? 0 : 2) : keysOf(c, keys).some((k) => k.own) ? 0 : keysOf(c, {}).length ? 1 : 2);
    const rows = commandRows(filter).sort((a, b) => rank(a) - rank(b));
    const ownOn = (c: CadCommand) => (names ? aliasesOf(c, v.aliases).length > c.aliases.length : keysOf(c, v.keys).some((k) => k.own));
    const dropName = (a: string) => setV((x) => { const n = { ...x.aliases }; delete n[a]; return { ...x, aliases: n }; });
    const dropKey = (a: string) => setV((x) => { const n = { ...x.keys }; delete n[a]; return { ...x, keys: n }; });
    const nameCell = (c: CadCommand, id: string, full: string) => <>
      {c.aliases.map((a) => <span key={a} className="cad-dlg-al">{a}</span>)}
      {aliasesOf(c, v.aliases).slice(c.aliases.length).map((a) => <span key={a} className="cad-dlg-al own">{a}<button type="button" aria-label={`Remove ${a}`} onClick={() => dropName(a)}>×</button></span>)}
      {addName?.id === id
        ? <input className={`cad-dlg-ali${addName.text && aliasProblem(addName.text, id, v.aliases) ? ' bad' : ''}`} aria-label={`New typed name for ${full}`} autoFocus maxLength={16} autoComplete="off" spellCheck={false} value={addName.text}
          onChange={(e) => setAddName({ id, text: e.target.value.toUpperCase() })}
          onBlur={() => { const n = addName.text; if (!nameDropped.current && n && !aliasProblem(n, id, v.aliases)) setV((x) => ({ ...x, aliases: { ...x.aliases, [n]: id } })); setAddName(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!addName.text) setAddName(null); else if (!aliasProblem(addName.text, id, v.aliases)) { const n = addName.text; setV((x) => ({ ...x, aliases: { ...x.aliases, [n]: id } })); setAddName(null); } }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); nameDropped.current = true; setAddName(null); }
          }} />
        : <button type="button" className="cad-dlg-add" aria-label={`Add a typed name to ${full}`} title="Add a typed name" onClick={() => { nameDropped.current = false; setAddKey(null); setAddName({ id, text: '' }); }}>+</button>}
    </>;
    const keyCell = (c: CadCommand, id: string, full: string) => <>
      {keysOf(c, v.keys).map((k) => { const label = chordLabel(k.chord, MAC); return k.own
        ? <span key={k.chord} className="cad-dlg-al own">{label}<button type="button" aria-label={`Remove ${label}`} onClick={() => dropKey(k.chord)}>×</button></span>
        : <span key={k.chord} className="cad-dlg-al">{label}</span>; })}
      {addKey?.id === id
        ? <button type="button" className={`cad-dlg-ali${addKey.problem ? ' bad' : ''}`} autoFocus aria-label={`Press a key for ${full}`} onBlur={() => setAddKey(null)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') { setAddKey(null); return; }
            const chord = chordOf(e);
            const problem = chord ? keyProblem(chord, id, v.keys) : 'Use F1 to F12, alone or with Ctrl, Alt or Shift, or Ctrl with a digit.';
            if (chord && !problem) { setV((x) => ({ ...x, keys: { ...x.keys, [chord]: id } })); setAddKey(null); } else setAddKey({ id, problem: problem ?? undefined });
          }}>Press a key…</button>
        : <button type="button" className="cad-dlg-add" aria-label={`Add a key to ${full}`} title="Add a key" onClick={() => { setAddName(null); setAddKey({ id }); }}>+</button>}
    </>;
    const own = names ? v.aliases : v.keys;
    return <>
      <div className="cad-dlg-tabs" role="tablist" aria-label="Shortcuts & aliases" ref={tabs}>
        {(['names', 'keys'] as const).map((k, i) => <button key={k} type="button" role="tab" aria-selected={sub === k} onClick={() => { setSub(k); setAddName(null); setAddKey(null); }} onKeyDown={(e) => stepSub(e, i)}>{k === 'names' ? 'Typed names' : 'Keys'}</button>)}
      </div>
      {sec(names ? 'Commands and their typed names' : 'Commands and their keys', 'on this computer')}
      <div className="cad-dlg-find cad-dlg-filter">
        <Search size={11} aria-hidden />
        <input aria-label="Filter commands" placeholder={`Filter ${CAD_COMMANDS.length} commands`} value={filter} onChange={(e) => setFilter(e.target.value)} />
        {filter && <button type="button" aria-label="Clear" onClick={() => setFilter('')}><X size={10} aria-hidden /></button>}
      </div>
      <div className="cad-dlg-tb" role="table" aria-label={names ? 'Typed names' : 'Keys'}>
        <div className="cad-dlg-tr h" role="row"><span role="columnheader">Command</span><span role="columnheader">{names ? 'Typed names' : 'Keys'}</span></div>
        <div className="cad-dlg-tbody">
          {rows.map((c) => {
            const id = commandId(c), full = commandFullName(c);
            const problem = names ? (addName?.id === id && addName.text ? aliasProblem(addName.text, id, v.aliases) : null) : addKey?.id === id ? addKey.problem : null;
            return <Fragment key={id}>
              <div className={`cad-dlg-tr${ownOn(c) ? ' chg' : ''}`} role="row" data-cmd={id}>
                <span role="cell" title={c.desc}>{c.desc}</span>
                <span role="cell" className="cad-dlg-chips">{names ? nameCell(c, id, full) : keyCell(c, id, full)}</span>
              </div>
              {problem && <div className="cad-dlg-warn" role="alert"><TriangleAlert size={11} aria-hidden />{problem}</div>}
            </Fragment>;
          })}
        </div>
      </div>
      <p className="cad-dlg-note">{names ? 'Add a typed name of your own to any command. The standard names stay.' : 'Add a key of your own to any command by pressing it. The standard keys stay.'}</p>
      <div className="cad-dlg-btns"><button type="button" disabled={!Object.keys(own).length} onClick={() => setV((x) => (names ? { ...x, aliases: {} } : { ...x, keys: {} }))}>Reset all</button></div>
    </>;
  };
  const pageBody = (): ReactNode => {
    switch (page) {
      case 'general': return <>
        {sec('Ribbon', 'on this computer')}
        {r('cadLabels')}
        <p className="cad-dlg-note">The tools then take four sub-tabs.</p>
        {r('ribbonOrder')}
      </>;
      case 'files': return <>
        {sec('Folders', 'on this computer')}
        {bridge ? <>
          {r('folderProjects')}{r('folderDatabase')}{r('folderBlocks')}{r('folderRecovery')}
          <p className="cad-dlg-note">A folder changes at once, without OK.</p>
        </> : <p className="cad-dlg-note">Folders belong to the desktop app.</p>}
        {sec('Saving a drawing', 'on this computer, for every drawing')}
        {r('saveFormat')}
        <p className="cad-dlg-note">A drawing saved before starts with the format of its last copy.</p>
        {r('keepBak')}
        {r('autosaveMin')}
        <p className="cad-dlg-note">0 = off. The same setting as Recovery copy of unsaved work in Profile &amp; preferences.</p>
      </>;
      case 'display': return <div className="cad-dlg-two"><div>
        {sec('Screen colours', 'the whole app')}
        {r('theme')}{r('palette')}
        <p className="cad-dlg-note">Changes the screen only. Drawings, PDFs and DXF files are always black on white.</p>
        {sec('Crosshair', 'on this computer')}
        {r('crossPct')}
        <p className="cad-dlg-note">100 = across the drawing</p>
        {r('crossColor')}{r('cursorOutline')}
        {sec('Drawing', 'a status-bar switch')}
        {r('lwt')}
      </div>{preview(<DisplayPreview draft={d} lwt={t.lwt !== false} />)}</div>;
      case 'drafting': return <>
        <div className="cad-dlg-tabs" role="tablist" aria-label="Drafting" ref={tabs}>
          {DRAFT_TABS.map((x, i) => <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => setPlace((p) => ({ ...p, tab: x.k }))} onKeyDown={(e) => stepTab(e, i)}>{x.label}</button>)}
        </div>
        {tab === 'snap' && <>
          {sec('Snap (F9)', 'on this computer')}
          {r('snapOn')}{r('snapX')}{r('snapY')}
          {sec('Grid (F7)', 'on this computer')}
          {r('gridOn')}{r('gridStyle')}{r('gridMm')}{r('gridMajor')}
        </>}
        {tab === 'polar' && <>
          {sec('Polar tracking (F10)', 'on this computer')}
          {r('polarOn')}{r('polarInc')}{r('polarExtra')}
          {sec('Object snap tracking (F11)', 'on this computer')}
          {r('otrackOn')}{r('trackAllPolar')}
        </>}
        {tab === 'osnap' && <>
          {r('osnapOn')}
          <div className="cad-dlg-sec two">Snap modes<span className="cad-dlg-sb"><button type="button" onClick={() => patch({ osnap: ALL_MODES })}>Select all</button><button type="button" onClick={() => patch({ osnap: 0 })}>Clear all</button></span></div>
          {modes}
          {sec('Marker and aperture', 'on this computer')}
          {r('aperturePx')}{r('markerPx')}{r('snapTip')}
          <p className="cad-dlg-note">Perpendicular is from the last point picked.</p>
        </>}
        {tab === 'dyn' && <>
          {r('dynOn')}
          {sec('At the cursor', 'on this computer')}
          {r('dynBoxes')}{r('dynPrompt')}{r('dynOptions')}
          {sec('Blocks', 'on this computer')}
          {r('attDialog')}
          <p className="cad-dlg-note">A point typed: x,y from the last point; # before it for an absolute point; @ for relative; length&lt;angle for polar.</p>
        </>}
      </>;
      case 'selection': return <div className="cad-dlg-two"><div>
        {sec('Picking', 'on this computer')}
        {r('pickBoxPx')}{r('hoverMark')}{r('hoverTag')}{r('windowFill')}
        {sec('Picked objects', 'on this computer')}
        {r('pickLook')}{r('selColor')}
        {sec('Grips', 'on this computer')}
        {r('grips')}{r('gripPx')}{r('gripMax')}
      </div>{preview(<SelectionPreview draft={d} />)}</div>;
      case 'plot': return <>
        {sec('Plotting', 'on this computer')}
        {r('printer')}
        <p className="cad-dlg-note">The printer chosen last in Plot. Printing is always black-and-white.</p>
        {sec('Page setups and pen tables', 'this project')}
        {r('pageSetups')}{r('penTables')}
      </>;
      case 'shortcuts': return shortcutsPage();
      default: return <>
        {sec('This drawing', 'each change is one undo step')}
        {r('level')}
        <p className="cad-dlg-note">The level this drawing is the plan of.</p>
        {r('units')}
        <p className="cad-dlg-note">Level and units change this drawing when you press OK.</p>
      </>;
    }
  };

  const all = changedSettings(cur);
  const total = all.length;
  const countOf = (p: OptPage) => changedSettings(cur, p).length;
  const resetList = !shown ? (query ? [] : all) : page === 'drafting' ? changedSettings(cur, 'drafting', tab) : changedSettings(cur, page);
  const resetLabel = !query && mode === 'changed' ? 'Reset all' : shown && page === 'drafting' ? 'Reset tab' : 'Reset page';
  const helpKey = shown ? (page === 'drafting' ? `drafting/${tab}` as const : page) : 'found';

  const ok = () => onApply({
    draft: { ...d, polarExtra: parseAngles(extra) }, toggles: t, gridDots: dots, autosaveMin: v.autosaveMin,
    app: { theme: v.theme, palette: v.palette, cadLabels: v.cadLabels, resetRibbonOrder: app.ribbonOrder && !v.ribbonOrder, aliases: v.aliases, keys: v.keys },
    printer: v.printer, level: levels.find((x) => x.label === lv), unit: units.find((x) => x.label === un)
  });
  const dlgKeys = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); finder.current?.focus(); finder.current?.select(); }
  };
  const findKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); }
    else if (e.key === 'Enter' && q) { e.preventDefault(); e.stopPropagation(); if (hits.length) goTo(hits[0]); }
  };

  return (
    <CadDialog id="options" title="Options" alias="OP" help={HELP[helpKey]} onOk={ok} onClose={onClose} pages cls="opt" onKeyDown={dlgKeys}
      extra={<button type="button" disabled={!resetList.length} onClick={() => resetOf(resetList)}>{resetLabel}</button>}>
      <div className="cad-dlg-pl">
        <div className="cad-dlg-find">
          <Search size={11} aria-hidden />
          <input ref={finder} aria-label="Find a setting" placeholder="Find a setting" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={findKeys} />
          {q ? <button type="button" aria-label="Clear" onClick={() => { setQ(''); finder.current?.focus(); }}><X size={10} aria-hidden /></button> : <kbd>{FIND_KEY}</kbd>}
        </div>
        <div className="cad-dlg-pls" ref={list} role="tablist" aria-orientation="vertical" aria-label="Options">
          {OPT_PAGES.map((x, i) => <Fragment key={x.k}>
            {x.k === 'drawing' && <hr aria-hidden="true" />}
            <button type="button" role="tab" aria-selected={shown && page === x.k} onClick={() => { setPlace((p) => ({ ...p, page: x.k })); setQ(''); setMode('page'); }} onKeyDown={(e) => step(e, i)}>
              <span>{x.label}</span>{countOf(x.k) > 0 && <i>{countOf(x.k)}</i>}
            </button>
          </Fragment>)}
          <div className="cad-dlg-chgall">
            <button type="button" role="tab" aria-selected={!query && mode === 'changed'} onClick={() => { setQ(''); setMode('changed'); }}>
              <span><b aria-hidden="true" />Changed</span>{total > 0 && <i>{total}</i>}
            </button>
          </div>
        </div>
      </div>
      <div className="cad-dlg-pg">
        {shown && pageBody()}
        {!!query && <>
          <div className="cad-dlg-hits">
            <span>{hits.length ? `${hits.length} ${hits.length === 1 ? 'setting matches' : 'settings match'} “${query}”` : `No setting matches “${query}”`}</span>
            {hits.length > 0 && <span>Enter opens the first · Esc clears</span>}
          </div>
          {grouped(hits)}
        </>}
        {!query && mode === 'changed' && <>
          <div className="cad-dlg-hits"><span>{total === 1 ? '1 setting is not at its default' : total ? `${total} settings are not at their default` : 'Every setting is at its default.'}</span></div>
          {grouped(all)}
        </>}
      </div>
    </CadDialog>
  );
}
