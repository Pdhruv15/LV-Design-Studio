import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** A toolbar button that opens a small panel (menu items, ticks, selects).
 * Closes on a click outside or Escape. With `open` and `onOpen` the caller holds the state (to open it from a key). */
export default function MenuButton({ label, title, active, children, align = 'left', open: held, onOpen }: { label: React.ReactNode; title?: string; active?: boolean; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right'; open?: boolean; onOpen?: (open: boolean) => void }) {
  const [own, setOwn] = useState(false);
  const open = held ?? own, setOpen = onOpen ?? setOwn;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, setOpen]);
  return (
    <div className="menu-btn" ref={ref}>
      <button className={`chip${active ? ' on' : ''}`} title={title} aria-expanded={open} onClick={() => setOpen(!open)}>{label} <ChevronDown size={14} strokeWidth={1.8} aria-hidden /></button>
      {open && <div className={`menu-pop ${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
