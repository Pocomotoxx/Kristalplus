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

## Átvételi napló

### `swarm` (részben átvéve)

Átírva, nem másolva: a régi kód EventEmitter-re, időzítőkre és `Math.random()`-ra épül, a Colony pedig determinisztikus.

| Régi elem | Mi lett belőle |
|---|---|
| `topology-manager.ts` (634 sor): mesh, hierarchical, centralized, hybrid | `topology.ts`: `mesh`, `star`, `tree`, `hybrid`. Tiszta függvények, véletlen és időzítő nélkül, vezetőválasztás, szomszédok, legrövidebb út. A CLI-ben a `topology` parancs. |
| `consensus/raft.ts`, `byzantine.ts`: kvórumszámítás | `consensus/strategies.ts`: `majority`, `supermajority`, `byzantine`, `unanimous`. A `ConsensusEngine` stratégiából is tud kvórumot számolni, és azonnal elutasít, ha a kvórum elérhetetlen. A CLI-ben `propose --strategy`. |

Amit **nem** vettem át:
- **Raft-, gossip- és Byzantine-üzenetprotokoll, transport** (`raft.ts`, `gossip.ts`, `transport.ts`, `federation-transport.ts`): hálózati replikáció időzítőkkel és véletlennel. A Colonynak egyetlen főkönyve van, ezért csak a döntési szabályok kellettek.
- **Eltérés a régi kódtól:** a régi Raft (`raft.ts`, `checkConsensus`) a kvórumot `floor(szavazók × küszöb)` képlettel számolta. A 0,66-os alapértelmezett tartalékküszöbbel ez 3 szavazónál 1, tehát egyetlen igen elég lett volna. (A konstruktor egy másik alapértelmezést is átadhat, azt nem néztem meg.) Az új `supermajority` szabály `ceil(2n / 3)`, ami 3 szavazónál 2.
- **`queen-coordinator.ts` (1775 sor), `unified-coordinator.ts` (1822), `attention-coordinator.ts` (850), `worker-dispatch.ts` (1011), `federation-hub.ts` (863), `agent-pool.ts`, `message-bus.ts`, `domain/`, `application/`:** ezeket nem olvastam át. A nevük és méretük alapján nagyrészt a `ColonyHub`, a nyilvántartás és az eseménybusz funkcióit duplikálják. Átvétel előtt át kell nézni, van-e bennük olyan, ami a Colonyból hiányzik.

A `legacy/ruflo/v3/@claude-flow/swarm` mappa ezért még nem törölhető.

### `claims` (részben átvéve)

Átírva: `coordination/claim-ledger.ts`. Az idő paraméter, nincs időzítő, véletlen vagy eseménykibocsátó. A foglalás kulcsa a feladat azonosítója, így nincs véletlen azonosító. Olvasott forrás: `domain/types.ts`, `domain/rules.ts`. A `claim-service.ts`, `work-stealing-service.ts` és `load-balancer.ts` fájlokat **nem** olvastam át; a szabályokat a `rules.ts` alapján vettem át.

| Régi elem | Mi lett belőle |
|---|---|
| Állapotok (`active`, `blocked`, `pending_handoff`, `stealable`, ...) | `active`, `blocked`, `handoff_pending`, `stealable`, `closed` (a lezárás eredménye: `completed`, `failed`, `released`). |
| `canMarkAsStealable`: elavulás 30 perc, blokkolás 60 perc | `sweep(now)`, ugyanazokkal az alapértékekkel. |
| `canStealClaim`, türelmi idő | `steal(...)`: állapot, türelmi idő (10 perc), saját foglalás tilos, a jelentkező kapacitása. |
| `canInitiateHandoff`, `canAcceptHandoff`, `canRejectHandoff` | `requestHandoff`, `acceptHandoff`, `rejectHandoff`, ugyanazokkal a jogosultságokkal. |

Eltérések a régi kódtól, szándékosan:
- **Nincs előrehaladás-védelem.** A régi szabály a 75% fölötti foglalást nem engedte átvenni. Egy elhalt gazdagép-munkamenet 80%-nál így örökre blokkolná a feladatot. Az átvétel rögzíti a korábbi előrehaladást (`previousProgress`), az új gazda ebből látja, hol tartott a munka.
- **Nincs vitatási ablak és királynő/ember döntőbíró.** Az átvétel végleges. Ha szavazás kell, ott a konszenzusmotor.
- **Nincs terheléskiegyenlítés** (`load-balancer.ts`, `rebalance`). A kapacitás a tagok `maxConcurrentTasks` értéke.
- **Nincs szövetséges (federated) tár, HLC és vektoridő** (`infrastructure/`): egyetlen főkönyv van.
- **Nincs MCP- és CLI-réteg** (`api/`): a Colony saját CLI-je van.

