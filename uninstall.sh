#!/usr/bin/env bash
set -euo pipefail

DEST="$HOME/.gemini/config/plugins/context-pill"
CFG="$HOME/.gemini/config/config.json"

echo "[1/2] Removing context-pill from $CFG ..."
if [ -f "$CFG" ]; then
python3 - "$CFG" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
try:
    obj = json.loads(p.read_text(encoding='utf-8-sig') or '{}')
    if isinstance(obj, dict) and isinstance(obj.get('plugins'), dict):
        obj['plugins'].pop('context-pill', None)
        p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
except Exception:
    pass
PY
fi

echo "[2/2] Deleting $DEST ..."
rm -rf "$DEST"

echo
echo "Uninstalled! Restart Antigravity to finish cleanup."
