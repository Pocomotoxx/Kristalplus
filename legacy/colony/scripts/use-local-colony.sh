#!/usr/bin/env bash
# Build the monorepo CLI and make the shell `colony` command use it.
#
# Usage (from repo root or anywhere):
#   ./scripts/use-local-colony.sh
#   ./scripts/use-local-colony.sh --skip-build   # only re-link
#
# After this:
#   which colony          → …/node_modules/colony → this repo's colony/bin/colony.js
#   colony --version
#   colony mcp tools | grep team_
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKIP_BUILD=0
for a in "$@"; do
  case "$a" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
  esac
done

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "==> Building @colony/cli (+ workspace deps)…"
  (cd "$ROOT/v3" && pnpm --filter @colony/cli... build)
else
  echo "==> Skipping build (--skip-build)"
fi

if [[ ! -f "$ROOT/v3/@colony/cli/dist/src/index.js" ]]; then
  echo "error: CLI dist missing — build failed or was skipped without dist" >&2
  exit 1
fi

echo "==> npm link colony wrapper → global PATH"
(cd "$ROOT/colony" && npm link)

# Prefer nvm/global node bin over older pnpm global colony if both exist
RUFL0_BIN="$(command -v colony || true)"
echo ""
echo "colony → ${RUFL0_BIN:-not found}"
if [[ -n "$RUFL0_BIN" ]]; then
  # Resolve symlink chain target when possible
  if command -v realpath >/dev/null 2>&1; then
    echo "target → $(realpath "$RUFL0_BIN" 2>/dev/null || true)"
  fi
  colony --version
  if colony mcp tools 2>/dev/null | grep -q 'team_create'; then
    echo "OK: team_* tools present (local ADR-402 surface)"
  else
    echo "warn: team_create not listed — check CLI dist / mcp tools" >&2
  fi
fi

echo ""
echo "Grok MCP: \`node $ROOT/v3/@colony/cli/bin/cli.js init --grok\` in a project writes this for you."
echo "To point an existing project .grok/config.toml [mcp_servers.colony] at this build:"
echo "  command = \"node\""
echo "  args = [\"$ROOT/v3/@colony/cli/bin/cli.js\", \"mcp\", \"start\"]"
echo "Then restart Grok."
