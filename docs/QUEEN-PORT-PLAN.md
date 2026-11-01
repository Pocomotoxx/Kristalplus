# A swarm-koordinátorok átemelésének terve

Állapot: 2026-11-01. Terv, kód még nincs. Forrás: `legacy/ruflo/v3/@claude-flow/swarm/src/` (kb. 7400 sor a hat nagy fájlban).

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

A terv ezért a Queen-re részletes, a többire vázlat. A P0 lépés pótolja a hiányt, mielőtt bármi kódot írnánk.

## A lényeg: mi a „lélek", és hogyan fér a host-vezérelt magba

A Queen hat dolgot csinál: **elemez** → **kioszt** → **pontoz** → **figyeli az egészséget** → **szavaztat** → **tanul a kimenetből**. A régi rendszerben ő hajtotta végre is a munkát (ügynökök poolja, időzítők, `waitForTaskCompletion`). A Colonyban a munkát a host végzi, ezért a Queen itt **tanácsadó és nyilvántartó**: tiszta, determinisztikus függvények, amelyek javaslatot adnak, és a host dönt. A végrehajtó gépezet (pool, skálázás, háttérszálak) nem kerül át, mert a hostnak nincs rá szüksége.

| A Queen feladata | Mi lesz belőle a Colonyban | Hol |
|---|---|---|
| `analyzeTask` | feladatelemzés és felbontás részfeladatokra | P2 |
| `scoreAgents`, `selectPrimary/Backup` | tagok pontozása, elsődleges és tartalék tag | P1 |
| `monitorSwarmHealth` | `colony health` | P3 |
| `coordinateConsensus` (weighted, queen-override) | két hiányzó szavazási mód | P4 |
| `recordOutcome` | minőség és statisztika a kimenetből | P5 |
| attention-coordinator | több tag kimenetének összegzése | P6 |
| federation-hub | ideiglenes (feladatra szóló) tagok | P7 |

## Fázisok

### P0 – Előkészítés (kicsi, kód nélkül)

- Elolvasni a hiányzó részeket: Queen 870–1100 és 1560–1700, `unified-coordinator` `assignTask` és `scoreAgentForTask` (801–905), `message-bus.ts`, `domain/` és `application/`.
- A leltár frissítése. Ha a `message-bus.ts` tud valamit, ami a Colony `MessageBus`-ából hiányzik (prioritás, visszaigazolás, holtlevél-sor), az külön tétel lesz.
- **Tagstatisztika alapja:** a főkönyvből és az auditnaplóból levezetett mutatók tagonként (befejezett, hibás, átlagos időtartam, utolsó tevékenység). Nem új tár, a meglévő adatokból számolt.

### P1 – Pontozás és tartalék tagok

A régi pontszám súlyai: képesség 0,30, terhelés 0,20, teljesítmény 0,25, egészség 0,15, elérhetőség 0,10.

- Új: `director/scoring.ts`, `colony score <feladat>`: minden tag pontszáma összetevőkre bontva.
- Összetevők a Colony adataiból: képesség = szerep és eszköz egyezés a feladattal; terhelés = `currentTaskIds / maxConcurrentTasks`; teljesítmény = tényleges sikerarány a P0 statisztikából; egészség = hibás/offline állapot és elavult foglalások; elérhetőség = `idle`/`busy`.
- Elsődleges tag + legfeljebb 2 tartalék (küszöb 0,3, mint a régiben).
- **Viselkedésváltozás:** a `tryDispatchTask` ma a legkevésbé terhelt tagot választja. A pontozás ezt váltja fel. Holtversenynél a tag azonosítója dönt (determinisztikus).
- **Összekötés a foglalásokkal:** egy elavult foglalásnál a `claim sweep` kiírja, melyik tartalék tag a legjobb átvevő.
- Teszt: súlyok, holtverseny, tartalék, régi és új kiosztás összevetése.

### P2 – Elemzés, felbontás, végrehajtási terv

