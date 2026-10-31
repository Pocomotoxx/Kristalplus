import path from 'node:path';
import { parseArgs } from 'node:util';
import { BUILTIN_AGENT_PROFILES } from '../agents/agent-profiles.js';
import type { AgentRole, ColonyMember, ColonyTask, TaskPriority } from '../types.js';
import { ColonySession, resolveRevision } from './session.js';

export interface CommandResult {
  code: number;
  output: unknown;
}

class CliError extends Error {
  constructor(message: string, public readonly code = 1) {
    super(message);
  }
}

const ROLES: AgentRole[] = ['director', 'architect', 'engineer', 'reviewer', 'tester', 'analyst', 'security', 'custom'];
const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'critical'];
const PRIORITY_RANK: Record<TaskPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
const OPEN_STATUSES = ['assigned', 'in_progress', 'review', 'consensus'];

export const USAGE = `colony <command> [options]    (every command prints JSON; run \`colony boot\` first)

  boot                                    load the colony, report boot status, print the work protocol
  status                                  members, tasks, open proposals
  task add <title> <description>          [--role R] [--after id,id] [--priority P] [--consensus QUORUM]
  next --as <role|memberId>               take the next task for that role (with memory context)
  done <taskId> --result <text>           complete a task; a real, non-empty result is required
  fail <taskId> --error <text>            mark a task failed
  propose <taskId> <topic> --as <member>  [--quorum N] [--timeout-min M] [--data text]
  vote <proposalId> --as <member> (--approve|--reject) --reason <text> [--confidence 0..1]
  memory add <text>                       [--ns NAMESPACE]
  memory search <query>                   [--k N] [--ns NAMESPACE]

Global: --dir <path>  project directory (default: current directory)`;

const PROTOCOL = [
  'You (the host) are the model: the colony keeps the ledger, the routing, the votes and the memory.',
  'Take work only through `next`; do the work yourself; report it with `done` or `fail`.',
  '`done` needs a real result. Never invent a result, a vote reason or a memory entry.',
  'A task with consensus needs an approved proposal before `done`; vote with a concrete reason.',
  'Boot status UNVERIFIABLE means the git revision is unknown: content work is allowed, repository mutation is not.',
  'Boot proves the colony state was read and validated. It does not prove that you applied these rules.',
];

function resolveMembers(session: ColonySession, who: string | undefined): ColonyMember[] {
  if (!who) throw new CliError('--as <role|memberId> is required');
  const all = session.hub.registry.getAllMembers();
  const byId = all.find((m) => m.id === who);
  const members = byId ? [byId] : all.filter((m) => m.role === who);
  if (members.length === 0) throw new CliError(`no member or role '${who}'`);
  return members;
}

const serializeProposal = (p: { votes: Map<string, unknown> }) => ({ ...p, votes: Array.from(p.votes.values()) });

function summarizeTask(t: ColonyTask) {
  return { id: t.id, title: t.title, status: t.status, priority: t.priority, assignedAgentId: t.assignedAgentId, dependencies: t.dependencies };
}

export async function runCommand(argv: string[], cwd: string): Promise<CommandResult> {
  try {
    return await dispatch(argv, cwd);
  } catch (err: any) {
    return { code: err instanceof CliError ? err.code : 1, output: { ok: false, error: err.message } };
  }
}

