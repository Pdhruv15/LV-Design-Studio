import type { GridSource, Project, Rmu } from '../types';

/** Edits of the HV supply (grid sources) and the RMU records. */

/** Next free "GRID-n" id. */
export function nextGridId(project: Project): string {
  const used = new Set((project.gridSources ?? []).map((g) => g.id));
  let n = 0, id;
  do { id = `GRID-${++n}`; } while (used.has(id));
  return id;
}

/** Add a grid source: 11 kV from the authority, fault level to be entered. */
export function addGridSource(project: Project, operator = 'DEWA'): Project {
  const id = nextGridId(project);
  return { ...project, gridSources: [...(project.gridSources ?? []), { id, name: id, operator, kv: 11 }] };
}

/** Change a grid source; blank optional values are dropped. */
export function updateGridSource(project: Project, id: string, patch: Partial<GridSource>): Project {
  return { ...project, gridSources: (project.gridSources ?? []).map((g) => (g.id === id ? clean({ ...g, ...patch, id }) : g)) };
}

/** Remove a grid source and the RMU links to it. */
export function removeGridSource(project: Project, id: string): Project {
  const gridSources = (project.gridSources ?? []).filter((g) => g.id !== id);
  const rmus = (project.rmus ?? []).map((r) => (r.sourceId === id ? clean({ ...r, sourceId: undefined }) : r));
  const { gridSources: _g, rmus: _r, ...rest } = project;
  return { ...rest, ...(gridSources.length ? { gridSources } : {}), ...(rmus.length ? { rmus } : {}) };
}

/** Change an RMU's details (made on the first change); a record left with only its name is removed. */
export function updateRmu(project: Project, name: string, patch: Partial<Rmu>): Project {
  const key = name.trim();
  const list = project.rmus ?? [];
  const r = clean({ ...(list.find((x) => x.name === key) ?? { name: key }), ...patch, name: key });
  const others = list.filter((x) => x.name !== key);
  const rmus = Object.keys(r).length > 1 ? [...others, r].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : others;
  const { rmus: _r, ...rest } = project;
  return rmus.length ? { ...rest, rmus } : rest;
}

/** Drop undefined, empty-string and NaN values. */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v)))) as T;
}