- `director/analysis.ts`, `colony plan <feladat>` (csak olvas) és `colony plan <feladat> --apply` (valódi részfeladatokat hoz létre `parentId`/`dependencies` kitöltésével; a mezők már megvannak a `ColonyTask`-ban).
- Felbontási sablonok a régiből: kódolás (terv → megvalósítás → teszt), tesztelés, kutatás, koordináció; az egyszerű feladat (200 karakter alatt, dokumentáció, ellenőrzés) nem bomlik.
- **Végrehajtási stratégia a függőségi gráfból:** a részfeladatok hullámokra bontása (mi futhat egyszerre). A régi öt stratégianevet (sequential, parallel, pipeline, fan-out-fan-in, hybrid) a gráf alakjából vezetjük le, nem külön konfigurációból.
- A mintaillesztést a meglévő Reasoning Bank adja.
- **A becslések őszinteségéről:** a régi időtartamok (10 s, 30 s, 15 s) és a komplexitás-képlet kézzel megadott számok, nem mérések. Az átvett értékek `heuristic` jelölést kapnak, felülírhatók, és ahol van mért adat (P0 statisztika), az az erősebb.
- A régi `memoryMb`, `cpuIntensive`, `networkRequired` erőforrás-becslés kimarad: a host erőforrásairól a Colony nem tud semmit.

### P3 – Egészségjelentés

- `director/health.ts`, `colony health`: tagok, „domainek", szűk keresztmetszetek (sorhossz 10 fölött, hibás tagok, elavult foglalások), figyelmeztetések, javaslatok.
- **A régi hiány:** a domain-egészségnél az `avgResponseTimeMs` és az `errorRate` egyaránt fixen 0 volt ("Would need tracking"). Itt a foglalásokból (átfutási idő) és az auditnaplóból (hibás/összes) valósan számoljuk.
- A „domain" fogalom: a régi öt (queen, security, core, integration, support) szerepekre leképezve. A 15 ügynökös fix hierarchiát (`spawnFullHierarchy`) nem emeljük át; a 6 beépített tag marad.
- Kimarad: `coordinationLatencyMs` (futásidejű mérőszám, itt nincs értelme).

### P4 – Két hiányzó szavazási mód

A Colony ma: `majority`, `supermajority`, `byzantine`, `unanimous`. Hiányzik a Queen két módja.

- **`weighted`:** a szavazat súlya = a tag teljesítménye × egészsége (a régi képlet). A régi kódban ez sokáig hatástalan volt (a súlyok sosem jutottak el a számláláshoz, mindegyik súlyozott döntés sima többség lett; egy 2026-os javítás hozta rendbe). Itt a súly a szavazat leadásakor kerül a szavazatba és az auditnaplóba, a számlálás tesztelve van arra, hogy a súly valóban számít.
- **`director-override`:** egyoldalú döntés, csak három típusra (vészhelyzeti művelet, tag leállítása, prioritás-felülbírálat), a régi korlátozással. **Ez nem szavazás, hanem hatalom**, ezért: csak `--as` igazgató szerepű tag, kötelező indoklás, mindig az auditnaplóba kerül, és a `status` külön jelzi. A te döntésed, hogy kell-e (lásd lent).
- A `propose` kiterjesztése, tesztek a súlyozott kvórumra és a visszaélésre (nem igazgató, hiányzó indoklás, nem engedett típus).

### P5 – Tanulás a kimenetből

- `done --quality 0..1` (nem kötelező). A jutalom a régi képlettel: siker esetén `minőség × 0,8 + 0,2`, kudarcnál `minőség × 0,3`.
- Betáplálás a routerbe (ma +0,5/−1 fix) és a tagstatisztikába.
- Kimenet a memóriába egy `outcomes` névtérbe, a régi `formatOutcomeContent` szerint.
- **Őszinteség:** a minőséget a host adja meg. A jutalom és a statisztika „jelentett", nem ellenőrzött, a kimenetben is így címkézve (a Krista-szabály szerint).

### P6 – Több tag kimenetének összegzése (az attention-coordinator maradéka)

