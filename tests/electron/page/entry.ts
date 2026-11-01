import { dxfToDwg, openDrawing, SNAP, type CadView } from '../../../src/engines/cad/cadEngine';

/** The real engine code in a real Chromium page, built by the app's own Vite config: see cadWorker.electron.ts. */

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** A DXF of the sample's header and `lines` generated lines. */
function largeDxf(sample: string, lines: number): Uint8Array {
  const eol = sample.includes('\r\n') ? '\r\n' : '\n';
  const end = sample.lastIndexOf('ENDSEC');
  const cut = sample.lastIndexOf('\n', sample.lastIndexOf('\n', end - 1) - 1) + 1;
  const parts: string[] = [sample.slice(0, cut)];
  for (let i = 0; i < lines; i += 1) {
    const x = (i % 1000) * 3, y = Math.floor(i / 1000) * 3;
    parts.push(['0', 'LINE', '5', (0x10000 + i).toString(16).toUpperCase(), '8', `L${i % 40}`, '10', x, '20', y, '30', 0, '11', x + 2.5, '21', y + 1.5, '31', 0].join(eol), eol);
  }
  parts.push(sample.slice(cut));
  return new TextEncoder().encode(parts.join(''));
}

/** How often the page got to run during `work`, and its longest stall (ms). */
async function live<T>(work: () => Promise<T>) {
  let ticks = 0, last = performance.now(), longest = 0;
  const timer = setInterval(() => { const now = performance.now(); longest = Math.max(longest, now - last); last = now; ticks += 1; }, 5);
  try {
    const value = await work();
    return { value, ticks, longest: Math.max(longest, performance.now() - last) };
  } finally { clearInterval(timer); }
}

let held: CadView | null = null;
const page = window as unknown as Record<string, unknown>;
page.closeLarge = () => { held?.close(); held = null; };
page.runChecks = async (sampleBase64: string, lines: number, inPage: boolean) => {
  if (inPage) page.Worker = undefined;
  const sampleBytes = fromBase64(sampleBase64), sample = new TextDecoder().decode(sampleBytes);
  const opened = await openDrawing('sample.dxf', sampleBytes);
  const on = new Uint8Array(opened.info.layers.length).fill(1);
  const snapped = [...await opened.snap(110, 90, 50, SNAP.endpoint, on)];
  const picked = (await opened.pick(6687.5 + 190, 7375, 30, on))?.block;
  opened.close();
  const afterClose = [...await opened.snap(110, 90, 50, SNAP.endpoint, on)];
  const dwg = new TextDecoder().decode((await dxfToDwg(sample)).slice(0, 6));
  const large = largeDxf(sample, lines);
  const big = await live(() => openDrawing('large.dxf', large));
  const ms = performance.now();
  const snapBig = await big.value.snap(30, 30, 2, SNAP.endpoint, new Uint8Array(big.value.info.layers.length).fill(1));
  const snapMs = performance.now() - ms;
  held = big.value;
  return { engine: opened.engine, format: opened.info.format, snapped, picked, afterClose, dwg, largeEngine: big.value.engine, segments: big.value.info.segments, snapBig: [...snapBig], snapMs, ticks: big.ticks, longest: big.longest };
};
