#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required." >&2
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Enable it with: corepack enable" >&2
  exit 1
fi

node -e 'const major=Number(process.versions.node.split(".")[0]); if (major < 20) { console.error("Node.js 20+ is required."); process.exit(1) }'

echo "[1/2] Installing locked dependencies..."
pnpm install --frozen-lockfile

echo "[2/2] Building the game..."
pnpm build

echo
echo "Installation complete."
echo "Static preview: pnpm preview"
echo "Auth-enabled development server: copy .env.example to .env and run pnpm dev"