- A régi fájl hat figyelemmechanizmust kínál (multi-head, flash, linear, hyperbolic, moe, graph-rope). A saját fejléce szerint a flash gyorsulása „unverified". 15 tagnál a pontos softmax-figyelem triviálisan gyors, a közelítések nem adnak semmit.
- Átvesszük a lényeget: `colony synthesize <feladat>`: ugyanarra a feladatra érkezett több jelentésből kiválasztja a „középsőt" (amelyik a többihez a leghasonlóbb), megadja az egyetértési pontot és a kilógókat. A régi `neural/utils/self-consistency.ts` (134 sor) ide illik, azt is át kell nézni.
- **Korlát:** a mai beágyazás hash-alapú, tehát a hasonlóság szóegyezést mér, nem jelentést. Ezt a kimenet jelzi.
- Az MoE-szakértőválasztás beágyazással és kapacitással: kis kiegészítés a P1 pontozásához, ha kell.
- Kimarad: flash, linear, hyperbolic, graph-rope.

### P7 – Ideiglenes tagok (a federation-hub használható része)

- Az „efemer ügynök" itt: a host egy részfeladatra indít egy al-munkamenetet (alügynököt). `colony member add --ephemeral --ttl-min N`, lejáratkor `member sweep` leveszi, a feladata pedig a foglalás-elavulás útján átvehetővé válik.
- A régi `setInterval`-os takarítás és a `Math.random()` azonosító helyett kifejezett söprés és determinisztikus azonosító.
- A `broadcast`, `selectOptimalSwarm` és a föderációs szavazás hálózati/több telepítéses, ez a P8.

### P8 – Több Colony egymás közt (csak tervezés)

A federation-hub „swarm" fogalma több telepítés. Hálózat nélkül ez csak git-alapú csomagcsere lehet (hash-ellenőrzött export és import). Ezt külön tervként kell megírni, nem a régi kódból.

## Ami nem kerül át, és miért

- `agent-pool` (acquire/release/skálázás/egészségellenőrző szál) és a `unified-coordinator` futtató része: a host maga az ügynök, a skálázás az ő dolga. Amit a `unified-coordinator` hasznosat tud (pontozás, heartbeat, helyreállítás), azt a P1 és a foglalások már lefedik.
- `waitForTaskCompletion`, háttérszálak, szüneteltetés/folytatás: futtató gépezet.
- A hálózati és időzítős részek.

## Sorrend, méret, függőségek

| Fázis | Függ | Becsült méret | Kockázat |
|---|---|---|---|
| P0 | – | olvasás, leltár | alacsony |
| P1 | P0 | ~300 sor + tesztek | közepes (megváltozik a kiosztás) |
| P2 | P1 | ~400 sor + tesztek | közepes (a heurisztikák minősége) |
| P3 | P0 | ~250 sor + tesztek | alacsony |
| P4 | P1 | ~250 sor + tesztek | **magas** a `director-override` miatt |
| P5 | P0 | ~150 sor + tesztek | alacsony |
| P6 | P1 | ~250 sor + tesztek | alacsony |
| P7 | P1 | ~200 sor + tesztek | alacsony |
| P8 | P7 | külön terv | – |

Ajánlott menet: P0 → P1 → P3 → P2 → P5 → P4 → P6 → P7. Mindegyik külön commit, tesztekkel és a README, migrációs térkép és leltár frissítésével, ahogy eddig.

## Döntések, amelyek a tieid

1. **Név.** A README ma azt írja: Queen → `ColonyHub`. A hangyakolóniának is van királynője, a Queen így a kolónia nyelvén is helyes. Marad-e `Queen` (szerep és modul), vagy `Director`? Javaslat: a szerep marad `director` (már ez van a kódban), a modul neve `director/`.
2. **Kiosztás.** A pontozás váltsa-e fel a mai „legkevésbé terhelt" kiválasztást (P1)? Javaslat: igen.
3. **`director-override`.** Kell-e egyoldalú döntés? Javaslat: igen, de csak három típusra, indoklással, auditnaplóval. Ha nem, a P4 csak a `weighted`.
4. **A 15 ügynökös hierarchia.** Javaslat: nem, a 6 beépített tag marad, a „domain" csak csoportosítás.
5. **Becslések.** Elfogadod, hogy a régi időtartam- és komplexitásszámok `heuristic` jelöléssel, felülírható alapértékként kerülnek át?
