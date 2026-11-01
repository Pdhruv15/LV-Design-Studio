import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { planLevel } from './cadFileMenu';
import type { CadState } from './cadState';
import type { CadView } from '../../engines/cad/cadEngine';
import type { Project } from '../../types';

/** The drawings open in Design CAD, a tab each with its level: a click shows it, × closes it, a right-click has the
 * other ways to close; + opens another. Nothing shows while no drawing is open (the page offers to open one). */
export default function CadTabs({ cad, project, busy, onOpen, onClose }: {
  cad: CadState;
  project: Project;
  busy: boolean;
  onOpen: () => void;
  /** Closes these drawings, or all of them when none are named. */
  onClose: (views?: CadView[]) => void;
}) {
  const [menu, setMenu] = useState<{ view: CadView; x: number; y: number } | null>(null);
  // Esc shuts the menu and nothing else (the page takes Esc to cancel a command).
  useEffect(() => {
    if (!menu) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [menu]);
  const { drawings, view: shown } = cad;
  // The row scrolls when it is full: the tab showing stays in view.
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => { row.current?.querySelector('.cad-tab.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [shown]);
  if (!drawings.length) return null;
  const closeFromMenu = (views?: CadView[]) => { setMenu(null); onClose(views); };
  return (
    <>
      <div ref={row} className="cad-tabs" role="tablist" aria-label="Open drawings">
        {drawings.map((v, i) => {
          const { floor, set } = planLevel(project, v.file);
          return (
            <div key={v.file} className={`cad-tab${v === shown ? ' on' : ''}`} onContextMenu={(e) => { e.preventDefault(); setMenu({ view: v, x: e.clientX, y: e.clientY }); }}>
              <button
                role="tab" aria-selected={v === shown} tabIndex={v === shown ? 0 : -1} className="cad-tab-name" title={`${v.path ?? v.file} — right-click for more`}
                // A mouse click leaves the keys to the drawing (Space pans); the keyboard stays on the tab.
                onClick={(e) => { cad.show(v); if (e.detail) e.currentTarget.blur(); }}
                onKeyDown={(e) => {
                  // Arrow keys move between tabs; Home / End to the first / last.
                  const k = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? drawings.length - 1 : null;
                  if (k === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const to = (k + drawings.length) % drawings.length;
                  cad.show(drawings[to]);
                  (e.currentTarget.closest('.cad-tabs')?.querySelectorAll('[role="tab"]')[to] as HTMLElement | undefined)?.focus();
                }}>
                <span className="m">{floor && set ? floor.name : 'Level?'} · </span>{v.file}
              </button>
              <button className="cad-tab-x" aria-label={`Close ${v.file}`} title="Close this drawing (CLOSE). What you drew stays in the project." onClick={() => onClose([v])}><X size={12} strokeWidth={2} /></button>
            </div>
          );
        })}
        <button className="cad-tab-add" aria-label="Open a drawing" title="Open a drawing (OPEN)" disabled={busy} onClick={(e) => { onOpen(); if (e.detail) e.currentTarget.blur(); }}><Plus size={16} strokeWidth={2} /></button>
      </div>
      {menu && (
        <>
          <div className="st-cover" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="dw-menu st-ctx cad-tab-menu" role="menu" aria-label={`Close ${menu.view.file}`} style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 236)), top: menu.y }}>
            <button role="menuitem" autoFocus onClick={() => closeFromMenu([menu.view])}>Close</button>
            <button role="menuitem" disabled={drawings.length < 2} onClick={() => closeFromMenu(drawings.filter((v) => v !== menu.view))}>Close others</button>
            <button role="menuitem" onClick={() => closeFromMenu()}>Close all</button>
          </div>
        </>
      )}
    </>
  );
}
