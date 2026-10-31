# Ruflo → Colony migrációs térkép

Állapot: 2026-10-31. Forrás: a repó tényleges tartalma és a [plant.md](../plant.md).

## Kész (`packages/colony-core`)

| Terület | Fájl |
|---|---|
| Típusok, eseménybusz | `types.ts`, `message-bus.ts` |
| Nyilvántartás, orchestráció | `coordination/colony-registry.ts`, `coordination/colony-task-orchestrator.ts` |
| Konszenzus | `consensus/consensus-engine.ts` |
| Vezérlő | `colony-hub.ts` |
| Memória | `memory/*` (vector store, file store, embeddings, vector codex) |
| Ágensek, eszközök | `agents/*` |
| Tanulás | `neural/moe-router.ts`, `neural/reasoning-bank.ts` |
| LLM szolgáltatók | `llm/providers.ts` |
| Futtató | `github-runner.ts`, `.github/workflows/kristal-colony-runner.yml` |

Ellenőrizve: tiszta telepítés után `pnpm build` hibátlan, és az `example.js` lefut offline módban. Automatikus teszt nincs.

## Még Ruflo (átírandó vagy kivezetendő)

| Terület | Megjegyzés |
|---|---|
| `v3/@claude-flow/*` | A Ruflo CLI, MCP, biztonsági és codex csomagjai. A „swarm” szó kb. 2000 fájlban szerepel. |
| `plugins/ruflo-*` | 40+ plugin. Döntés kell, melyik kell a Colonyban. |
| `ruflo/`, `plugin/` | A Ruflo csomag és a Claude Code plugin. |
| gyökér `package.json`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md` | Még `claude-flow` 3.65.0 azonosság. |
| `.claude*`, `.agents`, `.harness`, `.githooks` | Claude/Codex-specifikus konfiguráció. |
| `Cargo.toml`, `crates/` | Rust federációs rész. |

## Javasolt sorrend

1. **Tesztek** a `colony-core`-hoz (`node --test`): registry, orchestrator függőségek, konszenzus, vector store.
2. **A plant.md hiányzó fázisai** (V., VI.) pontosítása. Kód nincs hozzájuk.
3. **Plugin-leltár:** minden `ruflo-*` pluginra döntés: átvesz / újraír / kivezet.
4. **Gyökér átnevezése:** új gyökér `package.json` (workspace a `packages/*`-ra), `AGENTS.md` és `CLAUDE.md` újraírása Colony-szemlélettel.
5. **Ruflo-kód mozgatása** `legacy/` alá, majd a kivezetett részek törlése. Ez a lépés a repó nagy részét érinti, ezért külön, felülvizsgált commitban megy.
6. **Licenc és eredet:** a megmaradó átvett kód jelölése, a nem megmaradó kivezetése.
7. **Runner biztonság:** a workflow `contents: write` joggal fut issue-kommentre, ezért korlátozni kell, kik indíthatják (pl. `author_association`).
