import { ask } from './ConfirmDialog';
import { INSTALL_METHODS, cables, type InstallMethod } from '../calc/cableTable';
import { DEFAULT_TRANSFORMER_XR, assumedSourceFaultKa } from '../calc/electrical';
import { supplyNameSuggestion } from '../model/designReference';
import { FED_FROM, fedFromOfBoard, losesValues, setFedFrom, setIncomerValue, setSupplyValue, type FedFrom } from '../model/supplyEdit';
import { METER_TYPES, SOURCE_KINDS, SWITCH_DEVICES, type Board, type MeterType, type Project, type SourceKind, type SupplyIncomer, type SwitchDevice } from '../types';
import BoardFields from './BoardFields';

type Supply = NonNullable<Board['supply']>;

/** What a switch to `to` removes, in words, for the question asked first. */
function lostText(b: Board, to: FedFrom): string {
  const from = fedFromOfBoard(b);
  const parts: string[] = [];
  if (b.sourceKva || (from === 'transformer' && to !== 'unset')) parts.push('the transformer rating and impedance');
  if (to === 'unset' && Object.values(b.supply ?? {}).some((v) => v !== undefined)) parts.push('the supply values typed for it');
  if (to === 'unset' && (b.rmu?.trim() || b.substation?.trim())) parts.push('the RMU and substation names');
  return parts.join(' and ');
}

/** The Supply fields of a first board: what feeds it, then the values that choice needs. Edits apply through
 * `onChange` as typed (the side panel) or into the dialog's draft. */
