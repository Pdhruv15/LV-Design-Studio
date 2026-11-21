import { onRoute, pickTray, routeSettings, sizeRoute, trayPlanOf } from '../calc/cableTray';
import type { Project, SketchItem, TrayRoute } from '../types';

/** The inspector is deliberately bounded: it is an on-demand CAD check, not a persistent route model. */
export const CONTAINMENT_CHECK_LIMITS = {
  segments: 256,
  routes: 128,
  cableInstancesPerRoute: 2048
} as const;

export type ContainmentSegmentStatus = 'within-limit' | 'review' | 'overloaded' | 'unassigned' | 'limited';

export interface ContainmentSegmentCheck {
  id: string;
  name: string;
  routeName?: string;
  service?: string;
  installedWidthMm: number;
  depthMm?: number;
  cableCount?: number;
  fillPct?: number;
  fillLimitPct?: number;
  method?: 'spacing' | 'fill';
  sparePct?: number;
  recommendedWidthMm?: number;
  recommendedTiers?: number;
  status: ContainmentSegmentStatus;
  notes: string[];
}

export interface ContainmentCheckResult {
  segments: ContainmentSegmentCheck[];
  truncated: boolean;
  checkedRoutes: number;
  issues: number;
}

interface RouteCheck {
  depthMm: number;
  cableCount: number;
  fillPct: (widthMm: number) => number;
  fillLimitPct: number;
  method: 'spacing' | 'fill';
  sparePct: number;
  occupiedMm: number;
  requiredMm: number;
  recommendedWidthMm: number;
  recommendedTiers: number;
  complete: boolean;
  notes: string[];
}

const routeKey = (name: string | undefined) => name?.trim().toUpperCase() ?? '';

/** Counts the cable instances before `sizeRoute` expands them into its laying-order array. */
function cableInstances(project: Project, route: TrayRoute, includeEcc: boolean): number {
  if (route.cables.length > CONTAINMENT_CHECK_LIMITS.cableInstancesPerRoute) return CONTAINMENT_CHECK_LIMITS.cableInstancesPerRoute + 1;
  const overrides = new Map(route.cables.filter((c) => c.feederId).map((c) => [c.feederId!, c]));
  let count = 0;
  for (const feeder of project.feeders) {
    if (!onRoute(route, feeder)) continue;
    const qty = Math.max(1, overrides.get(feeder.id)?.qty ?? feeder.parallel ?? 1);
    count += qty * (includeEcc ? 2 : 1);
    if (count > CONTAINMENT_CHECK_LIMITS.cableInstancesPerRoute) return count;
  }
  for (const cable of route.cables) {
    if (!cable.feederId) count += Math.max(1, cable.qty ?? 1);
    if (count > CONTAINMENT_CHECK_LIMITS.cableInstancesPerRoute) return count;
  }
  return count;
}

function checkedRoute(project: Project, route: TrayRoute): RouteCheck | undefined {
  const plan = trayPlanOf(project);
  if (cableInstances(project, route, plan.settings.includeEcc) > CONTAINMENT_CHECK_LIMITS.cableInstancesPerRoute) return undefined;
  // Ignore a schedule width override here: every CAD segment is checked against its own installed width.
  const result = sizeRoute(project, plan, { ...route, widthMm: undefined, tiers: undefined });
  const settings = routeSettings(plan, route);
  const fillNeedMm = settings.depthMm > 0 && settings.fillPct > 0
    ? result.cableAreaMm2 / (settings.depthMm * settings.fillPct / 100)
    : 0;
  const recommended = pickTray(Math.max(result.requiredMm, fillNeedMm), plan.settings.widths, plan.settings.maxWidthMm);
  return {
    depthMm: settings.depthMm,
    cableCount: result.cableCount,
    fillPct: (widthMm) => widthMm > 0 && settings.depthMm > 0 ? (result.cableAreaMm2 / (widthMm * settings.depthMm)) * 100 : 0,
    fillLimitPct: settings.fillPct,
    method: settings.method,
    sparePct: settings.sparePct,
    occupiedMm: result.occupiedMm,
    requiredMm: result.requiredMm,
    recommendedWidthMm: recommended.widthMm,
    recommendedTiers: recommended.tiers,
    complete: result.lines.length > 0 && result.lines.every((line) => !line.missing),
    // Fill and tier notes describe the automatic schedule tray. This inspector recalculates both for each installed run.
    notes: result.notes.filter((note) => !/^Fill |^\d+ tiers? of /.test(note))
  };
}

