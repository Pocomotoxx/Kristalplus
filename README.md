# Kristalplus – Kristal Colony

Modellfüggetlen **kolónia-mag** TypeScriptben. Nem hív LLM-et és nem kér API-kulcsot: a **host** (például a Cowork) maga a modell, a Colony pedig a főkönyve. A host közvetlenül használhatja a `colony` parancsait; az első parancs betölti vagy inicializálja az állapotot. A `colony boot` opcionális diagnosztika. A host parancsokon keresztül dolgozik: feladatot vesz fel, kér, teljesít, szavaz, és a kolónia vektoros memóriájába ír. Az állapot a repóban él (`.colony/`).

> **Állapot: átmenet alatt.** A projekt a Ruflo / Claude Flow v3 rajalapú architektúrájából indult, de már csak inspirációs alap: a Colonynak a Ruflo csupán egy része, váza. Az új mag a [`packages/colony-core`](packages/colony-core). A régi Ruflo-kód a [`legacy/ruflo`](legacy/README.md) mappába került: befagyasztva, build és CI nélkül, és fokozatosan lesz átvéve vagy kivezetve. Részletek: [docs/COLONY-MIGRATION.md](docs/COLONY-MIGRATION.md) és [plant.md](plant.md).

## Fogalmak

A korábbi „raj” (swarm) helyett mindenhol **kolónia** (colony) a terminológia.

| Régi (Ruflo) | Új (Colony) |
|---|---|
| Swarm | Colony |
| Queen / coordinator | `ColonyHub` (vezérlő) |
| Agent registry | `ColonyRegistry` |
| Task orchestration | `ColonyTaskOrchestrator` |
| Worker agent | a host (Cowork), a `next` és `done` parancsokon át |

## Mit tud a `colony-core`

