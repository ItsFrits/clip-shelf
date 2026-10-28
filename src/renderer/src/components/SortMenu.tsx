import { ArrowDown, ArrowUp, ArrowUpDown, GripVertical, Plus, RotateCcw, Shuffle, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SortField, SortRule } from '@shared/types'
import {
  DEFAULT_SORT,
  FIELD_INFO,
  SORT_FIELDS as SORT_FIELD_LIST,
  addRule,
  availableFields,
  describeSort,
  flipRule,
  moveRule,
  removeRule,
  setRuleField,
  sortButtonLabel
} from '@shared/sort'
import { useApp, useSettings } from '../lib/store'
import { Dropdown } from './Dropdown'

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
  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<SortField, HTMLElement>())
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  // While a rule is dragged: the order it would have, and the rule that is being held.
  const [dragOrder, setDragOrder] = useState<SortRule[] | null>(null)
  const [dragging, setDragging] = useState<SortField | null>(null)
  const press = useRef<{ field: SortField; pointerId: number; startY: number; grab: number; listTop: number } | null>(null)
  const liveOrder = useRef<SortRule[] | null>(null)
  // Where the held rule is, in pixels from the top of the list (so it follows the pointer).
  const heldTop = useRef(0)
  const prevHeld = useRef<SortField | null>(null)

  // Every rule has a number that stays the same when its field is swapped, so its row (and the focus on
  // it) stays. The rows never change place in the page: they are laid on top of each other and moved with
  // a transform, so moving a rule is a CSS transition that can follow the pointer without any trouble.
  const ids = useRef(new Map<SortField, number>())
  const nextId = useRef(1)
  const domOrder = useRef<SortField[]>([])
  const idOf = (f: SortField): number => {
    let v = ids.current.get(f)
    if (v === undefined) ids.current.set(f, (v = nextId.current++))
    return v
  }
  const fields = rules.map((r) => r.field)
  domOrder.current = [...domOrder.current.filter((f) => fields.includes(f)), ...fields.filter((f) => !domOrder.current.includes(f))]

  const shown = dragOrder ?? rules
  const setRules = (next: SortRule[]): void => updateSettings({ sortRules: next })
  const free = availableFields(rules)
  const slotOf = (field: SortField, order: readonly SortRule[]): number => order.findIndex((r) => r.field === field) * SLOT

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

  // Close on a click outside and on Escape. A dropdown list that is open handles its own Esc first.
  useEffect(() => {
    const down = (e: MouseEvent): void => {
      const t = e.target as Element
      if (ref.current?.contains(t) || anchorEl.contains(t) || t.closest?.('[data-keep-open]')) return
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

  // While a rule is held it sits under the pointer, also after React moved the other rules. When it is
  // let go it glides into its slot.
  useLayoutEffect(() => {
    if (dragging) {
      const el = rowRefs.current.get(dragging)
      if (el) el.style.transform = `translateY(${heldTop.current}px)`
    } else if (prevHeld.current) {
      const el = rowRefs.current.get(prevHeld.current)
      if (el) el.style.transform = `translateY(${slotOf(prevHeld.current, shown)}px)`
    }
    prevHeld.current = dragging
  })

  const startDrag = (e: React.PointerEvent, field: SortField): void => {
    // React also sends pointer events from a disabled button, so check here: one rule, or Random, cannot move.
    if (e.button !== 0 || rules.length < 2 || field === 'random') return
    const row = rowRefs.current.get(field)
    const list = listRef.current
    if (!row || !list) return
    press.current = {
      field,
      pointerId: e.pointerId,
      startY: e.clientY,
      grab: e.clientY - row.getBoundingClientRect().top,
      listTop: list.getBoundingClientRect().top
    }
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
    const el = rowRefs.current.get(p.field)
    if (el) el.style.transform = `translateY(${heldTop.current}px)`
    // The slot it is closest to is where it goes.
    const to = Math.round(heldTop.current / SLOT)
    const from = base.findIndex((r) => r.field === p.field)
    if (to !== from) {
      const next = moveRule(base, from, to)
      liveOrder.current = next
      setDragOrder(next)
    }
  }
  const endDrag = (e: React.PointerEvent): void => {
    const p = press.current
    press.current = null
    if (!p) return
    if (e.currentTarget.hasPointerCapture(p.pointerId)) e.currentTarget.releasePointerCapture(p.pointerId)
    const next = liveOrder.current
    liveOrder.current = null
    setDragOrder(null)
    setDragging(null)
    if (next) setRules(next)
  }

  const onGripKey = (e: React.KeyboardEvent, index: number): void => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    e.preventDefault()
    setRules(moveRule(rules, index, e.key === 'ArrowUp' ? index - 1 : index + 1))
  }

  const changeField = (index: number, field: SortField): void => {
    const old = rules[index].field
    if (field === old) return
    // The row keeps its number, so it stays where it is (and keeps the focus).
    const id = idOf(old)
    ids.current.delete(old)
    ids.current.set(field, id)
    domOrder.current = domOrder.current.map((f) => (f === old ? field : f))
    setRules(setRuleField(rules, index, field))
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
      <div className="sortmenu-rules" ref={listRef} style={{ height: rules.length * SLOT - ROW_GAP }}>
        {domOrder.current.map((field) => {
          const index = rules.findIndex((r) => r.field === field)
          const rule = rules[index]
          const info = FIELD_INFO[field]
          const isRandom = field === 'random'
          const shownIndex = shown.findIndex((r) => r.field === field)
          // A field can be swapped for any field that is not used by another rule.
          const options = SORT_FIELD_LIST.filter((f) => f === field || !fields.includes(f)).map((f) => ({ value: f, label: FIELD_INFO[f].label }))
          return (
            <div
              key={idOf(field)}
              ref={(el) => {
                if (el) rowRefs.current.set(field, el)
                else rowRefs.current.delete(field)
              }}
              className={'sortrule' + (dragging === field ? ' dragging' : '')}
              style={{ transform: `translateY(${shownIndex * SLOT}px)` }}
            >
              <button
                type="button"
                className="sortrule-grip"
                disabled={isRandom || rules.length < 2}
                aria-label={`Move ${info.label} rule. Drag, or press Alt and the arrow keys.`}
                title={isRandom ? 'Random always stays last' : 'Drag to change the priority (or Alt + Up / Down)'}
                onPointerDown={(e) => startDrag(e, field)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={(e) => onGripKey(e, index)}
              >
                <GripVertical size={16} />
              </button>
              <span className="sortrule-n" aria-hidden="true">
                {shownIndex + 1}
              </span>
              <Dropdown
                className="sortrule-field"
                ariaLabel={`Rule ${index + 1}: sort by`}
                options={options}
                value={field}
                chevron
                onPick={(f) => changeField(index, f)}
              >
                {info.label}
              </Dropdown>
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
                <button type="button" className="btn small sortrule-dir" title="Switch direction" onClick={() => setRules(flipRule(rules, index))}>
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
                onClick={() => setRules(removeRule(rules, index))}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
      {hasRandom && rules.length > 1 && <p className="muted sortmenu-note">Random is always last, so it only shuffles clips the rules above cannot tell apart.</p>}
      <div className="sortmenu-foot">
        <Dropdown
          className="btn small"
          ariaLabel="Add a sort rule"
          options={free.map((f) => ({ value: f, label: FIELD_INFO[f].label }))}
          disabled={free.length === 0}
          minWidth={140}
          onPick={(f) => setRules(addRule(rules, f))}
        >
          <Plus size={14} />
          {free.length === 0 ? 'All fields used' : 'Add rule'}
        </Dropdown>
        <button type="button" className="btn small ghost" disabled={isDefault} onClick={() => setRules(DEFAULT_SORT.map((r) => ({ ...r })))}>
          <RotateCcw size={14} />
          Reset
        </button>
      </div>
    </div>,
    document.body
  )
}
