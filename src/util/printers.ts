import { useEffect, useState } from 'react';

/** Printers for Design CAD → Output: the computer's own (desktop app only), and the one plots go to on this computer.
 * An empty name is the built-in PDF. Offline: only printers already installed are listed. */
export interface PrinterInfo { name: string; displayName: string; isDefault: boolean }
export const PDF_PRINTER = '';
export const canPrint = (): boolean => typeof window !== 'undefined' && !!window.lvds?.files?.printHtml;

export async function listPrinters(): Promise<PrinterInfo[]> {
  try { return (await window.lvds?.files?.printers?.()) ?? []; } catch { return []; }
}
/** The printers, once loaded (empty in a browser). */
export function usePrinters(): { list: PrinterInfo[]; loaded: boolean } {
  const [state, setState] = useState<{ list: PrinterInfo[]; loaded: boolean }>({ list: [], loaded: false });
  useEffect(() => { let on = true; void listPrinters().then((list) => { if (on) setState({ list, loaded: true }); }); return () => { on = false; }; }, []);
  return state;
}

const KEY = 'lvds.plotPrinter';
/** The printer plots go to on this computer (Output → Printers); PDF unless one was chosen. */
export function plotPrinter(): string { try { return localStorage.getItem(KEY) ?? PDF_PRINTER; } catch { return PDF_PRINTER; } }
export function setPlotPrinter(name: string): void { try { if (name) localStorage.setItem(KEY, name); else localStorage.removeItem(KEY); } catch { /* preference only */ } }
/** A printer's name as shown: the system's display name, else the name; PDF for the built-in. */
export const printerLabel = (name: string, list: PrinterInfo[]): string => (name ? list.find((p) => p.name === name)?.displayName ?? name : 'PDF (built in)');
