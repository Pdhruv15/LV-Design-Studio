import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HATCH_IDS, HATCH_PATTERNS, type HatchPattern, type HatchSpec } from '../../model/cadAnnotate';
import { customLabel, defOf, specWith, type CustomPattern } from '../../model/cadHatch';
import { HatchSwatch } from './AnnotatePanel';

/** Design CAD → the Hatch strip: while Hatch (H) or Edit hatch (HE) runs it takes the ribbon's place. Boundary, Pattern,
 * Properties, Origin, Options and Finish, as plain controls (props in, callbacks out; CadPage keeps the state). */

/** What a click on the drawing does now: Pick point and Select hatch (or choose a hatch to edit), Set point sets the pattern
 * origin, Match copies another hatch, Keep / Again are Remove's two jobs in Edit hatch. */
export type HatchPick = 'point' | 'select' | 'origin' | 'match' | 'keep' | 'again';
export type HatchOriginAt = 'corner' | 'centre' | 'reset';

export interface HatchStripProps {
  /** `hatch`: the next hatch's settings; `edit`: those of the hatches being edited. */
  mode: 'hatch' | 'edit';
  /** The settings shown: the next hatch's, or the first edited hatch's; none while no hatch is chosen in `edit`. */
  spec?: HatchSpec;
  onSpec: (s: HatchSpec) => void;
  patterns?: CustomPattern[]; computer?: CustomPattern[];
  pick: HatchPick;
  onPick: (m: HatchPick) => void;
  /** Hatches being edited, and the islands of the one. */
  edited?: number; islands?: number;
  /** The pattern origin of the one edited hatch (m), if it has one; and whether the settings shown have one. */
  origin?: [number, number]; hasOrigin?: boolean;
  onOutline?: () => void; onOrigin?: (at: HatchOriginAt) => void;
  follow: boolean; canFollow: boolean; onFollow: () => void;
  findIslands: boolean; onFindIslands: () => void;
  keep: boolean; onKeep: (on: boolean) => void;
  onImport?: (text: string, file: string) => void; onExport?: () => void;
  onDone: () => void;
}

// ----- icons, drawn for this strip (stroke from the text colour) -----
const Svg = ({ size, vb, children }: { size: number; vb: number; children: ReactNode }) => (
  <svg className="hatch-strip-ico" width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} aria-hidden="true" focusable="false">{children}</svg>
);
const IcPick = () => <Svg size={28} vb={28}><path d="M4 6h14l6 6v10H4z" /><circle cx="13" cy="15" r="1.4" fill="currentColor" /><path d="M13 9.5v3M13 17.5v3M7.5 15h3M15.5 15h3" /></Svg>;
const IcSelect = () => <Svg size={16} vb={16}><rect x="2" y="2.5" width="9" height="8" rx="1" /><path d="M8 7l5.5 2.2-2.3.9 1.4 2.6-1.2.6-1.4-2.6-1.6 1.7z" fill="currentColor" strokeWidth=".8" /></Svg>;
const IcRemove = () => <Svg size={16} vb={16}><rect x="2" y="2.5" width="12" height="11" rx="1" strokeDasharray="2.2 2" /><path d="M5.5 8h5" /></Svg>;
const IcOutline = () => <Svg size={16} vb={16}><path d="M3 13V5.5L6.5 3H13v6.5" /><path d="M13.5 11.5a3 3 0 1 1-1-2.3M13.6 8.2v1.6H12" /></Svg>;
const IcOrigin = () => <Svg size={28} vb={28}><path d="M5 5v18h18" /><circle cx="5" cy="23" r="2.6" /><path d="M11 23V11M5 17h12M17 11h-6" strokeDasharray="1.5 2.5" /><path d="M19 9l4-4M23 9V5h-4" /></Svg>;
const IcFollow = () => <Svg size={16} vb={16}><rect x="1.8" y="5.5" width="6.4" height="5" rx="2.5" /><rect x="7.8" y="5.5" width="6.4" height="5" rx="2.5" /></Svg>;
const IcIslands = () => <Svg size={16} vb={16}><rect x="1.8" y="2.5" width="12.4" height="11" rx="1" /><rect x="5.5" y="6" width="5" height="4" /></Svg>;
const IcSheet = () => <Svg size={16} vb={16}><path d="M2 12.5L12.5 2l1.5 1.5L3.5 14zM5 9.5l1 1M7.3 7.2l1 1M9.6 4.9l1 1" /></Svg>;
const IcMatch = () => <Svg size={16} vb={16}><path d="M9.5 3.5l3 3M11 2l3 3-2 2-3-3zM9.8 5.2L3 12v1.5h1.5l6.8-6.8" /></Svg>;
const IcDone = () => <Svg size={28} vb={28}><circle cx="14" cy="14" r="10" /><path d="M9 14.5l3.5 3.5L19.5 10.5" /></Svg>;
const IcUp = () => <Svg size={10} vb={10}><path d="M2 6.5L5 3.5L8 6.5" /></Svg>;
const IcDown = () => <Svg size={10} vb={10}><path d="M2 3.5L5 6.5L8 3.5" /></Svg>;
const IcAll = () => <Svg size={10} vb={10}><path d="M2 2.5L5 5L8 2.5M2 6L5 8.5L8 6" /></Svg>;

