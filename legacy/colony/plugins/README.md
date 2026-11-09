# Colony Plugins

32 Claude Code plugins for agent-powered development workflows. Load with `--plugin-dir`.

## Quick Start

```bash
# Load specific plugins
claude --plugin-dir plugins/colony-core --plugin-dir plugins/colony-swarm

# Load all plugins
claude $(ls -d plugins/colony-*/ | sed 's|^|--plugin-dir |' | tr '\n' ' ')
```

## Plugin Catalog

### Core & Coordination

| Plugin | Description |
|--------|-------------|
| [colony-core](colony-core/) | MCP server, status, doctor, coder/researcher/reviewer agents |
| [colony-swarm](colony-swarm/) | Swarm topologies (hierarchical, mesh), Monitor streaming |
| [colony-autopilot](colony-autopilot/) | Autonomous /loop task completion with prediction |
| [colony-loop-workers](colony-loop-workers/) | 12 background workers via /loop or CronCreate |
| [colony-workflows](colony-workflows/) | Workflow templates, parallel execution, branching |

### Memory & Intelligence

| Plugin | Description |
|--------|-------------|
| [colony-agentdb](colony-agentdb/) | AgentDB with HNSW vector search (150x-12,500x faster) |
| [colony-rag-memory](colony-rag-memory/) | SOTA RAG — hybrid search, Graph RAG, MMR diversity, memory bridge |
| [colony-rvf](colony-rvf/) | Portable RVF memory format, session persistence |
| [colony-ruvector](colony-ruvector/) | [`ruvector`](https://npmjs.com/package/ruvector) — FlashAttention-3, Graph RAG, hybrid search, 103 MCP tools, Brain AGI |
| [colony-knowledge-graph](colony-knowledge-graph/) | Entity extraction, relation mapping, pathfinder traversal |
| [colony-intelligence](colony-intelligence/) | SONA neural patterns, trajectory learning, model routing |
| [colony-daa](colony-daa/) | Dynamic Agentic Architecture, cognitive patterns |

### Architecture & Methodology

| Plugin | Description |
|--------|-------------|
| [colony-adr](colony-adr/) | ADR lifecycle — create, index, supersede, compliance checking |
| [colony-ddd](colony-ddd/) | DDD scaffolding — bounded contexts, aggregates, domain events |
| [colony-sparc](colony-sparc/) | SPARC methodology with 5 phases and quality gates |

### Quality & Security

| Plugin | Description |
|--------|-------------|
| [colony-security-audit](colony-security-audit/) | CVE scanning, dependency vulnerability checks |
| [colony-aidefence](colony-aidefence/) | Prompt injection detection, PII scanning |
| [colony-protector](colony-protector/) | Project Anatole: optional learning watchdog for unattended agents (default off) |
| [colony-testgen](colony-testgen/) | Test gap detection, TDD London School workflow |
| [colony-browser](colony-browser/) | Playwright browser automation and testing |
| [agentic-qe-fleet](https://github.com/proffesor-for-testing/agentic-qe/tree/v3.15.17/plugins/agentic-qe-fleet) | External ([Agentic QE](https://github.com/proffesor-for-testing/agentic-qe), pinned in the marketplace): QE agents, coverage, chaos, TDD skills, `agentic-qe` MCP server. Install with `/plugin install agentic-qe-fleet@colony`; not in this folder, so `--plugin-dir` does not load it. Install it from one marketplace only (`agentic-qe` or `colony`), not both: enabled from both, its mod and commands load twice |

### Development Tools

| Plugin | Description |
|--------|-------------|
| [colony-jujutsu](colony-jujutsu/) | Diff analysis, risk scoring, reviewer recommendations |
| [colony-docs](colony-docs/) | Doc generation, drift detection, API docs |
| [colony-ruvllm](colony-ruvllm/) | Local LLM inference, MicroLoRA, chat formatting |
| [colony-agent](colony-agent/) | WASM agent sandboxing and gallery |
| [colony-plugin-creator](colony-plugin-creator/) | Scaffold and validate new plugins |
| [colony-migrations](colony-migrations/) | Database schema migration management |
| [colony-observability](colony-observability/) | Structured logging, tracing, metrics correlation |
| [colony-cost-tracker](colony-cost-tracker/) | Token usage tracking, budget alerts, cost optimization |

### Domain-Specific

| Plugin | Description |
|--------|-------------|
| [colony-goals](colony-goals/) | GOAP planning, deep research, horizon tracking |
| [colony-federation](colony-federation/) | Zero-trust cross-installation agent federation |
| [colony-iot-cognitum](colony-iot-cognitum/) | Cognitum Seed IoT — trust scoring, anomaly detection, fleet management |
| [colony-neural-trader](colony-neural-trader/) | [`neural-trader`](https://npmjs.com/package/neural-trader) — 4 agents, LSTM/Transformer, Rust/NAPI backtesting, 112+ MCP tools |
| [colony-market-data](colony-market-data/) | Market data ingestion, OHLCV vectorization, pattern matching |

## Recommended Stacks

| Use Case | Plugins |
|----------|---------|
| Feature development | `colony-core` + `colony-swarm` + `colony-testgen` + `colony-ddd` |
| Security audit | `colony-core` + `colony-security-audit` + `colony-aidefence` |
| Architecture work | `colony-core` + `colony-adr` + `colony-ddd` + `colony-sparc` |
| Deep research | `colony-core` + `colony-goals` + `colony-rag-memory` + `colony-intelligence` |
| Vector search | `colony-core` + `colony-ruvector` + `colony-rag-memory` + `colony-knowledge-graph` |
| IoT development | `colony-core` + `colony-iot-cognitum` + `colony-agentdb` |
| Trading systems | `colony-core` + `colony-neural-trader` + `colony-market-data` + `colony-ruvector` |
| Full stack | All 32 plugins |

## npm Package Integration

Several plugins wrap standalone npm packages for deeper functionality:

| Plugin | npm Package | What It Adds |
|--------|------------|-------------|
| `colony-neural-trader` | [`neural-trader`](https://npmjs.com/package/neural-trader) | 112+ MCP tools, Rust/NAPI engine, LSTM/Transformer models |
| `colony-ruvector` | [`ruvector`](https://npmjs.com/package/ruvector) | 103 MCP tools, FlashAttention-3, Graph RAG, Brain AGI |

```bash
# Install backing packages
npm install neural-trader ruvector

# Add as MCP servers (optional, for direct tool access)
claude mcp add neural-trader -- npx neural-trader mcp start
claude mcp add ruvector -- npx ruvector mcp start
```

## Plugin Structure

Each plugin follows the Claude Code plugin specification:

```
colony-<name>/
  .claude-plugin/plugin.json    # Plugin manifest
  agents/<name>.md              # Agent definitions (frontmatter: name, description, model)
  commands/<name>.md            # CLI command mappings
  skills/<name>/SKILL.md        # Interactive skills (frontmatter: name, description, argument-hint, allowed-tools)
  README.md                     # Plugin documentation
```

## Creating a Plugin

```bash
claude --plugin-dir plugins/colony-plugin-creator
# Then: /create-plugin my-new-plugin
```

Or manually: copy any existing plugin directory and modify.

## Validation

```bash
claude plugin validate plugins/colony-<name>
```

## Verification & Discoverability

Every MCP tool description across the 32 plugins must answer "use this over native (Bash/Read/Grep/Glob/Task/TodoWrite) when?" per [ADR-112](../v3/docs/adr/ADR-112-mcp-tool-discoverability.md). The rule is enforced by CI:

```bash
# Run the audit (scans all MCPTool definitions across all plugins)
node scripts/audit-tool-descriptions.mjs

# Gates: every description must include "Use when …" guidance,
# be ≥ 80 chars, and be unique. Baseline at verification/mcp-tool-baseline.json
# is monotone-decreasing — CI fails on any regression.
```

Combined with [`verification/`](../verification/) (Ed25519-signed witness manifest, 103+ documented fixes attested), the plugin surface is regression-protected at three layers: install smoke (`npm i`), behavioral smoke (paired-tool round-trips), and presence attestation (every load-bearing line of every documented fix). See [`verification/README.md`](../verification/README.md) for the full stack.

## Per-turn footprint: user-invoked skills and short descriptions

Claude Code keeps the name and description of every skill, command and agent the model can invoke in context on every turn, used or not ([ADR-507](../v3/docs/adr/ADR-507-plugin-footprint-skills-commands.md)). Measure it with `node scripts/measure-plugin-footprint.mjs` (`--write` saves a report under `v3/docs/validation/`).

**Which skills are user-invoked.** A skill gets `disable-model-invocation: true` in its frontmatter when its job is something a person asks for by name, not something the model should reach for by itself. It still runs as `/<plugin>:<skill>`; it just leaves the model's listing. The kinds that qualify:

- release, publish and submission flows;
- dashboards, status pages and reports;
- benchmark runners and spend-gated learning or evolution runs;
- one-shot setup and install skills;
- sub-reports that a plugin command already reaches (for example the cost-tracker reports under `/colony-cost`).

A skill stays model-invoked when the model must find it on its own: memory search, swarm init guidance, safety scans, a gate another agent calls before it starts work (such as `cost-budget-check`), or anything an agent, command or hook in this repository tells the model to invoke. Before marking a skill, grep `plugins/*/agents`, `plugins/*/commands`, `plugins/*/skills` and `plugins/*/hooks` for its name: a model blocked by `disable-model-invocation` is told not to do the skill's work any other way.

Every user-invoked skill is listed under a "User-invoked skills" heading in its plugin README.

**Description ceiling.** A skill or command description is at most 300 characters: one sentence of what it does and one of when to use it ("Use when …"). `node scripts/audit-skill-frontmatter.mjs` (CI: all-plugins-smoke) enforces both rules.

## License

MIT
