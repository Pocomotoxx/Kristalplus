import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { BUILTIN_AGENT_PROFILES } from '../agents/agent-profiles.js';
import type { AgentRole, ColonyMember, ColonyTask, TaskPriority } from '../types.js';
import { ColonySession, loadRules, resolveRevision } from './session.js';
import { QUORUM_STRATEGIES, QuorumStrategy } from '../consensus/strategies.js';
import { ClaimError } from '../coordination/claim-ledger.js';
import { resolveInside, SafePathError } from '../safe-path.js';
import { aggregateDecision, checkDestructive, checkDiffSize, checkSecrets, checkToolAllowed, GateResult } from '../gates.js';
import { buildTopology, isFullyConnected, shortestPath, TOPOLOGY_TYPES, TopologyType } from '../topology.js';

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
  propose <taskId> <topic> --as <member>  [--quorum N | --strategy majority|supermajority|byzantine|unanimous] [--timeout-min M] [--data text]
  topology                                [--type mesh|star|tree|hybrid] [--fanout N] [--degree N] [--from id --to id]
  check                                   run gates BEFORE acting: [--command TEXT] [--text TEXT] [--file PATH [--diff-lines N] [--threshold N]]
                                          [--tool NAME --allow a,b*]; exit 3 on "block". A gate is a check you call, not an interceptor.
  route test <text>                       which role the router would pick (no side effects)
  route teach <text> --role R [--reward -1..1]   teach it: this kind of task belongs to R (or not, when negative)
  route stats                             how routed tasks spread over roles, and how much was learned
  audit list [--task id] [--type t] [--k N]   the hash-chained log of what was done, by whom
  audit verify                            check the chain and that the log still holds the entry anchored at the last boot
  claim list | sweep                  who holds which task; sweep marks stale or long-blocked claims stealable
  claim heartbeat <taskId> --as <member>  [--progress 0..100]   show life; takes a stealable claim back
  claim block <taskId> --as <member> --reason <text> | claim unblock <taskId> --as <member>
  claim release <taskId> --as <member>    give the task up (anyone may take it over at once)
  claim steal <taskId> --as <member>      take over a stealable claim (after its grace period)
  claim handoff <taskId> --as <member> --to <member> --reason <text> | claim accept|reject <taskId> --as <member>
  vote <proposalId> --as <member> (--approve|--reject) --reason <text> [--confidence 0..1]
  memory add <text>                       [--ns NAMESPACE]
  memory search <query>                   [--k N] [--ns NAMESPACE]

