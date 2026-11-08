import { useState } from 'react';
import { CadDialog, Check, Num, Row } from './CadDialogs';
import type { CadToggles } from './CadCanvas';
import type { DraftTab } from './cadState';
import { DRAFT_DEFAULTS, OSNAP_BITS, OSNAP_MODES, parseAngles, POLAR_INCREMENTS, type DraftSettings } from '../../model/cadDraft';

type MenuItem = { label: string; title: string; onClick: () => void };

const TABS: { k: DraftTab; label: string }[] = [
  { k: 'snap', label: 'Snap & grid' }, { k: 'polar', label: 'Polar tracking' }, { k: 'osnap', label: 'Object snap' }, { k: 'dyn', label: 'Dynamic input' },
  { k: 'select', label: 'Selection' }, { k: 'cursor', label: 'Cursor' }, { k: 'units', label: 'Units & level' }
];
const HELP: Record<DraftTab, string> = {
  snap: 'Snap (F9) steps the cursor by the spacing; 0 follows the grid on screen. Grid (F7): 0 adapts to the zoom.',
  polar: 'Polar tracking (F10) holds the next point on the angles from the last one. ORTHO (F8) and polar turn each other off. Object snap tracking (F11): rest the cursor on a snap point to acquire it (again to let it go), then follow its alignment lines.',
  osnap: 'The snap points the cursor finds (F3 turns them all on or off). Perpendicular is from the last point picked. Shift-click and a window select, as before.',
  dyn: 'Dynamic input (F12): the boxes, the short prompt and its options at the cursor.',
  select: 'Left to right: only what is fully inside. Right to left: what the window crosses. Shift-click adds or removes.',
  cursor: 'The crosshair, the snap aperture (how near a snap point must be) and the marker.',
  units: 'Level and units belong to this drawing; the rest is kept for you on this computer.'
};

/** Drafting settings (DS / DSETTINGS): seven tabs. The settings and the status-bar toggles change together on OK; Esc,
 * Cancel or × change nothing. Level and units run at once on OK, each one undo step, as from the File menu before. */
