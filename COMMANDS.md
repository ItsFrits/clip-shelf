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

## Werken met branches (een feature per branch)

`main` is altijd de werkende versie. Elke feature krijgt een eigen branch (`feat/naam` of `fix/naam`), dus als er iets stuk gaat weten we welke branch het was.

1. **Starten en vastzetten.** Claude zet de bestanden in de map. Dan maak je de branch en zet je de code meteen vast in een commit (eerst opslaan, dan pas controleren, zodat je altijd terug kunt):

```bash
git switch -c feat/naam && git add -A && git commit -m "Wat er veranderd is" && npm run typecheck && npm test && npm run dev
```

   `git switch -c` maakt de branch en neemt de nieuwe bestanden mee. `npm run dev` start als laatste de app om te testen (zelfde data als de geinstalleerde app), en alleen als alles ervoor goed ging. Stop de app met Ctrl+C in de terminal, of sluit het venster.

   Staat de branch er al (foutmelding "already exists")? Dan sla je `git switch -c feat/naam &&` over en gebruik je: `git add -A && (git diff --cached --quiet || git commit -m "Wat er veranderd is") && npm run typecheck && npm test && npm run dev`. Dat commit alleen als er iets te committen is.

2. **Aanpassingen** na het testen? Zet die ook vast voor je verder gaat:

```bash
git add -A && git commit -m "Aanpassing"
```

3. **Afronden** als alles goed is: naar GitHub en samenvoegen in `main`:

```bash
npm run typecheck && npm test && git push -u origin feat/naam && git switch main && git merge feat/naam && git push && git branch -d feat/naam
```

4. **Tussendoor kijken waar je bent:** `git branch --show-current` (huidige branch) en `git status` (wat is er veranderd).

5. **Iets terugdraaien** dat al in `main` zit: `git log --oneline -10` laat de commits zien, `git revert <code>` draait een commit terug met een nieuwe commit (veilig, er gaat niets verloren).

## Een nieuwe versie uitbrengen (release)

Een release is een aparte stap op `main`, pas als Claude zegt dat het een goed moment is. Alleen een tag start de build en de update voor gebruikers.

1. Claude past `version` in `package.json` en `CHANGELOG.md` aan.
2. Daarna, op `main`:

```bash
git switch main && npm run typecheck && npm test && git add -A && git commit -m "Release 0.2.0" && git push && git tag v0.2.0 && git push origin v0.2.0
```

De tag moet exact `v` + het versienummer uit `package.json` zijn, anders stopt de build bewust. De tag start de build op GitHub (tab Actions). Na ongeveer 5 minuten staat de installer onder Releases. Mensen met de app krijgen de update binnen 4 uur zelf, of direct via Settings, Check for updates.

## Als de build faalt

Maak de fout hier eerst lokaal, daarna de tag opnieuw op de nieuwe commit zetten (vervang het versienummer):

```bash
git add -A
git commit -m "Fix build"
git push
git tag -d v0.2.0
git push origin :refs/tags/v0.2.0
git tag v0.2.0
git push origin v0.2.0
```

Waarom: "Re-run jobs" op GitHub gebruikt de oude code van die tag, dus een fix werkt pas als de tag verplaatst is. Staat er al een release, dan overschrijft de workflow die zelf.

## Problemen opsporen

| Commando | Waarom |
| --- | --- |
| `git status` | Wat is er veranderd en nog niet gecommit? Laat ook zien als bestanden niet in de commit zitten. |
| `git branch --show-current` | Op welke branch zit ik? |
| `git log --oneline -5` | De laatste commits. |
| `git tag` | Welke tags er lokaal bestaan. |
| `node node_modules/electron/install.js` | Herstelt Electron als `npm run dev` zegt dat Electron niet geinstalleerd is. |
| `node scripts/inspect-mp4.mjs "D:/Video's/OBS/clip.mp4"` | Laat zien waar een opnamesoftware de namen van audiosporen opslaat. |
| `node_modules/@ffprobe-installer/win32-x64/ffprobe.exe -v error -show_streams "clip.mp4"` | Alles wat ffprobe in een clip ziet (duur, codecs, sporen). |

## Waar staat mijn data

`%APPDATA%\Clip Shelf`: `userdata.json` (tags, notities, ratings, instellingen), `index.json` (kan opnieuw opgebouwd worden) en de map `clip-cache`. Er is een automatische backup (14 dagen) naast `userdata.json`.
