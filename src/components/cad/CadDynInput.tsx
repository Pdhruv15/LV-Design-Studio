import type { KeyboardEvent, RefObject } from 'react';

/** A box of dynamic input: what it asks, the value now (shown until a value is typed) and its unit. */
export interface DynBox { label: string; live: string; unit: string }

/** Dynamic input at the cursor: the boxes asked for (length and angle while a point is asked for, else a distance,
 * radius or factor), what was typed in them, and the prompt in short form with ↓ for its options (Down opens them). */
export default function CadDynInput({ left, top, boxes, vals, refs, prompt, options, menu, hi, onVals, onKey, onPick }: {
  left: number;
  top: number;
  boxes: DynBox[];
  vals: string[];
  refs: RefObject<HTMLInputElement>[];
  prompt: string;
  options: { option: string; key: string }[];
  menu: boolean;
  hi: number;
  onVals: (vals: string[]) => void;
  onKey: (e: KeyboardEvent<HTMLInputElement>, i: number) => void;
  onPick: (key: string) => void;
}) {
  return (
    <div className="cad-dyn" style={{ left, top }} aria-label="Dynamic input">
      {boxes.length > 0 && (
        <div className="cad-dyn-row">
          {boxes.map((b, i) => (
            <label key={b.label} className={vals[i] ? 'on' : undefined}>
              <input ref={refs[i]} aria-label={b.label} value={vals[i] ?? ''} placeholder={b.live} size={Math.max(4, (vals[i] || b.live).length)} autoComplete="off" spellCheck={false}
                onChange={(e) => onVals(boxes.map((_, k) => (k === i ? e.target.value : vals[k] ?? '')))} onKeyDown={(e) => onKey(e, i)} />
              <u>{b.unit}</u>
            </label>
          ))}
        </div>
      )}
      {prompt && <div className="cad-dyn-prompt">{prompt}{options.length > 0 && <small> ↓</small>}</div>}
      {menu && options.length > 0 && (
        <div className="cad-dyn-menu" role="listbox" aria-label="Options">
          {options.map((o, i) => (
            <button key={o.key} type="button" role="option" aria-selected={i === hi} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(o.key)}>
              {o.option} <b>{o.key}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
