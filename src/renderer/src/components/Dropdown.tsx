import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption<T extends string> {
  value: T
  label: string
}

interface Props<T extends string> {
  options: DropdownOption<T>[]
  /** The chosen option, shown with a check mark. Leave out for a menu where nothing stays chosen. */
  value?: T
  onPick: (value: T) => void
  /** What the button shows. */
  children: React.ReactNode
  /** Adds a small arrow to the button, like a select has. */
  chevron?: boolean
  className?: string
  ariaLabel: string
  title?: string
  disabled?: boolean
  /** Keep the list at least this wide (it is as wide as the button otherwise). */
  minWidth?: number
}

const ITEM_H = 32
const PAD = 4

/**
 * A dropdown in the style of the app, to use instead of a <select>. The button keeps the keyboard
 * focus while the list is open: arrow keys move, Enter or Space chooses, Esc closes. Esc closes only
 * the list, not the window it sits in.
 */
export function Dropdown<T extends string>({
  options,
  value,
  onPick,
  children,
  chevron,
  className,
  ariaLabel,
  title,
  disabled,
  minWidth = 0
}: Props<T>): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const typed = useRef({ text: '', timer: 0 })
  const onPickRef = useRef(onPick)
  useEffect(() => {
    onPickRef.current = onPick
  })

  const close = (): void => {
    setOpen(false)
    setPos(null)
  }
  const openList = (): void => {
    if (disabled || options.length === 0) return
    const chosen = options.findIndex((o) => o.value === value)
    setActive(chosen >= 0 ? chosen : 0)
    setOpen(true)
  }
  const pick = (o: DropdownOption<T>): void => {
    close()
    onPickRef.current(o.value)
  }

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const width = Math.max(r.width, minWidth)
    const natural = options.length * ITEM_H + PAD * 2 + 2
    const spaceBelow = window.innerHeight - r.bottom - 12
    const spaceAbove = r.top - 12
    // Open where there is room. A long list gets as tall as the room allows and scrolls.
    const below = natural <= spaceBelow || spaceBelow >= spaceAbove
    const h = Math.max(ITEM_H + PAD * 2, Math.min(natural, below ? spaceBelow : spaceAbove, 360))
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    setPos({ left, top: below ? r.bottom + 4 : r.top - 4 - h, width, height: h })
  }, [open, options.length, minWidth])

  // Keep the highlighted item in view in a long list.
  useEffect(() => {
    if (open && pos)
      document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos, id])

  // While the list is open: keys go to the list, a click outside closes it. These listeners are on the
  // window, so they run before the ones of the window the list sits in (which must stay open on Esc).
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
        btn.current?.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        e.stopPropagation()
        setActive(e.key === 'Home' ? 0 : options.length - 1)
      } else if (e.key === 'Enter' || (e.key === ' ' && !typed.current.text)) {
        e.preventDefault()
        e.stopPropagation()
        const o = options[active]
        if (o) pick(o)
        btn.current?.focus()
      } else if (e.key === 'Tab') {
        close()
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Typing jumps to the first option that starts with what you typed.
        e.preventDefault()
        e.stopPropagation()
        typed.current.text += e.key.toLowerCase()
        window.clearTimeout(typed.current.timer)
        typed.current.timer = window.setTimeout(() => (typed.current.text = ''), 800)
        const at = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
        if (at >= 0) setActive(at)
      }
    }
    const down = (e: MouseEvent): void => {
      const t = e.target as Node
      if (list.current?.contains(t) || btn.current?.contains(t)) return
      close()
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('mousedown', down, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('mousedown', down, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, options])

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={(className ?? '') + (open ? ' open' : '')}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        title={title}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openList()
          }
        }}
      >
        {children}
        {chevron && <ChevronDown size={14} className="dd-chevron" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            className="dd-list"
            role="listbox"
            aria-label={ariaLabel}
            // Clicks in here must not close the window the list sits in.
            data-keep-open
            style={{
              left: pos?.left ?? -9999,
              top: pos?.top ?? 0,
              width: pos?.width,
              maxHeight: pos?.height,
              visibility: pos ? 'visible' : 'hidden'
            }}
          >
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={o.value === value}
                className={
                  'dd-item' + (i === active ? ' active' : '') + (o.value === value ? ' chosen' : '')
                }
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
              >
                <span>{o.label}</span>
                {o.value === value && <Check size={14} />}
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}
