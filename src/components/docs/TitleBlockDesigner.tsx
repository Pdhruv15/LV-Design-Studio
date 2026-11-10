import { ask } from '../ConfirmDialog';
import { useMemo, useRef, useState } from 'react';
import type { Project } from '../../types';
import { addCol, addRow, detectArea, drawnTitleBlockHtml, isDrawn, loadTemplateLibrary, mergeDown, mergeRight, paperOf, removeCol, removeRow, revRowsIn, saveTemplateLibrary, split, standardTemplate, templateSize, titleBlockHtml, type Border, type TbCell, type TitleTemplate } from '../../model/titleBlock';
import { drawnFromDrawing, drawnFromPieces, fieldCount, mapText, REV_ROW_FIELD_LIST, SHEET_FIELDS } from '../../model/titleBlockImport';
import { chooseDrawing, explodeObjects } from '../../engines/cad/cadEngine';
import { askText } from '../ConfirmDialog';
import { sanitizeSvg } from '../../util/sanitize';
import { fillParams, paramList } from '../../model/params';
import { saveText } from '../../util/files';
import { Page } from '../ui';
import { sanitizeHtml } from '../../util/sanitize';

const PX = 3.2; // preview px per mm

/** Design title blocks: a grid of cells with text and {Parameters}, the
 * logo or the revision table; merge / split cells, add rows and columns,
 * set sizes. Save several templates, pick the one the SLD sheet uses, keep
 * them as your library or share them as a file. */
