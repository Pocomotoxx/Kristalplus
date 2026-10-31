# Kristalplus – Kristal Colony

Modellfüggetlen, többágenses **kolónia-orkesztrátor** TypeScriptben. A feladatokat egy kolónia dolgozói osztják fel és hajtják végre közös, vektoros memóriával, szavazásos döntéshozatallal és tanulással. Az egész GitHub Actions alól is futtatható.

> **Állapot: átmenet alatt.** A projekt a Ruflo / Claude Flow v3 rajalapú architektúrájából indult, de már csak inspirációs alap. Az új mag a [`packages/colony-core`](packages/colony-core). A repó többi része (`v3/`, `plugins/`, `ruflo/`, `plugin/`) még a régi Ruflo-kód, és fokozatosan lesz átírva vagy kivezetve. Részletek: [docs/COLONY-MIGRATION.md](docs/COLONY-MIGRATION.md) és [plant.md](plant.md).

## Fogalmak

A korábbi „raj” (swarm) helyett mindenhol **kolónia** (colony) a terminológia.

| Régi (Ruflo) | Új (Colony) |
|---|---|
| Swarm | Colony |
| Queen / coordinator | `ColonyHub` (vezérlő) |
| Agent registry | `ColonyRegistry` |
| Task orchestration | `ColonyTaskOrchestrator` |
| Worker agent | `ColonyWorker` |

## Mit tud a `colony-core`

- **Koordináció:** ágensnyilvántartás (kapacitás, `idle`/`busy`/`offline`), feladatbontás függőségekkel, automatikus delegálás, eseménybusz témákkal és wildcarddal.
- **Konszenzus:** kvórum- és megbízhatósággal súlyozott szavazás.
- **Memória (Vector Codex):** szolgáltatófüggetlen embedding-felület, koszinusz-hasonlóságú vektortár névterekkel, fájlalapú perzisztencia a `.colony/memory.json` fájlban.
- **Ágensek:** beépített profilok (Director, Architect, Coder, Reviewer, Tester, Security) és zod-alapú, típusbiztos eszköztár.
- **Tanulás:** MoE-router és Reasoning Bank, amely a korábbi tapasztalatokat visszatáplálja.
- **LLM-ek:** Google Gemini, valamint OpenAI-kompatibilis végpontok (OpenAI, OpenRouter, Ollama). API-kulcs nélkül determinisztikus offline tartalék működik.
- **GitHub-futtató:** a `kristal-colony-runner` issue-ból, `/colony` kommentből, `colony` címkéből vagy kézzel indítható, és a megújult `.colony/` tudástárat visszacommitolja.

## Gyors indítás

Szükséges: Node.js 20+ és pnpm.

```bash
cd packages/colony-core
pnpm install
pnpm build
node dist/example.js
```

Egy feladat futtatása a runnerrel:

```bash
node dist/github-runner.js "Feladat címe" "Feladat leírása"
```

A feladat környezeti változókból is megadható (`COLONY_TASK_TITLE`, `COLONY_TASK_DESC`). Az eredmény a `.colony/outputs/` mappába kerül.

### Környezeti változók

| Változó | Szerep |
|---|---|
| `GEMINI_API_KEY` | Gemini szolgáltató |
| `OPENAI_API_KEY` | OpenAI-kompatibilis szolgáltató és embedding |
| `OPENAI_BASE_URL` | Alternatív végpont (OpenRouter, Ollama stb.) |

Kulcsot soha ne commitolj. A GitHub Actions futásban repository secretként add meg.

## Repó felépítése

```
packages/colony-core/   az új mag (TypeScript, ESM, strict)
.github/workflows/      kristal-colony-runner.yml (+ régi Ruflo workflow-k)
plant.md                migrációs terv
docs/COLONY-MIGRATION.md   migrációs térkép és hátralévő munka
v3/, plugins/, ruflo/, plugin/   régi Ruflo-kód (átírandó vagy kivezetendő)
```

## Ismert hiányok

- A `colony-core` csomagban még nincsenek automatikus tesztek (a `pnpm test` üres).
- A `plant.md` V. és VI. fázisa nincs leírva, és nincs bennük kész kód.
- A repó gyökere (`package.json`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`) még Ruflo-azonosságot mutat.

## Eredet és licenc

A projekt a Ruflo / Claude Flow (ruvnet) nyílt forráskódú munkájából inspirálódott, és a repó még tartalmazza annak kódját. Az átvett részek licencfeltételeit a végleges kivezetés előtt ellenőrizni kell. A `colony-core` saját, újraírt kód.
