import { ColonyMember, ColonyTask, TaskPriority, TaskStatus, AgentRole } from '../types.js';
import { ColonyRegistry } from './colony-registry.js';
import { MessageBus } from '../message-bus.js';

export interface CreateTaskOptions {
  title: string;
  description: string;
  priority?: TaskPriority;
  requiredRole?: AgentRole;
  requiredCapabilities?: string[];
  dependencies?: string[];
  inputData?: Record<string, unknown>;
  consensusRequired?: boolean;
  minConsensusQuorum?: number;
}

/**
 * Orchestrator responsible for managing, scheduling, and delegating Colony tasks
 */
export class ColonyTaskOrchestrator {
  private tasks = new Map<string, ColonyTask>();
  private registry: ColonyRegistry;
  private messageBus: MessageBus;
  /** Orders the eligible candidates, best first. Without one, the least busy member goes first. */
  private ranker?: (task: ColonyTask, candidates: ColonyMember[]) => ColonyMember[];

  constructor(registry: ColonyRegistry, messageBus: MessageBus) {
    this.registry = registry;
    this.messageBus = messageBus;
  }

  public setRanker(ranker: ((task: ColonyTask, candidates: ColonyMember[]) => ColonyMember[]) | undefined): void {
    this.ranker = ranker;
  }

  public async createTask(options: CreateTaskOptions): Promise<ColonyTask> {
    const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const task: ColonyTask = {
      id,
      title: options.title,
      description: options.description,
      priority: options.priority || 'normal',
      status: 'pending',
      requiredRole: options.requiredRole,
      requiredCapabilities: options.requiredCapabilities || [],
      dependencies: options.dependencies || [],
      inputData: options.inputData || {},
      consensusRequired: options.consensusRequired ?? false,
      minConsensusQuorum: options.minConsensusQuorum ?? 2,
      createdAt: Date.now(),
    };

    this.tasks.set(id, task);

    await this.messageBus.publish('task:created', 'orchestrator', { task });

    // Attempt immediate assignment if dependencies are met
    await this.tryDispatchTask(id);

    return task;
  }

  public getTask(taskId: string): ColonyTask | undefined {
    return this.tasks.get(taskId);
  }

  public getAllTasks(): ColonyTask[] {
    return Array.from(this.tasks.values());
  }

  public snapshot(): ColonyTask[] {
    return structuredClone(this.getAllTasks());
  }

  public restore(tasks: ColonyTask[]): void {
    this.tasks.clear();
    for (const task of structuredClone(tasks)) {
      this.tasks.set(task.id, task);
    }
  }

  /**
   * Attempt to match a pending task with an available candidate in the Colony
   */
  public async tryDispatchTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') {
      return false;
    }

    // Check if dependencies are fulfilled
    if (task.dependencies && task.dependencies.length > 0) {
      const allCompleted = task.dependencies.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });
      if (!allCompleted) {
        return false;
      }
    }

    const candidates = this.registry.findCandidates({
      role: task.requiredRole,
      requiredCapabilities: task.requiredCapabilities,
    });

    if (candidates.length === 0) {
      return false;
    }

    const selectedAgent = (this.ranker ? this.ranker(task, candidates) : candidates)[0];
    if (!selectedAgent) {
      return false;
    }

    // Assign
    task.status = 'assigned';
    task.assignedAgentId = selectedAgent.id;
    task.startedAt = Date.now();

    this.registry.assignTask(selectedAgent.id, task.id);

    await this.messageBus.publish('task:assigned', 'orchestrator', {
      taskId: task.id,
      agentId: selectedAgent.id,
      role: selectedAgent.role,
    });

    return true;
  }

  /** Move an open task to another member (steal or handoff). The task keeps its status. */
  public async reassignTask(taskId: string, newAgentId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found`);
    if (!['assigned', 'in_progress', 'review', 'consensus'].includes(task.status)) {
      throw new Error(`Task '${taskId}' is ${task.status}, not open`);
    }
    const previous = task.assignedAgentId;
    if (previous) this.registry.completeTask(previous, taskId);
    task.assignedAgentId = newAgentId;
    this.registry.assignTask(newAgentId, taskId);
    await this.messageBus.publish('task:reassigned', 'orchestrator', { taskId, from: previous, to: newAgentId });
  }

  public async updateTaskProgress(
    taskId: string,
    agentId: string,
    status: 'in_progress' | 'review' | 'consensus'
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found`);

    task.status = status;
    await this.messageBus.publish(`task:${status}`, agentId, { taskId });
  }

  public async completeTask(taskId: string, agentId: string, outputResult?: unknown): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found`);

    task.status = 'completed';
    task.outputResult = outputResult;
    task.completedAt = Date.now();

    this.registry.completeTask(agentId, taskId);

    await this.messageBus.publish('task:completed', agentId, {
      taskId,
      outputResult,
    });

    // Check if any dependent tasks can now be dispatched
    for (const pendingTask of this.tasks.values()) {
      if (pendingTask.status === 'pending' && pendingTask.dependencies?.includes(taskId)) {
        await this.tryDispatchTask(pendingTask.id);
      }
    }
  }

  public async failTask(taskId: string, agentId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task '${taskId}' not found`);

    task.status = 'failed';
    task.error = error;
    task.completedAt = Date.now();

    this.registry.completeTask(agentId, taskId);

    await this.messageBus.publish('task:failed', agentId, { taskId, error });
  }
}
