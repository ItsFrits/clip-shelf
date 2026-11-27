# Clip Shelf roadmap

Single list of everything we want to build. This file is kept up to date: when an idea changes status, it is updated in the same branch.

Labels:
- `[done]` built, merged and released
- `[spec ready]` worked out in `docs/specs/<name>.md` and approved by Frits, can be built
- `[needs work-out]` idea exists, but it is not worked out yet. Before building, start an idea chat: propose how it works, brainstorm extra features around it, and write the spec
- `[proposed]` suggested, waiting for Frits to say yes
- `[parked]` good idea, not now

When Frits asks "what do we still need to make?", answer from this file, in the order below.

## Next up (in this order)

1. **Rank mode** `[spec ready]` (`docs/specs/rank-mode.md`). Rank clips by comparing two at a time on the Order tab of a project. Branch: `feat/project-rank`.
2. **E2E smoke test** `[proposed]` (`chore/e2e-smoke`). A real test in the repo that starts the built Electron app with Playwright, loads a small fixture library (a few tiny generated mp4 files, a temporary user data folder, never the real `%APPDATA%`), and checks the main flows: library shows clips, open the player, tag a clip, create a project, add clips, place them in the order. Run it with `npm run e2e`. This replaces the throwaway scripts we used before. Do it before or right after Rank mode, so later features have a safety net. Needs a short spec first.
3. **Fullscreen** `[needs work-out]` Fullscreen mode (details not decided yet: player only, whole app, hotkey, F11).
4. **Logo / app icon** `[needs work-out]` Replace the placeholder icon with a nicer one (generated or designed), for the installer, window and tray.
5. **Accent color** `[needs work-out]` Let the user choose the accent color of the app.
6. **README and screenshots** `[needs work-out]` Proper README with screenshots, fix the outdated release section (it must say `npm run release -- X.Y.Z`), install instructions for friends.
7. **1.0** `[needs work-out]` Decide what "1.0" must include (probably: the items above, plus stability review, code signing question, a look at performance with 9000 clips).

## Parked

- **In-app trimming** `[parked]` Trim a clip inside the app before dragging it to the editor.
- **Mobile app or PWA** `[parked]` Watch clips on the phone, connected to the desktop app. Separate connections for laptop and PC (they hold different clips). Frits owns the domain fritswelsing.com and is open to using it for this.
- **"Next unsorted clip" hotkey** `[parked]` Jump to the next clip that has no tags or rating yet.
- **Project presets** `[parked, skipped]` Not needed, Frits can save a "Ready for a video" filter preset himself.

## Done

- **0.8.0** Project status (working / published), link and notes, Publish dialog (which clips ended up in the video, unused clips move to a new project), Watch video button, `inProject` filter.
- **0.7.0** Projects: projects page, add to project, active project with P hotkey, back/forward navigation, Order tab (drag to order, arrows, reverse, start times), video picks (tick which clips go in the video), "In editor" marks and dragging only new clips to the editor, tags that fill the row with a +N tooltip, scroll position restore, cleanup of deleted clips in projects.
- **0.6.0** Settings hotkey, group by rating/length/size/name, "Tags you filter on first".
- **0.5.0 and earlier** Library, player with multiple audio tracks, tags with suggestions, notes, ratings, presets, sort menu, folders, duplicates merge, rebindable hotkeys, auto-updater. See `CHANGELOG.md` for everything.
