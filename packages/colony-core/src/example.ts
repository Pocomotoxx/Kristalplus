import { z } from 'zod';
import { ColonyHub } from './colony-hub.js';
import { VectorCodex } from './memory/vector-codex.js';
import { ColonyToolRegistry } from './agents/tool-registry.js';
import { ColonyWorker } from './agents/colony-worker.js';
import { BUILTIN_AGENT_PROFILES } from './agents/agent-profiles.js';

async function main() {
  console.log('🚀 Initializing Full Kristal Colony Ecosystem...');
  
  const colony = new ColonyHub({ name: 'Kristal-Prime' });
  const codex = new VectorCodex();
  const toolRegistry = new ColonyToolRegistry();

  // 1. Register tools
  toolRegistry.register({
    name: 'code_linter',
    description: 'Validates code syntax and formatting standards',
    parameters: z.object({
      filePath: z.string(),
      rules: z.array(z.string()).optional(),
    }),
    async execute(params, ctx) {
      return {
        valid: true,
        file: params.filePath,
        checkedBy: ctx.agentId,
        issues: [],
      };
    },
  });

  console.log(`🔧 Registered tools:`, toolRegistry.listTools().map((t) => t.name).join(', '));

  // 2. Index domain guidelines into Vector Codex
  await codex.storeDocuments([
    {
      text: 'TypeScript guideline: Always use strict null checks, avoid "any", and export type-safe interfaces.',
      namespace: 'guidelines',
    },
    {
      text: 'Testing guideline: Every public orchestration method must have unit test assertions.',
      namespace: 'guidelines',
    },
  ]);

  // 3. Register member from profile and create ColonyWorker
  const coderProfile = BUILTIN_AGENT_PROFILES.coder;
  const coderMember = colony.registry.register({
    name: 'Echo-Coder',
    role: coderProfile.role,
    capabilities: {
      tools: coderProfile.capabilities,
      maxConcurrentTasks: coderProfile.maxConcurrentTasks,
    },
  });

  const worker = new ColonyWorker({
    member: coderMember,
    profile: coderProfile,
    tools: toolRegistry,
    codex,
  });

  // 4. Create and dispatch task
  const task = await colony.orchestrator.createTask({
    title: 'Implement Clean TypeScript Module',
    description: 'Ensure TypeScript guideline compliance for memory module',
    requiredRole: 'engineer',
  });

  console.log(`📋 Created task [${task.id}] assigned to: ${task.assignedAgentId}`);

  // 5. Worker executes task with automatic memory retrieval
  const executionResult = await worker.executeTask(task);
  console.log(`⚡ Worker executed task:`, executionResult);

  // 6. Test tool invocation
  const lintResult = await worker.executeTool('code_linter', {
    filePath: 'src/memory/vector-codex.ts',
  }, task.id);
  console.log(`🔍 Tool execution result:`, lintResult);

  // 7. Complete task in orchestrator
  await colony.orchestrator.completeTask(task.id, coderMember.id, executionResult.output);

  console.log('\n📊 Final Colony Snapshot:');
  console.log(JSON.stringify(colony.getSnapshot(), null, 2));
}

main().catch(console.error);
