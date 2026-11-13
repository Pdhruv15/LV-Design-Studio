import ExcelJS from 'exceljs';
import { AIR_METHODS, lightningProtection, type LpsInputs } from '../calc/lightningProtection';
import { revisionStamp } from '../model/revisions';
import type { Project } from '../types';
import { LPS_NOTES } from './lightningReport';

// Kept apart from lightningReport.ts so ExcelJS loads only when the workbook is exported.
/** The lightning protection calculation as an Excel workbook with live formulas: change a value on the Inputs
 * sheet and the Calculation sheet follows. A blank input shows DATA REQUIRED, as in the app. */

/** Rows of the Inputs sheet (column B holds the value). */
const IN = { length: 5, width: 6, height: 7, cls: 8, risk: 9, method: 10, mesh: 11, sphere: 12, spacing: 13, rod: 14, angle: 15, eseH: 16, eseDt: 17, eseDown: 18, pit: 19 } as const;
const b = (k: keyof typeof IN) => `Inputs!$B$${IN[k]}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const guard = (f: string) => `IFERROR(${f},"DATA REQUIRED")`;
/** A blank input counts as missing (Excel would read it as 0). */
const need = (keys: (keyof typeof IN)[], f: string) => `IF(OR(${keys.map((k) => `${b(k)}=""`).join(',')}),"DATA REQUIRED",${guard(f)})`;

export function buildLightningWorkbook(project: Project): ExcelJS.Workbook {
  const i: LpsInputs = project.lightning ?? { lengthM: 0, widthM: 0, heightM: 0, method: 'mesh' };
  const r = lightningProtection(i);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'LV Design Studio';

  const inp = wb.addWorksheet('Inputs');
  inp.columns = [{ width: 44 }, { width: 28 }, { width: 10 }];
  inp.addRow(['Lightning protection — concept calculation']).font = { bold: true, size: 14 };
  inp.addRow([project.name, revisionStamp(project)]);
  inp.addRow([]);
  inp.addRow(['Input (entered by the engineer)', 'Value', 'Unit']).font = { bold: true };
  const num = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : null);
  const rows: [string, string | number | null, string][] = [
    ['Building length', num(i.lengthM), 'm'], ['Building width', num(i.widthM), 'm'], ['Building height', num(i.heightM), 'm'],
    ['Protection class', i.lpsClass ?? null, ''], ['Risk assessment reference', i.riskRef?.trim() || null, ''],
    ['Air termination method', AIR_METHODS.find((m) => m.id === i.method)!.label, ''],
    ['Mesh size', num(i.meshM), 'm'], ['Rolling sphere radius', num(i.sphereRadiusM), 'm'], ['Down conductor spacing', num(i.downSpacingM), 'm'],
    ['Rod height above the roof', num(i.rodHeightM), 'm'], ['Protection angle', num(i.angleDeg), '°'],
    ['ESE terminal height above the roof', num(i.eseMastM), 'm'], ['ESE advance time ΔT', num(i.eseDeltaTUs), 'µs'],
    ['Down conductors for each ESE terminal', num(i.eseDownPerTerminal), ''], ['Earth pit at each down conductor', i.earthPitPerDown ? 'Yes' : 'No', '']
  ];
  for (const row of rows) inp.addRow(row);
  inp.addRow([]);
  for (const t of LPS_NOTES) inp.addRow([t]).getCell(1).alignment = { wrapText: true, vertical: 'top' };

  const calc = wb.addWorksheet('Calculation');
  calc.columns = [{ width: 44 }, { width: 18 }, { width: 8 }, { width: 70 }];
  calc.addRow(['Lightning protection — calculation']).font = { bold: true, size: 14 };
  calc.addRow([]);
  calc.addRow(['Result', 'Value', 'Unit', 'Formula']).font = { bold: true };
  const m = (id: LpsInputs['method']) => r.methods.find((x) => x.method === id);
  const ok = (id: LpsInputs['method']) => !r.invalid && m(id)?.status !== 'data';
  const dr = 'DATA REQUIRED';
  let at = 3;
  /** Adds a formula row and returns its cell reference, for later formulas. */
  const line = (label: string, formula: string, result: number | string, unit: string, basis: string) => {
    calc.addRow([label, { formula, result }, unit, basis]);
    return `$B$${++at}`;
  };
  const head = (t: string) => { calc.addRow([]); calc.addRow([t]).font = { bold: true }; at += 2; };

  head('Building');
  const per = line('Perimeter', need(['length', 'width'], `2*(${b('length')}+${b('width')})`), r.invalid ? dr : r.perimeterM, 'm', '2 × (length + width)');
  line('Roof area', need(['length', 'width'], `${b('length')}*${b('width')}`), r.invalid ? dr : r.roofAreaM2, 'm²', 'length × width');
  const half = line('Roof centre to far corner', need(['length', 'width'], `SQRT(${b('length')}^2+${b('width')}^2)/2`), r.invalid ? dr : r.halfDiagonalM, 'm', '√(length² + width²) ÷ 2');

  head('Mesh on flat roof');
  const mesh = m('mesh');
  const runsL = line('Runs across the length', need(['length', 'mesh'], `ROUNDUP(${b('length')}/${b('mesh')},0)-1`), ok('mesh') ? mesh!.bays![0] - 1 : dr, 'no.', 'length ÷ mesh size, rounded up, less one');
  const runsW = line('Runs across the width', need(['width', 'mesh'], `ROUNDUP(${b('width')}/${b('mesh')},0)-1`), ok('mesh') ? mesh!.bays![1] - 1 : dr, 'no.', 'width ÷ mesh size, rounded up, less one');
  line('Roof conductor', guard(`${per}+${runsL}*${b('width')}+${runsW}*${b('length')}`), ok('mesh') ? mesh!.roofConductorM : dr, 'm', 'roof edge + runs');

  head('Vertical rods — protection angle');
  const ang = m('angle');
  const ra = line('Radius protected at roof level', need(['rod', 'angle'], `${b('rod')}*TAN(RADIANS(${b('angle')}))`), ok('angle') ? ang!.radiusM! : dr, 'm', 'rod height × tan(protection angle)');
  line('Rods', need(['length', 'width'], `ROUNDUP(${b('length')}/(${ra}*SQRT(2)),0)*ROUNDUP(${b('width')}/(${ra}*SQRT(2)),0)`), ok('angle') ? ang!.terminals : dr, 'no.', 'one rod per bay no larger than radius × √2');

  head('Vertical rods — rolling sphere');
  const sph = m('sphere');
  const dia = line('Largest bay diagonal', need(['sphere', 'rod'], `2*SQRT(2*${b('sphere')}*${b('rod')}-${b('rod')}^2)`), ok('sphere') ? r2(2 * Math.sqrt(2 * i.sphereRadiusM! * i.rodHeightM! - i.rodHeightM! ** 2)) : dr, 'm', '2 × √(2 × sphere radius × rod height − rod height²)');
  line('Rods', need(['length', 'width'], `(ROUNDUP(${b('length')}/(${dia}/SQRT(2)),0)+1)*(ROUNDUP(${b('width')}/(${dia}/SQRT(2)),0)+1)`), ok('sphere') ? sph!.terminals : dr, 'no.', 'a rod at every node of a grid no larger than diagonal ÷ √2');

  head('ESE air terminal (NFC 17-102 method)');
  const es = m('ese');
  const at5 = `SQRT(2*${b('sphere')}*5-25+${b('eseDt')}*(2*${b('sphere')}+${b('eseDt')}))`;
  const rp = line('Protection radius Rp', need(['sphere', 'eseH', 'eseDt'], `IF(${b('eseH')}<2,NA(),IF(${b('eseH')}>=5,SQRT(2*${b('sphere')}*${b('eseH')}-${b('eseH')}^2+${b('eseDt')}*(2*${b('sphere')}+${b('eseDt')})),${b('eseH')}*${at5}/5))`),
    ok('ese') ? es!.radiusM! : dr, 'm', '√(2rh − h² + ΔL(2r + ΔL)), ΔL = ΔT × 1 m/µs; in proportion to h below 5 m; not below 2 m');
  const eseN = line('Terminals', guard(`IF(${rp}>=${half},1,ROUNDUP(${b('length')}/(${rp}*SQRT(2)),0)*ROUNDUP(${b('width')}/(${rp}*SQRT(2)),0))`), ok('ese') ? es!.terminals : dr, 'no.', 'one if Rp reaches the far corner, else one per bay no larger than Rp × √2');

  head('Down conductors and earth pits (selected method)');
  const isEse = `${b('method')}="${AIR_METHODS.find((x) => x.id === 'ese')!.label}"`;
  const downs = line('Down conductors', `IF(${isEse},${need(['eseDown'], `${eseN}*ROUNDUP(${b('eseDown')},0)`)},${need(['spacing'], `MAX(2,ROUNDUP(${per}/${b('spacing')},0))`)})`, r.downConductors || dr, 'no.',
    'perimeter ÷ spacing, rounded up, at least 2; ESE: terminals × down conductors for each');
  line('Down conductor length', need(['height'], `${downs}*${b('height')}`), r.downConductors ? r.downConductorM : dr, 'm', 'down conductors × building height');
  line('Test joints', guard(`${downs}+0`), r.downConductors || dr, 'no.', 'one in each down conductor');
  line('Earth pits', guard(`IF(${b('pit')}="Yes",${downs}+0,0)`), r.downConductors ? r.earthPits : dr, 'no.', 'one at each down conductor when chosen');
  line('Ring earth conductor', guard(`IF(ISNUMBER(${downs}),${per}+0,NA())`), r.downConductors ? r.ringConductorM : dr, 'm', 'building perimeter');
  return wb;
}
