import { breakerTypeOf, cpcOf, rcdOf } from '../calc/earthing';
import { designCurrentA, runsOf, voltageDropPct } from '../calc/electrical';
import { pointColumns, wattUnitText } from '../calc/loadSchedule';
import { cableTypeOf } from '../model/cableTypes';
import { boardLocation } from '../model/levels';
import { revisionStamp } from '../model/revisions';
import { spareLabel, spareRef } from '../model/spareWays';
import { POINT_TYPES, type Project } from '../types';
import { fmtDate } from '../util/format';
import { elcbColumn, elcbText, incomerCableText, incomerLabel, loadScheduleRows, remarksText } from './loadScheduleDoc';

/** The values of a DB's load schedule, by placeholder key: the fields of the Excel template (xlsxTemplate.ts) and of a
 * linked sheet (sheetLink.ts). No ExcelJS here, so the Sheets page can use it without loading the Excel library. */

export type Value = string | number;
export type Fields = Record<string, Value>;

/** The placeholders, for the template guide and the checks. */
export const TEMPLATE_FIELDS: { key: string; about: string }[] = [
  { key: 'project.name', about: 'Project name' },
  { key: 'project.voltage', about: 'System voltage, V' },
  { key: 'project.frequency', about: 'Frequency, Hz' },
  { key: 'project.revision', about: 'Revision stamp' },
  { key: 'project.reference', about: 'Design reference applied (name and version)' },
  { key: 'project.number', about: 'Project number' },
  { key: 'project.owner', about: 'Owner / client' },
  { key: 'project.consultant', about: 'Consultant' },
  { key: 'project.contractor', about: 'Contractor' },
  { key: 'project.plotNo', about: 'Plot number' },
  { key: 'project.area', about: 'Project area / location' },
  { key: 'project.tel', about: 'Telephone' },
  { key: 'project.fax', about: 'Fax' },
  { key: 'project.completion', about: 'Planned completion date' },
  { key: 'date', about: 'Export date (dd/mm/yyyy)' },
  { key: 'board.id', about: 'DB number' },
  { key: 'board.name', about: 'DB name' },
  { key: 'board.location', about: 'Location of the DB' },
  { key: 'board.fedFrom', about: 'Board it is fed from' },
  { key: 'board.incomer', about: 'Incomer, e.g. 63 A ISOLATOR TP+N' },
  { key: 'board.incomerCable', about: 'Incoming cable line' },
  { key: 'total.R / total.Y / total.B / total.all', about: 'Connected load, W' },
  { key: 'md.R / md.Y / md.B / md.all', about: 'Maximum demand after demand factors, W' },
  { key: 'panel.connectedLoadW', about: 'Total connected load, W' },
  { key: 'panel.maximumDemandW', about: 'Total maximum demand, W' },
  { key: 'imbalance', about: 'Phase imbalance, %' },
  { key: 'wattUnit.<point>', about: 'WATT / UNIT of a point column, e.g. wattUnit.ltg' },
  { key: 'label.<point>', about: 'Heading of a point column, e.g. label.ltg → LTG' },
  { key: 'row.sl', about: 'Serial number' },
  { key: 'row.ref', about: 'Circuit reference, e.g. R1' },
  { key: 'row.phase', about: 'Phase: R, Y or B, RYB for a three-phase circuit' },
  { key: 'row.mcb', about: 'MCB rating, A' },
  { key: 'row.wire', about: 'Circuit wire, mm²' },
  { key: 'row.ecc', about: 'Earth wire, mm²' },
  { key: 'row.length', about: 'Circuit length, m (used for the voltage drop check)' },
  { key: 'row.room', about: 'Room / area (SPARE / SPACE for spares)' },
  { key: 'row.description', about: 'Circuit description / room / area' },
  { key: 'row.points.<point>', about: 'Number of points, e.g. row.points.ltg' },
  { key: 'row.R / row.Y / row.B', about: 'Load per phase, W' },
  { key: 'row.watts', about: 'Circuit load, W' },
  { key: 'row.demandFactor', about: 'Circuit demand factor' },
  { key: 'row.demandWatts', about: 'Circuit maximum-demand load, W' },
  { key: 'row.powerFactor', about: 'Circuit power factor' },
  { key: 'row.designCurrent', about: 'Circuit design current, A' },
  { key: 'row.breakerType', about: 'Breaker device / curve' },
  { key: 'row.breakerIcu', about: 'Breaker breaking capacity, kA' },
  { key: 'row.cableType', about: 'Cable construction' },
  { key: 'row.cores', about: 'Cable cores' },
  { key: 'row.runs', about: 'Parallel cable runs' },
  { key: 'row.installMethod', about: 'Cable installation method' },
  { key: 'row.rcdMa', about: 'RCD / ELCB sensitivity, mA' },
  { key: 'row.rcbo', about: 'Own earth leakage device: Yes (RCBO), AFDD + RCBO, MCB + RCD add-on, or blank' },
  { key: 'row.voltageDrop', about: 'Circuit cable voltage drop, %' },
  { key: 'row.elcb', about: 'ELCB label, on the first row of its group only' },
  { key: 'row.elcbGroup', about: 'ELCB label, on every row of the group' },
  { key: 'row.remarks', about: 'Remarks and mixed load items' },
  { key: 'row.status', about: '"check" or "fails check" where the circuit needs attention' }
];

const num = (v: number) => Math.round(v);

