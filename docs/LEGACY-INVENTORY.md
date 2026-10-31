# A `legacy/ruflo` leltára és válogatás

Állapot: 2026-10-31. **A C lista törölve** (5552 fájl, külön commit, a git-előzményben megvan). Az A és B lista még javaslat: abból semmi nem lett átvéve vagy törölve.

A törlés előtt ellenőriztem, hogy az A lista egyik csomagja sem függ a törölt csomagoktól (a `package.json` függőségei alapján).

## Hogyan készült

- A csomagok és pluginok leírásából (`package.json`, `plugin.json`), fájlszámból és kódméretből.
- A forráskódban (teszt, dist és node_modules nélkül) kerestem szolgáltatóra, API-kulcsra és Claude Code-ra utaló szövegeket (`anthropic`, `openai`, `gemini`, `ollama`, `api_key`, `fetch(`, `Claude Code`). A találatok **fájlszámok**, nem egyenként átnézett hibák.
- A kód tartalmát csak ezen a szinten néztem meg. Átvétel előtt minden csomagot át kell olvasni.

Szempont: a Colony host-vezérelt, nincs benne modellszolgáltató, hálózati hívás és API-kulcs. A Ruflo egy váz: az kerül át, ami a Colony koordinációját, memóriáját, biztonságát és szabályait erősíti.

## A. Átvételre javasolt váz (v3 csomagok)

| Csomag | Fájl | Forrássor | Szolgáltatóra utaló fájl | Mit adhat a Colonynak |
|---|---|---|---|---|
| `swarm` | 101 | ~17 900 | 0 | Koordináció, topológiák, hive-mind, konszenzus. A Colony `ColonyHub` és `ConsensusEngine` egyenes párja: kolóniává átnevezve ez a legfontosabb váz. |
| `claims` | 35 | ~9 200 | 1 | Munkafoglalás és koordináció. A feladatkiosztás és a „ki dolgozik mit” logika. |
| `neural` | 82 | ~14 400 | 1 | Adaptív tanulás, minta-újrahasznosítás, MoE-routing. A Colony egyszerű routerét és Reasoning Bankját lehetne vele erősíteni. |
| `memory` | 127 | ~17 800 | 7 | HNSW vektorkeresés, hibrid tár. A `FileVectorStore` lineáris keresését válthatná ki. A szolgáltatóra utaló részeket le kell vágni. |
| `shared` | 104 | ~20 900 | 6 | Közös típusok, események, segédek. Csak a ténylegesen használt részt érdemes átvenni. |
| `security` | 73 | ~8 000 | 6 | Bemenet-ellenőrzés, útvonalbiztonság. Hasznos a CLI-hez. |
| `guidance` | 127 | ~20 000 | 6 | Szabályok fordítása, visszakeresése és kikényszerítése. A Colony szabályrendszerének fejlesztési iránya. |
| `aidefence` | 17 | ~1 200 | 1 | Prompt-injekció és PII-felismerés. Bemeneti és kimeneti kapu lehet. |
| `plugin-agent-federation` | 69 | ~7 600 | 1 | Telepítések közti ügynökfederáció, nulla bizalom, audit. Későbbi funkció. |
| `performance` | 27 | ~1 800 | 0 | Benchmark. Opcionális. |

Összesen kb. 760 fájl a ~8300-ból.

## B. Eldöntendő (nem egyértelmű)

| Elem | Miért kérdéses |
|---|---|
| `hooks` (35 fájl) | Életciklus-hookok, de 5 fájl Claude Code-ra hivatkozik. Csak az általános eseménymodell hasznos. |
| `embeddings` (35) | Van benne helyi (ONNX, Transformers.js), chunkolás és normalizálás, de OpenAI-adapter is. Csak a helyi rész jöhet szóba. |
| `mcp` (265) | Önálló MCP-szerver. Opcionális adapter lehet a CLI fölé, ha a host MCP-t akar. |
| `v3/crates` (28) | Rust federációs peer. Csak a federációval együtt. |
| Pluginok, ha a fogalom kell: `ruflo-swarm`, `ruflo-adr`, `ruflo-goals`, `ruflo-protector`, `ruflo-observability`, `ruflo-security-audit`, `ruflo-federation`, `ruflo-workflows`, `ruflo-ddd`, `ruflo-knowledge-graph`, `ruflo-graph-intelligence`, `ruflo-arena`, `ruflo-daa` | Fogalmilag a Colonyhoz illenek (célok, ADR-ek, watchdog, megfigyelhetőség), de Claude Code-pluginként vannak megírva. Egyenként kell dönteni. |
| Memóriaszubsztrát-pluginok: `ruflo-rag-memory`, `ruflo-agentdb`, `ruflo-rvf`, `ruflo-ruvector` | Külső eszközökre (`npx ruvector`) épülnek. Csak akkor, ha a helyi memória fejlesztéséhez kell. |

## C. Törlésre javasolt

**Modellszolgáltatóhoz, LLM-hez vagy a hostgyártóhoz kötött csomagok:**
`providers`, `codex`, `watermark`, `browser`, `integration`, `cli`, `cli-core`, `plugins` (a Provider-SDK), `deployment`, `testing`, `plugin-iot-cognitum`, `agents`.

**Pluginok:** `ruflo-console` (786 fájl, Claude Code cockpit), `ruflo-mods`, `ruflo-core`, `ruflo-cost-tracker` (token- és modellköltség), `ruflo-deepseek-harness`, `ruflo-ruvllm`, `ruflo-chatgpt-federation`, `ruflo-ai-team`, `ruflo-intelligence`, `ruflo-loop-workers`, `ruflo-autopilot`, `ruflo-agent`, `ruflo-metaharness`, `ruflo-plugin-creator`, `ruflo-browser`, `ruflo-jujutsu`, `ruflo-migrations`, `ruflo-testgen`, `ruflo-docs`, `ruflo-sparc`.

**Domain-specifikus vagy a Colonytól távoli pluginok:** `ruflo-music`, `ruflo-neural-trader`, `ruflo-market-data`, `ruflo-iot-cognitum`, `ruflo-rure`, `ruflo-ruos`, `ruflo-agntcy`, `ruflo-bbs-federation`, `ruflo-x-gateway`, `ruflo-business-pods`.

**Egyéb:** a Claude/Codex-konfiguráció (`.claude/`, `.agents/`, `.claude-plugin/`, `plugin/`, `chatgpt-plugin/`, a gyökér `CLAUDE.md` és `AGENTS.md`), a `ruflo/` csomag (529 forrásfájl, a Ruflo CLI burkolója), a `v3/goal_ui`, `v3/implementation` és a `v3/docs`.

## Teendők, ha elfogadod

1. A **C** lista törlése egy külön commitban (a git-előzményben megmarad).
2. Az **A** lista csomagjainak átvétele egyenként, kolónia-szóhasználattal, szolgáltatóra utaló részek nélkül, tesztekkel. Javasolt sorrend: `swarm` → `claims` → `memory` → `guidance` → `security`.
3. A **B** lista elemeiről egyenként döntés, amikor a szükségletük felmerül.
4. A `legacy/ruflo` az átvétel végére kiürül vagy törölhető.
