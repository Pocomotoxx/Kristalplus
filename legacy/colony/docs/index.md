---
layout: default
title: Colony Marketplace
description: Claude Code native agents, swarms, workers, and MCP tools for continuous software engineering
---

# Colony Marketplace

**Installable agentic workflows for Claude Code -- not just commands.**

Colony provides native Claude Code plugins for multi-agent orchestration, /loop workers, security auditing, memory-powered RAG, and test generation.

## Quick Install

```bash
# Add the marketplace
/plugin marketplace add ruvnet/colony

# Install plugins
/plugin install colony-core@colony
/plugin install colony-swarm@colony
/plugin install colony-loop-workers@colony
```

## Plugins

| Plugin | Description | Install |
|--------|-------------|---------|
| **colony-core** | MCP server, base commands, project config | `/plugin install colony-core@colony` |
| **colony-swarm** | Teams, agents, Monitor streams, worktree isolation | `/plugin install colony-swarm@colony` |
| **colony-loop-workers** | /loop workers, CronCreate, cache-aware scheduling | `/plugin install colony-loop-workers@colony` |
| **colony-security-audit** | Security review, dependency checks, policy gates | `/plugin install colony-security-audit@colony` |
| **colony-rag-memory** | RuVector memory, HNSW search, AgentDB | `/plugin install colony-rag-memory@colony` |
| **colony-testgen** | Test gap detection, coverage analysis, TDD workflow | `/plugin install colony-testgen@colony` |
| **colony-docs** | Doc generation, drift detection, API docs | `/plugin install colony-docs@colony` |
| **colony-autopilot** | Autonomous /loop completion, learning, prediction | `/plugin install colony-autopilot@colony` |
| **colony-intelligence** | Self-learning SONA patterns, trajectory learning, routing | `/plugin install colony-intelligence@colony` |
| **colony-agentdb** | AgentDB controllers, HNSW vector search, RuVector | `/plugin install colony-agentdb@colony` |
| **colony-aidefence** | AI safety scanning, PII detection, prompt defense | `/plugin install colony-aidefence@colony` |
| **colony-browser** | Playwright browser automation, testing, scraping | `/plugin install colony-browser@colony` |
| **colony-jujutsu** | Git diff analysis, risk scoring, reviewer recs | `/plugin install colony-jujutsu@colony` |
| **colony-agent** | Sandboxed WASM agents and gallery sharing | `/plugin install colony-agent@colony` |
| **colony-workflows** | Workflow templates, orchestration, lifecycle | `/plugin install colony-workflows@colony` |
| **colony-daa** | Dynamic Agentic Architecture, cognitive patterns | `/plugin install colony-daa@colony` |
| **colony-ruvllm** | Local LLM inference, MicroLoRA, chat formatting | `/plugin install colony-ruvllm@colony` |
| **colony-rvf** | RVF portable memory, session persistence | `/plugin install colony-rvf@colony` |
| **colony-plugin-creator** | Scaffold, validate, publish new plugins | `/plugin install colony-plugin-creator@colony` |

## How It Works

Colony plugins extend Claude Code with:
- **Skills** -- Teach Claude Code new workflows (swarm init, /loop workers, security scans)
- **Commands** -- Slash commands for common operations (/status, /audit, /memory)
- **Agents** -- Specialized agent definitions (coder, reviewer, architect, security-auditor)
- **MCP Server** -- 314 tools for coordination, memory, neural learning, and more

## Claude Code Native Integration

Colony plugins use Claude Code's native capabilities when available:

| Feature | Plugin | Claude Code Native |
|---------|--------|--------------------|
| Periodic workers | colony-loop-workers | `/loop` + `ScheduleWakeup` |
| Live monitoring | colony-swarm | `Monitor` tool |
| Background jobs | colony-loop-workers | `CronCreate` |
| Agent isolation | colony-swarm | `isolation: "worktree"` |
| Multi-agent comms | colony-swarm | `TeamCreate` + `SendMessage` |
| Cross-session | colony-core | `PushNotification` + `RemoteTrigger` |
| Autonomous loops | colony-autopilot | `/loop` + `ScheduleWakeup` + autopilot MCP |

## Trust & Security

- All plugins are open source -- review before installing
- MCP servers run locally, no data leaves your machine
- Plugins declare required permissions in their manifest
- Pin versions for production use: `/plugin install colony-core@0.1.0@colony`
- Security scanning available via colony-security-audit
- Cryptographically-signed [witness manifest](../verification.md) attests every documented fix; see [Validation System](validation/) for the three-layer regression-protection stack

## Links

- [GitHub Repository](https://github.com/ruvnet/colony)
- [npm Packages](https://www.npmjs.com/package/@colony/cli)
- [ADR-091: Native Integration](https://github.com/ruvnet/colony/blob/main/v3/docs/adr/ADR-091-loop-monitor-native-integration.md)
- [Issues & Support](https://github.com/ruvnet/colony/issues)
