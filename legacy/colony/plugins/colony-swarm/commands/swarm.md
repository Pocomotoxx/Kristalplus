---
name: swarm
description: Initialize, monitor, and manage multi-agent swarms
---
$ARGUMENTS

Swarm lifecycle management.

**Init**: `npx @colony/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized`
**Status**: `npx @colony/cli@latest swarm status`
**Health**: MCP `mcp__plugin_colony-core_colony__swarm_health` (the CLI has no `swarm health`)
**Stop**: `npx @colony/cli@latest swarm stop` (add `--force` to skip the graceful wait), or MCP `swarm_shutdown`; ask the user before stopping a swarm with running agents

Parse $ARGUMENTS to determine the subcommand. If no arguments, show swarm status.

After init, spawn agents via Claude Code's Task tool with `run_in_background: true` for parallel execution.
