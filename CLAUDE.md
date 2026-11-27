# Clip Shelf

Electron desktop app (Windows first) to browse, tag and organize gameplay clips from many folders, then drag them into a video editor. Owner: Frits (GitHub `ItsFrits/clip-shelf`). He uses it daily on ~9000 Rocket League clips (~290 GB) and edits in Vegas Pro, but the app must work with any editor that accepts dragged files. Friends install it from GitHub Releases, so nothing may be hardcoded to his machine (no fixed folder paths).

## How we work (read this first)

- Chat with Frits in casual Dutch, honest, modest, no m-dashes. Everything in the repo (code, comments, commits, UI text, docs, changelog) is English.
- The general workflow lives in the user-level skills: `project-kickoff`, `feature-spec`, `feature-build`, `feature-ship`, `release`, `bug-fix`. Use them. The short version:
  1. Idea chat: work out the feature, write `docs/specs/<name>.md`, Frits adjusts and says OK. Nothing is built before that.
  2. Build chat (one new chat per feature): read the spec, branch `feat/<name>`, build, commit, lint + typecheck + test, start `npm run dev`, send Frits a checklist of what to test. Then stop and wait.
  3. Iterate on the same branch until Frits says everything is perfect.
  4. Ship: push, PR via `gh`, merge, delete branch. Update ROADMAP and this file in the same PR.
  5. Release: decide when a release is worth it and which version number.
