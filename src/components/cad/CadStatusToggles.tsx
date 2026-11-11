import { useEffect, useState, type ReactNode } from 'react';
import { Settings } from 'lucide-react';
import type { CadToggles } from './CadCanvas';
import type { DraftTab } from './cadState';
import { OSNAP_BITS, OSNAP_MODES, POLAR_INCREMENTS, type DraftSettings } from '../../model/cadDraft';
import { DynIcon, FitIcon, GridIcon, LwtIcon, OrthoIcon, OsnapIcon, OtrackIcon, PolarIcon, SnapIcon } from '../icons/cadStatusIcons';

/** The drafting switches on the Design CAD status bar, as icons in groups: drawing aids (grid, snap), direction
 * (ortho, polar), object snap (osnap, tracking), input and display (dyn, lineweights), view (fit, settings).
 * Object snap and polar have a ▾ for their modes and angle; right-click opens each one's Drafting settings tab. */

type K = keyof CadToggles;
const SWITCHES: { k: K; label: string; name: string; key: string; tab: DraftTab; icon: (dots: boolean) => ReactNode }[][] = [
  [{ k: 'grid', label: 'GRID', name: 'Grid', key: 'F7', tab: 'snap', icon: (dots) => <GridIcon dots={dots} /> },
    { k: 'snap', label: 'SNAP', name: 'Snap', key: 'F9', tab: 'snap', icon: () => <SnapIcon /> }],
  [{ k: 'ortho', label: 'ORTHO', name: 'Ortho', key: 'F8', tab: 'polar', icon: () => <OrthoIcon /> },
    { k: 'polar', label: 'POLAR', name: 'Polar tracking', key: 'F10', tab: 'polar', icon: () => <PolarIcon /> }],
  [{ k: 'osnap', label: 'OSNAP', name: 'Object snap', key: 'F3', tab: 'osnap', icon: () => <OsnapIcon /> },
    { k: 'otrack', label: 'OTRACK', name: 'Object snap tracking', key: 'F11', tab: 'polar', icon: () => <OtrackIcon /> }],
  [{ k: 'dyn', label: 'DYN', name: 'Dynamic input', key: 'F12', tab: 'dyn', icon: () => <DynIcon /> },
    { k: 'lwt', label: 'LWT', name: 'Show lineweights', key: 'LWT', tab: 'cursor', icon: () => <LwtIcon /> }]
];
/** The switches with a ▾ menu. */
type MenuK = 'osnap' | 'polar';
const HAS_MENU: K[] = ['osnap', 'polar'];
const ALL_OSNAP = OSNAP_MODES.reduce((a, m) => a | OSNAP_BITS[m.k], 0);

