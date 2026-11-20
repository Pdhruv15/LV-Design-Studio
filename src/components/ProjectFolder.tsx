import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { applyOverrides, countFolders, FOLDER_LIMITS, type FolderBuilding, type FolderNode, type FolderVars, type FolderWhen, type ProjectFolder } from '../model/folderTemplates';
import { allTemplates, type TemplatesClient, type TemplatesState } from '../model/folderTemplatesClient';
import {
  cleanFolderName, folderBuildings, folderFlags, folderVars, joinPath, offByDefault, planFolders, rememberedFolder, rememberFolder, suggestedRootName, type RememberedFolder
} from '../model/projectFolderPlan';
import type { Project } from '../types';
import { saveBinary } from '../util/files';
import {
  choiceReady, createChosenFolders, firstChoice, folderDisk, folderZip, plural, projectFolderOf, splitPath, useFolderTemplates, type FolderChoice, type FolderDisk
} from './projectFolderActions';
import { ChangeTemplateDialog, FolderCustomiseDialog } from './FolderCustomise';
import { Modal } from './ui';

const noSubmit = (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') e.preventDefault(); };
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function TickTree({ nodes, unticked, onToggle, level = 0, parentOff = false }: { nodes: readonly FolderNode[]; unticked: ReadonlySet<string>; onToggle: (n: FolderNode, on: boolean) => void; level?: number; parentOff?: boolean }): ReactNode {
  return nodes.map((n) => {
    const off = unticked.has(n.id);
    return (
      <div key={n.id}>
        <label className={`ft-row tick${off || parentOff ? ' off' : ''}`} style={{ paddingLeft: 8 + level * 18 }}>
          <input type="checkbox" checked={!off} disabled={parentOff} onChange={(e) => onToggle(n, e.target.checked)} />
          <span className="ft-name">{n.name}</span>
          {n.when === 'building:each' && <span className="ft-tag when">each building</span>}
          {n.when && n.when !== 'always' && n.when !== 'building:each' && <span className="ft-tag when">{n.when}</span>}
        </label>
        {!!n.children?.length && <TickTree nodes={n.children} unticked={unticked} onToggle={onToggle} level={level + 1} parentOff={off || parentOff} />}
      </div>
    );
  });
}

/** Template, place, folder name and the tick-box tree (spec F1). Shared by the New project step and the
 * Overview's dialog. Nothing is created here. */
export function FolderChoiceForm({ state, value, onChange, vars, flags, buildings, overrides, disk, lockTemplate }: {
  state: TemplatesState; value: FolderChoice; onChange: (c: FolderChoice) => void;
  vars: FolderVars; flags: FolderWhen[]; buildings: readonly FolderBuilding[]; overrides?: ProjectFolder['overrides'];
  disk?: FolderDisk;
  /** The project already has its template: only the place and the ticks can change. */
  lockTemplate?: boolean;
}) {
  const all = allTemplates(state);
  const tree = useMemo(() => applyOverrides(value.template, overrides), [value.template, overrides]);
  const off = new Set(value.unticked);
  const root = disk && value.parent && value.name ? joinPath(value.parent, value.name) : '';
  const plan = planFolders(value.template, overrides, vars, buildings, off, root);
  const hasBuildingFolders = JSON.stringify(tree).includes('"building:each"');
  const toggle = (n: FolderNode, on: boolean) => {
    const ids = new Set(value.unticked);
    const each = (x: FolderNode) => { if (on) ids.delete(x.id); else ids.add(x.id); x.children?.forEach(each); };
    each(n);
    onChange({ ...value, unticked: [...ids] });
  };
  return (
    <div className="ft pf-form">
      <div className="grid2">
        <label>Folder template
          <select value={value.template.id} disabled={lockTemplate} onChange={(e) => { const t = all.find((x) => x.id === e.target.value); if (t) onChange({ ...value, template: t, name: suggestedRootName(t, vars), unticked: offByDefault(t.folders, flags) }); }}>
            {all.map((t) => <option key={t.id} value={t.id}>{t.name}{t.builtIn ? '' : ' (yours)'}</option>)}
            {!all.some((t) => t.id === value.template.id) && <option value={value.template.id}>{value.template.name} (this project's copy)</option>}
          </select>
        </label>
        <label>Folder name
          <input value={value.name} maxLength={120} onChange={(e) => onChange({ ...value, name: e.target.value })} onBlur={(e) => onChange({ ...value, name: cleanFolderName(e.target.value) })} onKeyDown={noSubmit} />
        </label>
        {disk && (
          <label style={{ gridColumn: '1 / -1' }}>Location
            <span className="pf-loc">
              <input value={value.parent} placeholder="Choose where the project folder goes" onChange={(e) => onChange({ ...value, parent: e.target.value })} onKeyDown={noSubmit} />
              <button type="button" className="chip" onClick={async () => { const p = await disk.chooseParent(value.parent || undefined); if (p) onChange({ ...value, parent: p }); }}>Browse…</button>
            </span>
          </label>
        )}
      </div>
      {root && <p className="m ft-path">{root}</p>}
      <div className="ft-tree pf-tree" aria-label="Folders to create">
        <TickTree nodes={tree} unticked={off} onToggle={toggle} />
        {!tree.length && <p className="m">This template has no folders.</p>}
      </div>
      <p className="m" role="status">
        {disk
          ? `${plural(plan.paths.length, 'folder')} will be created. Nothing existing is moved or deleted.`
          : `${plural(plan.paths.length, 'folder')} in this structure. The web version cannot make folders on your computer: it gives you the empty folders as a ZIP file.`}
        {hasBuildingFolders && !buildings.length ? ' Folders marked "each building" are made once the project has buildings.' : ''}
      </p>
      {plan.tooLong.length > 0 && <p className="warn">{plural(plan.tooLong.length, 'folder')} would have a path longer than {FOLDER_LIMITS.maxPathChars} characters here, for example {plan.tooLong[0]}. Choose a shorter location or folder name.</p>}
    </div>
  );
}

/** Overview → Project folder → Create project folder… / Choose the folder on this computer… */
export function ProjectFolderDialog({ project, onDone, onClose, client, disk = folderDisk() }: {
  project: Project;
  /** The project with its folder setting, and what to tell the user. */
  onDone: (p: Project, status: string) => void;
  onClose: () => void; client?: TemplatesClient; disk?: FolderDisk;
}) {
  const state = useFolderTemplates(client);
  const vars = useMemo(() => folderVars(project), [project]);
  const flags = useMemo(() => folderFlags(project), [project]);
  const buildings = useMemo(() => folderBuildings(project), [project]);
  const had = project.folder;
  const [choice, setChoice] = useState<FolderChoice | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!state.loaded) return;
    setChoice((cur) => {
      if (cur) return cur;
      if (!had) return firstChoice(state, vars, flags, '');
      const mem = rememberedFolder(project.id);
      const at = mem ? splitPath(mem.root) : { parent: '', name: suggestedRootName(had.template, vars) };
      return { template: had.template, ...at, unticked: mem?.unticked ?? offByDefault(applyOverrides(had.template, had.overrides), flags) };
    });
  }, [state, vars, flags, had, project.id]);
  if (!choice) return null;
  const submit = async () => {
    setBusy(true);
    try {
      const folder = projectFolderOf(choice.template, had);
      let status: string;
      if (disk) status = await createChosenFolders(disk, project.id, choice, vars, buildings, folder.overrides);
      else {
        const { paths } = planFolders(choice.template, folder.overrides, vars, buildings, choice.unticked);
        const name = cleanFolderName(choice.name);
        const saved = await saveBinary(`${name}.zip`, await folderZip(name, paths), 'ZIP file', 'zip', 'application/zip', { output: 'folderZip' });
        rememberFolder(project.id, undefined);
        status = saved ? `Saved the folder structure as ${saved}. Unzip it where the project should live.` : 'Folder structure not saved.';
      }
      onDone({ ...project, folder }, status);
    } catch (e) { setError(message(e)); setBusy(false); }
  };
  return (
    <Modal onClose={onClose} className="modal prefs wide" closeOnBackdrop={false} onSubmit={(e) => { e.preventDefault(); if (choiceReady(choice, disk) && !busy) void submit(); }}>
      <h3>Project folder</h3>
      <FolderChoiceForm state={state} value={choice} onChange={setChoice} vars={vars} flags={flags} buildings={buildings} overrides={had?.overrides} disk={disk} lockTemplate={!!had} />
      {error && <p className="bad" role="alert">{error}</p>}
      <div className="modal-actions">
        <span className="sp" />
        <button type="button" className="chip" onClick={onClose}>Cancel</button>
        <button type="submit" className="chip primary" disabled={busy || !choiceReady(choice, disk)}>{disk ? 'Create folders' : 'Download as ZIP'}</button>
      </div>
    </Modal>
  );
}

