import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, IndentDecrease, IndentIncrease, Info, PanelLeftClose, PanelLeftOpen, Plus, Power, Waves, X } from 'lucide-react';
import type { Board, Project } from '../types';
import type { FeederResult, Status } from '../calc/electrical';
import { boardSummary } from '../calc/summary';
import { incomerOf, indentTarget, moveBlocked, outdentTarget, siblings } from '../model/moveBoard';
import { txTags } from '../model/transformers';
import { treeGroups, type TreeGroup, type TreeItem } from '../diagram/mvShow';
import { onMvSide } from '../diagram/mvArrangement';
import { groupBy } from '../util/sets';
import { fmtFixed } from '../util/format';

/** What a click on a board does on the page you're on. */
export const TREE_HINT: Partial<Record<string, string>> = {
  design: 'Click a board to select it on the SLD',
  'load-schedule': 'Click a DB to open its load schedule',
  coordination: 'Click a board for its breakers’ coordination',
  earthing: 'Click a board to show it and the boards below',
  selection: 'Click a board to show it and the boards below',
  'cable-schedule': 'Click a board to show its cables and those below'
};

export interface TreeMenuActions {
  onAddBoard: (parentId: string) => void;
  onAddFeeder: (boardId: string) => void;
  onProperties: (boardId: string) => void;
  onSchedule: (boardId: string) => void;
  onCopy: (boardId: string) => void;
  onPaste?: (boardId: string) => void;
  onDelete: (boardId: string) => void;
  /** Supply the board (and everything below it) from another board. */
  onMove?: (boardId: string, toId: string) => void;
  /** Move up / down among the boards on the same source. */
  onReorder?: (boardId: string, dir: -1 | 1) => void;
  /** The moved board's incomer length was checked. */
  onLengthChecked?: (boardId: string) => void;
  /** Set the cable type of all the board's outgoing cables ('auto' = automatic). */
  onCableType?: (boardId: string, type: string) => void;
  cableTypes?: { value: string; label: string }[];
}

function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  return [v, (next: T) => { setV(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* preference only */ } }];
}

const worst = (xs: Status[]): Status | undefined => (xs.includes('bad') ? 'bad' : xs.includes('warn') ? 'warn' : xs.length ? 'ok' : undefined);

/** Each group's collapse key, and the groups above each main board (to reveal it). */
function groupIndex(groups: TreeItem[] | undefined): { keys: string[]; path: Map<string, string[]> } {
  const keys: string[] = [], path = new Map<string, string[]>();
  const walk = (it: TreeItem, up: string[]) => {
    if (typeof it === 'string') { path.set(it, up); return; }
    const k = `g:${it.key}`;
    keys.push(k);
    for (const x of it.items) walk(x, [...up, k]);
  };
  for (const g of groups ?? []) walk(g, []);
  return { keys, path };
}

/** The installation as a tree: transformer → MDB → SMDB → DB, with each
 * board's status and loading. The page you're on decides what a click does
 * (select on the SLD, open its schedule, filter a study…); double-click
 * opens it on the SLD; right-click for the board menu. Once a main board
 * names its RMU or substation, Group → Substations puts the main boards
 * under their substation and RMU (proposal 2026-11-18, part 3). */
