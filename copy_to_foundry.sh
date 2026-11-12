#!/bin/sh
# Copy the module into a local Foundry data folder (macOS default path). Quit Foundry first if packs changed.
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/FoundryVTT/Data/modules/pentra-edgeliner-foundry-vtt"
# If the module folder is a symlink to this project, Foundry already reads these files: nothing to copy.
if [ -L "$DEST" ] || [ "$(cd "$DEST" 2>/dev/null && pwd -P)" = "$SRC" ]; then
  echo "$DEST is linked to this folder already; nothing to copy. Just reload Foundry."
  exit 0
fi
if pgrep -f "Foundry Virtual Tabletop|FoundryVTT" >/dev/null 2>&1; then
  echo "Foundry is running: quit it completely (Cmd+Q) first, or the compendiums can be wiped."
  exit 1
fi
mkdir -p "$DEST"
cp -r module.json scripts templates lang css packs assets "$DEST"/
echo "Copied to $DEST"
