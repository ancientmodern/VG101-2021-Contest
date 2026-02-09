#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