- **Koordináció:** ágensnyilvántartás (kapacitás, `idle`/`busy`/`offline`), feladatbontás függőségekkel, automatikus delegálás, eseménybusz témákkal és wildcarddal.
- **Konszenzus és vitafolyam:** rögzített választói kör; rövid `position → reply → finalize → vote` menet. A lezáráshoz legalább két aktív szavazó, egy álláspont és egy másik tag válasza kell; a tagok és súlyok rögzülnek a javaslatban. A posztokat és a végleges szöveget a hash-láncolt audit is rögzíti. A kvórum: `majority`, `supermajority`, `byzantine` (3f+1), `unanimous` vagy `weighted` (a javaslat rögzíti a tagok teljesítmény × egészség súlyát). A szavazás a véglegesítésig zárva marad; újonnan belépő és a választói körön kívüli tag nem szavazhat.
- **Foglalások (claims):** a `next` foglalást nyit a feladatra, a `done` / `fail` lezárja. Ha a gazdagép-munkamenet elhal, a foglalás elavul, és másik tag átveheti, vagy a gazda átadhatja. Az idő mindig paraméter, nincs időzítő és véletlen, ezért az egész visszajátszható.
- **Topológia:** a tagok kapcsolati gráfja (`mesh`, `star`, `tree`, `hybrid`), determinisztikusan: ugyanazokból a tagokból mindig ugyanaz a gráf. Vezetőválasztás, szomszédok, legrövidebb út.
- **Memória (Vector Codex):** szolgáltatófüggetlen embedding-felület, koszinusz-hasonlóságú vektortár névterekkel, fájlalapú perzisztencia a `.colony/memory.json` fájlban. A keresés alapból pontos (lineáris), 500 vektor fölött determinisztikus HNSW-gráf gyorsítja (`index: 'linear' | 'hnsw' | 'auto'`). A gráf nincs mentve, a tárolt dokumentumokból épül újra, mindig ugyanúgy.
- **Ágensek:** 11 beépített profil (Director, Architect, Coder, Reviewer, Tester, Security, Auditor, Researcher, Analyst, Writer, Exobiologist) és zod-alapú, típusbiztos eszköztár. Az Auditor és az Exobiologist **tanácsadó** szerep: csak olyan feladatot kap, amely név szerint kéri, a kiosztás nem teszi rájuk magától. Az Exobiologist nem szavaz. A profil `sampling` mezője (hőmérséklet, Top-P) csak javaslat a hostnak: a mag nem hív modellt, így nem tudja beállítani, és nem tudja ellenőrizni, hogy betartották-e.
- **Kiosztás pontozással (Colony Chief, P1):** a feladatot nem a legkevésbé terhelt tag kapja, hanem a legjobb pontszámú: képesség 0,30, terhelés 0,20, teljesítmény 0,25, egészség 0,15, elérhetőség 0,10. A súlyok a régi rendszerből jönnek, **heurisztikusak**, nem mért értékek. A teljesítmény a főkönyvből számolt, simított sikerarány (jelentett „kész", nem ellenőrzött minőség). Holtversenynél a tag azonosítója dönt.
- **Tanulás:** MoE-router és Reasoning Bank, amely a korábbi tapasztalatokat visszatáplálja. A router a szabályalapú pontszámra szavankénti, kimenetből tanult súlyokat ad (determinisztikus összeg, nincs beágyazásmodell és véletlen). Amit tanul, azt a host jelentette, nem ellenőrzött minőség. Minden lezárt feladatról (a hibásról is) strukturált jegyzet kerül az `outcomes` memórianévtérbe, a szabad szöveges eredmény és hibaüzenet nélkül; a hostile szöveg sem a Reasoning Bankba, sem ide nem kerül be, a visszautasítás az auditnaplóban van (`memory.refused`).
- **Host-vezérelt működés:** a `colony` parancssori eszköz JSON-t ír ki, így bármelyik host használhatja. A magnak nincs szüksége modellszolgáltatóra.
- **Jelentések szintézise (Colony Chief P8):** a `synthesize <feladat>` megkeresi a feladat kész részfeladatainak jelentései közül a szóalapú hasonlóság szerint legreprezentatívabbat, és megmutatja az egyetértő kifejezéseket és kilógó jelentéseket. Ez heurisztika; összefoglalót továbbra is a host ír, és ellenőrzi a forrásokat.
- **Opcionális boot-diagnosztika:** a `colony boot` ellenőrzi az állapotfájlokat és a szabályokat, feloldja a git-revíziót, és állapotot jelent (`LOADED`, `UNVERIFIABLE`, `BLOCKED`). A munkaparancsok boot nélkül is futnak; a diagnosztikai eltérések figyelmeztetések, a hibás állapotfájlok viszont továbbra is adatolvasási hibát okoznak.
- **Auditnapló:** minden változtatás hash-láncolt bejegyzés (SHA-256, aggregátumonként verzió). Szabad szöveg (eredmény, hibaszöveg, ellenőrzött parancs) nem kerül bele, csak a hossza vagy a döntés. Korlát: nincs aláírás, aki az egész fájlt átírja és újraszámolja a hash-eket, érvényes láncot kap. A boot opcionális horgonyt rögzít a napló végére; a következő boot és az `audit verify` ezzel észlelheti a levágást vagy átírást.
- **Biztonság:** a fájlutak feloldott (symlink/junction követő) tartalmazás-ellenőrzéssel mennek át (`safe-path.ts`: szabályfájlok, `check --file`), a git-hívások nem hagyják, hogy a vizsgált repó saját parancsot futtasson (`core.fsmonitor`, `safe-git.ts`).
- **Nincs LLM-függés:** a magban nincs modellszolgáltató, hálózati hívás, API-kulcs vagy környezeti változó. A memória beágyazása helyi és determinisztikus.

## Gyors indítás

Szükséges: Node.js 20+ és pnpm.

```bash
cd packages/colony-core
pnpm install
pnpm build
pnpm test
```

Hostnak adható indítóutasítás: [START_HERE.md](START_HERE.md).

### Munkamenet: közvetlen munkakezdés

Minden parancs JSON-t ír ki. A `--dir <mappa>` a projektmappa (alapértelmezés: az aktuális mappa).

```bash
# Opcionális diagnosztika: node dist/cli.js boot
node dist/cli.js task add "Cím" "Leírás" --role engineer
node dist/cli.js next --as engineer                     # következő feladat + utasítás + memóriakontextus
node dist/cli.js done <taskId> --result "mit csináltam" # valós, nem üres eredmény kötelező
node dist/cli.js synthesize <parentTaskId>                   # lezárt részfeladat-jelentések áttekintése
```

| Parancs | Mit csinál |
|---|---|
| `boot` | Opcionális: ellenőrzi és kiírja az állapot és a szabályok diagnosztikáját. Munkakezdéshez nem szükséges. |
| `status` | Tagok, feladatok, nyitott javaslatok. |
| `task add <cím> <leírás>` | Új feladat (`--role`, `--capabilities`, `--after id,id`, `--priority`, `--consensus <kvórum>`). Szerep nélkül a MoE-router választ. |
| `next --as <szerep\|tag>` | A szerepnek kiosztott következő feladat, a szerep utasításával és a releváns memóriával. |
| `done <id> --result <szöveg> [--quality 0..1] [--verified-by-test]` | Lezárja a feladatot. Konszenzusos feladatnál előbb jóváhagyott javaslat kell. A kolónia megjegyzi a megoldást. A `--quality` és a `--verified-by-test` a **host állítása**: a kolónia tanul belőle (router, tagstatisztika, kiosztás), de nem méri és nem ellenőrzi. A jutalom sikernél `0,2 + 0,8 × minőség`, megadás nélkül 0,5. |
| `fail <id> --error <szöveg> [--quality 0..1]` | Hibásnak jelöli a feladatot. A jutalom mindig negatív: `-(1 - 0,3 × minőség)`, megadás nélkül -1. |
| `propose <id> <téma> --as <tag>` | Szavazást indít (`--quorum N` vagy `--strategy majority\|supermajority\|byzantine\|unanimous\|weighted`, `--timeout-min`, alapértelmezés: 60 perc). Stratégiánál a szavazók a nem offline és nem hibás tagok. A `weighted` a javaslat létrehozásakor rögzíti a Chief főkönyvi teljesítmény × egészség súlyait; a szavazat és az auditnapló a súlyt is tartalmazza. |
| `topology` | A tagok kapcsolati gráfja (`--type mesh\|star\|tree\|hybrid`, `--fanout`, `--degree`, `--from` és `--to` a legrövidebb úthoz). Csak olvas. |
| `review <feladat> --as <reviewer> --approve\|--reject --reason …` | A Critic-kör. Az elutasítás visszaküldi a feladatot `in_progress`-be, a tag a `next` kimenetében látja az indoklást (`reviewFeedback`). A harmadik elutasítás (feladatonként `--max-review-rounds N`, 1–20) után a feladat tartásba kerül, és a felhasználónak kell döntenie; a `hold release` friss körszámot ad. A `task add --review` jóváhagyáshoz köti a lezárást; az elutasítás enélkül is blokkolja a `done`-t, amíg új jóváhagyás nincs. Csak `reviewer` szerepű tag értékelhet, és nem azt a feladatot, amit ő tart. A jóváhagyás a reviewer állítása, nem tesztredmény; a kolónia nem ellenőrzi. |
| `watch [--task id]` | A Deputy mechanikus ellenőrzése (csak olvas): azonos címmel ismétlődő hibák, ugyanaz a feladat újra és újra létrehozva, gazdát cserélgető foglalás, elakadt feladat, átnézetlen `chief.override`, a saját magától feloldott tartás, a napló sértetlensége és a boot-horgony, gyenge szöveges célcsúszás-jel (csak felbontott feladatnál). A `done` és `fail` kimenete is jelzi (`deputy`), ha az adott feladatról van mondanivalója; ez tanács, nem kapu. |
| `hold <feladat> --as <auditor> --reason …`, `hold release <feladat> --as <tag> --note …` | Tartás: a feladat nem fejezhető be (`done`) és nem osztható ki, amíg fel nem oldják; a `fail` marad. Tartást csak `auditor` szerepű tag tehet. A feloldás kötelező megjegyzése a host jelentése arról, mit döntött a felhasználó: **a kolónia nem tudja ellenőrizni, hogy ember döntött-e.** Ha ugyanaz oldja fel, aki tette, a `watch` jelzi. |
| `synthesize <feladat>` | A lezárt, közvetlen részfeladatok jelentéseiből szóalapú Jaccard-medoidot választ, közös kifejezéseket és kilógókat sorol fel. Ez nem szemantikus vagy tényszerű ellenőrzés; a host készíti el a végső narratív összegzést. |
| `plan <feladat> [--kind K] [--apply]` | Feladatelemzés: fajta (szerepből vagy szavakból), komplexitás, becsült idő (heurisztikus; legalább 3 mért befejezés után mért), témák, hasonló korábbi munka, bizonyosság, és a felbontás lépései szerepekkel, hullámokkal és stratégiával (`single`, `sequential`, `pipeline`, `parallel`, `fan-out-fan-in`, `hybrid`, a függőségi gráfból levezetve). Alapból csak javasol. Az `--apply` a lépéseket valódi feladatként hozza létre; a szülő az utolsó lépésre vár, és utolsóként zárul (jóváhagyás). Rövid (200 karakter alatti) feladat, ellenőrzés és részfeladat nem bomlik. |
| `health [--queue-depth N] [--long-wait-min N]` | A kolónia egészsége (csak olvas): öt csoport (vezetés, kutatás, elemzés, végrehajtás, minőség) hibaaránnyal és válaszidővel, szűk keresztmetszetek (hosszú sor, hibás tagok, elavult vagy blokkolt foglalás, feladat, amit senki nem vehet át, bukott függőségre váró feladat), riasztások, javaslatok, átbocsátás, szavazási sikerarány. A küszöbök és a képletek heurisztikusak. |
| `score <feladat>` | A tagok rangsora a feladatra összetevőkre bontva, az elsődleges és legfeljebb két tartalék tag, és hogy a többi miért nem jöhet szóba. |
| `member list\|preset standard` | Tagok listája; első használatkor az új kolónia megkapja a beépített szerepeket, meglévő főkönyvnél a parancs pótolja a hiányzó szerepeket. |
| `member add <név> --role R --ephemeral --ttl-min N` | Ideiglenes tag felvétele explicit lejárattal; az azonosító a névből, szerepből és időbélyegből determinisztikus. |
| `member sweep` | Lejártak offline jelölése; az elkezdett munka foglalása átvehető, az el nem kezdett feladat újraosztható. Nincs háttér-időzítő. |
| `claim list\|sweep` | Ki mit foglal (`list`, csak olvas). A `sweep` stealable-re állítja az elavult (30 perc tevékenység nélkül) és a túl régen blokkolt (60 perc) foglalásokat. |
| `claim heartbeat\|block\|unblock\|release <feladat> --as <tag>` | Életjel (`--progress 0..100`; a stealable foglalást visszaveszi), blokkolás (`--reason`), feloldás, lemondás (azonnal átvehető). |
| `claim steal <feladat> --as <tag>` | Stealable foglalás átvétele a türelmi idő (10 perc) után, a tag kapacitásán belül. A feladat új gazdát kap. |
| `claim handoff <feladat> --as <tag> --to <tag> --reason <szöveg>`, `claim accept\|reject <feladat> --as <tag>` | Átadás: a címzett elfogadja vagy bármelyik fél elutasítja. |
| `check` | Kapuk, **mielőtt** a host cselekszik: `--command` (romboló parancs, titok), `--text`, `--file` (titokkeresés, `--diff-lines`, `--threshold`), `--tool` + `--allow` (eszköz-engedélylista). Döntés: `allow`, `warn`, `require-confirmation`, `block` (kilépési kód 3). A talált titkot soha nem írja ki. |
| `redact --text\|--file` | Mielőtt valami elhagyja a projektet (jelentés, kommentár): e-mail, bankkártya (Luhn), IBAN (mod 97), nemzetközi telefonszám, IP, JWT, adatbázis-URL és titkok cseréje helyőrzőre. `--hash kind,kind --salt S` sózott hash a helyőrző helyett (titokra soha). A nevet és a postai címet **nem** ismeri fel, olvasd át az eredményt. |
| `scan --text\|--file` | Prompt-injection megfogalmazás, rejtett karakterek (nulla szélességű, kétirányú vezérlők, Unicode címkék) és személyes adat keresése. Verdikt: `clean`, `suspicious`, `hostile` (kilépési kód 3). A személyes adatot fajta és darabszám szerint adja vissza, az értéket soha. A `memory add` a `hostile` szöveget elutasítja (`--allow-risky` felülírja), mert a memória később kontextusként kerül a host elé. |
| `route test\|teach\|stats` | A MoE-router: `test <szöveg>` megmutatja, melyik szerepet választaná (nincs mellékhatás), `teach <szöveg> --role R [--reward -1..1]` tanítja, `stats` a szerepek terhelését (Gini) és a tanultakat. A router a `done` (+0,5, mert csak jelentett) és a `fail` (-1) kimenetből is tanul. |
| `audit list\|verify` | A `.colony/audit.jsonl` hash-láncolt napló: ki mit tett (feladat, foglalás, szavazat, kapu-döntés). A `verify` a láncot és azt ellenőrzi, hogy a napló még tartalmazza az utolsó bootkor rögzített bejegyzést. |
| `vote <javaslat> --as <tag> --approve\|--reject --reason <szöveg>` | Szavaz (`--confidence 0..1`). Indoklás kötelező. |
| `memory add\|search` | Kézi memóriaírás és -keresés (`--ns`, `--k`). |

### Opcionális boot-diagnosztika

A `colony boot` állapotellenőrzést futtat és jelentést készít:

- `LOADED`: az állapotfájlok érvényesek, a git-revízió ismert.
- `UNVERIFIABLE`: az állapot érvényes, de a revízió ismeretlen.
- `BLOCKED`: az ellenőrzés hibás állapotot vagy szabályfájlt talált.

A boot eredménye nem kapu: a munkaparancsokat egyik bootállapot sem tiltja le. A sérült vagy olvashatatlan főkönyv, memória vagy auditnapló továbbra is hibát okoz, mert az adatot nem lehet biztonságosan betölteni. A git-revízió és szabályfájlok eltérése csak diagnosztikai figyelmeztetés.


### Szabályok

A `.colony/rules/manifest.json` fájl felsorolja a helyi szabály- és útmutatófájlokat. Az opcionális első boot egy kezdőkészletet ír ki; a projekt ezeket szabadon módosíthatja. A Colony a boot diagnosztikájában beolvassa és hash-eli a felsorolt fájlokat, de a normál munkaparancsok futásához nem követeli meg sem a bootot, sem a fájlok változatlanságát.

- A boot kimenete tartalmazza a szabályfájlok szövegét és SHA-256 hash-ét.
- A boot utáni fájlváltozás figyelmeztetésként jelenik meg, nem állítja le a munkát.
- A host felel azért, hogy megismerje és alkalmazza a projekt útmutatásait.


## Repó felépítése

```
packages/colony-core/      az új mag (TypeScript, ESM, strict)
START_HERE.md              indítóutasítás hostoknak
AGENTS.md                  rövid belépő hostoknak
plant.md                   migrációs terv
docs/COLONY-MIGRATION.md   migrációs térkép és hátralévő munka
legacy/ruflo/              a régi Ruflo-kód, befagyasztva (lásd legacy/README.md)
```

A gyökérből `pnpm test` lefordítja és futtatja a `colony-core` tesztjeit.

## Ismert hiányok

- A `colony-core` tesztjei (`pnpm test`, 248 teszt) a buszt, a nyilvántartást, az orchestratort, a konszenzust, a vektortárat és a CLI teljes munkafolyamatát fedik (boot, szabályok, feladatok, szavazás, memória). A `ColonyHub`, a `FileVectorStore`, a MoE-router és a Reasoning Bank külön tesztelése még hiányzik.
- A szabályok csak kötelező készletből állnak, és mind a bootban töltődnek be. Feladathoz kötött szabálybetöltésre (útválasztóra) szándékosan nincs szükség.
- A kezdő szabálykészlet rövid, és a projekt igényeihez kell igazítani.
- A `member preset standard` pótolja a hiányzó beépített szerepeket. Az ideiglenes, explicit lejáratú tagok P9 része a `member add` és `member sweep` paranccsal; az opcionális `legacy-15` sablon még hátravan.
- A `plant.md` V. és VI. fázisa nincs leírva, és nincs bennük kész kód.
- A `legacy/ruflo` mappából még nem döntöttük el, melyik plugin és csomag kerül át a Colonyba, és melyik törlendő.
- A régi Ruflo `LICENSE` fájlja nincs a másolatban (lásd [legacy/README.md](legacy/README.md)).

## Eredet és licenc

A projekt a Ruflo / Claude Flow (ruvnet) nyílt forráskódú munkájából inspirálódott, és a repó a `legacy/ruflo` mappában még tartalmazza annak kódját. Az átvett részek licencfeltételeit a végleges kivezetés előtt ellenőrizni kell. A `colony-core` saját, újraírt kód.
