// HTML → PDF bytes with Chromium's print, the same for the app (files:pdfBytes) and the
// headless export (headlessExport.cjs). The HTML is the app's own report; it is shown in a
// hidden window with no preload, no Node and no scripts.
const { BrowserWindow, session } = require('electron');
const path = require('node:path');
const safeFs = require('./safeFs.cjs');

// Sheet sizes in inches (A-series); Electron knows A3/A4 by name only.
const SHEETS = { A1: { width: 33.11, height: 23.39 }, A2: { width: 23.39, height: 16.54 }, 'A3 portrait': { width: 11.69, height: 16.54 } };

/** Reports render in their own session that loads nothing from the network: only the local report file
 * and data: images it carries. */
let pdfSess;
function pdfSession() {
  if (pdfSess) return pdfSess;
  pdfSess = session.fromPartition('lvds-pdf');
  pdfSess.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|data|blob):/i.test(details.url) }));
  pdfSess.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
  pdfSess.setPermissionCheckHandler(() => false);
  return pdfSess;
}

/** args: checked by ipcValidate.pdfArgs. cssPages: the document sets its own page sizes and margins (@page). */
async function htmlToPdf({ html, pageSize, landscape, cssPages }) {
  const pdfWin = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false, webSecurity: true, session: pdfSession() } });
  pdfWin.webContents.on('will-navigate', (e) => e.preventDefault());
  const tmpDir = safeFs.makePrivateTempDir('lvds-pdf-');
  const tmp = path.join(tmpDir, 'part.html');
  try {
    safeFs.writeNewFile(tmp, html);
    await pdfWin.loadFile(tmp);
    const size = SHEETS[pageSize] ?? pageSize;
    const pdf = cssPages
      ? await pdfWin.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true })
      : await pdfWin.webContents.printToPDF({ pageSize: size, landscape: SHEETS[pageSize] ? false : landscape, printBackground: true, margins: { marginType: pageSize === 'A4' ? 'default' : 'none' } });
    return new Uint8Array(pdf);
  } finally {
    pdfWin.destroy();
    safeFs.removeDir(tmpDir);
  }
}

/** Sheet sizes in microns for a printer (Electron's print takes A3/A4 by name, others as width × height). */
const MICRONS = { A1: { width: 841000, height: 594000 }, A2: { width: 594000, height: 420000 }, 'A3 portrait': { width: 297000, height: 420000 } };

/** The printers this computer has: name, the name shown, and whether it is the system's default. */
async function printerList(webContents) {
  const list = await webContents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
}

/** args: checked by ipcValidate.printArgs. Prints the HTML on a printer the system lists, with no dialog, in the same
 * locked-down hidden window as the PDFs; resolves when the printer has the job. */
async function htmlToPrinter({ html, pageSize, landscape, deviceName, copies }, printers) {
  if (!printers.some((p) => p.name === deviceName)) throw new Error(`No printer named ${deviceName}`);
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false, webSecurity: true, session: pdfSession() } });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  const tmpDir = safeFs.makePrivateTempDir('lvds-print-');
  try {
    const tmp = path.join(tmpDir, 'sheet.html');
    safeFs.writeNewFile(tmp, html);
    await win.loadFile(tmp);
    const size = MICRONS[pageSize];
    await new Promise((resolve, reject) => win.webContents.print(
      { silent: true, deviceName, copies, printBackground: true, color: false, landscape: size ? size.width > size.height : landscape, pageSize: size ?? pageSize, margins: { marginType: 'none' } },
      (ok, why) => (ok ? resolve() : reject(new Error(why || 'The printer refused the job')))
    ));
    return true;
  } finally {
    win.destroy();
    safeFs.removeDir(tmpDir);
  }
}

module.exports = { htmlToPdf, htmlToPrinter, printerList, pdfSession, SHEETS };
