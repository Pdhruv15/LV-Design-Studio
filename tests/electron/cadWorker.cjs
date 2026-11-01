// Runs the CAD engine checks in a hidden window set up as the app's is (electron/main.cjs): loaded from a file, sandboxed,
// with the app's preload and security policy. Only the test page is loaded, not the app, and nothing goes to the network.
//   electron tests/electron/cadWorker.cjs <page.html> <wasm> <sample.dxf> <out.json> <lines> <in page: 0 or 1>
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const [page, wasm, sample, output, lines, inPage] = process.argv.slice(-6);

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  ipcMain.handle('cad:engine', () => new Uint8Array(fs.readFileSync(wasm)));
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.resolve(__dirname, '../../electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false, backgroundThrottling: false }
  });
  win.webContents.on('console-message', (e) => console.error(`page: ${e.message}`));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, done) => done({ cancel: true }));
  try {
    await win.loadFile(page);
    // The page's memory (a worker's is part of it) with the large drawing open, and after closing it.
    const memoryMb = () => app.getAppMetrics().find((m) => m.pid === win.webContents.getOSProcessId()).memory.workingSetSize / 1024;
    const result = await win.webContents.executeJavaScript(`window.runChecks(${JSON.stringify(fs.readFileSync(sample).toString('base64'))}, ${Number(lines)}, ${inPage === '1'})`);
    const openMb = memoryMb();
    await win.webContents.executeJavaScript('window.closeLarge()');
    await new Promise((r) => setTimeout(r, 1000));
    fs.writeFileSync(output, JSON.stringify({ ...result, openMb, closedMb: memoryMb() }));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.quit();
  }
});
