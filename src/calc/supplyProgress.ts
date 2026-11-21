import type { Project } from '../types';
import { assess } from './loadAssessment';
import { summarize } from './spacePlan';
import { buildDashboard } from './dashboard';

export interface SupplyRow {
  key: 'assessment' | 'plan' | 'network';
  /** e.g. "2 × 1,250 kVA", or "1,000 + 1,500 kVA" when the sizes differ. */
  transformers: string;
  count: number;
  totalKva: number; // installed kVA carrying the demand (duty units for the assessment)
  demandKva: number;
  loadingPct: number; // demandKva ÷ totalKva × 100 (0 when there is no kVA)
  rmus?: number; // plan only
  differs: boolean; // its transformers text is not the assessment's (false for the assessment row and when there is no assessment)
}

const f0 = (n: number) => n.toLocaleString('en-US');
const sizesText = (kvas: number[]) => kvas.every((k) => k === kvas[0]) ? `${kvas.length} × ${f0(kvas[0])} kVA` : `${kvas.map(f0).join(' + ')} kVA`;
const pct = (demand: number, kva: number) => kva > 0 ? (demand / kva) * 100 : 0;

/** The transformers as the load assessment gives them, as the space plan arranges them and as the network has them. Rows that have nothing are left out. */
export function supplyProgress(project: Project): SupplyRow[] {
  const rows: SupplyRow[] = [];
  const a = project.loadAssessment;
  const r = a ? assess(a) : undefined;
  if (r?.tx) {
    const totalKva = r.tx.duty * r.tx.kva;
    rows.push({ key: 'assessment', transformers: `${r.tx.count} × ${f0(r.tx.kva)} kVA`, count: r.tx.count, totalKva, demandKva: r.mdKva, loadingPct: pct(r.mdKva, totalKva), differs: false });
  }
  const text0 = rows[0]?.transformers;
  const plan = project.spacePlan;
  if (plan?.areas.length) {
    const s = summarize(plan);
    const kvas = plan.transformers.length ? plan.transformers.map((t) => t.kva) : Array.from({ length: s.requiredTransformers }, () => s.transformerKva);
    if (kvas.length) {
      const totalKva = kvas.reduce((x, y) => x + y, 0);
      const transformers = sizesText(kvas);
      rows.push({ key: 'plan', transformers, count: kvas.length, totalKva, demandKva: s.demandKva, loadingPct: pct(s.demandKva, totalKva), rmus: plan.transformers.length ? s.rmus.length : s.requiredRmus, differs: text0 !== undefined && transformers !== text0 });
    }
  }
  try {
    const d = buildDashboard(project);
    if (d.transformers.length) {
      const transformers = sizesText(d.transformers.map((t) => t.kva));
      rows.push({ key: 'network', transformers, count: d.transformers.length, totalKva: d.transformerKva, demandKva: d.demandKva, loadingPct: pct(d.demandKva, d.transformerKva), differs: text0 !== undefined && transformers !== text0 });
    }
  } catch { /* an incomplete project has no network figures yet */ }
  return rows;
}
