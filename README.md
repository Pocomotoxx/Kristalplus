# Kristalplus – Kristal Colony

Modellfüggetlen **kolónia-mag** TypeScriptben. Nem hív LLM-et és nem kér API-kulcsot: a **host** (például a Cowork) maga a modell, a Colony pedig a főkönyve. Egy paranccsal (`colony boot`) betölti a rendszert, utána a host parancsokon keresztül dolgozik: feladatot vesz fel, kér, teljesít, szavaz, és a kolónia vektoros memóriájába ír. Az állapot a repóban él (`.colony/`).

> **Állapot: átmenet alatt.** A projekt a Ruflo / Claude Flow v3 rajalapú architektúrájából indult, de már csak inspirációs alap. Az új mag a [`packages/colony-core`](packages/colony-core). A régi Ruflo-kód a [`legacy/ruflo`](legacy/README.md) mappába került: befagyasztva, build és CI nélkül, és fokozatosan lesz átvéve vagy kivezetve. Részletek: [docs/COLONY-MIGRATION.md](docs/COLONY-MIGRATION.md) és [plant.md](plant.md).

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
- **Host-vezérelt működés:** a `colony` parancssori eszköz JSON-t ír ki, így bármelyik host használhatja. A magnak nincs szüksége modellszolgáltatóra.
- **Boot:** a `colony boot` betölti és ellenőrzi az állapotfájlokat és a szabályfájlokat, feloldja a git-revíziót, és állapotot jelent (`LOADED`, `UNVERIFIABLE`, `BLOCKED`). Boot nélkül a munkaparancsok nem futnak.
- **Opcionális, kulcsot igénylő rész (örökölt):** a `llm/providers.ts` (Gemini és OpenAI-kompatibilis végpontok) és a GitHub Actions runner. A host-vezérelt útnak nincs rájuk szüksége.

## Gyors indítás

Szükséges: Node.js 20+ és pnpm.

```bash
cd packages/colony-core
pnpm install
pnpm build
pnpm test
```

Hostnak adható indítóutasítás: [START_HERE.md](START_HERE.md).

### Munkamenet: boot, majd munka

Minden parancs JSON-t ír ki. A `--dir <mappa>` a projektmappa (alapértelmezés: az aktuális mappa).

```bash
node dist/cli.js boot                                   # betöltés, állapot, munkaprotokoll
node dist/cli.js task add "Cím" "Leírás" --role engineer
node dist/cli.js next --as engineer                     # következő feladat + utasítás + memóriakontextus
node dist/cli.js done <taskId> --result "mit csináltam" # valós, nem üres eredmény kötelező
```

| Parancs | Mit csinál |
|---|---|
| `boot` | Betölti és ellenőrzi az állapotot, beregisztrálja a beépített tagokat, kiírja a protokollt. |
| `status` | Tagok, feladatok, nyitott javaslatok. |
| `task add <cím> <leírás>` | Új feladat (`--role`, `--after id,id`, `--priority`, `--consensus <kvórum>`). Szerep nélkül a MoE-router választ. |
| `next --as <szerep\|tag>` | A szerepnek kiosztott következő feladat, a szerep utasításával és a releváns memóriával. |
| `done <id> --result <szöveg>` | Lezárja a feladatot. Konszenzusos feladatnál előbb jóváhagyott javaslat kell. A kolónia megjegyzi a megoldást. |
| `fail <id> --error <szöveg>` | Hibásnak jelöli a feladatot. |
| `propose <id> <téma> --as <tag>` | Szavazást indít (`--quorum`, `--timeout-min`, alapértelmezés: 60 perc). |
| `vote <javaslat> --as <tag> --approve\|--reject --reason <szöveg>` | Szavaz (`--confidence 0..1`). Indoklás kötelező. |
| `memory add\|search` | Kézi memóriaírás és -keresés (`--ns`, `--k`). |

