import { useEffect, useRef, useState } from 'react';
import type { Project } from '../types';
import { projectFingerprint } from './saveSafety';

/** Whether the project has unsaved changes: its content differs from what was saved or opened (nothing saved: always).
 * Undoing back to the saved state is clean again. The comparison writes out the whole project, so it waits for a pause
 * in editing to keep typing responsive; until then an edit counts as unsaved. */
export function useUnsaved(project: Project, saved: Project | null, pauseMs = 300): boolean {
  const [sameAsSaved, setSameAsSaved] = useState<{ project: Project; saved: Project } | null>(null);
  const savedFp = useRef<{ of: Project; fp: string } | null>(null);
  useEffect(() => {
    if (project === saved || !saved) return;
    const t = setTimeout(() => {
      if (savedFp.current?.of !== saved) savedFp.current = { of: saved, fp: projectFingerprint(saved) };
      if (projectFingerprint(project) === savedFp.current.fp) setSameAsSaved({ project, saved });
    }, pauseMs);
    return () => clearTimeout(t);
  }, [project, saved, pauseMs]);
  return project !== saved && !(sameAsSaved?.project === project && sameAsSaved.saved === saved);
}
