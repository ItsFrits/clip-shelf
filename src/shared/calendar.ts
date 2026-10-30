/** Calendar maths for the date picker. Everything works in local time, weeks start on Monday. */

export type DayStatus = 'new' | 'watched' | 'tagged' | 'used'
export const DAY_STATUSES: DayStatus[] = ['new', 'watched', 'tagged', 'used']

export interface DayCounts {
  new: number
  watched: number
  tagged: number
  used: number
  total: number
}

export interface GridDay {
  /** Local midnight, in ms. */
  ts: number
  key: string
  day: number
  /** False for the days of the previous and next month that fill up the first and last week. */
  inMonth: boolean
}

const pad = (n: number): string => String(n).padStart(2, '0')

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays(ts: number, n: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/** Monday 00:00 of the week that contains the time. */
export function weekStart(ts: number): number {
  const d = new Date(startOfDay(ts))
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/** yyyy-mm-dd of a time, in local time. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local midnight of a yyyy-mm-dd key, or null when the key is not a real date. */
export function parseDayKey(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return dayKey(d.getTime()) === key ? d.getTime() : null
}

/** The six weeks (42 days) that are shown for a month, starting on a Monday. Month is 0 to 11. */
export function monthGrid(year: number, month: number): GridDay[] {
  const first = new Date(year, month, 1).getTime()
  const start = weekStart(first)
  const out: GridDay[] = []
  for (let i = 0; i < 42; i++) {
    const ts = addDays(start, i)
    const d = new Date(ts)
    out.push({
      ts,
      key: dayKey(ts),
      day: d.getDate(),
      inMonth: d.getMonth() === month && d.getFullYear() === year
    })
  }
  return out
}

/** Move to another month, keeping the day number when the month is long enough. */
export function shiftMonth(ts: number, delta: number): number {
  const d = new Date(ts)
  const day = d.getDate()
  const target = new Date(d.getFullYear(), d.getMonth() + delta, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, last))
  return target.getTime()
}

/** Put two days in order, as yyyy-mm-dd keys. */
export function orderRange(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

export type RangePreset = 'last7' | 'last30' | 'thisYear'

/** The range for a quick choice. "Last 7 days" includes today. */
export function rangePreset(kind: RangePreset, now: number): { from: string; to: string } {
  const today = startOfDay(now)
  if (kind === 'last7') return { from: dayKey(addDays(today, -6)), to: dayKey(today) }
  if (kind === 'last30') return { from: dayKey(addDays(today, -29)), to: dayKey(today) }
  return {
    from: dayKey(new Date(new Date(today).getFullYear(), 0, 1).getTime()),
    to: dayKey(today)
  }
}

/** How many clips of each status there are on each day. */
export function dayStatusMap(
  items: Iterable<{ date: number; status: DayStatus }>
): Map<string, DayCounts> {
  const map = new Map<string, DayCounts>()
  for (const it of items) {
    const key = dayKey(it.date)
    let c = map.get(key)
    if (!c) {
      c = { new: 0, watched: 0, tagged: 0, used: 0, total: 0 }
      map.set(key, c)
    }
    c[it.status]++
    c.total++
  }
  return map
}

/** "12 clips: 9 new, 2 watched, 1 tagged", for the hover text of a day. */
export function describeDay(c: DayCounts | undefined): string {
  if (!c || c.total === 0) return 'No clips'
  const parts = DAY_STATUSES.filter((s) => c[s] > 0).map((s) => `${c[s]} ${s}`)
  return `${c.total} clip${c.total === 1 ? '' : 's'}: ${parts.join(', ')}`
}

/** The years that have at least one clip, newest first. */
export function yearsWithClips(dates: Iterable<number>): number[] {
  const years = new Set<number>()
  for (const t of dates) years.add(new Date(t).getFullYear())
  return [...years].sort((a, b) => b - a)
}
