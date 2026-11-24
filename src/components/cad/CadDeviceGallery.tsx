import { useState } from 'react';
import { LV_PALETTE, PALETTE_GROUPS, type PaletteItem } from '../../model/cadDevices';
import { ELV_PALETTE } from '../../components/elv/elvLabels';
import PlanSymbolIcon from './PlanSymbolIcon';

const ITEMS: PaletteItem[] = [...LV_PALETTE, ...ELV_PALETTE];
const groupOf = (x: PaletteItem) => ('group' in x && x.group) || 'ELV';

/** Add device's gallery (the arrow of Add device): Find, the devices placed last, then the palette's groups as in the
 * side panel. A click chooses the device to place. */
export default function CadDeviceGallery({ device, recent, onPick, onClose }: { device: string; recent: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = ITEMS.filter((x) => x.label.toLowerCase().includes(q));
  const last = q ? [] : recent.map((id) => ITEMS.find((x) => x.id === id)).filter((x): x is PaletteItem => !!x);
  // Enter takes the first device shown: the one placed last, or the first match.
  const first = last[0] ?? shown[0];
  const one = (x: PaletteItem, key: string) => {
    const s = x.symbol, icon = s.plan ?? s.icon;
    return (
      <button type="button" key={key} className={'elv' in x.kind ? 'elv' : 'lv'} aria-pressed={x.id === device} title={x.label} onClick={() => onPick(x.id)}>
        {icon ? <PlanSymbolIcon id={icon} tag={s.tag} /> : s.text || '●'}<span>{x.label}</span>
      </button>
    );
  };
  return (
    <div className="cad-gallery" role="dialog" aria-label="Devices">
      <input type="search" aria-label="Find a device" placeholder="Find a device" autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && first) onPick(first.id); else if (e.key === 'Escape') onClose(); }} />
      <div className="cad-gallery-list">
        {last.length > 0 && <><span className="cad-pal-h">Recent</span>{last.map((x) => one(x, `recent:${x.id}`))}</>}
        {[...PALETTE_GROUPS, 'ELV'].map((name) => {
          const items = shown.filter((x) => groupOf(x) === name);
          return items.length === 0 ? null : <div key={name} style={{ display: 'contents' }}><span className="cad-pal-h">{name}</span>{items.map((x) => one(x, x.id))}</div>;
        })}
        {shown.length === 0 && <span className="cad-pal-h">No device matches</span>}
      </div>
    </div>
  );
}
