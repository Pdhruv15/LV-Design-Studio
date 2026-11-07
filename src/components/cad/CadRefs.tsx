import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui';
import { chooseDrawing, fileStamp, readRefGeometry, refGeometryOf, type CadView, type CadXref } from '../../engines/cad/cadEngine';
import { LAYER_COLOURS } from '../../model/cadLayerStyle';
import { boundLayerName, dropRefGeometry, keepRefGeometry, newRef, placeRef, REF_STATUS, refFromXref, refGeometry, refLayerStyle, refSnaps, refsOf, updateRef, withRef, withRefLayer, withoutRef, xrefCandidates, xrefFile, type CadRef, type RefGeometry, type RefStatus } from '../../model/cadRefs';
import { pathOfPlan, rememberPath, skipRef, skippedRefs } from './cadState';
import { readRefFile } from './refFiles';
import type { Project } from '../../types';

type Pt = [number, number];
const keyOf = (file: string) => file.trim().toLowerCase();
const same = (a: string, b: string) => keyOf(a) === keyOf(b);
const fmt = (v: number) => String(+v.toFixed(4));

/** Design CAD → References: the references of the plan showing, read and kept in memory (src/model/cadRefs.ts), with
 * what the canvas draws and snaps to, their status, and the manager's actions. A reference file is read from where it
 * was found on this computer; a drawing open in a tab is used as it is. */
