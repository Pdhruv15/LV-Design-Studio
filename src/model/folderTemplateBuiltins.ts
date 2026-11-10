/** The built-in folder templates (locked; users duplicate them to change them). The same five as in
 * docs/notes/Future development/folder-templates.json, with the same node ids.
 *
 * Written as outlines, one folder a line, two spaces of indent per level:
 *   Name  [role,role]  @when  >onUse
 * A node's id is its parent's id plus its name without the number, so ids stay the same when a folder is
 * renumbered. Do not rename a built-in folder's words: projects' overrides refer to its id. */

import type { FolderNode, FolderTemplate, FolderWhen, NamingRule } from './folderTemplates';

export function fromOutline(prefix: string, text: string): FolderNode[] {
  const root: FolderNode[] = [];
  const stack: { depth: number; id: string; children: FolderNode[] }[] = [{ depth: -1, id: prefix, children: root }];
  const used = new Set<string>();
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    const depth = (raw.length - raw.trimStart().length) / 2;
    let s = raw.trim();
    const node: Partial<FolderNode> = {};
    const on = s.match(/\s>(\S+)$/);
    if (on) { node.onUse = on[1]; s = s.slice(0, on.index); }
    const w = s.match(/\s@(\S+)$/);
    if (w) { node.when = w[1] as FolderWhen; s = s.slice(0, w.index); }
    const r = s.match(/\s\[([^\]]*)\]$/);
    if (r) {
      const roles = r[1].split(',').map((x) => x.trim()).filter(Boolean);
      if (roles.length === 1) node.role = roles[0]; else node.roles = roles;
      s = s.slice(0, r.index);
    }
    const name = s.trim();
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1];
    const slug = name.replace(/^[0-9A-Z]{1,2}[_.-]/, '').replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'f';
    let id = `${parent.id}.${slug}`;
    while (used.has(id)) id += 'x';
    used.add(id);
    const children: FolderNode[] = [];
    parent.children.push({ id, name, ...node, children });
    stack.push({ depth, id, children });
  }
  const strip = (ns: FolderNode[]) => ns.forEach((n) => { if (!n.children?.length) delete n.children; else strip(n.children); });
  strip(root);
  return root;
}

const OFFICE: NamingRule = { preset: 'office', pattern: '{ProjectNo}-{Discipline}-{Type}-{Seq:3}-{Rev}', separator: '-', discipline: 'E' };
const ROOT = '{ProjectNo}_{ProjectShort}';

const consultant: FolderTemplate = {
  id: 'consultant-full', name: 'Electrical consultant full', version: 1, builtIn: true, layout: 'discipline', root: ROOT, numbering: '01_', naming: OFFICE,
  folders: fromOutline('cf', `
01_Admin
  01_Programme [programme]
  02_Minutes [minutes]
  03_Timesheets [timesheets]
02_Received
  01_Architect [receivedArch]
  02_Datasheets [datasheets]
03_Project_File [projectFile]
  Backups [backups]
04_CAD
  01_Working [cadWorking]
  02_Xrefs [xrefs]
  03_Title_Blocks [titleBlocks]
05_Calcs
  01_Load [calcLoad]
  02_Volt_Drop [calcVd]
  03_Fault [calcFault]
  04_Cable_Sizing [calcCable]
  05_Earthing [calcEarthing]
  06_Lighting [calcLighting]
  07_PV [calcPv] @scope:pv
  08_Standby [calcStandby] @scope:standby
  09_Study_Reports [studyReports]
06_Drawings
  01_WIP [drawingsWip]
  02_Issued [drawingsIssued] >{Stage}/Rev-{Rev}
  03_Superseded [drawingsSuperseded]
  04_ELV @scope:elv
07_Schedules
  01_Load_Schedules [loadSchedules]
  02_Cable_Schedule [cableSchedule]
  03_Equipment [equipmentSchedule]
  04_Luminaires [luminaireSchedule]
08_Specs [specs]
09_BOQ_Cost
  01_BOQ [boq] >Rev-{BoqRev}
  02_Estimates [costEstimates]
  03_Quotes [quotes]
10_Authority
  01_DEWA [authDewa]
  02_DM [authDm]
  03_Civil_Defence [authCd] @scope:fire
  04_Responses [submissionResponses]
11_Transmittals [transmittals] >TR-{TrNo}
12_Review
  01_Internal [internalReview]
  02_CRS [crs]
13_Tender @stage:tender
  01_Issued [tenderIssued]
  02_Bids [bids]
  03_Evaluation [tenderEvaluation]
14_Construction @service:supervision
  01_Shop_Drawings [shopDrawings]
  02_Material_Submittals [materialSubmittals]
  03_RFIs [rfis]
  04_Site_Inspections [siteInspections]
  05_Snags [snags]
  06_Variations [variations]
  07_Valuations [valuations]
  08_Test_Records [testRecords]
  09_As_Built [asBuilt]
15_Archive [archive]`)
};

