import { useState } from 'react';
import { CadDialog, Check, Row } from './CadDialogs';
import type { SavedCopy } from './cadState';
import { DWG_VERSIONS, DXF_VERSIONS } from '../../model/cadDraft';

/** The formats Save As offers: DWG or DXF and a version ('' = the drawing's own, for a DWG read in a version). */
export const formatOptions = (own: string): { value: string; label: string }[] => [
  ...(own ? [{ value: `${own.startsWith('DXF') ? 'dxf' : 'dwg'}:`, label: `${own} (the drawing's own)` }] : []),
  ...DWG_VERSIONS.map((v) => ({ value: `dwg:${v}`, label: `DWG ${v}` })),
  ...DXF_VERSIONS.map((v) => ({ value: `dxf:${v}`, label: `DXF ${v}` }))
];

/** Save As (SAVEAS): the file name, the format and version, and what goes in. The architect's drawing is never written:
 * the copy is a new file, and Save writes to it again. */
export default function CadSaveAs({ initial, own, hasRefs, onSave, onClose }: {
  initial: SavedCopy;
  /** The drawing's own format, e.g. "DWG 2018" or "DXF". */
  own: string;
  hasRefs: boolean;
  onSave: (c: SavedCopy) => void;
  onClose: () => void;
}) {
  const [c, setC] = useState<SavedCopy>(initial);
  const base = c.name.replace(/\.(dwg|dxf)$/i, '');
  const value = `${c.as}:${c.version}`;
  const options = formatOptions(own);
  return (
    <CadDialog id="saveas" title="Save As" alias="SAVEAS" okLabel="Save" wide
      help="Save writes to this copy again. The architect's drawing is not changed. What you drew stays in the project either way."
      onOk={() => onSave({ ...c, name: `${base.trim() || 'drawing'}.${c.as}` })} onClose={onClose}>
      <Row label="File name" unit={`.${c.as}`}><input aria-label="File name" autoFocus value={base} onChange={(e) => setC({ ...c, name: `${e.target.value}.${c.as}` })} /></Row>
      <Row label="Format">
        <select aria-label="Format" value={options.some((o) => o.value === value) ? value : options[0].value} onChange={(e) => { const [as, version] = e.target.value.split(':') as ['dwg' | 'dxf', string]; setC({ ...c, as, version }); }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Row>
      <div className="cad-dlg-sec">Include</div>
      <Check label="What you drew (LV-SKETCH, LV-ANNO)" value={c.drawn} onChange={(v) => setC({ ...c, drawn: v })} />
      <Check label="Devices placed" value={c.devices} onChange={(v) => setC({ ...c, devices: v })} />
      <Check label="Circuit wiring and tags" value={c.wiring} onChange={(v) => setC({ ...c, wiring: v })} />
      <Check label="Bind attached references" value={c.bind} disabled={!hasRefs} onChange={(v) => setC({ ...c, bind: v })} />
    </CadDialog>
  );
}

/** Close with changes since the last save: Save (the drawing showing only), Don't save, or Cancel. What was drawn stays
 * in the project either way. */
export function CloseUnsaved({ files, canSave, onSave, onDiscard, onClose }: { files: string[]; canSave: boolean; onSave: () => void; onDiscard: () => void; onClose: () => void }) {
  return (
    <CadDialog id="closeunsaved" title={files.length === 1 ? `Close ${files[0]}` : `Close ${files.length} drawings`} okLabel={canSave ? 'Save' : "Close"} wide
      onOk={canSave ? onSave : onDiscard} onClose={onClose}
      extra={canSave ? <button type="button" onClick={onDiscard}>Don't save</button> : undefined}>
      <p className="cad-dlg-note">{files.length === 1 ? 'The drawing has' : `${files.join(', ')} have`} changes since last saved. What you drew stays in the project either way.</p>
    </CadDialog>
  );
}