export function useCadRefs({ project, view, tabOf, change, say }: {
  project: Project;
  view: CadView | null;
  tabOf: (file: string) => CadView | undefined;
  change: (next: Project, message: string) => void;
  say: (line: string) => void;
}) {
  const host = view?.file;
  const refs = refsOf(project, host);
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState<Record<string, RefStatus>>({});
  const tried = useRef(new Set<string>());
  const mark = (file: string, s: RefStatus | undefined) => setStatus((m) => { const n = { ...m }; if (s) n[keyOf(file)] = s; else delete n[keyOf(file)]; return n; });

  /** Reads a reference file: from its tab if open, the sample plans, else where it was found on this computer. */
  async function read(file: string): Promise<RefGeometry | null> {
    const tab = tabOf(file);
    return tab ? refGeometryOf(tab) : readRefFile(project.id, file);
  }
  async function load(file: string, again = false) {
    try {
      const g = await read(file);
      if (!g) { mark(file, 'missing'); if (again) say(`XREF  ${file} is not where it was found: Repath… to find it.`); return; }
      keepRefGeometry({ ...g, file });
      mark(file, undefined);
      setTick((t) => t + 1);
      if (again) say(`XREF  ${file} reloaded — ${g.segLayers.length.toLocaleString('en-GB')} lines`);
    } catch (e) { mark(file, 'missing'); say(e instanceof Error ? e.message : String(e)); }
  }

  // References not read yet are read once each (Reload reads one again).
  useEffect(() => {
    for (const r of refs) {
      if (r.unloaded || refGeometry(r.file) || tried.current.has(keyOf(r.file))) continue;
      tried.current.add(keyOf(r.file));
      void load(r.file);
    }
  }, [refs]); // eslint-disable-line react-hooks/exhaustive-deps -- when the plan's references change

  // Desktop: when the window comes back to the front, each reference file is checked for a change or a move.
  useEffect(() => {
    const check = async () => {
      for (const r of refs) {
        const g = refGeometry(r.file), path = pathOfPlan(project.id, r.file);
        if (!g || r.unloaded || !path) continue;
        const now = await fileStamp(path);
        if (now === undefined) continue;
        mark(r.file, now === null ? 'missing' : g.stamp && now !== g.stamp ? 'changed' : undefined);
      }
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [refs, project.id]);

  const statusOf = (r: CadRef): RefStatus => (r.unloaded ? 'unloaded' : status[keyOf(r.file)] ?? (refGeometry(r.file) ? 'loaded' : 'missing'));

  // What the canvas draws: each loaded reference placed on the plan, faded, with its layers' screen colours.
  const placed = useMemo(() => refs.flatMap((r) => {
    const g = !r.unloaded ? refGeometry(r.file) : undefined;
    if (!g) return [];
    const p = placeRef(g, r);
    return [{ ref: r, g, ...p, colours: g.layers.map((l) => refLayerStyle(r, l.name).color || l.rgb), fade: r.fade }];
  }), [refs, tick]); // eslint-disable-line react-hooks/exhaustive-deps -- geometry is kept outside React; tick follows it
  const snap = useMemo(() => refSnaps(placed), [placed]);

  /** Chooses a drawing (dialog or picker) for a reference; its path is remembered on this computer. */
  async function choose(): Promise<RefGeometry | null> {
    const v = await chooseDrawing();
    if (!v) return null;
    try {
      rememberPath(project.id, v.file, v.path);
      const g = refGeometryOf(v, (await fileStamp(v.path)) ?? undefined);
      keepRefGeometry(g);
      tried.current.add(keyOf(v.file));
      mark(v.file, undefined);
      setTick((t) => t + 1);
      return g;
    } finally { v.close(); }
  }

  /** Lines of the loaded references for Save DXF / DWG with Bind: on NAME$0$LAYER layers. */
  const bound = () => placed.flatMap((x) => {
    const out: { layer: string; kind: 'line'; pts: Pt[] }[] = [];
    for (let i = 0; i < x.segLayers.length; i++) out.push({ layer: boundLayerName(x.ref, x.g.layers[x.segLayers[i]]?.name ?? '0'), kind: 'line', pts: [[x.segs[i * 4], x.segs[i * 4 + 1]], [x.segs[i * 4 + 2], x.segs[i * 4 + 3]]] });
    return out;
  });

  const actions = {
    /** XA: a drawing chosen becomes a draft reference for the Attach dialog. */
    async attach(): Promise<CadRef | null> {
      if (!view || !host) { say('XATTACH  Open a plan first.'); return null; }
      try {
        const g = await choose();
        if (!g) return null;
        if (same(g.file, host)) { say('XATTACH  A plan cannot be a reference of itself.'); return null; }
        return newRef(project, host, g.file, g.units, view.info.units);
      } catch (e) { say(e instanceof Error ? e.message : String(e)); return null; }
    },
    confirm(r: CadRef) {
      if (!host) return;
      const g = refGeometry(r.file);
      change(withRef(project, host, r), `XATTACH  ${r.name} (${r.file}) on ${host} — ${r.type === 'overlay' ? 'overlay' : 'attach'} at ${fmt(r.at[0])}, ${fmt(r.at[1])}, ×${fmt(r.scale)}, ${fmt(r.rot)}°${g ? `, ${g.segLayers.length.toLocaleString('en-GB')} lines` : ''}, faded ${r.fade} % · ⌘Z to undo`);
    },
    reload(r: CadRef) {
      if (!host) return;
      dropRefGeometry(r.file);
      if (r.unloaded) change(updateRef(project, host, r.name, { unloaded: undefined }), `XREF  ${r.name} reloaded · ⌘Z to undo`);
      void load(r.file, true);
    },
    reloadAll() { for (const r of refs) if (!r.unloaded) { dropRefGeometry(r.file); void load(r.file, true); } },
    unload(r: CadRef) { if (host) change(updateRef(project, host, r.name, { unloaded: r.unloaded ? undefined : true }), `XREF  ${r.name} ${r.unloaded ? 'loaded' : 'unloaded: kept in the list, not drawn'} · ⌘Z to undo`); },
    detach(r: CadRef) {
      if (!host) return;
      if (r.found) skipRef(project.id, host, r.name, true);
      change(withoutRef(project, host, r.name), `XREF  ${r.name} detached from ${host}. ${r.file} is not changed · ⌘Z to undo`);
    },
    /** Repath: the reference (or one found inside the plan's drawing) found on this computer. */
    async repath(r: CadRef | CadXref) {
      if (!view || !host) return;
      try {
        const g = await choose();
        if (!g) return;
        if ('file' in r) {
          const next = same(g.file, r.file) ? project : updateRef(project, host, r.name, { file: g.file });
          change(updateRef(next, host, r.name, { unloaded: undefined }), `XREF  ${r.name} found: ${g.file} · ⌘Z to undo`);
          return;
        }
        const ref = refFromXref(project, host, r, g.file, g.units, view.info.units);
        skipRef(project.id, host, r.name, false);
        change(withRef(project, host, ref), `XREF  ${r.name} (found inside ${host}) shown from ${g.file}${r.inserts.length > 1 ? ` — at its first insert of ${r.inserts.length}` : ''} · ⌘Z to undo`);
      } catch (e) { say(e instanceof Error ? e.message : String(e)); }
    },
    update(r: CadRef, patch: Partial<CadRef>, what: string) { if (host) change(updateRef(project, host, r.name, patch), `XREF  ${r.name}: ${what} · ⌘Z to undo`); },
    layer(r: CadRef, layer: string, patch: Parameters<typeof withRefLayer>[4]) { if (host) change(withRefLayer(project, host, r.name, layer, patch), `Layer ${r.name}|${layer} changed · ⌘Z to undo`); }
  };

  /** References inside the plan's own drawing that are not on the plan yet (their file to be found). */
  const found = (view?.info.xrefs ?? []).filter((x) => !refs.some((r) => same(r.name, x.name)));

  /** Reads a reference found inside the plan's drawing: from its tab if open, where its file was found before on this
   * computer, else from the places xrefCandidates names (desktop). Its path is remembered when found. */
  async function lookFor(x: CadXref, hostPath?: string): Promise<{ g: RefGeometry; path?: string } | null> {
    const name = xrefFile(x.path, x.name);
    const tab = tabOf(name);
    if (tab) return { g: refGeometryOf(tab), path: tab.path };
    const readBytes = window.lvds?.cadFile?.readBytes;
    if (!readBytes) return null;
    const known = pathOfPlan(project.id, name);
    for (const path of [...(known ? [known] : []), ...xrefCandidates(x.path, x.name, hostPath)]) {
      const bytes = await readBytes(path).catch(() => null);
      if (!bytes) continue;
      rememberPath(project.id, bytes.file, path);
      return { g: await readRefGeometry(bytes.file, bytes.bytes, (await fileStamp(path)) ?? undefined), path };
    }
    return null;
  }

  // When a plan opens, the references inside its drawing are looked for on this computer once each, and those found
  // are shown under it (⌘Z undoes it; one detached is not looked for again here).
  const latest = useRef({ project, host });
  latest.current = { project, host };
  const looked = useRef(new Set<string>());
  const foundKey = found.map((x) => x.name).join('|');
  useEffect(() => {
    if (!view || !host || !found.length) return;
    const off = skippedRefs(project.id, host);
    const todo = found.filter((x) => !looked.current.has(`${keyOf(host)}|${keyOf(x.name)}`) && !off.some((n) => same(n, x.name)));
    if (!todo.length) return;
    for (const x of todo) looked.current.add(`${keyOf(host)}|${keyOf(x.name)}`);
    const hostPath = view.path ?? pathOfPlan(project.id, host), units = view.info.units;
    void (async () => {
      const hits: { x: CadXref; g: RefGeometry; path?: string }[] = [], missed: string[] = [];
      for (const x of todo) {
        const hit = await lookFor(x, hostPath).catch(() => null);
        if (hit && !same(hit.g.file, host)) hits.push({ x, ...hit }); else missed.push(x.name);
      }
      const now = latest.current;
      if (!same(now.host ?? '', host)) return;
      let next = now.project;
      const shown: string[] = [];
      for (const h of hits) {
        if (refsOf(next, host).some((r) => same(r.name, h.x.name))) continue;
        keepRefGeometry(h.g);
        tried.current.add(keyOf(h.g.file));
        mark(h.g.file, undefined);
        next = withRef(next, host, refFromXref(next, host, h.x, h.g.file, h.g.units, units));
        shown.push(`${h.x.name}${h.path ? ` (${h.path})` : ''}`);
      }
      if (shown.length) { setTick((t) => t + 1); change(next, `XREF  Found inside ${host} and shown under it: ${shown.join(', ')} · ⌘Z to undo`); }
      if (missed.length) say(`XREF  Not found on this computer: ${missed.join(', ')} (inside ${host}). References → Repath… finds ${missed.length > 1 ? 'them' : 'it'}.`);
    })();
  }, [host, foundKey]); // eslint-disable-line react-hooks/exhaustive-deps -- once per plan and its references

  return { refs, placed, snap, statusOf, actions, found, bound };
}
export type CadRefsState = ReturnType<typeof useCadRefs>;

const PILL: Record<RefStatus, string> = { loaded: 'ok', changed: 'warn', unloaded: 'm', missing: 'bad' };

/** Design CAD → References (XR): the references of the plan with their status; Attach…, Reload, Unload, Detach,
 * Repath…, Clip and Bind…. The files themselves are never changed. */
export function RefManager({ file, level, x, onAttach, onClip, onBind, onClose }: {
  file: string;
  level?: string;
  x: CadRefsState;
  onAttach: () => void;
  onClip: (r: CadRef) => void;
  onBind: () => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<string | null>(x.refs[0]?.name ?? null);
  const r = x.refs.find((it) => it.name === sel);
  return (
    <Modal onClose={onClose} className="modal" style={{ maxWidth: 900 }} label="References">
      <h3>References <span className="m">{file}{level ? ` · ${level}` : ''}</span></h3>
      <div className="cad-actions">
        <button className="chip primary" onClick={onAttach}>Attach…</button>
        <button className="chip" disabled={!x.refs.length} onClick={() => x.actions.reloadAll()}>Reload all</button>
        <button className="chip" disabled={!r} onClick={() => r && x.actions.reload(r)}>Reload</button>
        <button className="chip" disabled={!r} onClick={() => r && x.actions.detach(r)}>Detach</button>
        <button className="chip" disabled={!r} onClick={() => r && x.actions.unload(r)}>{r?.unloaded ? 'Load' : 'Unload'}</button>
        <button className="chip" disabled={!r} onClick={() => r && void x.actions.repath(r)}>Repath…</button>
        <button className="chip" disabled={!r || !!r.unloaded} onClick={() => r && onClip(r)}>Clip</button>
        <button className="chip" disabled={!r?.clip} onClick={() => r && x.actions.update(r, { clip: undefined }, 'clip off')}>Clip off</button>
        <button className="chip" disabled={!x.placed.length} title="Save a copy of the plan with the references' lines in it, on NAME$0$LAYER layers (the project keeps them as references)" onClick={onBind}>Bind…</button>
      </div>
      <table className="sched" aria-label="References">
        <thead><tr><th>Name</th><th>Status</th><th>File</th><th>Type</th><th>Insert at</th><th>Scale</th><th>Rotation</th><th>Fade</th><th>Prints</th></tr></thead>
        <tbody>
          {x.refs.map((it) => {
            const st = x.statusOf(it);
            return (
              <tr key={it.name} aria-selected={it.name === sel} onClick={() => setSel(it.name)} style={it.name === sel ? { outline: '1px solid var(--acc)' } : undefined}>
                <td>{it.name}{it.clip ? <span className="m"> · clipped</span> : null}</td>
                <td><span className={PILL[st]}>{REF_STATUS[st]}</span></td>
                <td>{it.file}{it.found ? <span className="m"> · found inside {file}</span> : null}</td>
                <td><select aria-label={`${it.name} type`} value={it.type} onChange={(e) => x.actions.update(it, { type: e.target.value as CadRef['type'] }, e.target.value)}><option value="overlay">Overlay</option><option value="attach">Attach</option></select></td>
                <td>{fmt(it.at[0])}, {fmt(it.at[1])}</td>
                <td><NumberField label={`${it.name} scale`} value={it.scale} min={1e-9} onSet={(v) => x.actions.update(it, { scale: v }, `scale ×${fmt(v)}`)} /></td>
                <td><NumberField label={`${it.name} rotation`} value={it.rot} onSet={(v) => x.actions.update(it, { rot: v }, `rotation ${fmt(v)}°`)} />°</td>
                <td><select aria-label={`${it.name} fade`} value={it.fade} onChange={(e) => x.actions.update(it, { fade: Number(e.target.value) }, `faded ${e.target.value} %`)}>{FADES.map((f) => <option key={f} value={f}>{f} %</option>)}</select></td>
                <td><input type="checkbox" aria-label={`${it.name} prints`} checked={it.print} onChange={(e) => x.actions.update(it, { print: e.target.checked }, e.target.checked ? 'prints on the plan sheets' : 'stays off the plan sheets')} /></td>
              </tr>
            );
          })}
          {x.found.map((f) => (
            <tr key={`found:${f.name}`}>
              <td>{f.name}</td>
              <td><span className="bad">{REF_STATUS.missing}</span></td>
              <td>{f.path || '—'} <span className="m">· found inside {file}</span></td>
              <td>{f.overlay ? 'Overlay' : 'Attach'}</td>
              <td colSpan={5}><button className="chip" onClick={() => void x.actions.repath(f)}>Repath… to find it on this computer</button></td>
            </tr>
          ))}
          {!x.refs.length && !x.found.length && <tr><td colSpan={9} className="m">No references yet. Attach… shows another drawing under this plan: the structure, other services, a site plan.</td></tr>}
        </tbody>
      </table>
      {r && <RefLayers r={r} x={x} />}
      <p className="m">Detach removes a reference from this plan (⌘Z undoes it). The files are never changed. References found inside the plan's own drawing are listed too, so a missing one can be found and shown. A reference prints on the plan sheets with the References pen, grey.</p>
      <div className="modal-actions"><span className="sp" /><button className="chip primary" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

const FADES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

function NumberField({ label, value, min, onSet }: { label: string; value: number; min?: number; onSet: (v: number) => void }) {
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]);
  const done = () => { const v = Number(text); if (Number.isFinite(v) && (min === undefined || v >= min) && v !== value) onSet(v); else setText(fmt(value)); };
  return <input aria-label={label} value={text} size={7} onChange={(e) => setText(e.target.value)} onBlur={done} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } }} />;
}