export default function TitleBlockDesigner({ project, onChange, onStatus, onParams, onEditInCad }: { project: Project; onChange: (p: Project) => void; onStatus: (m: string) => void; onParams: () => void; /** Opens the template in Design CAD (a drawn copy of a grid template) to draw on it. */ onEditInCad?: (t: TitleTemplate) => void }) {
  const templates = project.titleTemplates ?? [];
  const [sel, setSel] = useState(templates[0]?.id ?? '');
  const t = templates.find((x) => x.id === sel) ?? templates[0];
  const [cellId, setCellId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const params = useMemo(() => paramList(project).map((x) => x.name), [project]);
  const active = project.drawing?.titleTemplateId;

  const setTemplates = (next: TitleTemplate[]) => onChange({ ...project, titleTemplates: next });
  const setT = (next: TitleTemplate) => setTemplates(templates.map((x) => (x.id === next.id ? next : x)));
  const create = (base: TitleTemplate, name: string) => {
    const nt = { ...structuredClone(base), id: `tb-${Date.now().toString(36)}`, name };
    setTemplates([...templates, nt]);
    setSel(nt.id);
  };
  const cell = t?.cells.find((x) => x.id === cellId);
  const setCell = (patch: Partial<TbCell>) => t && cell && setT({ ...t, cells: t.cells.map((x) => (x.id === cell.id ? { ...x, ...patch } : x)) });
  /** The company's title block from a DWG / DXF: the whole drawing, or one of its inserted blocks (exploded by the engine,
   * its attributes becoming fields), as a drawn template with its fields guessed from the tags. */
  const importFromCad = async () => {
    let view: Awaited<ReturnType<typeof chooseDrawing>> = null;
    try {
      view = await chooseDrawing();
      if (!view) return;
      const inserts = view.blocks();
      const names = [...new Set(inserts.map((b) => b.block))];
      const base = view.file.replace(/\.(dwg|dxf)$/i, '');
      let template: TitleTemplate;
      const choice = names.length ? await askText('Import a title block', { label: 'Take', options: ['The whole drawing', ...names.map((n) => `Block ${n}`)], initial: 'The whole drawing', confirmLabel: 'Import' }) : 'The whole drawing';
      if (choice === null) return;
      if (choice === 'The whole drawing') template = drawnFromDrawing({ units: view.info.units, segs: view.segs, texts: view.info.texts }, base);
      else {
        const blockName = choice.replace(/^Block /, ''), ins = inserts.find((b) => b.block === blockName)!;
        const { pieces } = await explodeObjects(view, [ins.handle]);
        template = drawnFromPieces(pieces[ins.handle] ?? Object.values(pieces).flat(), view.info.units, `${base} ${blockName}`);
      }
      create(template, template.name);
      const { w, h } = templateSize(template);
      onStatus(`Imported ${template.name}: ${w} × ${h} mm, ${template.shapes?.length ?? 0} lines, ${template.texts?.length ?? 0} texts, ${fieldCount(template)} mapped to the project`);
    } catch (e) {
      onStatus(e instanceof Error ? e.message : String(e));
    } finally { view?.close(); }
  };

  if (!t) {
    return (
      <Page title="Title block designer" intro="Make your own title blocks for the SLD sheet: your layout, logo, text and {Parameters} such as {DesignedBy} and {SubmissionDate}.">
        <div className="card">
          <p>No title block template in this project yet.</p>
          <button className="chip primary" onClick={() => create(standardTemplate(), 'My title block')}>Start from the standard block</button>
          <button className="chip" title="Your company's title block from a DWG or DXF: its lines and texts, its attributes mapped to the project" onClick={() => void importFromCad()}>Import DWG / DXF…</button>
          {loadTemplateLibrary().map((x) => <button key={x.id} className="chip" onClick={() => create(x, x.name)}>From my library: {x.name}</button>)}
        </div>
      </Page>
    );
  }

  const W = t.cols.reduce((a, b) => a + b, 0), H = t.rows.reduce((a, b) => a + b, 0);
  const covered = new Set<string>();
  for (const c of t.cells) for (let r = c.r; r < c.r + (c.rs ?? 1); r++) for (let k = c.c; k < c.c + (c.cs ?? 1); k++) covered.add(`${r},${k}`);
  const list = paramList(project);

  return (
    <Page
      title="Title block designer"
      intro="Click a cell to edit it. Text can hold {Parameters} (Home → Parameters). The SLD sheet uses the template marked “Used on the SLD”."
      actions={<>
        <select className="chip" value={t.id} onChange={(e) => { setSel(e.target.value); setCellId(''); }}>
          {templates.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === active ? ' (used on the SLD)' : ''}</option>)}
        </select>
        <button className="chip" onClick={() => create(standardTemplate(), `Title block ${templates.length + 1}`)}>New</button>
        <button className="chip" title="Your company's title block from a DWG or DXF: its lines and texts, its attributes mapped to the project" onClick={() => void importFromCad()}>Import DWG / DXF…</button>
        {onEditInCad && <button className="chip" title="Draw on this block in Design CAD at 1 : 1 mm (a grid block becomes a drawn copy first); TBSAVE or the palette's Save as template brings it back" onClick={() => onEditInCad(t)}>Edit in CAD</button>}
        <button className="chip" onClick={() => create(t, `${t.name} (copy)`)}>Duplicate</button>
        <button className={`chip${t.id === active ? '' : ' primary'}`} onClick={() => onChange({ ...project, drawing: { ...project.drawing, titleTemplateId: t.id === active ? undefined : t.id } })}>
          {t.id === active ? 'Use the standard block instead' : 'Use on the SLD'}
        </button>
      </>}
    >
      {isDrawn(t) ? <DrawnEditor t={t} project={project} params={params} setT={setT} onProject={onChange} onStatus={onStatus} onDelete={async () => { if (await ask(`Delete “${t.name}”?`)) { setTemplates(templates.filter((x) => x.id !== t.id)); if (active === t.id) onChange({ ...project, titleTemplates: templates.filter((x) => x.id !== t.id), drawing: { ...project.drawing, titleTemplateId: undefined } }); setSel(''); } }} /> : (
      <div className="tbd-grid">
        <div>
          <div className="tbd-preview-wrap">
            <div className="tbd-preview" style={{ width: W * PX, height: H * PX, gridTemplateColumns: t.cols.map((c) => `${c * PX}px`).join(' '), gridTemplateRows: t.rows.map((r) => `${r * PX}px`).join(' ') }}>
              {t.cells.map((c) => (
                <button key={c.id} className={`tbd-cell${c.id === cellId ? ' on' : ''}`} onClick={() => setCellId(c.id)}
                  style={{ gridRow: `${c.r + 1} / span ${c.rs ?? 1}`, gridColumn: `${c.c + 1} / span ${c.cs ?? 1}`, textAlign: c.align ?? 'left' }}>
                  {c.caption && <span className="tbd-cap">{c.caption}</span>}
                  <span style={{ fontSize: (c.size ?? 8) * 1.25, fontWeight: c.bold ? 700 : 400 }}>
                    {c.kind === 'logo' ? (project.drawing?.logo ? <img src={project.drawing.logo} alt="" style={{ maxWidth: '100%', maxHeight: (t.rows[c.r] * (c.rs ?? 1)) * PX - 6 }} /> : <i>logo</i>)
                      : c.kind === 'revisions' ? <i>revision table</i> : fillParams(c.text, project, {}, list) || <i className="m">empty</i>}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className="m">{W} × {H} mm · {t.cols.length} columns × {t.rows.length} rows</p>
          <div className="tbd-sizes">
            <span className="m">Column widths (mm):</span>
            {t.cols.map((w, i) => <input key={`c${i}-${w}`} className="bi-num" style={{ width: 52 }} defaultValue={w} onBlur={(e) => { const v = +e.target.value; if (v > 3) setT({ ...t, cols: t.cols.map((x, k) => (k === i ? v : x)) }); }} />)}
          </div>
          <div className="tbd-sizes">
            <span className="m">Row heights (mm):</span>
            {t.rows.map((h, i) => <input key={`r${i}-${h}`} className="bi-num" style={{ width: 52 }} defaultValue={h} onBlur={(e) => { const v = +e.target.value; if (v > 2) setT({ ...t, rows: t.rows.map((x, k) => (k === i ? v : x)) }); }} />)}
          </div>
          <div className="tbd-sizes">
            <span className="m">Name:</span>
            <input className="bi-text" style={{ width: 220 }} defaultValue={t.name} key={t.name} onBlur={(e) => e.target.value.trim() && setT({ ...t, name: e.target.value.trim() })} />
            <button className="chip" onClick={() => { const lib = loadTemplateLibrary().filter((x) => x.name !== t.name); onStatus(saveTemplateLibrary([...lib, t]) ? `Saved “${t.name}” to your library on this computer` : 'Could not save the library'); }}>Save to my library</button>
            <button className="chip" onClick={async () => { const m = await saveText(`${t.name}.titleblock.json`, JSON.stringify(t, null, 2), 'Title block', 'json'); if (m) onStatus(m); }}>Export</button>
            <button className="chip" onClick={() => fileRef.current?.click()}>Import</button>
            <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try { const x = JSON.parse(await f.text()) as TitleTemplate; if (!Array.isArray(x.cells) || !Array.isArray(x.cols)) throw new Error(); create(x, x.name || 'Imported'); onStatus(`Imported “${x.name}”`); } catch { onStatus('That file is not a title block'); }
            }} />
            <button className="linkish bad" onClick={async () => { if (await ask(`Delete “${t.name}”?`)) { setTemplates(templates.filter((x) => x.id !== t.id)); if (active === t.id) onChange({ ...project, titleTemplates: templates.filter((x) => x.id !== t.id), drawing: { ...project.drawing, titleTemplateId: undefined } }); setSel(''); } }}>Delete</button>
          </div>
        </div>

        <section className="card tbd-side">
          {!cell ? <p className="m">Click a cell in the block to edit it.</p> : (
            <>
              <h4 style={{ margin: 0 }}>Cell (row {cell.r + 1}, column {cell.c + 1})</h4>
              <label>Holds
                <select value={cell.kind} onChange={(e) => setCell({ kind: e.target.value as TbCell['kind'] })}>
                  <option value="text">Text and parameters</option>
                  <option value="logo">Company logo</option>
                  <option value="revisions">Revision table (last 4)</option>
                </select>
              </label>
              <label>Caption (small, top left)<input value={cell.caption ?? ''} onChange={(e) => setCell({ caption: e.target.value || undefined })} placeholder="e.g. DESIGNED BY" /></label>
              {cell.kind === 'text' && (
                <>
                  <label>Text<textarea value={cell.text} onChange={(e) => setCell({ text: e.target.value })} rows={3} /></label>
                  <div className="tbd-params">
                    {params.slice(0, 40).map((n) => <button key={n} className="param-chip" onClick={() => setCell({ text: `${cell.text}{${n}}` })}>{`{${n}}`}</button>)}
                    <button className="linkish" onClick={onParams}>all parameters…</button>
                  </div>
                  <div className="tbd-row">
                    <label>Size (pt)<input type="number" min={5} max={24} value={cell.size ?? 8} onChange={(e) => setCell({ size: +e.target.value || 8 })} /></label>
                    <label className="row"><input type="checkbox" checked={!!cell.bold} onChange={(e) => setCell({ bold: e.target.checked || undefined })} /> Bold</label>
                    <label>Align
                      <select value={cell.align ?? 'left'} onChange={(e) => setCell({ align: e.target.value as TbCell['align'] })}>
                        <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
                      </select>
                    </label>
                  </div>
                </>
              )}
              <div className="tbd-row">
                <button className="chip" onClick={() => { const n = mergeRight(t, cell.id); if (n === t) onStatus('Can’t merge right: the cells there don’t line up with this one'); else setT(n); }}>Merge right</button>
                <button className="chip" onClick={() => { const n = mergeDown(t, cell.id); if (n === t) onStatus('Can’t merge down: the cells there don’t line up with this one'); else setT(n); }}>Merge down</button>
                {((cell.rs ?? 1) > 1 || (cell.cs ?? 1) > 1) && <button className="chip" onClick={() => setT(split(t, cell.id))}>Split</button>}
              </div>
              <div className="tbd-row">
                <button className="chip" onClick={() => setT(addRow(t, cell.r + (cell.rs ?? 1) - 1))}>+ Row below</button>
                <button className="chip" onClick={() => setT(addCol(t, cell.c + (cell.cs ?? 1) - 1))}>+ Column right</button>
              </div>
              <div className="tbd-row">
                <button className="chip" onClick={() => { setT(removeRow(t, cell.r)); setCellId(''); }}>Delete row</button>
                <button className="chip" onClick={() => { setT(removeCol(t, cell.c)); setCellId(''); }}>Delete column</button>
              </div>
            </>
          )}
          <details style={{ marginTop: 10 }}>
            <summary className="m">Printed version</summary>
            <div className="tbd-print" dangerouslySetInnerHTML={{ __html: sanitizeHtml(titleBlockHtml(t, project)) }} />
          </details>
        </section>
      </div>
      )}
      <p className="m">{isDrawn(t) || covered.size === t.rows.length * t.cols.length ? '' : '⚠ Some grid positions are empty.'} The block sits at the bottom right of the SLD sheet, inside the frame, in PDF and DXF exports. DXF keeps the grid and text editable; raster logos are shown in the PDF.</p>
    </Page>
  );
}

