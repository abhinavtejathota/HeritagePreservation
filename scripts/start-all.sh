#!/usr/bin/env bash
# Heritage process manager — same flags as Python/ps1:
#   ./scripts/start-all.sh
#   ./scripts/start-all.sh --stop
#   ./scripts/start-all.sh --restart
#   ./scripts/start-all.sh --status
#   ./scripts/start-all.sh --build-frontend
#   ./scripts/start-all.sh --with-webgl --with-api-fallback

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ $# -eq 0 ]]; then
  exec python3 scripts/start_all.py --start
else
  exec python3 scripts/start_all.py "$@"
fi
