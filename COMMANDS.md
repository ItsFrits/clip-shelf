# Commands cheat sheet

All commands run in Git Bash, in the project folder. Notes are in Dutch on purpose, this file is for me.

## Dagelijks ontwikkelen

| Commando | Waarom |
| --- | --- |
| `npm run dev` | Start de app met live reload. Updates worden hier niet gecheckt, dat kan alleen in de geinstalleerde app. |
| `npm run typecheck` | Zoekt TypeScript fouten. GitHub draait dit ook, als dit faalt faalt de release. |
| `npm test` | Draait de tests. GitHub draait dit ook. |
| `npm install` | Alleen nodig na een nieuwe `git pull` of als `package.json` is veranderd. |

Draai `npm run typecheck` en `npm test` altijd voor je een release maakt. Dan weet je dat GitHub niet faalt.

## Een nieuwe versie uitbrengen

1. Zorg dat `version` in `package.json` hoger is dan de vorige release. Claude past dit aan bij elke wijziging.
2. Controleer: `npm run typecheck` en `npm test`.
3. Opslaan en uploaden naar GitHub:

```bash
git add -A
git commit -m "Wat er veranderd is"
git push
```

4. De tag maken. De tag moet exact `v` + het versienummer uit `package.json` zijn, anders stopt de build bewust:

```bash
git tag v0.1.2
git push origin v0.1.2
```

De tag start de build op GitHub (tab Actions). Na ongeveer 5 minuten staat de installer onder Releases. Mensen met de app krijgen de update binnen 4 uur zelf, of direct via Settings, Check for updates.

## Als de build faalt

Maak de fout hier eerst lokaal, daarna de tag opnieuw op de nieuwe commit zetten:

```bash
git add -A
git commit -m "Fix build"
git push
git tag -d v0.1.1
git push origin :refs/tags/v0.1.1
git tag v0.1.2
git push origin v0.1.2
```

Waarom: "Re-run jobs" op GitHub gebruikt de oude code van die tag, dus een fix werkt pas als de tag verplaatst is. Staat er al een release, dan overschrijft de workflow die zelf.

## Problemen opsporen

| Commando | Waarom |
| --- | --- |
| `git status` | Wat is er veranderd en nog niet gecommit? Laat ook zien als bestanden niet in de commit zitten. |
| `git log --oneline -5` | De laatste commits. |
| `git tag` | Welke tags er lokaal bestaan. |
| `node node_modules/electron/install.js` | Herstelt Electron als `npm run dev` zegt dat Electron niet geinstalleerd is. |
| `node scripts/inspect-mp4.mjs "D:/Video's/OBS/clip.mp4"` | Laat zien waar een opnamesoftware de namen van audiosporen opslaat. |
| `node_modules/@ffprobe-installer/win32-x64/ffprobe.exe -v error -show_streams "clip.mp4"` | Alles wat ffprobe in een clip ziet (duur, codecs, sporen). |

## Waar staat mijn data

`%APPDATA%\Clip Shelf`: `userdata.json` (tags, notities, ratings, instellingen), `index.json` (kan opnieuw opgebouwd worden) en de map `clip-cache`. Er is een automatische backup (14 dagen) naast `userdata.json`.
