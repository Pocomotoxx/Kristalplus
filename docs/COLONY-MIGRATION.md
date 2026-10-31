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
- Szabálybetöltés a bootban: `.colony/rules/manifest.json` + kötelező szabályfájlok, hash-elve, driftvédelemmel (`cli/default-rules.ts` a kezdőkészlet).
- 15 CLI-teszt a teljes munkafolyamatra és a szabályokra (összesen 30 teszt, mind zöld).

Következmény: a `llm/providers.ts`, a `ColonyWorker` (saját végrehajtás) és a `github-runner` + workflow a host-vezérelt úton nem kell. Döntés kell: kivezetés vagy opcionális marad.

## Átépítés, 1. szakasz: a Ruflo-kód félretétele (kész)

A teljes Ruflo-kód (8316 fájl) a `legacy/ruflo/` alá került `git`-átnevezésként, tartalmi változtatás nélkül, a fájlok előzménye követhető. Ezzel:
- a gyökér tiszta Colony-azonosságot kapott: új `package.json` (`pnpm build` és `pnpm test` a `colony-core`-ra), új `.gitignore`, rövid `AGENTS.md`, `START_HERE.md`, `README.md`;
- a régi `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.agents/` és `.githooks/` nem töltődik be a gyökérből indított hostokon;
- a 36 régi workflow `legacy/ruflo/.github/workflows/` alatt van, és nem fut. Az egyetlen aktív workflow a `kristal-colony-runner.yml`;
- a `colony-core` változatlan, és nem hivatkozik a régi kódra.

A visszaállítás egyszerű: a `legacy/ruflo/` tartalma visszamozgatható a gyökérbe.

## Még hátra

| Terület (`legacy/ruflo/` alatt) | Megjegyzés |
|---|---|
| `v3/@claude-flow/*` | A Ruflo CLI, MCP, biztonsági és codex csomagjai (4247 fájl). A „swarm” szó kb. 2000 fájlban szerepel. |
| `plugins/ruflo-*` | 40+ plugin (2245 fájl). Döntés kell, melyik kell a Colonyban. |
| `ruflo/`, `plugin/` | A Ruflo csomag és a Claude Code plugin. |
| `.claude/`, `.agents/`, `.harness/` | Claude/Codex-specifikus konfiguráció. |
| `Cargo.toml`, `crates/` | Rust federációs rész. |
| `CLAUDE.local.md` | Személyes, helyi beállításfájl, amely nem való a repóba. Törlendő vagy átnézendő. |

## Javasolt sorrend a folytatáshoz

1. **Plugin- és csomagleltár:** minden `ruflo-*` pluginra és `@claude-flow/*` csomagra döntés: átvesz / újraír / kivezet. A kivezetettek törlése.
2. **Licenc és eredet:** az eredeti `LICENSE` és a szerzői jogi nyilatkozat beszerzése a forrásprojektből. A megmaradó átvett kód jelölése.
3. **Tesztek bővítése:** `ColonyHub`, `ColonyWorker`, szolgáltatók (mockolt `fetch`-csel), `FileVectorStore`, `moe-router`, `reasoning-bank`.
4. **A plant.md hiányzó fázisai** (V., VI.) pontosítása. Kód nincs hozzájuk.
5. **Runner és szolgáltatók sorsa:** kivezetés vagy opcionális marad. A workflow `contents: write` joggal fut issue-kommentre, ezért legalább korlátozni kell, kik indíthatják (pl. `author_association`).