/**
 * Checks the LV cable-tray runs drawn in one open CAD file. One drawn run is one inspectable segment. The calculation
 * keeps only small summaries per referenced route and returns no geometry or search index.
 */
export function checkLvContainment(project: Project, items: readonly SketchItem[]): ContainmentCheckResult {
  const trays: SketchItem[] = [];
  let truncated = false;
  for (const item of items) {
    if (!item.tray) continue;
    if (trays.length === CONTAINMENT_CHECK_LIMITS.segments) { truncated = true; break; }
    trays.push(item);
  }

  const wanted = new Set(trays.map((item) => routeKey(item.tray?.route)).filter(Boolean));
  const routes = new Map<string, TrayRoute>();
  for (const route of trayPlanOf(project).routes) {
    const key = routeKey(route.name);
    if (wanted.has(key) && !routes.has(key)) routes.set(key, route);
  }

  const routeChecks = new Map<string, RouteCheck | undefined>();
  let checkedRoutes = 0;
  const segments = trays.map((item, index): ContainmentSegmentCheck => {
    const tray = item.tray!;
    const key = routeKey(tray.route);
    const base = { id: item.id, name: `S${index + 1}`, installedWidthMm: tray.widthMm, ...(tray.service ? { service: tray.service } : {}) };
    if (!key) return { ...base, status: 'unassigned', notes: ['Assign a tray route before checking its LV cables'] };
    const route = routes.get(key);
    if (!route) return { ...base, routeName: tray.route, status: 'unassigned', notes: [`Route ${tray.route} is not in the cable-tray schedule`] };
    if (!routeChecks.has(key)) {
      routeChecks.set(key, checkedRoutes < CONTAINMENT_CHECK_LIMITS.routes ? checkedRoute(project, route) : undefined);
      checkedRoutes += 1;
    }
    const checked = routeChecks.get(key);
    if (!checked) return {
      ...base, routeName: route.name, status: 'limited',
      notes: [`Check limit reached (${CONTAINMENT_CHECK_LIMITS.routes} routes and ${CONTAINMENT_CHECK_LIMITS.cableInstancesPerRoute.toLocaleString('en-GB')} cable instances per route)`]
    };

    const fillPct = checked.fillPct(tray.widthMm);
    const tooNarrow = tray.widthMm + 1e-6 < checked.occupiedMm;
    const overFill = fillPct > checked.fillLimitPct + 1e-6;
    const lowSpare = tray.widthMm + 1e-6 < checked.requiredMm;
    const notes = [...checked.notes];
    if (checked.cableCount === 0) notes.unshift('No LV cables are assigned to this route');
    if (tooNarrow) notes.unshift('The LV cables do not fit the installed tray');
    else if (lowSpare) notes.unshift(`Installed width does not provide the ${checked.sparePct}% spare allowance`);
    if (overFill) notes.unshift(`Fill exceeds the ${checked.fillLimitPct}% design limit`);
    const status: ContainmentSegmentStatus = tooNarrow || overFill
      ? 'overloaded'
      : lowSpare || notes.length > 0
        ? 'review'
        : 'within-limit';
    return {
      ...base,
      routeName: route.name,
      depthMm: checked.depthMm,
      cableCount: checked.cableCount,
      fillPct,
      fillLimitPct: checked.fillLimitPct,
      method: checked.method,
      sparePct: checked.sparePct,
      ...(checked.complete ? { recommendedWidthMm: checked.recommendedWidthMm, recommendedTiers: checked.recommendedTiers } : {}),
      status,
      notes: [...new Set(notes)]
    };
  });

  return {
    segments,
    truncated,
    checkedRoutes: Math.min(checkedRoutes, CONTAINMENT_CHECK_LIMITS.routes),
    issues: segments.filter((segment) => segment.status !== 'within-limit').length
  };
}