A `legacy/ruflo/v3/@claude-flow/claims` mappa ezért még nem törölhető.

### `memory` (részben átvéve)

Átírva: `memory/hnsw-index.ts`. Olvasott forrás: `hnsw-index.ts` (a keresés, beszúrás, eltávolítás és szerializálás része). A többi fájlt (kb. 19 000 sor) **nem** olvastam át.

| Régi elem | Mi lett belőle |
|---|---|
| `HNSWIndex`: a réteget `Math.random()` adta | A réteg az azonosító hash-éből jön, a döntetlent az azonosító dönti el: ugyanabból a beszúrássorozatból mindig ugyanaz a gráf. |
| Eltávolítás, keresés, koszinusz-távolság | Átírva. Eltávolításkor a szomszédok kapcsolatait javítja. |
| `FileVectorStore` lineáris keresése | `index: 'auto'` (alapérték): 500 vektorig pontos lineáris keresés, fölötte HNSW. Névtérszűrésnél, ha a gráf kevés találatot ad, pontos keresésre vált. |

Amit **nem** vettem át: kvantálás, bináris szerializálás (a gráf a dokumentumokból újraépül), eseménykibocsátó, SQLite/sql.js/AgentDB/RVF háttértárak, `hybrid-backend`, `tiered-memory`, `smart-retrieval`, `consolidator`, `memory-graph`, `learning-bridge`, `auto-memory-bridge`, `controller-registry`. Ezeket átvétel előtt át kell nézni, és a külső adatbázisokra épülőket valószínűleg nem kell.

A HNSW közelítő: a tesztben 1500 vektoron, 16 dimenzióban a találatok legalább 90%-a egyezik a pontos kereséssel. Ez egy mérés egy szintetikus adaton, nem garancia.

A `legacy/ruflo/v3/@claude-flow/memory` mappa ezért még nem törölhető.

### `guidance` (részben átvéve)

Átírva: `gates.ts` és a `check` parancs. Olvasott forrás: `gates.ts`. A csomag többi része (kb. 22 000 sor) **nincs** átnézve.

| Régi elem | Mi lett belőle |
|---|---|
| `EnforcementGates`: romboló műveletek, titkok, diff-méret, eszköz-engedélylista | Négy tiszta függvény (`checkDestructive`, `checkSecrets`, `checkDiffSize`, `checkToolAllowed`) és `aggregateDecision`. |
| Titok kimaszkolása az első és utolsó 4 karakter mutatásával | **Nem mutat belőle semmit**: csak a minta neve és a pozíció szerepel az eredményben. |
| `rm -rf` minta | Szélesebb: `rm -fr`, `rm -r -f`, `git push -f`, idézőjelben lévő `DELETE FROM x`. |

Fontos korlát: a régi csomag a „kapu" szót hookokra építette („a modell felejthet, a hook nem"). A Colonyban a kapu egy ellenőrzés, amit a host hív (`colony check`). Semmi nem akadályozza meg, hogy a host kihagyja, ezért egy kapu megléte nem bizonyítja, hogy a munka átment rajta.

Amit **nem** vettem át, és még át kell nézni: `compiler` (szabályok fordítása), `retriever` (szabálykeresés feladat szerint; a Colony szándékosan minden szabályt a bootban tölt), `ledger`, `optimizer`, `evolution`, `trust`, `authority`, `capabilities`, `proof`, `conformance-kit`, `analyzer` (3260 sor), `ruvbot-integration`, `wasm-kernel`, `headless`.

A `legacy/ruflo/v3/@claude-flow/guidance` mappa ezért még nem törölhető.

### `security` (részben átvéve)

Átírva: `safe-path.ts`, `safe-git.ts`. Olvasott forrás: `path-validator.ts` (az első 330 sor), `safe-git.ts`. A csomag többi része (kb. 8800 sor) **nincs** átnézve.

Két valódi rést zártak be, mindkettő a Colony saját kódjában volt:
- **Symlink/junction kiszökés.** A szabályfájlok és a `check --file` addig csak szövegesen ellenőrizték az útvonalat (`..`-ra nézett). Egy, a projekten belüli link, ami kifelé mutat, átment rajta, és a boot kimenete a kívüli fájl tartalmát is kiírta volna. Most a gyökér és a jelölt is a fájlrendszeren át feloldott alakban kerül összehasonlításra (a még nem létező fájlnál a legközelebbi létező szülő). Teszt: junctionnel, szabályfájlra és `check --file`-ra.
- **`core.fsmonitor`.** A bootban a `git status` egy másolt vagy ellenséges repó helyi konfigurációja által megadott parancsot is lefuttat. Kézzel ellenőriztem: védelem nélkül a parancs lefut, `-c core.fsmonitor=false` mellett nem. Minden git-hívás ezen megy át. Ez egyetlen ismert utat zár le, nem állítom, hogy minden git-beállítást semlegesít.

