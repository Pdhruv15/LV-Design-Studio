import { useMemo, useRef, useState } from 'react';
import { FolderOpen, X } from 'lucide-react';
import { blockThumb, filterBlocks } from '../../model/cadBlockLibrary';
import type { CadBlockDef } from '../../model/cadBlocks';

/** Design CAD → Blocks palette (I / INSERT; S10 of the 2D gap plan), docked beside the drawing like the layer palette:
 * tabs Current drawing (this drawing's blocks, and the architect's), Recent (the blocks inserted lately, kept on this
 * computer) and Library (a folder of DWG / DXF files, each one block); a search box; a grid of black-and-white previews
 * with names; below, how the block goes in: Insertion point (Pick on plan, else X and Y), Scale (uniform), Rotation,
 * Repeat placement, Explode. A click (or a drag onto the drawing) places the block. */

export interface InsertSettings { pick: boolean; x: string; y: string; scale: number; uniform: boolean; rot: number; repeat: boolean; explode: boolean }
export const INSERT_DEFAULTS: InsertSettings = { pick: true, x: '', y: '', scale: 1, uniform: true, rot: 0, repeat: false, explode: false };
export interface LibraryFile { file: string; path?: string; blob?: File }
export type BlocksTab = 'drawing' | 'recent' | 'library';

const TABS: { id: BlocksTab; label: string }[] = [{ id: 'drawing', label: 'Current drawing' }, { id: 'recent', label: 'Recent' }, { id: 'library', label: 'Library' }];

/** A block's small picture, black on white. */
export function BlockThumb({ def, defs }: { def: CadBlockDef; defs: CadBlockDef[] }) {
  const t = useMemo(() => blockThumb(def, defs), [def, defs]);
  return (
    <svg className="cad-bk-thumb" viewBox="0 0 1.3333 1" aria-hidden>
      {t.lines.map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="currentColor" strokeWidth="0.015" />)}
      {t.texts.map((x, i) => <text key={`t${i}`} x={x.at[0]} y={x.at[1]} fontSize={x.h} fill="currentColor" fontFamily="system-ui, sans-serif">{x.s}</text>)}
    </svg>
  );
}

