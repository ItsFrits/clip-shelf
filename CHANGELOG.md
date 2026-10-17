# Changelog

All notable changes to Clip Shelf. Newest first.

## Unreleased

### Added
- Sort your tags A-Z, by most clips or by most recently used, in the sidebar and in Settings, Tags. The choice is remembered. "Recent" starts filling in as you tag new clips.

## 0.2.0

### Added
- An About tab in Settings with the version, these release notes, a link to GitHub issues, "Copy diagnostics" for bug reports and a button that opens the logs folder.
- Warnings and errors are written to a log file (`logs` folder in the app data folder), so a problem can be traced afterwards.
- After an update, a small notice links to the release notes.
- Previous and next clip buttons on the sides of the video, which only show when the mouse is close to that side (they replace the two arrows in the header). The arrow turns the accent colour on hover.
- Clicking the video pauses it, with a pause icon in the middle that fades out when you continue.
- Video info and the frame counter only show while the mouse moves over the video, so they no longer cover things like the game chat. The frame counter also shows briefly after stepping a frame with the keyboard.
- Keyboard hint on the Random button in the player. A new setting under Playback & editor turns every keyboard hint off.
- The window remembers its size, position and maximized state.

### Changed
- Muted audio tracks have a red mute button, so you can see at a glance which tracks are off.
- In the tag field, the "Enter" hint now sits on the option that Enter will pick, and moves with the arrow keys.
- Going back to the library scrolls to the clip you just watched, instead of the top.

### Fixed
- The "Numbers" button in Settings, Audio track labels, was squeezed against the edge.

## 0.1.6
- Update check starts 2 seconds after launch instead of 8, and the update notice no longer gets lost if it arrives before the window is ready.

## 0.1.5
- Tag suggestions: choose which tags are suggested after a tag is added, and manage tags (rename, merge, delete) in Settings, Tags.

## 0.1.4
- Integrated title bar, search bar aligned with the clip area, new app icon.

## 0.1.3 and earlier
- Track names from OBS files, per-folder track volume and mute, master mute, automatic "watched", update notices, auto-updater, first releases.