/** The project-wide fields every sheet kind has (DB and panel schedules). */
export const projectFields = (project: Project, at = new Date()): Fields => ({
  'project.name': project.name, 'project.voltage': project.voltageV, 'project.frequency': project.frequencyHz,
  'project.revision': revisionStamp(project),
  'project.reference': project.designReference ? `${project.designReference.name} v${project.designReference.version}` : '',
  'project.number': project.info?.projectNo ?? '', 'project.owner': project.info?.owner ?? '', 'project.consultant': project.info?.consultant ?? '',
  'project.contractor': project.info?.contractor ?? '', 'project.plotNo': project.info?.plotNo ?? '', 'project.area': project.info?.area ?? '',
  'project.tel': project.info?.tel ?? '', 'project.fax': project.info?.fax ?? '', 'project.completion': project.info?.plannedCompletion ?? '',
  date: fmtDate(at)
});

/** Values of one DB: the sheet's fields and one set per schedule row. */
export function templateData(project: Project, boardId: string, at = new Date()): { fields: Fields; rows: Fields[] } {
  const { board, incomer, entries, phaseW, connectedW, imbalance } = loadScheduleRows(project, boardId);
  const columns = pointColumns(project, board);
  const kw = (v: number) => num(v * 1000);
  const fields: Fields = {
    ...projectFields(project, at),
    'board.id': board.id, 'board.name': board.name, 'board.location': boardLocation(project, board), 'board.fedFrom': board.upstreamId ?? '',
    'board.incomer': incomerLabel(board, incomer), 'board.incomerCable': incomerCableText(project, incomer),
    'total.R': num(connectedW.R), 'total.Y': num(connectedW.Y), 'total.B': num(connectedW.B), 'total.all': num(connectedW.R + connectedW.Y + connectedW.B),
    'md.R': kw(phaseW.R), 'md.Y': kw(phaseW.Y), 'md.B': kw(phaseW.B), 'md.all': kw(phaseW.R + phaseW.Y + phaseW.B),
    'panel.connectedLoadW': num(connectedW.R + connectedW.Y + connectedW.B), 'panel.maximumDemandW': kw(phaseW.R + phaseW.Y + phaseW.B),
    imbalance: Math.round(imbalance * 10) / 10
  };
  for (const t of POINT_TYPES) {
    fields[`wattUnit.${t.value}`] = columns.some((c) => c.value === t.value) ? wattUnitText(project, board, t.value) : '';
    fields[`label.${t.value}`] = columns.find((c) => c.value === t.value)?.label ?? t.label;
  }
  const cells = elcbColumn(entries);
  const rows = entries.map((e, i): Fields => {
    const elcb = elcbText(e);
    const common = { 'row.sl': e.sl, 'row.elcb': cells[i] ? elcb : '', 'row.elcbGroup': elcb };
    const points = Object.fromEntries(POINT_TYPES.map((t) => [`row.points.${t.value}`, e.type === 'circuit' ? e.row.f.points?.[t.value] || '' : '']));
    if (e.type === 'spare') {
      const sp = e.spare;
      return {
        ...common, ...points, 'row.ref': spareRef(sp), 'row.phase': sp.phase, 'row.mcb': sp.kind === 'spare' ? sp.ratingA ?? '' : '', 'row.wire': '', 'row.ecc': '', 'row.length': '',
        'row.room': spareLabel(sp), 'row.description': spareLabel(sp), 'row.R': '', 'row.Y': '', 'row.B': '', 'row.watts': '', 'row.demandFactor': '', 'row.demandWatts': '',
        'row.powerFactor': '', 'row.designCurrent': '', 'row.breakerType': '', 'row.breakerIcu': sp.icuKa ?? '', 'row.cableType': '', 'row.cores': '', 'row.runs': '',
        'row.installMethod': '', 'row.rcdMa': '', 'row.rcbo': '', 'row.voltageDrop': '', 'row.remarks': sp.remarks ?? '', 'row.status': ''
      };
    }
    const r = e.row;
    return {
      ...common, ...points, 'row.ref': r.ref, 'row.phase': r.f.phase ?? '', 'row.mcb': r.f.breakerRatingA, 'row.wire': r.f.cableCsaMm2, 'row.ecc': cpcOf(r.f), 'row.length': r.f.lengthM,
      'row.room': r.f.room || r.f.name, 'row.description': r.f.room || r.f.name, 'row.R': r.ph.R, 'row.Y': r.ph.Y, 'row.B': r.ph.B, 'row.watts': num(r.watts),
      'row.demandFactor': r.f.demandFactor, 'row.demandWatts': num(r.watts * r.f.demandFactor), 'row.powerFactor': r.f.powerFactor,
      'row.designCurrent': Math.round(designCurrentA(r.f, project) * 100) / 100, 'row.breakerType': breakerTypeOf(r.f), 'row.breakerIcu': r.f.breakerIcuKa,
      'row.cableType': cableTypeOf(project, r.f).value, 'row.cores': r.f.cores, 'row.runs': runsOf(r.f), 'row.installMethod': r.f.installMethod ?? 'E',
      'row.rcdMa': rcdOf(project, r.f) ?? '', 'row.rcbo': !r.f.rcbo ? '' : r.f.rcboKind === 'afdd' ? 'AFDD + RCBO' : r.f.rcboKind === 'addon' ? 'MCB + RCD add-on' : 'Yes', 'row.voltageDrop': Math.round(voltageDropPct(r.f, project) * 100) / 100,
      'row.remarks': remarksText(r.f),
      'row.status': r.status === 'bad' ? 'fails check' : r.status === 'warn' ? 'check' : ''
    };
  });
  return { fields, rows };
}


/** One stable key per row of templateData(...).rows, same order: a circuit's uid (else its id), a spare's id with "spare:" before it. */
export function scheduleRowKeys(project: Project, boardId: string): string[] {
  return loadScheduleRows(project, boardId).entries.map((e) => (e.type === 'circuit' ? e.row.f.uid ?? e.row.f.id : `spare:${e.spare.id}`));
}
