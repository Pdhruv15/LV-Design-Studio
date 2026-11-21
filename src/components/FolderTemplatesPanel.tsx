import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ROLE_CATALOGUE, roleById } from '../model/folderRoles';
import { BUILT_IN_TEMPLATES } from '../model/folderTemplateBuiltins';
import {
  addFolder, addRole, addSubfolder, ancestorsOf, canDrop, duplicateTemplate, editorKey, findNode, indentNode, moveBy, moveNode, newTemplateId, outdentNode,
  pushHistory, redoHistory, removeNode, removeRole, renameNode, renumberLevel, roleFolder, setNodeField, startHistory, undoHistory, type DropPlace, type EditHistory
} from '../model/folderTemplateEdit';
import {
  assignedRoles, countFolders, expandTemplate, fillName, FOLDER_WHEN, nodeRoles, SAMPLE_VARS, validateTemplate,
  type FolderNode, type FolderNumbering, type FolderTemplate, type FolderWhen
} from '../model/folderTemplates';
import { allTemplates, defaultTemplateId, saveTemplate, templatesClient, type TemplatesClient, type TemplatesState } from '../model/folderTemplatesClient';
import { ask } from './ConfirmDialog';
import FolderLearnWizard from './FolderLearnWizard';
import FolderNewTemplate from './FolderNewTemplate';
import { NamingTab, RolesTab } from './FolderTemplateTabs';
import { namingIssues } from '../model/fileNaming';

const WHEN_LABEL: Record<FolderWhen, string> = {
  always: 'Always', 'scope:pv': 'Solar PV is in scope', 'scope:standby': 'Generator / UPS is in scope', 'scope:fire': 'Fire / Civil Defence is in scope',
  'scope:elv': 'ELV is in scope', 'stage:tender': 'The job has a tender stage', 'service:supervision': 'Site supervision is in the service', 'building:each': 'Once for each building'
};
const ON_USE = ['{Stage}/Rev-{Rev}', 'Rev-{BoqRev}', 'TR-{TrNo}', '{YYYYMMDD}_Rev{Rev}'];
const NUMBERING: [FolderNumbering, string][] = [['01_', '01_ two-digit'], ['1.', '1. number'], ['A-', 'A- letters'], ['none', 'No numbers']];
const NUMBERING_LABEL: Record<FolderNumbering, string> = { '01_': '01_ two-digit', '1.': '1. number', 'A-': 'A- letters', none: 'None' };
const ALL_FLAGS = FOLDER_WHEN.filter((w) => w !== 'always' && w !== 'building:each');
const SAMPLE_BUILDINGS = [{ code: 'B1', name: 'Block-1' }];
const EMPTY: TemplatesState = { templates: [], defaultId: null, skipped: 0 };
const blankTemplate = (): FolderTemplate => ({
  id: newTemplateId(), name: 'New template', version: 0, layout: 'blank', root: '{ProjectNo}_{ProjectShort}', numbering: 'none',
  naming: { preset: 'office', pattern: '{ProjectNo}-{Discipline}-{Type}-{Seq:3}-{Rev}', separator: '-', discipline: 'E' }, folders: []
});
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
/** Enter in a field here must not submit the Preferences form around it. */
const noSubmit = (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') e.preventDefault(); };

function roleTags(n: FolderNode): ReactNode {
  const roles = nodeRoles(n);
  if (!roles.length) return null;
  return <span className="ft-tag role" title={roles.map((r) => roleById(r)?.label ?? r).join(', ')}>{roles.length > 2 ? `${roles[0]} +${roles.length - 1}` : roles.join(', ')}</span>;
}

/** A read-only outline of a template's folders, to `depth` levels. */
function Outline({ nodes, depth, level = 0 }: { nodes: readonly FolderNode[]; depth: number; level?: number }) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.id}>
          <div className="ft-row" style={{ paddingLeft: 8 + level * 18 }}>
            <span className="ft-name">{n.name}</span>{roleTags(n)}
            {n.when && n.when !== 'always' && <span className="ft-tag when">{n.when}</span>}
            {level + 1 >= depth && !!n.children?.length && <span className="m">+{countFolders(n.children)}</span>}
          </div>
          {level + 1 < depth && !!n.children?.length && <Outline nodes={n.children} depth={depth} level={level + 1} />}
        </div>
      ))}
    </>
  );
}

