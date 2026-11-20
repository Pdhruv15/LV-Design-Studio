/** Where each export of the app goes in a project folder (spec F2): every save call has an output key, and
 * the key gives the folder role (calcVd, boq, transmittals…), the document type for the file-naming rule and
 * the numbering series. `saveTarget` decides the save dialog's starting folder and suggested name. Pure.
 *
 * An output with no role, or a project with no project folder on this computer, is saved the way it was
 * before: the Projects folder and the app's own file name. An output with a role but no document type
 * opens in its folder and keeps the app's own name (drawings named by sheet number, CAD files, ZIPs). */

import type { Project } from '../types';
import type { DocType } from './folderRoles';
import { applyOverrides, fillName, nodeRoles, type FolderNode, type FolderVars, type ProjectFolder } from './folderTemplates';
import { formatName, type NameValues } from './fileNaming';
import { folderVars, type RememberedFolder } from './projectFolderPlan';

export interface OutputRole {
  /** Folder role from ROLE_CATALOGUE; none = saved as before. */
  role?: string;
  /** Document type for the naming rule; none = the app's own file name. */
  docType?: DocType;
  /** Numbering series in its document type: gives {Study} and, by its place in SEQUENCE, {Seq}. */
  seqKey?: string;
}

/** Every export the app makes. A test fails when a save call in src has no key from this list. */
export const OUTPUTS = {
  // No role: settings, exchange files, backups and templates, saved as before.
  projectJson: {}, // a plain copy of the project file
  projectBackup: {}, // a backup archive with checkpoints
  anonymizedSample: {}, // a sample to send to the developers
  openDss: {}, // a model exchange file for another program
  feederPresets: {}, buildingPresets: {}, designReferences: {}, pageSetups: {}, layoutTemplate: {}, hatchPatterns: {},
  enclosureLibrary: {}, catalogueTemplate: {}, priceTemplate: {}, specFile: {}, scheduleFormatPackage: {}, elvLoadsPackage: {},
  folderZip: {}, // the empty project folders as a ZIP
  documentsPack: {}, // documents of every kind in one PDF or ZIP
  projectSummary: {}, // the dashboard summary, for the office
  sheetsWorkbook: {}, // a free workbook of the Sheets page

  // Calculations and reports
  conceptReport: { role: 'calcLoad', docType: 'CAL', seqKey: 'CON' },
  buildingSummary: { role: 'calcLoad', docType: 'CAL', seqKey: 'BLD' },
  calcReport: { role: 'studyReports', docType: 'CAL', seqKey: 'CALC' },
  vdReport: { role: 'calcVd', docType: 'CAL', seqKey: 'VD' },
  txGenReport: { role: 'calcStandby', docType: 'CAL', seqKey: 'TXG' },
  busbarReport: { role: 'calcCable', docType: 'CAL', seqKey: 'BB' },
  containmentReport: { role: 'calcCable', docType: 'CAL', seqKey: 'CONT' },
  pfcReport: { role: 'studyReports', docType: 'CAL', seqKey: 'PFC' },
  enclosureReport: { role: 'studyReports', docType: 'CAL', seqKey: 'ENC' },
  upsReport: { role: 'calcStandby', docType: 'CAL', seqKey: 'UPS' },
  pvReport: { role: 'calcPv', docType: 'CAL', seqKey: 'PV' },
  lightningReport: { role: 'calcEarthing', docType: 'CAL', seqKey: 'LP' },
  studyReport: { role: 'studyReports', docType: 'CAL', seqKey: 'STUDY' },
  issuePackage: { role: 'studyReports' },

  // Schedules
  loadSchedule: { role: 'loadSchedules', docType: 'SCH', seqKey: 'LS' },
  cableSchedule: { role: 'cableSchedule', docType: 'SCH', seqKey: 'CS' },
  cableTraySchedule: { role: 'cableSchedule', docType: 'SCH', seqKey: 'TRAY' },
  equipmentSchedule: { role: 'equipmentSchedule', docType: 'SCH', seqKey: 'EQ' },
  elvSchedules: { role: 'equipmentSchedule', docType: 'SCH', seqKey: 'ELV' },

  // Cost and specification
  boq: { role: 'boq', docType: 'BOQ', seqKey: 'BOQ' },
  specDoc: { role: 'specs', docType: 'SPC', seqKey: 'SPEC' },
  variations: { role: 'variations' },

  // Drawings
  drawingPdf: { role: 'drawingsWip', docType: 'DWG' }, // exported sheets, SLDs, board sheets, layouts
  issuedDrawingsPdf: { role: 'drawingsIssued', docType: 'DWG' }, // the PDF made when sheets are issued
  drawingCad: { role: 'drawingsWip' }, // DXF / DWG / SVG of sheets and ZIPs of them, named by sheet number
  drawingsZip: { role: 'drawingsWip' }, // everything: PDFs, DXF and the register
  drawingRegister: { role: 'drawingsIssued' },
  titleBlock: { role: 'titleBlocks' },
  cadDrawing: { role: 'cadWorking' }, // Design CAD: Save as, view images, objects, attribute and device lists
  enclosureDxf: { role: 'cadWorking' },

  // Authority, issue and review
  dmSubstationForm: { role: 'authDm' },
  transmittal: { role: 'transmittals', docType: 'TR' },
  submissionRegister: { role: 'transmittals' },
  reviewReport: { role: 'internalReview' },
  changesList: { role: 'internalReview' }
} as const satisfies Record<string, OutputRole>;

