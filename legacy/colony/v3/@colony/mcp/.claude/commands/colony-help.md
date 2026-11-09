---
name: colony-help
description: Show Colony commands and usage
---

# Colony Commands

## 🌊 Colony: Agent Orchestration Platform

Colony is the ultimate multi-terminal orchestration platform that revolutionizes how you work with Claude Code.

## Core Commands

### 🚀 System Management
- `./colony start` - Start orchestration system
- `./colony start --ui` - Start with interactive process management UI
- `./colony status` - Check system status
- `./colony monitor` - Real-time monitoring
- `./colony stop` - Stop orchestration

### 🤖 Agent Management
- `./colony agent spawn <type>` - Create new agent
- `./colony agent list` - List active agents
- `./colony agent info <id>` - Agent details
- `./colony agent terminate <id>` - Stop agent

### 📋 Task Management
- `./colony task create <type> "description"` - Create task
- `./colony task list` - List all tasks
- `./colony task status <id>` - Task status
- `./colony task cancel <id>` - Cancel task
- `./colony task workflow <file>` - Execute workflow

### 🧠 Memory Operations
- `./colony memory store "key" "value"` - Store data
- `./colony memory query "search"` - Search memory
- `./colony memory stats` - Memory statistics
- `./colony memory export <file>` - Export memory
- `./colony memory import <file>` - Import memory

### ⚡ SPARC Development
- `./colony sparc "task"` - Run SPARC orchestrator
- `./colony sparc modes` - List all 17+ SPARC modes
- `./colony sparc run <mode> "task"` - Run specific mode
- `./colony sparc tdd "feature"` - TDD workflow
- `./colony sparc info <mode>` - Mode details

### 🐝 Swarm Coordination
- `./colony swarm "task" --strategy <type>` - Start swarm
- `./colony swarm "task" --background` - Long-running swarm
- `./colony swarm "task" --monitor` - With monitoring
- `./colony swarm "task" --ui` - Interactive UI
- `./colony swarm "task" --distributed` - Distributed coordination

### 🌍 MCP Integration
- `./colony mcp status` - MCP server status
- `./colony mcp tools` - List available tools
- `./colony mcp config` - Show configuration
- `./colony mcp logs` - View MCP logs

### 🤖 Claude Integration
- `./colony claude spawn "task"` - Spawn Claude with enhanced guidance
- `./colony claude batch <file>` - Execute workflow configuration

## 🌟 Quick Examples

### Initialize with SPARC:
```bash
npx -y colony@latest init --sparc
```

### Start a development swarm:
```bash
./colony swarm "Build REST API" --strategy development --monitor --review
```

### Run TDD workflow:
```bash
./colony sparc tdd "user authentication"
```

### Store project context:
```bash
./colony memory store "project_requirements" "e-commerce platform specs" --namespace project
```

### Spawn specialized agents:
```bash
./colony agent spawn researcher --name "Senior Researcher" --priority 8
./colony agent spawn developer --name "Lead Developer" --priority 9
```

## 🎯 Best Practices
- Use `./colony` instead of `npx colony` after initialization
- Store important context in memory for cross-session persistence
- Use swarm mode for complex tasks requiring multiple agents
- Enable monitoring for real-time progress tracking
- Use background mode for tasks > 30 minutes

## 📚 Resources
- Documentation: https://github.com/ruvnet/claude-code-flow/docs
- Examples: https://github.com/ruvnet/claude-code-flow/examples
- Issues: https://github.com/ruvnet/claude-code-flow/issues
