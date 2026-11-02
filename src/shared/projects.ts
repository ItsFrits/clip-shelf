import type { ClipUser, Project, ProjectStatus } from './types'
import { isDefaultClipUser } from './userLogic'

/** The order as it should be kept: only clips that are in the project, each once. */
export function cleanOrder(raw: unknown, clipKeys: readonly string[]): string[] {
  if (!Array.isArray(raw)) return []
  const inside = new Set(clipKeys)
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of raw) {
    if (typeof k !== 'string' || !inside.has(k) || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

export interface Picks {
  skipped: string[]
  sent: string[]
}

/** Skipped and sent as they should be kept: only clips in the order, and a skipped clip is not sent. */
export function cleanPicks(order: readonly string[], skipped: unknown, sent: unknown): Picks {
  const inOrder = new Set(order)
  const list = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? [...new Set(raw.filter((k): k is string => typeof k === 'string' && inOrder.has(k)))]
      : []
  const skip = list(skipped)
  const left = new Set(skip)
  return { skipped: skip, sent: list(sent).filter((k) => !left.has(k)) }
}

/** The clips that go in the video: those in the order that are not skipped, first to last. */
export function pickedKeys(order: readonly string[], skipped: readonly string[]): string[] {
  const left = new Set(skipped)
  return order.filter((k) => !left.has(k))
}

/** Put clips in the video (on) or leave them out (off). Leaving a clip out also takes it out of the editor. */
export function setPicked(
  order: readonly string[],
  picks: Picks,
  keys: readonly string[],
  on: boolean
): Picks {
  const set = new Set(keys)
  const skipped = on
    ? picks.skipped.filter((k) => !set.has(k))
    : [...picks.skipped, ...keys.filter((k) => !picks.skipped.includes(k))]
  return cleanPicks(order, skipped, picks.sent)
}

/** Only these clips go in the video. The rest of the order is left out. */
export function pickOnly(order: readonly string[], picks: Picks, keep: readonly string[]): Picks {
  const set = new Set(keep)
  return cleanPicks(
    order,
    order.filter((k) => !set.has(k)),
    picks.sent
  )
}

/** Clips that were dragged to the editor. They also go in the video. */
export function markSent(order: readonly string[], picks: Picks, keys: readonly string[]): Picks {
  const set = new Set(keys)
  return cleanPicks(
    order,
    picks.skipped.filter((k) => !set.has(k)),
    [...picks.sent, ...keys]
  )
}

/** Make a list read from disk safe to use. The old "idea" status is now "working". */
export function sanitizeProjects(raw: unknown, now: number = Date.now()): Project[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: Project[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    if (typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue
    seen.add(p.id)
    const keys = Array.isArray(p.clipKeys)
      ? [...new Set(p.clipKeys.filter((k): k is string => typeof k === 'string' && k !== ''))]
      : []
    out.push({
      id: p.id,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Untitled project',
      status: p.status === 'published' ? 'published' : 'working',
      link: typeof p.link === 'string' ? p.link : '',
      notes: typeof p.notes === 'string' ? p.notes : '',
      clipKeys: keys,
      order: cleanOrder(p.order, keys),
      ...cleanPicks(cleanOrder(p.order, keys), p.skipped, p.sent),
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : now
    })
  }
  return out
}

/** A name that is not taken yet: "Name", then "Name 2", "Name 3" and so on. */
export function uniqueProjectName(projects: Project[], base: string): string {
  const clean = base.trim() || 'New project'
  const taken = new Set(projects.map((p) => p.name.toLowerCase()))
  if (!taken.has(clean.toLowerCase())) return clean
  for (let n = 2; ; n++) {
    const name = `${clean} ${n}`
    if (!taken.has(name.toLowerCase())) return name
  }
}

export function newProject(projects: Project[], id: string, name: string, now: number): Project {
  return {
    id,
    name: uniqueProjectName(projects, name),
    status: 'working',
    link: '',
    notes: '',
    clipKeys: [],
    order: [],
    skipped: [],
    sent: [],
    createdAt: now
  }
}

/** A copy of a project that is still being worked on, with a name of its own. */
export function duplicateProject(
  projects: Project[],
  source: Project,
  id: string,
  now: number
): Project {
  return {
    ...source,
    id,
    name: uniqueProjectName(projects, `${source.name} copy`),
    status: 'working',
    link: '',
    clipKeys: [...source.clipKeys],
    order: [...source.order],
    skipped: [...source.skipped],
    // The copy is a new video, so nothing is in the editor yet.
    sent: [],
    createdAt: now
  }
}

/** Add clips to the end of a project. Clips that are already in it keep their place. */
export function addToProject(projects: Project[], id: string, keys: string[]): Project[] {
  return projects.map((p) => {
    if (p.id !== id) return p
    const have = new Set(p.clipKeys)
    const add = [...new Set(keys)].filter((k) => !have.has(k))
    return add.length === 0 ? p : { ...p, clipKeys: [...p.clipKeys, ...add] }
  })
}

function withoutClips(p: Project, drop: ReadonlySet<string>): Project {
  const keep = (k: string): boolean => !drop.has(k)
  return {
    ...p,
    clipKeys: p.clipKeys.filter(keep),
    order: p.order.filter(keep),
    skipped: p.skipped.filter(keep),
    sent: p.sent.filter(keep)
  }
}

export function removeFromProject(projects: Project[], id: string, keys: string[]): Project[] {
  const drop = new Set(keys)
  return projects.map((p) =>
    p.id === id && p.clipKeys.some((k) => drop.has(k)) ? withoutClips(p, drop) : p
  )
}

/** A link that is safe to open in the browser: only http and https, and a missing scheme becomes https. */
export function safeUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t || /\s/.test(t)) return null
  const full = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : /^[^/]+\.[^/]+/.test(t) ? 'https://' + t : null
  if (!full) return null
  try {
    const u = new URL(full)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** The link of a project that is out, when it has one that can be opened. */
export function watchUrl(p: Project): string | null {
  return p.status === 'published' ? safeUrl(p.link) : null
}

/** Change the status, link or notes of a project. */
export function updateProject(
  projects: Project[],
  id: string,
  patch: { status?: ProjectStatus; link?: string; notes?: string }
): Project[] {
  return projects.map((p) =>
    p.id !== id
      ? p
      : {
          ...p,
          status:
            patch.status === 'published' || patch.status === 'working' ? patch.status : p.status,
          link: typeof patch.link === 'string' ? patch.link.trim().slice(0, 2000) : p.link,
          notes: typeof patch.notes === 'string' ? patch.notes.slice(0, 20000) : p.notes
        }
  )
}

export type UnusedAction = 'move' | 'keep' | 'remove'

export interface PublishPlan {
  /** The clips that ended up in the video. */
  used: string[]
  /** What happens with the other clips of the project. */
  unused: UnusedAction
  /** The name of the new project when the unused clips move. */
  newName: string
  link: string
}

/**
 * Mark a project as published. The clips that were not used stay, leave or move to a new project
 * (a working project that keeps their order). Returns the new project too, when there is one.
 */
export function publishProject(
  projects: Project[],
  id: string,
  plan: PublishPlan,
  newId: string,
  now: number
): { projects: Project[]; created: Project | null } {
  const p = projects.find((x) => x.id === id)
  if (!p) return { projects, created: null }
  const used = new Set(plan.used.filter((k) => p.clipKeys.includes(k)))
  const unused = p.clipKeys.filter((k) => !used.has(k))
  let created: Project | null = null
  let next: Project = { ...p, status: 'published', link: plan.link.trim().slice(0, 2000) }
  if (unused.length > 0 && plan.unused !== 'keep') {
    if (plan.unused === 'move') {
      const placed = p.order.filter((k) => !used.has(k))
      const rest = unused.filter((k) => !placed.includes(k))
      created = {
        ...newProject(projects, newId, plan.newName.trim() || `${p.name} part 2`, now),
        clipKeys: [...placed, ...rest],
        order: placed
      }
    }
    next = withoutClips(next, new Set(unused))
  }
  // Every clip that was used is in the video, so none of them stays left out.
  next = {
    ...next,
    ...cleanPicks(
      next.order,
      next.skipped.filter((k) => !used.has(k)),
      next.sent
    )
  }
  const out = projects.map((x) => (x.id === id ? next : x))
  return { projects: created ? [...out, created] : out, created }
}

/** Where a clip is: "Published in A, B. Working on C." for the tooltip of its Used status. */
export function projectsLabel(projects: readonly Project[], key: string): string {
  const inside = projects.filter((p) => p.clipKeys.includes(key))
  const names = (status: ProjectStatus): string =>
    inside
      .filter((p) => p.status === status)
      .map((p) => p.name)
      .join(', ')
  const out: string[] = []
  if (names('published')) out.push(`Published in: ${names('published')}`)
  if (names('working')) out.push(`Working on: ${names('working')}`)
  return out.join('\n')
}

/** Take clips out of every project, for clips that are gone for good (moved to the recycle bin). */
export function removeFromAllProjects(projects: Project[], keys: string[]): Project[] {
  const drop = new Set(keys)
  return projects.map((p) => (p.clipKeys.some((k) => drop.has(k)) ? withoutClips(p, drop) : p))
}

/** Keys of the clips that are in at least one project. */
export function usedKeys(projects: Project[]): Set<string> {
  const out = new Set<string>()
  for (const p of projects) for (const k of p.clipKeys) out.add(k)
  return out
}

/** The projects a clip is in. */
export function projectsOfClip(projects: Project[], key: string): Project[] {
  return projects.filter((p) => p.clipKeys.includes(key))
}

/**
 * Make "used" on every clip match the projects and the switch you set by hand: used when it is in a
 * project or the switch is on. Clips from before the switch was kept apart (no `usedManual` yet) count
 * as set by hand when they are used but in no project.
 * Gives back the same object when nothing needed to change.
 */
export function syncUsed(
  clips: Record<string, ClipUser>,
  projects: Project[],
  empty: ClipUser
): Record<string, ClipUser> {
  const inProject = usedKeys(projects)
  let next: Record<string, ClipUser> | null = null
  const set = (key: string, u: ClipUser | null): void => {
    next ??= { ...clips }
    if (u) next[key] = u
    else delete next[key]
  }
  for (const key of Object.keys(clips)) {
    const u = clips[key]
    const there = inProject.has(key)
    const manual = u.usedManual ?? (u.used && !there)
    const used = manual || there
    // Old data that is used gets its origin written down now, or it would be guessed again later.
    const settled = u.usedManual !== undefined || !u.used
    if (u.used === used && settled && !!u.usedManual === manual) continue
    const changed = { ...u, used, usedManual: manual }
    set(key, isDefaultClipUser(changed) ? null : changed)
  }
  for (const key of inProject) {
    if (!clips[key]) set(key, { ...empty, used: true, usedManual: false })
  }
  return next ?? clips
}

/**
 * `before` are the clips that were in a project before the change. Clips that just left their last project are no longer used, also when the switch was on by hand:
 * the switch follows the projects. Gives back the same object when nothing changed.
 */
export function clearLeftProjects(
  clips: Record<string, ClipUser>,
  before: ReadonlySet<string>,
  after: Project[]
): Record<string, ClipUser> {
  const still = usedKeys(after)
  let next: Record<string, ClipUser> | null = null
  for (const key of before) {
    const u = clips[key]
    if (still.has(key) || !u?.usedManual) continue
    next ??= { ...clips }
    next[key] = { ...u, usedManual: false }
  }
  return next ?? clips
}

export interface ProjectStats {
  /** Clips in the project. */
  count: number
  /** Clips that are in the project but not in the library right now. */
  missing: number
  /** Total length of the clips that are there, in ms. */
  durationMs: number
  /** Clips that are there but have no known length yet. */
  unknownLength: number
}

export function projectStats(
  project: Project,
  clips: { get(key: string): { durationMs?: number } | undefined }
): ProjectStats {
  let missing = 0
  let durationMs = 0
  let unknownLength = 0
  for (const key of project.clipKeys) {
    const c = clips.get(key)
    if (!c) missing++
    else if (c.durationMs) durationMs += c.durationMs
    else unknownLength++
  }
  return { count: project.clipKeys.length, missing, durationMs, unknownLength }
}

/** A total length for a project: "2:05" under an hour, "1:02:05" from an hour on. */
export function totalLength(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** "4:32 in total", with a note when some lengths are not known yet. */
export function lengthLabel(stats: ProjectStats): string {
  if (stats.durationMs === 0 && stats.unknownLength === 0) return 'No length yet'
  const base = `${totalLength(stats.durationMs)} in total`
  return stats.unknownLength > 0 ? `${base} (${stats.unknownLength} not measured yet)` : base
}

/**
 * Put clips in the order. Clips that already have a place move there. `at` is a place in the list as
 * it is now (0 is the very first place); without it they go to the end.
 */
export function placeInOrder(
  order: readonly string[],
  keys: readonly string[],
  at?: number
): string[] {
  const moving = [...new Set(keys)]
  const drop = new Set(moving)
  const target = at === undefined ? order.length : Math.min(Math.max(0, at), order.length)
  // Clips that leave a place before the target make the target move up.
  const before = order.slice(0, target).filter((k) => !drop.has(k))
  const after = order.slice(target).filter((k) => !drop.has(k))
  return [...before, ...moving, ...after]
}

/** Take clips out of the order. They stay in the project. */
export function unplaceFromOrder(order: readonly string[], keys: readonly string[]): string[] {
  const drop = new Set(keys)
  return order.filter((k) => !drop.has(k))
}

export function reverseOrder(order: readonly string[]): string[] {
  return [...order].reverse()
}

/** Move one clip a place up (-1) or down (1). Gives back the same list at the edges. */
export function stepInOrder(order: readonly string[], key: string, dir: 1 | -1): string[] {
  const i = order.indexOf(key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return [...order]
  const next = [...order]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

/** The place of every clip in the order, counting from 1. */
export function orderNumbers(order: readonly string[]): Map<string, number> {
  return new Map(order.map((k, i) => [k, i + 1]))
}

export interface OrderTimes {
  /** Where each place starts, in ms from the start of the video. */
  starts: number[]
  totalMs: number
  /** Places whose clip has no known length (they count as 0). */
  unknown: number
}

/** When each clip in the order starts, if they are placed one after the other. */
export function orderTimes(
  order: readonly string[],
  clips: { get(key: string): { durationMs?: number } | undefined }
): OrderTimes {
  const starts: number[] = []
  let total = 0
  let unknown = 0
  for (const key of order) {
    starts.push(total)
    const ms = clips.get(key)?.durationMs
    if (ms) total += ms
    else unknown++
  }
  return { starts, totalMs: total, unknown }
}

/** The clips with a place first, in that order, then the others as they came. */
export function sortByOrder(keys: readonly string[], order: readonly string[]): string[] {
  const place = orderNumbers(order)
  const placed = keys.filter((k) => place.has(k)).sort((a, b) => place.get(a)! - place.get(b)!)
  return [...placed, ...keys.filter((k) => !place.has(k))]
}
