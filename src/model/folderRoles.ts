/** What each project folder is for. The app saves an output by its role (calcVd, drawingsIssued, boq…),
 * never by a folder name, so users can rename, move, add or delete folders in a template freely. A role
 * with no folder falls back to asking where to save.
 *
 * Proposal: docs/notes/Future development/UI UX proposals - 2026-11-09 - Project folders customisation.md */

/** Document types with their own file-naming pattern (template → File naming). */
export type DocType = 'DWG' | 'CAL' | 'SCH' | 'BOQ' | 'SPC' | 'TR' | 'CRS' | 'RFI' | 'MOM';
export const DOC_TYPES: readonly DocType[] = ['DWG', 'CAL', 'SCH', 'BOQ', 'SPC', 'TR', 'CRS', 'RFI', 'MOM'];

export interface FolderRole {
  id: string;
  label: string;
  group: string;
  docType?: DocType;
}

const r = (group: string, list: [string, string, DocType?][]): FolderRole[] =>
  list.map(([id, label, docType]) => (docType ? { id, label, group, docType } : { id, label, group }));

export const ROLE_CATALOGUE: readonly FolderRole[] = Object.freeze([
  ...r('Admin', [['programme', 'Programme'], ['minutes', 'Minutes of meetings', 'MOM'], ['timesheets', 'Timesheets']]),
  ...r('Inputs', [['receivedArch', 'Received architectural drawings'], ['datasheets', 'Manufacturer datasheets']]),
  ...r('Project', [['projectFile', 'Project file'], ['backups', 'Project backups'], ['cadWorking', 'CAD working files'], ['xrefs', 'External references'], ['titleBlocks', 'Title blocks']]),
  ...r('Calculations', [
    ['calcLoad', 'Load calculation', 'CAL'], ['calcVd', 'Voltage drop report', 'CAL'], ['calcFault', 'Fault level report', 'CAL'],
    ['calcCable', 'Cable sizing report', 'CAL'], ['calcEarthing', 'Earthing calculation', 'CAL'], ['calcLighting', 'Lighting calculation', 'CAL'],
    ['calcPv', 'PV calculation', 'CAL'], ['calcStandby', 'Standby generator sizing', 'CAL'], ['studyReports', 'Study reports', 'CAL']
  ]),
  ...r('Drawings', [['drawingsWip', 'Drawings: work in progress', 'DWG'], ['drawingsIssued', 'Drawings: issued', 'DWG'], ['drawingsSuperseded', 'Drawings: superseded', 'DWG']]),
  ...r('Schedules', [['loadSchedules', 'DB load schedules', 'SCH'], ['cableSchedule', 'Cable schedule', 'SCH'], ['equipmentSchedule', 'Equipment schedule', 'SCH'], ['luminaireSchedule', 'Luminaire schedule', 'SCH']]),
  ...r('Cost', [['specs', 'Specifications', 'SPC'], ['boq', 'Bill of quantities', 'BOQ'], ['costEstimates', 'Cost estimates'], ['quotes', 'Supplier quotes']]),
  ...r('Authority', [['authDewa', 'DEWA submissions'], ['authDm', 'DM submissions'], ['authCd', 'Civil Defence submissions'], ['transmittals', 'Transmittals', 'TR'], ['submissionResponses', 'Authority responses']]),
  ...r('Review', [['internalReview', 'Internal review'], ['crs', 'Comment response sheets', 'CRS']]),
  ...r('Construction', [
    ['shopDrawings', 'Shop drawings'], ['materialSubmittals', 'Material submittals'], ['rfis', 'RFIs', 'RFI'], ['siteInspections', 'Site inspections'],
    ['snags', 'Snag lists'], ['variations', 'Variations'], ['valuations', 'Valuations'], ['testRecords', 'Test records'], ['asBuilt', 'As-built drawings']
  ]),
  ...r('Tender', [['tenderIssued', 'Tender issue'], ['bids', 'Bids received'], ['tenderEvaluation', 'Tender evaluation']]),
  ...r('Archive', [['archive', 'Archive']])
]);

const IDS = new Set(ROLE_CATALOGUE.map((x) => x.id));
export const isRole = (id: unknown): id is string => typeof id === 'string' && IDS.has(id);
export const roleById = (id: string): FolderRole | undefined => ROLE_CATALOGUE.find((x) => x.id === id);
