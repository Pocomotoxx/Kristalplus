# Legacy: Ruflo

A `ruflo/` mappa a korábbi Ruflo / Claude Flow kód változatlan másolata (átmozgatva, tartalmilag érintetlenül, a git-előzmény követi a fájlokat). A Kristal Colony ebből inspirálódott, de nem használja.

## Állapot

- **Befagyasztott, nem épül és nem fut.** A Colony kódja és buildje nem hivatkozik rá.
- **Nincs aktív CI.** A régi workflow-k a `legacy/ruflo/.github/workflows/` alatt vannak. A GitHub csak a gyökér `.github/workflows/` mappát futtatja, az pedig üres, tehát a repóban semmilyen workflow nem fut.
- **A Ruflo a Colonynak csak váz.** A Colony ennek egy részét veszi át. A modellszolgáltatókhoz és külső LLM-ekhez kötött részek nem kerülnek át.
- **A személyes `CLAUDE.local.md` törölve** (a git-előzményben megvan).
- **A hostfüggő utasításfájlok törölve.** A régi `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.agents/`, `.claude-plugin/`, `plugin/` és `chatgpt-plugin/` már nincs meg (a git-előzményben igen).
- **Válogatás megtörtént.** A [docs/LEGACY-INVENTORY.md](../docs/LEGACY-INVENTORY.md) C listája (LLM- és hostfüggő csomagok, pluginok) törölve. Maradt a váz: a `v3/@claude-flow` tíz átvételre szánt csomagja és néhány eldöntendő elem, valamint a fogalmilag illő pluginok.

## Eredet és licenc

A másolat `package.json` fájlja szerint a szerző „RuvNet”, a licenc MIT, a forrás a `ruvnet/claude-flow` projekt. Az eredeti `LICENSE` fájl **nincs benne** ebben a másolatban. Mielőtt a kód bármely részét megtartod vagy továbbadod, az eredeti licencszöveget és a szerzői jogi nyilatkozatot be kell szerezni a forrásprojektből, és ide kell tenni.

## Kivezetés

Az átépítés sorrendje a [docs/COLONY-MIGRATION.md](../docs/COLONY-MIGRATION.md) fájlban van. A hátralévő lépés: minden pluginra és csomagra döntés (átvesz, újraír, kivezet), a kivezetettek törlése.
