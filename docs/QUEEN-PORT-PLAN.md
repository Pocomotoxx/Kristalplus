# A swarm-koordinátorok átemelésének terve (Colony Chief)

Állapot: 2026-11-01, átírva a 10 szerepes ügynökrendszer szerint. Terv, kód még nincs. Forrás: `legacy/ruflo/v3/@claude-flow/swarm/src/` (kb. 7400 sor a hat nagy fájlban) és a felhasználó ügynökrendszer-terve.

## Mit olvastam el, és mit nem

| Fájl | Sor | Olvasva |
|---|---|---|
| `queen-coordinator.ts` | 2035 | típusok, konfig, `analyzeTask`, a felbontás, képességek, `delegateToAgents`, pontozás, kiválasztás, egészségjelentés (eleje), konszenzus, tanulás. **Nem** olvastam: 870–1100 (komplexitás, időbecslés, domain-választás, mintaillesztés, bizonyosság), 1560–1700 (egészség vége). |
| `unified-coordinator.ts` | 2099 | csak a metódusjegyzék |
| `attention-coordinator.ts` | 1007 | fejléc, típusok |
| `federation-hub.ts` | 997 | fejléc, típusok, metódusjegyzék |
| `agent-pool.ts` | 539 | csak a metódusjegyzék |
| `message-bus.ts` | 737 | nem olvastam |
| `domain/`, `application/` | ? | nem olvastam |

A terv ezért a Queen-re (a régi név, az új: Colony Chief) részletes, a többire vázlat. A P0 lépés pótolja a hiányt, mielőtt kódot írnánk.

## Alapgondolat

A régi Queen hat dolgot csinál: **elemez → kioszt → pontoz → egészséget figyel → szavaztat → tanul a kimenetből**. Ő hajtotta végre is a munkát (ügynök-pool, időzítők, `waitForTaskCompletion`). A Colonyban a munkát a host végzi, ezért a **Colony Chief tanácsadó és nyilvántartó**: tiszta, determinisztikus függvények, amelyek javaslatot adnak, és a host dönt. A végrehajtó gépezet nem kerül át.

Az ügynökrendszer három eleme **új a régi kódhoz képest**, és külön fázist kap: a **Deputy** (független felügyelet), a **Critic-kör** (visszaküldés korláttal) és az **emberi kapu** (eszkaláció). Ezeket a régi rendszer nem tudta.

## A szereplista (10 szerep)

A felhasználó 15 szerepes terve itt 10 szerepre van összevonva. Az összevonás indoka: minden szerep egy host-munkamenet vagy egy külön forduló, és a koordinációs költség gyorsabban nő, mint a haszon. Ha egy összevonással nem értesz egyet, a terv csak a szereplistát érinti.

| Szerep (`AgentRole`) | A terv szerepe | Állapot ma | Megjegyzés |
|---|---|---|---|
| `director` | Orchestrator, a **Colony Chief** gazdája | van | Ő hívhatja a `chief-override`-ot. |
| `auditor` | **Deputy / Executive Audit** | **új** | Eseményvezérelt, nem átjáró (P5). |
| `security` | Jogi és Etikai biztos | van | A mechanikus kapukat futtatja (`check`, `scan`, `redact`), és „a mintákra nem volt találat" szöveggel jelent, nem „megfelelő"-vel. |
| `researcher` | Deep Research + Data Scraper + Data Cleansing | **új** | A három szerep egy. A lekérés a host képessége; a kimenet a `scan` és a `redact` kapuján megy át. |
| `analyst` | Data Analyst & Reasoning | van, profil nincs | Profilt kap. |
| `architect` | Code Architect | van | |
| `engineer` | Developer | van | |
| `writer` | Content Creator & Copywriter | **új** | |
| `reviewer` | Critic / Reviewer | van | A Critic-kört vezeti (P6). |
| `tester` | Sandbox & Test Execution | van | A host futtat; **ő az egyetlen szerep, amely ellenőrzött bizonyítékot adhat.** |

Nem szerep, hanem a mag szolgáltatása:
- **Context & RAG Manager** → a `memory` (VectorCodex, HNSW) és a `scan` a belépésnél. Nem külön ügynök.
- **Synthesis & Narrative** → a Chief `synthesize` parancsa (P8).
- **Token & Compute Budget** → **kimarad.** A host-vezérelt magban nincs API, így költség sem, amit mérni lehetne; a modellt a host választja. (A régi `ruflo-cost-tracker` ugyanezért esett ki a C listán.) Legfeljebb egy szabad megjegyzés a feladaton.

