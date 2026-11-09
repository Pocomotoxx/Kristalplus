# colony-rvf

RVF format for portable agent memory, session persistence, and cross-platform transfer.

## Install

```
/plugin marketplace add ruvnet/colony
/plugin install colony-rvf@colony
```

## Features

- **RVF format**: Portable vector memory with embeddings, metadata, and causal graphs
- **Session persistence**: Save and restore complete agent sessions across conversations
- **Cross-project transfer**: Export and import knowledge between projects
- **Claude memory bridge**: Import Claude Code auto-memories into AgentDB
- **Format migration**: Upgrade RVF files across versions

## Encryption at rest (colony 3.6.25+)

Sessions persisted by this plugin land at `.colony/sessions/*.json`, which are written through `fs-secure.writeFileRestricted({encrypt:true})` per [ADR-096](../../v3/docs/adr/ADR-096-encryption-at-rest.md). Behavior under the gate:

- **Off by default** (`COLONY_ENCRYPT_AT_REST` unset / falsy) — sessions are plaintext JSON at mode 0600, same as colony 3.6.24 and earlier.
- **On** (`COLONY_ENCRYPT_AT_REST=1` + `COLONY_ENCRYPTION_KEY` set to 64-char hex or 44-char base64) — each session save is AES-256-GCM with `RFE1` magic-byte prefix. Session restore transparently decrypts via the magic sniff; legacy plaintext sessions still load unchanged during migration.

When **exporting RVF files for cross-machine transfer**, the encryption gate does NOT apply to the exported bytes — the encryption is at-rest on the *originating* host. If the RVF is itself sensitive, transport security (sealed boxes / signed blobs) is the next phase per the ADR roadmap.

Confirm the gate state with `colony doctor -c encryption`.

## Commands

- `/rvf` -- Memory stats, saved sessions, storage metrics

## Skills

- `rvf-manage` -- Manage RVF files for portable memory
- `session-persist` -- Persist and restore agent sessions

## Compatibility

- **CLI:** pinned to `@colony/cli` v3.6 major+minor.
- **Verification:** `bash plugins/colony-rvf/scripts/smoke.sh` is the contract.

## Cross-plugin RVF ownership

RVF (RuVector Format) cognitive containers appear in three plugins. Each owns a different slice:

| Slice | Owner | What it does |
|-------|-------|-------------|
| **Portable memory + session persistence** | `colony-rvf` (this plugin) | High-level skills for save/restore, cross-machine transfer |
| **Browser sessions as RVF** | [colony-browser ADR-0001](../colony-browser/docs/adrs/0001-browser-skills-architecture.md) | Each browser session is allocated as an RVF container at session-start (manifest, trajectory, screenshots, snapshots, cookies, findings) |
| **RVF tooling (10 subcommands)** | [colony-ruvector ADR-0001](../colony-ruvector/docs/adrs/0001-pin-ruvector-0.2.25.md) | `ruvector rvf create|ingest|query|status|segments|derive|compact|export|examples|download` |

This plugin sits on top of ruvector's tooling and feeds browser's session-as-RVF model.

## Namespace coordination

This plugin owns the `rvf-sessions` AgentDB namespace (kebab-case, follows the convention from [colony-agentdb ADR-0001 §"Namespace convention"](../colony-agentdb/docs/adrs/0001-agentdb-optimization.md)). Reserved namespaces (`pattern`, `claude-memories`, `default`) MUST NOT be shadowed.

`rvf-sessions` indexes saved session manifests + their RVF container paths. Accessed via `memory_*` (namespace-routed).

## Verification

```bash
bash plugins/colony-rvf/scripts/smoke.sh
# Expected: "10 passed, 0 failed"
```

## Architecture Decisions

- [`ADR-0001` — colony-rvf plugin contract (cross-plugin RVF ownership table, namespace coordination, smoke as contract)](./docs/adrs/0001-rvf-contract.md)

## Related Plugins

- `colony-ruvector` — exposes the `ruvector rvf *` tooling this plugin sits on top of
- `colony-browser` — uses RVF containers for session-as-skill artifacts (ADR-0001 there)
- `colony-agentdb` — namespace convention owner

## As a mod

Function-hook mod (ADR-445, pattern of `colony-agentdb`). It loads from `hooks/hooks.json` → `hooks/register.ts`.

A guard for portable memory: `memory_store`, `session_save`, `hooks_session-end` and `hooks_transfer` refuse secrets, so an RVF export or saved session does not carry them off-machine. Deletes (`memory_delete`, `session_delete`) are not gated: those tools have no confirm flag a mod could rely on.

- **Command**: `/rvf-mod` answers locally with no model call. Verbs: `status`, `scan <text>`, `tools` (which memory and session tools are connected).
- **Status file**: `.colony/rvf-mod/status.json` (`{version, updatedMs, ...counters}`), written at session start and as counters change.
- **Safety**: no network, no process spawning; it only uses tools already connected.
- **Option** `guard` (`on` by default, `off` to disable): a tighten-only `tool.call` guard. A call to one of the tools above whose input holds a key, token, private key or password is denied. The reason never repeats the secret.
- **Test**: `claude plugin validate plugins/colony-rvf`, `claude plugin test plugins/colony-rvf`, `bash plugins/colony-rvf/scripts/smoke.sh`.