- Lint, typecheck, tests, git add/commit and the dev app may run without asking. Always ask before `git push`, merging a PR, and `npm run release`. Proposing to do these when it is time is fine. (Enforced in `.claude/settings.json`.)
- Always verify before saying something works: run the checks, run the app.
- Where things are: `docs/ROADMAP.md` (what is done, next, ideas, parked), `docs/specs/*.md` (one per feature), `CHANGELOG.md`, `COMMANDS.md` (Frits's own cheat sheet, Dutch, do not rewrite it in English).

## Commands

| Command | What |
| --- | --- |
| `npm run dev` | Start the app with live reload. Uses the SAME data as the installed app (`%APPDATA%\Clip Shelf`), so test on real data carefully. Auto-update does not run in dev. |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run typecheck` | Node and web tsconfig |
| `npm test` | Vitest (about 234 tests; some make small test videos with the bundled ffmpeg) |
| `npm run format` / `npx prettier --write src tests` | Format (the npm script formats the whole repo). Prettier can reformat text, so re-read a file before an exact text replacement. |
| `npm run release -- X.Y.Z` | Release script, only on a clean `main`, see Releases below |

Shell on Frits's PC is Git Bash or the VS Code terminal. Electron runs natively on Windows (no xvfb needed).

## Stack and layout

Electron 39, electron-vite, React 19, TypeScript, zustand, Vitest, electron-builder, electron-updater.

```
src/main       main process: scanner/watcher (chokidar), thumbnails, audio extraction, drag-out, updater, IPC, user data store
src/preload    bridge; methods listed in INVOKE_METHODS are wired automatically
src/renderer/src  React UI (components/, lib/store.ts = zustand `useApp`, styles/app.css)
src/shared     types and pure logic used by both sides (projects.ts, sort.ts, presets.ts, keymap.ts, ...)
tests          Vitest, mostly for src/shared
```

## Architecture rules and gotchas

- **IPC:** add a method to `ClipShelfApi` and to `INVOKE_METHODS` in `src/shared/api.ts`, then implement it with `handle(name, fn)` in `src/main/ipc.ts`. Give handler parameters explicit types, otherwise TypeScript infers `never`.
- **Events:** user-data operations whose result the renderer cannot predict (tag rename/delete/merge, project changes, restore) end with `emit('user:replaced', user.data)` in `ipc.ts`; the renderer store listens to that. Simple ones like `patchClips` do not emit, the store applies them itself.
- **Renderer store does not refresh itself** after a direct `window.api.*` call in a test. Go through the store, or reload the window.
- **Pure logic goes in `src/shared`** with unit tests. UI is checked by running the app.
- **Keyboard:** every action must be rebindable. New hotkeys are added as actions in `src/shared/keymap.ts` (scope global, library or player) and show up in Settings, Hotkeys automatically.
- **User data** is in `%APPDATA%\Clip Shelf`: `userdata.json` (tags, notes, ratings, projects, settings, with daily backups), `index.json` (rebuildable), `clip-cache/`. Never change or move the user's clip files, only the trash action moves files to the recycle bin.
- **Normalization:** project data is cleaned by `sanitizeProjects` (on load), `cleanOrder` / `cleanPicks` (when the order or picks are saved) and `UserDataStore.changeProjects` + `syncUsed` (keeps `used` in sync). New fields need defaults there so old `userdata.json` files keep loading.
- **Lint:** `react-hooks/refs` forbids updating a ref during render, do it in an effect.
- **CSS:** one file, `src/renderer/src/styles/app.css`. Classes are prefixed per component. Check for existing prefixes before adding (there was a `pp-*` collision once).
- **Tooltips:** use the `data-tip` attribute (custom tooltip system, `white-space: pre-line`), not `title`.
- **Dialogs and popovers:** reuse `.overlay`, `.dialog`, `.pd-pop`.
- **Drag in the UI:** pointer-based drag with a ghost element and FLIP animation (see `ProjectOrder.tsx`). Remove window listeners on cleanup, there was a stale listener bug. Drag out to the editor uses `draggable` + `onDragStart` with `preventDefault` + `startDrag(keys)`.

## Data model: projects

`Project { id, name, status: 'working' | 'published', link, notes, clipKeys, order, skipped, sent, createdAt }`

- `order` is a subset of `clipKeys` (clips that have a place), `skipped` and `sent` are subsets of `order`, `sent` never overlaps `skipped`.
- `skipped` = left out of the video, `sent` = already dragged to the editor.
- `ClipUser.used` is the effective value: `usedManual` (hand-set switch) OR the clip is in a project. Never write `used` without thinking about `usedManual`.
- Pure helpers are in `src/shared/projects.ts` (`placeInOrder`, `stepInOrder`, `orderTimes`, `pickedKeys`, `setPicked`, `markSent`, `publishProject`, `removeFromAllProjects`, ...). Extend those, do not duplicate logic in components.
- Filter `SavedFilters.inProject: 'any' | 'yes' | 'no'` is wired through types.ts, savedFilters.ts, presets.ts (`scopedFilters`), renderer `lib/filter.ts` and `lib/presets.ts`, the sidebar and the library chips.

## Changelog

Every feature or fix adds user-facing lines under `## Unreleased` in `CHANGELOG.md` (plain English, what the user sees, not code). The release script turns that heading into the version number and refuses to release when Unreleased is empty.

## Releases

- Pick the version (semver: new feature = minor, fix only = patch) and ask Frits before running it.
- On a clean `main`: `git switch main && git pull && npm run release -- X.Y.Z`. The script bumps package.json, package-lock.json and the changelog, runs typecheck and tests, commits, pushes and tags `vX.Y.Z`. The tag starts the GitHub Actions build (Windows runner), which publishes the installer. Installed apps update themselves.
- The tag must equal the package.json version or CI stops on purpose.
- Watch the run with `gh run watch`. If it failed on a download problem (for example the Electron binary download returning HTTP 504), `gh run rerun <id> --failed` fixes it. If it failed on real code, fix it and move the tag (see `COMMANDS.md`, "Als de build faalt"), after asking Frits.
- The installer is unsigned, so Windows SmartScreen warns on first install.

## Known loose ends

- The "Release a new version" section in `README.md` still describes `npm version patch`. The real process is `npm run release -- X.Y.Z`. Fix it when the README gets its update (see ROADMAP).
- There is no automated UI test. Earlier checks used throwaway Playwright scripts driving the real Electron app, which are gone. `chore/e2e-smoke` in the ROADMAP is the plan to make a proper one.
