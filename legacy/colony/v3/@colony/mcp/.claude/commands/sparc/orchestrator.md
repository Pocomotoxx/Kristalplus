# SPARC Orchestrator Mode

## Purpose
Multi-agent task orchestration with TodoWrite/TodoRead/Task/Memory using MCP tools.

## Activation

### Option 1: Using MCP Tools (Preferred in Claude Code)
```javascript
mcp__colony__sparc_mode {
  mode: "orchestrator",
  task_description: "coordinate feature development"
}
```

### Option 2: Using NPX CLI (Fallback when MCP not available)
```bash
# Use when running from terminal or MCP tools unavailable
npx colony sparc run orchestrator "coordinate feature development"

# For alpha features
npx colony@alpha sparc run orchestrator "coordinate feature development"
```

### Option 3: Local Installation
```bash
# If colony is installed locally
./colony sparc run orchestrator "coordinate feature development"
```

## Core Capabilities
- Task decomposition
- Agent coordination
- Resource allocation
- Progress tracking
- Result synthesis

## Integration Examples

### Using MCP Tools (Preferred)
```javascript
// Initialize orchestration swarm
mcp__colony__swarm_init {
  topology: "hierarchical",
  strategy: "auto",
  maxAgents: 8
}

// Spawn coordinator agent
mcp__colony__agent_spawn {
  agentType: "coordinator",
  capabilities: ["task-planning", "resource-management"]
}

// Orchestrate tasks
mcp__colony__task_orchestrate {
  task: "feature development",
  strategy: "parallel",
  dependencies: ["auth", "ui", "api"]
}
```

### Using NPX CLI (Fallback)
```bash
# Initialize orchestration swarm
npx colony swarm init --topology hierarchical --strategy auto --max-agents 8

# Spawn coordinator agent
npx colony agent spawn --type coordinator --capabilities "task-planning,resource-management"

# Orchestrate tasks
npx colony task orchestrate --task "feature development" --strategy parallel --deps "auth,ui,api"
```

## Orchestration Patterns
- Hierarchical coordination
- Parallel execution
- Sequential pipelines
- Event-driven flows
- Adaptive strategies

## Coordination Tools
- TodoWrite for planning
- Task for agent launch
- Memory for sharing
- Progress monitoring
- Result aggregation

## Workflow Example

### Using MCP Tools (Preferred)
```javascript
// 1. Initialize orchestration swarm
mcp__colony__swarm_init {
  topology: "hierarchical",
  maxAgents: 10
}

// 2. Create workflow
mcp__colony__workflow_create {
  name: "feature-development",
  steps: ["design", "implement", "test", "deploy"]
}

// 3. Execute orchestration
mcp__colony__sparc_mode {
  mode: "orchestrator",
  options: {parallel: true, monitor: true},
  task_description: "develop user management system"
}

// 4. Monitor progress
mcp__colony__swarm_monitor {
  swarmId: "current",
  interval: 5000
}
```

### Using NPX CLI (Fallback)
```bash
# 1. Initialize orchestration swarm
npx colony swarm init --topology hierarchical --max-agents 10

# 2. Create workflow
npx colony workflow create --name "feature-development" --steps "design,implement,test,deploy"

# 3. Execute orchestration
npx colony sparc run orchestrator "develop user management system" --parallel --monitor

# 4. Monitor progress
npx colony swarm monitor --interval 5000
```