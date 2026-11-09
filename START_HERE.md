# Start Here

A Colony semmilyen LLM-szolgáltatót nem hív: a host (például a Cowork) maga a modell. Az indításhoz egyetlen utasítás kell, amit feladatadáskor a hostnak adsz. A hostra semmi mást nem kell telepíteni, csak Node.js 20+ és pnpm.

## Alap utasítás

Másold be a hostnak, és a végén cseréld ki a **[FELADAT]** részt:

> A `Pocomotoxx/Kristalplus` GitHub-repót használd. Ha a `packages/colony-core/dist/cli.js` még nincs meg, fordítsd le: `cd packages/colony-core && pnpm install && pnpm build`.
> A `boot` parancs opcionális diagnosztika, munkakezdéshez nem szükséges. A `task add`, `next`, `done` és a többi parancs önállóan betölti vagy inicializálja a kolónia állapotát. Hibás állomány esetén javítsd a jelzett adatot; a bootrekord nem tiltja le a munkát.
> A feladatot a `task add` paranccsal vedd fel, a `next --as <szerep>` paranccsal kérd le, és `done --result` vagy `fail --error` paranccsal zárd le. Az eredményt ne találd ki: csak azt írd le, amit ténylegesen megtettél és ellenőriztél.
> Feladat: **[FELADAT]**

## Rövid utasítás

> Colony mód. A `Pocomotoxx/Kristalplus` repóban fordítsd le a `packages/colony-core` csomagot, majd vedd fel a feladatot a `task add` paranccsal, kérd le a `next --as <szerep>` paranccsal, és zárd le `done --result` vagy `fail --error` paranccsal. A `boot` parancs opcionális diagnosztika. Feladat: **[FELADAT]**

## Tudnivalók

- A `<projektmappa>` az a mappa, amelyben a munka folyik. Az állapot (`.colony/`) és a szabályok (`.colony/rules/`) oda kerülnek, az első boot létrehozza őket. A parancsok az eszköz mappájától függetlenül futnak.
- A `boot` kiírja az opcionális diagnosztika eredményét és a helyi szabályfájlokat; a fájlok eltérése figyelmeztetés, nem munkakapu.
- A parancsok teljes listája: [README.md](README.md).
