#!/usr/bin/env bash
# SquirrelMap Launcher Script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
exec /usr/bin/python3 "$SCRIPT_DIR/tray_launcher.py" "$@"
