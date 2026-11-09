#!/usr/bin/env node
/**
 * Static guard for ruvnet/colony ADR-125 / ADR-130 env-var precedence pattern.
 *
 * Context
 * -------
 * ADR-125 (rvagent integration) and ADR-130 (graph intelligence backend)
 * introduced several new env vars that configure runtime behaviour:
 *
 *   COLONY_MEMORY_PATH        — override memory root directory
 *   COLONY_DISABLE_BRIDGE     — bypass AgentDB v3 bridge
 *   COLONY_GRAPH_BACKEND      — select graph backend (sqlite | agentdb)
 *   COLONY_GRAPH_DECAY_RATE   — default temporal decay rate
 *   COLONY_EMBED_DIMS         — embedding dimension override
 *
 * The project's documented resolution order for every config value is:
 *
 *   CLI flag  >  ENV var  >  config-file  >  hardcoded default
 *
 * This audit scans the source tree for any env var read pattern that does NOT
 * have a corresponding CLI-flag precedence guard (i.e., where `process.env`
 * is the ONLY source of the value and no CLI argument can override it).
 *
 * Concretely it checks that every `process.env.COLONY_*` read site
 * either:
 *   (a) is inside a function that accepts an explicit argument (meaning the
 *       caller CAN pass a CLI-derived value and the env var is only a
 *       fallback), OR
 *   (b) has a comment containing "cli.*flag" / "argv" / "precedence" / "flag"
 *       documenting that a CLI flag takes precedence, OR
 *   (c) is a known opt-out env var (DISABLE_BRIDGE, SKIP_NPX — intentionally
 *       env-only because they are CI/test escape hatches, not user config).
 *
 * A violation means: a future contributor adds an env var and forgets to wire
 * a CLI flag, silently making the CLI flag have no effect when the env var is
 * set. That's the class of bug ADR-125 §"CLI flag wins" was written to prevent.
 *
 * Failure exits 1 with remediation instructions.
 * CI wiring: .github/workflows/v3-ci.yml `env-var-precedence-audit` step in
 * the `plugin-package-audit` job.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Knob-controlled env vars that are intentionally env-only ─────────────────
// These are CI/test escape hatches or cross-process signals, not user config.
// They are explicitly exempt from the "CLI flag must win" requirement.
const KNOWN_ESCAPE_HATCHES = new Set([
  // ── CI / test escape hatches ────────────────────────────────────────────────
  'COLONY_DISABLE_BRIDGE',   // CI/test: force raw sql.js path — intentionally no CLI flag
  'COLONY_GRAPH_EDGE_IDLE_MS', // CI/test tuning: idle-close window (ms) for graph-edge-writer's native WAL handle (#3397). Internal lifecycle knob with a safe default (1000); no user-facing command owns it, so no CLI flag.
  'COLONY_ADMIN_TOKEN',            // credential: the x.ruv.io gateway's OWN admin token, read by plugins/colony-x-gateway. Env-only by design — a secret must never be a CLI flag (shell history / process lists), and the gateway is a service with no typed command surface at all.
  'COLONY_SERAPHINA_DAILY_CAP',    // gateway spend guard (#3275): shared daily Seraphina budget. Read by a long-running service, not a typed command — there is no invocation to attach a flag to.
  'COLONY_SERAPHINA_IP_HOURLY_CAP',// gateway spend guard (#3275): per-client hourly Seraphina budget. Same service-only reasoning.
  'COLONY_MANAGED_AGENTS_BASE_URL',// Trust boundary: the Managed Agents adapter sends the API key to this origin, so it is operator config only. MCP/CLI arguments cannot select another host; apiBase() accepts a bare HTTPS origin (no credentials, path, query or fragment) and every request uses redirect:'error'.
  'COLONY_X_GATEWAY_URL',          // Trust boundary: gateway reads/admin writes pin destinations to server config; MCP/CLI arguments cannot select another host.
  'SERAPHINA_METALLM_URL',        // Trust boundary: credential-bearing Meta-LLM requests pin destinations to server config.
  'COLONY_X_ADMIN_TOKEN',          // credential: gateway admin token for x.ruv.io gateway-identity writes (x_federation_publish/invite_mint/admit). Env-only by design — a secret must never be a CLI flag (shell history / process lists). Gateway destination is trusted server config; --gateway/tool arguments must match it.
  'SERAPHINA_METALLM_KEY',        // credential: cognitum meta-llm API key for seraphina_guidance. Env-only by design (same reasoning). Meta-LLM destination is trusted server config; metaLlmUrl must match it.
  'COLONY_HIVE_BOOTSTRAP_SECRET',  // credential (ADR-476): operator secret gating remote hive-mind_* MCP calls, read server-side in hive-mind-tools.ts's readBootstrapSecret(). Env-only by design — a secret must never be a CLI flag (shell history / process lists); it configures the server, not one invocation, and the caller-supplied `bootstrapSecret` tool argument (not this env var) is how a remote caller presents its credential per call.
  'COLONY_HOOK_SKIP_NPX',          // CI: suppress cold-install latency in smoke tests
  'COLONY_HOOK_CLI_OVERRIDE',      // #2721 test-only: point plugins/colony-core/scripts/colony-hook.cjs at a local CLI build instead of the colony/colony/npx PATH probe. Hook scripts have no CLI-flag surface (invoked by hooks.json, never a user-typed command)
  'COLONY_HOOK_DEBUG_STDOUT',      // #2721 test-only: surface the invoked CLI's stdout/stderr from colony-hook.cjs instead of swallowing it, so test-hooks.mjs can assert on recorded values. Same no-CLI-surface reasoning as COLONY_HOOK_CLI_OVERRIDE above — production never sets this
  'COLONY_MODS_OWNS',              // ADR-404 handshake, not configuration: the colony mod sets it on the Claude Code process with $.env.set, and hook-handler.cjs / colony-hook.cjs read it to stand down for route/post-edit. Hook scripts have no CLI-flag surface (invoked by settings/hooks.json), and a flag would defeat its purpose: only the running mod may set it
  'COLONY_HOOK_UNIT_TEST',         // test-only: skip main() when colony-hook.cjs is require()'d by escape-cmd-arg.test.cjs, so the unit test can reach escapeCmdArg() without triggering the real hook flow / process.exit(0). Same no-CLI-surface reasoning — hooks.json always require()s this file directly, there is no invocation to attach a flag to
  'COLONY_SUBLINEAR_NATIVE',       // Manual override for native vs WASM sublinear — CI/perf knob
  'COLONY_METAHARNESS_CACHE_BASE', // CI/test seam: relocates the ~/.colony pinned-cache root in metaharness smoke tests — intentionally env-only, plugin scripts have no CLI-flag surface
  'COLONY_FUNNEL',                 // Read inside the generated hook-handler.cjs (ADR-312/313 rate-limit nudge), not a typed CLI invocation — no command surface to attach a flag to
  'COLONY_STATUSLINE_HYPERLINKS',  // Terminal-capability opt-out for OSC 8 hyperlinks in the statusline hook, same pattern as NO_COLOR — the statusline runs as a hook script, never a user-typed CLI command
  'COLONY_STATUSLINE_HYPERLINKS_TMUX', // Opt-in override of the tmux OSC 8 mangling workaround above — same hook-script context, no CLI surface
  'COLONY_STATUSLINE_IDENTITY',    // Hook-only display mode (`project` default, `author` compatibility); statusline has no interactive CLI surface
  'COLONY_ADVISOR_MAX_BUDGET_USD', // Advisor-tip spend cap read from generated hook code (funnel/advisor-tip.ts) — background nudge, no CLI invocation to attach a flag to
  'COLONY_FUNNEL_CLICK_ENDPOINT',    // Staging/self-hosted override for the funnel click-redirect endpoint — deployment config, not a per-invocation CLI flag
  'COLONY_FUNNEL_EVENTS_ENDPOINT',   // Staging/self-hosted override for the funnel events endpoint — same deployment-config pattern as CLICK_ENDPOINT above
  'COLONY_FUNNEL_MESSAGES_ENDPOINT', // Staging/self-hosted override for the funnel messages endpoint — same deployment-config pattern as CLICK_ENDPOINT above
  'COLONY_STATE_DIR',                // Test/CI isolation seam for the funnel state directory (defaults to ~/.colony) — background hook state, no CLI command reads it
  'COLONY_AI_DEDUP_DISABLE',         // #2661 — background daemon tuning knob (cross-worktree AI job dedup), no CLI command reads a running daemon's config
  'COLONY_AI_DEDUP_WINDOW_SECS',     // #2661 — same background daemon tuning context as COLONY_AI_DEDUP_DISABLE above
  'COLONY_DAEMON_AI_WORKERS',        // #2661 — DOES have CLI-flag precedence (`daemon start --headless`), but it's wired via constructor-injected config in commands/daemon.ts, not a local check the audit's same-file heuristic can see from worker-daemon.ts where this read lives
  'COLONY_AI_BUDGET_DIR',            // #2663 — repo-supervisor state directory relocation (services/global-ai-budget.ts, services/repo-supervisor.ts, services/workspace-lease.ts). Test/CI isolation seam analogous to COLONY_STATE_DIR above; the supervisor is a background service, not a user-invoked CLI command with a `--budget-dir` flag surface
  'COLONY_AI_BUDGET_DISABLE',        // #2663 — hard kill switch for the repository-supervisor AI-cost fuse (services/global-ai-budget.ts). Ops-level "disable this whole subsystem" toggle, same pattern as COLONY_AI_DEDUP_DISABLE above
  'COLONY_METAHARNESS_SKIP_LOCAL',   // plugins/colony-metaharness/scripts/_invoke.mjs — CI seam that forces the invoke shim off the local vendored metaharness and onto the pinned-cache resolver. Plugin script has no CLI-flag surface (invoked internally by MCP tools)
  'COLONY_PLUGIN_SKIP_LOCAL_CLI',    // #3558 test-only seam: makes the plugin CLI resolvers (colony-adr/colony-goals scripts/lib/colony-cli.mjs, colony-cost-tracker _colony-cli.mjs, colony-metaharness _invoke.mjs) skip the repo-local CLI build so tests can exercise the PATH and npx fallbacks. Plugin scripts have no CLI-flag surface (invoked by hooks/MCP tools); production never sets it
  'COLONY_PLUGIN_SKIP_PATH_CLI',     // #3558 test-only seam: same resolvers, skips the `colony` PATH lookup so tests can force the `npx @colony/cli@latest` fallback. Same no-CLI-surface reasoning as COLONY_PLUGIN_SKIP_LOCAL_CLI above
  'COLONY_HELPERS_LOCKED',           // v3.30.0 — env-level opt-out for the .claude/helpers/ auto-refresh (init/helper-refresh.ts). Sibling to the `.LOCKED` marker file; helper-refresh runs from a hook, not a user-typed CLI command — no per-invocation flag surface. See CLAUDE.md "Concurrent-session helper corruption" for rationale
  'COLONY_DISABLE_NATIVE_ROUTER', // Test/lock-constrained MCP escape hatch: forces hooks routing onto the deterministic pure-JS backend. The router is process-lifetime state, not owned by one CLI invocation.
  'COLONY_ROUTER_EMBEDDER',    // ADR-390/391: selects the hooks_route semantic-index embedder (minilm|hash; default hash). Same process-lifetime MCP router state as COLONY_DISABLE_NATIVE_ROUTER — the index is built once per process, not per CLI invocation; the ADR-391 bench passes the embedder explicitly instead.
  'COLONY_FLYWHEEL_ALLOW_BUILTIN_ANCHOR', // Explicit compatibility escape hatch for pre-ADR-331 downstream behavior. Intentionally env-only and visibly unsafe-by-choice; normal CLI/MCP use supplies a project anchor path + hash.

  // ── Embedding substrate toggles (3.25.x — opt-in tier + fail-closed ops flag) ─
  'COLONY_REQUIRE_REAL_EMBEDDINGS', // Fail-closed "no stubs" strict mode — deploy/CI ops toggle, not a per-invocation CLI flag (ADR-176)
  'COLONY_EMBED_WASM_PKG',          // Opt-in specifier for the optional WASM embedder tier — env-only deployment config, inert by default
  'COLONY_LATTICE_WASM_PKG',        // Back-compat alias of COLONY_EMBED_WASM_PKG
  'COLONY_EMBED_MODEL',             // Model name for the optional WASM embedder — substrate config, env-only

  // ── ADR-320 MCP Composition Inspector + ChannelGuard (this ADR) ─────────────
  // Read inside @colony/security/src/mcp-composition-inspector.ts and
  // @colony/hooks/src/workers/channel-guard-worker.ts respectively
  // (outside this audit's SCAN_ROOTS today — registered anyway per the same
  // "MUST be registered in audit-env-var-precedence.mjs with rationale"
  // requirement ADR-144/145/320-plugin-scanner already impose on their flags,
  // see COLONY_STRICT_PUBLISH below for the precedent).
  'COLONY_MCP_COMPOSITION_BLOCK', // Opt-in strict mode for the Composition Inspector (evaluateToolComposition) — default warn+log, '1'/'true' switches a flagged tool chain to blocked. Deploy/CI ops posture toggle read fresh per scan, not a per-invocation CLI flag; no interactive CLI command owns a single MCP tool-composition scan's lifetime.
  'COLONY_SECURITY_CHANNEL_GATE', // Kill switch for the ChannelGuard inter-agent message sanitization gate (guardChannelMessage, wired into SwarmCommunication.sendMessage) — default enabled, '0' disables for trusted internal environments. Same escape-hatch shape as COLONY_DISABLE_BRIDGE above; the gate runs inside the swarm-communication hot path, not behind a user-typed command.

  // ── SONA fleet-wide learning-mode default (feat/sona-mode-from-env) ─────────
  // Read inside @colony/integration/src/sona-adapter.ts (sonaModeFromEnv,
  // exported) and @colony/memory/src/learning-bridge.ts (sonaModeFromEnv,
  // module-private) — both outside this audit's SCAN_ROOTS today, registered
  // anyway per the same requirement as COLONY_MCP_COMPOSITION_BLOCK above.
  'COLONY_INTELLIGENCE_MODE', // Fleet-wide default SONA learning mode ('real-time'|'balanced'|'research'|'edge'|'batch') for a managed deployment that wants every session to learn in a given profile without threading `mode`/`sonaMode` through every call site. Read fresh per SONAAdapter construction / mergeConfig() call and per LearningBridge construction — never cached at module load. An explicit per-call mode/sonaMode always wins; an unset or unrecognised value falls through to the caller's own default ('balanced'), never silently selecting a profile. Deploy/ops config, not a per-invocation CLI flag.

  // ── Feature flags (set by init into settings.json, not user-typed CLI) ──────
  'COLONY_V3_ENABLED',
  'COLONY_HOOKS_ENABLED',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',

  // ── Process-internal / inter-process signalling ─────────────────────────────
  'COLONY_HEADLESS',         // Set/read within same process invocation lifecycle
  'COLONY_FORCE_UPDATE',     // Set by --force flag internally, then cleared — not external
  'COLONY_AUTO_UPDATE',      // Auto-update cadence — env-only documented design
  'COLONY_DAEMON_LOCK_WAIT_MS',    // How long `daemon start` waits on another start's spawn lock; operator tuning knob, env-only by design (no `daemon start` flag)
  'COLONY_POLICY_LEDGER_RETENTION', // Operator policy-writer retention window, shared by CLI and long-lived MCP transactions; no per-request flag owns the writer lifecycle. Pruned receipts remain archived and authenticated (#3164/#3892).
  'COLONY_POLICY_AUDIT_MAX_RECORD_BYTES', // Operator memory-safety bound shared by archive preflight and full-audit replay, including MCP calls. Intentionally process-wide, not caller-overridable; validated 1 KiB–64 MiB with an unchanged 16 MiB default (#3892).

  // ── Logging / diagnostics ───────────────────────────────────────────────────
  'COLONY_LOG_LEVEL',
  'DEBUG',
  'COLONY_DEBUG',

  // ── Provider credentials ─────────────────────────────────────────────────────
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'COLONY_ENCRYPTION_KEY',   // Encryption key — credential, never a CLI flag
  'COLONY_GRAPH_INTELLIGENCE_WITNESS_KEY', // Ed25519 witness signing key — credential
  'COLONY_PROVIDER',               // Provider selection in headless agent context
  'PINATA_API_KEY',
  'PINATA_API_SECRET',
  'PINATA_API_JWT',

  // ── Bootstrap / process-level bindings (can't chicken-egg with CLI parsing) ──
  'COLONY_CONFIG',
  'COLONY_MEMORY_BACKEND',
  'COLONY_MCP_PORT',
  'COLONY_MCP_HOST',
  'COLONY_MCP_TRANSPORT',

  // ── CLI-flag-dominated env vars: documented precedence, large context window ─
  // These have explicit precedence docs that appear >10 lines before the read.
  // The audit's 10-line context window misses them; they are tracked here to
  // prevent noisy false positives. Each must have the precedence documented
  // in the source file (checked manually and confirmed below).
  //   COLONY_MEMORY_PATH — memory-initializer.ts lines 19-28 doc
  //     "Precedence (highest → lowest): 1. COLONY_MEMORY_PATH env var"
  //   See also memory.ts line 12: "#2105: --path > COLONY_DB_PATH > COLONY_MEMORY_PATH"
  'COLONY_MEMORY_PATH',

  // ── Statusline cosmetics (no CLI on the statusline; init-time settings.json) ─
  // Added 2026-06-02: statusline is invoked by Claude Code via hook config,
  // not by an interactive `colony statusline …` command line. There is no CLI
  // surface to attach a flag to; the env reads in statusline-generator.ts
  // are the documented configuration channel.
  'COLONY_STATUSLINE_COST_SYMBOL',
  'COLONY_STATUSLINE_HIDE_COST',

  // ── Tunables for routing/learning thresholds (operator knob, not user CLI) ───
  // Added 2026-06-02: model-router uses this as a runtime escalation threshold
  // tuned by ops, not selected per-command. No CLI flag is wired because no
  // single CLI invocation owns the router's lifetime.
  'COLONY_MAX_UNCERTAINTY',

  // Added 2026-09-17 (Dream Cycle #3349/#3350): same operator-knob shape as
  // COLONY_MAX_UNCERTAINTY directly above — model-router's discounted-
  // Thompson-sampling decay factor, tuned by ops across the router's whole
  // persisted lifetime (.swarm/model-router-state.json), not selected per
  // CLI invocation. envPriorDecay() in model-router.ts mirrors
  // envMaxUncertainty() exactly, including this escape-hatch registration.
  'COLONY_PRIOR_DECAY',

  // ── MCP-tool-shaped tunables (param wins over env; env is documented fallback) ─
  // Added 2026-06-02 (ADR-089 #2246): memory_search_unified resolves namespaces
  // in this priority: `namespace` param → `namespaces[]` param → env var →
  // dynamic enumeration. The `namespaces[]` MCP-tool parameter IS the
  // CLI-flag-equivalent and takes precedence (memory-tools.ts:1079-1109). The
  // env is the documented operator fallback.
  'COLONY_MEMORY_SEARCH_NAMESPACES',

  // ── Orchestrator-injected worker identity label (not an auth credential) ───
  // ADR-324 propagates this value to policy receipts so concurrent workers can
  // be distinguished. It is intentionally env-only: exposing a CLI flag would
  // imply that an agent may select its security principal. Human approval
  // issuance still requires an authenticated identity adapter and never trusts
  // this label as issuer proof.
  'COLONY_PRINCIPAL_ID',

  // ── ADR-377 Phase 3: per-worker Ed25519 caller-identity credential ─────────
  // DualModeOrchestrator mints these into a spawned worker's OWN environment
  // (workerEnvironment()) — a credential pair for authorizeMcpTool's
  // resolveMcpCallerIdentity() to verify, not a value any caller should be
  // able to select via a CLI flag (that would let a process simply assert a
  // signature instead of proving one). Same no-CLI-surface reasoning as
  // COLONY_PRINCIPAL_ID above.
  'COLONY_MCP_CALLER_PUBKEY',
  'COLONY_MCP_INVOCATION_TOKEN',

  // ── OS / runtime standard env ────────────────────────────────────────────────
  'HOME',
  'USERPROFILE',
  'CLAUDE_PROJECT_DIR',
  'PATH',
  'npm_config_prefix',
  'npm_execpath',
  'NODE_ENV',
  'PROMPT',
  'TOOL_INPUT_command',

  // ── Router (ADR-130/148/149) operator knobs ─────────────────────────────────
  // These configure colony's neural-router/bandit/trajectory subsystems and
  // are intentionally env-only:
  //   - Most are CI/benchmark knobs (KNN_K, LATENCY_BUDGET_MS, COST_CEILING),
  //     not user-typed inputs.
  //   - Several are feature flags (NEURAL=1, BANDIT_PER_MODEL=1, TRAJECTORY=1)
  //     that, like COLONY_V3_ENABLED above, get baked into settings
  //     by `colony init` rather than passed on the command line.
  //   - SEED_CORPUS / CALIBRATOR_PATH / MODEL_PATH are file-path inputs to
  //     long-running daemons, not transient CLI flags.
  // If a router knob graduates to user-facing surface, add a CLI flag override
  // per ADR-125 and remove its entry here.
  'COLONY_ROUTER_AB',
  'COLONY_ROUTER_AB_SAMPLE_RATE',
  'COLONY_ROUTER_BANDIT_FULL_INFLUENCE',
  'COLONY_ROUTER_BANDIT_PER_MODEL',
  'COLONY_ROUTER_BANDIT_SHRINKAGE_LAMBDA',
  'COLONY_ROUTER_BANDIT_WARMUP_RANGE',
  'COLONY_ROUTER_CALIBRATE',
  'COLONY_ROUTER_CALIBRATOR_PATH',
  'COLONY_ROUTER_COST_CEILING_USD_PER_MTOK',
  'COLONY_ROUTER_EMBED_CACHE_SIZE',
  'COLONY_ROUTER_ENSEMBLE_UNCERTAINTY_THRESHOLD',
  'COLONY_ROUTER_FALLBACK_MAX_RETRIES',
  'COLONY_ROUTER_KNN_K',
  'COLONY_ROUTER_LATENCY_BUDGET_MS',
  'COLONY_ROUTER_MODEL_PATH',
  'COLONY_ROUTER_NEURAL',
  'COLONY_ROUTER_NEURAL_WEIGHT',
  'COLONY_ROUTER_OPENROUTER_ALTS',
  'COLONY_ROUTER_PARALLEL_LOG',
  'COLONY_ROUTER_PARALLEL_LOG_PATH',
  'COLONY_ROUTER_PROVIDER',
  'COLONY_ROUTER_QUALITY_BAR',
  'COLONY_ROUTER_SEED_CORPUS',
  'COLONY_ROUTER_TRAJECTORY',
  'COLONY_ROUTER_TRAJECTORY_MAXROTATIONS',
  'COLONY_ROUTER_TRAJECTORY_MAXSIZE',
  'COLONY_ROUTER_TRAJECTORY_PATH',
  'COLONY_ROUTER_TRAJECTORY_TASKLEN',
  // Run-transcript capture (ADR-173 distill capture path) — opt-in, off by
  // default background recorder (PII/retention surface, mirrors ROUTER_TRAJECTORY
  // above). No user-facing command, so env-only by design; no CLI-flag precedence.
  'COLONY_RUN_TRANSCRIPTS',
  'COLONY_RUN_TRANSCRIPTS_PATH',
  'COLONY_RUN_TRANSCRIPTS_MAXROTATIONS',
  'COLONY_RUN_TRANSCRIPTS_MAXSIZE',
  'COLONY_SWARM_DIR',  // Set by colony init / inter-process — not user-typed
  // Nightly backup daemon-worker config (ADR-174 follow-up). The interactive
  // `memory backup` command exposes --keep / --gcs / --dir flags with proper
  // precedence; these env vars only configure the headless daemon worker path.
  'COLONY_BACKUP_KEEP',
  'COLONY_BACKUP_GCS',
  // Self-running daemon opt-out (auto-start on CLI use). A pure on/off toggle
  // for a background behavior — no CLI flag equivalent; escape-hatch by design.
  'COLONY_DAEMON_AUTOSTART',
  // Self-optimizing harness loop opt-IN (ADR-176). Background daemon-worker
  // toggle; $0-default even when on. Escape-hatch by design.
  'COLONY_HARNESS_LOOP',
]);

// ── Source directories to scan ────────────────────────────────────────────────
const SCAN_ROOTS = [
  join(REPO_ROOT, 'v3/@colony/cli/src'),
  join(REPO_ROOT, 'plugins'),
];

// ── Skip patterns ─────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '__tests__', 'tests', 'test']);
const SCAN_EXTS = new Set(['.ts', '.mjs', '.cjs', '.js']);

// ── Regex to find process.env.COLONY_* reads ────────────────────────────
// Matches: process.env.COLONY_FOO or process.env['COLONY_FOO']
const ENV_READ_RE = /process\.env(?:\.([A-Z_]+)|\[['"]([A-Z_]+)['"]\])/g;

// ── Indicator that a CLI arg takes precedence ─────────────────────────────────
// Presence of any of these in the surrounding 10 lines counts as documented precedence.
const PRECEDENCE_INDICATORS = [
  /cli.*flag/i,
  /argv/i,
  /precedence/i,
  /--[a-z]/,          // looks like a --flag reference in a comment
  /options\.\w+/,     // options.someFlag pattern (function param wins)
  /args\.\w+/,        // args.someFlag pattern
  /param.*overrid/i,
  /flag.*win/i,
  /caller.*can.*pass/i,
];

// ── Walk source tree ─────────────────────────────────────────────────────────

function* walkSourceFiles(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      yield* walkSourceFiles(full);
    } else if (st.isFile()) {
      const dot = entry.lastIndexOf('.');
      if (dot >= 0 && SCAN_EXTS.has(entry.slice(dot))) yield full;
    }
  }
}

const violations = [];
const warnings = [];
const scanned = [];

for (const root of SCAN_ROOTS) {
  if (!existsSync(root)) continue;
  for (const file of walkSourceFiles(root)) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }

    const lines = text.split('\n');
    scanned.push(relative(REPO_ROOT, file));

    let match;
    ENV_READ_RE.lastIndex = 0;
    while ((match = ENV_READ_RE.exec(text)) !== null) {
      const varName = match[1] || match[2];
      if (!varName) continue;
      if (!varName.startsWith('COLONY_') && !varName.startsWith('COLONY_')) continue;
      if (KNOWN_ESCAPE_HATCHES.has(varName)) continue;

      // Find the line number
      const lineIdx = text.slice(0, match.index).split('\n').length - 1;
      const contextStart = Math.max(0, lineIdx - 5);
      const contextEnd = Math.min(lines.length - 1, lineIdx + 5);
      const contextLines = lines.slice(contextStart, contextEnd + 1).join('\n');

      // Check for precedence indicators in surrounding context
      const hasPrecedenceDoc = PRECEDENCE_INDICATORS.some(re => re.test(contextLines));

      const relFile = relative(REPO_ROOT, file);
      const lineNo = lineIdx + 1;

      if (!hasPrecedenceDoc) {
        // Check if it's inside a function with an explicit parameter that could override.
        // Heuristic: look for a function declaration within 20 lines above that has params.
        const fnContextStart = Math.max(0, lineIdx - 20);
        const fnContext = lines.slice(fnContextStart, lineIdx + 1).join('\n');
        const hasExplicitParam = /function\s+\w+\s*\([^)]+\)|=>\s*\{|\([^)]+\)\s*:\s*\w+/.test(fnContext)
          && !/function\s+\w+\s*\(\s*\)/.test(fnContext.split('\n').slice(-5).join('\n'));

        if (hasExplicitParam) {
          // Warn rather than fail — function params could be the override path
          warnings.push({ file: relFile, line: lineNo, varName });
        } else {
          violations.push({
            file: relFile,
            line: lineNo,
            varName,
            context: lines[lineIdx]?.trim() ?? '',
          });
        }
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`env-var-precedence audit — scanned ${scanned.length} source file(s)`);

if (warnings.length > 0) {
  console.log(`\nwarnings (function-param override path detected — verify manually):`);
  for (const w of warnings) {
    console.log(`  ? ${w.file}:${w.line}  ${w.varName}`);
  }
}

if (violations.length === 0) {
  console.log('\n  ok: all COLONY_* / COLONY_* env var reads have documented CLI-flag precedence');
  console.log('  ok: or are registered as known escape-hatch env vars (CI/test/credential use)');
  process.exit(0);
}

console.error(`\n${violations.length} violation(s) — env var read without CLI-flag precedence documentation:`);
for (const v of violations) {
  console.error(`  x ${v.file}:${v.line}  ${v.varName}`);
  console.error(`    context: ${v.context}`);
}
console.error(`
Remediation:
  Option A — Wire a CLI flag that takes precedence:
    Before: const val = process.env.COLONY_FOO;
    After:  const val = options.foo ?? process.env.COLONY_FOO ?? DEFAULT;
    Then add "// CLI flag options.foo takes precedence over COLONY_FOO env var"

  Option B — Register as an escape hatch (CI/test/credential only):
    Add the env var name to KNOWN_ESCAPE_HATCHES in scripts/audit-env-var-precedence.mjs
    with a comment explaining why it is intentionally env-only.

Reference: ADR-125 §"CLI flag wins", ADR-130 §env-var-config-precedence.
`);
process.exit(1);
