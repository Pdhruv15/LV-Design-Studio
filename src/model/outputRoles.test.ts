import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtInTemplate } from './folderTemplateBuiltins';
import { roleById } from './folderRoles';
import { STAGE_INFO } from './designStage';
import type { FolderTemplate, ProjectFolder } from './folderTemplates';
import { rememberChoice, rememberedChoice } from './projectFolderPlan';
import {
  choiceAfterSave, fillOnUse, issueValues, joinInside, OUTPUT_KEYS, OUTPUTS, outputRole, projectCopyTarget, projectValues, roleFolder,
  saveTarget, SEQUENCE, STAGE_SHORT, type OutputKey, type SaveTargetInput
} from './outputRoles';
import type { Project } from '../types';

const tpl = builtInTemplate('consultant-full') as FolderTemplate;
const folder: ProjectFolder = { templateId: tpl.id, version: tpl.version, template: tpl };
const project = (extra: Partial<Project> = {}) => ({ id: 'p1', name: 'Villa Jumeirah', studyReport: { projectNo: 'P2611' }, folder, ...extra }) as unknown as Project;
const ROOT = '/jobs/P2611_Villa Jumeirah';
const remembered = { root: ROOT, unticked: [] as string[] };
const now = new Date(2026, 10, 17);
const at = (output: OutputKey, extra: Partial<SaveTargetInput> = {}) => saveTarget({ project: project(), output, defaultName: 'Villa - voltage drop.pdf', ext: 'pdf', remembered, now, ...extra });

describe('the output map', () => {
  it('uses only roles of the catalogue, with their own document type', () => {
    for (const k of OUTPUT_KEYS) {
      const o = outputRole(k);
      if (!o.role) { expect(o.docType).toBeUndefined(); continue; }
      const r = roleById(o.role);
      expect(r, k).toBeDefined();
      if (o.docType) expect(o.docType, k).toBe(r!.docType);
    }
  });
  it('gives every numbering series a place in its document type', () => {
    for (const k of OUTPUT_KEYS) {
      const o = outputRole(k);
      if (o.seqKey) expect(SEQUENCE[o.docType!], k).toContain(o.seqKey);
    }
  });
  it('keeps the short stage names the same as the design stages', () => {
    for (const [k, v] of Object.entries(STAGE_SHORT)) expect(v).toBe(STAGE_INFO[k as keyof typeof STAGE_INFO].short);
  });
});

describe('where a save dialog opens and what it suggests', () => {
  it('opens in the role folder with a name from the naming rule', () => {
    expect(at('vdReport')).toEqual({ dir: `${ROOT}/05_Calcs/02_Volt_Drop`, root: ROOT, relDir: '05_Calcs/02_Volt_Drop', role: 'calcVd', roleDir: `${ROOT}/05_Calcs/02_Volt_Drop`, name: 'P2611-E-CAL-004.pdf' });
  });
  it('adds the latest revision, and lets the save call give its own values', () => {
    const p = project({ revisions: [{ id: 'A' }, { id: 'B' }] as Project['revisions'] });
    expect(at('vdReport', { project: p }).name).toBe('P2611-E-CAL-004-B.pdf');
    expect(at('loadSchedule', { project: p, ext: 'xlsx', values: { Seq: 7, Rev: 'C' } }).name).toBe('P2611-E-SCH-007-C.xlsx');
  });
  it('behaves as before without a project folder, without the folder on this computer, or for an output with no role', () => {
    const plain = { name: 'Villa - voltage drop.pdf' };
    expect(at('vdReport', { project: project({ folder: undefined }) })).toEqual(plain);
    expect(at('vdReport', { remembered: undefined })).toEqual(plain);
    expect(at('projectJson')).toEqual(plain);
    expect(at('vdReport', { project: null })).toEqual(plain);
  });
  it('behaves as before when the role has no folder, or its folder was left unticked or was taken out', () => {
    const plain = { name: 'Villa - voltage drop.pdf' };
    const noVd: ProjectFolder = { ...folder, overrides: { add: [], rename: [], hide: [], roles: { calcVd: '' } } };
    expect(at('vdReport', { project: project({ folder: noVd }) })).toEqual(plain);
    const calcs = tpl.folders.find((n) => n.name === '05_Calcs')!;
    expect(at('vdReport', { remembered: { root: ROOT, unticked: [calcs.id] } })).toEqual(plain);
    expect(at('lightningReport', { project: project({ folder: { ...folder, overrides: { add: [], rename: [], hide: [calcs.id], roles: {} } } }) })).toEqual(plain);
  });
  it('keeps the app\'s own name for an output with no document type', () => {
    expect(at('drawingCad', { defaultName: 'E-SLD-001_RevB.dxf', ext: 'dxf' })).toMatchObject({ dir: `${ROOT}/06_Drawings/01_WIP`, name: 'E-SLD-001_RevB.dxf' });
  });
  it('fills "subfolders on use" when the save call knows the values, and leaves them out when not', () => {
    expect(at('issuedDrawingsPdf', { values: { Stage: 'Detailed', Rev: 'B' } }).relDir).toBe('06_Drawings/02_Issued/Detailed/Rev-B');
    expect(at('issuedDrawingsPdf', { values: { Stage: 'Detailed' } }).relDir).toBe('06_Drawings/02_Issued');
    expect(at('transmittal', { values: { TrNo: 'T-003', Seq: 'T-003' } })).toMatchObject({ relDir: '11_Transmittals/TR-T-003', name: 'P2611-E-TR-T-003.pdf' });
    expect(at('boq', { values: { BoqRev: 'C', Rev: 'C' } })).toMatchObject({ relDir: '09_BOQ_Cost/01_BOQ/Rev-C', name: 'P2611-E-BOQ-001-C.pdf' });
    expect(at('boq')).toMatchObject({ relDir: '09_BOQ_Cost/01_BOQ' });
  });
  it('suggests the folder the user chose last time, without making anything', () => {
    const t = at('vdReport', { choice: '/elsewhere/calcs' });
    expect(t).toMatchObject({ dir: '/elsewhere/calcs', role: 'calcVd', name: 'P2611-E-CAL-004.pdf' });
    expect(t.root).toBeUndefined();
    expect(t.relDir).toBeUndefined();
  });
  it('gives the browser version the new name and no folder', () => {
    expect(at('vdReport', { remembered: undefined, web: true })).toEqual({ name: 'P2611-E-CAL-004.pdf' });
  });
  it('uses the Windows separator of the project folder', () => {
    expect(at('vdReport', { remembered: { root: 'C:\\Jobs\\P2611', unticked: [] } }).dir).toBe('C:\\Jobs\\P2611\\05_Calcs\\02_Volt_Drop');
    expect(joinInside('/a/b/', 'c/d')).toBe('/a/b/c/d');
  });
  it('an output of the whole project whose role is in the building folders saves into the shared folder', () => {
    const multi = builtInTemplate('multi-building')!;
    const f: ProjectFolder = { templateId: multi.id, version: multi.version, template: multi };
    expect(roleFolder(f, 'calcVd', {})).toEqual({ path: '00_Common' });
    expect(roleFolder(f, 'transmittals', {})).toEqual({ path: '00_Common/Transmittals', onUse: 'TR-{TrNo}' });
  });
});

