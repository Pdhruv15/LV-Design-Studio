# Electron licence files in the Mac package — decision

Found on 2026-11-01 while removing `node_modules` from the package.

| Package | `LICENSE.electron.txt` and `LICENSES.chromium.html` |
|---|---|
| Windows, Linux | next to the app |
| Mac | inside the `.app`, in `Contents/Resources`, since v2.024 |

The Mac app used to lack them: electron-builder deletes both files on a Mac, and Electron is a development dependency, so it never came with `node_modules`. The libraries compiled into the app are covered by `third-party-licences.md` in `dist` and `dist-electron` (see `NOTICE.md`).

**Decided by the user on 2026-11-01:** the Mac app carries them, with the Chromium list gzipped. `scripts/mac-licences.cjs` adds them from the Electron download of the version being packaged, and `scripts/check-package.mjs` fails a package without them. The Chromium list is 2.08 MB gzipped against 20.12 MB as it is, and the app grows from 253 MB to 255 MB.

Up: [[Future development]]
