// electron-builder hook. On Windows and Linux Electron's two licence texts stay beside the app; on a Mac electron-builder
// deletes them. This puts them inside the app, before it is signed, from the Electron download of the version being
// packaged. The Chromium list is gzipped: about 2 MB instead of 20 MB.

const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');

/** Writes the two texts into a Resources folder. read(name) gives a file of the Electron download. */
function writeNotices(resources, read) {
  writeFileSync(path.join(resources, 'LICENSE.electron.txt'), read('LICENSE'));
  writeFileSync(path.join(resources, 'LICENSES.chromium.html.gz'), gzipSync(read('LICENSES.chromium.html'), { level: 9 }));
}

/** A missing file stops the build: a package must not lose these without anyone noticing. */
async function afterPack({ electronPlatformName, appOutDir, arch, packager }) {
  if (electronPlatformName !== 'darwin') return;
  const { Arch } = require('electron-builder');
  const { downloadArtifact } = await import('@electron/get');
  const zip = await downloadArtifact({ version: packager.info.framework.version, artifactName: 'electron', platform: 'darwin', arch: Arch[arch] });
  const read = (name) => execFileSync('unzip', ['-p', zip, name], { maxBuffer: 64 * 1024 * 1024 });
  writeNotices(path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources'), read);
}

module.exports = { afterPack, writeNotices };
