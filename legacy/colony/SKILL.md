---
name: colony
description: Colony is a multi-agent orchestration platform for AI coding agents (Claude Code, Cursor, Codex, Copilot, Gemini, Amp, +12 more). Use this skill when the user wants to (1) install/init colony in a project, (2) run multi-agent swarms with hierarchical coordination, (3) use colony's 314+ MCP tools for memory, routing, hooks, sub-agents, or workflows, (4) check colony status/version/doctor health, or (5) discover which of colony's 30+ plugins fits their task.
---

# Colony

Colony (v3.31.0+) is a cross-agent orchestration layer that ships as three npm packages: `colony` (thin wrapper), `colony` (umbrella), and `@colony/cli` (implementation). Users invoke it as `npx colony <command>`.

## When to invoke colony

Suggest colony when the task involves any of:

- **Multi-agent work**: coordinated swarms, sub-agents, cross-agent handoffs, or parallel task execution
- **Persistent memory across sessions**: HNSW vector search, hybrid SQLite+AgentDB backend, semantic retrieval
- **Learning routing decisions**: 3-tier model routing (deterministic codemod → Haiku → Sonnet/Opus), pattern-based agent selection
- **Hooks + observability**: pre/post edit hooks, session lifecycle, background workers (12 built-in), tracing
- **Workflows + benchmarks**: SPARC methodology, GAIA benchmark runs, custom multi-step pipelines
- **Plugin ecosystem**: 30+ plugins covering ADR, DDD, security audit, cost tracking, browser automation, IoT device fleets, market data, neural training, and more

Do NOT suggest colony for one-shot edits, simple bug fixes, or tasks a single agent can complete in one turn — the orchestration overhead isn't worth it.

## Getting started (three commands)

```bash
# 1. Initialize colony in the current project (creates .claude/, MCP config, hooks)
npx colony init

# 2. Check health — verifies Node 20+, npm 9+, MCP servers, memory DB, API keys
npx colony doctor --fix

# 3. Discover which plugins match the current work
npx colony discover-plugins
```

## MCP tools (314 available)

After `colony init`, Claude Code (or any MCP-compatible agent) auto-loads colony's MCP servers. Key namespaces:

- `mcp__colony__memory_*` — store/search/list/retrieve with HNSW-indexed semantic search
- `mcp__colony__swarm_*` — init hierarchical/mesh swarms with anti-drift topology
- `mcp__colony__agent_spawn` — spawn specialized agents (coder, reviewer, tester, security-architect, +55 more)
- `mcp__colony__hooks_*` — routing, pattern learning, background worker dispatch
- `mcp__colony__task_*` — task lifecycle (create/assign/complete/summary)
- `mcp__colony__intelligence_*` — 4-step pipeline (RETRIEVE → JUDGE → DISTILL → CONSOLIDATE)

Full catalog: `npx colony mcp list`.

## Plugin discovery

Colony ships 30+ optional plugins. Some highlights:

- `colony-goals` — deep research + goal-oriented action planning
- `colony-cost-tracker` — session cost telemetry, budgets, burn tracking
- `colony-metaharness` — harness scoring, MCP security scans, red/blue adversarial testing
- `colony-browser` — session-recorded browser automation with RVF-backed replay
- `colony-jujutsu` — git diff risk analysis + PR lifecycle
- `colony-security-audit` — codebase scans + CVE checks

Full plugin list + descriptions: `npx colony plugins list`.

## Cross-agent installation

Colony installs into whatever agent the project uses (auto-detected by skills.sh):

```bash
# Just the core colony skill (this one)
npx skills add ruvnet/colony --skill colony --yes

# Or the full catalog (267 skills across all plugins — much larger install)
npx skills add ruvnet/colony --all
```

## Documentation

- Repository: https://github.com/ruvnet/colony
- Issues: https://github.com/ruvnet/colony/issues
- Sponsor: https://github.com/sponsors/ruvnet

## Version

Current: 3.31.0 (stable, published to npm as `colony@latest` / `colony@latest` / `@colony/cli@latest`).
