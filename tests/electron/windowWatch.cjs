// The window watch (electron/errorLog.cjs) on a real window: a page that crashes, and one stuck in a loop. Only a small
// test page loads, not the app. This script answers the questions, so no dialog appears, and nothing leaves this computer.
//   electron tests/electron/windowWatch.cjs <out.json> <log folder>
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { appendError, watchWindow } = require('../../electron/errorLog.cjs');
const check = require('../../electron/ipcValidate.cjs');

const [output, logDir] = process.argv.slice(process.argv.findIndex((a) => a.endsWith('windowWatch.cjs')) + 1);
// Asks before closing, as the app does with unsaved work: this must not get in the way of replacing a dead page.
const PAGE = `data:text/html,<title>test page</title><script>addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; })</script>`;

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** A step that never ends fails the check instead of hanging it. */
  const inTime = (step, what) => Promise.race([step, sleep(30000).then(() => { throw new Error(`no answer: ${what}`); })]);
  const asked = [];
  const answers = [];
  // With no answer ready the question stays open, until it is withdrawn.
  const dialog = {
    showMessageBox: (_w, o) => {
      asked.push(o.title);
      return answers.length ? Promise.resolve({ response: answers.shift() }) : new Promise((r) => { o.signal.addEventListener('abort', () => r({ response: o.cancelId })); });
    }
  };
  let quits = 0, blocked = 0;

  // The app's own bridge, and this handler written as the app's, so a page's error reaches the file the same way.
  ipcMain.handle('log:error', (_evt, text) => appendError(logDir, check.logText(text)));
  const win = new BrowserWindow({ show: false, webPreferences: { preload: path.resolve(__dirname, '../../electron/preload.cjs'), contextIsolation: true, sandbox: true } });
  const wc = win.webContents;
  wc.on('will-prevent-unload', () => { blocked += 1; });
  watchWindow(win, { dialog, version: 'test', log: (text) => appendError(logDir, text), quit: () => { quits += 1; } });
  const reloaded = () => inTime(new Promise((r) => { wc.once('did-finish-load', r); }), 'the reload');
  /** The page now running, and whether it is a new one rather than the one marked before. */
  const page = async () => ({ title: await inTime(wc.executeJavaScript('document.title'), 'the page'), isNew: await wc.executeJavaScript('window.marked === undefined') });
  const asking = () => asked.splice(0);
  /** Input the page cannot take is what makes Chromium notice a stuck page, after about 16 s. */
  const untilNoticed = () => inTime(new Promise((r) => {
    const poke = setInterval(() => wc.sendInputEvent({ type: 'keyDown', keyCode: 'a' }), 1000);
    wc.once('unresponsive', () => { clearInterval(poke); r(); });
  }), 'the stuck page being noticed');
  const result = {};

  await win.loadURL(PAGE);
  result.logged = await wc.executeJavaScript("window.lvds.log.error('an entry from the page')");
  result.refused = await wc.executeJavaScript("window.lvds.log.error({ not: 'text' }).then(() => false, () => true)");
  await wc.executeJavaScript('window.marked = true');
  answers.push(0); // Reload
  let done = reloaded();
  wc.forcefullyCrashRenderer();
  await done;
  result.crash = { asked: asking(), ...await page() };

  // Busy for a while, then fine again: the question goes away by itself and the page is left alone.
  await wc.executeJavaScript('window.marked = true');
  wc.executeJavaScript('const until = Date.now() + 19000; while (Date.now() < until);').catch(() => {});
  await sleep(300);
  await untilNoticed();
  const answered = new Promise((r) => { wc.once('responsive', r); });
  const whileBusy = [...asked];
  await inTime(answered, 'the page answering again');
  await sleep(300);
  result.busy = { whileBusy, asked: asking(), ...await page() };

  // Really stuck: it answers nothing.
  wc.executeJavaScript('for (;;) {}').catch(() => {});
  await sleep(300);
  const stuck = await Promise.race([wc.executeJavaScript('1').then(() => false, () => false), sleep(1500).then(() => true)]);
  answers.push(1); // Reload
  done = reloaded();
  await untilNoticed();
  await done;
  result.hang = { stuck, asked: asking(), ...await page() };

  // Our own ending of that page asked nothing, but the next real crash does.
  await wc.executeJavaScript('window.marked = true');
  answers.push(0);
  done = reloaded();
  wc.forcefullyCrashRenderer();
  await done;
  result.nextCrash = { asked: asking(), ...await page() };

  const closed = new Promise((r) => { win.once('closed', r); });
  win.destroy();
  await inTime(closed, 'closing the window');
  await sleep(300);
  result.closed = { asked: asking() };
  result.quits = quits;
  result.blocked = blocked;

  fs.writeFileSync(output, JSON.stringify(result));
  app.exit(0);
}).catch((e) => {
  process.stderr.write(`${e && e.stack}\n`);
  app.exit(1);
});
