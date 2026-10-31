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

Ellenőrizve: tiszta telepítés után `pnpm build` hibátlan, és az `example.js` lefut offline módban. A `pnpm test` 15 tesztje mind zöld (busz, nyilvántartás, orchestrator, konszenzus, vektortár). Teszt még hiányzik a `ColonyHub`, `ColonyWorker`, `llm/providers`, `FileVectorStore`, `moe-router` és `reasoning-bank` modulokhoz.

## Host-vezérelt irány (2026-10-31)

Nincs API-kulcs: a host (Cowork) maga a modell, a mag csak főkönyv. Ehhez készült:
- `cli/session.ts`: állapot betöltése és mentése (`.colony/ledger.json`, `.colony/memory.json`), boot (`LOADED` / `UNVERIFIABLE` / `BLOCKED`), revízió-feloldás.
- `cli/commands.ts` és `cli.ts`: a `colony` parancs (boot, status, task, next, done, fail, propose, vote, memory).
- `snapshot()` / `restore()` a nyilvántartásban, az orchestratorban és a konszenzusmotorban.
- 11 CLI-teszt a teljes munkafolyamatra.

Következmény: a `llm/providers.ts`, a `ColonyWorker` (saját végrehajtás) és a `github-runner` + workflow a host-vezérelt úton nem kell. Döntés kell: kivezetés vagy opcionális marad.

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

1. **Tesztek bővítése** (az alapok kész): `ColonyHub`, `ColonyWorker`, szolgáltatók (mockolt `fetch`-csel), `FileVectorStore`, `moe-router`, `reasoning-bank`.
2. **A plant.md hiányzó fázisai** (V., VI.) pontosítása. Kód nincs hozzájuk.
3. **Plugin-leltár:** minden `ruflo-*` pluginra döntés: átvesz / újraír / kivezet.
4. **Gyökér átnevezése:** új gyökér `package.json` (workspace a `packages/*`-ra), `AGENTS.md` és `CLAUDE.md` újraírása Colony-szemlélettel.
5. **Ruflo-kód mozgatása** `legacy/` alá, majd a kivezetett részek törlése. Ez a lépés a repó nagy részét érinti, ezért külön, felülvizsgált commitban megy.
6. **Licenc és eredet:** a megmaradó átvett kód jelölése, a nem megmaradó kivezetése.
7. **Runner biztonság:** a workflow `contents: write` joggal fut issue-kommentre, ezért korlátozni kell, kik indíthatják (pl. `author_association`).