/** Preferences → Folder templates: the template library (spec C1) and the tree editor (spec C2). Templates
 * only describe folders; nothing here creates, moves or deletes a folder on disk. */
export default function FolderTemplatesPanel({ client: given, onEditing }: {
  client?: TemplatesClient;
  /** Told when a template is opened in the editor or the editor closes. */
  onEditing?: (editing: boolean) => void;
}) {
  const client = useMemo(() => given ?? templatesClient(), [given]);
  const [state, setState] = useState<TemplatesState>(EMPTY);
  const [selId, setSelId] = useState<string>(BUILT_IN_TEMPLATES[0].id);
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditingRaw] = useState<FolderTemplate | null>(null);
  const [learning, setLearningRaw] = useState(false);
  const setEditing = (t: FolderTemplate | null) => { setEditingRaw(t); onEditing?.(!!t); };
  const setLearning = (on: boolean) => { setLearningRaw(on); onEditing?.(on); };
  const [starting, setStartingRaw] = useState(false);
  const setStarting = (on: boolean) => { setStartingRaw(on); onEditing?.(on); };

  useEffect(() => {
    let live = true;
    client.list().then((s) => { if (live) setState(s); }).catch((e) => { if (live) setNote(message(e)); });
    return () => { live = false; };
  }, [client]);

  const all = allTemplates(state);
  const sel = all.find((t) => t.id === selId) ?? all[0];
  const defId = defaultTemplateId(state);
  const run = async (fn: () => Promise<TemplatesState | null | undefined>, done?: string) => {
    try { const s = await fn(); if (s) setState(s); setNote(done ?? ''); } catch (e) { setNote(message(e)); }
  };

  if (learning && client.scanFolder) {
    return (
      <FolderLearnWizard
        scanFolder={client.scanFolder}
        newId={newTemplateId}
        naming={blankTemplate().naming}
        takenNames={all.map((t) => t.name)}
        onCancel={() => setLearning(false)}
        onDone={async (t, makeDefault) => {
          // A name from disk the checks still refuse opens in the editor unsaved, with the checks shown.
          if (validateTemplate(t).some((i) => i.level === 'error')) {
            setLearningRaw(false); setEditing(t);
            return;
          }
          let s = await saveTemplate(client, t);
          if (makeDefault) s = await client.setDefault(t.id);
          setState(s); setSelId(t.id); setLearningRaw(false);
          setEditing(s.templates.find((x) => x.id === t.id) ?? t);
          setNote(`Saved “${t.name}”.`);
        }}
      />
    );
  }

  if (starting) {
    return <FolderNewTemplate takenNames={all.map((t) => t.name)} onCancel={() => setStarting(false)} onCreate={(t) => { setStartingRaw(false); setEditing(t); }} />;
  }

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        isNew={!state.templates.some((t) => t.id === editing.id)}
        onCancel={() => setEditing(null)}
        onSave={async (t) => { const s = await saveTemplate(client, t); setState(s); setSelId(t.id); setEditing(null); setNote(`Saved “${t.name.trim()}”.`); }}
      />
    );
  }

  const q = search.trim().toLowerCase();
  const shown = (list: readonly FolderTemplate[]) => list.filter((t) => !q || t.name.toLowerCase().includes(q));
  const item = (t: FolderTemplate) => (
    <button type="button" key={t.id} className={`ft-item${t.id === sel.id ? ' on' : ''}`} aria-pressed={t.id === sel.id} onClick={() => setSelId(t.id)}>
      <span>{t.name}</span>
      <small>{t.id === defId ? '★ default · ' : ''}{countFolders(t.folders)}{t.builtIn ? ' · locked' : ''}</small>
    </button>
  );
  const roles = assignedRoles(sel.folders).size;
  const missing = ROLE_CATALOGUE.filter((r) => !assignedRoles(sel.folders).has(r.id));

  return (
    <div className="ft">
      <p className="m">A folder template is the set of folders a project starts with. Built-in templates are locked: duplicate one to make your own. Templates are kept on this computer and can be shared as a file.</p>
      {state.error && <p className="bad">{state.error}</p>}
      {state.skipped > 0 && <p className="warn">{state.skipped} template{state.skipped === 1 ? '' : 's'} in the templates file could not be read and {state.skipped === 1 ? 'was' : 'were'} left out.</p>}
      <div className="ft-lib">
        <div className="ft-side">
          <input aria-label="Search templates" placeholder="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={noSubmit} />
          <div className="ft-sec">Built-in</div>
          {shown(BUILT_IN_TEMPLATES).map(item)}
          <div className="ft-sec">My templates</div>
          {shown(state.templates).map(item)}
          {!state.templates.length && <p className="m">None yet.</p>}
          <div className="ft-actions">
            <button type="button" className="chip" onClick={() => { setNote(''); setStarting(true); }}>+ New</button>
            <button type="button" className="chip" onClick={() => setEditing(duplicateTemplate(sel, all.map((t) => t.name)))}>Duplicate</button>
            {client.scanFolder && <button type="button" className="chip" onClick={() => { setNote(''); setLearning(true); }}>Learn from folder…</button>}
            {client.import && <button type="button" className="chip" onClick={() => run(async () => { const r = await client.import!(); if (r) setNote(`${r.added} template${r.added === 1 ? '' : 's'} added.`); return r; })}>Import…</button>}
          </div>
        </div>
        <div className="ft-main">
          <div className="ft-head">
            <div>
              <b>{sel.name}</b>
              <div className="m">
                {sel.builtIn ? 'Built-in, locked' : `Your template${sel.basedOn ? `, based on ${sel.basedOn}` : ''}${sel.editedAt ? ` · edited ${sel.editedAt}` : ''}`}
                {' · '}{countFolders(sel.folders)} folders · {roles} of {ROLE_CATALOGUE.length} roles assigned
              </div>
            </div>
          </div>
          <div className="ft-actions">
            <button type="button" className="chip" disabled={sel.id === defId} onClick={() => run(() => client.setDefault(sel.id), `New projects start from “${sel.name}”.`)}>{sel.id === defId ? '★ Default for new projects' : '☆ Set as default'}</button>
            {client.export && <button type="button" className="chip" onClick={() => run(async () => { const p = await client.export!([sel], `${sel.name}.json`); if (p) setNote(`Saved ${p}`); return null; })}>Export…</button>}
            {sel.builtIn
              ? <button type="button" className="chip primary" onClick={() => setEditing(duplicateTemplate(sel, all.map((t) => t.name)))}>Duplicate to edit</button>
              : <>
                  <button type="button" className="chip bad-btn" onClick={async () => {
                    if (await ask({ title: `Delete the template “${sel.name}”?`, message: 'Projects that use it keep their own copy. No folder on disk is touched.', confirmLabel: 'Delete', danger: true })) await run(() => client.delete(sel.id), `Deleted “${sel.name}”.`);
                  }}>Delete</button>
                  <button type="button" className="chip primary" onClick={() => setEditing(sel)}>Edit</button>
                </>}
          </div>
          <div className="ft-cols">
            <div className="ft-tree" aria-label="Folders of the template">
              <div className="ft-row root"><span className="ft-name">{sel.root}</span></div>
              <Outline nodes={sel.folders} depth={2} level={1} />
            </div>
            <dl className="ft-summary">
              <dt>File naming</dt><dd><code>{sel.naming.pattern}</code></dd>
              <dt>Numbering</dt><dd>{NUMBERING_LABEL[sel.numbering ?? 'none']}</dd>
              <dt>Roles</dt>
              <dd>{missing.length
                ? <span className="warn">{missing.length} unassigned: {missing.slice(0, 4).map((r) => r.id).join(', ')}{missing.length > 4 ? '…' : ''}</span>
                : <span className="ok">All assigned</span>}</dd>
            </dl>
          </div>
          {missing.length > 0 && <p className="m">An output whose role has no folder asks where to save.</p>}
        </div>
      </div>
      {note && <p className="m" role="status">{note}</p>}
    </div>
  );
}