async function dispatch(argv: string[], cwd: string): Promise<CommandResult> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        dir: { type: 'string' },
        as: { type: 'string' },
        role: { type: 'string' },
        after: { type: 'string' },
        priority: { type: 'string' },
        consensus: { type: 'string' },
        quorum: { type: 'string' },
        'timeout-min': { type: 'string' },
        data: { type: 'string' },
        result: { type: 'string' },
        error: { type: 'string' },
        reason: { type: 'string' },
        confidence: { type: 'string' },
        approve: { type: 'boolean' },
        reject: { type: 'boolean' },
        ns: { type: 'string' },
        k: { type: 'string' },
        help: { type: 'boolean' },
      },
    });
  } catch (err: any) {
    throw new CliError(`${err.message}\n${USAGE}`);
  }

  const { values, positionals } = parsed;
  const dir = path.resolve(cwd, values.dir ?? '.');
  const [command, sub] = positionals;

  if (!command || command === 'help' || values.help) return { code: 0, output: { ok: true, usage: USAGE } };

  if (command === 'boot') {
    const { record, session } = await ColonySession.boot(dir);
    const ok = record.status !== 'BLOCKED';
    return {
      code: ok ? 0 : 2,
      output: {
        ok,
        boot: record,
        ...(session ? { colony: session.hub.getSnapshot(), roles: Object.values(BUILTIN_AGENT_PROFILES).map((p) => p.role) } : {}),
        protocol: PROTOCOL,
      },
    };
  }

  const boot = await ColonySession.readBootRecord(dir);
  if (!boot || boot.status === 'BLOCKED') {
    throw new CliError(boot ? `last boot was BLOCKED: ${boot.problems.join('; ')}` : 'colony is not booted: run `colony boot`', 2);
  }
  const warnings: string[] = [];
  if (resolveRevision(dir).sha !== boot.revision) warnings.push('git revision changed since boot; run `colony boot` again');

  const session = await ColonySession.open(dir);
  const { hub } = session;
  const reply = (output: Record<string, unknown>): CommandResult => ({ code: 0, output: { ok: true, ...output, ...(warnings.length ? { warnings } : {}) } });

  switch (command) {
    case 'status': {
      const tasks = hub.orchestrator.getAllTasks();
      return reply({
        colony: hub.getSnapshot(),
        members: hub.registry.getAllMembers().map((m) => ({ id: m.id, role: m.role, status: m.status, tasks: m.currentTaskIds })),
        tasks: tasks.map(summarizeTask),
        openProposals: hub.consensus.listProposals().filter((p) => p.status === 'open').map(serializeProposal),
      });
    }

    case 'task': {
      if (sub !== 'add') throw new CliError('usage: task add <title> <description>');
      const [, , title, description] = positionals;
      if (!title || !description) throw new CliError('task add needs a title and a description');
      if (values.role && !ROLES.includes(values.role as AgentRole)) throw new CliError(`unknown role '${values.role}'`);
      if (values.priority && !PRIORITIES.includes(values.priority as TaskPriority)) throw new CliError(`unknown priority '${values.priority}'`);
      const dependencies = values.after ? values.after.split(',').map((s) => s.trim()).filter(Boolean) : [];
      for (const dep of dependencies) {
        if (!hub.orchestrator.getTask(dep)) throw new CliError(`unknown dependency '${dep}'`);
      }
      const quorum = values.consensus ? Number(values.consensus) : undefined;
      if (quorum !== undefined && (!Number.isInteger(quorum) || quorum < 1)) throw new CliError('--consensus must be a positive integer');

      const { task, routeDecision } = await hub.submitAdaptiveTask({
        title,
        description,
        requiredRole: values.role as AgentRole | undefined,
        priority: values.priority as TaskPriority | undefined,
        dependencies,
        consensusRequired: quorum !== undefined,
        minConsensusQuorum: quorum,
      });
      await session.save();
      return reply({ task: summarizeTask(task), requiredRole: task.requiredRole, routed: routeDecision ? true : false });
    }

    case 'next': {
      const members = resolveMembers(session, values.as);
      const ids = new Set(members.map((m) => m.id));
      for (const t of hub.orchestrator.getAllTasks()) {
        if (t.status === 'pending') await hub.orchestrator.tryDispatchTask(t.id);
      }
      const mine = hub.orchestrator
        .getAllTasks()
        .filter((t) => (t.status === 'assigned' || t.status === 'in_progress') && t.assignedAgentId && ids.has(t.assignedAgentId))
        .sort(
          (a, b) =>
            Number(b.status === 'in_progress') - Number(a.status === 'in_progress') ||
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            a.createdAt - b.createdAt
        );
      const task = mine[0];
      if (!task) {
        await session.save();
        return reply({ task: null, reason: 'no task is assigned to this role right now' });
      }
      const member = hub.registry.getMember(task.assignedAgentId!)!;
      if (task.status === 'assigned') await hub.orchestrator.updateTaskProgress(task.id, member.id, 'in_progress');
      const profile = Object.values(BUILTIN_AGENT_PROFILES).find((p) => p.id === member.metadata?.profileId);
      const memory = await hub.codex.search(`${task.title} ${task.description}`, { topK: 3, minScore: 0.1 });
      await session.save();
      return reply({
        task: hub.orchestrator.getTask(task.id),
        member: { id: member.id, role: member.role },
        instructions: profile?.systemPrompt ?? null,
        memoryContext: memory.map((r) => ({ id: r.document.id, namespace: r.document.namespace, text: r.document.text, score: r.score })),
      });
    }

    case 'done':
    case 'fail': {
      const taskId = sub;
      const task = taskId ? hub.orchestrator.getTask(taskId) : undefined;
      if (!task) throw new CliError(`task '${taskId ?? ''}' not found`);
      if (!OPEN_STATUSES.includes(task.status)) throw new CliError(`task '${task.id}' is ${task.status}, not open`);
      const agentId = task.assignedAgentId!;

      if (command === 'fail') {
        if (!values.error?.trim()) throw new CliError('--error <text> is required');
        await hub.orchestrator.failTask(task.id, agentId, values.error);
        await session.save();
        return reply({ task: summarizeTask(hub.orchestrator.getTask(task.id)!) });
      }

      if (!values.result?.trim()) throw new CliError('--result <text> is required and must not be empty');
      if (task.consensusRequired && !hub.consensus.listProposals().some((p) => p.taskId === task.id && p.status === 'approved')) {
        throw new CliError(`task '${task.id}' requires an approved consensus proposal first`);
      }
      const before = new Map(hub.orchestrator.getAllTasks().map((t) => [t.id, t.status]));
      await hub.orchestrator.completeTask(task.id, agentId, values.result);
      const unblocked = hub.orchestrator.getAllTasks().filter((t) => before.get(t.id) === 'pending' && t.status === 'assigned');
      await session.save();
      return reply({ task: summarizeTask(hub.orchestrator.getTask(task.id)!), unblocked: unblocked.map(summarizeTask) });
    }

    case 'propose': {
      const [, , topic] = positionals;
      const task = sub ? hub.orchestrator.getTask(sub) : undefined;
      if (!task) throw new CliError(`task '${sub ?? ''}' not found`);
      if (!topic) throw new CliError('propose needs a topic');
      const [proposer] = resolveMembers(session, values.as);
      const quorum = values.quorum ? Number(values.quorum) : task.minConsensusQuorum;
      const timeoutMin = values['timeout-min'] ? Number(values['timeout-min']) : 60;
      if (quorum !== undefined && (!Number.isInteger(quorum) || quorum < 1)) throw new CliError('--quorum must be a positive integer');
      if (!(timeoutMin > 0)) throw new CliError('--timeout-min must be positive');

      const proposal = await hub.consensus.submitProposal({
        taskId: task.id,
        proposerId: proposer.id,
        topic,
        data: values.data ?? null,
        quorum,
        timeoutMs: timeoutMin * 60_000,
      });
      await hub.orchestrator.updateTaskProgress(task.id, proposer.id, 'consensus');
      await session.save();
      return reply({ proposal: serializeProposal(proposal) });
    }

    case 'vote': {
      if (values.approve === values.reject) throw new CliError('pass exactly one of --approve or --reject');
      if (!values.reason?.trim()) throw new CliError('--reason <text> is required');
      const confidence = values.confidence === undefined ? 1 : Number(values.confidence);
      if (!(confidence >= 0 && confidence <= 1)) throw new CliError('--confidence must be between 0 and 1');
      if (!sub) throw new CliError('usage: vote <proposalId> --as <member> ...');
      const [voter] = resolveMembers(session, values.as);
      const proposal = await hub.consensus.castVote(sub, { voterId: voter.id, approve: Boolean(values.approve), confidence, reason: values.reason });
      await session.save();
      return reply({ proposal: serializeProposal(proposal) });
    }

    case 'memory': {
      const text = positionals[2];
      if (sub === 'add') {
        if (!text?.trim()) throw new CliError('memory add needs non-empty text');
        const [doc] = await hub.codex.storeDocuments([{ text, namespace: values.ns }]);
        return reply({ id: doc.id, namespace: doc.namespace ?? null });
      }
      if (sub === 'search') {
        if (!text?.trim()) throw new CliError('memory search needs a query');
        const k = values.k ? Number(values.k) : 5;
        if (!Number.isInteger(k) || k < 1) throw new CliError('--k must be a positive integer');
        const results = await hub.codex.search(text, { topK: k, namespace: values.ns });
        return reply({ results: results.map((r) => ({ id: r.document.id, namespace: r.document.namespace, text: r.document.text, score: r.score })) });
      }
      throw new CliError('usage: memory add <text> | memory search <query>');
    }

    default:
      throw new CliError(`unknown command '${command}'\n${USAGE}`);
  }
}