describe('subfolder patterns', () => {
  it('fills every field, cleans the parts, and gives up on a missing value', () => {
    expect(fillOnUse('{YYYYMMDD}_Rev{Rev}', { YYYYMMDD: '20261117', Rev: 'B' })).toBe('20261117_RevB');
    expect(fillOnUse('{Stage}/Rev-{Rev}', { Stage: 'Detailed design', Rev: 'B' })).toBe('Detailed-design/Rev-B');
    expect(fillOnUse('TR-{TrNo}', { TrNo: 'a/b' })).toBe('TR-a-b');
    expect(fillOnUse('{Stage}/Rev-{Rev}', { Stage: 'IFC' })).toBeUndefined();
    expect(fillOnUse('{Rev}', { Rev: '..' })).toBeUndefined();
    expect(fillOnUse('{Rev}', { Rev: 'CON' })).toBeUndefined();
  });
});

describe('remembering where the user saved instead', () => {
  const t = at('vdReport');
  it('remembers another folder, forgets on a save back in the role folder, and leaves a save where suggested alone', () => {
    expect(choiceAfterSave(t, '/elsewhere/x.pdf')).toBe('/elsewhere');
    expect(choiceAfterSave(t, `${ROOT}/05_Calcs/02_Volt_Drop/x.pdf`)).toBeUndefined();
    const chosen = at('vdReport', { choice: '/elsewhere' });
    expect(choiceAfterSave(chosen, '/elsewhere/x.pdf')).toBeUndefined();
    expect(choiceAfterSave(chosen, `${ROOT}/05_Calcs/02_Volt_Drop/x.pdf`)).toBe('');
    expect(choiceAfterSave(chosen, `${ROOT}/05_Calcs/02_Volt_Drop/old/x.pdf`)).toBe('');
  });
  it('compares Windows paths without case', () => {
    const w = at('vdReport', { remembered: { root: 'C:\\Jobs\\P2611', unticked: [] } });
    expect(choiceAfterSave(w, 'c:\\jobs\\p2611\\05_Calcs\\02_Volt_Drop\\x.pdf')).toBeUndefined();
  });
  it('does nothing for an output with no role or a browser download', () => {
    expect(choiceAfterSave(at('projectJson'), '/x/y.json')).toBeUndefined();
    expect(choiceAfterSave(t, 'x.pdf')).toBeUndefined();
  });
  it('keeps the choice per project and role on this computer only', () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
    rememberChoice('p1', 'calcVd', '/elsewhere', s);
    rememberChoice('p1', 'boq', '/cost', s);
    expect(rememberedChoice('p1', 'calcVd', s)).toBe('/elsewhere');
    expect(rememberedChoice('p2', 'calcVd', s)).toBeUndefined();
    rememberChoice('p1', 'calcVd', '', s);
    expect(rememberedChoice('p1', 'calcVd', s)).toBeUndefined();
    rememberChoice('p1', 'boq', undefined, s);
    expect(m.size).toBe(0);
    m.set('lvds.projectFolderChoices.p1', '{bad');
    expect(rememberedChoice('p1', 'boq', s)).toBeUndefined();
  });
});