Global: --dir <path>  project directory (default: current directory)`;

const PROTOCOL = [
  'You (the host) are the model: the colony keeps the ledger, the routing, the votes and the memory.',
  'The rule files in `rules` are binding for this session; read them in full before starting work.',
  'Boot proves the state and the rule files were read and hashed. It does not prove that you applied the rules.',
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
        strategy: { type: 'string' },
        type: { type: 'string' },
        fanout: { type: 'string' },
        degree: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        'timeout-min': { type: 'string' },
        data: { type: 'string' },
        result: { type: 'string' },
        error: { type: 'string' },
        reason: { type: 'string' },
        confidence: { type: 'string' },
        progress: { type: 'string' },
        command: { type: 'string' },
        text: { type: 'string' },
        file: { type: 'string' },
        tool: { type: 'string' },
        task: { type: 'string' },
        reward: { type: 'string' },
        allow: { type: 'string' },
        'diff-lines': { type: 'string' },
        threshold: { type: 'string' },
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
    const { record, session, rules } = await ColonySession.boot(dir);
    const ok = record.status !== 'BLOCKED';
    return {
      code: ok ? 0 : 2,
      output: {
        ok,
        boot: record,
        ...(session ? { colony: session.hub.getSnapshot(), roles: Object.values(BUILTIN_AGENT_PROFILES).map((p) => p.role) } : {}),
        protocol: PROTOCOL,
        ...(ok ? { rules: rules.map((r) => ({ path: r.path, sha256: r.sha256, text: r.text })) } : {}),
      },
    };
  }

  const boot = await ColonySession.readBootRecord(dir);
  if (!boot || boot.status === 'BLOCKED') {
    throw new CliError(boot ? `last boot was BLOCKED: ${boot.problems.join('; ')}` : 'colony is not booted: run `colony boot`', 2);
  }
  const currentRules = await loadRules(dir);
  const booted = new Map((boot.rules ?? []).map((r) => [r.path, r.sha256]));
  const drifted =
    currentRules.problems.length > 0 ||
    currentRules.rules.length !== booted.size ||
    currentRules.rules.some((r) => booted.get(r.path) !== r.sha256);
  if (drifted) throw new CliError('rule files changed, vanished or became unreadable since boot: run `colony boot` again', 2);

  const warnings: string[] = [];
  if (resolveRevision(dir).sha !== boot.revision) warnings.push('git revision changed since boot; run `colony boot` again');

  const session = await ColonySession.open(dir);
  const { hub } = session;
  const log = (type: string, aggregateId: string, payload: Record<string, unknown> = {}) =>
    hub.audit.append({ type, aggregateId, actor: values.as ?? 'host', payload }, Date.now());
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

    case 'topology': {
      const type = (values.type ?? 'star') as TopologyType;
      if (!TOPOLOGY_TYPES.includes(type)) throw new CliError(`unknown topology '${values.type}' (use ${TOPOLOGY_TYPES.join(', ')})`);
      const fanout = values.fanout ? Number(values.fanout) : undefined;
      const degree = values.degree ? Number(values.degree) : undefined;
      if (fanout !== undefined && (!Number.isInteger(fanout) || fanout < 1)) throw new CliError('--fanout must be a positive integer');
      if (degree !== undefined && (!Number.isInteger(degree) || degree < 1)) throw new CliError('--degree must be a positive integer');

      const topology = buildTopology(hub.registry.getAllMembers(), type, { fanout, meshDegree: degree });
      if (values.from || values.to) {
        if (!values.from || !values.to) throw new CliError('--from and --to go together');
        return reply({ topology, path: shortestPath(topology, values.from, values.to) });
      }
      return reply({ topology, connected: isFullyConnected(topology) });
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
      log('task.added', task.id, { title, requiredRole: task.requiredRole, priority: task.priority, dependencies });
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
      if (task.status === 'assigned') {
        await hub.orchestrator.updateTaskProgress(task.id, member.id, 'in_progress');
        log('task.started', task.id, { memberId: member.id });
      }
      const open = hub.claims.get(task.id);
      if (open && open.status !== 'closed' && open.holderId === member.id) hub.claims.heartbeat(task.id, member.id, Date.now());
      else if (!open || open.status === 'closed') hub.claims.claim(task.id, member.id, Date.now());
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
        hub.claims.close(task.id, 'failed', agentId, Date.now());
        log('task.failed', task.id, { memberId: agentId, errorChars: values.error.length });
        await session.save();
        return reply({ task: summarizeTask(hub.orchestrator.getTask(task.id)!) });
      }

      if (!values.result?.trim()) throw new CliError('--result <text> is required and must not be empty');
      if (task.consensusRequired && !hub.consensus.listProposals().some((p) => p.taskId === task.id && p.status === 'approved')) {
        throw new CliError(`task '${task.id}' requires an approved consensus proposal first`);
      }
      const before = new Map(hub.orchestrator.getAllTasks().map((t) => [t.id, t.status]));
      await hub.orchestrator.completeTask(task.id, agentId, values.result);
      hub.claims.close(task.id, 'completed', agentId, Date.now());
      log('task.completed', task.id, { memberId: agentId, resultChars: values.result.length });
      const unblocked = hub.orchestrator.getAllTasks().filter((t) => before.get(t.id) === 'pending' && t.status === 'assigned');
      await session.save();
      return reply({ task: summarizeTask(hub.orchestrator.getTask(task.id)!), unblocked: unblocked.map(summarizeTask) });
    }

    case 'check': {
      if (!values.command && !values.text && !values.file && !values.tool) {
        throw new CliError('check needs at least one of --command, --text, --file, --tool');
      }
      const results: GateResult[] = [];
      const add = (r: GateResult | null) => {
        if (r) results.push(r);
      };
      if (values.command) {
        add(checkDestructive(values.command));
        add(checkSecrets(values.command));
      }
      if (values.text) add(checkSecrets(values.text));
      if (values.file) {
        let abs: string;
        try {
          abs = (await resolveInside(dir, values.file)).resolved;
        } catch (err) {
          if (err instanceof SafePathError) throw new CliError(err.code === 'OUTSIDE' ? '--file must be inside the project directory' : `--file: ${err.message}`);
          throw err;
        }
        const stat = await fs.stat(abs).catch(() => null);
        if (!stat?.isFile()) throw new CliError(`file '${values.file}' not found`);
        if (stat.size > 2_000_000) throw new CliError('--file is larger than 2 MB');
        add(checkSecrets(await fs.readFile(abs, 'utf-8')));
        if (values['diff-lines'] !== undefined) {
          const lines = Number(values['diff-lines']);
          const threshold = values.threshold === undefined ? undefined : Number(values.threshold);
          if (!Number.isFinite(lines) || lines < 0) throw new CliError('--diff-lines must be a non-negative number');
          if (threshold !== undefined && !(threshold >= 0)) throw new CliError('--threshold must be a non-negative number');
          add(checkDiffSize(values.file, lines, threshold));
        }
      }
      if (values.tool) {
        const allow = values.allow ? values.allow.split(',').map((s) => s.trim()).filter(Boolean) : [];
        add(checkToolAllowed(values.tool, allow));
      }
      const decision = aggregateDecision(results);
      // Only the verdict is logged: the checked text may itself hold a secret.
      log('check', 'check', { decision, gates: results.map((r) => r.gate) });
      await session.save();
      const output = { ok: decision !== 'block', decision, results, ...(warnings.length ? { warnings } : {}) };
      return { code: decision === 'block' ? 3 : 0, output };
    }

    case 'route': {
      if (sub === 'stats') return reply({ load: hub.router.getLoadBalance(), learning: hub.router.getStats() });
      const text = positionals[2];
      if (sub !== 'test' && sub !== 'teach') throw new CliError('usage: route test <text> | route teach <text> --role R [--reward -1..1] | route stats');
      if (!text?.trim()) throw new CliError(`route ${sub} needs a task text`);
      if (sub === 'test') return reply({ decision: hub.router.routeTask(text, { record: false }) });

      if (!values.role || !ROLES.includes(values.role as AgentRole)) throw new CliError(`--role must be one of ${ROLES.join(', ')}`);
      const reward = values.reward === undefined ? 1 : Number(values.reward);
      if (!Number.isFinite(reward) || reward < -1 || reward > 1) throw new CliError('--reward must be between -1 and 1');
      hub.router.recordOutcome(text, values.role as AgentRole, reward);
      log('router.taught', values.role, { reward, chars: text.length });
      await session.save();
      return reply({ taught: { role: values.role, reward }, decision: hub.router.routeTask(text, { record: false }), learning: hub.router.getStats() });
    }

    case 'audit': {
      if (sub === 'verify') {
        const chain = hub.audit.verify();
        const anchor = boot.audit;
        const anchored = anchor ? hub.audit.contains(anchor) : null;
        const ok = chain.ok && anchored !== false;
        return {
          code: ok ? 0 : 2,
          output: {
            ok,
            chain,
            sinceBoot: anchor ? { anchoredEntries: anchor.entries, stillHeld: anchored } : null,
            note: 'The hash chain has no signature: it detects edits, not a rewrite that recomputes every hash. The boot anchor catches cuts and rewrites since the last boot.',
          },
        };
      }
      if (sub !== 'list') throw new CliError('usage: audit list [--task id] [--type t] [--k N] | audit verify');
      const k = values.k ? Number(values.k) : 20;
      if (!Number.isInteger(k) || k < 0) throw new CliError('--k must be a non-negative integer');
      return reply({ total: hub.audit.length, entries: hub.audit.list({ aggregateId: values.task, type: values.type, limit: k }) });
    }

    case 'claim': {
      const now = Date.now();
      const taskId = positionals[2] ?? '';
      const needTask = () => {
        const task = taskId ? hub.orchestrator.getTask(taskId) : undefined;
        if (!task) throw new CliError(`task '${taskId}' not found`);
        return task;
      };
      const capacityOf = (m: ColonyMember) => ({ open: hub.claims.heldBy(m.id).length, max: m.capabilities.maxConcurrentTasks });
      try {
        switch (sub) {
          case 'list':
            return reply({ policy: hub.claims.policy, claims: hub.claims.open() });

          case 'sweep': {
            const changed = hub.claims.sweep(now);
            for (const c of changed) log('claim.stealable', c.taskId, { holderId: c.holderId, reason: c.stealableReason });
            await session.save();
            return reply({ markedStealable: changed.map((c) => ({ taskId: c.taskId, holderId: c.holderId, reason: c.stealableReason, graceEndsAt: c.graceEndsAt })) });
          }

          case 'heartbeat': {
            needTask();
            const [member] = resolveMembers(session, values.as);
            const progress = values.progress === undefined ? undefined : Number(values.progress);
            const claim = hub.claims.heartbeat(taskId, member.id, now, progress);
            log('claim.heartbeat', taskId, { memberId: member.id, progress: claim.progress, status: claim.status });
            await session.save();
            return reply({ claim });
          }

          case 'block': {
            needTask();
            const [member] = resolveMembers(session, values.as);
            const claim = hub.claims.block(taskId, member.id, values.reason ?? '', now);
            log('claim.blocked', taskId, { memberId: member.id });
            await session.save();
            return reply({ claim });
          }

          case 'unblock': {
            needTask();
            const [member] = resolveMembers(session, values.as);
            const claim = hub.claims.unblock(taskId, member.id, now);
            log('claim.unblocked', taskId, { memberId: member.id });
            await session.save();
            return reply({ claim });
          }

          case 'release': {
            needTask();
            const [member] = resolveMembers(session, values.as);
            const claim = hub.claims.release(taskId, member.id, now);
            log('claim.released', taskId, { memberId: member.id });
            await session.save();
            return reply({ claim });
          }

          case 'steal': {
            needTask();
            const [member] = resolveMembers(session, values.as);
            const { claim, previousHolderId, previousProgress } = hub.claims.steal(taskId, member.id, now, {
              challengerOpenClaims: capacityOf(member).open,
              maxClaims: capacityOf(member).max,
            });
            await hub.orchestrator.reassignTask(taskId, member.id);
            log('claim.stolen', taskId, { from: previousHolderId, to: member.id, previousProgress });
            await session.save();
            return reply({ claim, previousHolderId, previousProgress });
          }

          case 'handoff': {
            needTask();
            const [from] = resolveMembers(session, values.as);
            const target = values.to ? hub.registry.getMember(values.to) : undefined;
            if (!target) throw new CliError(`--to must be a member id (got '${values.to ?? ''}')`);
            const claim = hub.claims.requestHandoff(taskId, from.id, target.id, values.reason ?? '', now, {
              targetOpenClaims: capacityOf(target).open,
              maxClaims: capacityOf(target).max,
            });
            log('claim.handoff_requested', taskId, { from: from.id, to: target.id });
            await session.save();
            return reply({ claim });
          }

          case 'accept': {
            needTask();
            const [member] = resolveMembers(session, values.as);
            const claim = hub.claims.acceptHandoff(taskId, member.id, now);
            await hub.orchestrator.reassignTask(taskId, member.id);
            log('claim.handoff_accepted', taskId, { memberId: member.id });
            await session.save();
            return reply({ claim });
          }

          case 'reject': {
            needTask();
            const [member] = resolveMembers(session, values.as);
            const claim = hub.claims.rejectHandoff(taskId, member.id, now);
            log('claim.handoff_rejected', taskId, { memberId: member.id });
            await session.save();
            return reply({ claim });
          }

          default:
            throw new CliError('usage: claim list|sweep|heartbeat|block|unblock|release|steal|handoff|accept|reject');
        }
      } catch (err) {
        if (err instanceof ClaimError) throw new CliError(`${err.code}: ${err.message}`);
        throw err;
      }
    }

    case 'propose': {
      const [, , topic] = positionals;
      const task = sub ? hub.orchestrator.getTask(sub) : undefined;
      if (!task) throw new CliError(`task '${sub ?? ''}' not found`);
      if (!topic) throw new CliError('propose needs a topic');
      const [proposer] = resolveMembers(session, values.as);
      const strategy = values.strategy as QuorumStrategy | undefined;
      if (strategy !== undefined && !QUORUM_STRATEGIES.includes(strategy)) {
        throw new CliError(`unknown strategy '${strategy}' (use ${QUORUM_STRATEGIES.join(', ')})`);
      }
      if (strategy && values.quorum) throw new CliError('pass either --quorum or --strategy, not both');
      const quorum = values.quorum ? Number(values.quorum) : strategy ? undefined : task.minConsensusQuorum;
      const timeoutMin = values['timeout-min'] ? Number(values['timeout-min']) : 60;
      if (quorum !== undefined && (!Number.isInteger(quorum) || quorum < 1)) throw new CliError('--quorum must be a positive integer');
      if (!(timeoutMin > 0)) throw new CliError('--timeout-min must be positive');
      // Eligible voters: every member that is neither offline nor in error.
      const voters = hub.registry.getAllMembers().filter((m) => m.status !== 'offline' && m.status !== 'error').length;

      const proposal = await hub.consensus.submitProposal({
        taskId: task.id,
        proposerId: proposer.id,
        topic,
        data: values.data ?? null,
        quorum,
        strategy,
        voters: strategy ? voters : undefined,
        timeoutMs: timeoutMin * 60_000,
      });
      await hub.orchestrator.updateTaskProgress(task.id, proposer.id, 'consensus');
      log('proposal.created', proposal.id, { taskId: task.id, proposerId: proposer.id, quorum: proposal.quorum, strategy: strategy ?? null });
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
      log('proposal.vote', proposal.id, { voterId: voter.id, approve: Boolean(values.approve), confidence, status: proposal.status });
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