/** A number typed in a box and applied when it is left or Enter is pressed (one change, not one per key). */
function Typed({ label, value, step, min, disabled, title, onValue }: { label: string; value: number; step: string; min?: string; disabled?: boolean; title?: string; onValue: (v: number) => void }) {
  return <input key={value} aria-label={label} title={title} type="number" step={step} min={min} disabled={disabled} defaultValue={value}
    onBlur={(e) => { const v = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(v) && v !== value) onValue(v); }}
    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

/** A small box under a button (fixed, so the strip's own scrolling does not clip it); closes on a click elsewhere or Esc. */
function Pop({ at, label, role, className, onClose, children }: { at: { x: number; y: number }; label: string; role: 'menu' | 'dialog'; className?: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { const t = e.target as Element; if (!box.current?.contains(t) && !t.closest?.('[data-hatch-pop]')) onClose(); };
    document.addEventListener('mousedown', down);
    box.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus();
    return () => document.removeEventListener('mousedown', down);
  }, [onClose]);
  return createPortal(
    <div ref={box} className={`hatch-strip-pop${className ? ` ${className}` : ''}`} role={role} aria-label={label} style={{ left: at.x, top: at.y }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>{children}</div>,
    document.body);
}

interface Entry { key: string; label: string; title: string; spec: HatchSpec; group: 'built' | 'project' | 'computer'; id?: HatchPattern; custom?: CustomPattern }
const SWATCH_W = 54; // a swatch (50 px) and its gap (4 px)