export function CadStatusToggles({ toggles, gridDots, draft, canFit, onToggle, onCycleGrid, onSettings, onFit, onDraft }: {
  toggles: CadToggles;
  gridDots: boolean;
  draft: DraftSettings;
  canFit: boolean;
  onToggle: (k: K) => void;
  onCycleGrid: () => void;
  onSettings: (tab: DraftTab) => void;
  onFit: () => void;
  /** Saves changed drafting settings (the running snaps, the polar increment); absent = the menus are read-only. */
  onDraft?: (d: DraftSettings) => void;
}) {
  const [menu, setMenu] = useState<{ k: MenuK; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return undefined;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); } };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [menu]);
  const on = (k: K) => (k === 'lwt' ? toggles.lwt !== false : !!toggles[k]);
  /** A mode or angle picked turns its switch on, as choosing one means wanting it. */
  const set = (k: MenuK, d: DraftSettings) => { onDraft?.(d); if (!on(k)) onToggle(k); };
  const tip = (s: (typeof SWITCHES)[number][number]) => s.k === 'grid' ? `Grid: ${!toggles.grid ? 'off' : gridDots ? 'dots' : 'lines'} (${s.key}: lines, dots, off) — right-click for its settings`
    : s.k === 'lwt' ? 'Show lineweights (LWT) — right-click for its settings' : `${s.label} (${s.key}) — ${s.name}: ${on(s.k) ? 'on' : 'off'} — right-click for its settings`;
  const open = (k: MenuK, el: HTMLElement) => { const r = el.getBoundingClientRect(); setMenu(menu?.k === k ? null : { k, x: r.left, y: r.top }); };
  return (
    <>
      {SWITCHES.map((group, gi) => (
        <span key={gi} className="cad-tgg">
          {group.map((s) => (
            <span key={s.k} className="cad-tgw">
              <button className={`cad-tg cad-tgi${on(s.k) ? ' on' : ''}`} aria-pressed={on(s.k)} aria-label={s.label} title={tip(s)}
                onClick={() => (s.k === 'grid' ? onCycleGrid() : onToggle(s.k))} onContextMenu={(e) => { e.preventDefault(); onSettings(s.tab); }}>
                {s.icon(s.k === 'grid' && gridDots)}
              </button>
              {HAS_MENU.includes(s.k) && (
                <button className={`cad-tgdd${menu?.k === s.k ? ' open' : ''}`} aria-label={`${s.name} options`} aria-haspopup="menu" aria-expanded={menu?.k === s.k}
                  title={s.k === 'osnap' ? 'Running object snaps' : 'Polar tracking angle'} onClick={(e) => open(s.k as MenuK, e.currentTarget)}>▾</button>
              )}
            </span>
          ))}
        </span>
      ))}
      <span className="cad-tgg">
        <button className="cad-tg cad-tgi" aria-label="FIT" title="Fit the drawing to the window (FIT / ZE, or double-click the middle button)" disabled={!canFit} onClick={onFit}><FitIcon /></button>
        <button className="cad-tg cad-tgi" aria-label="Drafting settings" title="Drafting settings (DS): snap, grid, tracking, object snap, dynamic input, selection, cursor, units" onClick={() => onSettings('snap')}><Settings size={16} strokeWidth={1.7} aria-hidden /></button>
      </span>
      {menu && (
        <>
          <div className="st-cover" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="dw-menu st-ctx cad-tab-menu cad-tgmenu up" role="menu" aria-label={menu.k === 'osnap' ? 'Object snap' : 'Polar tracking'}
            style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 236)), top: menu.y - 4 }}>
            {menu.k === 'osnap' ? <>
              <div className="cad-tgmenu-h">Object snap <span className="m">F3</span></div>
              {OSNAP_MODES.map((m, i) => {
                const lit = (draft.osnap & OSNAP_BITS[m.k]) !== 0;
                return (
                  <button key={m.k} role="menuitemcheckbox" aria-checked={lit} autoFocus={i === 0} disabled={!onDraft} className={lit ? 'lit' : ''}
                    onClick={() => set('osnap', { ...draft, osnap: draft.osnap ^ OSNAP_BITS[m.k] })}>
                    <span className="ck">{lit ? '✓' : ''}</span><span className="mk">{m.mark}</span>{m.label}
                  </button>
                );
              })}
              <hr />
              <button role="menuitem" disabled={!onDraft} onClick={() => set('osnap', { ...draft, osnap: draft.osnap | ALL_OSNAP })}><span className="ck" />Select all</button>
              <button role="menuitem" disabled={!onDraft} onClick={() => onDraft?.({ ...draft, osnap: draft.osnap & ~ALL_OSNAP })}><span className="ck" />Clear all</button>
              <button role="menuitem" onClick={() => { setMenu(null); onSettings('osnap'); }}><span className="ck" />Object snap settings…</button>
            </> : <>
              <div className="cad-tgmenu-h">Polar tracking <span className="m">F10</span></div>
              {[...POLAR_INCREMENTS].reverse().map((a, i) => (
                <button key={a} role="menuitemradio" aria-checked={draft.polarInc === a} autoFocus={i === 0} disabled={!onDraft} className={draft.polarInc === a ? 'lit' : ''}
                  onClick={() => { set('polar', { ...draft, polarInc: a }); setMenu(null); }}>
                  <span className="ck">{draft.polarInc === a ? '✓' : ''}</span>{a}°{a >= 30 ? <span className="m">{` ${[2, 3, 4].map((n) => a * n).filter((v) => v <= 360).join(', ')}…`}</span> : null}
                </button>
              ))}
              {draft.polarExtra.length > 0 && <div className="cad-tgmenu-h"><span className="m">Also {draft.polarExtra.map((x) => `${x}°`).join(', ')}</span></div>}
              <hr />
              <button role="menuitem" onClick={() => { setMenu(null); onSettings('polar'); }}><span className="ck" />Tracking settings…</button>
            </>}
          </div>
        </>
      )}
    </>
  );
}