A beépített tagok így 6-ról 10-re nőnek (`director`, `architect`, `engineer`, `reviewer`, `tester`, `security` + `auditor`, `researcher`, `analyst`, `writer`). A mai főkönyvekben 6 tag van: a tagok pótlása külön, kifejezett parancs (`member preset`, P9), nem csendes változás a bootban.

## Fázisok

### P0 – Előkészítés (kicsi, kód nélkül)

- Elolvasni a hiányzó részeket: Queen 870–1100 és 1560–1700, `unified-coordinator` `assignTask` és `scoreAgentForTask` (801–905), `message-bus.ts`, `domain/`, `application/`. Ha a `message-bus.ts` tud valamit, ami a Colony `MessageBus`-ából hiányzik (prioritás, visszaigazolás, holtlevél-sor), az külön tétel.
- **Tagstatisztika alapja:** a főkönyvből és az auditnaplóból levezetett mutatók tagonként (befejezett, hibás, átlagos időtartam, utolsó tevékenység). Nem új tár, a meglévő adatokból számolt.

### P1 – Szerepek és pontozás

A régi pontszám súlyai: képesség 0,30, terhelés 0,20, teljesítmény 0,25, egészség 0,15, elérhetőség 0,10.

- Új szerepek (`auditor`, `researcher`, `writer`), négy új beépített profil (`auditor`, `researcher`, `analyst`, `writer`).
- `chief/scoring.ts`, `colony score <feladat>`: minden tag pontszáma összetevőkre bontva. Képesség = szerep és eszköz egyezés; terhelés = `currentTaskIds / maxConcurrentTasks`; teljesítmény = tényleges sikerarány a P0 statisztikából; egészség = hibás/offline állapot és elavult foglalások; elérhetőség = `idle`/`busy`.
- Elsődleges tag + legfeljebb 2 tartalék (küszöb 0,3, mint a régiben).
- **Viselkedésváltozás (döntés: igen):** a pontozás váltja fel a mai „legkevésbé terhelt" kiosztást a `tryDispatchTask`-ban. Holtversenynél a tag azonosítója dönt.
- **Összekötés a foglalásokkal:** az elavult foglalásnál a `claim sweep` kiírja a legjobb átvevő tartalék tagot.
- Teszt: súlyok, holtverseny, tartalék, régi és új kiosztás összevetése, az új szerepek betöltése, a 6 tagos régi főkönyv épségben marad.

### P2 – Egészségjelentés

