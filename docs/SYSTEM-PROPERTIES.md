# A Kristal Colony rendszer tulajdonságai

Ez a dokumentum a `packages/colony-core` jelenlegi, forráskódban megvalósított működését foglalja össze. A rendszer átmenet alatt áll; a forráskód az irányadó.

## Alapelv és modellhatár

A Kristal Colony modellfüggetlen koordinációs mag. A core nem hív LLM-et, nem kezel modellkulcsot, és nem futtatja önállóan az ágenseket. A host (például egy LLM-et futtató alkalmazás) kapja meg a profilokat, a feladat- és bizonyítékkontextust, majd maga futtatja a kiválasztott agentet és adja vissza az eredményt.

Az agentprofilokban található rendszerutasítások, hőmérsékletek és Top-P értékek a hostnak szóló ajánlások. A Colony nem tudja kikényszeríteni, hogy a host ezeket betartsa, vagy hogy az LLM válasza tényszerű legyen.

## Agentprofilok és képességek

A rendszer 13 előre definiált profilt tartalmaz:

- **Colony Director** – célbontás, feladatok tervezése és delegálása.
- **System Architect** – rendszertervezés és interfészspecifikáció.
- **Senior Implementation Engineer** – implementáció, refaktorálás és hibakeresés.
- **Code & Architecture Reviewer** – kódminőség, architektúra és regressziók felülvizsgálata.
- **QA & Verification Engineer** – tesztelés és ellenőrzés.
- **Security & Vulnerability Analyst** – biztonsági kockázatok és adatfolyamok vizsgálata.
- **Auditor** – megfelelőség és audit.
- **Research & Data Gathering Specialist** – források gyűjtése, összevetése és strukturálása.
- **Data Analyst & Reasoning Specialist** – adatelemzés és következtetés.
- **Content & Documentation Writer** – dokumentáció és közönséghez igazított szöveg.
- **Exobiologist** – rögzített anomáliákból alternatív, cáfolható hipotéziseket alkot.
- **Mother** – vitán kívüli, nem döntéshozó, bizonyítékokra támaszkodó tanácsadó.
- **Concerned Challenger** – magas hőfokú, kockázatokat ütköztető kritikus.

Minden profil megkapja az általános alapkészségeket: világos kommunikáció, strukturált tervezés, bizonyítékértékelés, bizonytalanság kezelése, kockázatfelismerés, feladathoz kötött tanulás, ellenőrzés, együttműködő átadás és biztonsági határok tisztelete.

A profilhoz tartozó képességek és a tag domain-specializációi csak akkor aktiválódnak, ha a feladat ezeket kéri. Ha nincs megadva speciális képesség, a host a feladatleíráshoz igazítja a szaktudást, és jelzi a feltételezéseket vagy tudáshiányt. A tagokhoz például `domain:<slug>` vagy `release-operations` specializáció rendelhető.

## Vita és döntéshozatal

Az agentek vitatípusa szerepkörönként alapértelmezett és egy alternatív módra van korlátozva. Az alternatív mód más nézőpontot adhat ugyanahhoz az állásponthoz. A módok:

| Vitamód | Rendeltetés |
|---|---|
| Racionális | Érvek és bizonyítékok alapján keresi a helyes álláspontot. |
| Tényfeltáró | A bizonyítékokat, tudáshiányokat és cáfolhatóságot vizsgálja. |
| Törvényszéki tárgyalás | Szabályozott, állításokra összpontosító ellenérvelés. |
| Tárgyalás | Érdekütközés esetén elfogadható kompromisszumot keres. |
| Veszekedés | Erőteljes, magas feszültségű kihívás; kizárólag a Concerned Challenger számára elérhető. |

A szerepkörök alap- és alternatív módjai:

| Szerepkör | Alap | Alternatíva |
|---|---|---|
| Director | Racionális | Tárgyalás |
| Architect | Racionális | Tényfeltáró |
| Engineer | Racionális | Törvényszéki tárgyalás |
| Reviewer | Törvényszéki tárgyalás | Racionális |
| Tester | Tényfeltáró | Törvényszéki tárgyalás |
| Analyst | Tényfeltáró | Racionális |
| Security | Törvényszéki tárgyalás | Tényfeltáró |
| Auditor | Törvényszéki tárgyalás | Tárgyalás |
| Researcher | Tényfeltáró | Racionális |
| Writer | Tárgyalás | Racionális |
| Exobiologist | Racionális | Tényfeltáró |
| Custom | Racionális | Tényfeltáró |

A **Concerned Challenger** külön profil: alapmódja a veszekedés, alternatívája a törvényszéki tárgyalás, ajánlott hőmérséklete 1.0. Erősen támadhat állításokat, feltételezéseket és bizonyítékokat, de a személyeskedés, fenyegetés és megfélemlítés tiltott. Más profil szerepkörén keresztül sem kérheti a veszekedés módot.

