import { useMemo, useState, type ReactNode } from 'react';
import type { FaultPoint, Project } from '../../types';
import { busVoltagesKv, solveSketch, type ScSketch } from '../../calc/scSketch';
import { cables } from '../../calc/cableTable';
import { DEFAULT_BASE_MVA } from '../../calc/perUnit';
import type { CableFamily } from '../../calc/cableFamily';
import { LV_VOLTAGES_V, MV_VOLTAGES_KV, TAP_STEPS_PCT, VECTOR_GROUPS } from '../../calc/transformerVoltage';
import { FaultMark } from '../../diagram/FaultMark';
import {
  addCable, addFault, addGenerator, addMotors, addSource, addTransformer, deleteCount, deleteItem, emptySketch, LAYOUT, layoutSketch,
  type ScEdit, type ScSel
} from '../../model/scSketchEdit';
import { ask, askText } from '../ConfirmDialog';
import { fmtFixed, fmtUpTo } from '../../util/format';
import { NumField, Page } from '../ui';

const n2 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const kvText = (kv: number | undefined) => (kv === undefined ? '—' : kv >= 1 ? `${+kv.toFixed(3)} kV` : `${Math.round(kv * 1000)} V`);
const KV_LIST = [...MV_VOLTAGES_KV, ...LV_VOLTAGES_V.map((v) => v / 1000)];
const famText = (f: CableFamily) => `${f.conductor === 'al' ? 'Al' : 'Cu'}/${f.insulation === 'pvc' ? 'PVC' : 'XLPE'}${f.form === 'trefoil' ? ', trefoil' : f.form === 'flat' ? ', flat' : ''}`;
const ink = { fill: 'var(--tx)', fontSize: 12 } as const;
const bold = { ...ink, fontWeight: 600 } as const;

/** A voltage from the market list, or "Other" with a typed value. */
function KvSelect({ label, value, onSet }: { label: string; value: number; onSet: (kv: number) => void }) {
  const [other, setOther] = useState(false);
  const typed = other || !KV_LIST.includes(value);
  return (
    <>
      <label className="nf"><span>{label}</span>
        <select value={typed ? 'other' : String(value)} onChange={(e) => { if (e.target.value === 'other') setOther(true); else { setOther(false); onSet(+e.target.value); } }}>
          {KV_LIST.map((kv) => <option key={kv} value={kv}>{kvText(kv)}</option>)}
          <option value="other">Other…</option>
        </select>
      </label>
      {typed && <NumField label={`${label}, typed`} unit="kV" value={value} min={0} onSet={(v) => v && onSet(v)} />}
    </>
  );
}

function TextField({ label, value, onSet }: { label: string; value: string; onSet: (v: string) => void }) {
  return (
    <label className="nf"><span>{label}</span>
      <input key={value} defaultValue={value} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== value) onSet(t); else e.target.value = value; }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

const exists = (s: ScSketch | undefined, sel: ScSel | undefined): boolean => {
  if (!s || !sel) return false;
  const list = { bus: s.buses, source: s.sources, transformer: s.transformers, cable: s.cables, generator: s.generators, motors: s.motors, fault: s.faultPoints }[sel.kind] as { id: string }[];
  return list.some((x) => x.id === sel.id);
};

/** Short circuit sketch: a drawn network of sources, transformers, cables, generators and motors with fault data
 * only, and the fault level at each fault point. Saved with the project as named sketches. */
