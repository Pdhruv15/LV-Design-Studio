/** New template (spec C7): the six layouts a template can start from, the "Repeat for" settings of a
 * building/phase-first template, and which building's folder an output saves into. Pure: no disk access. */

import { builtInTemplate, fromOutline } from './folderTemplateBuiltins';
import { duplicateTemplate } from './folderTemplateEdit';
import { applyOverrides, expandTemplate, fillName, walkNodes, type ExpandedFolder, type FolderBuilding, type FolderLayout, type FolderNode, type FolderTemplate, type FolderVars, type ProjectFolderOverrides } from './folderTemplates';
import { SCOPE_FLAGS } from './projectFolderPlan';

export interface LayoutCard { id: FolderLayout; name: string; tree: string; note: string }

/** The six cards, as on the approved screen. */
export const LAYOUTS: readonly LayoutCard[] = [
  { id: 'discipline', name: 'Discipline-first', tree: '01_Admin\n05_Calcs\n06_Drawings\n09_BOQ_Cost\n…', note: 'Starts from Electrical consultant full' },
  { id: 'stage', name: 'Stage-first', tree: 'Concept\n  Calcs · Drawings\nSchematic\nDetailed\nIFC', note: 'Each stage holds Calcs and Drawings' },
  { id: 'building', name: 'Building / phase-first', tree: '00_Common\nB1_Villa-A\n  Calcs · Drawings\nB2_Villa-B\n…', note: 'One set of folders per building' },
  { id: 'iso19650', name: 'ISO 19650 containers', tree: '00_WIP\n01_SHARED\n02_PUBLISHED\n03_ARCHIVE', note: 'With discipline subfolders' },
  { id: 'flat', name: 'Flat & simple', tree: '01_Admin\n03_Calcs\n04_Drawings\n06_BOQ', note: 'Starts from Villa / small building' },
  { id: 'blank', name: 'Blank', tree: '{ProjectNo}_{ProjectShort}', note: 'The root only' }
];

const BASED_ON: Partial<Record<FolderLayout, string>> = { discipline: 'consultant-full', building: 'multi-building', iso19650: 'iso19650', flat: 'villa-small' };

/** Stage-first: a folder per design stage with Calcs and Drawings inside. The outputs of the working stage
 * (Detailed) and the issued drawings (IFC) have roles; the rest ask where to save until roles are given. */
const STAGE_FOLDERS = `
Concept
  Calcs
  Drawings
Schematic
  Calcs
  Drawings
Detailed
  Calcs [calcLoad,calcVd,calcFault,calcCable,calcEarthing,calcLighting,calcPv,calcStandby,studyReports]
  Drawings [cadWorking,drawingsWip]
IFC
  Calcs
  Drawings [drawingsIssued] >Rev-{Rev}`;

const freeTemplateName = (taken: readonly string[]): string => {
  const has = new Set(taken.map((n) => n.toLowerCase()));
  if (!has.has('new template')) return 'New template';
  let i = 2;
  while (has.has(`new template ${i}`)) i++;
  return `New template ${i}`;
};

/** A new, unsaved template to start the editor with: a copy of the built-in the layout starts from, the
 * stage folders, or only the root. */
export function layoutTemplate(layout: FolderLayout, takenNames: readonly string[]): FolderTemplate {
  const name = freeTemplateName(takenNames);
  const from = BASED_ON[layout] ? builtInTemplate(BASED_ON[layout]!) : undefined;
  if (from) return { ...duplicateTemplate(from, takenNames), name, layout };
  const blank = duplicateTemplate({ ...builtInTemplate('consultant-full')!, folders: [] }, takenNames);
  const { basedOn: _b, ...rest } = blank;
  return { ...rest, name, layout, numbering: 'none', folders: layout === 'stage' ? fromOutline('st', STAGE_FOLDERS) : [] };
}

/* ---------- Repeat for (building/phase-first) ---------- */

export interface RepeatSettings {
  source: 'buildings' | 'phases';
  /** Folder name pattern of each copy, e.g. "{BuildingCode}_{BuildingName}". */
  name: string;
  /** Names of the folders that stay once at the top. */
  shared: string[];
  /** The phases, when the source is phases. */
  phases: string[];
}

/** The folder of the template repeated for each building (the first at the top). */
export const eachNode = (t: Pick<FolderTemplate, 'folders'>): FolderNode | undefined => t.folders.find((n) => n.when === 'building:each');

