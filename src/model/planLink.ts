import type { Project } from '../types';

/** The project file's link to its drawn work file (.lvplan, model/planPackage.ts), written by the desktop app's main
 * process (electron/projectFiles.cjs): the file beside it, the SHA-256 of its bytes and the package version. In memory
 * a project keeps it only while its drawn work could not be read: it then opens read-only, and a save keeps the link,
 * so nothing is written over that work. Kept apart from planPackage.ts, which the app loads only to save or open. */
export interface PlanLink { file: string; sha256: string; version: number }

export const planLinkOf = (p: Project): PlanLink | undefined => {
  const l = (p as { plan?: unknown }).plan as Partial<PlanLink> | undefined;
  return l && typeof l === 'object' && typeof l.file === 'string' && typeof l.sha256 === 'string' && /^[0-9a-f]{64}$/.test(l.sha256) && Number.isInteger(l.version) && l.version! > 0
    ? { file: l.file, sha256: l.sha256, version: l.version! } : undefined;
};

export const withoutPlanLink = (p: Project): Project => {
  if (!('plan' in p)) return p;
  const { plan: _link, ...rest } = p as Project & { plan?: unknown };
  return rest as Project;
};

/** Why a project whose drawn work could not be read is open read-only (decision P4). */
export const planMissingNote = (link: PlanLink): string => `The drawn work for this project (${link.file}) is missing or out of date. Drawings open without it, and nothing is saved over it.`;
