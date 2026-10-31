import fs from 'node:fs/promises';
import path from 'node:path';
import { ColonyHub } from './colony-hub.js';
import { BUILTIN_AGENT_PROFILES } from './agents/agent-profiles.js';
import { ColonyWorker } from './agents/colony-worker.js';
import { VectorCodex } from './memory/vector-codex.js';
import { FileVectorStore } from './memory/file-vector-store.js';
import { GeminiLLMProvider, OpenAiCompatibleLLMProvider, ILLMProvider } from './llm/providers.js';

export interface GitHubExecutionPayload {
  taskTitle: string;
  taskDescription: string;
  role?: string;
  issueNumber?: number;
  prNumber?: number;
}

/**
 * Entry point for GitHub Actions & CI/CD Runner
 */
async function runFromGitHub(): Promise<void> {
  console.log('🤖 Starting Kristal Colony from GitHub Workspace...');

  // 1. Resolve workspace root and persistent memory
  const workspaceDir = process.cwd();
  const colonyDataDir = path.join(workspaceDir, '.colony');
  const memoryFilePath = path.join(colonyDataDir, 'memory.json');

  console.log(`📁 Workspace: ${workspaceDir}`);
  console.log(`💾 Memory path: ${memoryFilePath}`);

  const vectorStore = new FileVectorStore({ storagePath: memoryFilePath });
  const codex = new VectorCodex({ vectorStore });
  const colony = new ColonyHub({ name: 'Kristal-GitHub-Colony', codex });

  // 2. Select LLM Provider based on GitHub Secrets
  let llmProvider: ILLMProvider | undefined;
  if (process.env.GEMINI_API_KEY) {
    console.log('🔌 Connecting Google Gemini LLM Provider (GEMINI_API_KEY detected)...');
    llmProvider = new GeminiLLMProvider();
  } else if (process.env.OPENAI_API_KEY) {
    console.log('🔌 Connecting OpenAI Compatible LLM Provider (OPENAI_API_KEY detected)...');
    llmProvider = new OpenAiCompatibleLLMProvider();
  } else {
    console.log('ℹ️ No external LLM API key detected. Running in deterministic local execution mode.');
  }

  // 3. Register colony workers with LLM hook
  const workers = new Map<string, ColonyWorker>();

  for (const profile of Object.values(BUILTIN_AGENT_PROFILES)) {
    const member = colony.registry.register({
      name: `${profile.name}`,
      role: profile.role,
      capabilities: {
        tools: profile.capabilities,
        maxConcurrentTasks: profile.maxConcurrentTasks,
      },
    });

    const worker = new ColonyWorker({
      member,
      profile,
      codex,
      llmHandler: llmProvider
        ? (prompt, system) => llmProvider!.generateText(prompt, system)
        : undefined,
    });

    workers.set(member.id, worker);
  }

  console.log(`👥 Registered ${workers.size} specialized agents in the Colony.`);

  // 4. Read task payload from CLI arg, environment variable, or default issue trigger
  const taskTitle = process.env.COLONY_TASK_TITLE || process.argv[2] || 'Automated Repository Health & Architecture Audit';
  const taskDesc = process.env.COLONY_TASK_DESC || process.argv[3] || 'Audit codebase structure, review dependencies, and provide optimization feedback.';

  console.log(`\n📋 Processing task:\n  Title: "${taskTitle}"\n  Desc: "${taskDesc}"`);

  // 5. Submit adaptive task with Neural MoE Router
  const { task, routeDecision } = await colony.submitAdaptiveTask({
    title: taskTitle,
    description: taskDesc,
  });

  console.log(`🎯 Routed to role [${routeDecision?.targetRole}] (${((routeDecision?.confidence || 0) * 100).toFixed(0)}% confidence)`);
  console.log(`👤 Assigned to: ${task.assignedAgentId}`);

  // 6. Execute task
  const worker = workers.get(task.assignedAgentId!);
  if (!worker) {
    throw new Error(`Worker '${task.assignedAgentId}' not found.`);
  }

  console.log('⚡ Executing task with Colony Worker...');
  const result = await worker.executeTask(task);

  // 7. Complete task and write output artifact
  await colony.orchestrator.completeTask(task.id, worker.member.id, result.output);

  const outputDir = path.join(colonyDataDir, 'outputs');
  await fs.mkdir(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `${task.id}-result.json`);
  await fs.writeFile(outputFile, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`\n✅ Task completed successfully!`);
  console.log(`📄 Result saved to: ${outputFile}`);
  console.log(`\n📊 Result summary:`);
  console.log(typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2));
}

runFromGitHub().catch((err) => {
  console.error('❌ Colony Execution Failed:', err);
  process.exit(1);
});
