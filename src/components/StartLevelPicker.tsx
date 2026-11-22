import type { ReactNode } from 'react';
import { START_LEVELS, type StartChoice, type StartLevel } from '../model/startLevel';

const BUS = { strokeWidth: 3 };
const MV = { strokeWidth: 1.8 };
const DASH = { strokeDasharray: '4 3' };
const Ln = ({ x1, y1, x2, y2, ...r }: { x1: number; y1: number; x2: number; y2: number; strokeWidth?: number; strokeDasharray?: string }) => <line x1={x1} y1={y1} x2={x2} y2={y2} {...r} />;
/** A circuit breaker on a vertical line at x, its box starting at y. */
const Breaker = ({ x, y }: { x: number; y: number }) => (
  <>
    <rect x={x - 4} y={y} width={8} height={14} fill="var(--bg)" stroke="none" />
    <Ln x1={x} y1={y + 14} x2={x + 6} y2={y + 2} /><Ln x1={x - 3} y1={y} x2={x + 3} y2={y} />
    <Ln x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} /><Ln x1={x - 3} y1={y + 3} x2={x + 3} y2={y - 3} />
  </>
);
const Way = ({ x, bus, end, y }: { x: number; bus: number; end: number; y: number }) => <><Ln x1={x} y1={bus} x2={x} y2={end} /><Breaker x={x} y={y} /></>;
const Label = ({ x, y, children, bold }: { x: number; y: number; children: ReactNode; bold?: boolean }) => (
  <text x={x} y={y} textAnchor="middle" fill="currentColor" stroke="none" fontSize={11} fontWeight={bold ? 600 : undefined}>{children}</text>
);
/** The board above the project, drawn as a pointed tab. */
const FromBoard = ({ top }: { top: number }) => <><path d={`M69,${top} L179,${top} L179,${top + 18} L124,${top + 30} L69,${top + 18} Z`} /><Label x={124} y={top + 13} bold>FROM A BOARD</Label></>;
/** A transformer (two circles) at x, the upper one centred on y. */
const Tx = ({ x, y, r, gap, dash }: { x: number; y: number; r: number; gap: number; dash?: boolean }) => <g {...(dash ? DASH : {})}><circle cx={x} cy={y} r={r} /><circle cx={x} cy={y + gap} r={r} /></g>;

function Drawing({ level, two }: { level: StartLevel; two: boolean }) {
  switch (level) {
    case 'db':
      return <><FromBoard top={6} /><Ln x1={124} y1={36} x2={124} y2={50} /><Ln x1={60} y1={56} x2={190} y2={56} {...BUS} />{[70, 100, 150, 180].map((x) => <Way key={x} x={x} bus={56} end={86} y={63} />)}</>;
    case 'submain':
      return (
        <>
          <FromBoard top={2} /><Ln x1={124} y1={32} x2={124} y2={44} /><Ln x1={40} y1={50} x2={210} y2={50} {...BUS} />
          {[60, 124, 190].map((x) => <g key={x}><Ln x1={x} y1={50} x2={x} y2={66} /><rect x={x - 24} y={66} width={48} height={24} /><Label x={x} y={82}>DB</Label></g>)}
        </>
      );
    case 'source':
      return (
        <>
          <circle cx={124} cy={18} r={14} /><Ln x1={124} y1={32} x2={124} y2={38} /><rect x={111} y={38} width={26} height={18} /><Label x={124} y={51}>kWh</Label>
          <Ln x1={124} y1={56} x2={124} y2={64} /><Ln x1={50} y1={68} x2={200} y2={68} {...BUS} />{[70, 124, 180].map((x) => <Way key={x} x={x} bus={68} end={92} y={73} />)}
        </>
      );
    case 'transformer':
      return <><Tx x={124} y={12} r={9} gap={12} /><Ln x1={124} y1={33} x2={124} y2={60} /><Ln x1={50} y1={64} x2={200} y2={64} {...BUS} />{[70, 124, 180].map((x) => <Way key={x} x={x} bus={64} end={92} y={71} />)}</>;
    case 'rmu': {
      const d = two ? {} : DASH;
      return (
        <>
          <Ln x1={20} y1={12} x2={228} y2={12} {...MV} /><rect x={64} y={2} width={120} height={20} fill="var(--bg)" /><Ln x1={72} y1={12} x2={176} y2={12} {...BUS} />
          <Ln x1={94} y1={22} x2={94} y2={30} /><Tx x={94} y={38} r={8} gap={10} /><Ln x1={94} y1={56} x2={94} y2={66} /><Ln x1={70} y1={70} x2={118} y2={70} {...BUS} />
          <Ln x1={154} y1={22} x2={154} y2={30} {...d} /><Tx x={154} y={38} r={8} gap={10} dash={!two} /><Ln x1={154} y1={56} x2={154} y2={66} {...d} /><Ln x1={130} y1={70} x2={178} y2={70} {...BUS} {...d} />
        </>
      );
    }
    case 'ring':
      return (
        <>
          <Ln x1={20} y1={14} x2={228} y2={14} {...MV} /><Ln x1={20} y1={14} x2={20} y2={50} {...MV} /><Ln x1={228} y1={14} x2={228} y2={50} {...MV} />
          {[70, 180].map((x) => (
            <g key={x}><rect x={x - 20} y={6} width={40} height={16} fill="var(--bg)" /><rect x={x - 20} y={6} width={40} height={16} /><Ln x1={x} y1={22} x2={x} y2={40} /><Tx x={x} y={47} r={9} gap={12} /><Ln x1={x} y1={68} x2={x} y2={76} /><Ln x1={x - 26} y1={78} x2={x + 26} y2={78} {...BUS} /></g>
          ))}
        </>
      );
  }
}

/** New project: where the SLD starts, as six picture tiles (one radio group), and for an RMU how many transformers. */
export function StartLevelPicker({ value, onChange }: { value: StartChoice; onChange: (c: StartChoice) => void }) {
  const two = value.transformers === 2;
  return (
    <>
      <div className="ft-cards" role="radiogroup" aria-label="Start the SLD from">
        {START_LEVELS.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={value.level === l.id} className={`ft-card${value.level === l.id ? ' sel' : ''}`}
            onClick={() => onChange(l.id === 'rmu' ? { level: 'rmu', transformers: value.transformers ?? 1 } : { level: l.id })}>
            <b>{l.title}</b>
            <svg viewBox="0 0 248 100" width="100%" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.2}><Drawing level={l.id} two={l.id === 'rmu' && two} /></svg>
            <span className="m">{l.note}</span>
          </button>
        ))}
      </div>
      {value.level === 'rmu' && (
        <div className="form-kv">
          <fieldset className="relays">
            <legend>Transformers</legend>
            <label className="row"><input type="radio" name="start-transformers" aria-label="1 — RMU RRT, one main board" checked={!two} onChange={() => onChange({ level: 'rmu', transformers: 1 })} /> 1 — RMU RRT, one main board</label>
            <label className="row"><input type="radio" name="start-transformers" aria-label="2 — RMU RRTT, two main boards, bus coupler normally open" checked={two} onChange={() => onChange({ level: 'rmu', transformers: 2 })} /> 2 — RMU RRTT, two main boards, bus coupler normally open</label>
          </fieldset>
        </div>
      )}
    </>
  );
}