export default function ScSketchPage({ project, onChange, onStatus }: { project: Project; onChange: (p: Project, step?: boolean) => void; onStatus?: (m: string) => void }) {
  const list = project.scSketches ?? [];
  const [activeId, setActiveId] = useState<string | undefined>();
  const sketch = list.find((s) => s.id === activeId) ?? list[0];
  const [pick, setPick] = useState<ScSel | undefined>();
  const sel = exists(sketch, pick) ? pick : undefined;
  const sol = useMemo(() => (sketch ? solveSketch(sketch) : undefined), [sketch]);
  const lay = useMemo(() => (sketch ? layoutSketch(sketch) : undefined), [sketch]);
  const volts = useMemo(() => (sketch ? busVoltagesKv(sketch).kv : new Map<string, number>()), [sketch]);

  const save = (next: ScSketch) => onChange({ ...project, scSketches: list.some((s) => s.id === next.id) ? list.map((s) => (s.id === next.id ? next : s)) : [...list, next] }, true);
  const apply = (e: ScEdit | undefined) => { if (!e) return; save(e.sketch); setActiveId(e.sketch.id); setPick(e.sel); };
  const patch = (p: Partial<ScSketch>) => sketch && save({ ...sketch, ...p });

  // The bus an add button works on: the selected bus, or the bus below / on the selected item.
  const targetBus = !sketch || !sel ? undefined
    : sel.kind === 'bus' ? sel.id
    : sel.kind === 'source' ? sketch.sources.find((x) => x.id === sel.id)?.busId
    : sel.kind === 'transformer' ? sketch.transformers.find((x) => x.id === sel.id)?.toBusId
    : sel.kind === 'cable' ? sketch.cables.find((x) => x.id === sel.id)?.toBusId
    : sel.kind === 'generator' ? sketch.generators.find((x) => x.id === sel.id)?.busId
    : sel.kind === 'motors' ? sketch.motors.find((x) => x.id === sel.id)?.busId
    : sketch.faultPoints.find((x) => x.id === sel.id)?.busId;
  const empty = !sketch || !sketch.buses.length;
  const base = () => sketch ?? emptySketch(list);

  async function newSketch() {
    const s = emptySketch(list);
    const name = await askText('New sketch', { label: 'Name', initial: s.name, required: true, confirmLabel: 'Create' });
    if (!name) return;
    save({ ...s, name }); setActiveId(s.id); setPick(undefined);
  }
  async function rename() {
    if (!sketch) return;
    const name = await askText('Rename sketch', { label: 'Name', initial: sketch.name, required: true, confirmLabel: 'Rename' });
    if (name) patch({ name });
  }
  async function removeSketch() {
    if (!sketch || !(await ask(`Delete the sketch ${sketch.name}? It is removed from the project.`))) return;
    onChange({ ...project, scSketches: list.filter((s) => s.id !== sketch.id) }, true);
    setActiveId(undefined); setPick(undefined);
  }
  async function removeItem() {
    if (!sketch || !sel) return;
    const count = deleteCount(sketch, sel);
    if (count > 1 && !(await ask(`Delete this item? ${count} items are removed with what hangs below it.`))) return;
    save(deleteItem(sketch, sel)); setPick(undefined);
    onStatus?.(`Deleted ${count} item${count === 1 ? '' : 's'} from ${sketch.name}`);
  }

  const results = new Map((sol?.faultPoints ?? []).map((r) => [r.id, r]));
  const faultTarget: ScSel | undefined = sel?.kind === 'cable' ? sel : targetBus ? { kind: 'bus', id: targetBus } : undefined;
  const hit = (s: ScSel) => ({ onClick: () => setPick(s), style: { cursor: 'pointer' } as const });
  const outline = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} fill="none" style={{ stroke: 'var(--acc)', strokeWidth: 1.6, strokeDasharray: '5 3' }} />;
  const isSel = (kind: ScSel['kind'], id: string) => sel?.kind === kind && sel.id === id;

  function drawing(s: ScSketch, l: NonNullable<typeof lay>): ReactNode {
    const L = LAYOUT;
    return (
      <svg width="100%" style={{ maxWidth: l.width, display: 'block' }} viewBox={`0 0 ${l.width} ${l.height}`} role="img" aria-label={`Sketch ${s.name}`} data-testid="sc-drawing">
        {l.branches.map((b) => {
          const mid = (b.y1 + b.y2) / 2;
          if (b.kind === 'cable') {
            const c = s.cables.find((x) => x.id === b.id)!;
            return (
              <g key={b.id} data-lv-id={`cable:${b.id}`} {...hit({ kind: 'cable', id: b.id })}>
                <rect x={b.x - 8} y={b.y1} width={230} height={b.y2 - b.y1} fill="transparent" />
                <line x1={b.x} y1={b.y1} x2={b.x} y2={b.y2} style={{ stroke: 'var(--tx)', strokeWidth: 1.6 }} />
                <text x={b.x + 10} y={mid + 4} style={ink}>{`${n2(c.csaMm2)} mm² ${famText(c.family)}, ${n2(c.lengthM)} m${c.runs && c.runs > 1 ? `, ${c.runs} runs` : ''}`}</text>
                {isSel('cable', b.id) && outline(b.x - 8, b.y1 + 2, 230, b.y2 - b.y1 - 4)}
              </g>
            );
          }
          const t = s.transformers.find((x) => x.id === b.id)!;
          return (
            <g key={b.id} data-lv-id={`transformer:${b.id}`} {...hit({ kind: 'transformer', id: b.id })}>
              <line x1={b.x} y1={b.y1} x2={b.x} y2={b.y2} style={{ stroke: 'var(--tx)', strokeWidth: 1.6 }} />
              <circle cx={b.x} cy={mid - 9} r={14} style={{ fill: 'var(--panel)', stroke: 'var(--tx)', strokeWidth: 1.6 }} />
              <circle cx={b.x} cy={mid + 9} r={14} style={{ fill: 'var(--panel)', stroke: 'var(--tx)', strokeWidth: 1.6 }} />
              <text x={b.x + 24} y={mid - 4} style={bold}>{`${t.name} ${n2(t.kva)} kVA`}</text>
              <text x={b.x + 24} y={mid + 12} style={ink}>{`${+t.primaryKv.toFixed(3)} / ${+t.secondaryKv.toFixed(3)} kV${t.vectorGroup ? `, ${t.vectorGroup}` : ''}, ${n2(t.zPct)} %`}</text>
              {isSel('transformer', b.id) && outline(b.x - 20, mid - 30, 24 + 196 + 20, 60)}
            </g>
          );
        })}
        {l.buses.map((b) => {
          const bus = s.buses.find((x) => x.id === b.id)!;
          return (
            <g key={b.id} data-lv-id={`bus:${b.id}`} {...hit({ kind: 'bus', id: b.id })}>
              <rect x={b.x0} y={b.y - 9} width={b.x1 - b.x0} height={18} fill="transparent" />
              <line x1={b.x0} y1={b.y} x2={b.x1} y2={b.y} style={{ stroke: 'var(--tx)', strokeWidth: 5 }} />
              <text x={b.x1 + 8} y={b.y + 4} style={bold}>{`${bus.name}, ${kvText(volts.get(b.id))}`}</text>
              {isSel('bus', b.id) && outline(b.x0 - 4, b.y - 11, b.x1 - b.x0 + 8, 22)}
            </g>
          );
        })}
        {l.sources.map((p) => {
          const src = s.sources.find((x) => x.id === p.id)!;
          const level = src.faultMva ? `${n2(src.faultMva)} MVA` : src.faultKa ? `${n2(src.faultKa)} kA` : 'no fault level';
          return (
            <g key={p.id} data-lv-id={`source:${p.id}`} {...hit({ kind: 'source', id: p.id })}>
              <line x1={p.x} y1={p.y - 70} x2={p.x} y2={p.y} style={{ stroke: 'var(--tx)', strokeWidth: 1.6 }} />
              <path d={`M${p.x} ${p.y - 76} l-7 14 h14 z`} style={{ fill: 'var(--tx)' }} />
              <text x={p.x + 12} y={p.y - 62} style={bold}>{`Source: ${kvText(src.kv)}, ${level}, X/R ${n2(src.xr ?? 10)}`}</text>
              {isSel('source', p.id) && outline(p.x - 12, p.y - 80, 330, 72)}
            </g>
          );
        })}
        {l.leaves.map((p) => {
          const g = p.kind === 'generator' ? s.generators.find((x) => x.id === p.id)! : undefined, m = p.kind === 'motors' ? s.motors.find((x) => x.id === p.id)! : undefined;
          return (
            <g key={p.id} data-lv-id={`${p.kind}:${p.id}`} {...hit({ kind: p.kind, id: p.id })}>
              <rect x={p.x - 40} y={p.y} width={L.leafW - 10} height={96} fill="transparent" />
              <line x1={p.x} y1={p.y} x2={p.x} y2={p.y + 26} style={{ stroke: 'var(--tx)', strokeWidth: 1.6 }} />
              <circle cx={p.x} cy={p.y + 40} r={14} style={{ fill: 'var(--panel)', stroke: 'var(--tx)', strokeWidth: 1.6 }} />
              <text x={p.x} y={p.y + 44} textAnchor="middle" style={bold}>{g ? 'G' : 'M'}</text>
              <text x={p.x} y={p.y + 68} textAnchor="middle" style={bold}>{g ? `${g.name} ${n2(g.kva)} kVA` : `Motors ${m!.id}`}</text>
              <text x={p.x} y={p.y + 82} textAnchor="middle" style={ink}>{g ? `X″d ${n2(g.xdSubPct ?? 15)} %, X′d ${n2(g.xdTransPct ?? 25)} %` : `${n2(m!.kw)} kW`}</text>
              {isSel(p.kind, p.id) && outline(p.x - 40, p.y + 2, L.leafW - 10, 92)}
            </g>
          );
        })}
        {l.faults.map((p) => {
          const f = s.faultPoints.find((x) => x.id === p.id)!, r = results.get(p.id), w = Math.max(26, 10 + f.id.length * 8);
          const point: FaultPoint = { id: f.id, name: f.name };
          const x0 = p.onCable ? p.x - 46 - w - 80 : p.x - 4;
          return (
            <g key={p.id} data-lv-id={`fault-point:${p.id}`} {...hit({ kind: 'fault', id: p.id })}>
              <rect x={x0} y={p.y - 42} width={46 + w + 84} height={46} fill="transparent" />
              <FaultMark point={point} x={p.x} y={p.y} left={p.onCable} />
              {r && <text x={p.onCable ? p.x - 46 - w - 6 : p.x + 46 + w + 6} y={p.y - 25} textAnchor={p.onCable ? 'end' : 'start'} style={bold}>{`Ik″ ${fmtFixed(r.ikMaxKa, 2)} kA`}</text>}
              {isSel('fault', p.id) && outline(x0, p.y - 42, 46 + w + 84, 46)}
            </g>
          );
        })}
      </svg>
    );
  }

  function form(s: ScSketch): ReactNode {
    if (!sel) return <p className="m">Click an item in the drawing to edit its fault data.</p>;
    const upd = (key: 'sources' | 'transformers' | 'cables' | 'generators' | 'motors' | 'faultPoints', p: Record<string, unknown>) =>
      patch({ [key]: (s[key] as { id: string }[]).map((x) => (x.id === sel.id ? { ...x, ...p } : x)) } as Partial<ScSketch>);
    const del = <button className="chip" onClick={removeItem}>Delete</button>;
    const sizes = [...new Set(cables().map((c) => c.csaMm2))].sort((a, b) => a - b);
    if (sel.kind === 'bus') {
      const b = s.buses.find((x) => x.id === sel.id)!;
      return (
        <>
          <h4>Busbar {b.name}</h4>
          <div className="dm-head">
            <TextField label="Name" value={b.name} onSet={(name) => patch({ buses: s.buses.map((x) => (x.id === b.id ? { ...x, name } : x)) })} />
            <label className="nf"><span>Voltage</span><input readOnly value={kvText(volts.get(b.id))} title="From the transformer or source above" /></label>
          </div>
          {del}
        </>
      );
    }
    if (sel.kind === 'source') {
      const x = s.sources.find((q) => q.id === sel.id)!;
      return (
        <>
          <h4>Source {x.id}</h4>
          <div className="dm-head">
            <KvSelect label="Voltage" value={x.kv} onSet={(kv) => upd('sources', { kv })} />
            <NumField label="Fault level" unit="MVA" value={x.faultMva} min={0} optional onSet={(v) => upd('sources', { faultMva: v })} />
            <NumField label="Or fault current" unit="kA" value={x.faultKa} min={0} optional title="Used when the fault level in MVA is empty" onSet={(v) => upd('sources', { faultKa: v })} />
            <NumField label="X/R" value={x.xr} min={0} optional placeholder="10" onSet={(v) => upd('sources', { xr: v })} />
          </div>
          {del}
        </>
      );
    }
    if (sel.kind === 'transformer') {
      const t = s.transformers.find((q) => q.id === sel.id)!;
      return (
        <>
          <h4>Transformer {t.name}</h4>
          <div className="dm-head">
            <TextField label="Name" value={t.name} onSet={(name) => upd('transformers', { name })} />
            <NumField label="Rating" unit="kVA" value={t.kva} min={0} onSet={(v) => v && upd('transformers', { kva: v })} />
            <KvSelect label="Primary voltage" value={t.primaryKv} onSet={(primaryKv) => upd('transformers', { primaryKv })} />
            <KvSelect label="Secondary voltage" value={t.secondaryKv} onSet={(secondaryKv) => upd('transformers', { secondaryKv })} />
            <label className="nf"><span>Direction</span><input readOnly value={t.primaryKv > t.secondaryKv ? 'Step-down' : t.primaryKv < t.secondaryKv ? 'Step-up' : 'Same voltage'} /></label>
            <NumField label="Impedance Z" unit="%" value={t.zPct} min={0} onSet={(v) => v && upd('transformers', { zPct: v })} />
            <NumField label="X/R" value={t.xr} min={0} optional placeholder="default" onSet={(v) => upd('transformers', { xr: v })} />
            <label className="nf"><span>Vector group</span>
              <select value={t.vectorGroup ?? ''} onChange={(e) => upd('transformers', { vectorGroup: e.target.value || undefined })}>
                <option value="">—</option>
                {[...VECTOR_GROUPS, ...(t.vectorGroup && !VECTOR_GROUPS.includes(t.vectorGroup) ? [t.vectorGroup] : [])].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="nf"><span>Tap</span>
              <select value={String(t.tapPct ?? 0)} onChange={(e) => upd('transformers', { tapPct: +e.target.value })}>
                {[...TAP_STEPS_PCT, ...(t.tapPct !== undefined && !TAP_STEPS_PCT.includes(t.tapPct) ? [t.tapPct] : [])].map((v) => <option key={v} value={v}>{v} %</option>)}
              </select>
            </label>
          </div>
          {del}
        </>
      );
    }
    if (sel.kind === 'cable') {
      const c = s.cables.find((q) => q.id === sel.id)!;
      const fam = (p: Partial<CableFamily>) => upd('cables', { family: { ...c.family, ...p } });
      return (
        <>
          <h4>Cable {c.id}</h4>
          <div className="dm-head">
            <label className="nf"><span>Size</span>
              <select value={c.csaMm2} onChange={(e) => upd('cables', { csaMm2: +e.target.value })}>
                {[...sizes, ...(sizes.includes(c.csaMm2) ? [] : [c.csaMm2])].map((v) => <option key={v} value={v}>{n2(v)} mm²</option>)}
              </select>
            </label>
            <label className="nf"><span>Conductor</span>
              <select value={c.family.conductor} onChange={(e) => fam({ conductor: e.target.value as CableFamily['conductor'] })}><option value="cu">Cu</option><option value="al">Al</option></select>
            </label>
            <label className="nf"><span>Insulation</span>
              <select value={c.family.insulation} onChange={(e) => fam({ insulation: e.target.value as CableFamily['insulation'] })}><option value="xlpe">XLPE</option><option value="pvc">PVC</option></select>
            </label>
            <label className="nf"><span>Form</span>
              <select value={c.family.form} onChange={(e) => fam({ form: e.target.value as CableFamily['form'] })}>
                <option value="multi">Multicore</option><option value="trefoil">Single-core, trefoil</option><option value="flat">Single-core, flat</option>
              </select>
            </label>
            <NumField label="Length" unit="m" value={c.lengthM} min={0} onSet={(v) => v !== undefined && upd('cables', { lengthM: v })} />
            <NumField label="Runs" value={c.runs ?? 1} min={1} onSet={(v) => v && upd('cables', { runs: Math.round(v) })} />
          </div>
          {del}
        </>
      );
    }
    if (sel.kind === 'generator') {
      const g = s.generators.find((q) => q.id === sel.id)!;
      return (
        <>
          <h4>Generator {g.name}</h4>
          <div className="dm-head">
            <TextField label="Name" value={g.name} onSet={(name) => upd('generators', { name })} />
            <NumField label="Rating" unit="kVA" value={g.kva} min={0} onSet={(v) => v && upd('generators', { kva: v })} />
            <NumField label="X″d" unit="%" value={g.xdSubPct} min={0} optional placeholder="15" onSet={(v) => upd('generators', { xdSubPct: v })} />
            <NumField label="X′d" unit="%" value={g.xdTransPct} min={0} optional placeholder="25" onSet={(v) => upd('generators', { xdTransPct: v })} />
            <NumField label="Sustained current" unit="× rated" value={g.sustainedMultiple} min={0} optional title="Optional: for the minimum fault current" onSet={(v) => upd('generators', { sustainedMultiple: v })} />
            <NumField label="X/R" value={g.xr} min={0} optional placeholder="default" onSet={(v) => upd('generators', { xr: v })} />
          </div>
          {del}
        </>
      );
    }
    if (sel.kind === 'motors') {
      const m = s.motors.find((q) => q.id === sel.id)!;
      return (
        <>
          <h4>Motors {m.id}</h4>
          <div className="dm-head"><NumField label="Total power" unit="kW" value={m.kw} min={0} onSet={(v) => v !== undefined && upd('motors', { kw: v })} /></div>
          {del}
        </>
      );
    }
    const f = s.faultPoints.find((q) => q.id === sel.id)!, c = f.cableId ? s.cables.find((q) => q.id === f.cableId) : undefined, r = results.get(f.id);
    return (
      <>
        <h4>Fault point {f.name || f.id}</h4>
        <div className="dm-head">
          <TextField label="Name" value={f.name} onSet={(name) => upd('faultPoints', { name })} />
          <label className="nf"><span>Place</span><input readOnly value={c ? `Cable ${c.id}` : `Bus ${s.buses.find((b) => b.id === f.busId)?.name ?? ''}`} /></label>
          {c && <NumField label="Distance from the start" unit="m" value={f.distanceM ?? 0} min={0} max={c.lengthM} onSet={(v) => v !== undefined && upd('faultPoints', { distanceM: v })} />}
        </div>
        {r && <p className="m">{`Ik″ ${n2(r.ikMaxKa)} kA at ${kvText(r.kv)}`}</p>}
        {del}
      </>
    );
  }

  const strip: [string, () => void, boolean, string][] = [
    ['Source', () => { const s = base(); apply(addSource(s) ?? undefined); }, empty, 'Starts the sketch: a bus with the source on it (11 kV, 500 MVA)'],
    ['Transformer', () => sketch && targetBus && apply(addTransformer(sketch, targetBus)), !!targetBus, 'A transformer and a new bus below the selected bus'],
    ['Cable', () => sketch && targetBus && apply(addCable(sketch, targetBus)), !!targetBus, 'A cable and a new bus below the selected bus'],
    ['Generator', () => sketch && targetBus && apply(addGenerator(sketch, targetBus)), !!targetBus, 'A generator on the selected bus'],
    ['Motors', () => sketch && targetBus && apply(addMotors(sketch, targetBus)), !!targetBus, 'A motor group on the selected bus'],
    ['Fault point', () => sketch && faultTarget && apply(addFault(sketch, faultTarget)), !!faultTarget, 'A fault point on the selected bus, or at the end of the selected cable']
  ];
  const later = 'Coming in a later step';

  return (
    <Page
      title="Short circuit sketch"
      intro="Draw only what the fault level needs: sources, transformers, cables, generators and motors. No panel names, breakers or circuits."
      actions={(
        <>
          <label className="nf"><span>Sketch</span>
            <select value={sketch?.id ?? ''} disabled={!list.length} onChange={(e) => { setActiveId(e.target.value); setPick(undefined); }}>
              {list.length ? list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : <option value="">No sketch yet</option>}
            </select>
          </label>
          <button className="chip" onClick={newSketch}>New sketch</button>
          <button className="chip" disabled={!sketch} onClick={rename}>Rename</button>
          <button className="chip" disabled={!sketch} onClick={removeSketch}>Delete sketch</button>
          <button className="chip" disabled title={later}>Start from project</button>
          <button className="chip" disabled title={later}>Print A3</button>
          <button className="chip" disabled title={later}>Send to SLD</button>
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        <section className="dm-card" style={{ flex: '0 0 150px', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-label="Items">
          {strip.map(([label, go, on, title]) => <button key={label} className="chip" disabled={!on} title={title} onClick={go}>{label}</button>)}
          <p className="m">{empty ? 'Start with Source.' : 'Select a bus, then click an item: it is added below it.'}</p>
        </section>
        <section className="dm-card" style={{ flex: '1 1 auto', minWidth: 0, overflow: 'auto' }} aria-label="Drawing">
          {sketch && lay && !empty ? drawing(sketch, lay) : <p className="m">{sketch ? 'The sketch is empty. Click Source to start.' : 'No sketch yet. Click Source to start one, or New sketch to name it first.'}</p>}
        </section>
        <section className="dm-card" style={{ flex: '0 0 300px' }} aria-label="Selected item">{sketch ? form(sketch) : <p className="m">Nothing selected.</p>}</section>
      </div>

      <section className="dm-card">
        <h4>Results</h4>
        <div className="dm-head">
          <NumField label="Base power" unit="MVA" value={sketch?.baseMva ?? DEFAULT_BASE_MVA} min={0} onSet={(v) => v && patch({ baseMva: v })} />
        </div>
        <p className="m">c = 1.1 on MV, 1.05 on LV for the maximum; 0.95 on LV for the minimum, with the generator X′d. Peak ip = κ × √2 × Ik″.</p>
        {sol?.warnings.map((w) => <p key={w} className="warn">⚠ {w}</p>)}
        {sol && sol.faultPoints.length ? (
          <table className="schedule">
            <thead><tr><th>Point</th><th>Place</th><th className="num">kV</th><th className="num">Z (p.u.)</th><th className="num">X/R</th><th className="num">Ik″ (kA)</th><th className="num">Peak ip (kA)</th><th className="num">Ik min (kA)</th></tr></thead>
            <tbody>
              {sol.faultPoints.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td><td>{r.place}</td><td className="num">{fmtUpTo(r.kv, 3)}</td><td className="num">{fmtFixed(r.zPu, 2)}</td><td className="num">{fmtFixed(r.xr, 2)}</td>
                  <td className="num">{fmtFixed(r.ikMaxKa, 2)}</td><td className="num">{fmtFixed(r.ipKa, 2)}</td><td className="num">{fmtFixed(r.ikMinKa, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="m">Add a fault point on a bus or cable to see its fault level.</p>}
      </section>
    </Page>
  );
}