/** A reference's layers as NAME|LAYER: on, screen colour, print. */
export function RefLayers({ r, x }: { r: CadRef; x: CadRefsState }) {
  const g = x.placed.find((p) => p.ref.name === r.name)?.g ?? refGeometry(r.file);
  if (!g) return null;
  const counts = new Map<number, number>();
  for (const l of g.segLayers) counts.set(l, (counts.get(l) ?? 0) + 1);
  return (
    <>
      <h4>Layers of {r.name}</h4>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        <table className="sched" aria-label={`Layers of ${r.name}`}>
          <thead><tr><th>Layer</th><th>Lines</th><th>On</th><th>Print</th><th>Colour on screen</th></tr></thead>
          <tbody>{g.layers.map((l, i) => counts.get(i) ? (
            <tr key={l.name}>
              <td>{r.name}|{l.name}</td><td>{counts.get(i)}</td>
              <td><input type="checkbox" aria-label={`${r.name}|${l.name} on`} checked={!refLayerStyle(r, l.name).hidden} onChange={(e) => x.actions.layer(r, l.name, { hidden: !e.target.checked })} /></td>
              <td><input type="checkbox" aria-label={`${r.name}|${l.name} prints`} checked={!refLayerStyle(r, l.name).noPrint} onChange={(e) => x.actions.layer(r, l.name, { noPrint: !e.target.checked })} /></td>
              <td><select aria-label={`${r.name}|${l.name} colour`} value={refLayerStyle(r, l.name).color ?? ''} onChange={(e) => x.actions.layer(r, l.name, { color: e.target.value || undefined })}>
                {LAYER_COLOURS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select></td>
            </tr>
          ) : null)}</tbody>
        </table>
      </div>
    </>
  );
}

/** The Layers panel's references: each reference's layers as NAME|LAYER, a click turns one on or off. */
export function RefLayersList({ x }: { x: CadRefsState }) {
  return (
    <>
      {x.placed.map(({ ref, g }) => {
        const used = new Set(g.segLayers);
        return (
          <div key={ref.name} role="group" aria-label={`Layers of ${ref.name}`}>
            <div className="m">{ref.name} <span className="m">reference</span></div>
            {g.layers.map((l, i) => used.has(i) ? (() => {
              const st = refLayerStyle(ref, l.name);
              return (
                <button key={l.name} className={`cad-lyr${st.hidden ? ' off' : ''}`} aria-pressed={!st.hidden} onClick={() => x.actions.layer(ref, l.name, { hidden: !st.hidden })}>
                  <i style={{ background: st.color || (l.rgb === 0xff000007 ? 'var(--cad-ink)' : `#${l.rgb.toString(16).padStart(6, '0').slice(-6)}`), opacity: 1 - ref.fade / 100 }} />{ref.name}|{l.name}<span className="m">{st.hidden ? 'off' : 'on'}</span>
                </button>
              );
            })() : null)}
          </div>
        );
      })}
    </>
  );
}

/** Attach (XA): how the reference sits on the plan before it is attached. "Pick on plan" closes the dialog for a click
 * and comes back with the point. */
export function AttachDialog({ draft, level, units, onPick, onCancel, onAttach }: {
  draft: CadRef;
  level?: string;
  /** The file's units and the plan's, as the drawings say them (for the scale hint). */
  units: { ref?: string; plan?: string };
  onPick: (r: CadRef) => void;
  onCancel: () => void;
  onAttach: (r: CadRef) => void;
}) {
  const [r, setR] = useState(draft);
  const set = (patch: Partial<CadRef>) => setR((v) => ({ ...v, ...patch }));
  const num = (v: string, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
  const g = refGeometry(r.file);
  const origin = r.at[0] === 0 && r.at[1] === 0;
  return (
    <Modal onClose={onCancel} onSubmit={(e) => { e.preventDefault(); if (r.name.trim() && r.scale > 0) onAttach({ ...r, name: r.name.trim() }); }} className="modal" style={{ maxWidth: 520 }} label="Attach a reference">
      <h3>Attach a reference <span className="m">{level ? `to ${level}` : ''}</span></h3>
      <div className="cad-devform">
        <label>File<span>{r.file} <span className="m">{g ? `· ${g.segLayers.length.toLocaleString('en-GB')} lines` : ''}{units.ref ? ` · ${units.ref}` : ''}</span></span></label>
        <label>Name<input aria-label="Reference name" value={r.name} onChange={(e) => set({ name: e.target.value.replace(/[|$]/g, '_') })} /></label>
        <label>Type<select aria-label="Reference type" value={r.type} onChange={(e) => set({ type: e.target.value as CadRef['type'] })}><option value="overlay">Overlay</option><option value="attach">Attach</option></select></label>
        <span className="m">Overlay: shown on this plan only. Attach: also comes along when this plan is saved with references and opened elsewhere.</span>
        <label>Insert at
          <span>
            <button type="button" className={`chip${origin ? ' primary' : ''}`} onClick={() => set({ at: [0, 0] })}>Same origin 0, 0</button>{' '}
            <button type="button" className={`chip${origin ? '' : ' primary'}`} onClick={() => onPick(r)}>{origin ? 'Pick on plan' : `${fmt(r.at[0])}, ${fmt(r.at[1])}`}</button>
          </span>
        </label>
        <label>Scale<input aria-label="Reference scale" value={r.scale} onChange={(e) => set({ scale: num(e.target.value, r.scale) })} /><span className="m">{units.ref && units.plan ? `from units: ${units.ref} → ${units.plan}` : 'the drawings do not both say their units'}</span></label>
        <label>Rotation<input aria-label="Reference rotation" value={r.rot} onChange={(e) => set({ rot: num(e.target.value, r.rot) })} />°</label>
        <label>Fade<select aria-label="Reference fade" value={r.fade} onChange={(e) => set({ fade: Number(e.target.value) })}>{FADES.map((f) => <option key={f} value={f}>{f} %</option>)}</select></label>
        <label><input type="checkbox" aria-label="Reference prints" checked={r.print} onChange={(e) => set({ print: e.target.checked })} /> Prints on plan sheets, grey <span className="m">· References pen</span></label>
      </div>
      <div className="modal-actions"><span className="sp" /><button type="button" className="chip" onClick={onCancel}>Cancel</button><button type="submit" className="chip primary">Attach</button></div>
    </Modal>
  );
}