export default function SupplyFields({ project, board, onChange }: { project: Project; board: Board; onChange: (b: Board) => void }) {
  const mode = fedFromOfBoard(board);
  const s: Supply = board.supply ?? {};
  const inc = s.incomer;
  const suggestion = supplyNameSuggestion(project);
  const listId = `supply-names-${board.id}`;
  const numOrU = (v: string) => (v.trim() === '' || Number.isNaN(+v) ? undefined : +v);

  async function pick(to: FedFrom) {
    if (to === mode) return;
    if (losesValues(board, to)) {
      const label = FED_FROM.find((f) => f.value === to)!.label;
      if (!(await ask(`Change the supply of ${board.id} to "${label}"? This removes ${lostText(board, to)}.`))) return;
    }
    onChange(setFedFrom(project, board, to));
  }
  const num = (label: string, key: Exclude<keyof Supply, 'incomer'>, step: number, placeholder = '') => (
    <label>{label}
      <input type="number" aria-label={label} step={step} min="0" placeholder={placeholder} value={(s[key] as number | undefined) ?? ''} onChange={(e) => onChange(setSupplyValue(board, key, numOrU(e.target.value) as never))} />
    </label>
  );
  const text = (label: string, key: 'fedFrom' | 'ref', placeholder: string, list?: string) => (
    <label>{label}
      <input aria-label={label} list={list} placeholder={placeholder} value={s[key] ?? ''} onChange={(e) => onChange(setSupplyValue(board, key, e.target.value || undefined))} />
    </label>
  );
  const incNum = (label: string, key: 'lengthM' | 'parallel' | 'cpcMm2', step: number, placeholder = '') => (
    <label>{label}
      <input type="number" aria-label={label} step={step} min="0" placeholder={placeholder} value={inc?.[key] || ''} onChange={(e) => onChange(setIncomerValue(board, key, numOrU(e.target.value)))} />
    </label>
  );
  const sizes = [...new Set([...cables().map((c) => c.csaMm2), ...(inc?.cableCsaMm2 ? [inc.cableCsaMm2] : [])])].sort((a, b) => a - b);

  const shared = (
    <>
      <h4 className="kv-head">Given values</h4>
      <div className="form-kv">
        {num('Fault level Ik″ (kA)', 'faultKa', 0.1, `${assumedSourceFaultKa(project).toFixed(1)} assumed`)}
        {num('X/R', 'xr', 0.5, String(DEFAULT_TRANSFORMER_XR))}
        {num('Minimum Ik (kA)', 'faultKaMin', 0.1, 'not given')}
        {num('Drop already used (%)', 'vdUsedPct', 0.1, '0')}
        {num('Earth loop Ze (Ω)', 'zeOhm', 0.01, 'estimated from Ik')}
        {num('Allowed load (A)', 'allowedA', 1, 'not given')}
      </div>
      <h4 className="kv-head">Upstream device</h4>
      <div className="form-kv">
        <label>Device
          <select aria-label="Device" value={s.device ?? ''} onChange={(e) => onChange(setSupplyValue(board, 'device', (e.target.value || undefined) as SwitchDevice | undefined))}>
            <option value="">—</option>
            {SWITCH_DEVICES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        {num('Rating (A)', 'ratingA', 1)}
        {num('Setting Ir (× In)', 'irSetting', 0.05, '1')}
        {mode === 'source' && (
          <label>Meter
            <select aria-label="Meter" value={s.meter ?? ''} onChange={(e) => onChange(setSupplyValue(board, 'meter', (e.target.value || undefined) as MeterType | undefined))}>
              <option value="">—</option>
              {METER_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}
      </div>
      <h4 className="kv-head">Incoming cable</h4>
      <div className="form-kv">
        <label>Size (mm²)
          <select aria-label="Size (mm²)" value={inc?.cableCsaMm2 || ''} onChange={(e) => onChange(setIncomerValue(board, 'cableCsaMm2', numOrU(e.target.value)))}>
            <option value="">—</option>
            {sizes.map((c) => <option key={c} value={c}>{c} mm²</option>)}
          </select>
        </label>
        {incNum('Length (m)', 'lengthM', 1)}
        {incNum('Runs in parallel', 'parallel', 1, '1')}
        <label>Cores
          <select aria-label="Cores" value={inc?.cores ?? ''} onChange={(e) => onChange(setIncomerValue(board, 'cores', (e.target.value ? +e.target.value : undefined) as SupplyIncomer['cores']))}>
            <option value="">4 (default)</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
        {incNum('Protective conductor (mm²)', 'cpcMm2', 1, 'by the standard')}
        <label>Installation
          <select aria-label="Installation" value={inc?.installMethod ?? ''} onChange={(e) => onChange(setIncomerValue(board, 'installMethod', (e.target.value || undefined) as InstallMethod | undefined))}>
            <option value="">E (default)</option>
            {INSTALL_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <p className="m">Checked like a feeder: current, voltage drop and fault level at the board.</p>
    </>
  );

  return (
    <>
      <fieldset className="relays">
        <legend>Fed from</legend>
        {FED_FROM.map((f) => (
          <label key={f.value} className="row">
            <input type="radio" name={`fed-from-${board.id}`} aria-label={f.label} checked={mode === f.value} onChange={() => void pick(f.value)} /> {f.label}
          </label>
        ))}
      </fieldset>
      {mode === 'transformer' && (
        <>
          <h4 className="kv-head">Transformer</h4>
          {!board.sourceKva && <p className="m warn">No transformer rating yet — enter it below.</p>}
          <BoardFields board={board} onChange={onChange} section="source" />
        </>
      )}
      {mode === 'source' && (
        <>
          <h4 className="kv-head">Source</h4>
          <div className="form-kv">
            <label>Kind
              <select aria-label="Kind" value={s.kind ?? 'utility'} onChange={(e) => onChange(setSupplyValue(board, 'kind', e.target.value === 'utility' ? undefined : (e.target.value as SourceKind)))}>
                {SOURCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </label>
            {text('Name', 'fedFrom', 'Source', suggestion ? listId : undefined)}
            {text('Reference', 'ref', 'drawing or letter')}
          </div>
          {suggestion && <datalist id={listId}><option value={suggestion} /></datalist>}
          {shared}
        </>
      )}
      {mode === 'board' && (
        <>
          <h4 className="kv-head">Feeding board</h4>
          <div className="form-kv">
            {text('Feeding board', 'fedFrom', 'e.g. SMDB-3F')}
            {text('Reference', 'ref', 'drawing or letter')}
          </div>
          {shared}
        </>
      )}
      {mode === 'unset' && <p className="m">Nothing is entered for the supply. The calculations assume a source of {assumedSourceFaultKa(project).toFixed(1)} kA and mark the checks that depend on it as not verified.</p>}
    </>
  );
}