export default function CadDraftSettings({ tab: first = 'snap', draft, toggles, gridDots, level, levels, unit, units, autosaveMin, onApply, onClose }: {
  tab?: DraftTab;
  draft: DraftSettings;
  toggles: CadToggles;
  gridDots: boolean;
  level: string;
  levels: MenuItem[];
  unit: string;
  units: MenuItem[];
  /** Minutes between the project's recovery copies (Preferences); 0 = off. */
  autosaveMin: number;
  onApply: (next: { draft: DraftSettings; toggles: CadToggles; gridDots: boolean; autosaveMin: number; level?: MenuItem; unit?: MenuItem }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DraftTab>(first);
  const [d, setD] = useState(draft);
  const [t, setT] = useState(toggles);
  const [dots, setDots] = useState(gridDots);
  const [auto, setAuto] = useState(autosaveMin);
  const [extra, setExtra] = useState(draft.polarExtra.join(', '));
  const [lv, setLv] = useState<string>('');
  const [un, setUn] = useState<string>('');
  const patch = (p: Partial<DraftSettings>) => setD((x) => ({ ...x, ...p }));
  const tog = (k: keyof CadToggles) => (v: boolean) => setT((x) => ({ ...x, [k]: v, ...(k === 'ortho' && v ? { polar: false } : k === 'polar' && v ? { ortho: false } : {}) }));
  const n = (k: keyof DraftSettings) => (v: string) => patch({ [k]: Number(v) } as Partial<DraftSettings>);
  const mode = (bit: number) => (v: boolean) => patch({ osnap: v ? d.osnap | bit : d.osnap & ~bit });
  const ok = () => onApply({
    draft: { ...d, polarExtra: parseAngles(extra) }, toggles: t, gridDots: dots, autosaveMin: auto,
    level: levels.find((x) => x.label === lv), unit: units.find((x) => x.label === un)
  });
  const reset = tab === 'cursor' || tab === 'select'
    ? <button type="button" onClick={() => patch(tab === 'cursor' ? { crossPct: DRAFT_DEFAULTS.crossPct, aperturePx: DRAFT_DEFAULTS.aperturePx, markerPx: DRAFT_DEFAULTS.markerPx, snapTip: true } : { windowFill: true, grips: true, gripPx: DRAFT_DEFAULTS.gripPx, pickPx: DRAFT_DEFAULTS.pickPx })}>Reset</button>
    : tab === 'osnap' ? <><button type="button" onClick={() => patch({ osnap: Object.values(OSNAP_BITS).reduce((a, b) => a | b, 0) })}>Select all</button><button type="button" onClick={() => patch({ osnap: 0 })}>Clear all</button></> : null;
  return (
    <CadDialog id="dsettings" title="Drafting settings" alias="DS" help={HELP[tab]} onOk={ok} onClose={onClose} wide extra={reset}>
      <div className="cad-dlg-tabs wrap" role="tablist" aria-label="Drafting settings">
        {TABS.map((x) => <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => setTab(x.k)}>{x.label}</button>)}
      </div>
      {tab === 'snap' && <>
        <div className="cad-dlg-sec">Snap (F9)</div>
        <Check label="Snap on" value={t.snap} onChange={tog('snap')} />
        <Num label="X spacing" unit="mm" value={d.snapX} onChange={n('snapX')} />
        <Num label="Y spacing (0 = as X)" unit="mm" value={d.snapY} onChange={n('snapY')} />
        <div className="cad-dlg-sec">Grid (F7)</div>
        <Check label="Grid on" value={t.grid} onChange={tog('grid')} />
        <Row label="Style"><select aria-label="Grid style" value={dots ? 'dots' : 'lines'} onChange={(e) => setDots(e.target.value === 'dots')}><option value="lines">Lines</option><option value="dots">Dots</option></select></Row>
        <Num label="Spacing (0 = adapt to zoom)" unit="mm" value={d.gridMm} onChange={n('gridMm')} />
        <Num label="Major line every" value={d.gridMajor} onChange={(v) => { if (Number(v) >= 1) patch({ gridMajor: Math.round(Number(v)) }); }} />
      </>}
      {tab === 'polar' && <>
        <div className="cad-dlg-sec">Polar tracking (F10)</div>
        <Check label="Polar tracking on" value={!!t.polar} onChange={tog('polar')} />
        <Row label="Increment angle"><select aria-label="Increment angle" value={d.polarInc} onChange={(e) => patch({ polarInc: Number(e.target.value) })}>{POLAR_INCREMENTS.map((a) => <option key={a} value={a}>{a}°</option>)}</select></Row>
        <Row label="Extra angles" unit="°"><input aria-label="Extra angles" value={extra} placeholder="60, 120" onChange={(e) => setExtra(e.target.value)} /></Row>
        <div className="cad-dlg-sec">Object snap tracking (F11)</div>
        <Check label="Object snap tracking on" value={!!t.otrack} onChange={tog('otrack')} />
        <Row label="Track along"><select aria-label="Track along" value={d.trackAllPolar ? 'all' : 'straight'} onChange={(e) => patch({ trackAllPolar: e.target.value === 'all' })}><option value="straight">Straight only</option><option value="all">All polar angles</option></select></Row>
      </>}
      {tab === 'osnap' && <>
        <Check label="Object snap on (F3)" value={t.osnap} onChange={tog('osnap')} />
        <div className="cad-dlg-sec">Snap modes</div>
        {OSNAP_MODES.map((m) => <Check key={m.k} label={`${m.mark}  ${m.label}`} value={(d.osnap & OSNAP_BITS[m.k]) !== 0} onChange={mode(OSNAP_BITS[m.k])} />)}
      </>}
      {tab === 'dyn' && <>
        <Check label="Dynamic input on (F12)" value={!!t.dyn} onChange={tog('dyn')} />
        <Check label="Length and angle boxes" value={d.dynBoxes} onChange={(v) => patch({ dynBoxes: v })} />
        <Check label="The prompt at the cursor" value={d.dynPrompt} onChange={(v) => patch({ dynPrompt: v })} />
        <Check label="The options list" value={d.dynOptions} onChange={(v) => patch({ dynOptions: v })} />
        <p className="cad-dlg-note">A point typed: x,y from the last point; # before it for an absolute point; @ for relative; length&lt;angle for polar.</p>
      </>}
      {tab === 'select' && <>
        <Check label="Shade the selection window" value={d.windowFill} onChange={(v) => patch({ windowFill: v })} />
        <Check label="Grips on what is picked" value={d.grips} onChange={(v) => patch({ grips: v })} />
        <Num label="Grip size" unit="px" value={d.gripPx} onChange={(v) => { const x = Math.round(Number(v)); if (x >= 4 && x <= 20) patch({ gripPx: x }); }} />
        <Num label="Pick box size" unit="px" value={d.pickPx} onChange={(v) => { const x = Math.round(Number(v)); if (x >= 3 && x <= 30) patch({ pickPx: x }); }} />
      </>}
      {tab === 'cursor' && <>
        <Num label="Crosshair size (100 = across)" unit="%" value={d.crossPct} onChange={(v) => { const x = Math.round(Number(v)); if (x >= 1 && x <= 100) patch({ crossPct: x }); }} />
        <Num label="Snap aperture" unit="px" value={d.aperturePx} onChange={(v) => { const x = Math.round(Number(v)); if (x >= 2 && x <= 40) patch({ aperturePx: x }); }} />
        <Num label="Snap marker size" unit="px" value={d.markerPx} onChange={(v) => { const x = Math.round(Number(v)); if (x >= 3 && x <= 20) patch({ markerPx: x }); }} />
        <Check label="Snap name beside the marker" value={d.snapTip} onChange={(v) => patch({ snapTip: v })} />
        <Check label="Show lineweights (LWT)" value={t.lwt !== false} onChange={tog('lwt')} />
      </>}
      {tab === 'units' && <>
        <div className="cad-dlg-sec">This drawing</div>
        <Row label="Level"><select aria-label="Level" value={lv} disabled={!levels.length} onChange={(e) => setLv(e.target.value)}><option value="">{level}</option>{levels.map((x) => <option key={x.label} value={x.label}>{x.label}</option>)}</select></Row>
        <Row label="Units"><select aria-label="Units" value={un} disabled={!units.length} onChange={(e) => setUn(e.target.value)}><option value="">{unit}</option>{units.map((x) => <option key={x.label} value={x.label}>{x.label}</option>)}</select></Row>
        <div className="cad-dlg-sec">Saving</div>
        <Row label="Save As starts with"><select aria-label="Save As starts with" value={d.saveFormat} onChange={(e) => patch({ saveFormat: e.target.value as DraftSettings['saveFormat'] })}><option value="own">The drawing's own</option><option value="dwg">DWG</option><option value="dxf">DXF</option></select></Row>
        <Check label="Keep the previous copy (.bak) on Save" value={d.keepBak} onChange={(v) => patch({ keepBak: v })} />
        <Num label="Recovery copy every (0 = off)" unit="min" value={auto} onChange={(v) => setAuto(Math.round(Number(v)))} />
      </>}
    </CadDialog>
  );
}
