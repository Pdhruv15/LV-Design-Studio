// The desktop app's error log, and what happens when the window's page dies or stops answering. Plain Node apart from
// what is passed in, unit tested (src/model/desktopErrorLog.test.ts) and tried on a real window
// (tests/electron/windowWatch.electron.ts). Nothing here is sent anywhere.

const fs = require('node:fs');
const path = require('node:path');
const { NOFOLLOW, PRIVATE_FILE, assertNotLink, ensureRealDir } = require('./safeFs.cjs');

/** Then the log moves to errors.old.log, so the two together stay small. */
const MAX_BYTES = 512 * 1024;

/** Adds an entry to errors.log in `dir`. Never throws: logging an error must not cause another. */
function appendError(dir, text) {
  try {
    ensureRealDir(dir);
    const file = path.join(dir, 'errors.log');
    assertNotLink(file); // also covers systems without O_NOFOLLOW
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(dir, 'errors.old.log'));
    const { O_WRONLY, O_APPEND, O_CREAT } = fs.constants;
    const fd = fs.openSync(file, O_WRONLY | O_APPEND | O_CREAT | NOFOLLOW, PRIVATE_FILE);
    try { fs.writeSync(fd, `${text}\n\n`); } finally { fs.closeSync(fd); }
    return true;
  } catch {
    return false;
  }
}

/** A page that has died or stopped answering can't report itself, and the window would just sit there: this logs it and
 * asks what to do. After a reload any recovery copy is offered, as after any crash. */
function watchWindow(win, { dialog, log, quit, version }) {
  const wc = win.webContents;
  const note = (what) => log(`LV Design Studio ${version} (desktop window) · ${new Date().toISOString()} · ${what}`);
  let reloading = false; // ending a stuck page on request also reads as a crash: that one needs no question
  let asking = null;

  wc.on('render-process-gone', async (_e, details) => {
    // Only now: on a real window, a reload sent straight after ending a page stuck in a loop never happens.
    if (reloading) { wc.reload(); return; }
    note(`the page stopped: ${details.reason} (exit code ${details.exitCode})`);
    if (details.reason === 'clean-exit' || win.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(win, {
      type: 'error',
      title: 'LV Design Studio stopped',
      message: 'The window stopped unexpectedly.',
      detail: 'Reload to carry on. Any recovery copy is then offered; changes made since your last save or recovery copy are lost.',
      buttons: ['Reload', 'Quit'],
      defaultId: 0,
      cancelId: 0
    });
    if (win.isDestroyed()) return;
    if (response === 0) wc.reload(); else quit();
  });

  wc.on('did-finish-load', () => { reloading = false; });

  wc.on('unresponsive', async () => {
    note('the window stopped responding');
    if (asking) return;
    asking = new AbortController();
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'LV Design Studio is not responding',
      message: 'The window is not responding.',
      detail: 'It may be busy with a large job, so waiting is the safer choice. If you reload, any recovery copy is then offered; changes made since your last save or recovery copy are lost.',
      buttons: ['Keep waiting', 'Reload'],
      defaultId: 0,
      cancelId: 0,
      signal: asking.signal
    });
    asking = null;
    if (response !== 1 || win.isDestroyed()) return;
    note('reloading the window, as asked');
    reloading = true;
    wc.forcefullyCrashRenderer();
  });

  // Answering again: the question is out of date, and Reload would throw away work for nothing.
  wc.on('responsive', () => {
    note('the window is responding again');
    asking?.abort();
  });
}

module.exports = { appendError, watchWindow, MAX_BYTES };