- `chief/health.ts`, `colony health`: tagok, csoportok („domainek"), szűk keresztmetszetek (sorhossz 10 fölött, hibás tagok, elavult foglalások), figyelmeztetések, javaslatok.
- **A régi hiány:** a domain-egészségnél az `avgResponseTimeMs` és az `errorRate` egyaránt fixen 0 volt („Would need tracking"). Itt a foglalásokból (átfutási idő) és az auditnaplóból (hibás/összes) valósan számoljuk.
- A „domain" a terv hat csoportja: Vezetés és ellenőrzés, Kutatás, Elemzés, Végrehajtás, Minőség (és a memória a szolgáltatásoknál). A szerepek csoportokra képezve, nem fix ügynökszámokra.
- Kimarad: `coordinationLatencyMs` (futásidejű mérőszám).

### P3 – Elemzés, felbontás, végrehajtási terv

- `chief/analysis.ts`, `colony plan <feladat>` (csak olvas) és `colony plan <feladat> --apply` (valódi részfeladatokat hoz létre `parentId`/`dependencies` kitöltésével; a mezők megvannak a `ColonyTask`-ban).
- Sablonok a régiből: kódolás (terv → megvalósítás → teszt), tesztelés, kutatás, koordináció. Új sablon: **kutatás → elemzés → szintézis → ellenőrzés**, és **szöveg: vázlat → írás → átnézés**. Az egyszerű feladat (200 karakter alatt) nem bomlik.
- **Végrehajtási stratégia a függőségi gráfból:** a részfeladatok hullámokra bontása (mi futhat egyszerre). A régi öt stratégianevet a gráf alakjából vezetjük le.
- A mintaillesztést a meglévő Reasoning Bank adja.
- **Heurisztikák (döntés: igen):** a régi időtartamok és a komplexitás-képlet kézzel megadott számok, nem mérések. `heuristic` jelölést kapnak, felülírhatók, és ahol van mért adat (P0 statisztika), az az erősebb.
- A régi `memoryMb`, `cpuIntensive`, `networkRequired` kimarad.

### P4 – Tanulás a kimenetből

- `done --quality 0..1` (nem kötelező). Jutalom a régi képlettel: siker esetén `minőség × 0,8 + 0,2`, kudarcnál `minőség × 0,3`.
- Betáplálás a routerbe (ma +0,5/−1 fix) és a tagstatisztikába; kimenet a memóriába egy `outcomes` névtérbe.
- **Őszinteség:** a minőséget a host adja meg. A jutalom és a statisztika „jelentett", nem ellenőrzött, a kimenetben is így címkézve. Az egyetlen ellenőrzött jel a `tester` által futtatott teszt, amelyet külön mezőben lehet rögzíteni (`--verified-by-test`, ami szintén a host állítása, de a címkéje elkülönül).

### P5 – Deputy: eseményvezérelt felügyelet és tartás (hold)

A terv szerint a Deputy a Chief döntéseit auditálja: célcsúszás, végtelen ciklus, káros részdöntések, és vétójoga van. Három módosítással kerül be:

1. **Nem átjáró.** Nem minden feladat megy át rajta (az soros szűk keresztmetszet lenne), hanem eseményre fut: `done`/`fail`-nél, ismételt hibánál, hurok gyanújánál, `chief-override` után.
2. **Mechanikus ellenőrzés, nem ítélet.** `colony watch` az auditnaplóból és a főkönyvből: ugyanaz a feladat N-szer bukott (alapérték 3); egy foglalás körbejár (átvétel/átadás ≥ 3); egy feladat elakadt; egy `chief-override`-nak nincs átnézése; a részfeladatok címei elszakadnak a gyökérfeladat szavaitól. **A „célcsúszás" jelzés gyenge**, mert a mai beágyazás hash-alapú, tehát szóegyezést mér, nem jelentést. A kimenet ezt kimondja.
3. **A vétó eszkaláció, nem egyoldalú javítás.** `colony hold <feladat> --as <auditor> --reason …` a feladatra *tartást* tesz: a `done` és a `next` megtagadja, amíg valaki fel nem oldja. A feloldás (`hold release`) kötelezően megad egy megjegyzést arról, mit mondott a felhasználó. **A CLI nem tudja igazolni, hogy ember oldotta fel**, a megjegyzés „jelentett", és az auditnaplóba kerül.

**Független-e a Deputy?** Ha ugyanaz a modell, mint a Chief, a hibáik korrelálnak. A függetlenség forrása az eltérő *információ* (az eredeti kérés szövege, az auditnapló, a mért számok), nem a „másik fejjel gondolkodás". Ezt a README is kimondja.

### P6 – Critic-kör korláttal

- `colony review <feladat> --as <reviewer> (--approve | --reject) --reason …`. Az elutasítás visszaküldi a feladatot `in_progress`-be a megjegyzéssel, és növeli a körszámot.
- **Maximális körszám (alapérték 3).** A harmadik elutasítás után a feladat automatikusan *tartásba* kerül, és eszkalál az emberhez (P5 mechanizmusa). A rajzon ez a hiányzó ág volt.
- Az elfogadás nélkül a konszenzusos feladat nem zárható (ma is így van a szavazásnál); a `review` ezt kiegészíti egy minőségi kapuval, amelyet a feladat létrehozásakor lehet kérni.
- Auditnapló: minden kör bejegyzés.

### P7 – Két hiányzó szavazási mód

- **`weighted`:** a szavazat súlya = a tag teljesítménye × egészsége (a régi képlet). A régi kódban ez sokáig hatástalan volt (a súlyok sosem jutottak el a számláláshoz, minden súlyozott döntés sima többség lett; egy 2026-os javítás hozta rendbe). Itt a súly a szavazat leadásakor kerül a szavazatba és az auditnaplóba, a számlálás tesztelve van arra, hogy a súly valóban számít.
- **`chief-override`:** egyoldalú döntés, csak három típusra (vészhelyzeti művelet, tag leállítása, prioritás-felülbírálat). **Hatalom, nem szavazás**, ezért: csak `director` szerepű tag hívhatja, indoklás kötelező, mindig az auditnaplóba kerül, a `status` külön jelzi, és **a Deputy utólag megjelöli** (`watch` jelez, ha nincs átnézése). A felhasználó a végső döntő; a P5 tartása felülírhatja a következményeit.
- A `propose` kiterjesztése; tesztek a súlyozott kvórumra és a visszaélésre (nem `director`, hiányzó indoklás, nem engedett típus).

### P8 – Több tag kimenetének összegzése (az attention-coordinator maradéka)

- A régi fájl hat figyelemmechanizmust kínál (multi-head, flash, linear, hyperbolic, moe, graph-rope). A saját fejléce szerint a flash gyorsulása „unverified". 10–15 tagnál a pontos softmax-figyelem triviálisan gyors, a közelítések nem adnak semmit.
- Átvesszük a lényeget: `colony synthesize <feladat>`: több jelentésből kiválasztja a „középsőt" (amelyik a többihez a leghasonlóbb), megadja az egyetértési pontot és a kilógókat. A régi `neural/utils/self-consistency.ts` (134 sor) ide illik, azt is át kell nézni.
- **Korlát:** a hasonlóság szóegyezést mér, nem jelentést. A kimenet jelzi.
- Kimarad: flash, linear, hyperbolic, graph-rope.

### P9 – Ideiglenes tagok és sablonok (a federation-hub használható része)

- `colony member add --ephemeral --ttl-min N`: az al-munkamenet (alügynök) ideiglenes tagja lejárattal; `member sweep` leveszi, a feladata a foglalás-elavulás útján átvehetővé válik. A régi `setInterval`-os takarítás és `Math.random()` azonosító helyett kifejezett söprés és determinisztikus azonosító.
- `colony member preset <név>`: a hiányzó beépített tagok pótlása a 10 szereplistára (`standard`), és egy opcionális, régi **15 ügynökös** sablon (`legacy-15`), amely a tagokat `offline` állapotban hozza létre (az `offline` tag nem szavaz és nem kap feladatot, amíg egy host be nem jelentkezik helyette).
- A `broadcast`, `selectOptimalSwarm` és a föderációs szavazás hálózati/több telepítéses: P10.

### P10 – Több Colony egymás közt (csak tervezés)

Hálózat nélkül csak git-alapú csomagcsere lehet (hash-ellenőrzött export és import). Külön tervként kell megírni, nem a régi kódból.

## Ami nem kerül át, és miért

- `agent-pool` (acquire/release/skálázás/egészségellenőrző szál) és a `unified-coordinator` futtató része: a host maga az ügynök, a skálázás az ő dolga. Amit hasznosat tud (pontozás, heartbeat, helyreállítás), azt a P1 és a foglalások lefedik.
- `waitForTaskCompletion`, háttérszálak, szüneteltetés/folytatás: futtató gépezet.
- A Token & Compute Budget szerep (nincs mit mérni).
- A hálózati és időzítős részek.

## Sorrend, méret, függőségek

| Fázis | Függ | Becsült méret | Kockázat |
|---|---|---|---|
| P0 | – | olvasás, leltár | alacsony |
| P1 | P0 | ~350 sor + tesztek | közepes (megváltozik a kiosztás, új szerepek) |
| P2 | P0 | ~250 sor + tesztek | alacsony |
| P3 | P1 | ~400 sor + tesztek | közepes (a heurisztikák minősége) |
| P4 | P0 | ~150 sor + tesztek | alacsony |
| P5 | P0, P4 | ~350 sor + tesztek | közepes (új állapot a feladaton: tartás) |
| P6 | P5 | ~200 sor + tesztek | alacsony |
| P7 | P1 | ~250 sor + tesztek | **magas** a `chief-override` miatt |
| P8 | P1 | ~250 sor + tesztek | alacsony |
| P9 | P1 | ~250 sor + tesztek | alacsony |
| P10 | P9 | külön terv | – |

Ajánlott menet: P0 → P1 → P2 → P4 → P3 → P5 → P6 → P7 → P8 → P9. Mindegyik külön commit, tesztekkel és a README, migrációs térkép és leltár frissítésével, ahogy eddig.

## Döntések

| # | Kérdés | Döntés (2026-11-01) |
|---|---|---|
| 1 | Név | **Colony Chief** (`ColonyChief`, modul: `chief/`). A tagszerep `director` marad, ő hívhatja a `chief-override`-ot. |
| 2 | A pontozás váltsa fel a mai kiosztást | Igen. |
| 3 | `chief-override` | Igen: három típusra, indoklással, auditnaplóval, csak `director` szerepű tagnak, a Deputy utólagos megjelölésével. |
| 4 | Ügynökrendszer | A felhasználó terve, **10 szerepre összevonva** (lásd fent). A régi 15 ügynökös hierarchia csak opcionális sablon (`legacy-15`, P9), alapból `offline` tagokkal. |
| 5 | Becslések | Igen: `heuristic` jelöléssel, felülírható alapértékként. |

## Nyitott pont

- A 10 szerepre való összevonás (Scraper + Cleansing + Deep Research egy `researcher`; Synthesis a Chief-nél; a Budget kimarad) az én javaslatom a terv alapján. Ha külön szerepként kell valamelyik, a P1-et érinti.
