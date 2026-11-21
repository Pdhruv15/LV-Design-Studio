import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  addHere, changePlan, customiseCounts, customisePaths, customiseRows, noOverrides, renamedOldPaths, renameHere, roleHere, roleOff,
  templateWithOverrides, toggleHide, whereFilesGo, withOverrides, type CustomiseRow
} from '../model/folderCustomise';
import { ROLE_CATALOGUE, roleById } from '../model/folderRoles';
import { duplicateTemplate, freeName } from '../model/folderTemplateEdit';
import { buildingFolders } from '../model/folderLayouts';
import { applyOverrides, emptyOverrides, type FolderBuilding, type FolderTemplate, type ProjectFolder, type ProjectFolderOverrides } from '../model/folderTemplates';
import { allTemplates, saveTemplate, templatesClient, type TemplatesClient } from '../model/folderTemplatesClient';
import { cleanFolderName, folderBuildings, folderFlags, folderVars, offByDefault, rememberFolder } from '../model/projectFolderPlan';
import type { Project } from '../types';
import { TemplateEditor } from './FolderTemplatesPanel';
import { plural, useFolderTemplates, type FolderDisk } from './projectFolderActions';
import { Modal } from './ui';

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const GROUPS = [...new Set(ROLE_CATALOGUE.map((r) => r.group))];
const roleLabel = (r: string) => roleById(r)?.label ?? r;
const files = (n: number | undefined) => (n === undefined || n < 0 ? '' : n >= 5000 ? '5000+ files' : plural(n, 'file'));
const overrideCount = (ov?: ProjectFolderOverrides) => (ov ? ov.add.length + ov.rename.length + ov.hide.length + Object.keys(ov.roles).length : 0);