export default function BlocksPalette({ defs, archNames, recent, library, chosen, settings, onSettings, onPick, onPickArch, onLibraryFolder, onLibraryFiles, onLibraryFile, onInsertAt, onClose }: {
  /** The drawing's own blocks, and the names of the architect's (inserted as a copy of what one of them shows). */
  defs: CadBlockDef[];
  archNames: string[];
  recent: CadBlockDef[];
  library: { folder: string | null; files: LibraryFile[] };
  /** The block waiting at the cursor, if any. */
  chosen?: string;
  settings: InsertSettings;
  onSettings: (s: InsertSettings) => void;
  onPick: (def: CadBlockDef) => void;
  onPickArch: (name: string) => void;
  /** Folder… on the desktop (a dialog); on the web the files chosen. */
  onLibraryFolder?: () => void;
  onLibraryFiles: (files: File[]) => void;
  onLibraryFile: (f: LibraryFile) => void;
  /** Insert at the X and Y typed (Pick on plan unticked). */
  onInsertAt: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<BlocksTab>('drawing');
  const [q, setQ] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const set = (p: Partial<InsertSettings>) => onSettings({ ...settings, ...p });
  const own = filterBlocks(defs, q), arch = filterBlocks(archNames.filter((n) => !defs.some((d) => d.name.toLowerCase() === n.toLowerCase())).map((name) => ({ name })), q);
  const rec = filterBlocks(recent, q), files = filterBlocks(library.files.map((f) => ({ ...f, name: f.file })), q);
  const item = (key: string, name: string, title: string, onClick: () => void, thumb: CadBlockDef | undefined, more: CadBlockDef[]) => (
    <button key={key} type="button" className={`cad-bk-item${chosen === name ? ' on' : ''}`} aria-label={name} title={title} draggable onClick={onClick}
      onDragStart={(e) => { e.dataTransfer.setData('text/lvds-block', name); e.dataTransfer.effectAllowed = 'copy'; onClick(); }}>
      {thumb ? <BlockThumb def={thumb} defs={more} /> : <svg className="cad-bk-thumb" viewBox="0 0 1.3333 1" aria-hidden><rect x="0.3" y="0.2" width="0.7333" height="0.6" fill="none" stroke="currentColor" strokeWidth="0.015" /></svg>}
      <span>{name}</span>
    </button>
  );
  const empty = tab === 'drawing' ? (defs.length || archNames.length ? 'No block matches.' : 'No blocks yet: Create one (B) from drawn objects.')
    : tab === 'recent' ? (recent.length ? 'No block matches.' : 'The blocks inserted lately will be listed here.')
    : library.folder ? (library.files.length ? 'No file matches.' : 'No DWG or DXF files in the folder.') : 'Folder… chooses a folder of DWG / DXF files, each one block.';
  const shown = tab === 'drawing' ? own.length + arch.length : tab === 'recent' ? rec.length : files.length;
  return (
    <section className="cad-lpal cad-bkpal" aria-label="Blocks palette">
      <div className="cad-lp-head">Blocks<span className="sp" /><button type="button" aria-label="Close the Blocks palette" title="Close (I)" onClick={onClose}><X size={13} /></button></div>
      <div className="cad-bk-tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <input className="cad-bk-search" aria-label="Search blocks" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      {tab === 'library' && (
        <div className="cad-bk-folder">
          <button type="button" className="chip" onClick={() => (onLibraryFolder ? onLibraryFolder() : fileInput.current?.click())}><FolderOpen size={13} /> Folder…</button>
          <span className="m" title={library.folder ?? ''}>{library.folder ?? 'No folder chosen'}</span>
          <input ref={fileInput} type="file" accept=".dwg,.dxf" multiple hidden aria-label="Block drawing files" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) onLibraryFiles(fs); }} />
        </div>
      )}
      <div className="cad-bk-grid" role="list" aria-label={TABS.find((t) => t.id === tab)!.label}>
        {tab === 'drawing' && own.map((d) => item(`d:${d.name}`, d.name, `${d.name}${d.description ? `: ${d.description}` : ''} — click, then where it goes`, () => onPick(d), d, defs))}
        {tab === 'drawing' && arch.map((a) => item(`a:${a.name}`, a.name, `${a.name}: one of the drawing's own blocks, inserted as a copy of what it shows`, () => onPickArch(a.name), undefined, defs))}
        {tab === 'recent' && rec.map((d) => item(`r:${d.name}`, d.name, `${d.name}: inserted lately — click, then where it goes`, () => onPick(d), d, defs))}
        {tab === 'library' && files.map((f) => item(`l:${f.file}`, f.file, `${f.file}: the whole drawing as one block`, () => onLibraryFile(f), undefined, defs))}
        {!shown && <p className="m cad-bk-empty">{empty}</p>}
      </div>
      <div className="cad-bk-opts">
        <label><input type="checkbox" aria-label="Pick on plan" checked={settings.pick} onChange={(e) => set({ pick: e.target.checked })} /> Pick on plan</label>
        {settings.pick ? <span className="m">Insertion point: click on the plan</span> : (
          <span className="cad-bk-xy">
            <input className="r" aria-label="Insert X" placeholder="X" value={settings.x} onChange={(e) => set({ x: e.target.value })} />
            <input className="r" aria-label="Insert Y" placeholder="Y" value={settings.y} onChange={(e) => set({ y: e.target.value })} />
            <span className="m">m</span>
            <button type="button" className="chip" disabled={!chosen} title={chosen ? `Insert "${chosen}" at X, Y` : 'Choose a block first'} onClick={onInsertAt}>Insert</button>
          </span>
        )}
        <label>Scale <input type="number" aria-label="Insert scale" step="0.1" min="0.01" value={settings.scale} onChange={(e) => { const n = Number(e.target.value); if (n > 0) set({ scale: n }); }} /></label>
        <label title="Blocks scale uniformly in this version"><input type="checkbox" aria-label="Uniform" checked={settings.uniform} disabled /> Uniform</label>
        <label>Rotation <input type="number" aria-label="Insert rotation" step="15" value={settings.rot} onChange={(e) => set({ rot: Number(e.target.value) || 0 })} /> °</label>
        <label><input type="checkbox" aria-label="Repeat placement" checked={settings.repeat} onChange={(e) => set({ repeat: e.target.checked })} /> Repeat placement</label>
        <label><input type="checkbox" aria-label="Explode" checked={settings.explode} onChange={(e) => set({ explode: e.target.checked })} /> Explode</label>
      </div>
      <div className="cad-lp-foot" role="status"><span>{chosen ? `"${chosen}": click where it goes${settings.repeat ? ', again for each one' : ''}; Esc stops` : 'Click a block (or drag it onto the drawing) to insert it'}</span></div>
    </section>
  );
}
