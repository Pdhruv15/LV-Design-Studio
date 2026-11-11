import { useEffect, useRef, useState, type KeyboardEvent, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'children'> & {
  value: number;
  options: number[];
  onPick: (v: number) => void;
  /** Chips per row. */
  cols?: number;
};

const CHIP_W = 44;
const CHIP_H = 26;

/** A table select whose list opens as a compact grid of chips under the cell
 * (above it only when there is no room below), instead of the tall system
 * list. The select itself stays the cell, so typing a value, copy, paste and
 * fill-down work as before. */
export default function GridSelect({ value, options, onPick, cols = 4, onKeyDown, ...rest }: Props) {
  const sel = useRef<HTMLSelectElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  const close = (refocus: boolean) => {
    setAt(null);
    if (refocus) sel.current?.focus();
  };
  const open = () => {
    const el = sel.current;
    if (!el || el.disabled) return;
    const r = el.getBoundingClientRect();
    const h = Math.ceil(options.length / cols) * (CHIP_H + 2) + 10;
    const w = Math.min(cols, options.length) * (CHIP_W + 2) + 10;
    const left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4));
    const below = window.innerHeight - r.bottom;
    setAt(below < h && r.top > below ? { left, bottom: window.innerHeight - r.top + 2 } : { left, top: r.bottom + 2 });
  };
  const pick = (v: number) => {
    close(true);
    if (v !== value) onPick(v);
  };

  // Focus the current rating when the grid opens.
  useEffect(() => {
    if (!at) return;
    const chips = [...(pop.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    (chips.find((b) => b.classList.contains('on')) ?? chips[0])?.focus();
  }, [at]);

  // Close on a press outside, a scroll of the table or page, or a resize.
  useEffect(() => {
    if (!at) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !sel.current?.contains(t)) close(false);
    };
    const away = (e: Event) => { if (!pop.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', outside, true);
    window.addEventListener('scroll', away, true);
    window.addEventListener('resize', away);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      window.removeEventListener('scroll', away, true);
      window.removeEventListener('resize', away);
    };
  }, [at]);

  const chipKey = (e: KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const chips = [...(pop.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = chips.indexOf(document.activeElement as HTMLButtonElement);
    const go = (j: number) => { e.preventDefault(); chips[Math.max(0, Math.min(chips.length - 1, j))]?.focus(); };
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(true);
    else if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'ArrowDown') go(i + cols);
    else if (e.key === 'ArrowUp') go(i - cols);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(chips.length - 1);
  };

  return (
    <>
      <select
        {...rest}
        ref={sel}
        value={value}
        aria-haspopup="listbox"
        aria-expanded={!!at}
        onChange={(e) => onPick(+e.target.value)}
        // Keep the system list shut; the grid opens on click instead.
        onMouseDown={(e) => { if (e.button === 0 && !e.shiftKey) { e.preventDefault(); sel.current?.focus(); } }}
        onClick={(e) => { if (e.button !== 0 || e.shiftKey) return; if (at) close(true); else open(); }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented) return;
          const k = e.key;
          if (k === ' ' || k === 'F4' || ((k === 'ArrowDown' || k === 'ArrowUp') && !e.shiftKey)) { e.preventDefault(); open(); }
        }}
      >
        {options.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      {at && createPortal(
        <div
          ref={pop}
          className="grid-pick"
          role="listbox"
          aria-label={rest['aria-label']}
          style={{ ...at, gridTemplateColumns: `repeat(${Math.min(cols, options.length)}, ${CHIP_W}px)` }}
          onKeyDown={chipKey}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {options.map((a) => (
            <button key={a} type="button" role="option" aria-selected={a === value} className={a === value ? 'on' : undefined} onClick={() => pick(a)}>{a}</button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
