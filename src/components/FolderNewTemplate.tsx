import { useMemo, useState, type KeyboardEvent } from 'react';
import { LAYOUTS, layoutTemplate, nameList, previewFolders, repeatSettings, sampleUnits, withRepeat, type RepeatSettings } from '../model/folderLayouts';
import { fillName, SAMPLE_VARS, type FolderLayout, type FolderTemplate } from '../model/folderTemplates';

const noSubmit = (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') e.preventDefault(); };

/** Preferences → Folder templates → + New (spec C7): the six layouts a template starts from and, for
 * building/phase-first, what the folders repeat for. "Create and edit" opens the editor; nothing is saved here. */
export default function FolderNewTemplate({ takenNames, onCreate, onCancel }: {
  takenNames: readonly string[];
  onCreate: (t: FolderTemplate) => void;
  onCancel: () => void;
}) {
  const [sel, setSel] = useState<FolderLayout>('building');
  const start = useMemo(() => layoutTemplate('building', takenNames), [takenNames]);
  const first = useMemo(() => repeatSettings(start), [start]);
  const [source, setSource] = useState<RepeatSettings['source']>(first.source);
  const [name, setName] = useState(first.name);
  const [shared, setShared] = useState(first.shared.join(', '));
  const [phases, setPhases] = useState(first.phases.join(', '));
  const settings: RepeatSettings = { source, name: name.trim() || first.name, shared: nameList(shared), phases: nameList(phases) };
  const repeated = useMemo(() => withRepeat(start, settings), [start, source, settings.name, shared, phases]); // eslint-disable-line react-hooks/exhaustive-deps -- `settings` is made from these
  const units = sampleUnits(settings);
  const preview = useMemo(() => previewFolders(repeated, SAMPLE_VARS, units), [repeated, units.map((u) => u.name).join('/')]); // eslint-disable-line react-hooks/exhaustive-deps -- the units by name
  const commonName = settings.shared[0] ?? 'the shared folders';

  const create = () => onCreate(sel === 'building' ? { ...repeated, name: start.name } : layoutTemplate(sel, takenNames));

  return (
    <div className="ft">
      <div className="ft-head"><b>New folder template</b></div>
      <p className="m" style={{ margin: 0 }}>Pick a layout to start from. You can change everything in the editor.</p>
      <div className="ft-cards" role="radiogroup" aria-label="Layout to start from">
        {LAYOUTS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={sel === l.id} className={`ft-card${sel === l.id ? ' sel' : ''}`} onClick={() => setSel(l.id)}>
            <b>{l.name}</b>
            <pre>{l.tree}</pre>
            <span className="m">{l.note}</span>
          </button>
        ))}
      </div>
      {sel === 'building' && (
        <div className="ft-cols edit repeat">
          <div className="ft-main">
            <div className="ft-sec">Repeat for</div>
            <div className="ft-actions" role="radiogroup" aria-label="Repeat for">
              <label className="ft-row tick"><input type="radio" name="ft-repeat" checked={source === 'buildings'} onChange={() => setSource('buildings')} /> Buildings in Building information</label>
              <label className="ft-row tick"><input type="radio" name="ft-repeat" checked={source === 'phases'} onChange={() => setSource('phases')} /> Phases I type</label>
            </div>
            {source === 'phases' && (
              <label className="ft-field">Phases
                <input value={phases} maxLength={2000} onChange={(e) => setPhases(e.target.value)} onKeyDown={noSubmit} />
              </label>
            )}
            <label className="ft-field">Folder name
              <input className="mono" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onKeyDown={noSubmit} />
            </label>
            <label className="ft-field">Shared folders, once at the top
              <input value={shared} maxLength={2000} onChange={(e) => setShared(e.target.value)} onKeyDown={noSubmit} />
            </label>
            <p className="m" style={{ margin: 0 }}>
              {source === 'phases'
                ? `Outputs of the whole project save into ${commonName}. Each phase gets its own folders.`
                : `Outputs that belong to a building (its DB schedules, its BOQ when the BOQ is split by building) save into that building's folder. Everything else saves into ${commonName}. A building added later is offered on the Customise card.`}
            </p>
          </div>
          <div className="ft-tree preview" aria-label="Preview">
            <div className="m" style={{ padding: '0 10px 4px', fontSize: 12 }}>Preview: project with {units.length} {source === 'phases' ? (units.length === 1 ? 'phase' : 'phases') : 'buildings'}</div>
            <div className="ft-row root"><span className="ft-name">{fillName(repeated.root, SAMPLE_VARS)}</span></div>
            {preview.map((f) => (
              <div key={f.path} className="ft-row" style={{ paddingLeft: 8 + f.path.split('/').length * 18 }}><span className="ft-name">{f.path.replace(/^.*\//, '')}</span></div>
            ))}
          </div>
        </div>
      )}
      <div className="ft-foot">
        <span className="sp" />
        <button type="button" className="chip" onClick={onCancel}>Cancel</button>
        <button type="button" className="chip primary" onClick={create}>Create and edit</button>
      </div>
    </div>
  );
}