Eltérés a régi kódtól: a régi `..` részszöveg-tiltás az `a..b` nevű fájlt is elutasítja, itt nem: a feloldott útvonal dönt. A régi kiterjesztés- és névtiltólistát (`.env`, `id_rsa`, `.git`, ...) nem vettem át.

Amit **nem** vettem át és még át kell nézni: `safe-executor`, `input-validator`, `token-generator`, `password-hasher`, `credential-generator`, `tool-output-guardrail`, `mcp-*`, `policy/*` (köztük `product-plane`, 1381 sor), `oauth/*`, `keychain-adapter`, `plugins/integrity-verifier`, `authorization/*`, `CVE-REMEDIATION`. Az OAuth, jelszó, token és kulcstár eleve nem illik a hálózat- és kulcsmentes maghoz.

A `legacy/ruflo/v3/@claude-flow/security` mappa ezért még nem törölhető.

### `shared` (részben átvéve)

A csomag egy gyűjtőfiók (kb. 23 700 sor: MCP-szerver, hookok, bővítmény-betöltő, eseménytár, ellenálló réteg). Olvasott forrás: az `events/event-store.ts` első 330 sora. A többi **nincs** átnézve.

Átvett ötlet: a csak hozzáfűzhető eseménynapló, aggregátumonkénti verzióval. Átírva: `audit-log.ts`.

| Régi elem | Mi lett belőle |
|---|---|
| SQLite (sql.js, WASM) eseménytár, időzített mentés, EventEmitter | Egyszerű JSONL-fájl (`.colony/audit.jsonl`), mentés a parancs végén, nincs időzítő. |
| Verzió aggregátumonként | Megvan (`version`), és az ellenőrzés a hibás verziót is elfogja. |
| (nem volt) | **Hash-lánc**: minden bejegyzés a saját és az előző SHA-256-ját viseli. A boot rögzíti a napló végét, a következő boot ellenőrzi, hogy a napló még tartalmazza. |

Korlátok, nyíltan:
- Nincs aláírás. Aki a fájlt átírja és minden hash-t újraszámol, érvényes láncot kap. A rögzített napló-vég (horgony) csak a két boot közötti átírást vagy levágást fogja meg.
- A napló nem bizonyítja, hogy a hostok tényleg azt tették, amit a parancsaikban mondtak. Azt rögzíti, mit kértek a Colonytól.
- A szabad szöveg (eredmény, hibaszöveg, ellenőrzött parancs) szándékosan nincs benne, mert titkot tartalmazhat.

Amit **nem** vettem át: `projections`, `state-reconstructor` (események visszajátszása állapottá; a Colony állapota pillanatkép), `rvf-event-log`, az MCP-szerver és -átvitelek, a hookrendszer, a bővítmény-betöltő, a megszakító és sebességkorlátozó (`resilience/`, hálózatra), a konfigbetöltő.

A `legacy/ruflo/v3/@claude-flow/shared` mappa ezért még nem törölhető.

### `neural` (részben átvéve)

Átírva: `neural/moe-router.ts` (a meglévő router kibővítve). Olvasott forrás: a régi `moe-router.ts` útvonalválasztása, súlyfrissítése, terheléskiegyenlítése és a Gini-számítás (kb. 480 sor a 882-ből). A csomag többi része (kb. 13 900 sor) **nincs** átnézve.

| Régi elem | Mi lett belőle |
|---|---|
| Kétrétegű kapuhálózat, 384 dimenziós ONNX-beágyazás, véletlen kezdősúlyok (`Math.random()`), REINFORCE-frissítés | **Nem vettem át.** Beágyazásmodellt igényel, és véletlen kezdősúlyok mellett nem reprodukálható. Helyette szavankénti súly: minden kimenet a feladat szavainak súlyát a szerep felé (vagy attól el) mozdítja, `tanulási ráta * jutalom`, felső korláttal. Tiszta összeg, determinisztikus. |
| `updateExpertWeights(expert, reward)` | `recordOutcome(szöveg, szerep, jutalom)`; a jutalom -1..1 közé vágva. |
| `getLoadBalance()`, Gini-együttható | Átvéve (`getLoadBalance`), a szerepek között. |
| Zajos felfedezés, top-k, tárolt súlyfájl | Nem. A súlyok a `ledger.json`-ban vannak (`router`). |

