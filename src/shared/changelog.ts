export interface ChangelogGroup {
  /** "Added", "Changed", "Fixed", or null for a plain list. */
  heading: string | null
  items: string[]
}

export interface ChangelogEntry {
  /** The text after "## ", for example "0.2.0" or "Unreleased". */
  title: string
  /** The version number when the title starts with one, else null. */
  version: string | null
  groups: ChangelogGroup[]
}

/**
 * Reads CHANGELOG.md: "## title" starts a release, "### heading" a group inside it, "- item" an item.
 * Lines that continue an item are joined to it. Everything else is ignored.
 */
export function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let entry: ChangelogEntry | null = null
  let group: ChangelogGroup | null = null
  let item = -1

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const h2 = /^##\s+(.+)$/.exec(line)
    const h3 = /^###\s+(.+)$/.exec(line)
    const li = /^[-*]\s+(.+)$/.exec(line)
    if (h2) {
      const title = h2[1].trim()
      entry = { title, version: /^\d+\.\d+\.\d+/.exec(title)?.[0] ?? null, groups: [] }
      entries.push(entry)
      group = null
      item = -1
    } else if (!entry) {
      continue
    } else if (h3) {
      group = { heading: h3[1].trim(), items: [] }
      entry.groups.push(group)
      item = -1
    } else if (li) {
      if (!group) {
        group = { heading: null, items: [] }
        entry.groups.push(group)
      }
      group.items.push(li[1].trim())
      item = group.items.length - 1
    } else if (/^\s+\S/.test(line) && group && item >= 0) {
      group.items[item] += ' ' + line.trim()
    }
  }
  return entries.filter((e) => e.groups.some((g) => g.items.length > 0))
}