/** A drawn (imported) template: the block as it prints, its size, and every text with the field it is mapped to. One the
 * size of a paper can be that paper's whole border: the sheet then draws it in place of its frame and works inside its
 * drawing area (shown dashed; found from the lines, or typed). */
function DrawnEditor({ t, project, params, setT, onProject, onStatus, onDelete }: { t: TitleTemplate; project: Project; params: string[]; setT: (t: TitleTemplate) => void; onProject: (p: Project) => void; onStatus: (m: string) => void; onDelete: () => void }) {
  const { w, h } = templateSize(t);
  const fields = [...SHEET_FIELDS, ...REV_ROW_FIELD_LIST, ...params.map((n) => `{${n}}`).filter((f) => !SHEET_FIELDS.includes(f))];
  const texts = t.texts ?? [];
  const paper = paperOf({ w, h }), b = t.border, usedOn = !!paper && project.drawing?.borderByPaper?.[paper] === t.id;
  const area = b ? `<rect x="${b.area.x}" y="${b.area.y}" width="${b.area.w}" height="${b.area.h}" fill="none" stroke-width="0.6" stroke-dasharray="3 1.5" style="stroke:var(--acc)"/>` : '';
  const setArea = (patch: Partial<Border['area']>) => b && setT({ ...t, border: { ...b, area: { ...b.area, ...patch } } });
  const revRows = revRowsIn(t);
  return (
    <div className="tbd-grid">
      <div>
        <div className="tbd-preview-wrap" style={{ width: Math.min(w * PX + 24, 1100) }} dangerouslySetInnerHTML={{ __html: sanitizeSvg(drawnTitleBlockHtml(t, project).replace('</svg>', `${area}</svg>`)).replace(/width="[^"]+" height="[^"]+"/, `width="${w * PX}" height="${h * PX}"`) }} />
        <p className="m">{w} × {h} mm · {t.shapes?.length ?? 0} lines and shapes · {texts.length} texts, {fieldCount(t)} of them fields{revRows ? `, ${revRows} revision rows of its own` : ''}. Imported from a drawing: a field prints the project's value in the text's place and goes to DXF / DWG as an attribute of the block.</p>
        {paper && (
          <div className="tbd-sizes">
            <label className="row" title="A template the size of a paper can be that paper's whole border: its sheets then draw it in place of the app's frame, zone strip and title band, and work inside its drawing area"><input type="checkbox" checked={!!b} onChange={(e) => setT({ ...t, border: e.target.checked ? { paper, area: detectArea(t, { w, h }) } : undefined })} /> Whole border of {paper} sheets</label>
            {b && <>
              <span className="m">Drawing area (mm):</span>
              {(['x', 'y', 'w', 'h'] as const).map((k) => <label key={k} className="row">{k}<input type="number" step={0.5} style={{ width: 64 }} value={b.area[k]} onChange={(e) => setArea({ [k]: +e.target.value || 0 })} /></label>)}
              <button className="chip" title="Find the drawing area again: the largest rectangle bounded by the block's lines that holds no text and no line" onClick={() => setArea(detectArea(t, { w, h }))}>Detect</button>
              <button className={`chip${usedOn ? '' : ' primary'}`} title={usedOn ? `${paper} sheets go back to the app's frame and the block chosen for their kind` : `${paper} sheets print in this border`} onClick={() => onProject({ ...project, drawing: { ...project.drawing, borderByPaper: { ...project.drawing?.borderByPaper, [paper]: usedOn ? undefined : t.id } } })}>{usedOn ? `Not on ${paper} sheets` : `Use on ${paper} sheets`}</button>
            </>}
          </div>
        )}
        <div className="tbd-sizes">
          <span className="m">Name:</span>
          <input className="bi-text" style={{ width: 220 }} defaultValue={t.name} key={t.name} onBlur={(e) => e.target.value.trim() && setT({ ...t, name: e.target.value.trim() })} />
          <button className="chip" onClick={() => { const lib = loadTemplateLibrary().filter((x) => x.name !== t.name); onStatus(saveTemplateLibrary([...lib, t]) ? `Saved “${t.name}” to your library on this computer` : 'Could not save the library'); }}>Save to library</button>
          <button className="chip" onClick={async () => { const m = await saveText(`${t.name}.titleblock.json`, JSON.stringify(t, null, 2), 'Title block', 'json'); if (m) onStatus(m); }}>Export</button>
          <button className="linkish bad" onClick={() => void onDelete()}>Delete</button>
        </div>
      </div>
      <section className="card tbd-side">
        <h4 style={{ margin: 0 }}>Texts and fields</h4>
        <p className="m">Each text of the block: the drawing's words, or the field it prints. Tags are guessed from their names (DWG_NO, REV, DRN …).</p>
        <div className="tbd-fields">
          {texts.map((x) => {
            const isField = /\{[^}]+\}/.test(x.text);
            return (
              <label key={x.id} title={`${x.tag ? `Attribute ${x.tag} · ` : ''}${x.x} / ${x.y} mm, ${x.h} mm high`}>
                <span className="m">{x.tag ?? x.orig ?? x.text}</span>
                <select value={isField ? x.text : ''} onChange={(e) => setT(mapText(t, x.id, e.target.value))}>
                  <option value="">{x.orig && isField ? `Fixed: ${x.orig}` : 'Fixed text'}</option>
                  {fields.map((f) => <option key={f} value={f}>{f}</option>)}
                  {isField && !fields.includes(x.text) && <option value={x.text}>{x.text}</option>}
                </select>
              </label>
            );
          })}
          {!texts.length && <p className="m">The block has no texts.</p>}
        </div>
      </section>
    </div>
  );
}