type EditorTab = 'tree' | 'roles' | 'naming' | 'preview';

export function TemplateEditor({ template, isNew, onSave, onCancel }: {
  template: FolderTemplate; isNew: boolean; onSave: (t: FolderTemplate) => Promise<void>; onCancel: () => void;
}) {
  const [hist, setHist] = useState<EditHistory<FolderTemplate>>(() => startHistory(template));
  const [sel, setSel] = useState<string | null>(template.folders[0]?.id ?? null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; place: DropPlace } | null>(null);
  const [tab, setTab] = useState<EditorTab>('tree');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const treeRef = useRef<HTMLDivElement>(null);

  const t = hist.present;
  const nodes = t.folders;
  const dirty = isNew || t !== template;
  const set = (next: FolderTemplate) => setHist((h) => pushHistory(h, next));
  const setNodes = (folders: FolderNode[]) => set({ ...t, folders });
  const node = sel ? findNode(nodes, sel) : undefined;
  const issues = useMemo(() => validateTemplate(t), [t]);
  const naming = useMemo(() => namingIssues(t.naming), [t.naming]);
  const errors = [...issues.filter((i) => i.level === 'error'), ...naming.map((m) => ({ level: 'error' as const, message: m }))];
  const flagged = useMemo(() => new Map(issues.filter((i) => i.nodeId).map((i) => [i.nodeId!, i])), [issues]);
  const open = (id: string) => setClosed((c) => { const n = new Set(c); n.delete(id); return n; });

  const add = (sub: boolean) => {
    const r = sub && node ? addSubfolder(nodes, node.id) : addFolder(nodes, node?.id ?? null);
    setNodes(r.nodes);
    if (sub && node) open(node.id);
    setSel(r.id);
    setRenaming(r.id);
  };
  const del = () => {
    if (!node) return;
    const sibs = (ancestorsOf(nodes, node.id)?.slice(-1)[0]?.children ?? nodes);
    const i = sibs.findIndex((n) => n.id === node.id);
    setNodes(removeNode(nodes, node.id));
    setSel((sibs[i + 1] ?? sibs[i - 1] ?? ancestorsOf(nodes, node.id)?.slice(-1)[0])?.id ?? null);
  };
  const command = (c: ReturnType<typeof editorKey>) => {
    if (c === 'undo') { setHist(undoHistory); return; }
    if (c === 'redo') { setHist(redoHistory); return; }
    if (!node) return;
    if (c === 'rename') setRenaming(node.id);
    else if (c === 'delete') del();
    else if (c === 'up') setNodes(moveBy(nodes, node.id, -1));
    else if (c === 'down') setNodes(moveBy(nodes, node.id, 1));
    else if (c === 'indent') { const above = (ancestorsOf(nodes, node.id)?.slice(-1)[0]?.children ?? nodes); const i = above.findIndex((n) => n.id === node.id); if (i > 0) open(above[i - 1].id); setNodes(indentNode(nodes, node.id)); }
    else if (c === 'outdent') setNodes(outdentNode(nodes, node.id));
  };
  const onTreeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;
    if (e.key === 'Escape' && drag) { e.preventDefault(); setDrag(null); setDrop(null); return; }
    const c = editorKey(e);
    if (c) { e.preventDefault(); command(c); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const visible: string[] = [];
      const walk = (ns: readonly FolderNode[]) => ns.forEach((n) => { visible.push(n.id); if (n.children?.length && !closed.has(n.id)) walk(n.children); });
      walk(nodes);
      const i = sel ? visible.indexOf(sel) : -1;
      const next = visible[Math.max(0, Math.min(visible.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { e.preventDefault(); setSel(next); }
    }
  };
  const placeAt = (e: DragEvent<HTMLDivElement>): DropPlace => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / (r.height || 1);
    return y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside';
  };
  const save = async () => {
    setBusy(true);
    try { await onSave(t); } catch (e) { setError(message(e)); setBusy(false); }
  };

  const rows = (ns: readonly FolderNode[], level: number): ReactNode => ns.map((n) => {
    const kids = !!n.children?.length;
    const isOpen = kids && !closed.has(n.id);
    const issue = flagged.get(n.id);
    const cls = ['ft-row', 'edit', n.id === sel ? 'sel' : '', drag === n.id ? 'drag' : '', drop?.id === n.id ? `drop-${drop.place}` : ''].filter(Boolean).join(' ');
    return (
      <div key={n.id}>
        <div
          className={cls} style={{ paddingLeft: 8 + level * 18 }} role="treeitem" aria-selected={n.id === sel} aria-level={level + 1} aria-expanded={kids ? isOpen : undefined}
          draggable={renaming !== n.id}
          onClick={() => setSel(n.id)} onDoubleClick={() => setRenaming(n.id)}
          onDragStart={(e) => { setDrag(n.id); setSel(n.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.id); }}
          onDragEnd={() => { setDrag(null); setDrop(null); }}
          onDragOver={(e) => { if (drag && canDrop(nodes, drag, n.id)) { e.preventDefault(); const place = placeAt(e); if (drop?.id !== n.id || drop.place !== place) setDrop({ id: n.id, place }); } }}
          onDragLeave={() => { if (drop?.id === n.id) setDrop(null); }}
          onDrop={(e) => { e.preventDefault(); if (drag && drop) { if (drop.place === 'inside') open(n.id); setNodes(moveNode(nodes, drag, drop.id, drop.place)); } setDrag(null); setDrop(null); }}
        >
          <button type="button" className="ft-twist" tabIndex={-1} aria-label={isOpen ? 'Collapse' : 'Expand'} disabled={!kids}
            onClick={(e) => { e.stopPropagation(); setClosed((c) => { const x = new Set(c); if (x.has(n.id)) x.delete(n.id); else x.add(n.id); return x; }); }}>{kids ? (isOpen ? '▾' : '▸') : ''}</button>
          {renaming === n.id
            ? <input
                className="ft-rename" aria-label="Folder name" defaultValue={n.name} autoFocus onFocus={(e) => e.currentTarget.select()} onClick={(e) => e.stopPropagation()}
                onBlur={(e) => { const v = e.currentTarget.value; if (v !== n.name) setNodes(renameNode(nodes, n.id, v)); setRenaming(null); }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); treeRef.current?.focus(); }
                  else if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.value = n.name; setRenaming(null); treeRef.current?.focus(); }
                }} />
            : <span className={`ft-name${issue?.level === 'error' ? ' bad' : ''}`}>{n.name}</span>}
          {roleTags(n)}
          {n.when && n.when !== 'always' && <span className="ft-tag when">{n.when}</span>}
          {issue && renaming !== n.id && <span className={issue.level === 'error' ? 'bad' : 'warn'} title={issue.message}>⚠</span>}
        </div>
        {isOpen && rows(n.children!, level + 1)}
      </div>
    );
  });

  const path = node ? [fillName(t.root, SAMPLE_VARS), ...(ancestorsOf(nodes, node.id) ?? []).map((a) => fillName(a.name, SAMPLE_VARS)), fillName(node.name, SAMPLE_VARS)].join('\\') : '';
  const preview = tab === 'preview' ? expandTemplate(t, SAMPLE_VARS, ALL_FLAGS, SAMPLE_BUILDINGS) : null;
  const groups = [...new Set(ROLE_CATALOGUE.map((r) => r.group))];

  return (
    <div className="ft">
      <div className="ft-head">
        <label className="ft-title">Template name
          <input value={t.name} maxLength={120} onChange={(e) => set({ ...t, name: e.target.value })} onKeyDown={noSubmit} />
        </label>
        <label className="ft-title">Project folder name
          <input value={t.root} maxLength={120} onChange={(e) => set({ ...t, root: e.target.value })} onKeyDown={noSubmit} />
        </label>
        {dirty && <span className="warn" role="status">Unsaved changes ●</span>}
      </div>
      <div className="tabs prefs-tabs">
        {(['tree', 'roles', 'naming', 'preview'] as const).map((k) => (
          <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{{ tree: 'Tree', roles: 'Roles', naming: 'File naming', preview: 'Preview' }[k]}</button>
        ))}
      </div>

      {tab === 'tree' && (
        <>
          <div className="ft-actions" role="toolbar" aria-label="Folder tools">
            <button type="button" className="chip" onClick={() => add(false)}>+ Folder</button>
            <button type="button" className="chip" disabled={!node} onClick={() => add(true)}>+ Subfolder</button>
            <button type="button" className="chip" disabled={!node} title="Rename (F2)" onClick={() => command('rename')}>Rename</button>
            <button type="button" className="chip" disabled={!node} title="Delete from the template (Del). No folder on disk is touched." onClick={() => command('delete')}>Delete</button>
            <button type="button" className="chip" disabled={!node} title="Move up (Alt+↑)" aria-label="Move up" onClick={() => command('up')}>↑</button>
            <button type="button" className="chip" disabled={!node} title="Move down (Alt+↓)" aria-label="Move down" onClick={() => command('down')}>↓</button>
            <button type="button" className="chip" disabled={!node} title="Indent (Tab)" onClick={() => command('indent')}>Indent</button>
            <button type="button" className="chip" disabled={!node} title="Outdent (Shift+Tab)" onClick={() => command('outdent')}>Outdent</button>
            <select aria-label="Renumber this level" value="" disabled={!node} onChange={(e) => { if (node && e.target.value) setNodes(renumberLevel(nodes, node.id, e.target.value as FolderNumbering)); }}>
              <option value="">Renumber…</option>
              {NUMBERING.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" className="chip" onClick={() => setClosed(new Set())}>Expand all</button>
            <button type="button" className="chip" disabled={!hist.past.length} title="Undo (Ctrl+Z)" onClick={() => command('undo')}>Undo</button>
            <button type="button" className="chip" disabled={!hist.future.length} title="Redo (Ctrl+Y)" onClick={() => command('redo')}>Redo</button>
          </div>
          <div className="ft-cols edit">
            <div className="ft-tree" role="tree" aria-label="Folders of the template" tabIndex={0} ref={treeRef} onKeyDown={onTreeKey}>
              <div className="ft-row root"><span className="ft-name">{t.root}</span></div>
              {rows(nodes, 1)}
              {!nodes.length && <p className="m">No folders yet. Use + Folder.</p>}
            </div>
            <div className="ft-insp">
              <div className="ft-sec">Selected folder</div>
              {!node && <p className="m">Select a folder to change it.</p>}
              {node && (
                <>
                  <label>Name<input value={node.name} maxLength={120} onChange={(e) => setNodes(renameNode(nodes, node.id, e.target.value))} onKeyDown={noSubmit} /></label>
                  <p className="m ft-path" title="With the sample project">{path} <span>({path.length} of 200 characters)</span></p>
                  <div className="ft-field">Roles: outputs saved here
                    <div className="ft-roles">
                      {nodeRoles(node).map((r) => (
                        <span key={r} className="ft-tag role">{roleById(r)?.label ?? r}
                          <button type="button" aria-label={`Remove the role ${r}`} onClick={() => setNodes(removeRole(nodes, node.id, r))}>×</button>
                        </span>
                      ))}
                      {!nodeRoles(node).length && <span className="m">None</span>}
                    </div>
                    <select aria-label="Add a role" value="" onChange={(e) => { if (e.target.value) setNodes(addRole(nodes, node.id, e.target.value)); }}>
                      <option value="">Add a role…</option>
                      {groups.map((g) => (
                        <optgroup key={g} label={g}>
                          {ROLE_CATALOGUE.filter((r) => r.group === g && !nodeRoles(node).includes(r.id)).map((r) => {
                            const at = roleFolder(nodes, r.id);
                            return <option key={r.id} value={r.id}>{r.label}{at ? ` (move here from ${at.name})` : ''}</option>;
                          })}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <label>Only when
                    <select value={node.when ?? 'always'} onChange={(e) => setNodes(setNodeField(nodes, node.id, 'when', e.target.value))}>
                      {FOLDER_WHEN.map((w) => <option key={w} value={w}>{WHEN_LABEL[w]}</option>)}
                    </select>
                  </label>
                  <label>Subfolders made on use
                    <select value={node.onUse ?? ''} onChange={(e) => setNodes(setNodeField(nodes, node.id, 'onUse', e.target.value))}>
                      <option value="">None</option>
                      {[...new Set([...ON_USE, ...(node.onUse ? [node.onUse] : [])])].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label>Note<input value={node.note ?? ''} maxLength={200} onChange={(e) => setNodes(setNodeField(nodes, node.id, 'note', e.target.value))} onKeyDown={noSubmit} /></label>
                </>
              )}
              <div className="ft-sec">Checks</div>
              {!issues.length && <p className="ok">No problems found.</p>}
              <ul className="ft-issues">
                {issues.slice(0, 12).map((i, k) => (
                  <li key={k} className={i.level === 'error' ? 'bad' : 'warn'}>
                    {i.nodeId
                      ? <button type="button" onClick={() => { const up = ancestorsOf(nodes, i.nodeId!) ?? []; setClosed((c) => { const n = new Set(c); up.forEach((a) => n.delete(a.id)); return n; }); setSel(i.nodeId!); }}>{i.message}</button>
                      : i.message}
                  </li>
                ))}
                {issues.length > 12 && <li className="m">and {issues.length - 12} more</li>}
              </ul>
            </div>
          </div>
        </>
      )}

      {tab === 'roles' && <RolesTab nodes={nodes} onChange={setNodes} />}
      {tab === 'naming' && <NamingTab rule={t.naming} onChange={(naming) => set({ ...t, naming })} />}

      {preview && (
        <>
          <p className="m">The folders a sample project gets, with every scope switched on and one building.</p>
          <div className="ft-tree preview" aria-label="Preview">
            <div className="ft-row root"><span className="ft-name">{preview.root}</span></div>
            {preview.folders.map((f) => (
              <div key={`${f.path}`} className="ft-row" style={{ paddingLeft: 8 + f.path.split('/').length * 18 }}>
                <span className="ft-name">{f.path.split('/').pop()}</span>
                {!!f.roles.length && <span className="ft-tag role">{f.roles.length > 2 ? `${f.roles[0]} +${f.roles.length - 1}` : f.roles.join(', ')}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="bad" role="alert">{error}</p>}
      <div className="ft-foot">
        <span className="m">{countFolders(nodes)} folders{errors.length ? ` · ${errors.length} problem${errors.length === 1 ? '' : 's'} to fix before saving` : ''}</span>
        <span className="sp" />
        <button type="button" className="chip" onClick={async () => {
          if (t === template || await ask({ title: 'Discard the changes to this template?', confirmLabel: 'Discard', danger: true })) onCancel();
        }}>{dirty ? 'Discard' : 'Back'}</button>
        <button type="button" className="chip primary" disabled={busy || !!errors.length || !t.name.trim()} onClick={save}>Save template</button>
      </div>
    </div>
  );
}