type DiskStatus = Awaited<ReturnType<FolderDisk['status']>>;

/** Overview: the "Project folder" card (spec F3). */
export function ProjectFolderCard({ project, onChangeProject, onStatus, client, disk = folderDisk() }: {
  project: Project; onChangeProject?: (p: Project) => void; onStatus: (m: string) => void; client?: TemplatesClient; disk?: FolderDisk;
}) {
  const [dialog, setDialog] = useState(false);
  const [other, setOther] = useState<'customise' | 'change' | null>(null);
  const [mem, setMem] = useState<RememberedFolder | undefined>(() => rememberedFolder(project.id));
  const [status, setStatus] = useState<DiskStatus | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const folder = project.folder;
  const vars = useMemo(() => folderVars(project), [project]);
  const buildings = useMemo(() => folderBuildings(project), [project]);
  const paths = useMemo(() => (folder && mem ? planFolders(folder.template, folder.overrides, vars, buildings, mem.unticked, mem.root).paths : []), [folder, mem, vars, buildings]);
  useEffect(() => { setMem(rememberedFolder(project.id)); }, [project.id, tick]);
  useEffect(() => {
    let live = true;
    setStatus(null);
    if (disk && folder && mem) disk.status(mem.root, paths).then((s) => { if (live) { setStatus(s); setError(''); } }).catch((e) => { if (live) setError(message(e)); });
    return () => { live = false; };
  }, [disk, folder, mem, paths, tick]);

  const createMissing = async () => {
    if (!disk || !mem || !status) return;
    try {
      const r = await disk.create(mem.root, status.missing);
      onStatus(`Created ${plural(r.created + (r.rootMade ? 1 : 0), 'folder')} in ${r.root}.${r.failed.length ? ` ${plural(r.failed.length, 'folder')} could not be made: ${r.failed[0].reason}` : ''}`);
      setTick((t) => t + 1);
    } catch (e) { setError(message(e)); }
  };
  const open = async () => { if (disk && mem) { const err = await disk.open(mem.root).catch(message); if (err) setError(err); } };
  const folderTools = onChangeProject && folder && (
    <>
      <button type="button" className="chip" onClick={() => setOther('customise')}>Customise…</button>
      <button type="button" className="chip" onClick={() => setOther('change')}>Change template…</button>
    </>
  );

  return (
    <section className="card dash-brief pf-card">
      <h4>Project folder{folder && <span className="m"> — {folder.template.name} · {plural(countFolders(applyOverrides(folder.template, folder.overrides)), 'folder')} in the template</span>}
        {onChangeProject && !(folder && mem && disk) && (
          <button className="chip" style={{ float: 'right' }} onClick={() => setDialog(true)}>
            {!folder ? 'Create project folder…' : disk ? 'Choose the folder on this computer…' : 'Download as ZIP…'}
          </button>
        )}
      </h4>
      {!folder && <p className="m">No project folder. Create one from a folder template to keep this job's inputs, calculations, drawings and submissions in one place. Nothing existing is moved or deleted.</p>}
      {folder && !disk && <p className="m">The web version cannot make folders on your computer. Download the empty folder structure as a ZIP file and unzip it where the project should live.</p>}
      {folder && disk && !mem && <p className="m">This project uses the folder template “{folder.template.name}”, but its folder has not been chosen on this computer yet.</p>}
      {folderTools && !(disk && mem) && <div className="ft-actions">{folderTools}</div>}
      {folder && disk && mem && (
        <>
          <p className="ft-path">{mem.root} <button type="button" className="chip" onClick={open}>Open</button></p>
          {status && !status.exists && <p className="warn">This folder is not on this computer. <button type="button" className="linkish" onClick={() => setDialog(true)}>Choose the folder…</button></p>}
          {status?.exists && (
            <>
              <p className={status.missing.length ? 'warn' : 'ok'}>
                {status.missing.length ? `${status.present.length} of ${paths.length} folders present · ${plural(status.missing.length, 'folder')} missing: ${status.missing.slice(0, 3).join(', ')}${status.missing.length > 3 ? '…' : ''}` : `All ${paths.length} folders present`}
              </p>
              {status.looseCount > 0 && <p className="m">{plural(status.looseCount, 'file')} in the project folder itself, not in a subfolder: {status.looseFiles.slice(0, 3).join(', ')}{status.looseCount > 3 ? '…' : ''}. They are left where they are.</p>}
            </>
          )}
          <div className="ft-actions">
            {!!status?.exists && status.missing.length > 0 && <button type="button" className="chip primary" onClick={createMissing}>Create missing folders</button>}
            <button type="button" className="chip" onClick={() => setTick((t) => t + 1)}>Check again</button>
            {onChangeProject && <button type="button" className="chip" onClick={() => setDialog(true)}>Change folder or ticks…</button>}
            {folderTools}
          </div>
        </>
      )}
      {error && <p className="bad" role="alert">{error}</p>}
      {dialog && onChangeProject && (
        <ProjectFolderDialog project={project} client={client} disk={disk} onClose={() => setDialog(false)}
          onDone={(p, s) => { setDialog(false); if (p.folder !== project.folder) onChangeProject(p); onStatus(s); setTick((t) => t + 1); }} />
      )}
      {other && onChangeProject && folder && (() => {
        const Dialog = other === 'customise' ? FolderCustomiseDialog : ChangeTemplateDialog;
        return (
          <Dialog project={{ ...project, folder }} root={disk ? mem?.root : undefined} unticked={mem?.unticked ?? []} disk={disk} client={client}
            onClose={() => setOther(null)}
            onDone={(p, s) => { setOther(null); if (p.folder !== project.folder) onChangeProject(p); onStatus(s); setMem(rememberedFolder(project.id)); setTick((t) => t + 1); }} />
        );
      })()}
    </section>
  );
}