/** The Repeat for settings as a template has them now. */
export function repeatSettings(t: FolderTemplate): RepeatSettings {
  const each = eachNode(t);
  const sharedIds = new Set(t.repeat?.shared ?? []);
  const shared = t.folders.filter((n) => n.when !== 'building:each' && (!t.repeat || sharedIds.has(n.id))).map((n) => n.name);
  return { source: t.repeat?.source ?? 'buildings', name: t.repeat?.name ?? each?.name ?? '{BuildingCode}_{BuildingName}', shared, phases: t.repeat?.phases ?? ['Phase-1', 'Phase-2'] };
}

/** Splits a typed list ("00_Common, 01_Admin") into names: trimmed, no empties or repeats, at most 50. */
export const nameList = (text: string): string[] => [...new Set(text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, 50);

/** The template with the Repeat for settings applied: the repeated folder takes the name pattern, the shared
 * folders stay once at the top (one kept with its subfolders when it has the same name; a new name is a new
 * empty folder), and other top folders are left out. The repeated folder keeps its subfolders. */
export function withRepeat(t: FolderTemplate, r: RepeatSettings): FolderTemplate {
  const each: FolderNode = eachNode(t) ?? { id: `${t.id}.each`, name: r.name, when: 'building:each', children: fromOutline(`${t.id}.each`, 'Calcs\nDrawings') };
  const taken = new Set<string>();
  walkNodes(t.folders, (n) => { taken.add(n.id); });
  const free = (base: string) => { let id = base, i = 2; while (taken.has(id)) id = `${base}${i++}`; taken.add(id); return id; };
  const tops = t.folders.filter((n) => n !== each && n.when !== 'building:each');
  const shared = r.shared.map((name) => tops.find((n) => n.name.toLowerCase() === name.toLowerCase()) ?? { id: free(`${t.id}.shared`), name });
  const repeat: NonNullable<FolderTemplate['repeat']> = { source: r.source, name: r.name, shared: shared.map((n) => n.id), ...(r.source === 'phases' ? { phases: r.phases } : {}) };
  return { ...t, repeat, folders: [...shared, { ...each, name: r.name, when: 'building:each' }] };
}

/** The sample copies the C7 preview shows: two buildings, or the phases typed. */
export function sampleUnits(r: Pick<RepeatSettings, 'source' | 'phases'>): FolderBuilding[] {
  if (r.source === 'phases') return r.phases.slice(0, 6).map((p, i) => ({ code: `P${i + 1}`, name: p.replace(/\s+/g, '-') }));
  return [{ code: 'B1', name: 'Villa-A' }, { code: 'B2', name: 'Villa-B' }];
}

/** The folders a template makes for a sample project, every condition on, for the preview. */
export const previewFolders = (t: FolderTemplate, vars: FolderVars, units: readonly FolderBuilding[]): ExpandedFolder[] => expandTemplate(t, vars, SCOPE_FLAGS, units).folders;

/* ---------- buildings on the Customise card (C6) ---------- */

export interface BuildingFolders {
  unit: FolderBuilding;
  /** The building's own folder (the copy of the repeated folder), relative to the project folder. */
  path: string;
  /** How many folders it makes, its subfolders included. */
  count: number;
  /** The name it had when the folders were last made here; its old folder is left as it is. */
  renamedFrom?: { name: string; path: string };
}

/** The building folders of the project: each building's own folder and, from the copies the folders were
 * last made for on this computer (`made`), the old folder of a building renamed since. */
export function buildingFolders(t: FolderTemplate, ov: ProjectFolderOverrides | undefined, vars: FolderVars, units: readonly FolderBuilding[], made: readonly FolderBuilding[] | undefined, unticked: Iterable<string> = []): BuildingFolders[] {
  const off = new Set(unticked);
  const prune = (nodes: readonly FolderNode[]): FolderNode[] => nodes.filter((n) => !off.has(n.id)).map((n) => (n.children ? { ...n, children: prune(n.children) } : n));
  const tree = prune(applyOverrides(t, ov));
  const each = tree.find((n) => n.when === 'building:each');
  if (!each) return [];
  const all = expandTemplate({ ...t, folders: tree }, vars, SCOPE_FLAGS, units).folders;
  const top = (u: FolderBuilding) => fillName(each.name, { ...vars, BuildingCode: u.code, BuildingName: u.name });
  return units.map((u) => {
    const path = top(u);
    const before = u.id ? made?.find((m) => m.id === u.id) : undefined;
    const oldPath = before ? top(before) : undefined;
    return {
      unit: u, path,
      count: all.filter((f) => f.building === u.code).length,
      ...(before && oldPath && oldPath.toLowerCase() !== path.toLowerCase() ? { renamedFrom: { name: before.name, path: oldPath } } : {})
    };
  });
}
