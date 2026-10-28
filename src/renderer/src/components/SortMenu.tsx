import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, Plus, RotateCcw, Shuffle, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SortField, SortRule } from '@shared/types'
import {
  DEFAULT_SORT,
  FIELD_INFO,
  SORT_FIELDS,
  addRule,
  availableFields,
  describeSort,
  flipRule,
  moveRule,
  removeRule,
  setRuleField,
  sortButtonLabel
} from '@shared/sort'
import { motionMs } from '../lib/motion'
import { useApp, useSettings } from '../lib/store'

const WIDTH = 360
const DRAG_START = 3
/** Height of a rule and the gap between rules. Keep in sync with .sortrule and .sortmenu-rules in the CSS. */
const ROW_H = 40
const ROW_GAP = 6
const SLOT = ROW_H + ROW_GAP

/** The sort button in the library toolbar, and the popup with the sort rules. */
export function SortMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const { sortRules } = useSettings()
  return (
    <>
      <button
        ref={btn}
        className={'btn' + (open ? ' open' : '')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={describeSort(sortRules)}
        onClick={() => setOpen((o) => !o)}
      >
        <ArrowUpDown size={16} />
        {sortButtonLabel(sortRules)}
      </button>
      {open && btn.current && <SortPopup anchorEl={btn.current} onClose={() => setOpen(false)} />}
    </>
  )
}