const villa: FolderTemplate = {
  id: 'villa-small', name: 'Villa / small building', version: 1, builtIn: true, layout: 'flat', root: ROOT, numbering: '01_',
  naming: { preset: 'simple', pattern: '{ProjectShort}_{Type}_{Rev}', separator: '_' },
  folders: fromOutline('vs', `
01_Admin [programme,minutes,timesheets]
02_Received [receivedArch,datasheets]
03_Calcs [calcLoad,calcVd,calcFault,calcCable,calcEarthing,calcLighting,calcPv,calcStandby,studyReports]
04_Drawings [drawingsWip,cadWorking,xrefs,titleBlocks]
  Issued [drawingsIssued] >Rev-{Rev}
  Superseded [drawingsSuperseded]
05_Schedules [loadSchedules,cableSchedule,equipmentSchedule,luminaireSchedule]
06_BOQ [boq,costEstimates,quotes,specs]
07_DEWA [authDewa,authDm,authCd,submissionResponses]
08_Transmittals [transmittals] >TR-{TrNo}
09_Project_File [projectFile,backups]`)
};

const contractor: FolderTemplate = {
  id: 'contractor-shop', name: 'Contractor shop drawings', version: 1, builtIn: true, layout: 'discipline', root: ROOT, numbering: '01_', naming: OFFICE,
  folders: fromOutline('cs', `
01_Contract_Docs [receivedArch,specs,boq]
02_Shop_Drawings [shopDrawings,drawingsWip,cadWorking]
  Issued [drawingsIssued] >{YYYYMMDD}_Rev{Rev}
  Superseded [drawingsSuperseded]
03_Calcs [calcLoad,calcVd,calcFault,calcCable,calcEarthing,calcLighting,studyReports]
04_Material_Submittals [materialSubmittals,datasheets]
05_RFIs [rfis]
06_Transmittals [transmittals] >TR-{TrNo}
07_Inspections [siteInspections,snags,testRecords]
08_As_Built [asBuilt]
09_Variations [variations,valuations]
10_Admin [programme,minutes,timesheets,projectFile,backups]`)
};

const iso: FolderTemplate = {
  id: 'iso19650', name: 'ISO 19650', version: 1, builtIn: true, layout: 'iso19650', root: ROOT, numbering: 'none',
  naming: { preset: 'iso19650', pattern: '{Project}-{Originator}-{Volume}-{Level}-{Type}-{Role}-{Number}', separator: '-', discipline: 'E' },
  folders: fromOutline('iso', `
00_WIP
  E-Electrical [cadWorking,drawingsWip,calcLoad,calcVd,calcFault,calcCable,calcEarthing,calcLighting,calcPv,calcStandby,loadSchedules,cableSchedule,projectFile]
  A-Architectural
  M-Mechanical
  S-Structural
01_SHARED
  E-Electrical [internalReview,crs]
  A-Architectural [receivedArch]
  M-Mechanical
  S-Structural
02_PUBLISHED
  E-Electrical [drawingsIssued,studyReports,transmittals] >{Stage}/Rev-{Rev}
  A-Architectural
  M-Mechanical
  S-Structural
03_ARCHIVE
  E-Electrical [drawingsSuperseded,archive]
  A-Architectural
  M-Mechanical
  S-Structural`)
};

const multi: FolderTemplate = {
  id: 'multi-building', name: 'Multi-building', version: 1, builtIn: true, layout: 'building', root: ROOT, numbering: 'none',
  repeat: { source: 'buildings', name: '{BuildingCode}_{BuildingName}', shared: ['mb.common'] }, naming: OFFICE,
  folders: fromOutline('mb', `
00_Common
  Admin [programme,minutes,timesheets,projectFile,backups]
  DEWA [authDewa,authDm,authCd,submissionResponses]
  Transmittals [transmittals] >TR-{TrNo}
{BuildingCode}_{BuildingName} @building:each
  Calcs [calcLoad,calcVd,calcFault,calcCable,calcEarthing,calcLighting]
  Drawings [cadWorking,drawingsWip,drawingsIssued]
  Schedules [loadSchedules,cableSchedule,equipmentSchedule,luminaireSchedule]
  BOQ [boq]`)
};

const deepFreeze = <T>(o: T): T => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

export const BUILT_IN_TEMPLATES: readonly FolderTemplate[] = deepFreeze([consultant, villa, contractor, iso, multi]);
export const DEFAULT_TEMPLATE_ID = 'consultant-full';
export const builtInTemplate = (id: string): FolderTemplate | undefined => BUILT_IN_TEMPLATES.find((t) => t.id === id);
