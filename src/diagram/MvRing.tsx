import type { GridSource } from '../types';
import { Sym, SYM_SCALE } from './symbolLibrary';
import { MV_ROWS as Y, MV_SLOT, RING_Y, sourceLabels, type MvGeom, type RmuGeom } from './mvArrangement';

/** The 11 kV side of the system SLD in its ring arrangement (see mvArrangement.ts): substation frames, the ring from each
 * grid source through the RMUs' ring switches, each RMU's tee-offs down to its transformers, and stubs to what is
 * drawn elsewhere. The transformers themselves are drawn with their main boards, under the tee-offs. */
export default function MvRing({ geom, rmuTitle, sourceTitle, onFrameOpen }: {
  geom: MvGeom;
  /** Tooltip of an RMU: its label, what it feeds and its ratings. */
  rmuTitle: (name: string) => string;
  /** Tooltip of a grid source. */
  sourceTitle: (g?: GridSource) => string | undefined;
  /** Double-click a substation frame (the MV overview: show that substation). */
  onFrameOpen?: (name: string) => void;
}) {
  const s = SYM_SCALE.switch;
  return (
    <g className="mvRing-ring">
      {geom.frames.map((f) => (
        <g key={`ss-${f.name}-${f.x1}`} className="ss-frame" data-ss={f.name} onDoubleClick={onFrameOpen ? () => onFrameOpen(f.name) : undefined}>
          <title>{`Substation ${f.name}${f.sub ? ` · ${f.sub}` : ''}${onFrameOpen ? ' — double-click to show it' : ''}`}</title>
          <rect x={f.x1} y={Y.frameTop} width={f.x2 - f.x1} height={geom.frameBottom - Y.frameTop} className="frame-ln" style={{ strokeDasharray: '12 4 2 4' }} />
          <text className="b" x={f.x1 + 9} y={Y.title}>{f.name}</text>
          {f.sub && <text className="m" x={f.x1 + 9} y={Y.subtitle}>{f.sub}</text>}
        </g>
      ))}
      {geom.runs.map((r, i) => (
        <g key={`run-${i}`} className="mvRing-run">
          {r.segs.map(([a, b]) => <line key={`${a}-${b}`} x1={a} y1={RING_Y} x2={b} y2={RING_Y} className="ln mv" />)}
          {r.dots.map((x) => <circle key={x} cx={x} cy={RING_Y} r="2.5" className="dot" />)}
          {r.head.kind === 'source' ? (
            <g className="mvRing-source">
              {sourceTitle(r.source) && <title>{sourceTitle(r.source)}</title>}
              <circle cx={r.head.x} cy={RING_Y} r="11" className="sym" />
              <path d={`M${r.head.x - 5} ${RING_Y} q2.5 -6 5 0 t5 0`} className="ln" />
              {(() => {
                const rows = sourceLabels(r.source);
                const above = rows.filter((t) => !t.below), below = rows.filter((t) => t.below);
                return [
                  ...above.map((t, k) => <text key={`a${k}`} className={t.b ? 'b' : 'm'} x={r.head.x - 11} y={RING_Y - 17 - (above.length - 1 - k) * 13}>{t.text}</text>),
                  ...below.map((t, k) => <text key={`b${k}`} className="m" x={r.head.x - 11} y={RING_Y + 27 + k * 12}>{t.text}</text>)
                ];
              })()}
            </g>
          ) : (
            <g className="mvRing-stub">
              <circle cx={r.head.x} cy={RING_Y} r="2.5" className="sym" />
              <text className="m" x={r.head.x + 2} y={RING_Y - 6} style={{ fontSize: 10 }}>{r.head.text}</text>
            </g>
          )}
          {r.tail && (
            <g className={r.tail.kind === 'to' ? 'mvRing-stub' : 'mvRing-end'}>
              {r.tail.kind === 'to'
                ? <circle cx={r.tail.x} cy={RING_Y} r="2.5" className="sym" />
                : <path d={`M${r.tail.x - 8} ${RING_Y - 4}L${r.tail.x} ${RING_Y}L${r.tail.x - 8} ${RING_Y + 4}`} className="ln" />}
              <text className="m" x={r.tail.x - 2} y={RING_Y - 6} textAnchor="end" style={{ fontSize: 10 }}>{r.tail.text}</text>
            </g>
          )}
        </g>
      ))}
      {geom.taps.map((t) => <line key={`tap-${t.boardId}`} x1={t.x} y1={RING_Y} x2={t.x} y2={Y.txTop} className="ln mv" />)}
      {geom.rmus.map((g) => <Rmu key={`rmu-${g.item.name}`} g={g} s={s} title={rmuTitle(g.item.name)} />)}
    </g>
  );
}