describe('values a save knows from the project', () => {
  it('takes the folder fields, the date, the stage and the latest revision', () => {
    expect(projectValues(project({ stage: { current: 'tender' }, revisions: [{ id: 'A' }] as Project['revisions'] }), now)).toEqual({ ProjectShort: 'Villa Jumeirah', ProjectNo: 'P2611', Date: '20261117', Stage: 'Tender', Rev: 'A' });
  });
  it('gives an issue its revision only when every sheet has the same one', () => {
    expect(issueValues({}, [{ rev: 'B' }, { rev: 'B' }])).toEqual({ Stage: 'Detailed', Rev: 'B' });
    expect(issueValues({}, [{ rev: 'B' }, { rev: 'C' }])).toEqual({ Stage: 'Detailed' });
  });
  it('finds the project file folder for the copy made on save', () => {
    expect(projectCopyTarget(project(), remembered)).toEqual({ root: ROOT, relDir: '03_Project_File' });
    expect(projectCopyTarget(project(), undefined)).toBeUndefined();
    expect(projectCopyTarget(project({ folder: undefined }), remembered)).toBeUndefined();
    const none: ProjectFolder = { ...folder, overrides: { add: [], rename: [], hide: [], roles: { projectFile: '' } } };
    expect(projectCopyTarget(project({ folder: none }), remembered)).toBeUndefined();
  });
});

/* ---------- every save in the app has an output key ---------- */

const HELPERS = /(?<![\w.])(saveText|saveBinary|saveBinaryAt|savePdf|saveCsv)\(/g;
/** Save calls that pass no output key of their own, with the reason. */
const ALLOWED: { file: string; helper: string; count: number; why: string }[] = [
  { file: 'src/util/files.ts', helper: 'saveText', count: 1, why: 'saveCsv passes its caller\'s context on' },
  { file: 'src/util/files.ts', helper: 'saveBinary', count: 1, why: 'savePdf passes its caller\'s context on' },
  { file: 'src/util/files.ts', helper: 'saveBinaryAt', count: 1, why: 'saveBinary passes its caller\'s context on' },
  { file: 'src/components/docs/SheetPdfPreview.tsx', helper: 'saveBinary', count: 1, why: 'the preview saves with the context its caller gives' }
];

/** The text of a call from its "(" to the matching ")", skipping strings and template literals. */
function callText(s: string, open: number): string {
  const stack: string[] = ['code'];
  const depth: number[] = [0];
  for (let j = open; j < s.length; j++) {
    const c = s[j], mode = stack[stack.length - 1];
    if (mode === "'" || mode === '"') { if (c === '\\') j++; else if (c === mode) stack.pop(); continue; }
    if (mode === '`') {
      if (c === '\\') j++;
      else if (c === '`') stack.pop();
      else if (c === '$' && s[j + 1] === '{') { stack.push('code'); depth.push(0); j++; depth[depth.length - 1] = 1; }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') stack.push(c);
    else if ('({['.includes(c)) depth[depth.length - 1]++;
    else if (')}]'.includes(c)) {
      depth[depth.length - 1]--;
      if (depth[depth.length - 1] === 0 && stack.length > 1) { stack.pop(); depth.pop(); continue; }
      if (depth[depth.length - 1] === 0 && c === ')') return s.slice(open, j + 1);
    }
  }
  throw new Error('unclosed call');
}

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

describe('save calls in the app', () => {
  const root = join(__dirname, '..', '..');
  const calls = sources(join(root, 'src')).flatMap((f) => {
    const s = readFileSync(f, 'utf8');
    const file = relative(root, f).replace(/\\/g, '/');
    return [...s.matchAll(HELPERS)]
      .filter((m) => !/(function|const)\s+$/.test(s.slice(Math.max(0, m.index - 20), m.index)))
      .map((m) => ({ file, helper: m[1], text: callText(s, m.index + m[1].length), line: s.slice(0, m.index).split('\n').length }));
  });
  it('finds the save calls', () => {
    expect(calls.length).toBeGreaterThan(100);
  });
  it('gives every save call an output key from the map, or is on the short allow-list', () => {
    const missing: string[] = [], unknown: string[] = [];
    const allowed = new Map(ALLOWED.map((a) => [`${a.file}|${a.helper}`, a.count]));
    for (const c of calls) {
      if (!/\boutput\b/.test(c.text)) {
        const k = `${c.file}|${c.helper}`;
        const left = allowed.get(k) ?? 0;
        if (left > 0) allowed.set(k, left - 1); else missing.push(`${c.file}:${c.line} ${c.helper}`);
        continue;
      }
      for (const m of c.text.matchAll(/\boutput\s*:\s*([^,}]+)/g)) for (const q of m[1].matchAll(/'(\w+)'/g)) if (!(q[1] in OUTPUTS)) unknown.push(`${c.file}:${c.line} ${q[1]}`);
    }
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
    expect([...allowed.entries()].filter(([, n]) => n > 0)).toEqual([]);
  });
});
