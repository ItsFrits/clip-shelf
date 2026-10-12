import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'

interface Props {
  onAdd: (name: string) => void
  /** Tag ids that should not be offered (already on the clip). */
  exclude?: string[]
  placeholder?: string
  inputRef?: React.Ref<HTMLInputElement>
  menuUp?: boolean
  autoFocus?: boolean
}

/** Type to find a tag, or create a new one. Enter adds the highlighted tag. */
export function TagInput({ onAdd, exclude = [], placeholder, inputRef, menuUp, autoFocus }: Props): React.JSX.Element {
  const tags = useApp((s) => s.user.tags)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const clean = text.trim()
  const options = useMemo(() => {
    const q = clean.toLowerCase()
    return tags
      .filter((t) => !exclude.includes(t.id) && t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const as = a.name.toLowerCase().startsWith(q) ? 0 : 1
        const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1
        return as - bs || a.name.localeCompare(b.name)
      })
      .slice(0, 30)
  }, [tags, clean, exclude])
  const exact = tags.some((t) => t.name.toLowerCase() === clean.toLowerCase())
  const canCreate = clean !== '' && !exact
  const count = options.length + (canCreate ? 1 : 0)

  const choose = (index: number): void => {
    const name = index < options.length ? options[index].name : clean
    if (!name) return
    onAdd(name)
    setText('')
    setActive(0)
  }

  return (
    <div className="taginput">
      <input
        ref={inputRef}
        className="field"
        style={{ width: '100%' }}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Add a tag…'}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, Math.max(0, count - 1)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            if (clean === '') return
            // Typing a name that already exists adds that tag, not the first partial match.
            const exactIndex = options.findIndex((t) => t.name.toLowerCase() === clean.toLowerCase())
            choose(exactIndex >= 0 ? exactIndex : active)
          } else if (e.key === 'Escape') {
            setText('')
            setOpen(false)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      {open && count > 0 && (
        <div className={'menu' + (menuUp ? ' up' : '')}>
          {options.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={'opt' + (i === active ? ' active' : '')}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(i)
              }}
            >
              {t.name}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              className={'opt' + (options.length === active ? ' active' : '')}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(options.length)
              }}
            >
              <span>
                Create <b>“{clean}”</b>
              </span>
              <span className="kbd">Enter</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
