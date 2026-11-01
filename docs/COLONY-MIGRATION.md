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

## Átépítés, 3. szakasz: a Ruflo-válogatás C listájának törlése (kész)

A [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md) C listája törölve: 5552 fájl (8316-ról 2764-re csökkent a `legacy/ruflo`). Törölve:
- 12 `v3/@claude-flow` csomag (köztük `cli`, `providers`, `codex`, `browser`, `watermark`);
- 30 LLM- vagy hostfüggő, illetve domain-specifikus plugin (köztük a 786 fájlos `ruflo-console`);
- a Claude/Codex-konfiguráció (`.claude/`, `.agents/`, `.claude-plugin/`, `plugin/`, `chatgpt-plugin/`, `CLAUDE.md`, `AGENTS.md`), a `ruflo/` burkoló, a `v3/goal_ui`, `v3/implementation` és `v3/docs`.

Az A lista csomagjai a törlés előtt ellenőrizve: egyik sem függött a törölt csomagoktól. A Colony build és mind a 30 teszt zöld.

## Átépítés, 4. szakasz: az A lista átvétele (folyamatban)

| Csomag | Állapot |
|---|---|
| `swarm` | **Részben átvéve:** topológia (`topology.ts`), kvórum-stratégiák (`consensus/strategies.ts`), CLI: `topology` és `propose --strategy`. A nagy koordinátorokat (queen, unified, attention, worker-dispatch, federation-hub) még át kell nézni. A részletek: [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md). |
| `claims` | **Részben átvéve:** `coordination/claim-ledger.ts` (foglalás, életjel, blokkolás, elavulás, átvétel, átadás), CLI: `claim ...`. Az összevonás és a szövetséges (federated) tár nem. A részletek: [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md). |
| `memory` | **Részben átvéve:** `memory/hnsw-index.ts` (determinisztikus HNSW), a `FileVectorStore` használja. A többi nem. Részletek: [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md). |
| `guidance` | **Részben átvéve:** `gates.ts` (kapuk) és a `check` parancs. A többi nem. Részletek: [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md). |
| `security` | **Részben átvéve:** `safe-path.ts` (útvonal-tartalmazás symlinkkel), `safe-git.ts`. A többi nem. Részletek: [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md). |
| `shared` | **Részben átvéve:** `audit-log.ts` (hash-láncolt, csak hozzáfűzhető napló), `audit` parancs. A többi nem. Részletek: [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md). |
| `neural` | **Részben átvéve:** a MoE-router kimenetből tanul, terheléselosztási statisztika, `route` parancs. A többi nem. Részletek: [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md). |
| `aidefence` | **Átvéve (a fenyegetésfelismerés):** `injection-scan.ts`, `scan` parancs, a `memory add` kapuja. A tanuló szolgáltatás (`threat-learning-service`) nem. Részletek: [LEGACY-INVENTORY.md](LEGACY-INVENTORY.md). |
| `plugin-agent-federation`, `performance` | Még nem kezdtük el. |

136 teszt zöld.

## Még hátra

| Terület (`legacy/ruflo/` alatt) | Megjegyzés |
|---|---|
| `v3/@claude-flow/` A lista | `swarm`, `claims`, `neural`, `memory`, `shared`, `security`, `guidance`, `aidefence`, `plugin-agent-federation`, `performance`: átvétel egyenként, kolónia-szóhasználattal. |
| `v3/@claude-flow/` B lista | `hooks`, `embeddings` (csak a helyi rész), `mcp`: döntés, ha szükség lesz rájuk. |
| `plugins/` (18 maradt) | `ruflo-adr`, `-agentdb`, `-aidefence`, `-arena`, `-daa`, `-ddd`, `-federation`, `-goals`, `-graph-intelligence`, `-knowledge-graph`, `-observability`, `-protector`, `-rag-memory`, `-ruvector`, `-rvf`, `-security-audit`, `-swarm`, `-workflows`. Egyenként döntés. |
| `v3/crates`, `Cargo.toml`, `crates/` | Rust federációs rész, csak a federációval együtt. |
| `docs/`, `scripts/`, `tests/`, `.github/`, `.harness/`, gyökérfájlok | Maradék Ruflo-anyag. Az átvétel végén törlendő. |

## Javasolt sorrend a folytatáshoz

1. **Az A lista átvétele:** `swarm` → `claims` → `memory` → `guidance` → `security`, egyenként, szolgáltatóra utaló részek nélkül, tesztekkel. A B lista és a maradék pluginok egyenként.
2. **Licenc és eredet:** az eredeti `LICENSE` és a szerzői jogi nyilatkozat beszerzése a forrásprojektből. A megmaradó átvett kód jelölése.
3. **Tesztek bővítése:** `ColonyHub`, `FileVectorStore`, `moe-router`, `reasoning-bank`.
4. **A plant.md hiányzó fázisai** (V., VI.) pontosítása. Kód nincs hozzájuk.