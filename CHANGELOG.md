# Changelog

All notable changes to Clip Shelf. Newest first.

## Unreleased

### Added
- Settings now opens as a window on top of the library. Close it with the X, by clicking outside it, or with Esc. Prefer the old full page? Choose "Full page" under General.
- A new General tab, the first one in Settings, with the settings for how Settings itself works and for animations.
- Option to remember the last tab you used in Settings (on by default). Turn it off to always start on General.
- Animations can follow your system setting, be always on, or be off. You can also make them slower or faster.

## 0.3.0

### Added
- A calendar for the date filter, in the style of the app. Click the date in the sidebar to open it. Weeks start on Monday, you can jump to a month or a year by clicking the title, and Today, Latest (the day of your newest clip) and Clear are at the bottom.
- Under each day in the calendar, small dots in the colors of New, Watched, Tagged and Used show what is on that day. The dots follow your other filters, so with only "New" on you see where unsorted clips are. Hover a day for the numbers.
- A new Day option in the date filter, with arrows to step to the previous and next day.
- Range: click a first and a last day in the calendar, or use Last 7 days, Last 30 days and This year.
- A "Group by" label in front of the Day, Week and Month buttons above the clips, so they are not mixed up with the date filter.
- Rating filter with a range: choose the lowest and the highest number of stars. Unrated clips have their own checkbox, "Show unrated clips" (on by default). The active filter shows what it does, for example "4 to 5 stars + unrated".
- Hide clips by tag: click a tag in the sidebar once to show only clips with it, twice to hide clips with it (red), three times to clear it. A hidden tag always wins over a shown one. The small ? next to "Tags" explains it.
- A sentence under the tags says what the filter does, for example "Showing clips tagged Air dribble OR Sidewall". The old Any/All switch is now "Match any tag (OR)" and "Match all tags (AND)" and only shows up when two or more tags are shown.
- The library opens with the filters you left it with: status, tags (and any/all), minimum rating, date (including the chosen week or month) and folders. Search text is not remembered. "Reset all" next to the active filters clears everything.
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
