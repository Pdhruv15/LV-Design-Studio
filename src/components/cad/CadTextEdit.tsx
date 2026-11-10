import { useEffect, useRef, type KeyboardEvent } from 'react';

/** The box over a text or dimension being typed over (TEXTEDIT, a double-click on it; S5 of the Design CAD 2D gap plan):
 * at the text's place, height and angle on the screen, its text selected. Enter commits, Esc cancels, a click outside
 * (the box losing focus) commits. */
export default function CadTextEdit({ left, top, h, w, rot, value, onChange, onCommit, onCancel }: {
  /** The left end of the text's baseline on the screen (px), the text's height and width there, and its angle (radians,
   * anticlockwise). */
  left: number;
  top: number;
  h: number;
  w: number;
  rot: number;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const end = (commit: boolean) => { if (done.current) return; done.current = true; (commit ? onCommit : onCancel)(); };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    // The page's keys (Esc cancels the tool, letters go to the command line) are not for this box.
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); end(true); }
    else if (e.key === 'Escape') { e.preventDefault(); end(false); }
  };
  const px = Math.max(8, Math.min(h, 200));
  return (
    <input ref={ref} className="cad-edtext" aria-label="Edit text" value={value} autoComplete="off" spellCheck={false}
      style={{ left, top, height: px, width: Math.max(w, px * 2), fontSize: px, transform: `translateY(-100%) rotate(${-rot}rad)` }}
      onChange={(e) => onChange(e.target.value)} onKeyDown={key} onBlur={() => end(true)} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()} />
  );
}