export default function PanelTree({ project, results, activeId, focusId, view, onPick, onOpen, menu, copiedId, highlightedIds, onClearHighlights, shownPart, onShowPart }: {
  project: Project;
  results: FeederResult[];
  /** The board the page is on (highlighted). */
  activeId?: string;
  /** A study page's board filter. */
  focusId?: string | null;
  view: string;
  onPick: (id: string) => void;
  onOpen: (id: string) => void;
  menu: TreeMenuActions;
  copiedId?: string | null;
  highlightedIds?: string[];
  onClearHighlights?: () => void;
  /** The part the SLD shows (partKey): its row is marked in the tree by substation. */
  shownPart?: string;
  /** Show a substation or an RMU on the SLD: a click on its row on the SLD page, a double-click elsewhere. */
  onShowPart?: (part: string) => void;
}) {
  const [hidden, setHidden] = useStored('tree.hidden', false);
  const [collapsed, setCollapsed] = useStored<string[]>('tree.collapsed', []);
  const [width, setWidth] = useStored('tree.width', 230);
  const [grouping, setGrouping] = useStored<'boards' | 'substations'>('tree.group', 'boards');
  const [q, setQ] = useState('');
  const [keyOpen, setKeyOpen] = useState(() => { try { return localStorage.getItem('lvds.treeKey') === '1'; } catch { return false; } });
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const ref = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<{ id: string; over?: string; why?: string } | null>(null);
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [moveQ, setMoveQ] = useState('');

  // By substation: the groups, their collapse keys and the groups above each main board.
  const groups = useMemo(() => treeGroups(project), [project]);
  const grouped = grouping === 'substations' && !!groups;
  // The switch stands wherever a main board could be in a substation (not only meter cabinets on an authority LV
  // supply); Substations is greyed until one names its RMU or substation.
  const groupable = useMemo(() => project.boards.some(onMvSide), [project.boards]);
  const gIndex = useMemo(() => groupIndex(grouped ? groups : undefined), [grouped, groups]);
  const tx = useMemo(() => (grouped ? txTags(project) : undefined), [grouped, project]);

  // Reveal the newly created batch even if this tree was hidden, filtered
  // or collapsed. References in the draft have already been validated.
  // Only a new batch changes the user's tree preferences (not later edits to the boards or the tree).
  const lastBatch = useRef<typeof highlightedIds>(undefined);
  useEffect(() => {
    if (highlightedIds === lastBatch.current) return;
    lastBatch.current = highlightedIds;
    if (!highlightedIds?.length) return;
    const byId = new Map(project.boards.map((b) => [b.id, b]));
    const reveal = new Set<string>();
    for (const id of highlightedIds) {
      let current = byId.get(id);
      while (current && !reveal.has(current.id)) {
        reveal.add(current.id); current = current.upstreamId ? byId.get(current.upstreamId) : undefined;
      }
    }
    for (const id of [...reveal]) for (const k of gIndex.path.get(id) ?? []) reveal.add(k);
    setHidden(false); setQ(''); setCollapsed(collapsed.filter((id) => !reveal.has(id)));
  }, [highlightedIds, project.boards, collapsed, setCollapsed, setHidden, gIndex]);
  const presentIds = useMemo(() => new Set(project.boards.map((b) => b.id)), [project.boards]);
  const highlighted = new Set(highlightedIds?.filter((id) => presentIds.has(id)));
  useEffect(() => {
    if (highlightedIds?.length && !hidden) ref.current?.querySelector('.batch-new.on')?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIds, hidden]);

  // Children in the order their incomers sit on the parent's busbar.
  const children = useMemo(() => {
    const m = new Map<string, Board[]>();
    const add = (parent: string, b: Board) => { const l = m.get(parent); if (l) l.push(b); else m.set(parent, [b]); };
    const byId = new Map(project.boards.map((b) => [b.id, b]));
    for (const f of project.feeders) {
      const child = f.feedsBoardId ? byId.get(f.feedsBoardId) : undefined;
      if (child && child.upstreamId === f.boardId) add(f.boardId, child);
    }
    for (const b of project.boards) {
      if (b.upstreamId && !(m.get(b.upstreamId) ?? []).includes(b)) add(b.upstreamId, b);
    }
    return m;
  }, [project]);
  const roots = project.boards.filter((b) => !b.upstreamId || !presentIds.has(b.upstreamId));

  const info = useMemo(() => {
    const m = new Map<string, { status?: Status; loading?: number; loadingStatus?: Status; fails: number }>();
    const onBoard = groupBy(results, (r) => r.feeder.boardId);
    for (const b of project.boards) {
      const st = (onBoard.get(b.id) ?? []).map((r) => r.status);
      const s = boardSummary(project, b);
      m.set(b.id, { status: worst(st), loading: s.loadingPct, loadingStatus: s.loadingStatus, fails: st.filter((x) => x === 'bad').length });
    }
    return m;
  }, [project, results]);

  // Search: boards whose id / name / kind match, and the boards above them;
  // by substation also every board of a substation or RMU whose name matches.
  const words = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!words) return null;
    const keep = new Set<string>();
    for (const b of project.boards) {
      if (`${b.id} ${b.name} ${b.kind ?? ''} ${b.location ?? ''}`.toLowerCase().includes(words)) {
        let cur: Board | undefined = b;
        for (let i = 0; cur && i < 30; i++) { keep.add(cur.id); cur = project.boards.find((x) => x.id === cur!.upstreamId); }
      }
    }
    if (grouped) {
      const seen = new Set<string>();
      const below = (id: string) => { if (seen.has(id)) return; seen.add(id); keep.add(id); for (const k of children.get(id) ?? []) below(k.id); };
      const visit = (it: TreeItem, hit: boolean) => {
        if (typeof it === 'string') { if (hit) below(it); return; }
        const h = hit || `${it.label} ${it.detail ?? ''}`.toLowerCase().includes(words);
        for (const x of it.items) visit(x, h);
      };
      for (const g of groups ?? []) visit(g, false);
    }
    return keep;
  }, [project, words, grouped, groups, children]);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close); };
  }, [ctx]);

  if (hidden) {
    return (
      <aside className="tree closed" data-doc-id="panel-tree">
        <button className="icon-btn" onClick={() => setHidden(false)} title="Show the panel tree"><PanelLeftOpen size={16} /></button>
      </aside>
    );
  }

  const allIds = project.boards.map((b) => b.id);
  const toggle = (id: string) => setCollapsed(collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]);
  const byId = grouped ? new Map(project.boards.map((b) => [b.id, b])) : undefined;
  const sldPage = view === 'design';
  // The main board of a shown transformer or authority supply (by substation).
  const partBoard = grouped && shownPart && /^(tx|supply):/.test(shownPart) ? shownPart.slice(shownPart.indexOf(':') + 1) : undefined;

  const sel = activeId && project.boards.some((b) => b.id === activeId) ? activeId : undefined;
  const ind = sel ? indentTarget(project, sel) : undefined;
  const out = sel ? outdentTarget(project, sel) : undefined;
  const sib = sel ? siblings(project, sel) : [];
  const at = sib.findIndex((x) => x.id === sel);
  const onKey = (e: React.KeyboardEvent) => {
    if (!sel || !menu.onMove || (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'Tab') { e.preventDefault(); const t = e.shiftKey ? out : ind; if (t) menu.onMove(sel, t); }
    else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); menu.onReorder?.(sel, e.key === 'ArrowUp' ? -1 : 1); }
  };

  const node = (b: Board, depth: number): JSX.Element | null => {
    if (shown && !shown.has(b.id)) return null;
    const kids = children.get(b.id) ?? [];
    const open = !!shown || !collapsed.includes(b.id);
    const i = info.get(b.id);
    const over = drag?.over === b.id;
    const cls = ['tree-row', highlighted.has(b.id) ? 'batch-new' : '', b.id === activeId ? 'on' : '', b.id === focusId || b.id === partBoard ? 'focus' : '', b.id === copiedId ? 'copied' : '', drag?.id === b.id ? 'dragging' : '', over ? (drag?.why ? 'drop-no' : 'drop-ok') : ''].join(' ');
    const txTag = tx?.get(b.id);
    const check = incomerOf(project, b.id)?.lengthToCheck;
    return (
      <div key={b.id} role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={b.id === activeId}>
        <div
          className={cls}
          style={{ paddingLeft: 4 + depth * 14 }}
          draggable={!!menu.onMove && !!b.upstreamId}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); onPick(b.id); setDrag({ id: b.id }); }}
          onDragOver={(e) => { if (!drag) return; const why = moveBlocked(project, drag.id, b.id); if (!why) e.preventDefault(); if (drag.over !== b.id) setDrag({ ...drag, over: b.id, why }); }}
          onDragLeave={() => drag?.over === b.id && setDrag({ ...drag, over: undefined, why: undefined })}
          onDrop={(e) => { e.preventDefault(); const d = drag; setDrag(null); if (d && !moveBlocked(project, d.id, b.id)) menu.onMove?.(d.id, b.id); }}
          onDragEnd={() => setDrag(null)}
          onClick={() => onPick(b.id)}
          onDoubleClick={() => onOpen(b.id)}
          onContextMenu={(e) => { e.preventDefault(); onPick(b.id); setCtx({ id: b.id, x: e.clientX, y: e.clientY }); }}
          title={over && drag?.why ? drag.why : `${b.id} — ${b.name}${check ? ' · moved: check the incomer cable length' : ''}${i?.loading !== undefined ? ` · ${fmtFixed(i.loading, 0)} % loaded` : ''}${i?.fails ? ` · ${i.fails} failing` : ''}\nDouble-click: open on the SLD · right-click: more${b.upstreamId ? ' · drag onto another board to supply it from there' : ''}`}
        >
          <button className="tree-tw" onClick={(e) => { e.stopPropagation(); if (kids.length) toggle(b.id); }} tabIndex={-1} aria-hidden>
            {kids.length ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
          </button>
          <span className={`tree-dot ${i?.status ?? ''}`} />
          <span className="tree-id">{b.id}</span>
          {highlighted.has(b.id) && <span className="tree-new">New</span>}
          {!b.upstreamId && b.sourceKva ? (txTag
            // By substation: the transformer's number when the tree is wide enough (CSS), the kVA always; the name keeps its room.
            ? <span className="tree-tx tree-kva" title={`${txTag} · ${b.sourceKva} kVA transformer`}><span className="tree-txn">{txTag} · </span>{b.sourceKva} kVA</span>
            : <span className="tree-tx" title={`${b.sourceKva} kVA transformer`}><Waves size={11} />{b.sourceKva} kVA</span>) : null}
          {b.standby ? <span className="tree-tx" title={`${b.standby.kva} kVA standby generator (ATS)`}><Power size={11} /></span> : null}
          {check ? <span className="tree-check" title="Moved to another source — check the incomer cable length">len?</span> : null}
          <span className="sp" />
          {i?.loading !== undefined && <span className={`tree-load ${i.loadingStatus ?? ''}`} style={{ '--pct': `${Math.min(100, Math.max(0, i.loading))}%` } as CSSProperties}>{fmtFixed(i.loading, 0)}%</span>}
        </div>
        {open && kids.length > 0 && <div role="group">{kids.map((k) => node(k, depth + 1))}</div>}
      </div>
    );
  };

  // By substation: a substation, RMU, "No substation" or "Authority supply" row over its RMUs and main boards. On the
  // SLD page a click on a substation or RMU shows it there; elsewhere a click opens or closes the row and a
  // double-click shows it on the SLD.
  const item = (it: TreeItem, depth: number): JSX.Element | null => {
    if (typeof it !== 'string') return groupRow(it, depth);
    const b = byId?.get(it);
    return b ? node(b, depth) : null;
  };
  const groupRow = (g: TreeGroup, depth: number): JSX.Element | null => {
    const k = `g:${g.key}`;
    const open = !!shown || !collapsed.includes(k);
    const items = open ? g.items.map((x) => item(x, depth + 1)) : [];
    if (shown && !items.some(Boolean)) return null;
    const show = g.part && onShowPart ? () => onShowPart(g.part!) : undefined;
    return (
      <div key={k} role="treeitem" aria-expanded={open}>
        <div
          className={['tree-row tree-grp', depth ? '' : 'tree-grp0', g.part && g.part === shownPart ? 'focus' : ''].join(' ')}
          style={{ paddingLeft: 4 + depth * 14 }}
          onClick={() => (sldPage && show ? show() : toggle(k))}
          onDoubleClick={() => { if (!sldPage) show?.(); }}
          title={`${g.title}${show ? `\n${sldPage ? 'Click' : 'Double-click'}: show it on the SLD` : ''}`}
        >
          <button className="tree-tw" onClick={(e) => { e.stopPropagation(); toggle(k); }} tabIndex={-1} aria-hidden>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <span className="tree-id">{g.label}</span>
          {g.detail && <span className="m">{g.detail}</span>}
          <span className="sp" />
          {g.note && <span className="m">{g.note}</span>}
        </div>
        {open && <div role="group">{items}</div>}
      </div>
    );
  };

  const startResize = (e: React.PointerEvent) => {
    const x0 = e.clientX, w0 = width;
    const move = (ev: PointerEvent) => setWidth(Math.max(170, Math.min(460, w0 + ev.clientX - x0)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const act = (fn: (id: string) => void) => () => { const id = ctx!.id; setCtx(null); fn(id); };
  const ctxBoard = ctx ? project.boards.find((b) => b.id === ctx.id) : undefined;

  return (
    <aside className="tree" ref={ref} style={{ width }} aria-label="Panel tree" data-doc-id="panel-tree">
      <div className="tree-head">
        <b>Panels</b><span className="m">{project.boards.length}</span>
        <span className="sp" />
        <button className="icon-btn" title={activeId ? `Add a board fed from ${activeId}` : 'Add a board'} onClick={() => menu.onAddBoard(activeId ?? roots[0]?.id ?? '')}><Plus size={14} /></button>
        {menu.onMove && <>
          <button className="icon-btn" disabled={!ind} title={ind ? `Indent (Tab): supply ${sel} from ${ind}` : 'Indent (Tab): needs a board above at the same level'} onClick={() => sel && ind && menu.onMove!(sel, ind)}><IndentIncrease size={14} /></button>
          <button className="icon-btn" disabled={!out} title={out ? `Outdent (Shift+Tab): supply ${sel} from ${out}` : 'Outdent (Shift+Tab): already one level below the main board'} onClick={() => sel && out && menu.onMove!(sel, out)}><IndentDecrease size={14} /></button>
          <button className="icon-btn" disabled={at <= 0} title="Move up (Alt+↑)" onClick={() => sel && menu.onReorder?.(sel, -1)}><ArrowUp size={14} /></button>
          <button className="icon-btn" disabled={at < 0 || at >= sib.length - 1} title="Move down (Alt+↓)" onClick={() => sel && menu.onReorder?.(sel, 1)}><ArrowDown size={14} /></button>
        </>}
        <button className="icon-btn" title="Collapse all" onClick={() => setCollapsed([...allIds.filter((id) => children.get(id)?.length), ...gIndex.keys])}><ChevronsDownUp size={14} /></button>
        <button className="icon-btn" title="Expand all" onClick={() => setCollapsed([])}><ChevronsUpDown size={14} /></button>
        <button className="icon-btn" title="Hide the panel tree" onClick={() => setHidden(true)}><PanelLeftClose size={14} /></button>
      </div>
      {groupable && (
        <div className="tree-groupby">
          <span className="m">Group</span>
          <div className="seg" role="group" aria-label="Group the panel tree">
            <button className={grouped ? '' : 'on'} aria-pressed={!grouped} title="The boards as they are fed: main board → SMDB → DB" onClick={() => setGrouping('boards')}>Boards</button>
            <button className={grouped ? 'on' : ''} aria-pressed={grouped} disabled={!groups} title={groups ? 'By substation, then RMU, then main board' : 'Name the substations or RMUs of the main boards first (Panels → Transformers)'} onClick={() => setGrouping('substations')}>Substations</button>
          </div>
        </div>
      )}
      <input className="tree-search" type="search" placeholder="Find a board…" value={q} onChange={(e) => setQ(e.target.value)} />
      {highlighted.size > 0 && <div className="tree-batch">{highlighted.size} new panels<span className="sp" />{onClearHighlights && <button className="chip" onClick={onClearHighlights}>Clear</button>}</div>}
      <div className={`tree-body${grouped ? ' by-ss' : ''}`} role="tree" tabIndex={0} onKeyDown={onKey} aria-label="Panels — Tab / Shift+Tab to indent or outdent, Alt+↑↓ to reorder">
        {grouped ? groups!.map((g) => item(g, 0)) : roots.map((b) => node(b, 0))}
        {shown && shown.size === 0 && <p className="m tree-tip">No board matches.</p>}
      </div>
      {keyOpen && (
        <dl className="tree-key" aria-label="What the colours mean">
          <div><dt><span className="tree-dot ok" /><span className="tree-dot warn" /><span className="tree-dot bad" /></dt><dd>Its circuits' checks: all pass · some to check · some fail (grey: no results)</dd></div>
          <div><dt><span className="tree-load" style={{ '--pct': '60%' } as CSSProperties}>60%</span></dt><dd>Loading: demand current ÷ board rating — amber over 80 %, red over 100 %</dd></div>
          <div><dt><span className="tree-tx"><Waves size={11} />kVA</span></dt><dd>Fed from a transformer</dd></div>
          <div><dt><span className="tree-tx"><Power size={11} /></span></dt><dd>Has a standby generator (ATS)</dd></div>
          <div><dt><span className="tree-check">len?</span></dt><dd>Moved to another source — check the incomer cable length</dd></div>
        </dl>
      )}
      <div className="tree-foot">
        <p className="m tree-tip">{grouped && sldPage && onShowPart ? 'Click a board to select it, a substation or RMU to show it on the SLD' : TREE_HINT[view] ?? 'Double-click a board to open it on the SLD'}</p>
        <button className={`linkish tree-key-btn${keyOpen ? ' on' : ''}`} aria-expanded={keyOpen} title="What the dots, bars and badges mean"
          onClick={() => setKeyOpen((o) => { try { localStorage.setItem('lvds.treeKey', o ? '0' : '1'); } catch { /* ignore */ } return !o; })}>
          <Info size={12} /> Key
        </button>
      </div>
      <div className="tree-resize" onPointerDown={startResize} onDoubleClick={() => setWidth(230)} title="Drag to resize" />
      {ctx && ctxBoard && (
        <div className="tree-menu" role="menu" style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()}>
          <div className="tree-menu-h">{ctxBoard.id} <span className="m">{ctxBoard.name}</span></div>
          <button role="menuitem" onClick={act(onOpen)}>Open on the SLD</button>
          <button role="menuitem" onClick={act(menu.onProperties)}>Properties…</button>
          <button role="menuitem" onClick={act(menu.onSchedule)}>Load schedule</button>
          <hr />
          <button role="menuitem" onClick={act(menu.onAddFeeder)}>Add feeder / load…</button>
          <button role="menuitem" onClick={act(menu.onAddBoard)}>Add sub-board…</button>
          <hr />
          {menu.onMove && ctxBoard.upstreamId && <button role="menuitem" onClick={act((id) => { setMoveFor(id); setMoveQ(''); })}>Move under…</button>}
          {menu.onLengthChecked && incomerOf(project, ctxBoard.id)?.lengthToCheck && <button role="menuitem" onClick={act(menu.onLengthChecked)}>Incomer length checked</button>}
          <button role="menuitem" onClick={act(menu.onCopy)}>Copy with everything below</button>
          {menu.onCableType && (
            <label className="tree-menu-field">Outgoing cable type
              <select value="" onChange={(e) => { const t = e.target.value; if (t) act((id) => menu.onCableType!(id, t))(); }}>
                <option value="">Choose…</option>
                <option value="auto">Automatic (fire-rated for life safety)</option>
                {(menu.cableTypes ?? []).map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
          )}
          {menu.onPaste && copiedId && copiedId !== ctxBoard.id && <button role="menuitem" onClick={act(menu.onPaste)}>Paste {copiedId} here</button>}
          <button role="menuitem" className="bad" onClick={act(menu.onDelete)}>Delete…</button>
        </div>
      )}
      {moveFor && (
        <div className="tree-move" role="dialog" aria-label={`Move ${moveFor} under`} onMouseDown={(e) => e.stopPropagation()}>
          <div className="tree-menu-h">Supply {moveFor} from… <span className="sp" /><button className="icon-btn" title="Close" aria-label="Close" onClick={() => setMoveFor(null)}><X size={14} aria-hidden /></button></div>
          <input autoFocus type="search" placeholder="Find a board…" value={moveQ} onChange={(e) => setMoveQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setMoveFor(null)} />
          <div className="tree-move-list">
            {project.boards.filter((t) => `${t.id} ${t.name}`.toLowerCase().includes(moveQ.trim().toLowerCase())).map((t) => {
              const why = moveBlocked(project, moveFor, t.id);
              return <button key={t.id} disabled={!!why} title={why ?? `Supply ${moveFor} from ${t.id}`} onClick={() => { const id = moveFor; setMoveFor(null); menu.onMove!(id, t.id); }}><b>{t.id}</b> <span className="m">{why ? (why.includes('already') ? 'current source' : why.includes('loop') ? 'below it' : '') : t.name !== t.id ? t.name : ''}</span></button>;
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
