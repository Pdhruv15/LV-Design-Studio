import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { LevelCheck, LevelFinding } from '../../model/levelCheck';

/** Side panel of Check level (CHK): the counts, then the findings by group; a line goes to its place on the plan, and
 * some open the tool that fixes them. */
export default function LevelCheckPanel({ levelName, check, selected, onShow, onFix, onAgain }: {
  levelName: string; check: LevelCheck; selected: string | null;
  onShow: (f: LevelFinding) => void; onFix: (f: LevelFinding) => void; onAgain: () => void;
}) {
  return (
    <>
      <h4>Check level <span className="m">{levelName}</span></h4>
      <div className="cad-chk">
        <div className="cad-chk-counts">{check.counts}</div>
        {check.groups.map((g) => (
          <div key={g.id} className="cad-chk-group" role="group" aria-label={g.title}>
            <div className="cad-chk-h">{g.title}<span>{g.findings.filter((f) => !f.ok).length}</span></div>
            {g.findings.map((f) => (
              <div key={f.text} className={`cad-chk-row${f.ok ? ' ok' : ''}${selected === f.text ? ' on' : ''}`}>
                <button type="button" className="cad-chk-line" disabled={!f.box} title={f.box ? 'Go to it on the plan' : undefined} onClick={() => onShow(f)}>
                  {f.ok ? <CircleCheck size={12} strokeWidth={1.8} aria-hidden /> : <TriangleAlert size={12} strokeWidth={1.8} aria-hidden />}<span>{f.text}</span>
                </button>
                {f.fix && <button type="button" className="cad-chk-fix" onClick={() => onFix(f)}>{f.fix.tool === 'lux' ? 'Light room' : 'Coverage'}</button>}
              </div>
            ))}
          </div>
        ))}
        <div className="cad-chk-foot">
          <span className="m">{check.toLook ? `${check.toLook} to look at` : 'Nothing to look at'} · {check.rooms} room{check.rooms === 1 ? '' : 's'} and {check.devices} device{check.devices === 1 ? '' : 's'} checked</span>
          <button type="button" className="chip" onClick={onAgain}>Check again</button>
        </div>
        <span className="m">Lux is the lumen-method average, as Light room.</span>
      </div>
    </>
  );
}
