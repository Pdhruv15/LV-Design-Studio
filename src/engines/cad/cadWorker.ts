import { answerCall, engineOps, type EngineCall } from './cadOps';

/** The CAD engine in a worker of its own: opening a drawing never holds up the page, and ending the worker gives back
 * all its memory (WebAssembly memory cannot shrink while the engine runs). */
const ops = engineOps();
const host = self as unknown as { onmessage: (e: MessageEvent<EngineCall>) => void; postMessage: (message: unknown, transfer: Transferable[]) => void };
host.onmessage = ({ data }) => {
  const { answer, transfer } = answerCall(ops, data);
  host.postMessage(answer, transfer);
};