/** Which of `paths` are on disk, and the file counts of `countPaths`; nothing without a desktop folder. */
function useOnDisk(disk: FolderDisk | undefined, root: string | undefined, paths: readonly string[], countPaths: readonly string[]) {
  const [present, setPresent] = useState<ReadonlySet<string>>(new Set());
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(new Map());
  const [error, setError] = useState('');
  const key = JSON.stringify([paths, countPaths]);
  useEffect(() => {
    let live = true;
    if (!disk || !root) return;
    disk.status(root, [...paths]).then((s) => { if (live) setPresent(new Set(s.present)); }).catch((e) => { if (live) setError(message(e)); });
    if (disk.fileCounts && countPaths.length) {
      const list = countPaths.slice(0, 200);
      disk.fileCounts(root, list).then((n) => { if (live) setCounts(new Map(list.map((p, i) => [p, n[i]]))); }).catch(() => {});
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for both lists
  }, [disk, root, key]);
  return { present, counts, error, known: !!disk && !!root };
}

function statusText(r: CustomiseRow, known: boolean): ReactNode {
  if (r.status === 'hidden') return <span className="m">hidden here</span>;
  if (r.status === 'unticked') return <span className="m">unticked</span>;
  if (r.renamedFrom !== undefined) return <span className="warn">renamed here</span>;
  const base = !known ? '' : r.status === 'present' ? '✓ present' : '＋ to create';
  return r.added ? (base ? `${base} · added here` : 'added here') : base;
}

/** Overview → Project folder → Customise… (spec C6): this project's own folders. The changes are kept in
 * the project (one undo step when saved); the office template is not changed. Only folders are created. */
export function FolderCustomiseDialog({ project, root, unticked, made, disk, client: given, onDone, onClose }: {
  project: Project & { folder: ProjectFolder };
  /** The project folder on this computer, when chosen. */
  root?: string;
  unticked: readonly string[];
  /** The buildings (or phases) the folders were last made for on this computer. */
  made?: readonly FolderBuilding[];
  disk?: FolderDisk;
  client?: TemplatesClient;
  onDone: (p: Project, status: string) => void;
  onClose: () => void;
}) {
  const client = useMemo(() => given ?? templatesClient(), [given]);
  const state = useFolderTemplates(client);
  const vars = useMemo(() => folderVars(project), [project]);
  const [base, setBase] = useState<ProjectFolder>(project.folder);
  const buildings = useMemo(() => folderBuildings(project, base.template), [project, base.template]);
  const [ov, setOv] = useState<ProjectFolderOverrides>(project.folder.overrides ?? emptyOverrides());
  const [sel, setSel] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [roles, setRoles] = useState(false);
  const [saveBack, setSaveBack] = useState<'ask' | null>(null);
  const [editing, setEditing] = useState<{ t: FolderTemplate; into: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const t = base.template;

  const rowsAll = useMemo(() => customiseRows(t, ov, vars, buildings, unticked), [t, ov, vars, buildings, unticked]);
  const olds = useMemo(() => renamedOldPaths(t, ov, vars, buildings), [t, ov, vars, buildings]);
  const units = useMemo(() => buildingFolders(t, ov, vars, buildings, made, unticked), [t, ov, vars, buildings, made, unticked]);
  const unitOld = useMemo(() => units.flatMap((u) => (u.renamedFrom ? [u.renamedFrom.path] : [])), [units]);
  const allPaths = useMemo(() => [...new Set([...rowsAll.flatMap((r) => r.paths), ...olds.flatMap((o) => o.paths), ...unitOld])], [rowsAll, olds, unitOld]);
  const oldPaths = useMemo(() => [...olds.flatMap((o) => o.paths), ...unitOld], [olds, unitOld]);
  const hasEach = useMemo(() => applyOverrides(t, ov).some((n) => n.when === 'building:each'), [t, ov]);
  const disk$ = useOnDisk(disk, root, allPaths, oldPaths);
  const rows = useMemo(() => customiseRows(t, ov, vars, buildings, unticked, disk$.present), [t, ov, vars, buildings, unticked, disk$.present]);
  const counts = customiseCounts(rows, disk$.present);
  const row = rows.find((r) => r.id === sel);
  const parentOf = (id: string): string | null => {
    const i = rows.findIndex((r) => r.id === id);
    for (let j = i - 1; j >= 0; j--) if (rows[j].depth < rows[i].depth) return rows[j].id;
    return null;
  };
  const childrenOf = (id: string | null) => {
    const i = id === null ? -1 : rows.findIndex((r) => r.id === id);
    const depth = id === null ? 0 : rows[i].depth + 1;
    const out: CustomiseRow[] = [];
    for (let j = i + 1; j < rows.length && (id === null || rows[j].depth >= depth); j++) if (rows[j].depth === depth) out.push(rows[j]);
    return out;
  };
  const hiddenAt = (id: string | null) => id !== null && rows.find((r) => r.id === id)?.status === 'hidden';

  const add = (sub: boolean) => {
    const parent = sub && row ? row.id : row ? parentOf(row.id) : null;
    const r = addHere(t, ov, parent, freeName(childrenOf(parent).map((c) => ({ id: c.id, name: c.name }))));
    setOv(r.overrides); setSel(r.id); setRenaming(r.id);
  };
  const commitRename = (id: string, value: string) => {
    setRenaming(null);
    const name = cleanFolderName(value);
    if (name) setOv(renameHere(t, ov, id, name));
  };
  const renameKey = (e: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(id, e.currentTarget.value); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRenaming(null); }
  };

  const ownTemplate = state.templates.find((x) => x.id === base.templateId && !x.builtIn);
  const startSaveBack = () => {
    const merged = templateWithOverrides(t, ov);
    if (ownTemplate) setSaveBack('ask');
    else setEditing({ t: duplicateTemplate(merged, allTemplates(state).map((x) => x.name)), into: false });
  };
  const savedBack = async (edited: FolderTemplate, into: boolean) => {
    const s = await saveTemplate(client, edited);
    const saved = s.templates.find((x) => x.id === edited.id) ?? edited;
    setEditing(null); setSaveBack(null);
    if (into) {
      // The changes are in the template now: the project takes the new version with no changes of its own.
      setBase({ templateId: saved.id, version: saved.version, template: saved });
      setOv(emptyOverrides());
      setNote(`Saved into “${saved.name}”. This project now uses it as it is.`);
    } else setNote(`Saved “${saved.name}”. This project still uses “${t.name}”; use Change template… to switch it.`);
  };

  const missing = customisePaths(rows).filter((p) => !disk$.present.has(p));
  const create = disk$.known ? missing.length : 0;
  const submit = async () => {
    setBusy(true);
    try {
      const folder = withOverrides(base, ov);
      let status = noOverrides(ov) ? 'The project folder follows its template.' : 'The project folder changes are saved in this project.';
      if (disk && root && create) {
        const r = await disk.create(root, missing);
        rememberFolder(project.id, { root: r.root, unticked: [...unticked], buildings });
        status = `Created ${plural(r.created + (r.rootMade ? 1 : 0), 'folder')} in ${r.root}.${r.failed.length ? ` ${plural(r.failed.length, 'folder')} could not be made: ${r.failed[0].reason}` : ''}`;
      }
      onDone({ ...project, folder }, status);
    } catch (e) { setError(message(e)); setBusy(false); }
  };

  if (editing) {
    return (
      <Modal onClose={() => setEditing(null)} className="modal prefs wide" closeOnBackdrop={false} onSubmit={(e) => e.preventDefault()}>
        <TemplateEditor template={editing.t} isNew={!editing.into} onCancel={() => setEditing(null)} onSave={(x) => savedBack(x, editing.into)} />
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} className="modal prefs wide" closeOnBackdrop={false} onSubmit={(e) => { e.preventDefault(); if (!busy && !renaming) void submit(); }}>
      <div className="ft">
        <div className="ft-head"><h3>Customise project folder: {project.name}</h3><span className="sp" /><span className="m">Template: {t.name} v{base.version}</span></div>
        <div className="ft-actions" role="toolbar" aria-label="Folder tools">
          <button type="button" className="chip" disabled={!!row && hiddenAt(parentOf(row.id))} onClick={() => add(false)}>+ Folder</button>
          <button type="button" className="chip" disabled={!row || row.status === 'hidden'} onClick={() => add(true)}>+ Subfolder</button>
          <button type="button" className="chip" disabled={!row || row.status === 'hidden'} onClick={() => row && setRenaming(row.id)}>Rename</button>
          <button type="button" className="chip" disabled={!row || (row.status === 'hidden' && !row.added && !ov.hide.includes(row.id))} onClick={() => { if (row) setOv(toggleHide(t, ov, row.id)); }}>
            {row?.status === 'hidden' ? 'Show for this project' : 'Hide for this project'}
          </button>
          <button type="button" className="chip" aria-pressed={roles} disabled={!row || row.status === 'hidden'} onClick={() => setRoles(!roles)}>Role…</button>
        </div>
        {roles && row && row.status !== 'hidden' && (
          <div className="ft-field">Roles of {row.name}: outputs saved here in this project
            <div className="ft-roles">
              {row.roles.map((r) => (
                <span key={r} className="ft-tag role">{roleLabel(r)}
                  <button type="button" aria-label={`Remove the role ${r}`} onClick={() => setOv(roleOff(t, ov, r, row.id))}>×</button>
                </span>
              ))}
              {!row.roles.length && <span className="m">None</span>}
            </div>
            <select aria-label="Add a role" value="" onChange={(e) => { if (e.target.value) setOv(roleHere(t, ov, e.target.value, row.id)); }}>
              <option value="">Add a role…</option>
              {GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {ROLE_CATALOGUE.filter((r) => r.group === g && !row.roles.includes(r.id)).map((r) => {
                    const at = rows.find((x) => x.status !== 'hidden' && x.roles.includes(r.id));
                    return <option key={r.id} value={r.id}>{r.label}{at ? ` (move here from ${at.name})` : ''}</option>;
                  })}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        <div className="ft-cols edit">
          <div className="ft-tree" role="tree" aria-label="Folders of this project">
            <div className="ft-row root"><span className="ft-name">{root ? root.replace(/^.*[\\/]/, '') : t.root}</span></div>
            {rows.map((r) => (
              <div key={r.id} role="treeitem" aria-selected={sel === r.id} className={`ft-row edit${sel === r.id ? ' sel' : ''}${r.status === 'hidden' || r.status === 'unticked' ? ' off' : ''}`}
                style={{ paddingLeft: 8 + (r.depth + 1) * 18 }} onClick={() => setSel(r.id)} onDoubleClick={() => { if (r.status !== 'hidden') setRenaming(r.id); }}>
                {renaming === r.id
                  ? <input className="ft-rename" aria-label="Folder name" defaultValue={r.name} maxLength={120} autoFocus onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => renameKey(e, r.id)} onBlur={(e) => commitRename(r.id, e.currentTarget.value)} />
                  : <span className="ft-name">{r.status === 'hidden' ? <s>{r.name}</s> : r.name}</span>}
                {!!r.roles.length && <span className="ft-tag role" title={r.roles.map(roleLabel).join(', ')}>{r.roles.length > 2 ? `${r.roles[0]} +${r.roles.length - 1}` : r.roles.join(', ')}</span>}
                <span className="sp" />
                <span>{statusText(r, disk$.known)}</span>
              </div>
            ))}
            {!rows.length && <p className="m">This template has no folders. Use + Folder.</p>}
          </div>
          <div className="ft-insp">
            <div className="ft-sec">{disk$.known ? 'On disk' : 'Folders'}</div>
            <dl className="ft-summary">
              {disk$.known ? <><dt>Present</dt><dd>{counts.present}</dd><dt>To create</dt><dd>{counts.create}</dd></> : <><dt>Folders</dt><dd>{counts.present + counts.create}</dd></>}
              <dt>Hidden for this project</dt><dd>{counts.hidden}</dd>
              <dt>Added here</dt><dd>{counts.added}</dd>
            </dl>
            {olds.length > 0 && (
              <>
                <div className="ft-sec">Renamed here</div>
                {olds.map((o) => (
                  <div key={o.id}>
                    <p className="m" style={{ margin: '0 0 2px' }}>“{o.from}” → “{o.to}”. The new folder is created. The old one is left as it is:</p>
                    {o.paths.map((p) => <p key={p} className="ft-path"><code>{root?.includes('\\') ? p.replace(/\//g, '\\') : p}</code>{disk$.present.has(p) ? ` (${files(disk$.counts.get(p)) || 'on disk'})` : ''}</p>)}
                  </div>
                ))}
              </>
            )}
            {hasEach && (
              <>
                <div className="ft-sec">{t.repeat?.source === 'phases' ? 'Phases' : 'Buildings'}</div>
                {units.map((u) => {
                  const shown = (p: string) => (root?.includes('\\') ? p.replace(/\//g, '\\') : p);
                  if (u.renamedFrom) {
                    return (
                      <div key={u.unit.code}>
                        <p className="m" style={{ margin: '0 0 2px' }}>“{u.renamedFrom.path}” → “{u.path}”: the building was renamed. Its new folders are created. The old one is left as it is:</p>
                        <p className="ft-path"><code>{shown(u.renamedFrom.path)}</code>{disk$.present.has(u.renamedFrom.path) ? ` (${files(disk$.counts.get(u.renamedFrom.path)) || 'on disk'})` : ''}</p>
                      </div>
                    );
                  }
                  const fresh = disk$.known && !disk$.present.has(u.path);
                  return <p key={u.unit.code} className="ft-path">{fresh ? `＋ ${u.path}: ${plural(u.count, 'folder')} to create` : disk$.known ? `✓ ${u.path}` : `${u.path}: ${plural(u.count, 'folder')}`}</p>;
                })}
                {!units.length && <p className="m" style={{ margin: 0 }}>{t.repeat?.source === 'phases' ? 'This template has no phases yet.' : 'No buildings yet: add them in Building information.'}</p>}
                <p className="m" style={{ margin: 0 }}>{t.repeat?.source === 'phases' ? 'Each phase of the template gets its own folders.' : 'When a building is added, its folders are offered here.'}</p>
              </>
            )}
            <div className="ft-sec">Project only</div>
            <p className="m" style={{ margin: 0 }}>These changes are saved in this project. The office template is not changed.</p>
            {saveBack === 'ask' && ownTemplate
              ? (
                <div className="ft-actions">
                  <button type="button" className="chip" onClick={() => setEditing({ t: duplicateTemplate(templateWithOverrides(t, ov), allTemplates(state).map((x) => x.name)), into: false })}>As a new template…</button>
                  <button type="button" className="chip" onClick={() => setEditing({ t: { ...ownTemplate, folders: templateWithOverrides(t, ov).folders }, into: true })}>Into “{ownTemplate.name}”…</button>
                  <button type="button" className="chip" onClick={() => setSaveBack(null)}>Cancel</button>
                </div>
              )
              : <button type="button" className="chip" disabled={!state.loaded} onClick={startSaveBack}>Save these changes back to the template…</button>}
            <button type="button" className="chip" disabled={noOverrides(ov)} onClick={() => { setOv(emptyOverrides()); setRenaming(null); }}>Reset to template</button>
            {note && <p className="m" role="status">{note}</p>}
          </div>
        </div>
        {(error || disk$.error) && <p className="bad" role="alert">{error || disk$.error}</p>}
      </div>
      <div className="modal-actions">
        <span className="sp" />
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
        <button type="submit" className="chip primary" disabled={busy || !!renaming}>{create ? `Create ${plural(create, 'folder')}` : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

/** Overview → Project folder → Change template… (spec C8): what switching to another template does, before
 * it is done. Apply only creates folders: nothing is moved, renamed or deleted. */
export function ChangeTemplateDialog({ project, root, unticked, disk, client, onDone, onClose }: {
  project: Project & { folder: ProjectFolder };
  root?: string;
  unticked: readonly string[];
  disk?: FolderDisk;
  client?: TemplatesClient;
  onDone: (p: Project, status: string) => void;
  onClose: () => void;
}) {
  const state = useFolderTemplates(client);
  const vars = useMemo(() => folderVars(project), [project]);
  const flags = useMemo(() => folderFlags(project), [project]);
  const folder = project.folder;
  const buildings = useMemo(() => folderBuildings(project, folder.template), [project, folder.template]);
  const others = allTemplates(state).filter((x) => x.id !== folder.templateId);
  const [toId, setToId] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = others.find((x) => x.id === toId) ?? others.find((x) => x.id === state.defaultId) ?? others[0];
  const nextUnticked = useMemo(() => (next ? offByDefault(next.folders, flags) : []), [next, flags]);
  const nextBuildings = useMemo(() => (next ? folderBuildings(project, next) : []), [project, next]);
  const plan = useMemo(() => (next ? changePlan(folder, next, vars, buildings, unticked, nextUnticked, nextBuildings) : null), [folder, next, vars, buildings, unticked, nextUnticked, nextBuildings]);
  const untouched = useMemo(() => plan?.rows.filter((r) => r.kind === 'untouched').map((r) => r.path) ?? [], [plan]);
  const disk$ = useOnDisk(disk, root, untouched, untouched);
  if (!state.loaded) return null;

  const createPaths = plan ? [...new Set(plan.diff.create.map((f) => f.path))] : [];
  const remapped = plan ? plan.rows.filter((r) => r.kind === 'keep' && r.remapped.length).length : 0;
  const keptCount = plan ? new Set(plan.diff.keep.map((f) => f.path)).size : 0;
  const untouchedCount = plan ? new Set(plan.diff.untouched.map((f) => f.path)).size : 0;
  const fileTotal = untouched.reduce((s, p) => s + Math.max(0, disk$.counts.get(p) ?? 0), 0);
  const label = { create: <span className="ok">＋ to create</span>, keep: <span>= kept</span>, untouched: <span className="m">○ not in the new template, left as is</span> };
  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      let status = `The project now uses “${plan.folder.template.name}”.`;
      if (disk && root) {
        const r = await disk.create(root, createPaths);
        rememberFolder(project.id, { root: r.root, unticked: nextUnticked, buildings: nextBuildings });
        status += ` Created ${plural(r.created + (r.rootMade ? 1 : 0), 'folder')} in ${r.root}.${r.failed.length ? ` ${plural(r.failed.length, 'folder')} could not be made: ${r.failed[0].reason}` : ''}`;
      }
      if (plan.dropped.length) status += ` ${plural(plan.dropped.length, 'project change')} no longer applied and ${plan.dropped.length === 1 ? 'was' : 'were'} dropped.`;
      onDone({ ...project, folder: plan.folder }, status);
    } catch (e) { setError(message(e)); setBusy(false); }
  };

  return (
    <Modal onClose={onClose} className="modal prefs wide" closeOnBackdrop={false} onSubmit={(e) => { e.preventDefault(); if (plan && !busy) void apply(); }}>
      <h3>Change folder template: {project.name}</h3>
      <div className="grid2">
        <label>From<input value={`${folder.template.name} v${folder.version}`} readOnly /></label>
        <label>To
          <select value={next?.id ?? ''} onChange={(e) => setToId(e.target.value)}>
            {others.map((x) => <option key={x.id} value={x.id}>{x.name}{x.builtIn ? '' : ` (v${x.version})`}</option>)}
          </select>
        </label>
      </div>
      {!plan && <p className="m">There is no other folder template to change to.</p>}
      {plan && (
        <>
          <div className="ft-table">
            <table>
              <thead><tr><th>Folder</th><th style={{ width: '38%' }}>Change</th><th>Note</th></tr></thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={`${r.kind}:${r.path}`}>
                    <td><code>{r.path}</code></td>
                    <td>{label[r.kind]}</td>
                    <td className="m">{r.kind === 'keep'
                      ? (r.remapped.length ? `role remapped from ${[...new Set(r.remapped.map((m) => m.from))].join(', ')}` : '')
                      : r.kind === 'untouched' ? files(disk$.counts.get(r.path)) || (r.inside ? plural(r.inside, 'subfolder') : '')
                        : r.inside ? plural(r.inside, 'subfolder') : ''}</td>
                  </tr>
                ))}
                {!plan.rows.length && <tr><td colSpan={3} className="m">No folders.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="ft-actions">
            <span>＋ {createPaths.length} to create</span>
            <span>· = {keptCount} kept{remapped ? ` (${remapped} role remapped)` : ''}</span>
            <span>· ○ {untouchedCount} left untouched{fileTotal ? ` (${plural(fileTotal, 'file')})` : ''}</span>
            <span className="sp" />
            <label className="row"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show where old files would go (list only)</label>
          </div>
          {show && (
            <div className="ft-table">
              <table>
                <thead><tr><th>Output</th><th>Saved in now</th><th>Would go to</th></tr></thead>
                <tbody>
                  {whereFilesGo(plan.diff).map((m) => <tr key={m.role}><td>{roleLabel(m.role)}</td><td><code>{m.from}</code></td><td>{m.to ? <code>{m.to}</code> : <span className="m">ask where to save</span>}</td></tr>)}
                  {!whereFilesGo(plan.diff).length && <tr><td colSpan={3} className="m">Every output keeps its folder.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {!!overrideCount(folder.overrides) && (
            <div>
              <b>Overrides</b>
              <p className="m" style={{ margin: '4px 0 0' }}>
                {overrideCount(plan.kept)} still {overrideCount(plan.kept) === 1 ? 'applies' : 'apply'}.
                {plan.dropped.length ? ` ${plan.dropped.length} no longer ${plan.dropped.length === 1 ? 'applies and is' : 'apply and are'} dropped: ${plan.dropped.join('; ')}.` : ''}
              </p>
            </div>
          )}
          <p className="m" style={{ margin: 0 }}>Apply only creates folders. No folder or file is moved, renamed or deleted.</p>
        </>
      )}
      {(error || disk$.error) && <p className="bad" role="alert">{error || disk$.error}</p>}
      <div className="modal-actions">
        <span className="sp" />
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
        <button type="submit" className="chip primary" disabled={!plan || busy}>{disk && root ? `Apply: create ${plural(createPaths.length, 'folder')}` : 'Apply'}</button>
      </div>
    </Modal>
  );
}
