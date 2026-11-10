import { useEffect, useRef, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { NOTE_ATTACHES, type NoteAttach, type NotePara, type NoteRun } from '../../model/cadMtext';

/** The editor over a note's box (MTEXT, a double-click on a note; S6 of the Design CAD 2D gap plan): the words typed
 * in the box at its place, size and angle on the screen, a small bar above it with B, U, the height on paper, the
 * justification and OK. Enter starts a new line; Ctrl / ⌘+Enter or OK keeps the words, Esc leaves the note as it
 * was, a click outside keeps them too. The grip at the right edge drags the box's width. The words are kept as
 * paragraphs of plain, bold and underlined runs: what is typed is read back from the box, never kept as HTML. */
export default function CadNoteEdit({ left, top, w, h, lineH, rot, note, heightMm, attach, unitsPerPx, onHeightMm, onAttach, onWidth, onCommit, onCancel }: {
  /** The top left corner of the box on the screen (px), its width, the letters' height and the line height there, and
   * its angle (radians, anticlockwise). */
  left: number;
  top: number;
  w: number;
  h: number;
  lineH: number;
  rot: number;
  /** The words when the editor opens (it keeps them itself from then on). */
  note: NotePara[];
  heightMm: number;
  attach: NoteAttach;
  /** Drawing units per screen pixel, for the width dragged. */
  unitsPerPx: number;
  onHeightMm: (mm: number) => void;
  onAttach: (j: NoteAttach) => void;
  onWidth: (w: number) => void;
  onCommit: (note: NotePara[]) => void;
  onCancel: () => void;
}) {
  const root = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const end = (commit: boolean) => { if (done.current) return; done.current = true; if (commit) onCommit(box.current ? parasFromDom(box.current) : []); else onCancel(); };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    fillDom(el, note);
    el.focus();
    // The caret at the end of the words.
    const sel = window.getSelection?.();
    if (sel && el.lastChild) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the words are read once; the box keeps them after
  // A click outside the editor keeps the words.
  useEffect(() => {
    const down = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) end(true); };
    window.addEventListener('mousedown', down, true);
    return () => window.removeEventListener('mousedown', down, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    // The page's keys (Esc cancels the tool, letters go to the command line) are not for this box.
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); end(false); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); end(true); }
  };
  /** B and U: the selection's look toggled in the box (the box keeps the focus). */
  const look = (cmd: 'bold' | 'underline') => (e: ReactMouseEvent) => {
    e.preventDefault();
    box.current?.focus();
    if (typeof document.execCommand === 'function') document.execCommand(cmd);
  };
  /** The grip dragged: the width follows the mouse along the box's top edge. */
  const grip = (e: ReactMouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, y0 = e.clientY, w0 = w, ux = Math.cos(rot), uy = -Math.sin(rot);
    const move = (m: MouseEvent) => onWidth(Math.max(2 * h, w0 + (m.clientX - x0) * ux + (m.clientY - y0) * uy) * unitsPerPx);
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  const px = Math.max(8, Math.min(h, 200)), lh = Math.max(px, Math.min(lineH, 340));
  return (
    <div ref={root} className="cad-ntedit" style={{ left, top, width: Math.max(w, px * 2), transform: `rotate(${-rot}rad)` }} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="cad-ntedit-bar" role="toolbar" aria-label="Note">
        <button type="button" className="b" aria-label="Bold" title="Bold (Ctrl/⌘+B)" onMouseDown={look('bold')}>B</button>
        <button type="button" className="u" aria-label="Underline" title="Underline (Ctrl/⌘+U)" onMouseDown={look('underline')}>U</button>
        <input aria-label="Height (mm on paper)" title="Height on paper (mm)" type="number" step="0.5" min="1" value={heightMm} onChange={(e) => { const n = Number(e.target.value); if (n > 0) onHeightMm(n); }} />
        <select aria-label="Justify" title="Where the note's anchor sits on its box" value={attach} onChange={(e) => onAttach(e.target.value as NoteAttach)}>
          {NOTE_ATTACHES.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
        </select>
        <button type="button" className="ok" title="Keep the words (Ctrl/⌘+Enter); Esc leaves the note as it was" onClick={() => end(true)}>OK</button>
      </div>
      <div ref={box} className="cad-ntedit-box" role="textbox" aria-multiline="true" aria-label="Note text" contentEditable suppressContentEditableWarning spellCheck={false}
        style={{ minWidth: Math.max(w, px * 2), fontSize: px, lineHeight: `${lh}px` }} onKeyDown={key} />
      <div className="cad-ntedit-grip" role="separator" aria-label="Width" aria-orientation="vertical" onMouseDown={grip} />
    </div>
  );
}

/** The paragraphs put into the box: a block per paragraph, its runs as text in <b> and <u> (an empty one holds a line break). */
export function fillDom(el: HTMLElement, note: NotePara[]) {
  el.replaceChildren();
  for (const p of note) {
    const div = document.createElement('div');
    for (const r of p.runs) {
      let node: Node = document.createTextNode(r.s);
      if (r.u) { const u = document.createElement('u'); u.appendChild(node); node = u; }
      if (r.b) { const b = document.createElement('b'); b.appendChild(node); node = b; }
      div.appendChild(node);
    }
    if (!p.runs.length) div.appendChild(document.createElement('br'));
    el.appendChild(div);
  }
}

/** The paragraphs read back from the box: each block (what Enter makes) a paragraph, a line break inside one too; the
 * words bold or underlined by the tags or styles round them. Runs of one look are joined. */
export function parasFromDom(el: HTMLElement): NotePara[] {
  const paras: NotePara[] = [];
  let runs: NoteRun[] = [], open = false;
  const endPara = () => { paras.push({ runs: joinRuns(runs) }); runs = []; open = false; };
  const inline = (n: Node, b: boolean, u: boolean, lastBr: boolean) => {
    if (n.nodeType === Node.TEXT_NODE) { const s = (n.textContent ?? '').replace(/\u00a0/g, ' '); if (s) { runs.push({ s, ...(b ? { b: true } : {}), ...(u ? { u: true } : {}) }); open = true; } return; }
    if (!(n instanceof HTMLElement)) return;
    if (n.tagName === 'BR') { if (!lastBr) endPara(); return; }
    const nb = b || n.tagName === 'B' || n.tagName === 'STRONG' || /^(bold|[6-9]00)$/.test(n.style.fontWeight);
    const nu = u || n.tagName === 'U' || /underline/.test(n.style.textDecoration);
    const kids = [...n.childNodes];
    kids.forEach((k, i) => inline(k, nb, nu, lastBr && i === kids.length - 1));
  };
  const kids = [...el.childNodes];
  kids.forEach((k, i) => {
    const block = k instanceof HTMLElement && (k.tagName === 'DIV' || k.tagName === 'P');
    if (block) {
      if (open) endPara();
      const inner = [...k.childNodes];
      inner.forEach((c, j) => inline(c, false, false, j === inner.length - 1 && inner.length > 1));
      endPara();
    } else inline(k, false, false, i === kids.length - 1 && kids.length > 1);
  });
  if (open) endPara();
  // Nothing in the box: one empty paragraph. A last empty block Enter leaves is dropped.
  while (paras.length > 1 && !paras[paras.length - 1].runs.length) paras.pop();
  return paras.length ? paras : [{ runs: [] }];
}
const joinRuns = (runs: NoteRun[]): NoteRun[] => runs.reduce<NoteRun[]>((out, r) => {
  const last = out[out.length - 1];
  if (last && !!last.b === !!r.b && !!last.u === !!r.u) last.s += r.s; else out.push({ ...r });
  return out;
}, []);