A javaslatok auditálható folyamata: **álláspontok → válaszok → végleges javaslat → szavazás**. A javaslat létrehozásakor rögzül a választói kör, a tagok szerepe és profilazonosítója, valamint súlyozott szavazás esetén a súlyuk. A lezáráshoz legalább egy álláspont és egy másik tag válasza szükséges. A javaslatot a létrehozó véglegesíti, a szavazás ezután nyílik meg. A napló hash-láncoltan rögzíti a vitabejegyzéseket és a végleges szöveget.

Támogatott kvórumstratégiák: többség, minősített többség, bizánci (3f+1), egyhangúság és súlyozott döntés. Byzantine szavazáskor a szavazat opcionális `executionContextId` mezője alapján az azonos végrehajtási kontextusból érkező voksok legfeljebb egy jóváhagyásnak számítanak; a hiányzó azonosítók közös, nem igazolt forrásnak számítanak. A `getProposal` és `snapshot` `independenceProof` összesítést ad a szavazók számáról, a különböző bejelentett kontextusokról és az `identityConfidence` értékéről. Ez a host állítása, nem kriptográfiai bizonyíték: a core nem tudja igazolni, hogy a host nem hamisított különböző azonosítókat. Az Exobiologist nem szavazhat; az újonnan érkező vagy a rögzített körön kívüli tag sem. Mother tanácsadóként nem része a vitának vagy a választói körnek, és nem szavaz.

## Mother: belső, virtuális tanácsadó

Mother az LLM-et futtató hoston belül működő virtuális AI-agentprofil („alma az almában”). A taglistában azonosítható, de szerepe elkülönül a vitázó és döntéshozó agentektől.

- Hőmérséklet-ajánlása 0; nincs vita- vagy feladatvégrehajtási módja.
- Az agentek kérdést intézhetnek hozzá a `mother ask` paranccsal, feladat-, javaslat- és kontextusazonosítók megadásával.
- Professzionális, több nézőpontot mérlegelő tanácsot ad; a rendelkezésére bocsátott adatokra és forrásokra támaszkodik.
- Különválasztja a tényeket, forrásolt állításokat, következtetéseket és ismeretleneket, és a megadott bizonyítékazonosítókat hivatkozza.
- Nem vitázik, nem szavaz, nem dönt és nem vesz fel feladatot.

A core a Mother-profilhoz készíti elő a strukturált konzultációs kérést, de a modellt a host futtatja. Ezért a válasz bizonyítékokon alapuló viselkedése utasítás és hostoldali végrehajtás, nem független tényellenőrzési garancia.

## Feladatok, koordináció és memória

A host JSON-alapú CLI-parancsokkal vagy a csomag API-jával működtetheti a rendszert. A feladatok függőségekkel bonthatók fel, delegálhatók, igényelhetők (claim), átadhatók, befejezhetők vagy hibára jelölhetők. A `colony boot` opcionális diagnosztika; az első tényleges parancs betölti vagy inicializálja a kolónia állapotát.

A tagok állapota, feladatai, javaslatai, foglalásai és routerállapota a projekt `.colony/` könyvtárában marad. A vektoros memória szolgáltatófüggetlen embedding-interfésszel, névterekkel és fájlbeli perzisztenciával működik; a keresés lineáris vagy determinisztikus HNSW-indexű lehet.

A rendszerhez tartozik topológiaépítés, feladatkiosztási pontozás, egészségi és torlódási jelentés, felülvizsgálati és biztonsági kapuk, auditnapló, valamint korábbi kimenetekből tanuló routing és feladateredmény-memória. Ezek egy része heurisztikus: például a kiosztási pontszám és a jelentett teljesítmény nem független minőségmérés. A jelentések determinisztikus szintézise szóalapú hasonlóságot használ; a végső összefoglalót a host készíti.

## Ruflo-migráció

A Colony-képességek Colony-natív megvalósítások. A migráció a módszertant és a szükséges viselkedést viszi át, nem régi Ruflo-forráskód másolásával. A legacy források és hivatkozások állapotát a migrációs dokumentum írja le; ez az összefoglaló a Colony jelenlegi rendszerét ismerteti.

## Korlátok

A Colony koordinál, állapotot tárol és szabályokat ellenőriz; önmagában nem intelligens modell és nem igazságellenőrző szolgáltatás. A következtetések minősége a hosttól, az LLM-től, a bemeneti bizonyítékoktól és a jelentett eredményektől függ. A sampling, a profilutasítások és több minőségi mutató ajánlás vagy heurisztika, nem kikényszerített garancia.
