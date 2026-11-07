import { useEffect, useRef, useState } from 'react';
import { colourIndex, colourLabel, INDEX_COLOURS, indexColour, NAMED_COLOURS, parseColour, colourCss } from '../../model/cadColours';

/** A colour cell: the swatch and name; a click opens the picker under it. The picker offers the blank choice (ByLayer,
 * or "As drawn" for the architect's layers), the named colours, index colours 1–9, 10–249 and the greys 250–255, and a
 * box for a number (1–255) or a true colour (#rrggbb or r,g,b). */
export function ColourPicker({ label, value, blank = 'ByLayer', varies, onChange }: { label: string; value: string | undefined; blank?: string; varies?: boolean; onChange: (c: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const set = (c: string | undefined) => { onChange(c); setOpen(false); setTyped(''); };
  const sw = (c: string | undefined) => colourCss(c);
  const cell = (n: number) => (
    <button key={n} type="button" className={`cad-colour-cell${colourIndex(value) === n ? ' on' : ''}`} style={{ background: INDEX_COLOURS[n] }} title={colourLabel(indexColour(n))} aria-label={`Colour ${n}`} onClick={() => set(indexColour(n))} />
  );
  const parsed = parseColour(typed);
  // 10–249 as a grid: one column per hue (24), one row per shade (10).
  const grid = Array.from({ length: 10 }, (_, row) => Array.from({ length: 24 }, (_, col) => 10 + col * 10 + row));
  return (
    <span className="cad-colour" ref={box}>
      <button type="button" className="cad-colour-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>
        <i style={{ background: sw(value) ?? 'transparent' }} className={sw(value) ? undefined : 'none'} />{varies ? 'varies' : colourLabel(value, blank)}
      </button>
      {open && (
        <div className="cad-colour-pop" role="dialog" aria-label={`${label} picker`} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          <div className="cad-colour-row">
            <button type="button" className="chip" onClick={() => set(undefined)}>{blank}</button>
            {NAMED_COLOURS.map((c) => <button key={c.id} type="button" className={`cad-colour-cell${value === c.id ? ' on' : ''}`} style={{ background: c.id }} title={c.label} aria-label={c.label} onClick={() => set(c.id)} />)}
          </div>
          <div className="cad-colour-row">{Array.from({ length: 9 }, (_, i) => cell(i + 1))}<span className="sp" />{Array.from({ length: 6 }, (_, i) => cell(250 + i))}</div>
          <div className="cad-colour-grid">{grid.flat().map(cell)}</div>
          <div className="cad-colour-row">
            <input aria-label={`${label} number or RGB`} placeholder="Index 1–255, #rrggbb or r,g,b" value={typed} onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && parsed) { e.preventDefault(); set(parsed); } }} />
            <input type="color" aria-label={`${label} true colour`} value={sw(value) && !colourIndex(value) ? sw(value)! : INDEX_COLOURS[7]} onChange={(e) => set(e.target.value)} />
            <button type="button" className="chip primary" disabled={!parsed} onClick={() => parsed && set(parsed)}>OK</button>
          </div>
          <div className="m">{parsed ? colourLabel(parsed) : typed ? 'Not a colour' : colourLabel(value, blank)}</div>
        </div>
      )}
    </span>
  );
}
