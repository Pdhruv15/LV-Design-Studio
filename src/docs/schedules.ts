import { cableTypeOf } from '../model/cableTypes';
import { STATUS_TEXT } from '../calc/statusText';
import { boardLocation } from '../model/levels';
import { cableRefOf } from '../model/cableRefs';
import { evaluateFeeder, faultCurrentKA, impedanceToBoard, cableSizeText } from '../calc/electrical';
import { cpcOf } from '../calc/earthing';
import { boardSummary, boardsInSupplyOrder } from '../calc/summary';
import { BOARD_KINDS, type Project } from '../types';
import { feedersOn } from '../calc/network';
import { fig, Figure } from '../util/format';

export interface Schedule {
  headers: string[];
  rows: (string | number | Figure)[][];
  /** Rows that are sub-totals / section headers, for styling. */
  totalRows?: number[];
}

/** The rows for a CSV: plain numbers, so a spreadsheet reads them as numbers. */
export const csvRows = (s: Schedule) => s.rows.map((r) => r.map((c) => (c instanceof Figure ? c.value : c)));

/** Cable schedule: every cable in the installation. */
export function cableSchedule(project: Project): Schedule {
  const headers = [
    'Cable tag', 'From', 'To', 'Ref', 'Type', 'Cores × size', 'CPC (mm²)', 'Length (m)', 'Tray route', 'Ib (A)', 'Breaker In (A)',
    'Iz (A)', 'Vd cable (%)', 'Vd total (%)', 'Status'
  ];
  const rows = boardsInSupplyOrder(project).flatMap((b) =>
    feedersOn(project, b.id)
      .map((f) => {
        const r = evaluateFeeder(project, f);
        return [
          `C-${f.id}`, f.boardId, f.feedsBoardId ?? f.name, (() => { const c = cableRefOf(project, f); return `${c.ref}${c.fireRated ? ' *' : ''}`; })(), cableTypeOf(project, f).label, cableSizeText(f),
          cpcOf(f), f.lengthM, f.trayRoute ?? '', fig.current(r.ib), f.breakerRatingA, fig.current(r.ampacity), fig.pct(r.vdPct), fig.pct(r.vdTotalPct),
          STATUS_TEXT[r.status]
        ];
      })
  );
  return { headers, rows };
}

/** Equipment schedule: transformers and boards. */
export function equipmentSchedule(project: Project): Schedule {
  const headers = ['Tag', 'Description', 'Type', 'Rating', 'Fault level (kA)', 'Busbar', 'IP', 'Location', 'Manufacturer', 'Model', 'Fed from', 'Surge protection'];
  const rows: Schedule['rows'] = [];
  for (const b of boardsInSupplyOrder(project)) {
    if (!b.upstreamId && b.sourceKva) {
      rows.push([
        `TX-${b.id}`, `Transformer for ${b.id}`, 'Distribution transformer', `${b.sourceKva} kVA, ${b.sourceImpedancePct ?? '—'}% Z`,
        fig.fault(faultCurrentKA(impedanceToBoard(project, b.id), project.voltageV)), '', '', boardLocation(project, b), '', '', 'Utility 11 kV', ''
      ]);
    }
    const s = boardSummary(project, b);
    rows.push([
      b.id, b.name, BOARD_KINDS.find((k) => k.value === (b.kind ?? (b.upstreamId ? 'DB' : 'MDB')))?.label ?? '',
      b.ratedCurrentA ? `${b.ratedCurrentA} A` : '', fig.fault(s.faultKA), b.busbarMaterial ?? '', b.ipRating ?? '',
      boardLocation(project, b), b.manufacturer ?? '', b.model ?? '', b.upstreamId ?? (b.sourceKva ? `TX-${b.id}` : ''), b.spd ? `SPD ${b.spd}` : ''
    ]);
  }
  return { headers, rows };
}
