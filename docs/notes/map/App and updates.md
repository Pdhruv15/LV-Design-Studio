# App and updates
Mac arm64 Electron app.
Update: `npm run update-app` (compares GitHub main with installed version, `--force` to rebuild).
It also moves the shared folder (the repository's main folder, where sessions start) to the latest main, keeping its uncommitted notes. When that isn't safe it leaves the folder as it is and says why. It never reinstalls that folder's packages, because other worktrees link to them.
Code: `scripts/update-app.sh`, `scripts/update-shared-folder.sh`

Up: [[LV Design Studio]]