export function HatchStrip(p: HatchStripProps) {
  const { mode, spec, patterns = [], computer = [], pick } = p;
  const edit = mode === 'edit', edited = p.edited ?? 0, none = edit && !spec, one = edit && edited === 1;
  const def = spec ? defOf(spec) : undefined;
  const mine = useMemo(() => computer.filter((c) => !patterns.some((q) => q.name.toUpperCase() === c.name.toUpperCase())), [computer, patterns]);

  // The patterns in one list: built in, the project's (and a drawing's own in use), then this computer's.
  const entries = useMemo<Entry[]>(() => {
    const swatch: HatchSpec = { pattern: 'ansi31', scale: 3, angle: 0 };
    const out: Entry[] = HATCH_IDS.map((id) => ({ key: id, label: HATCH_PATTERNS[id].short, title: HATCH_PATTERNS[id].label, spec: { ...swatch, pattern: id }, group: 'built', id }));
    const own = (c: CustomPattern, group: Entry['group']): Entry => ({ key: `custom:${c.name}`, label: c.name, title: customLabel(c), spec: specWith(swatch, c), group, custom: c });
    for (const c of patterns) out.push(own(c, 'project'));
    if (spec?.custom && ![...patterns, ...mine].some((c) => c.name === spec.custom!.name)) out.push(own(spec.custom, 'project'));
    for (const c of mine) out.push(own(c, 'computer'));
    return out;
  }, [patterns, mine, spec?.custom]);
  const chosen = spec ? (spec.custom ? `custom:${spec.custom.name}` : spec.pattern) : '';
  const at = entries.findIndex((e) => e.key === chosen);
  const choose = (e: Entry) => {
    if (!spec) return;
    p.onSpec(e.custom ? specWith(spec, e.custom) : { scale: spec.scale, angle: spec.angle, pattern: e.id!, ...(spec.origin ? { origin: spec.origin } : {}) });
  };

  // Type: Solid, Pattern (the last built-in one used) or Own (the first of the project's or the computer's).
  const lastBuilt = useRef<HatchPattern>('ansi31');
  if (spec && !spec.custom && spec.pattern !== 'solid' && spec.pattern in HATCH_PATTERNS) lastBuilt.current = spec.pattern as HatchPattern;
  const ownList = entries.filter((e) => e.custom);
  const type = !spec ? 'pattern' : spec.custom ? 'own' : spec.pattern === 'solid' ? 'solid' : 'pattern';
  const setType = (v: string) => {
    const e = v === 'solid' ? entries.find((x) => x.id === 'solid') : v === 'own' ? ownList[0] : entries.find((x) => x.id === lastBuilt.current);
    if (e) choose(e);
  };
  const solid = !!def?.solid;

  // The swatch strip: as many as fit (three at least), paged by the arrows; the one chosen is brought into view.
  const lane = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(3), [first, setFirst] = useState(0);
  useLayoutEffect(() => {
    const el = lane.current; if (!el) return;
    const measure = () => setFit(Math.max(3, Math.floor((el.clientWidth + 4) / SWATCH_W)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const room = Math.max(0, entries.length - fit);
  const from = Math.min(first, room);
  // (only when the choice changes, so paging away from it stays)
  const seen = useRef(-2);
  useEffect(() => {
    if (at === seen.current) return;
    seen.current = at;
    if (at >= 0 && (at < from || at >= from + fit)) setFirst(Math.min(at, room));
  }, [at, from, fit, room]);
  const page = (d: number) => setFirst(Math.max(0, Math.min(room, from + d * fit)));
  const refocus = useRef(false);
  useEffect(() => { if (refocus.current) { refocus.current = false; lane.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(); } });
  const arrows = (ev: React.KeyboardEvent) => {
    if ((ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') || none) return;
    ev.preventDefault();
    const n = Math.max(0, Math.min(entries.length - 1, (at < 0 ? 0 : at) + (ev.key === 'ArrowRight' ? 1 : -1)));
    if (n !== at) { refocus.current = true; choose(entries[n]); }
  };
  const shown = entries.slice(from, from + fit);

  // The boxes under the arrows.
  const [pop, setPop] = useState<null | { id: 'remove' | 'origin' | 'all'; x: number; y: number }>(null);
  const closePop = useMemo(() => () => setPop(null), []);
  const open = (id: 'remove' | 'origin' | 'all') => (ev: React.MouseEvent<HTMLElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    setPop(pop?.id === id ? null : { id, x: Math.max(4, Math.min(r.left, window.innerWidth - 560)), y: r.bottom + 2 });
  };
  const file = useRef<HTMLInputElement>(null);

  const why = {
    edit: 'Needs a hatch being edited: use Edit hatch (HE)',
    some: 'Select a hatch first',
    one: 'Select one hatch first'
  };
  const needsEdit = !edit ? why.edit : edited === 0 ? why.some : '';
  const needsOne = !edit ? why.edit : edited !== 1 ? (edited === 0 ? why.some : why.one) : '';
  const modeBtn = (m: HatchPick, label: string, key: string, tip: string, icon: ReactNode, large: boolean, reason = '') => (
    <button type="button" className={`hatch-strip-b ${large ? 'lg' : 'row'}${pick === m ? ' on' : ''}`} aria-pressed={pick === m} disabled={!!reason} title={reason ? `${label}: ${reason}` : `${label}: ${tip}`} onClick={() => p.onPick(m)}>{icon}<span>{label}</span></button>
  );
  const originTip = one ? `Set point: click the pattern origin. Now ${p.origin ? `${p.origin[0].toFixed(2)}, ${p.origin[1].toFixed(2)} m` : '0, 0 (not set)'}` : 'Set point: click where the pattern starts; the arrow lists corner, centre and reset';
  const removeReason = !edit ? 'Works on a hatch being edited: use Edit hatch (HE)' : edited === 0 ? why.some : edited > 1 ? why.one : '';
  const originSet = needsOne;
  const noPatterns = none ? why.some : '';

  return (
    <div className="hatch-strip" role="toolbar" aria-label={edit ? 'Edit hatch' : 'Hatch'}>
      <div className="hatch-strip-panel" role="group" aria-label="Boundary">
        <div className="hatch-strip-tools">
          {modeBtn('point', 'Pick point', '', 'click inside a closed area or a room; the hatch stops at the nearest closed outline and leaves islands clear', <IcPick />, true, edit ? 'Starts a new hatch: use Hatch (H)' : '')}
          <div className="hatch-strip-col">
            {modeBtn('select', 'Select', '', edit ? 'click another hatch to edit it' : 'click a closed polyline, rectangle or circle to hatch it', <IcSelect />, false)}
            <span className="hatch-strip-split">
              <button type="button" className={`hatch-strip-b row${pick === 'keep' || pick === 'again' ? ' on' : ''}`} aria-pressed={pick === 'keep' || pick === 'again'} disabled={!!removeReason}
                title={removeReason ? `Remove: ${removeReason}` : 'Remove: click a closed object inside the hatch to keep it clear'} onClick={() => p.onPick('keep')}><IcRemove /><span>Remove</span></button>
              <button type="button" className="hatch-strip-arrow" data-hatch-pop aria-label="Remove: more" aria-haspopup="menu" aria-expanded={pop?.id === 'remove'} disabled={!!removeReason}
                title={removeReason ? `Remove: ${removeReason}` : 'Keep an area clear, or hatch an island again'} onClick={open('remove')}><IcDown /></button>
            </span>
            <button type="button" className="hatch-strip-b row" disabled={!!needsEdit} title={needsEdit ? `Outline: ${needsEdit}` : 'Outline: draw a closed polyline along the outline of each hatch edited, on the current layer'} onClick={p.onOutline}><IcOutline /><span>Outline</span></button>
          </div>
        </div>
        <div className="hatch-strip-cap">Boundary</div>
      </div>

      <div className="hatch-strip-panel hatch-strip-grow" role="group" aria-label="Pattern">
        <div className="hatch-strip-tools">
          <div ref={lane} className="hatch-strip-lane" role="listbox" aria-label="Hatch pattern" aria-orientation="horizontal" onKeyDown={arrows}>
            {shown.map((e) => (
              <button key={e.key} type="button" role="option" aria-selected={e.key === chosen} tabIndex={e.key === chosen || (at < 0 && e === shown[0]) ? 0 : -1} disabled={none} title={none ? noPatterns : e.title}
                className={`hatch-strip-sw${e.key === chosen ? ' on' : ''}`} onClick={() => choose(e)}>
                <span aria-hidden="true"><HatchSwatch spec={e.spec} className="hatch-strip-thumb" /></span><span className="hatch-strip-swl">{e.label}</span>
              </button>
            ))}
          </div>
          <div className="hatch-strip-scroll">
            <button type="button" aria-label="Earlier patterns" title="Earlier patterns" disabled={from <= 0} onClick={() => page(-1)}><IcUp /></button>
            <button type="button" aria-label="More patterns" title="More patterns" disabled={from >= room} onClick={() => page(1)}><IcDown /></button>
            <button type="button" data-hatch-pop aria-label="All patterns" aria-haspopup="dialog" aria-expanded={pop?.id === 'all'} title="All patterns: built in, this project's and this computer's, and import or export a pattern file" onClick={open('all')}><IcAll /></button>
          </div>
        </div>
        <div className="hatch-strip-cap">Pattern</div>
      </div>

      <div className="hatch-strip-panel" role="group" aria-label="Properties">
        <div className="hatch-strip-tools">
          <div className="hatch-strip-props">
            <label>Type</label>
            <select aria-label="Hatch type" value={type} disabled={none} title={none ? noPatterns : 'Type: Solid fill, a Pattern, or an Own pattern of the project or this computer'} onChange={(e) => setType(e.target.value)}>
              <option value="solid">Solid</option><option value="pattern">Pattern</option><option value="own" disabled={!ownList.length && type !== 'own'}>Own</option>
            </select>
            <label>Angle</label>
            {spec && def && !solid && !def.noAngle
              ? <Typed label="Hatch angle" step="15" value={spec.angle} title="Angle of the pattern lines, in degrees" onValue={(v) => p.onSpec({ ...spec, angle: v })} />
              : <input aria-label="Hatch angle" type="number" disabled value={spec?.angle ?? 0} title={none ? noPatterns : solid ? 'Angle: a solid fill has no lines' : 'Angle: this pattern looks the same at any angle'} readOnly />}
            <label>Scale</label>
            <span className="hatch-strip-step" title={solid ? 'Scale: a solid fill has no spacing' : 'Spacing on paper, mm'}>
              <button type="button" aria-label="Halve the scale" disabled={!spec || solid || spec.scale <= 0.5} title="Halve the spacing (not below 0.5 mm)" onClick={() => spec && p.onSpec({ ...spec, scale: Math.max(0.5, spec.scale / 2) })}>−</button>
              {spec && !solid
                ? <Typed label="Hatch scale" step="0.5" min="0.5" value={spec.scale} title="Spacing on paper, mm" onValue={(v) => p.onSpec({ ...spec, scale: Math.max(0.5, v) })} />
                : <input aria-label="Hatch scale" type="number" disabled readOnly value={spec?.scale ?? 3} title={none ? noPatterns : 'Scale: a solid fill has no spacing'} />}
              <button type="button" aria-label="Double the scale" disabled={!spec || solid} title="Double the spacing" onClick={() => spec && p.onSpec({ ...spec, scale: spec.scale * 2 })}>+</button>
            </span>
          </div>
          {edit && edited > 1 && <span className="hatch-strip-note">{edited} hatches: pattern, angle and scale change together.</span>}
        </div>
        <div className="hatch-strip-cap">Properties</div>
      </div>

      <div className="hatch-strip-panel" role="group" aria-label="Origin">
        <div className="hatch-strip-tools">
          <button type="button" className={`hatch-strip-b lg${pick === 'origin' ? ' on' : ''}`} aria-pressed={pick === 'origin'} disabled={edit && edited === 0}
            title={edit && edited === 0 ? `Set point: ${why.some}` : originTip} onClick={() => p.onPick('origin')}><IcOrigin /><span>Set point</span></button>
          <button type="button" className="hatch-strip-arrow tall" data-hatch-pop aria-label="Origin: more" aria-haspopup="menu" aria-expanded={pop?.id === 'origin'} title="Bottom left or centre of the boundary, or back to 0, 0" onClick={open('origin')}><IcDown /></button>
        </div>
        <div className="hatch-strip-cap">Origin</div>
      </div>

      <div className="hatch-strip-panel" role="group" aria-label="Options">
        <div className="hatch-strip-tools">
          <div className="hatch-strip-col">
            <button type="button" className={`hatch-strip-b row${p.follow ? ' on' : ''}`} aria-pressed={p.follow} disabled={edit && (!p.canFollow || edited === 0)}
              title={edit ? (p.canFollow ? 'Follow boundary: the hatch follows the objects it was made from; click to let go' : 'Follow boundary: this hatch is not tied to any object') : 'Follow boundary: a new hatch follows its boundary when that is changed'} onClick={p.onFollow}><IcFollow /><span>Follow boundary</span></button>
            <button type="button" className={`hatch-strip-b row${p.findIslands && !edit ? ' on' : ''}`} aria-pressed={!edit && p.findIslands} disabled={edit}
              title={edit ? 'Islands: set when the hatch is made; use Remove to change them here' : 'Islands: closed objects inside the boundary stay clear'} onClick={p.onFindIslands}><IcIslands /><span>Islands</span></button>
          </div>
          <div className="hatch-strip-col">
            <button type="button" className={`hatch-strip-b row${pick === 'match' ? ' on' : ''}`} aria-pressed={pick === 'match'} disabled={edit && edited === 0}
              title={edit && edited === 0 ? `Match: ${why.some}` : `Match: click an existing hatch to copy its pattern, scale, angle and origin ${edit ? 'onto the hatches edited' : 'to the next hatch'}`} onClick={() => p.onPick('match')}><IcMatch /><span>Match</span></button>
            <button type="button" className="hatch-strip-b row" disabled title="Comes with annotation scale"><IcSheet /><span>Sheet scale</span></button>
          </div>
        </div>
        <div className="hatch-strip-cap">Options</div>
      </div>

      <div className="hatch-strip-panel" role="group" aria-label="Finish">
        <div className="hatch-strip-tools">
          <button type="button" className="hatch-strip-b lg done" title="Done (Enter): keep the hatches and leave Hatch; Esc steps back" onClick={p.onDone}><IcDone /><span>Done</span></button>
        </div>
        <div className="hatch-strip-cap">Finish</div>
      </div>

      {pop?.id === 'remove' && (
        <Pop at={pop} label="Remove" role="menu" onClose={closePop}>
          <button type="button" role="menuitem" className={pick === 'keep' ? 'on' : ''} onClick={() => { closePop(); p.onPick('keep'); }}>Keep an area clear</button>
          <button type="button" role="menuitem" className={pick === 'again' ? 'on' : ''} disabled={!(p.islands ?? 0)} title={(p.islands ?? 0) ? 'Click an island to hatch it again' : 'This hatch has no islands'} onClick={() => { closePop(); p.onPick('again'); }}>Hatch an island again</button>
        </Pop>
      )}
      {pop?.id === 'origin' && (
        <Pop at={pop} label="Origin" role="menu" onClose={closePop}>
          <button type="button" role="menuitem" disabled={!!originSet} title={originSet || 'Start the pattern at the lower-left corner of the boundary'} onClick={() => { closePop(); p.onOrigin?.('corner'); }}>Bottom left of the boundary</button>
          <button type="button" role="menuitem" disabled={!!originSet} title={originSet || 'Start the pattern at the centre of the boundary'} onClick={() => { closePop(); p.onOrigin?.('centre'); }}>Centre of the boundary</button>
          <button type="button" role="menuitem" disabled={!p.hasOrigin} title={p.hasOrigin ? 'Take the origin away: the pattern starts at 0, 0' : 'The pattern starts at 0, 0 already'} onClick={() => { closePop(); p.onOrigin?.('reset'); }}>Reset to 0, 0</button>
        </Pop>
      )}
      {pop?.id === 'all' && (
        <Pop at={pop} label="All patterns" role="dialog" className="all" onClose={closePop}>
          {(['built', 'project', 'computer'] as const).map((g) => {
            const list = entries.filter((e) => e.group === g);
            if (g !== 'built' && !list.length) return null;
            const title = g === 'built' ? 'Built in' : g === 'project' ? 'This project' : 'On this computer';
            return (
              <div key={g}>
                <div className="hatch-strip-gh"><span>{title}</span><span>{list.length}</span></div>
                <div className="hatch-strip-grid" role="listbox" aria-label={title}>
                  {list.map((e) => (
                    <button key={e.key} type="button" role="option" aria-selected={e.key === chosen} disabled={none} title={none ? noPatterns : e.title} className={`hatch-strip-sw${e.key === chosen ? ' on' : ''}`} onClick={() => { choose(e); closePop(); }}>
                      <span aria-hidden="true"><HatchSwatch spec={e.spec} className="hatch-strip-thumb" /></span><span className="hatch-strip-swl">{e.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="hatch-strip-foot">
            {p.onImport && <>
              <input ref={file} type="file" accept=".pat" hidden aria-label="Hatch pattern file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const text = await f.text(); closePop(); p.onImport!(text, f.name); } }} />
              <button type="button" className="hatch-strip-chip" title="Add the patterns of a .pat file to this project" onClick={() => file.current?.click()}>Import a pattern file…</button>
            </>}
            {p.onExport && <button type="button" className="hatch-strip-chip" title="Save every pattern in the list as a .pat file" onClick={() => { closePop(); p.onExport!(); }}>Export patterns…</button>}
            {p.onImport && <label title="Imported patterns are also stored on this computer"><input type="checkbox" aria-label="Keep imported patterns on this computer" checked={p.keep} onChange={(e) => p.onKeep(e.target.checked)} /> Also keep imported patterns on this computer for every project</label>}
          </div>
        </Pop>
      )}
    </div>
  );
}