export type OutputKey = keyof typeof OUTPUTS;
export const OUTPUT_KEYS = Object.keys(OUTPUTS) as OutputKey[];
export const outputRole = (key: OutputKey): OutputRole => OUTPUTS[key];

/** The numbering series of each document type, in order: {Seq} is the place in this list (1, 2, 3…), so
 * two kinds of report get different numbers. A number the save call gives wins. */
export const SEQUENCE: Partial<Record<DocType, readonly string[]>> = {
  CAL: ['CON', 'BLD', 'CALC', 'VD', 'BB', 'CONT', 'PFC', 'ENC', 'TXG', 'UPS', 'PV', 'LP', 'STUDY'],
  SCH: ['LS', 'CS', 'TRAY', 'EQ', 'ELV'],
  BOQ: ['BOQ'],
  SPC: ['SPEC']
};

/** Values a save call may know: file-name fields, and the BOQ revision and transmittal number that
 * "subfolders on use" patterns ("Rev-{BoqRev}", "TR-{TrNo}") need. */
export type SaveValues = NameValues & { BoqRev?: string; TrNo?: string };

/** Short stage names, as STAGE_INFO[…].short (designStage.ts; a test keeps them the same). */
export const STAGE_SHORT = { concept: 'Concept', schematic: 'Schematic', detailed: 'Detailed', tender: 'Tender', ifc: 'IFC' } as const;
export const stageShort = (p: Pick<Project, 'stage'>): string => STAGE_SHORT[p.stage?.current ?? 'detailed'];

const ymd = (d: Date): string => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** File-name values every output knows from the project: the folder fields, today's date, the design
 * stage and the latest issued revision. */
export function projectValues(p: Pick<Project, 'name' | 'info' | 'studyReport' | 'stage' | 'revisions'>, now = new Date()): NameValues {
  const v: NameValues = { ...folderVars(p), Date: ymd(now), Stage: stageShort(p) };
  const rev = p.revisions?.[p.revisions.length - 1]?.id;
  if (rev) v.Rev = rev;
  return v;
}

/** The folder of a role inside the project folder, as the project folder was made: the project's own
 * changes applied, unticked folders (and what is in them) left out, names filled from `vars`. A role in a
 * folder made for each building is not found (the save call does not say which building). */
export function roleFolder(folder: ProjectFolder, role: string, vars: FolderVars, unticked: Iterable<string> = []): { path: string; onUse?: string } | undefined {
  if (folder.overrides?.roles[role] === '') return undefined;
  const off = new Set(unticked);
  let hit: { path: string; onUse?: string } | undefined;
  const rec = (nodes: readonly FolderNode[], parent: string) => {
    for (const n of nodes) {
      if (hit || off.has(n.id) || n.when === 'building:each') continue;
      const name = fillName(n.name, vars);
      if (!name) continue;
      const path = parent ? `${parent}/${name}` : name;
      if (nodeRoles(n).includes(role)) { hit = n.onUse ? { path, onUse: n.onUse } : { path }; return; }
      if (n.children?.length) rec(n.children, path);
    }
  };
  rec(applyOverrides(folder.template, folder.overrides), '');
  return hit;
}

