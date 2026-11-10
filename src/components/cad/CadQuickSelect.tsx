import { useState } from 'react';
import { CadDialog, Check, Row } from './CadDialogs';
import { QS_OPS, qsFields, qsKinds, qsValues, quickSelect, type QsKey, type QsOp } from '../../model/cadQuickSelect';
import type { SketchItem } from '../../types';

/** Design CAD → Quick select (QSELECT, S3 of the 2D gap plan): the drawn objects of a kind whose property compares as
 * asked, from the whole drawing or the selection, included or excluded, added to the selection or replacing it. */
export function QuickSelectDialog({ items, picked, metresPerUnit, onApply, onClose }: {
  /** The drawn objects that can be picked, and those picked now. */
  items: SketchItem[]; picked: SketchItem[]; metresPerUnit: number;
  onApply: (found: SketchItem[], add: boolean) => void; onClose: () => void;
}) {
  const [applyTo, setApplyTo] = useState<'drawing' | 'selection'>('drawing');
  const [kind, setKind] = useState('');
  const [key, setKey] = useState<QsKey>('layer');
  const [op, setOp] = useState<QsOp>('=');
  const [typed, setTyped] = useState('');
  const [exclude, setExclude] = useState(false);
  const [add, setAdd] = useState(false);
  const pool = applyTo === 'selection' ? picked : items;
  const kinds = qsKinds(pool), fields = qsFields(kind, pool);
  const field = fields.find((f) => f.key === key) ?? fields[0];
  const ops = QS_OPS.filter((o) => o.op !== '*' || !field.unit);
  const opNow = ops.some((o) => o.op === op) ? op : '=';
  const values = field.list ? qsValues(pool, field.key, metresPerUnit) : [];
  const value = field.list ? (values.includes(typed) ? typed : values[0] ?? '') : typed;
  const found = quickSelect(pool, { kind: kinds.some((k) => k.id === kind) ? kind : '', key: field.key, op: opNow, value, exclude }, metresPerUnit);
  const n = found.length;
  return (
    <CadDialog id="qselect" title="Quick select" alias="QSELECT" onOk={() => onApply(found, add)} onClose={onClose}
      help="Pick the kind, a property and how its value compares (* matches text with wildcards: * any run, ? one character). Exclude keeps the objects of the kind that do not match. Apply to the current selection narrows what is picked."
      extra={<span className="m" aria-live="polite">{`${n} object${n === 1 ? '' : 's'}`}</span>}>
      <Row label="Apply to"><select aria-label="Apply to" value={applyTo} onChange={(e) => setApplyTo(e.target.value as 'drawing' | 'selection')}><option value="drawing">Whole drawing</option><option value="selection" disabled={!picked.length}>Current selection</option></select></Row>
      <Row label="Object type"><select aria-label="Object type" value={kinds.some((k) => k.id === kind) ? kind : ''} onChange={(e) => setKind(e.target.value)}>{kinds.map((k) => <option key={k.id} value={k.id}>{`${k.id ? k.label : 'Multiple'} (${k.n})`}</option>)}</select></Row>
      <Row label="Property"><select aria-label="Property" value={field.key} onChange={(e) => setKey(e.target.value as QsKey)}>{fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></Row>
      <Row label="Operator"><select aria-label="Operator" value={opNow} onChange={(e) => setOp(e.target.value as QsOp)}>{ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select></Row>
      {opNow !== 'all' && (
        <Row label="Value" unit={field.unit === 'm' ? 'm' : field.unit === 'deg' ? '°' : undefined}>
          {field.list ? <select aria-label="Value" value={value} onChange={(e) => setTyped(e.target.value)}>{values.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            : <input aria-label="Value" value={typed} onChange={(e) => setTyped(e.target.value)} />}
        </Row>
      )}
      <Row label="How to apply"><select aria-label="How to apply" value={exclude ? 'exclude' : 'include'} onChange={(e) => setExclude(e.target.value === 'exclude')}><option value="include">Include in new selection</option><option value="exclude">Exclude from new selection</option></select></Row>
      <Check label="Add to the current selection" value={add} onChange={setAdd} disabled={!picked.length} />
    </CadDialog>
  );
}