A boot állapotai (a Krista bootlogikáját követve):
- `LOADED`: az állapotfájlok érvényesek, a git-revízió ismert.
- `UNVERIFIABLE`: az állapot érvényes, de a revízió ismeretlen. Tartalmi munka mehet, repómódosítás nem.
- `BLOCKED`: egy állapotfájl hibás, vagy egy kötelező szabályfájl hiányzik, üres vagy a szabálykönyvtáron kívülre mutat. A boot ezt rögzíti, és a munkaparancsok megtagadják a futást, amíg a hiba ki nincs javítva. Hibás állapotfájlt a rendszer soha nem ír felül csendben.

Ha a git-revízió megváltozott a boot óta, a parancsok figyelmeztetnek, hogy újra kell bootolni.

### Szabályok

A kötelező szabályokat a `.colony/rules/manifest.json` sorolja fel (`mandatory`), a fájlok ugyanabban a mappában vannak. Az első boot egy kis kezdőkészletet ír ki (munkaprotokoll, őszinte jelentés, konszenzus). Ezt utána a projekt szabadon átírhatja és bővítheti, a rendszer a meglévő fájlokat soha nem írja felül.

- A boot kimenete tartalmazza minden szabály szövegét és SHA-256 hash-ét. A host ezeket olvassa be.
- Ha boot után bármelyik szabályfájl megváltozik, eltűnik vagy olvashatatlan lesz, a munkaparancsok kódja 2, és újra kell bootolni.
- A boot a beolvasást és a hash-t bizonyítja, nem azt, hogy a host alkalmazta is a szabályokat.

### Örökölt, kulcsot igénylő rész

A `github-runner` és a `llm/providers.ts` modellszolgáltatót hív (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`). A host-vezérelt útnak nincs rájuk szüksége, a későbbiekben kivezetjük vagy opcionálissá tesszük őket. Kulcsot soha ne commitolj.

## Repó felépítése

```
packages/colony-core/      az új mag (TypeScript, ESM, strict)
.github/workflows/         kristal-colony-runner.yml (az egyetlen aktív workflow)
START_HERE.md              indítóutasítás hostoknak
AGENTS.md                  rövid belépő hostoknak
plant.md                   migrációs terv
docs/COLONY-MIGRATION.md   migrációs térkép és hátralévő munka
legacy/ruflo/              a régi Ruflo-kód, befagyasztva (lásd legacy/README.md)
```

A gyökérből `pnpm test` lefordítja és futtatja a `colony-core` tesztjeit.

## Ismert hiányok

- A `colony-core` tesztjei (`pnpm test`, 30 teszt) a buszt, a nyilvántartást, az orchestratort, a konszenzust, a vektortárat és a CLI teljes munkafolyamatát fedik (boot, szabályok, feladatok, szavazás, memória). A `ColonyWorker`, az LLM-szolgáltatók, a MoE-router és a Reasoning Bank külön tesztelése még hiányzik.
- A szabályok csak kötelező készletből állnak, és mind a bootban töltődnek be. Feladathoz kötött szabálybetöltésre (útválasztóra) szándékosan nincs szükség.
- A kezdő szabálykészlet rövid, és a projekt igényeihez kell igazítani.
- A beépített tagok (6 szerep) fixek, a CLI-ből nem lehet újat felvenni.
- A `plant.md` V. és VI. fázisa nincs leírva, és nincs bennük kész kód.
- A `legacy/ruflo` mappából még nem döntöttük el, melyik plugin és csomag kerül át a Colonyba, és melyik törlendő.
- A régi Ruflo `LICENSE` fájlja nincs a másolatban (lásd [legacy/README.md](legacy/README.md)).

## Eredet és licenc

A projekt a Ruflo / Claude Flow (ruvnet) nyílt forráskódú munkájából inspirálódott, és a repó a `legacy/ruflo` mappában még tartalmazza annak kódját. Az átvett részek licencfeltételeit a végleges kivezetés előtt ellenőrizni kell. A `colony-core` saját, újraírt kód.