Amit a router tanul, azt a host jelentette: a `done` +0,5 (nem 1, mert csak jelentett), a `fail` -1, a `route teach` kézi. Ez nem ellenőrzött minőség. Egy szabály nélküli szerep (például `analyst`) is megtanulható, de csak tanítással kerül be a jelöltek közé.

Ismert gyengeség, a teszt közben derült ki: a szabályok kulcsszavai sima részszöveg-egyezéssel keresnek, ezért a `pr` kulcsszó a „spreadsheet" szóban is megtalálható. Ez a régi (és az eddigi Colony-) viselkedés, nem változtattam rajta.

Amit **nem** vettem át és még át kell nézni: a megerősítéses tanulás algoritmusai (`q-learning`, `sarsa`, `dqn`, `ppo`, `a2c`, `curiosity`, `decision-transformer`), a tanulási módok (`modes/`), `pattern-learner`, `sona-manager`, `sona-integration`, `flash-attention`, `reasoning-bank` és `reasoningbank-adapter` (a Colonynak van saját, kisebb Reasoning Bankja), `utils/rng` (egy seedelt véletlenszám-generátor, hasznos lehet, ha egyszer kell). Ezek nagy része modellképzéshez tartozik, amit a host-vezérelt mag nem végez.

A `legacy/ruflo/v3/@claude-flow/neural` mappa ezért még nem törölhető.

### `aidefence` (a fenyegetésfelismerés átvéve)

Átírva: `injection-scan.ts`. Olvasott forrás: `threat-detection-service.ts` és `entities/threat.ts` teljesen; a `threat-learning-service.ts` (409 sor) és az `index.ts` (344 sor) **nincs** átnézve.

Hibák és gyengeségek a régi kódban, amiket átíráskor kijavítottam:
- A `disable your safety filter` minta hibás volt (a „safety" és a „filter" közt hiányzott a szóköz), ezért pont arra a mondatra nem szólt, amelyre írták. A teszt hozta elő.
- A `DAN` minta `/i` jelzővel a „Dan" nevet is dzsailbreaknek látta. Most csak nagybetűs `DAN`.
- A `system:` minta („system" kettősponttal, bárhol a szövegben) a „the file system: ext4"-re is riasztott. Most a sor elején kell állnia.
- A bankkártya-minta bármilyen 16 számjegyet találatnak vette. Most Luhn-ellenőrzés kell hozzá.
- A régi eredmény a talált személyes adatból csak egy `true`-t adott, a titkoknál pedig kimaszkolt részt. Most fajta és darabszám van, érték soha.
- Idő, `Date.now()` és véletlen azonosító kikerült: ugyanarra a szövegre mindig ugyanaz az eredmény.

Új: a rejtett karakterek (nulla szélességű, kétirányú vezérlők, Unicode címkékarakterek) eltávolítása a keresés előtt, és jelentése. A nulla szélességű karakterrel szétvágott „ignore previous instructions" így is elkapódik.

Mire jó itt: a memóriába írt vagy fájlból olvasott szöveg később kontextusként kerül a host elé, tehát beadási útvonal. A `memory add` a `hostile` szöveget elutasítja (`--allow-risky`-vel felülírható), a `scan` parancs fájlt vagy szöveget vizsgál.

Korlátok: reguláris kifejezések listája. Átfogalmazott, lefordított vagy kódolt támadást nem fog meg, a „clean" annyit jelent, hogy a listán semmi nem egyezett. Lehet téves riasztás is (az injekcióról szóló szöveg). A találat részlete nem megbízható szöveg, adatként kell kezelni. A `task add` leírását nem vizsgálja (a feladat a hosttól vagy a felhasználótól jön).

Amit **nem** vettem át: `threat-learning-service` (az AgentDB-ben tanuló része), a viselkedéselemzés és a szabályellenőrzés típusai (`BehavioralAnalysisResult`, `PolicyVerificationResult`; a hozzájuk tartozó kód nincs a csomagban).

A `legacy/ruflo/v3/@claude-flow/aidefence` mappa ezért még nem törölhető (a tanuló szolgáltatás miatt).

## Teendők, ha elfogadod

1. A **C** lista törlése egy külön commitban (a git-előzményben megmarad).
2. Az **A** lista csomagjainak átvétele egyenként, kolónia-szóhasználattal, szolgáltatóra utaló részek nélkül, tesztekkel. Javasolt sorrend: `swarm` → `claims` → `memory` → `guidance` → `security`.
3. A **B** lista elemeiről egyenként döntés, amikor a szükségletük felmerül.
4. A `legacy/ruflo` az átvétel végére kiürül vagy törölhető.
