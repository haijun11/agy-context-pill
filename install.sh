#!/usr/bin/env bash
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.gemini/config/plugins/context-pill"
CFG="$HOME/.gemini/config/config.json"

echo "[1/2] Installing context-pill to $DEST ..."
mkdir -p "$DEST"
cp "$SRC/plugin.json" "$DEST/plugin.json"
rm -rf "$DEST/sidecars"
cp -R "$SRC/sidecars" "$DEST/sidecars"

echo "[2/2] Enabling context-pill in $CFG ..."
mkdir -p "$(dirname "$CFG")"
python3 - "$CFG" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
obj = {}
if p.exists():
    try:
        obj = json.loads(p.read_text(encoding='utf-8-sig') or '{}')
    except Exception:
        obj = {}
if not isinstance(obj, dict):
    obj = {}
plugins = obj.setdefault('plugins', {})
if not isinstance(plugins, dict):
    plugins = {}
    obj['plugins'] = plugins
plugins['context-pill'] = {'enabled': True}
p.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

echo
echo "Done! Launch Antigravity with:"
echo "  --remote-debugging-port=0 --remote-debugging-address=127.0.0.1"