function SortPopup({ anchorEl, onClose }: { anchorEl: HTMLElement; onClose: () => void }): React.JSX.Element {
  const settings = useSettings()
  const updateSettings = useApp((s) => s.updateSettings)
  const setCapturing = useApp((s) => s.setCapturing)
  const rules = settings.sortRules
  const ref = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const focusField = useRef<SortField | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  // While a rule is dragged: the order it would have, and the rule that is being held.
  const [dragOrder, setDragOrder] = useState<SortRule[] | null>(null)
  const [dragging, setDragging] = useState<SortField | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const press = useRef<{ field: SortField; pointerId: number; startY: number; grab: number; listTop: number } | null>(null)
  const liveOrder = useRef<SortRule[] | null>(null)
  // Where the held rule is, in pixels from the top of the list (so it follows the pointer).
  const heldTop = useRef(0)
  const lastTop = useRef(new Map<string, number>())
  const dropFrom = useRef<{ field: SortField; from: number } | null>(null)

  const shown = dragOrder ?? rules
  const setRules = (next: SortRule[]): void => updateSettings({ sortRules: next })
  const free = availableFields(rules)

  useLayoutEffect(() => {
    const place = (): void => {
      const a = anchorEl.getBoundingClientRect()
      const h = ref.current?.offsetHeight ?? 260
      const left = Math.max(8, Math.min(a.right - WIDTH, window.innerWidth - WIDTH - 8))
      const top = Math.max(8, Math.min(a.bottom + 8, window.innerHeight - h - 8))
      setPos({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorEl, rules.length])

  // Close on a click outside and on Escape.
  useEffect(() => {
    const down = (e: MouseEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchorEl.contains(t)) return
      onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
      anchorEl.focus()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key, true)
    }
  }, [anchorEl, onClose])

  // Typing in the popup must not trigger the library hotkeys.
  useEffect(() => {
    setCapturing(true)
    return () => setCapturing(false)
  }, [setCapturing])

  // Put the held rule under the pointer. It sits in its slot in the list and is moved by a transform.
  const holdTransform = (field: SortField, order: readonly SortRule[]): void => {
    const el = rowRefs.current.get(field)
    const index = order.findIndex((r) => r.field === field)
    if (el && index >= 0) el.style.transform = `translateY(${heldTop.current - index * SLOT}px)`
  }

  // After every change of order: slide the other rules to their new places, put the held rule back under
  // the pointer, let a dropped rule glide into its slot, and give the keyboard focus back.
  useLayoutEffect(() => {
    const ms = motionMs(160)
    const held = press.current && dragging ? press.current.field : null
    const tops = lastTop.current
    for (const rule of shown) {
      const el = rowRefs.current.get(rule.field)
      if (!el) continue
      const now = el.offsetTop
      const before = tops.get(rule.field)
      if (ms > 0 && before !== undefined && before !== now && rule.field !== held) {
        el.animate([{ transform: `translateY(${before - now}px)` }, { transform: 'translateY(0)' }], { duration: ms, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })
      }
      tops.set(rule.field, now)
    }
    if (held) holdTransform(held, shown)
    const drop = dropFrom.current
    if (drop) {
      dropFrom.current = null
      const el = rowRefs.current.get(drop.field)
      if (el && ms > 0 && drop.from !== 0) {
        el.animate([{ transform: `translateY(${drop.from}px)` }, { transform: 'translateY(0)' }], { duration: ms, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' })
      }
    }
    if (focusField.current) {
      ref.current?.querySelector<HTMLElement>(`[data-grip="${focusField.current}"]`)?.focus()
      focusField.current = null
    }
  })

  const startDrag = (e: React.PointerEvent, field: SortField): void => {
    // React also sends pointer events from a disabled button, so check here: one rule, or Random, cannot move.
    if (e.button !== 0 || rules.length < 2 || field === 'random') return
    const row = rowRefs.current.get(field)
    const list = listRef.current
    if (!row || !list) return
    const rowTop = row.getBoundingClientRect().top
    press.current = { field, pointerId: e.pointerId, startY: e.clientY, grab: e.clientY - rowTop, listTop: list.getBoundingClientRect().top }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const moveDrag = (e: React.PointerEvent): void => {
    const p = press.current
    if (!p) return
    if (!dragging) {
      if (Math.abs(e.clientY - p.startY) < DRAG_START) return
      setDragging(p.field)
    }
    const base = liveOrder.current ?? rules
    // The rule follows the pointer, but stays inside the list (and above Random).
    const last = base.length - (base[base.length - 1].field === 'random' ? 2 : 1)
    heldTop.current = Math.min(Math.max(e.clientY - p.grab - p.listTop, 0), last * SLOT)
    // The slot it is closest to is where it goes.
    const to = Math.round(heldTop.current / SLOT)
    const from = base.findIndex((r) => r.field === p.field)
    if (to !== from) {
      const next = moveRule(base, from, to)
      liveOrder.current = next
      setDragOrder(next)
    } else {
      holdTransform(p.field, base)
    }
  }
  const endDrag = (e: React.PointerEvent): void => {
    const p = press.current
    press.current = null
    if (!p) return
    if (e.currentTarget.hasPointerCapture(p.pointerId)) e.currentTarget.releasePointerCapture(p.pointerId)
    const next = liveOrder.current
    const order = next ?? rules
    liveOrder.current = null
    const el = rowRefs.current.get(p.field)
    if (el && el.style.transform) {
      const index = order.findIndex((r) => r.field === p.field)
      dropFrom.current = { field: p.field, from: heldTop.current - index * SLOT }
      el.style.transform = ''
    }
    setDragOrder(null)
    setDragging(null)
    if (next) {
      setRules(next)
      focusField.current = p.field
    }
  }

  const onGripKey = (e: React.KeyboardEvent, index: number, field: SortField): void => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    const to = e.key === 'ArrowUp' ? index - 1 : index + 1
    const next = moveRule(rules, index, to)
    if (next.some((r, i) => r.field !== rules[i].field)) {
      focusField.current = field
      setRules(next)
    }
  }

  const hasRandom = rules.some((r) => r.field === 'random')
  const isDefault = rules.length === 1 && rules[0].field === DEFAULT_SORT[0].field && rules[0].dir === DEFAULT_SORT[0].dir

  return createPortal(
    <div
      ref={ref}
      className="sortmenu"
      role="dialog"
      aria-label="Sort clips"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: WIDTH, visibility: pos ? 'visible' : 'hidden' }}
    >
      <div className="sortmenu-head">
        <strong>Sort clips</strong>
        <span className="muted">The top rule counts most. The next ones decide when clips are equal.</span>
      </div>
      <div className="sortmenu-rules" ref={listRef}>
        {shown.map((rule, i) => {
          const info = FIELD_INFO[rule.field]
          const isRandom = rule.field === 'random'
          // A field can be swapped for any field that is not used by another rule.
          const options = SORT_FIELDS.filter((f) => f === rule.field || !rules.some((r) => r.field === f))
          return (
            <div
              key={rule.field}
              ref={(el) => {
                if (el) rowRefs.current.set(rule.field, el)
                else rowRefs.current.delete(rule.field)
              }}
              className={'sortrule' + (dragging === rule.field ? ' dragging' : '')}
            >
              <button
                type="button"
                className="sortrule-grip"
                data-grip={rule.field}
                disabled={isRandom || rules.length < 2}
                aria-label={`Move ${info.label} rule. Drag, or press Alt and the arrow keys.`}
                title={isRandom ? 'Random always stays last' : 'Drag to change the priority (or Alt + Up / Down)'}
                onPointerDown={(e) => startDrag(e, rule.field)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onGripKey(e, i, rule.field)}
              >
                <GripVertical size={16} />
              </button>
              <span className="sortrule-n" aria-hidden="true">
                {i + 1}
              </span>
              <select
                className="sortrule-field"
                value={rule.field}
                aria-label={`Rule ${i + 1}: sort by`}
                onChange={(e) => setRules(setRuleField(rules, i, e.target.value as SortField))}
              >
                {options.map((f) => (
                  <option key={f} value={f}>
                    {FIELD_INFO[f].label}
                  </option>
                ))}
              </select>
              {isRandom ? (
                <button
                  type="button"
                  className="btn small sortrule-dir"
                  title="Shuffle the clips again"
                  onClick={() => updateSettings({ randomSeed: (settings.randomSeed + 1) % 1_000_000_007 })}
                >
                  <Shuffle size={14} />
                  Shuffle again
                </button>
              ) : (
                <button
                  type="button"
                  className="btn small sortrule-dir"
                  title="Switch direction"
                  onClick={() => setRules(flipRule(rules, i))}
                >
                  {rule.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                  {info[rule.dir]}
                </button>
              )}
              <button
                type="button"
                className="sortrule-x"
                disabled={rules.length < 2}
                aria-label={`Remove ${info.label} rule`}
                title={rules.length < 2 ? 'You need at least one rule' : 'Remove this rule'}
                onClick={() => setRules(removeRule(rules, i))}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
      {hasRandom && rules.length > 1 && <p className="muted sortmenu-note">Random is always last, so it only shuffles clips the rules above cannot tell apart.</p>}
      <div className="sortmenu-foot">
        <AddRule fields={free} full={rules.length >= 5} onPick={(f) => setRules(addRule(rules, f))} />
        <button type="button" className="btn small ghost" disabled={isDefault} onClick={() => setRules(DEFAULT_SORT.map((r) => ({ ...r })))}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
    </div>,
    document.body
  )
}

function AddRule({ fields, full, onPick }: { fields: SortField[]; full: boolean; onPick: (f: SortField) => void }): React.JSX.Element {
  return (
    <label className={'btn small sortmenu-add' + (fields.length === 0 ? ' disabled' : '')} title={full ? 'You can use up to 5 rules' : undefined}>
      <Plus size={14} />
      {full ? 'Rule limit reached' : fields.length === 0 ? 'All fields used' : 'Add rule'}
      <select
        value=""
        disabled={fields.length === 0}
        aria-label="Add a sort rule"
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value as SortField)
        }}
      >
        <option value="">Add rule</option>
        {fields.map((f) => (
          <option key={f} value={f}>
            {FIELD_INFO[f].label}
          </option>
        ))}
      </select>
    </label>
  )
}
