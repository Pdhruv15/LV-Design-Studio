import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** The Excel-style ribbon a page carries under the main tab row (Specification; Sheets has the same look): tabs,
 * groups with a caption, large tools, small labelled tools in two rows, and icon-only tools. Spacing as the
 * approved mockup: 12 px inside a tool, 20 px each side of a group divider. Styles are scoped by the `prb-` prefix
 * and use the theme's colour variables. */

export const LATER = 'Comes in a later stage';
export const RIBBON_CSS = `
.prb { border: 1px solid var(--line); border-radius: 9px; background: var(--panel); overflow: hidden; }
.prb-tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--line); padding: 0 12px; }
.prb-tab { height: 40px; padding: 0 20px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--mut); font: inherit; cursor: pointer; }
.prb-tab[aria-selected="true"] { color: var(--tx); font-weight: 600; border-bottom-color: var(--acc); }
.prb-tab:disabled { opacity: 0.5; cursor: default; }
.prb-body { display: flex; padding: 14px 0 10px; overflow-x: auto; }
.prb-group { display: flex; flex-direction: column; justify-content: space-between; gap: 8px; padding: 0 20px; border-right: 1px solid var(--line); flex: none; }
.prb-group:last-child { border-right: 0; }
.prb-tools { display: flex; gap: 12px; align-items: center; min-height: 88px; }
.prb-name { font-size: 11px; color: var(--mut); text-align: center; }
.prb-big { box-sizing: border-box; width: 88px; height: 88px; padding: 10px 8px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--tx); font: inherit; font-size: 12px; line-height: 1.25; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
.prb-col { display: grid; grid-template-rows: 40px 40px; grid-auto-flow: column; gap: 8px 4px; }
.prb-sm { box-sizing: border-box; height: 40px; padding: 0 12px; border-radius: 6px; border: 0; background: transparent; color: var(--tx); font: inherit; font-size: 12.5px; white-space: nowrap; display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer; }
.prb-icons { display: grid; grid-template-columns: repeat(3, 40px); gap: 8px; }
.prb-ic { box-sizing: border-box; width: 40px; height: 40px; padding: 0; border-radius: 6px; border: 1px solid var(--line); background: var(--p2); color: var(--tx); display: flex; align-items: center; justify-content: center; cursor: pointer; }
.prb-big:hover:not(:disabled), .prb-sm:hover:not(:disabled), .prb-ic:hover:not(:disabled) { background: var(--p2); border-color: var(--line-strong); }
.prb-ic[aria-pressed="true"], .prb-sm[aria-pressed="true"] { outline: 1px solid var(--acc); }
.prb-big:disabled, .prb-sm:disabled, .prb-ic:disabled { opacity: 0.45; cursor: default; }
.prb-big svg, .prb-sm svg, .prb-ic svg { color: var(--acc); flex: none; }
`;

/** The ribbon: its tabs (a tab with no content yet is shown greyed) and the tools of the one that is open. */
export function PageRibbon<T extends string>({ label, tabs, tab, onTab, children }: { label: string; tabs: { id: T | null; name: string }[]; tab: T; onTab: (t: T) => void; children: ReactNode }) {
  return (
    <div className="prb">
      <div className="prb-tabs" role="tablist" aria-label={label}>
        {tabs.map((t) => (t.id === null
          ? <button key={t.name} type="button" role="tab" className="prb-tab" aria-selected={false} disabled title={LATER}>{t.name}</button>
          : <button key={t.name} type="button" role="tab" className="prb-tab" aria-selected={tab === t.id} onClick={() => onTab(t.id!)}>{t.name}</button>))}
      </div>
      <div className="prb-body">{children}</div>
    </div>
  );
}
export function Group({ name, children }: { name: string; children: ReactNode }) {
  return <div className="prb-group" role="group" aria-label={name}><div className="prb-tools">{children}</div><span className="prb-name">{name}</span></div>;
}
export const Rows = ({ children }: { children: ReactNode }) => <div className="prb-col">{children}</div>;
export const Icons = ({ children }: { children: ReactNode }) => <div className="prb-icons">{children}</div>;
export function Big({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean }) {
  return <button type="button" className="prb-big" onClick={onClick} disabled={disabled || !onClick} title={onClick ? label : LATER}><Icon size={26} aria-hidden /><span>{label}</span></button>;
}
export function Small({ icon: Icon, label, onClick, disabled, pressed }: { icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; pressed?: boolean }) {
  return <button type="button" className="prb-sm" onClick={onClick} disabled={disabled || !onClick} aria-pressed={pressed} title={onClick ? label : LATER}><Icon size={18} aria-hidden /><span>{label}</span></button>;
}
export function IconTool({ icon: Icon, label, onClick, pressed }: { icon: LucideIcon; label: string; onClick?: () => void; pressed?: boolean }) {
  return <button type="button" className="prb-ic" onClick={onClick} disabled={!onClick} aria-label={label} aria-pressed={pressed} title={onClick ? label : `${label} — ${LATER.toLowerCase()}`}><Icon size={18} aria-hidden /></button>;
}
