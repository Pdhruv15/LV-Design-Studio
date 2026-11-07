import { useEffect, useRef, useState, type RefObject } from 'react';
import { commandList, matchingCommands, promptOptions, promptParts, spaceEnters, type SpaceMode } from './cadPrompt';

/** Design CAD's command line: three lines of history, the prompt with its options (a click works as typing the key),
 * the input with the commands matching what is typed (Tab or the arrows pick one), Up / Down in the empty input for
 * the commands typed before, and the taller history (F2) or the command list (F1) over the drawing. */
export default function CadCommandLine({ history, cmd, setCmd, inputRef, typed, space, log, onLog, onRun }: {
  history: string[];
  cmd: string;
  setCmd: (s: string) => void;
  inputRef: RefObject<HTMLInputElement>;
  /** The commands typed before, oldest first. */
  typed: string[];
  /** What Space does in the input (src/components/cad/cadPrompt.ts): text types it, a value or a command ends it. */
  space: SpaceMode;
  log: 'history' | 'help' | null;
  onLog: (log: 'history' | 'help' | null) => void;
  onRun: (text: string) => void;
}) {
  // The command picked in the list (arrows), and the place in the commands typed before (Up / Down).
  const [hi, setHi] = useState(-1);
  const [back, setBack] = useState(-1);
  const matches = space !== 'command' || back >= 0 ? [] : matchingCommands(cmd);
  const last = history[history.length - 1];
  // The taller history opens at its newest line.
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log === 'history' && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, history.length]);
  const submit = (text: string) => { onRun(text); setCmd(''); setHi(-1); setBack(-1); };
  const step = (d: 1 | -1) => {
    if (!typed.length) return;
    const i = back < 0 ? (d < 0 ? typed.length - 1 : -1) : back + d;
    if (i < 0 || i >= typed.length) { setBack(-1); setCmd(''); return; }
    setBack(i); setCmd(typed[i]);
  };
  return (
    <div className="cad-cmdbox">
      {log && (
        <div ref={logRef} className="cad-log" role="log" aria-label={log === 'help' ? 'Command list (F1)' : 'Command history (F2)'}>
          <button className="cad-log-x" aria-label="Close" onClick={() => onLog(null)}>×</button>
          {log === 'help'
            ? commandList().map((c) => <div key={c.aliases}><b>{c.aliases}</b>  {c.desc}</div>)
            : history.map((h, i) => <div key={i}>{h}</div>)}
        </div>
      )}
      {matches.length > 0 && (
        <div className="cad-ac" role="listbox" aria-label="Matching commands">
          {matches.map((x, i) => (
            <button key={x.alias} type="button" role="option" aria-selected={i === hi} onMouseDown={(e) => e.preventDefault()} onClick={() => submit(x.alias)}>
              <span>{x.alias}</span><small>{x.cmd.desc}</small>
            </button>
          ))}
        </div>
      )}
      <div className="cad-hist-prev" aria-label="Earlier messages">
        {history.slice(-4, -1).map((h, i) => <div key={history.length - 4 + i}>{h}</div>)}
      </div>
      <form className="cad-cmd" onSubmit={(e) => { e.preventDefault(); submit(hi >= 0 && matches[hi] ? matches[hi].alias : cmd); }}>
        <span className="m cad-hist">{last === undefined ? 'Command: type OPEN, DI, AREA… or use the CAD ribbon' : promptParts(last).map((p, i) => ('option' in p
          ? <button key={i} type="button" className="cad-opt" title={`${p.option} (${p.key})`} onMouseDown={(e) => e.preventDefault()} onClick={() => submit(p.key)}>{p.option}</button>
          : <span key={i}>{p.text}</span>))}</span>
        <span>›</span>
        <input ref={inputRef} aria-label="Command" value={cmd} placeholder="Type a command" autoComplete="off" spellCheck={false}
          onChange={(e) => { setCmd(e.target.value); setHi(-1); setBack(-1); }}
          onKeyDown={(e) => {
            // Space ends the input as Enter does (the command picked in the list, if one is), once per press.
            if (e.key === ' ' && ((hi >= 0 && matches[hi]) || spaceEnters(cmd, space, promptOptions(last ?? '')))) { e.preventDefault(); if (!e.repeat) submit(hi >= 0 && matches[hi] ? matches[hi].alias : cmd); return; }
            if (matches.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); const n = matches.length, down = e.key === 'ArrowDown'; setHi((h) => (h < 0 ? (down ? 0 : n - 1) : (h + (down ? 1 : n - 1)) % n)); return; }
            if (matches.length && e.key === 'Tab') { e.preventDefault(); setCmd(matches[Math.max(0, hi)].alias); setHi(-1); return; }
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && space === 'command' && (!cmd || back >= 0)) { e.preventDefault(); step(e.key === 'ArrowUp' ? -1 : 1); }
          }} />
      </form>
    </div>
  );
}

/** The right-click menu on the drawing: with a tool running, Enter, the prompt's options and Cancel; with none,
 * Repeat and the recent commands. */
export function CadPromptMenu({ left, top, items, onPick }: { left: number; top: number; items: { label: string; key?: string }[]; onPick: (i: number) => void }) {
  return (
    <div className="cad-ctx vert" role="menu" aria-label="Command menu" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {items.map((x, i) => (
        <button key={x.label} role="menuitem" onClick={() => onPick(i)}><span>{x.label}</span>{x.key && <small className="m">{x.key}</small>}</button>
      ))}
    </div>
  );
}
