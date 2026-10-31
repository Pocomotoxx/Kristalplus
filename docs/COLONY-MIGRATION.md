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
| Ágensprofilok, eszköztár | `agents/agent-profiles.ts`, `agents/tool-registry.ts` |
| Tanulás | `neural/moe-router.ts`, `neural/reasoning-bank.ts` |
| Host-vezérelt CLI | `cli.ts`, `cli/*` |

Ellenőrizve: tiszta telepítés után `pnpm build` hibátlan, és a `pnpm test` 30 tesztje mind zöld. Teszt még hiányzik a `ColonyHub`, `FileVectorStore`, `moe-router` és `reasoning-bank` modulokhoz.

## Host-vezérelt irány (2026-10-31)

Nincs API-kulcs: a host (Cowork) maga a modell, a mag csak főkönyv. Ehhez készült:
- `cli/session.ts`: állapot betöltése és mentése (`.colony/ledger.json`, `.colony/memory.json`), boot (`LOADED` / `UNVERIFIABLE` / `BLOCKED`), revízió-feloldás.
- `cli/commands.ts` és `cli.ts`: a `colony` parancs (boot, status, task, next, done, fail, propose, vote, memory).
- `snapshot()` / `restore()` a nyilvántartásban, az orchestratorban és a konszenzusmotorban.
- Szabálybetöltés a bootban: `.colony/rules/manifest.json` + kötelező szabályfájlok, hash-elve, driftvédelemmel (`cli/default-rules.ts` a kezdőkészlet).
- 15 CLI-teszt a teljes munkafolyamatra és a szabályokra (összesen 30 teszt, mind zöld).

Következmény: a modellszolgáltatós részek kivezetve (lásd a 2. szakaszt).

## Átépítés, 1. szakasz: a Ruflo-kód félretétele (kész)

A teljes Ruflo-kód (8316 fájl) a `legacy/ruflo/` alá került `git`-átnevezésként, tartalmi változtatás nélkül, a fájlok előzménye követhető. Ezzel:
- a gyökér tiszta Colony-azonosságot kapott: új `package.json` (`pnpm build` és `pnpm test` a `colony-core`-ra), új `.gitignore`, rövid `AGENTS.md`, `START_HERE.md`, `README.md`;
- a régi `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.agents/` és `.githooks/` nem töltődik be a gyökérből indított hostokon;
- a 36 régi workflow `legacy/ruflo/.github/workflows/` alatt van, és nem fut;
- a `colony-core` változatlan, és nem hivatkozik a régi kódra.

A visszaállítás egyszerű: a `legacy/ruflo/` tartalma visszamozgatható a gyökérbe.

## Átépítés, 2. szakasz: az LLM-függés kivezetése (kész)

A magban nincs többé modellszolgáltató, hálózati hívás vagy API-kulcs. Törölve:
- `llm/providers.ts` (Gemini, OpenAI-kompatibilis adapterek);
- `OpenAiCompatibleEmbeddingProvider` az `embedding-providers.ts` fájlból (marad a helyi, determinisztikus beágyazás);
- `github-runner.ts` és a `kristal-colony-runner.yml` workflow (a repóban nem marad futó workflow);
- `agents/colony-worker.ts` (a munkát a host végzi a `next` / `done` parancsokon át) és a hozzá tartozó `example.ts`, `example-neural.ts`;
- `legacy/ruflo/CLAUDE.local.md` (személyes helyi beállításfájl).

A `colony-core` build és mind a 30 teszt változatlanul zöld.

A Ruflo a Colonynak csak váz, egy része: amit átvesz, azt modellszolgáltató nélkül veszi át.

## Még hátra

| Terület (`legacy/ruflo/` alatt) | Megjegyzés |
|---|---|
| `v3/@claude-flow/*` | A Ruflo CLI, MCP, biztonsági és codex csomagjai (4247 fájl). A „swarm” szó kb. 2000 fájlban szerepel. |
| `plugins/ruflo-*` | 40+ plugin (2245 fájl). Döntés kell, melyik kell a Colonyban. |
| `ruflo/`, `plugin/` | A Ruflo csomag és a Claude Code plugin. |
| `.claude/`, `.agents/`, `.harness/` | Claude/Codex-specifikus konfiguráció. |
| `Cargo.toml`, `crates/` | Rust federációs rész. |

## Javasolt sorrend a folytatáshoz

1. **Plugin- és csomagleltár:** minden `ruflo-*` pluginra és `@claude-flow/*` csomagra döntés: átvesz / újraír / kivezet. A kivezetettek törlése.
2. **Licenc és eredet:** az eredeti `LICENSE` és a szerzői jogi nyilatkozat beszerzése a forrásprojektből. A megmaradó átvett kód jelölése.
3. **Tesztek bővítése:** `ColonyHub`, `FileVectorStore`, `moe-router`, `reasoning-bank`.
4. **A plant.md hiányzó fázisai** (V., VI.) pontosítása. Kód nincs hozzájuk.