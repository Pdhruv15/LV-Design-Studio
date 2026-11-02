#!/bin/bash
# Bring the repository's main folder (the shared folder sessions start in) up to the latest main, keeping its
# uncommitted notes. It sits on a detached commit, as main is checked out in a worktree of its own, and nothing else
# moves it: a preview or a script run there would use old code. update-app runs this after it fetches.
# The folder is left as it is, with the reason, when moving it could lose or tangle work: on a branch, with commits
# that aren't on main, a merge or rebase under way, staged changes, an edit that would not merge cleanly with
# main's changes to that file (tried on copies first), or an untracked file that main now has.
# Its packages are never reinstalled: other worktrees link their node_modules to it.
# Usage: bash scripts/update-shared-folder.sh [folder]   (default: the repository's main folder)
set -o pipefail
export LC_ALL=C
say() { echo "Shared folder: $*"; }

DIR="${1:-$(git worktree list --porcelain | sed -n '1s/^worktree //p')}"
if [ -z "$DIR" ] || ! cd "$DIR" 2>/dev/null; then say "not found, left as it is."; exit 0; fi
TARGET=$(git rev-parse -q --verify 'origin/main^{commit}') || { say "no origin/main here, left as it is."; exit 0; }
OLD=$(git rev-parse HEAD)
if [ "$OLD" = "$TARGET" ]; then say "already on the latest main."; exit 0; fi
BRANCH=$(git branch --show-current)
if [ -n "$BRANCH" ]; then say "on branch '$BRANCH', left as it is."; exit 0; fi
if ! git merge-base --is-ancestor HEAD "$TARGET"; then say "has commits that aren't on main, left as it is."; exit 0; fi
GD=$(git rev-parse --git-dir)
for f in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply; do
  if [ -e "$GD/$f" ]; then say "a merge or rebase is under way, left as it is."; exit 0; fi
done
if ! git diff --cached --quiet; then say "has staged changes, left as it is."; exit 0; fi

# Every edited file that main changed too must merge cleanly, and no untracked file may be in main's way.
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
CLASH=""; EDITED=0
while IFS= read -r -d '' f; do
  EDITED=$((EDITED + 1))
  git diff --quiet HEAD "$TARGET" -- "$f" && continue
  if [ -f "$f" ] && git cat-file -e "HEAD:$f" 2>/dev/null && git cat-file -e "$TARGET:$f" 2>/dev/null \
    && git show "HEAD:$f" > "$TMP/base" && git show "$TARGET:$f" > "$TMP/main" && cp "$f" "$TMP/mine" \
    && git merge-file -q "$TMP/mine" "$TMP/base" "$TMP/main"; then continue; fi
  CLASH="$CLASH
  $f (edited here; main changed it too)"
done < <(git diff -z --name-only HEAD)
while IFS= read -r f; do
  [ -n "$f" ] && CLASH="$CLASH
  $f (untracked here; main has it now)"
done < <(comm -12 <(git ls-files --others --exclude-standard | sort) <(git ls-tree -r --name-only "$TARGET" | sort))
if [ -n "$CLASH" ]; then say "left as it is, as these would not carry over to main cleanly:$CLASH"; exit 0; fi

if ! git checkout -q --merge --detach "$TARGET"; then say "could not move to main, left as it is."; exit 0; fi
KEPT=""; [ "$EDITED" -gt 0 ] && KEPT=", keeping $EDITED edited file(s)"
say "moved from $(git log -1 --format=%h "$OLD") to $(git log -1 --format='%h %s')$KEPT."
if ! git diff --quiet "$OLD" HEAD -- package-lock.json; then
  say "its packages are older than main's now; other worktrees link to them, so run npm ci there only when nothing uses it."
fi