/** One RMU: its box, ring switches from the ring line down to its busbar (N/O beside the normally open one), and the
 * tee-offs below with the cable to each transformer (a jog where the transformer is not right under it), a stub to one
 * drawn elsewhere, or SPARE. */
function Rmu({ g, s, title }: { g: RmuGeom; s: number; title: string }) {
  const it = g.item;
  const last = g.ways[g.ways.length - 1].x;
  const teeSym = it.tOff === 'vcb' ? 'cb' : 'fusesw';
  return (
    <g className="rmu" data-rmu={it.name}>
      <title>{title}</title>
      <rect x={g.x1} y={Y.boxTop} width={g.x2 - g.x1} height={Y.boxBottom - Y.boxTop} rx="3" className="sym rmu-box" />
      <line x1={g.ways[0].x} y1={Y.bus} x2={g.outX === g.inX ? Math.max(last, g.ways[0].x) : g.outX} y2={Y.bus} className="ln" style={{ strokeWidth: 2.2 }} />
      {g.ways.map((w, i) => w.kind === 'ring' ? (
        <g key={i} className="rmu-ring-sw">
          <line x1={w.x} y1={RING_Y} x2={w.x} y2={Y.ringSw} className="ln mv" />
          <Sym id="isolator" x={w.x} y={Y.ringSw + 16 * s} s={s} />
          <line x1={w.x} y1={Y.ringSw + MV_SLOT} x2={w.x} y2={Y.bus} className="ln" />
        </g>
      ) : (
        <g key={i} className={w.kind === 'tee' ? 'rmu-tee' : 'rmu-ring-spare'}>
          {w.kind === 'tee' && !w.boardId && <title>Spare tee-off: right-click → Add transformer and main board</title>}
          <line x1={w.x} y1={Y.bus} x2={w.x} y2={Y.teeSw} className="ln" />
          <Sym id={w.kind === 'tee' ? teeSym : 'isolator'} x={w.x} y={Y.teeSw + 16 * s} s={s} />
          {w.kind === 'tee' && w.boardId ? (
            <line x1={w.x} y1={Y.teeSw + MV_SLOT} x2={w.x} y2={Y.boxBottom} className="ln" />
          ) : (
            <>
              <line x1={w.x} y1={Y.teeSw + MV_SLOT} x2={w.x} y2={Y.teeSw + MV_SLOT + 4} className="ln" />
              <line x1={w.x - 5} y1={Y.teeSw + MV_SLOT + 4} x2={w.x + 5} y2={Y.teeSw + MV_SLOT + 4} className="ln" />
              <text className="m" x={w.x} y={Y.boxBottom - 3} textAnchor="middle" style={{ fontSize: 8 }}>{w.kind === 'tee' ? 'SPARE' : `R${3 + g.ways.slice(0, i).filter((v) => v.kind === 'ring-spare').length}`}</text>
            </>
          )}
        </g>
      ))}
      <text className="b" x={g.textX} y={Y.name} textAnchor="middle">{it.name}</text>
      {it.config && <text className="m" x={g.textX} y={Y.config} textAnchor="middle">{it.config}</text>}
      {g.nop && <text className="b" x={g.nop.x} y={Y.ringSw + 16} textAnchor={g.nop.anchor} data-nop={it.normallyOpen}>N/O</text>}
      {g.note?.lines.map((t, k) => <text key={t} className="m" x={g.note!.x} y={Y.teeSw + 11 + k * 10} style={{ fontSize: 9 }}>{t}</text>)}
      {g.ways.filter((w) => w.kind === 'tee' && w.boardId).map((w) => {
        const stub = g.stubs.find((t) => t.x === w.x);
        if (stub) {
          const end = w.x + stub.dir * 40;
          return (
            <g key={`c-${w.x}`} className="mvRing-stub">
              <path d={`M${w.x} ${Y.boxBottom}V${Y.stub}H${end}`} className="ln mv" />
              <circle cx={end + stub.dir * 2.2} cy={Y.stub} r="2.2" className="sym" />
              <text className="m" x={w.x + stub.dir * 46} y={Y.stub + 4} textAnchor={stub.dir > 0 ? 'start' : 'end'} style={{ fontSize: 10 }}>{stub.text}</text>
            </g>
          );
        }
        return <TeeCable key={`c-${w.x}`} x={w.x} to={g.txX.get(w.boardId!)!} />;
      })}
    </g>
  );
}

/** MV cable from a tee-off to its transformer: straight down, or across at the jog row to a transformer beside it. */
function TeeCable({ x, to }: { x: number; to: number }) {
  return Math.abs(x - to) < 0.5
    ? <line x1={x} y1={Y.boxBottom} x2={x} y2={Y.txTop} className="ln mv" />
    : <path d={`M${x} ${Y.boxBottom}V${Y.jog}H${to}V${Y.txTop}`} className="ln mv" />;
}
