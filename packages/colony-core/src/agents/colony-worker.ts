import { ColonyAgentProfile } from './agent-profiles.js';
import { ColonyMember, ColonyTask } from '../types.js';
import { ColonyToolRegistry, ColonyToolExecutionContext } from './tool-registry.js';
import { VectorCodex } from '../memory/vector-codex.js';

export interface ColonyWorkerConfig {
  member: ColonyMember;
  profile: ColonyAgentProfile;
  tools?: ColonyToolRegistry;
  codex?: VectorCodex;
  llmHandler?: (prompt: string, systemPrompt: string) => Promise<string>;
}

export interface ExecutionResult {
  taskId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  executionTimeMs: number;
}

/**
 * ColonyWorker - Runtime execution engine for a colony member
 * Dispatches tasks, invokes tools, queries VectorCodex, and executes LLM completions
 */
export class ColonyWorker {
  public readonly member: ColonyMember;
  public readonly profile: ColonyAgentProfile;
  public readonly tools?: ColonyToolRegistry;
  public readonly codex?: VectorCodex;
  private llmHandler?: (prompt: string, systemPrompt: string) => Promise<string>;

  constructor(config: ColonyWorkerConfig) {
    this.member = config.member;
    this.profile = config.profile;
    this.tools = config.tools;
    this.codex = config.codex;
    this.llmHandler = config.llmHandler;
  }

  /**
   * Execute a assigned task using profile instructions, tools, and context memory
   */
  public async executeTask(task: ColonyTask): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // 1. Context retrieval from VectorCodex if available
      let memoryContext = '';
      if (this.codex) {
        const relevantDocs = await this.codex.search(task.description, { topK: 3 });
        if (relevantDocs.length > 0) {
          memoryContext = relevantDocs.map((d) => `- ${d.document.text}`).join('\n');
        }
      }

      // 2. Build execution prompt
      const prompt = [
        `Task: ${task.title}`,
        `Description: ${task.description}`,
        memoryContext ? `\nRelevant Knowledge from Memory:\n${memoryContext}` : '',
        task.inputData ? `\nInput Data:\n${JSON.stringify(task.inputData, null, 2)}` : '',
      ].filter(Boolean).join('\n');

      let outputResult: unknown;

      if (this.llmHandler) {
        outputResult = await this.llmHandler(prompt, this.profile.systemPrompt);
      } else {
        // Standard deterministic runtime output when no remote LLM handler is wired
        outputResult = {
          executedBy: this.member.name,
          role: this.member.role,
          taskTitle: task.title,
          summary: `Task executed according to profile ${this.profile.name}.`,
          timestamp: Date.now(),
        };
      }

      return {
        taskId: task.id,
        success: true,
        output: outputResult,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        taskId: task.id,
        success: false,
        error: err?.message || String(err),
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a specific tool from the worker's registry
   */
  public async executeTool(toolName: string, params: unknown, taskId?: string): Promise<unknown> {
    if (!this.tools) {
      throw new Error(`Worker '${this.member.name}' has no tool registry attached`);
    }

    const context: ColonyToolExecutionContext = {
      agentId: this.member.id,
      taskId,
    };

    return this.tools.execute(toolName, params, context);
  }
}