const ON_USE_FIELD = /\{(\w+)\}/g;
const cleanSegment = (s: string): string => s.replace(/[<>:"/\\|?*&#%]/g, '-').replace(/[\s]+/g, '-').replace(/[. ]+$/, '').trim();

/** A "subfolders on use" pattern filled ("{Stage}/Rev-{Rev}" → "Detailed/Rev-B"); undefined when any field
 * it needs is not known, or a part comes out empty or unsafe. */
export function fillOnUse(pattern: string, values: Record<string, string | number | undefined>): string | undefined {
  const parts: string[] = [];
  for (const seg of pattern.split('/')) {
    let missing = false;
    const s = cleanSegment(seg.replace(ON_USE_FIELD, (_m, k: string) => {
      const v = values[k];
      if (v === undefined || String(v).trim() === '') { missing = true; return ''; }
      return String(v).trim();
    }));
    if (missing || !s || s === '.' || s === '..' || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s)) return undefined;
    parts.push(s.slice(0, 80));
  }
  return parts.join('/');
}

/** Joins the project folder and a path inside it ("a/b") with the separator the folder uses. */
export function joinInside(root: string, rel: string): string {
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return [root.replace(/[\\/]+$/, ''), ...rel.split('/')].join(sep);
}

export interface SaveTarget {
  /** The save dialog's starting folder (an absolute path); none = the Projects folder, as before. */
  dir?: string;
  /** The project folder and the folder inside it, to make before the dialog opens (none for a folder the user chose). */
  root?: string;
  relDir?: string;
  /** The role, for remembering where the user saved instead. */
  role?: string;
  /** The folder of the role itself (without subfolders), to tell a save there from a save elsewhere. */
  roleDir?: string;
  /** The suggested file name, with its extension. */
  name: string;
}

export interface SaveTargetInput {
  project?: Pick<Project, 'name' | 'info' | 'studyReport' | 'stage' | 'revisions' | 'folder'> | null;
  output: OutputKey;
  /** The app's own file name, with extension: used whenever the project folder does not apply. */
  defaultName: string;
  ext: string;
  values?: SaveValues;
  /** Where the project folder is on this computer (rememberedFolder). */
  remembered?: RememberedFolder;
  /** The folder the user picked last time for this project and role (rememberedChoice). */
  choice?: string;
  /** The browser version: no folders, but the naming rule's file name. */
  web?: boolean;
  now?: Date;
}

/** The save dialog's starting folder and file name for an output. With a project folder on this computer
 * and a folder for the output's role: that folder (plus its "subfolders on use" when the values are known,
 * or the folder the user chose last time) and a name from the naming rule. Otherwise the app's own name
 * and no folder, as before. */
export function saveTarget(i: SaveTargetInput): SaveTarget {
  const plain: SaveTarget = { name: i.defaultName };
  const out: OutputRole = OUTPUTS[i.output];
  const p = i.project;
  if (!out?.role || !p?.folder || (!i.web && !i.remembered?.root)) return plain;
  const vars = folderVars(p);
  const found = roleFolder(p.folder, out.role, vars, i.remembered?.unticked ?? []);
  if (!found) return plain;
  let name = i.defaultName;
  if (out.docType) {
    const seq = out.seqKey ? (SEQUENCE[out.docType] ?? []).indexOf(out.seqKey) + 1 : 0;
    const values: NameValues = { ...projectValues(p, i.now), ...(out.seqKey ? { Study: out.seqKey } : {}), ...(seq > 0 ? { Seq: seq } : {}), ...stripExtra(i.values) };
    const base = formatName(p.folder.template.naming, out.docType, values);
    if (base) name = `${base}.${i.ext}`;
  }
  if (i.web || !i.remembered) return { name };
  const root = i.remembered.root;
  const roleDir = joinInside(root, found.path);
  if (i.choice) return { dir: i.choice, role: out.role, roleDir, name };
  const now = i.now ?? new Date();
  const sub = found.onUse ? fillOnUse(found.onUse, { ...i.values, YYYYMMDD: ymd(now) }) : undefined;
  const relDir = sub ? `${found.path}/${sub}` : found.path;
  return { dir: joinInside(root, relDir), root, relDir, role: out.role, roleDir, name };
}

function stripExtra(v: SaveValues | undefined): NameValues {
  if (!v) return {};
  const { BoqRev: _b, TrNo: _t, ...rest } = v;
  return Object.fromEntries(Object.entries(rest).filter(([, x]) => x !== undefined && x !== '')) as NameValues;
}

const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/** The folder a saved file went to. */
export const folderOfFile = (file: string): string => file.replace(/[\\/][^\\/]*$/, '');

/** After a save: the folder to remember for this project and role, '' to forget the choice (the user saved
 * in the role's folder, or inside it), or undefined to leave things as they are. */
export function choiceAfterSave(t: SaveTarget, savedFile: string): string | undefined {
  if (!t.role || !t.roleDir || !/[\\/]/.test(savedFile)) return undefined;
  const dir = folderOfFile(savedFile);
  const d = norm(dir), role = norm(t.roleDir);
  if (t.dir && norm(t.dir) === d) return undefined;
  if (d === role || d.startsWith(`${role}/`)) return '';
  return dir;
}

/** Values for issuing drawings: the design stage, and the revision when every issued sheet has the same one. */
export function issueValues(p: Pick<Project, 'stage'>, sheets: readonly { rev?: string }[]): SaveValues {
  const revs = [...new Set(sheets.map((s) => s.rev?.trim() ?? ''))];
  return { Stage: stageShort(p), ...(revs.length === 1 && revs[0] ? { Rev: revs[0] } : {}) };
}

/** Where the copy of the project file goes after each save (decision 1, option B): the folder with the
 * projectFile role, when the project has a project folder on this computer and the template has that folder. */
export function projectCopyTarget(p: Pick<Project, 'name' | 'info' | 'studyReport' | 'folder'>, remembered: RememberedFolder | undefined): { root: string; relDir: string } | undefined {
  if (!p.folder || !remembered?.root) return undefined;
  const found = roleFolder(p.folder, 'projectFile', folderVars(p), remembered.unticked);
  return found ? { root: remembered.root, relDir: found.path } : undefined;
}
