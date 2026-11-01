import { MessageBus } from './message-bus.js';
import { ColonyRegistry } from './coordination/colony-registry.js';
import { ColonyTaskOrchestrator, CreateTaskOptions } from './coordination/colony-task-orchestrator.js';
import { ConsensusEngine } from './consensus/consensus-engine.js';
import { ClaimLedger } from './coordination/claim-ledger.js';
import { AuditLog } from './audit-log.js';
import { computeMemberStats } from './chief/member-stats.js';
import { rankMembers, Ranking, RankOptions } from './chief/scoring.js';
import { VectorCodex } from './memory/vector-codex.js';
import { MoERouter, RouteDecision } from './neural/moe-router.js';
import { ReasoningBank } from './neural/reasoning-bank.js';
import { ColonyEvent, ColonyMember, ColonyTask } from './types.js';

export interface ColonyHubConfig {
  name: string;
  maxEventHistory?: number;
  codex?: VectorCodex;
}

/**
 * ColonyHub - Unified entry point, orchestrator, and neural intelligence engine
 */
export class ColonyHub {
  public readonly name: string;
  public readonly bus: MessageBus;
  public readonly registry: ColonyRegistry;
  public readonly orchestrator: ColonyTaskOrchestrator;
  public readonly consensus: ConsensusEngine;
  public readonly claims: ClaimLedger;
  public readonly audit: AuditLog;
  public readonly codex: VectorCodex;
  public readonly router: MoERouter;
  public readonly reasoningBank: ReasoningBank;

  constructor(config: ColonyHubConfig = { name: 'KristalColony' }) {
    this.name = config.name;
    this.bus = new MessageBus(config.maxEventHistory || 2000);
    this.registry = new ColonyRegistry();
    this.orchestrator = new ColonyTaskOrchestrator(this.registry, this.bus);
    this.consensus = new ConsensusEngine(this.bus);
    this.claims = new ClaimLedger();
    this.audit = new AuditLog();
    this.codex = config.codex || new VectorCodex();
    this.router = new MoERouter();
    this.reasoningBank = new ReasoningBank(this.codex);

    // Wire automatic task completion learning loop
    this.bus.subscribe('task:completed', async (event: ColonyEvent<unknown>) => {
      const payload = event.payload as { taskId: string; outputResult?: any };
      const task = this.orchestrator.getTask(payload.taskId);
      if (task && task.outputResult) {
        await this.reasoningBank.recordPattern({
          problem: `${task.title}: ${task.description}`,
          solution: typeof task.outputResult === 'string' ? task.outputResult : JSON.stringify(task.outputResult),
          role: task.requiredRole || 'engineer',
          successScore: 1.0,
        });
      }
    });
    this.wireRouterLearning();

    // Dispatch picks by score instead of "least busy first".
    this.orchestrator.setRanker((task, candidates) => {
      const ranking = this.rankFor(task, candidates);
      const byId = new Map(candidates.map((m) => [m.id, m]));
      return ranking.ranked.map((s) => byId.get(s.memberId)!);
    });
  }

  /** Score the members for a task. `members` defaults to everyone in the colony. */
  public rankFor(task: ColonyTask, members: ColonyMember[] = this.registry.getAllMembers(), options?: RankOptions): Ranking {
    const stats = computeMemberStats(this.registry.getAllMembers(), this.orchestrator.getAllTasks(), this.claims.list());
    return rankMembers(task, members, stats, options);
  }

  /**
   * Outcome learning for the router. A completed task counts as +0.5 because "done" is what the host
   * reported, not a verified result; a failed task counts as -1.
   */
  private wireRouterLearning(): void {
    const learn = (taskId: string, reward: number) => {
      const task = this.orchestrator.getTask(taskId);
      if (task?.requiredRole) this.router.recordOutcome(`${task.title} ${task.description}`, task.requiredRole, reward);
    };
    this.bus.subscribe('task:completed', async (event: ColonyEvent<unknown>) => learn((event.payload as { taskId: string }).taskId, 0.5));
    this.bus.subscribe('task:failed', async (event: ColonyEvent<unknown>) => learn((event.payload as { taskId: string }).taskId, -1));
  }

  /**
   * Submit a task with automatic Neural MoE Routing if requiredRole is not explicitly provided
   */
  public async submitAdaptiveTask(options: CreateTaskOptions): Promise<{
    task: ColonyTask;
    routeDecision?: RouteDecision;
  }> {
    let routeDecision: RouteDecision | undefined;

    if (!options.requiredRole) {
      routeDecision = this.router.routeTask(`${options.title} ${options.description}`);
      options.requiredRole = routeDecision.targetRole;
    }

    const task = await this.orchestrator.createTask(options);
    return { task, routeDecision };
  }

  /**
   * Get an aggregated status snapshot of the colony
   */
  public getSnapshot(): {
    name: string;
    totalMembers: number;
    idleMembers: number;
    busyMembers: number;
    totalTasks: number;
    pendingTasks: number;
    activeTasks: number;
    completedTasks: number;
  } {
    const members = this.registry.getAllMembers();
    const tasks = this.orchestrator.getAllTasks();

    return {
      name: this.name,
      totalMembers: members.length,
      idleMembers: members.filter((m: ColonyMember) => m.status === 'idle').length,
      busyMembers: members.filter((m: ColonyMember) => m.status === 'busy').length,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter((t: ColonyTask) => t.status === 'pending').length,
      activeTasks: tasks.filter((t: ColonyTask) => t.status === 'assigned' || t.status === 'in_progress').length,
      completedTasks: tasks.filter((t: ColonyTask) => t.status === 'completed').length,
    };
  }
}
