# Rank mode

Status: spec approved by Frits, not built yet. Branch: `feat/project-rank`.

## Why

A project can hold 40+ clips and about 10 fit in a video. Frits wants to put the best clips first without dragging rows around for an hour. Comparing two clips at a time is easier than judging 42 clips at once.

## What it does

On the Order tab of a project there is a **Rank** button above the "To place" list.

- It ranks the **selected** clips. If nothing is selected, it ranks all clips that have no place yet.
- A rank screen shows two clips side by side, each as a muted looping video. Clicking a clip turns its sound on (and the other one off).
- Choices:
  - Left is better: Left arrow
  - Right is better: Right arrow
  - Equal: Down arrow. The new clip is placed right next to the one it was compared with.
  - Skip: leave this clip unplaced for now and go to the next
  - Undo: Ctrl+Z, goes back one comparison (Ctrl+Z is also the global `undo` action in `keymap.ts`, so decide whether rank mode reuses that action or gets its own)
  - Stop: Esc
- All of these are actions in `src/shared/keymap.ts`, so Frits can rebind them (see CLAUDE.md).

## Algorithm

Binary insertion against the order that already exists. For each clip to rank, compare it with the middle clip of the current search range, halve the range, repeat until the position is known. That is about 4 to 6 questions per clip (about 170 comparisons for 42 clips without the rating shortcut).

- **Each insertion is saved immediately** (the clip gets its place in the project order). Stopping halfway loses nothing, and rank mode can be started again later.
- The order is **best first**. The existing Reverse button flips it if Frits wants worst first.
- The progress shows "Clip 3 of 12" with a rough estimate of the questions left.
- The very first clip when the order is empty has nothing to compare with and is placed directly.

## Ratings shortcut (approved)

A clip with star rating r is only compared inside the range of already placed clips that have the same or a neighbouring rating (r-1, r, r+1). A lower rating never beats a higher one, so clips with a rating more than one star away are not asked about. This gives roughly 30 to 60 comparisons for a project of 42 clips instead of about 170.

Open details to confirm with Frits while building (propose a default, do not silently decide):
- How unrated clips behave. Suggested: unrated is its own bucket, compared against everything.
- The existing order is not guaranteed to follow ratings (Frits can order by hand). Suggested: the range is the span in the current order from the first to the last placed clip with a rating in [r-1, r+1]. Clips outside that span are not compared.
- An option to switch the shortcut off ("compare with everything").

## Build notes

- Put the algorithm in a pure module, for example `src/shared/ranking.ts`: a state machine (`start`, `answer(left | right | equal)`, `undo`, `next candidate`, `position`) with unit tests for: empty order, one clip, ties, undo, skip, rating range, every answer path ends in a valid position, order stays a subset of clipKeys.
- Use the existing `placeInOrder` in `src/shared/projects.ts` to compute the new order, and save it through the store's `setProjectOrder` (main: `UserDataStore.setProjectOrder`). That path runs `cleanOrder` and `cleanPicks`, which keep `order`, `skipped` and `sent` consistent. `placeInOrder` itself only returns an order.
- UI goes in a new component next to `ProjectOrder.tsx`. Two `<video muted loop autoplay>` elements using the same media URLs the player uses (look at how `Player.tsx` and the cache serve clips).
- Add a changelog line under `## Unreleased`.
- Check in the real app: ranking 3 clips into an empty order, ranking into an existing order, undo, skip, Esc, closing the project mid-rank.
