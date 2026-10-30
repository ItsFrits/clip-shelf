# Clip Shelf

Browse, tag and organize gameplay clips that are spread over many folders, then drag them straight into your video editor.

- Watches the folders you choose, live. Your files are never changed or moved.
- Plays a clip with **all** its audio tracks at once (game audio, mic, ...), each with its own volume and level meter. Works for tracks inside the mp4 and for a separate mic file with the same name (Radeon ReLive style).
- Tags (many per clip), notes, star ratings, and a status per clip: new, watched (played to the end), tagged, used.
- Search, filter by status, tag, rating, date and folder. Random clip, picked from the current results.
- Drag one or many clips to the video editor of your choice.
- Duplicates (same name and size in several folders) are merged into one clip.
- Every keyboard shortcut can be changed in Settings.
- Updates itself from GitHub Releases.

## Develop

```bash
npm install
npm run dev
```

Other scripts:

| Command             | What it does                                                                     |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm run typecheck` | Type check main process and interface                                            |
| `npm test`          | Unit and integration tests (they make small test videos with the bundled ffmpeg) |
| `npm run build:win` | Build the Windows installer into `dist/`                                         |

If `npm run dev` says the Electron binary is missing, run `node node_modules/electron/install.js` once.

## Release a new version

1. Change the version: `npm version patch` (or `minor` / `major`). This also creates a git tag like `v0.1.1`.
2. Push the commit and the tag: `git push --follow-tags`.
3. GitHub Actions builds the installer and publishes it as a release. Installed copies of the app download it by themselves.

The installer is not code signed yet, so Windows SmartScreen shows "unknown publisher" the first time. Click _More info_, then _Run anyway_.

## Where the data lives

In `%APPDATA%\Clip Shelf`:

- `userdata.json` - your tags, notes, ratings, folders and settings (this is the one that matters, `backups/` has daily copies)
- `index.json` - what the scanner found, can be deleted any time, it is rebuilt
- `clip-cache/` - thumbnails and copies of extra audio tracks, can be deleted any time

## Project layout

```
src/main      Electron main process: folder scanning and watching, thumbnails, audio extraction, drag out, updates
src/preload   The small bridge between main process and interface
src/renderer  The interface (React)
src/shared    Types and logic used by both sides (including the list of keyboard actions)
tests         Vitest tests
```
